import { describe, expect, it } from "vitest";

import {
  PrivateCommandCenterServer,
} from "../../src/command-center/command-center-server.js";
import {
  parseCommandCenterArguments,
} from "../../src/command-center/command-center-cli.js";
import { SQLITE_SCHEMA_VERSION } from "../../src/persistence/sqlite/sqlite-schema.js";
import type {
  ProductionDiagnosticKind,
  ProductionDiagnosticReport,
  ProductionDiagnostics,
} from "../../src/production/production-diagnostics.js";

const ACCESS_TOKEN = "a".repeat(64);

describe("Command Center production probes", () => {
  it("exposes public sanitized probes and bearer-only deep diagnostics", async () => {
    const diagnostics: ProductionDiagnostics = {
      diagnostic: () => Promise.resolve(report("DIAGNOSTIC")),
      readiness: () => Promise.resolve(report("READINESS")),
      startup: () => Promise.resolve(report("STARTUP")),
    };
    const server = new PrivateCommandCenterServer({
      accessToken: ACCESS_TOKEN,
      diagnostics,
      port: 0,
      queryService: {
        snapshot: () => Promise.resolve({}) as never,
      },
    });
    const started = await server.start();
    const origin = new URL(started.accessUrl).origin;
    try {
      const live = await fetch(`${origin}/health/live`);
      expect(live.status).toBe(200);
      await expect(live.json()).resolves.toMatchObject({
        kind: "LIVENESS",
        status: "READY",
      });

      const ready = await fetch(`${origin}/health/ready`);
      expect(ready.status).toBe(200);
      await expect(ready.json()).resolves.toMatchObject({
        kind: "READINESS",
        status: "READY",
      });

      const unauthorized = await fetch(`${origin}/api/admin/diagnostics`);
      expect(unauthorized.status).toBe(401);
      expect(await unauthorized.text()).not.toContain(ACCESS_TOKEN);

      const deep = await fetch(`${origin}/api/admin/diagnostics`, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      });
      expect(deep.status).toBe(200);
      const payload = await deep.text();
      expect(JSON.parse(payload)).toMatchObject({
        kind: "DIAGNOSTIC",
        status: "READY",
      });
      expect(payload).not.toContain(ACCESS_TOKEN);
    } finally {
      await started.close();
    }
  });

  it("keeps the bind loopback-only while accepting fixed port/origin flags", () => {
    expect(parseCommandCenterArguments([
      "--config",
      "/etc/onlyway/runtime.json",
      "--host",
      "127.0.0.1",
      "--port",
      "43101",
      "--external-origin",
      "https://command.onlyway.example",
    ])).toEqual({
      configPath: "/etc/onlyway/runtime.json",
      externalOrigin: "https://command.onlyway.example",
      host: "127.0.0.1",
      port: 43_101,
    });
    expect(parseCommandCenterArguments([
      "--config",
      "/etc/onlyway/runtime.json",
      "--external-origin",
      "http://localhost:43100",
      "--admin-state",
      "/var/lib/onlyway-admin/admin-security.json",
      "--admin-bootstrap",
      "/run/secrets/onlyway-bootstrap/founder-bootstrap.json",
      "--admin-pepper",
      "/run/secrets/onlyway/admin-source-key-pepper",
    ])).toMatchObject({
      adminSecurity: {
        bootstrapPath:
          "/run/secrets/onlyway-bootstrap/founder-bootstrap.json",
        sourceKeyPepperPath:
          "/run/secrets/onlyway/admin-source-key-pepper",
        statePath: "/var/lib/onlyway-admin/admin-security.json",
      },
    });
    expect(() => parseCommandCenterArguments([
      "--config",
      "/etc/onlyway/runtime.json",
      "--host",
      "0.0.0.0",
    ])).toThrow(/127\.0\.0\.1/u);
    expect(() => new PrivateCommandCenterServer({
      host: "0.0.0.0",
      queryService: {
        snapshot: () => Promise.resolve({}) as never,
      },
    })).toThrow(/loopback/u);
  });
});

function report(kind: ProductionDiagnosticKind): ProductionDiagnosticReport {
  return Object.freeze({
    checks: Object.freeze([]),
    contractVersion: "1",
    generatedAt: "2026-07-26T12:00:00.000Z",
    kind,
    status: "READY",
    summary: Object.freeze({
      maxQueueDepth: 1_000,
      minimumFreeBytes: 1,
      providerMode: "OFFLINE_REHEARSAL",
      schemaVersion: SQLITE_SCHEMA_VERSION,
    }),
    unauthorizedExternalEffectOccurred: false,
  });
}
