import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AdminSecurityError,
  FileAdminSecurityRepository,
  RedactingJsonLogger,
  SimpleAdminWebAuthn,
  assertCapability,
  createAdminSecurityProfile,
  createServicePrincipal,
  emptyAdminSecurityState,
} from "../../src/admin-security/index.js";
import { SupervisedProcessLock } from "../../src/operations-runtime/supervised-process-lock.js";

describe("Admin Security foundation", () => {
  it("keeps production-domain mode configuration-gated and derives strict cookie profiles", () => {
    const incomplete = createAdminSecurityProfile({
      mode: "PRODUCTION_DOMAIN",
    });
    expect(incomplete.readiness).toBe("CONFIGURATION_REQUIRED");
    if (incomplete.readiness !== "CONFIGURATION_REQUIRED") {
      throw new Error("Expected incomplete production profile");
    }
    expect(incomplete.missingConfiguration).toContain("HTTPS_ORIGIN");
    expect(incomplete.missingConfiguration).toContain(
      "PUBLIC_RELYING_PARTY_ID",
    );

    expect(createAdminSecurityProfile({
      mode: "PRODUCTION_DOMAIN",
      origin: "https://admin.example.com",
      relyingPartyId: "example.com",
    })).toMatchObject({
      cookieName: "__Host-onlyway_admin_session",
      cookieSecure: true,
      origin: "https://admin.example.com",
      readiness: "READY",
      relyingPartyId: "example.com",
    });

    expect(createAdminSecurityProfile({
      mode: "PRIVATE_TUNNEL",
      origin: "http://localhost:4173",
    })).toMatchObject({
      cookieName: "__Host-onlyway_admin_session",
      cookieSecure: true,
      readiness: "READY",
      relyingPartyId: "localhost",
    });
  });

  it("uses real SimpleWebAuthn option generation with required user verification", async () => {
    const profile = createAdminSecurityProfile({
      mode: "PRIVATE_TUNNEL",
      origin: "http://localhost:4173",
    });
    if (profile.readiness !== "READY") throw new Error("Expected ready profile");
    const webAuthn = new SimpleAdminWebAuthn();
    const registration = await webAuthn.generateRegistrationOptions({
      existingCredentials: [],
      profile,
      userDisplayName: "Founder",
      userId: new Uint8Array([1, 2, 3, 4]),
      userName: "founder",
    });
    const authentication = await webAuthn.generateAuthenticationOptions({
      credentials: [],
      profile,
    });

    expect(registration.challenge.length).toBeGreaterThan(20);
    expect(registration.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
    expect(authentication.userVerification).toBe("required");
  });

  it("applies default-deny role and bounded service-principal profiles", () => {
    const worker = createServicePrincipal({
      createdAt: "2026-07-26T10:00:00.000Z",
      displayName: "Production worker",
      principalId: "service:worker:production",
      profile: "WORKER",
    });

    expect(() => {
      assertCapability(worker, "RUNTIME_EXECUTE");
    }).not.toThrow();
    expect(() => {
      assertCapability(worker, "ADMIN_KILL_SWITCH_CONTROL");
    }).toThrow(AdminSecurityError);
  });

  it("persists state atomically in an owner-only file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const path = join(directory, "admin-security.json");
      const repository = new FileAdminSecurityRepository({ path });
      await expect(repository.compareAndSet(0, {
        ...emptyAdminSecurityState(),
        revision: 1,
      })).resolves.toBe(true);

      const metadata = await stat(path);
      expect(metadata.mode & 0o077).toBe(0);
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
        contractVersion: "1",
        revision: 1,
        stateVersion: 1,
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects an oversized valid state before publishing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const path = join(directory, "admin-security.json");
      const repository = new FileAdminSecurityRepository({ path });
      const credentials = Array.from({ length: 700 }, (_, index) => ({
        backedUp: false,
        counter: 0,
        createdAt: "2026-07-26T00:00:00.000Z",
        credentialId: `credential-${String(index)}`,
        deviceType: "singleDevice" as const,
        principalId: "founder",
        publicKey: "A".repeat(8_192),
        transports: [],
      }));

      await expect(repository.compareAndSet(0, {
        ...emptyAdminSecurityState(),
        credentials,
        revision: 1,
      })).rejects.toMatchObject({
        code: "REPOSITORY_INVALID",
        message: "Admin security state exceeds its size limit.",
      });
      await expect(readFile(path, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(`${path}.lock`, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("recovers an owner-identified lock left by a terminated process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const path = join(directory, "admin-security.json");
      const lockPath = `${path}.lock`;
      await writeFile(
        lockPath,
        `${JSON.stringify({
          contractVersion: "1",
          createdAt: "2026-07-26T00:00:00.000Z",
          instanceId: "terminated-admin",
          pid: 2_147_483_647,
          role: "admin-security",
          token: "lock-terminated-admin",
        })}\n`,
        { mode: 0o600 },
      );
      const repository = new FileAdminSecurityRepository({ path });
      await expect(repository.compareAndSet(0, {
        ...emptyAdminSecurityState(),
        revision: 1,
      })).resolves.toBe(true);
      await expect(repository.read()).resolves.toMatchObject({ revision: 1 });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("recovers an Admin Security lock after restart reuses the same PID", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const path = join(directory, "admin-security.json");
      const lockPath = `${path}.lock`;
      const original = await SupervisedProcessLock.acquire({
        instanceId: "original-admin",
        path: lockPath,
        role: "admin-security",
      });
      const record = JSON.parse(
        await readFile(lockPath, "utf8"),
      ) as Record<string, unknown>;
      await original.close();
      const identity = record.processIdentity;
      if (!isRecord(identity)) throw new Error("Expected a process identity");
      await writeFile(
        lockPath,
        `${JSON.stringify({
          ...record,
          instanceId: "stale-admin-same-pid",
          processIdentity: staleProcessIdentity(identity),
        })}\n`,
        { mode: 0o600 },
      );

      const repository = new FileAdminSecurityRepository({ path });
      await expect(repository.compareAndSet(0, {
        ...emptyAdminSecurityState(),
        revision: 1,
      })).resolves.toBe(true);
      await expect(repository.read()).resolves.toMatchObject({ revision: 1 });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("serializes concurrent Admin Security state mutations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const path = join(directory, "admin-security.json");
      const repository = new FileAdminSecurityRepository({ path });
      const outcomes = await Promise.all(
        Array.from({ length: 24 }, async () =>
          repository.compareAndSet(0, {
            ...emptyAdminSecurityState(),
            revision: 1,
          })),
      );

      expect(outcomes.filter(Boolean)).toHaveLength(1);
      await expect(repository.read()).resolves.toMatchObject({ revision: 1 });
      await expect(readFile(`${path}.lock`, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects malformed nested records instead of trusting top-level arrays", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-admin-security-"));
    try {
      const path = join(directory, "admin-security.json");
      await writeFile(
        path,
        `${JSON.stringify({
          ...emptyAdminSecurityState(),
          principals: [{
            capabilities: ["ADMIN_READ", "NOT_A_CAPABILITY"],
            createdAt: "not-a-timestamp",
            displayName: "Injected founder",
            kind: "HUMAN",
            principalId: "founder",
            roles: ["FOUNDER"],
            status: "ACTIVE",
          }],
          revision: 1,
        })}\n`,
        { mode: 0o600 },
      );
      const repository = new FileAdminSecurityRepository({ path });
      await expect(repository.read()).rejects.toMatchObject({
        code: "REPOSITORY_INVALID",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("recursively redacts structured logs and enforces a byte ceiling", () => {
    const lines: string[] = [];
    const logger = new RedactingJsonLogger({
      clock: { now: () => new Date("2026-07-26T10:00:00.000Z") },
      maxEntryBytes: 512,
      sink: (line) => {
        lines.push(line);
      },
    });
    logger.log({
      event: "admin_request",
      level: "warn",
      message: "Rejected access_token=do-not-log-this",
      metadata: {
        nested: {
          apiToken: "also-do-not-log-this",
          safe: "visible",
        },
      },
    });
    logger.log({
      event: "oversized",
      level: "info",
      message: "x".repeat(4_000),
      metadata: { safe: "y".repeat(4_000) },
    });

    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("do-not-log-this");
    expect(lines.join("\n")).not.toContain("also-do-not-log-this");
    expect(lines[0]).toContain("[REDACTED]");
    expect(lines[0]).toContain("visible");
    expect(Buffer.byteLength(lines[1] ?? "", "utf8")).toBeLessThanOrEqual(512);
    expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({
      metadata: { truncated: true },
    });
  });
});

function incrementDecimal(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]+$/u.test(value)) {
    throw new Error("Expected decimal process start time");
  }
  return (BigInt(value) + 1n).toString();
}

function staleProcessIdentity(
  identity: Record<string, unknown>,
): Record<string, unknown> {
  if (identity.kind === "linux-proc-v1") {
    return {
      ...identity,
      startTimeTicks: incrementDecimal(identity.startTimeTicks),
    };
  }
  if (identity.kind !== "local-process-v1" || typeof identity.nonce !== "string") {
    throw new Error("Expected a supported process identity");
  }
  return {
    ...identity,
    nonce: identity.nonce === "00000000-0000-4000-8000-000000000000"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000000",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
