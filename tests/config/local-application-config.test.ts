import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLocalRuntime,
  LocalApplicationConfigValidator,
  LocalConfigurationLoader,
  SecretReferenceValidator,
  type EffectivePermission,
  type EnvironmentSecretReference,
  type LocalApplicationConfig,
  type LocalRuntimeConfig,
  type SecretReference,
} from "../../src/index.js";
import {
  FixedClock,
  createRequest,
} from "../support/fixtures.js";

const FULL_PERMISSIONS: readonly EffectivePermission[] = Object.freeze([
  "knowledge:search",
  "memory:read:semantic",
]);

describe("Controlled local application configuration", () => {
  it("accepts valid application configuration and assembles existing CLI config", () => {
    const config = createApplicationConfig("/tmp/runtime.sqlite");
    const validation = new LocalApplicationConfigValidator().validate(config);

    expect(validation).toEqual({
      ok: true,
      value: config,
    });
    if (!validation.ok) {
      throw new Error("expected valid configuration");
    }

    expect(new LocalConfigurationLoader().toCliConfig(validation.value))
      .toEqual({
        contractVersion: "1",
        maxRequestBytes: 65_536,
        runtime: config.runtime,
      });
  });

  it("rejects unknown fields and unsupported versions", () => {
    const valid = createApplicationConfig("/tmp/runtime.sqlite");

    expect(
      new LocalApplicationConfigValidator().validate({
        ...valid,
        extra: true,
      }),
    ).toMatchObject({
      issues: [{ code: "unexpected", path: "extra" }],
      ok: false,
    });
    expect(
      new LocalApplicationConfigValidator().validate({
        ...valid,
        contractVersion: "2",
      }),
    ).toMatchObject({
      issues: [{ code: "unsupported_version", path: "contractVersion" }],
      ok: false,
    });
  });

  it("validates secret references without resolving raw secret values", () => {
    const environmentReference = createEnvironmentSecretReference();
    const localFileReference = createLocalFileSecretReference(
      "/tmp/provider-token.txt",
    );
    const validator = new SecretReferenceValidator();

    expect(validator.validate(environmentReference)).toEqual({
      ok: true,
      value: environmentReference,
    });
    expect(validator.validate(localFileReference)).toEqual({
      ok: true,
      value: localFileReference,
    });
    expect(
      validator.validate({
        ...environmentReference,
        value: "not-allowed-in-config",
      }),
    ).toMatchObject({
      issues: [{ code: "unexpected", path: "value" }],
      ok: false,
    });
  });

  it("redacts secret reference identifiers from public validation errors", () => {
    const secretId = "provider-token-reference";
    const config = {
      ...createApplicationConfig("/tmp/runtime.sqlite"),
      secretReferences: [
        createEnvironmentSecretReference({ secretId }),
        createEnvironmentSecretReference({ secretId }),
      ],
    };

    expect(() =>
      new LocalConfigurationLoader().load(JSON.stringify(config)),
    ).toThrow(
      expect.objectContaining({
        code: "local_configuration_invalid",
      }),
    );
    try {
      new LocalConfigurationLoader().load(JSON.stringify(config));
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(secretId);
      expect(JSON.stringify(error)).not.toContain("secretId");
    }
  });

  it("loads explicit JSON input and creates the existing Local Runtime", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-config-"));
    try {
      const databasePath = join(directory, "runtime.sqlite");
      const loader = new LocalConfigurationLoader();
      const loaded = loader.load(
        Buffer.from(
          JSON.stringify(createApplicationConfig(databasePath)),
          "utf8",
        ),
      );
      const runtime = await createLocalRuntime(loaded.runtime, {
        clock: new FixedClock(),
      });

      await expect(runtime.execute(createRequest())).resolves.toMatchObject({
        status: "completed",
      });
      await runtime.close();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed for empty, oversized, malformed, and invalid input", () => {
    const loader = new LocalConfigurationLoader();

    expect(() => loader.load(new Uint8Array())).toThrow(
      expect.objectContaining({ code: "local_configuration_empty" }),
    );
    expect(() => loader.load("{")).toThrow(
      expect.objectContaining({ code: "local_configuration_json_invalid" }),
    );
    expect(() => loader.load("x".repeat(262_145))).toThrow(
      expect.objectContaining({ code: "local_configuration_too_large" }),
    );
    expect(() =>
      loader.load(
        JSON.stringify({
          ...createApplicationConfig("/tmp/runtime.sqlite"),
          runtime: {
            contentAgentMode: "deterministic",
            contractVersion: "1",
          },
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "local_configuration_invalid" }),
    );
  });
});

function createApplicationConfig(
  databasePath: string,
): LocalApplicationConfig {
  return {
    cli: {
      maxRequestBytes: 65_536,
    },
    contractVersion: "1",
    runtime: createRuntimeConfig(databasePath),
    secretReferences: [
      createEnvironmentSecretReference(),
      createLocalFileSecretReference("/tmp/mv-ai-os-provider-token.txt"),
    ],
  };
}

function createRuntimeConfig(databasePath: string): LocalRuntimeConfig {
  return {
    actorId: "actor-local",
    contentAgentMode: "deterministic",
    contractVersion: "1",
    permissions: {
      actorGrants: FULL_PERMISSIONS,
      policyGrants: FULL_PERMISSIONS,
      taskGrants: FULL_PERMISSIONS,
    },
    sqlite: {
      path: databasePath,
      timeoutMs: 1_000,
    },
    workspaceId: "workspace-local",
  };
}

function createEnvironmentSecretReference(
  overrides: Partial<EnvironmentSecretReference> = {},
): EnvironmentSecretReference {
  return {
    contractVersion: "1",
    secretId: "provider-token-reference",
    source: "environment",
    variableName: "MV_AI_OS_PROVIDER_TOKEN",
    ...overrides,
  };
}

function createLocalFileSecretReference(path: string): SecretReference {
  return {
    contractVersion: "1",
    encoding: "utf8",
    path,
    secretId: "provider-token-file-reference",
    source: "local-file",
  };
}
