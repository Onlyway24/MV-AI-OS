import { describe, expect, it } from "vitest";

import {
  AdminSecurityError,
  type AdminCapability,
  type AdminSessionRecord,
  type HumanAdminPrincipal,
} from "../../src/admin-security/admin-security-contracts.js";
import type {
  CommandCenterAdminSecurityBoundary,
} from "../../src/command-center/command-center-server.js";
import {
  PrivateCommandCenterServer,
} from "../../src/command-center/command-center-server.js";
import type {
  OperationsRuntimeControl,
} from "../../src/operations-runtime/operations-runtime.js";

const SESSION_TOKEN = "session_token_owner_only_1234567890";
const STEP_UP_TOKEN = "stepup_receipt_owner_only_1234567890";

describe("Command Center Admin Security adapter", () => {
  it("uses passkey sessions, RBAC, CSRF and command-bound step-up without exposing session secrets", async () => {
    const harness = adminSecurityHarness();
    let confirmed = false;
    let founderBootstrapRemoved = false;
    const runtimeControl = runtimeControlHarness();
    const server = new PrivateCommandCenterServer({
      accessToken: "a".repeat(64),
      adminSecurity: {
        cookieName: "onlyway_admin_session",
        onFounderRegistered: () => {
          founderBootstrapRemoved = true;
          return Promise.resolve();
        },
        service: harness.service,
      },
      diagnostics: {
        diagnostic: () => Promise.resolve({
          checks: [],
          contractVersion: "1",
          generatedAt: "2026-07-26T12:00:00.000Z",
          kind: "DIAGNOSTIC",
          status: "READY",
          summary: {
            maxQueueDepth: 1_000,
            minimumFreeBytes: 64 * 1024 * 1024,
            providerMode: "OFFLINE_REHEARSAL",
            schemaVersion: 32,
          },
          unauthorizedExternalEffectOccurred: false,
        } as never),
        readiness: () => Promise.resolve({} as never),
        startup: () => Promise.resolve({} as never),
      },
      operationsRuntimeControlService: runtimeControl.service,
      oracleCreativePromptService: {
        confirmForOperator: () => {
          confirmed = true;
          return Promise.resolve({ status: "CONFIRMED" } as never);
        },
        proposeForOperator: () => Promise.resolve({} as never),
      },
      port: 0,
      queryService: {
        snapshot: () => Promise.resolve({}) as never,
      },
    });
    const started = await server.start();
    const origin = `http://${started.address.host}:${String(started.address.port)}`;
    try {
      expect(started.accessUrl).toBe(`${origin}/admin-auth`);
      expect(started.accessUrl).not.toContain("access_token");

      const unauthenticatedRoot = await fetch(`${origin}/`, {
        redirect: "manual",
      });
      expect(unauthenticatedRoot.status).toBe(303);
      expect(unauthenticatedRoot.headers.get("location")).toBe("/admin-auth");
      expect(
        await fetch(`${origin}/api/events`, {
          headers: { Accept: "text/event-stream" },
        }),
      ).toMatchObject({ status: 401 });

      const loginPage = await fetch(started.accessUrl);
      expect(loginPage.status).toBe(200);
      expect(await loginPage.text()).toContain("Accedi con passkey");

      const missingOrigin = await jsonPost(
        `${origin}/api/admin/authentication/begin`,
        {},
      );
      expect(missingOrigin.status).toBe(403);

      const bootstrapToken =
        "bootstrap_token_owner_only_12345678901234567890";
      const bootstrap = await jsonPost(
        `${origin}/api/admin/bootstrap/begin`,
        { bootstrapToken },
        { Origin: origin },
      );
      expect(bootstrap.status).toBe(200);
      expect(await bootstrap.text()).not.toContain(bootstrapToken);
      expect(harness.bootstrapToken).toBe(bootstrapToken);
      const registered = await jsonPost(
        `${origin}/api/admin/bootstrap/finish`,
        { flowId: "registration-flow", response: { id: "credential-id" } },
        { Origin: origin },
      );
      expect(registered.status).toBe(200);
      expect(founderBootstrapRemoved).toBe(true);

      const authentication = await jsonPost(
        `${origin}/api/admin/authentication/begin`,
        {},
        { Origin: origin },
      );
      expect(authentication.status).toBe(200);
      const authenticated = await jsonPost(
        `${origin}/api/admin/authentication/finish`,
        { flowId: "authentication-flow", response: { id: "credential-id" } },
        { Origin: origin },
      );
      expect(authenticated.status).toBe(200);
      const authenticatedBody = await authenticated.text();
      expect(authenticatedBody).not.toContain(SESSION_TOKEN);
      expect(authenticatedBody).not.toContain("sessionToken");
      const cookie = authenticated.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain(SESSION_TOKEN);

      const bearerOnlyDiagnostic = await fetch(
        `${origin}/api/admin/diagnostics`,
        { headers: { Authorization: `Bearer ${"a".repeat(64)}` } },
      );
      expect(bearerOnlyDiagnostic.status).toBe(401);
      const diagnostic = await fetch(`${origin}/api/admin/diagnostics`, {
        headers: { Cookie: cookie },
      });
      expect(diagnostic.status).toBe(200);

      const session = await fetch(`${origin}/api/session`, {
        headers: { Cookie: cookie },
      });
      const sessionBody = await session.json() as {
        readonly authentication: string;
        readonly csrfToken: string;
      };
      expect(sessionBody.authentication).toBe("PASSKEY");
      expect(JSON.stringify(sessionBody)).not.toContain(SESSION_TOKEN);

      const confirmationBody = {
        confirmationToken: "b".repeat(64),
        contractVersion: "1",
        prompt: "Prompt approvato",
        promptFingerprint: "c".repeat(64),
        proposalFingerprint: "d".repeat(64),
        proposalId: "proposal-001",
      };
      const noStepUp = await jsonPost(
        `${origin}/api/prompt-missions/confirm`,
        confirmationBody,
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      expect(noStepUp.status).toBe(403);
      expect(confirmed).toBe(false);

      const stepUp = await jsonPost(
        `${origin}/api/admin/step-up/begin`,
        {
          path: "/api/prompt-missions/confirm",
          payload: confirmationBody,
        },
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      expect(stepUp.status).toBe(200);
      expect(harness.lastCapability).toBe("ADMIN_COMMAND_EXECUTE");
      const stepUpFinished = await jsonPost(
        `${origin}/api/admin/step-up/finish`,
        { flowId: "step-up-flow", response: { id: "credential-id" } },
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      expect(stepUpFinished.status).toBe(200);
      const confirmedResponse = await jsonPost(
        `${origin}/api/prompt-missions/confirm`,
        confirmationBody,
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
          "X-Onlyway-Step-Up": STEP_UP_TOKEN,
        },
      );
      expect(confirmedResponse.status).toBe(200);
      expect(confirmed).toBe(true);
      expect(harness.consumedFingerprint).toBe(harness.lastFingerprint);

      const killSwitch = await fetch(
        `${origin}/api/admin/runtime-kill-switch`,
        { headers: { Cookie: cookie } },
      );
      await expect(killSwitch.json()).resolves.toMatchObject({
        killSwitch: "RELEASED",
        version: 0,
      });
      const killInput = {
        desiredState: true,
        expectedVersion: 0,
        reasonCode: "FOUNDER_EMERGENCY_STOP",
      };
      const killStepUp = await jsonPost(
        `${origin}/api/admin/runtime-kill-switch/step-up/begin`,
        killInput,
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      expect(killStepUp.status).toBe(200);
      expect(harness.lastCapability).toBe("ADMIN_KILL_SWITCH_CONTROL");
      expect(harness.lastCommand).toBe(
        "SET_KILL_SWITCH:operations-runtime:ON",
      );
      await jsonPost(
        `${origin}/api/admin/step-up/finish`,
        { flowId: "kill-step-up-flow", response: { id: "credential-id" } },
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      const killed = await jsonPost(
        `${origin}/api/admin/runtime-kill-switch`,
        killInput,
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
          "X-Onlyway-Step-Up": STEP_UP_TOKEN,
        },
      );
      expect(killed.status).toBe(200);
      expect(harness.killSwitchFingerprint).toBe(harness.lastFingerprint);
      expect(runtimeControl.control).toMatchObject({
        killSwitch: "ACTIVE",
        updatedBy: "founder",
        version: 1,
      });

      const globalLogoutInput = { principalId: "operator" };
      const globalLogoutStepUp = await jsonPost(
        `${origin}/api/admin/sessions/revoke-all/step-up/begin`,
        globalLogoutInput,
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      expect(globalLogoutStepUp.status).toBe(200);
      expect(harness.lastCapability).toBe("ADMIN_SESSION_MANAGE");
      expect(harness.lastCommand).toBe(
        "REVOKE_ALL_ADMIN_SESSIONS:operator",
      );
      await jsonPost(
        `${origin}/api/admin/step-up/finish`,
        { flowId: "global-logout-step-up", response: { id: "credential-id" } },
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      const globalLogout = await jsonPost(
        `${origin}/api/admin/sessions/revoke-all`,
        globalLogoutInput,
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
          "X-Onlyway-Step-Up": STEP_UP_TOKEN,
        },
      );
      expect(globalLogout.status).toBe(200);
      await expect(globalLogout.json()).resolves.toMatchObject({
        revokedSessions: 1,
        status: "ALL_SESSIONS_REVOKED",
      });

      const logout = await jsonPost(
        `${origin}/api/admin/logout`,
        {},
        {
          Cookie: cookie,
          Origin: origin,
          "X-Onlyway-Csrf": sessionBody.csrfToken,
        },
      );
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(
        await fetch(`${origin}/api/session`, { headers: { Cookie: cookie } }),
      ).toMatchObject({ status: 401 });
    } finally {
      await started.close();
    }
  });
});

function adminSecurityHarness(): {
  bootstrapToken: string | undefined;
  consumedFingerprint: string | undefined;
  killSwitchFingerprint: string | undefined;
  lastCapability: AdminCapability | undefined;
  lastCommand: string | undefined;
  lastFingerprint: string | undefined;
  readonly service: CommandCenterAdminSecurityBoundary;
} {
  let active = true;
  let bootstrapToken: string | undefined;
  let consumedFingerprint: string | undefined;
  let killSwitchFingerprint: string | undefined;
  let lastCapability: AdminCapability | undefined;
  let lastCommand: string | undefined;
  let lastFingerprint: string | undefined;
  const principal: HumanAdminPrincipal = Object.freeze({
    capabilities: Object.freeze([]),
    createdAt: "2026-07-26T10:00:00.000Z",
    displayName: "Founder",
    kind: "HUMAN",
    principalId: "founder",
    roles: Object.freeze(["FOUNDER"] as const),
    status: "ACTIVE",
  });
  const session: AdminSessionRecord = Object.freeze({
    absoluteExpiresAt: "2026-07-27T10:00:00.000Z",
    createdAt: "2026-07-26T10:00:00.000Z",
    idleExpiresAt: "2026-07-27T10:00:00.000Z",
    lastSeenAt: "2026-07-26T10:00:00.000Z",
    principalId: "founder",
    revokedAt: null,
    sessionId: "session_founder",
    tokenHash: "e".repeat(64),
  });
  const service: CommandCenterAdminSecurityBoundary = {
    authenticateSession: (token, capability) => {
      if (!active || token !== SESSION_TOKEN) {
        return Promise.reject(
          new AdminSecurityError("SESSION_INVALID", "invalid session"),
        );
      }
      lastCapability = capability;
      return Promise.resolve({ principal, session });
    },
    authorizeKillSwitchChange: (input) => {
      killSwitchFingerprint = input.commandFingerprint;
      return Promise.resolve({
        authorizationId: "authorization_founder",
        authorizedAt: "2026-07-26T12:00:00.000Z",
        desiredState: input.desiredState,
        principalId: "founder",
        switchId: input.switchId,
      });
    },
    beginAuthentication: () => Promise.resolve({
      expiresAt: "2026-07-26T12:05:00.000Z",
      flowId: "authentication-flow",
      options: { challenge: "challenge" },
    } as never),
    beginFounderRegistration: (input) => {
      bootstrapToken = input.bootstrapToken;
      return Promise.resolve({
        expiresAt: "2026-07-26T12:05:00.000Z",
        flowId: "registration-flow",
        options: { challenge: "challenge" },
      } as never);
    },
    beginStepUp: (input) => {
      lastCapability = input.capability;
      lastCommand = input.command;
      lastFingerprint = input.commandFingerprint;
      return Promise.resolve({
        expiresAt: "2026-07-26T12:05:00.000Z",
        flowId: "step-up-flow",
        options: { challenge: "challenge" },
      } as never);
    },
    clearSessionCookie: () =>
      "onlyway_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    consumeStepUpReceipt: (input) => {
      consumedFingerprint = input.commandFingerprint;
      if (
        input.receiptToken !== STEP_UP_TOKEN ||
        input.commandFingerprint !== lastFingerprint
      ) {
        return Promise.reject(new Error("invalid step-up"));
      }
      return Promise.resolve();
    },
    finishAuthentication: () => Promise.resolve({
      absoluteExpiresAt: session.absoluteExpiresAt,
      cookie:
        `onlyway_admin_session=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`,
      idleExpiresAt: session.idleExpiresAt,
      principal,
      sessionId: session.sessionId,
      sessionToken: SESSION_TOKEN,
    }),
    finishFounderRegistration: () => Promise.resolve({
      credentialId: "credential-id",
      principalId: "founder",
      registeredAt: "2026-07-26T12:00:00.000Z",
    }),
    finishStepUp: () => Promise.resolve({
      capability: lastCapability ?? "ADMIN_COMMAND_EXECUTE",
      command: lastCommand ?? "CONFIRM_PROMPT_MISSION",
      commandFingerprint: lastFingerprint ?? "f".repeat(64),
      expiresAt: "2026-07-26T12:02:00.000Z",
      receiptToken: STEP_UP_TOKEN,
    }),
    listSecurityEvents: () => Promise.resolve(Object.freeze([])),
    logout: () => {
      active = false;
      return Promise.resolve();
    },
    revokeAllSessions: () => Promise.resolve(1),
  };
  return {
    get bootstrapToken() {
      return bootstrapToken;
    },
    get consumedFingerprint() {
      return consumedFingerprint;
    },
    get killSwitchFingerprint() {
      return killSwitchFingerprint;
    },
    get lastCapability() {
      return lastCapability;
    },
    get lastCommand() {
      return lastCommand;
    },
    get lastFingerprint() {
      return lastFingerprint;
    },
    service,
  };
}

function runtimeControlHarness(): {
  readonly control: OperationsRuntimeControl;
  readonly service: {
    get(): Promise<OperationsRuntimeControl>;
    update(input: Readonly<{
      readonly expectedVersion: number;
      readonly killSwitch: "ACTIVE" | "RELEASED";
      readonly maintenanceMode: "DISABLED" | "ENABLED";
      readonly reasonCode: string;
      readonly updatedBy: string;
    }>): Promise<OperationsRuntimeControl>;
  };
} {
  let control: OperationsRuntimeControl = Object.freeze({
    contractVersion: "1",
    killSwitch: "RELEASED",
    maintenanceMode: "DISABLED",
    reasonCode: "INITIAL_STATE",
    updatedAt: "2026-07-26T10:00:00.000Z",
    updatedBy: "system",
    version: 0,
    workspaceId: "workspace-local",
  });
  const result = {
    get control() {
      return control;
    },
    service: {
      get: () => Promise.resolve(control),
      update: (input: Readonly<{
        readonly expectedVersion: number;
        readonly killSwitch: "ACTIVE" | "RELEASED";
        readonly maintenanceMode: "DISABLED" | "ENABLED";
        readonly reasonCode: string;
        readonly updatedBy: string;
      }>) => {
        if (input.expectedVersion !== control.version) {
          return Promise.reject(new Error("stale runtime control"));
        }
        control = Object.freeze({
          ...control,
          killSwitch: input.killSwitch,
          maintenanceMode: input.maintenanceMode,
          reasonCode: input.reasonCode,
          updatedAt: "2026-07-26T12:00:00.000Z",
          updatedBy: input.updatedBy,
          version: control.version + 1,
        });
        return Promise.resolve(control);
      },
    },
  };
  return result;
}

function jsonPost(
  url: string,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}
