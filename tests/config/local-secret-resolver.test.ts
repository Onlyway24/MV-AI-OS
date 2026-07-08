import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LocalSecretResolver,
  MAX_SECRET_VALUE_BYTES,
  SecretResolutionResultValidator,
  SecretValueValidator,
  type EnvironmentSecretReference,
  type LocalFileSecretReference,
} from "../../src/index.js";

describe("Controlled local secret resolution", () => {
  it("resolves environment references only from explicitly supplied values", async () => {
    const reference = createEnvironmentSecretReference();
    const resolver = new LocalSecretResolver({
      environment: {
        MV_AI_OS_PROVIDER_TOKEN: "provider-token-value",
      },
    });

    await expect(resolver.resolve(reference)).resolves.toEqual({
      contractVersion: "1",
      secretId: "provider-token-reference",
      source: "environment",
      value: {
        contractVersion: "1",
        secretId: "provider-token-reference",
        value: "provider-token-value",
      },
    });

    await expect(
      new LocalSecretResolver().resolve(reference),
    ).rejects.toMatchObject({
      code: "secret_environment_missing",
      stage: "secret_resolution",
    });
  });

  it("resolves local-file references from explicit absolute local files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-secrets-"));
    try {
      const secretPath = join(directory, "provider-token.txt");
      await writeFile(secretPath, "file-secret-value", "utf8");

      await expect(
        new LocalSecretResolver().resolve(
          createLocalFileSecretReference(secretPath),
        ),
      ).resolves.toEqual({
        contractVersion: "1",
        secretId: "provider-token-file-reference",
        source: "local-file",
        value: {
          contractVersion: "1",
          secretId: "provider-token-file-reference",
          value: "file-secret-value",
        },
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed for missing environment variables and missing files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-secrets-"));
    try {
      await expect(
        new LocalSecretResolver({ environment: {} }).resolve(
          createEnvironmentSecretReference(),
        ),
      ).rejects.toMatchObject({
        code: "secret_environment_missing",
      });

      await expect(
        new LocalSecretResolver().resolve(
          createLocalFileSecretReference(join(directory, "missing.txt")),
        ),
      ).rejects.toMatchObject({
        code: "secret_file_missing",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects invalid secret references before resolution", async () => {
    const resolver = new LocalSecretResolver({
      environment: {
        MV_AI_OS_PROVIDER_TOKEN: "provider-token-value",
      },
    });

    await expect(
      resolver.resolve({
        ...createEnvironmentSecretReference(),
        variableName: "not-a-valid-env-name",
      }),
    ).rejects.toMatchObject({
      code: "secret_reference_invalid",
    });
  });

  it("validates secret resolution output contracts", () => {
    const validValue = {
      contractVersion: "1",
      secretId: "provider-token-reference",
      value: "provider-token-value",
    };
    const validResult = {
      contractVersion: "1",
      secretId: "provider-token-reference",
      source: "environment",
      value: validValue,
    };

    expect(new SecretValueValidator().validate(validValue)).toEqual({
      ok: true,
      value: validValue,
    });
    expect(new SecretResolutionResultValidator().validate(validResult))
      .toEqual({
        ok: true,
        value: validResult,
      });
    expect(
      new SecretResolutionResultValidator().validate({
        ...validResult,
        value: {
          ...validValue,
          secretId: "other-reference",
        },
      }),
    ).toMatchObject({
      issues: [{ code: "invalid_value", path: "value.secretId" }],
      ok: false,
    });
  });

  it("redacts secret values and locations from public errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-secrets-"));
    try {
      const secretPath = join(directory, "super-secret-location.txt");
      const secretValue = "do-not-leak-this-secret";
      await writeFile(secretPath, secretValue, "utf8");

      await expect(
        new LocalSecretResolver().resolve({
          ...createLocalFileSecretReference(secretPath),
          path: join(directory, "missing-super-secret-location.txt"),
        }),
      ).rejects.not.toSatisfy((error: unknown) =>
        JSON.stringify(error).includes("missing-super-secret-location"),
      );

      await expect(
        new LocalSecretResolver({
          environment: {
            MV_AI_OS_PROVIDER_TOKEN: `${"x".repeat(MAX_SECRET_VALUE_BYTES)}x`,
          },
        }).resolve(createEnvironmentSecretReference()),
      ).rejects.not.toSatisfy((error: unknown) =>
        JSON.stringify(error).includes("x".repeat(128)),
      );

      await expect(
        new LocalSecretResolver().resolve(
          createLocalFileSecretReference(secretPath),
        ),
      ).resolves.toMatchObject({
        value: { value: secretValue },
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function createEnvironmentSecretReference(): EnvironmentSecretReference {
  return {
    contractVersion: "1",
    secretId: "provider-token-reference",
    source: "environment",
    variableName: "MV_AI_OS_PROVIDER_TOKEN",
  };
}

function createLocalFileSecretReference(
  path: string,
): LocalFileSecretReference {
  return {
    contractVersion: "1",
    encoding: "utf8",
    path,
    secretId: "provider-token-file-reference",
    source: "local-file",
  };
}
