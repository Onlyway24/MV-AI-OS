import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AdminSecurityService,
  FileAdminSecurityRepository,
  createAdminSecurityProfile,
  killSwitchCommand,
  type AdminAuthenticationVerification,
  type AdminRegistrationVerification,
  type AdminSecurityClock,
  type AdminSecurityRequestContext,
  type AdminWebAuthn,
  type AdminWebAuthnCredential,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type ReadyAdminSecurityProfile,
  type RegistrationResponseJSON,
} from "../../src/admin-security/index.js";

const START = "2026-07-26T10:00:00.000Z";
const ORIGIN = "http://localhost:4173";
const CONTEXT: AdminSecurityRequestContext = Object.freeze({
  origin: ORIGIN,
  sourceKey: "loopback-browser",
});
const FINGERPRINT = "a".repeat(64);

describe("Admin Security service", () => {
  it("performs one-time Founder bootstrap and stores only hashed opaque secrets", async () => {
    await withHarness(async ({ path, service }) => {
      const bootstrap = await service.createFounderBootstrap({
        ...CONTEXT,
        connectionAddress: "127.0.0.1",
      });
      const registration = await service.beginFounderRegistration({
        bootstrapToken: bootstrap.bootstrapToken,
        context: CONTEXT,
      });
      await expect(service.finishFounderRegistration({
        context: CONTEXT,
        flowId: registration.flowId,
        response: registrationResponse(),
      })).resolves.toMatchObject({
        credentialId: "founder-passkey",
        principalId: "founder",
      });
      await expect(service.createFounderBootstrap({
        ...CONTEXT,
        connectionAddress: "::1",
      })).rejects.toMatchObject({
        code: "BOOTSTRAP_ALREADY_COMPLETED",
      });

      const authentication = await authenticate(service);
      expect(authentication.cookie).toContain("HttpOnly");
      expect(authentication.cookie).toContain("SameSite=Strict");
      expect(authentication.cookie).toContain("Secure");
      expect(authentication.cookie).toContain("__Host-onlyway_admin_session=");

      const persisted = await readFile(path, "utf8");
      expect(persisted).not.toContain(bootstrap.bootstrapToken);
      expect(persisted).not.toContain(authentication.sessionToken);
      expect(persisted).toContain("founder-passkey");
    });
  });

  it("expires sessions server-side and supports global revocation", async () => {
    await withHarness(async ({ clock, service }) => {
      await enrollFounder(service);
      const first = await authenticate(service);
      const second = await authenticate(service);
      await expect(
        service.authenticateSession(first.sessionToken, "ADMIN_READ"),
      ).resolves.toMatchObject({
        principal: { principalId: "founder" },
      });

      await expect(service.revokeAllSessions({
        adminSessionToken: first.sessionToken,
      })).resolves.toBe(2);
      await expect(
        service.authenticateSession(second.sessionToken),
      ).rejects.toMatchObject({ code: "SESSION_INVALID" });

      const third = await authenticate(service);
      clock.advance(1_001);
      await expect(
        service.authenticateSession(third.sessionToken),
      ).rejects.toMatchObject({ code: "SESSION_INVALID" });
    }, {
      sessionAbsoluteTtlMs: 5_000,
      sessionIdleTtlMs: 1_000,
      sessionTouchIntervalMs: 100,
    });
  });

  it("binds WebAuthn step-up to capability, command, fingerprint and one use", async () => {
    await withHarness(async ({ path, service }) => {
      await enrollFounder(service);
      const authentication = await authenticate(service);
      const command = killSwitchCommand("publication", true);
      const start = await service.beginStepUp({
        capability: "ADMIN_KILL_SWITCH_CONTROL",
        command,
        commandFingerprint: FINGERPRINT,
        context: CONTEXT,
        sessionToken: authentication.sessionToken,
      });
      const receipt = await service.finishStepUp({
        context: CONTEXT,
        flowId: start.flowId,
        response: authenticationResponse(),
        sessionToken: authentication.sessionToken,
      });
      const persistedBeforeUse = await readFile(path, "utf8");
      expect(persistedBeforeUse).not.toContain(receipt.receiptToken);

      await expect(service.authorizeKillSwitchChange({
        commandFingerprint: FINGERPRINT,
        desiredState: true,
        receiptToken: receipt.receiptToken,
        sessionToken: authentication.sessionToken,
        switchId: "publication",
      })).resolves.toMatchObject({
        desiredState: true,
        principalId: "founder",
        switchId: "publication",
      });
      await expect(service.authorizeKillSwitchChange({
        commandFingerprint: FINGERPRINT,
        desiredState: true,
        receiptToken: receipt.receiptToken,
        sessionToken: authentication.sessionToken,
        switchId: "publication",
      })).rejects.toMatchObject({ code: "STEP_UP_INVALID" });
    });
  });

  it("rejects challenge replay and locks a brute-force source with bounded persistent state", async () => {
    await withHarness(async ({ service }) => {
      await enrollFounder(service);
      const first = await service.beginAuthentication(CONTEXT);
      await expect(service.finishAuthentication({
        context: CONTEXT,
        flowId: first.flowId,
        response: invalidAuthenticationResponse(),
      })).rejects.toMatchObject({ code: "CREDENTIAL_INVALID" });
      await expect(service.finishAuthentication({
        context: CONTEXT,
        flowId: first.flowId,
        response: authenticationResponse(),
      })).rejects.toMatchObject({ code: "CREDENTIAL_INVALID" });

      await expect(
        service.beginAuthentication(CONTEXT),
      ).rejects.toMatchObject({ code: "RATE_LIMITED" });
      const events = await service
        .listSecurityEvents({
          sessionToken: (await authenticateFromNewSource(service)).sessionToken,
        });
      expect(events.some((event) => event.eventType === "RATE_LIMITED")).toBe(true);
      expect(JSON.stringify(events)).not.toContain("loopback-browser");
    }, {
      rateLimit: {
        lockoutMs: 60_000,
        maxEntries: 8,
        maxFailures: 2,
        maxRequests: 50,
        windowMs: 60_000,
      },
    });
  });

  it("fails closed while the production profile is configuration-required", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const service = new AdminSecurityService({
        profile: createAdminSecurityProfile({
          mode: "PRODUCTION_DOMAIN",
        }),
        repository: new FileAdminSecurityRepository({
          path: join(directory, "state.json"),
        }),
        sourceKeyPepper: "p".repeat(32),
        webAuthn: new FakeAdminWebAuthn(),
      });
      await expect(service.createFounderBootstrap({
        connectionAddress: "127.0.0.1",
        origin: "https://admin.example.com",
        sourceKey: "loopback-browser",
      })).rejects.toMatchObject({
        code: "CONFIGURATION_REQUIRED",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

interface Harness {
  readonly clock: MutableClock;
  readonly path: string;
  readonly service: AdminSecurityService;
}

interface HarnessOverrides {
  readonly rateLimit?: {
    readonly lockoutMs: number;
    readonly maxEntries: number;
    readonly maxFailures: number;
    readonly maxRequests: number;
    readonly windowMs: number;
  };
  readonly sessionAbsoluteTtlMs?: number;
  readonly sessionIdleTtlMs?: number;
  readonly sessionTouchIntervalMs?: number;
}

const withHarness = async (
  test: (harness: Harness) => Promise<void>,
  overrides: HarnessOverrides = {},
): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
  try {
    const path = join(directory, "state.json");
    const clock = new MutableClock(START);
    const service = new AdminSecurityService({
      clock,
      profile: createAdminSecurityProfile({
        mode: "PRIVATE_TUNNEL",
        origin: ORIGIN,
      }),
      ...(overrides.rateLimit === undefined
        ? {}
        : { rateLimit: overrides.rateLimit }),
      repository: new FileAdminSecurityRepository({ path }),
      ...(overrides.sessionAbsoluteTtlMs === undefined
        ? {}
        : { sessionAbsoluteTtlMs: overrides.sessionAbsoluteTtlMs }),
      ...(overrides.sessionIdleTtlMs === undefined
        ? {}
        : { sessionIdleTtlMs: overrides.sessionIdleTtlMs }),
      ...(overrides.sessionTouchIntervalMs === undefined
        ? {}
        : { sessionTouchIntervalMs: overrides.sessionTouchIntervalMs }),
      sourceKeyPepper: "p".repeat(32),
      webAuthn: new FakeAdminWebAuthn(),
    });
    await test({ clock, path, service });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

const enrollFounder = async (
  service: AdminSecurityService,
): Promise<void> => {
  const bootstrap = await service.createFounderBootstrap({
    ...CONTEXT,
    connectionAddress: "127.0.0.1",
  });
  const start = await service.beginFounderRegistration({
    bootstrapToken: bootstrap.bootstrapToken,
    context: CONTEXT,
  });
  await service.finishFounderRegistration({
    context: CONTEXT,
    flowId: start.flowId,
    response: registrationResponse(),
  });
};

const authenticate = async (service: AdminSecurityService) => {
  const start = await service.beginAuthentication(CONTEXT);
  return service.finishAuthentication({
    context: CONTEXT,
    flowId: start.flowId,
    response: authenticationResponse(),
  });
};

const authenticateFromNewSource = async (
  service: AdminSecurityService,
) => {
  const context = Object.freeze({
    origin: ORIGIN,
    sourceKey: "recovery-browser",
  });
  const start = await service.beginAuthentication(context);
  return service.finishAuthentication({
    context,
    flowId: start.flowId,
    response: authenticationResponse(),
  });
};

class MutableClock implements AdminSecurityClock {
  #milliseconds: number;

  public constructor(iso: string) {
    this.#milliseconds = Date.parse(iso);
  }

  public advance(milliseconds: number): void {
    this.#milliseconds += milliseconds;
  }

  public now(): Date {
    return new Date(this.#milliseconds);
  }
}

class FakeAdminWebAuthn implements AdminWebAuthn {
  #challenge = 0;

  public generateAuthenticationOptions():
  Promise<PublicKeyCredentialRequestOptionsJSON> {
    this.#challenge += 1;
    return Promise.resolve({
      challenge: `authentication-${String(this.#challenge)}`,
    });
  }

  public generateRegistrationOptions():
  Promise<PublicKeyCredentialCreationOptionsJSON> {
    this.#challenge += 1;
    return Promise.resolve({
      challenge: `registration-${String(this.#challenge)}`,
    } as PublicKeyCredentialCreationOptionsJSON);
  }

  public verifyAuthentication(input: {
    readonly challenge: string;
    readonly credential: AdminWebAuthnCredential;
    readonly profile: ReadyAdminSecurityProfile;
    readonly response: AuthenticationResponseJSON;
  }): Promise<AdminAuthenticationVerification | null> {
    if (input.response.response.signature === "invalid") {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      newCounter: input.credential.counter + 1,
    });
  }

  public verifyRegistration():
  Promise<AdminRegistrationVerification | null> {
    return Promise.resolve({
      backedUp: true,
      counter: 0,
      credentialId: "founder-passkey",
      deviceType: "multiDevice",
      publicKey: Buffer.from("test-public-key").toString("base64url"),
      transports: ["internal"],
    });
  }
}

const registrationResponse = (): RegistrationResponseJSON => ({
  clientExtensionResults: {},
  id: "founder-passkey",
  rawId: "founder-passkey",
  response: {
    attestationObject: "test-attestation",
    clientDataJSON: "test-client-data",
    transports: ["internal"],
  },
  type: "public-key",
});

const authenticationResponse = (): AuthenticationResponseJSON => ({
  clientExtensionResults: {},
  id: "founder-passkey",
  rawId: "founder-passkey",
  response: {
    authenticatorData: "test-authenticator-data",
    clientDataJSON: "test-client-data",
    signature: "valid",
  },
  type: "public-key",
});

const invalidAuthenticationResponse = (): AuthenticationResponseJSON => ({
  ...authenticationResponse(),
  response: {
    ...authenticationResponse().response,
    signature: "invalid",
  },
});
