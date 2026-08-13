import { constants as fileConstants } from "node:fs";
import { open } from "node:fs/promises";

import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";
import type { ValidationIssue } from "../validation/validation.js";
import type { SecretReference } from "./secret-reference.js";
import { SecretReferenceValidator } from "./secret-reference-validator.js";
import type { SecretResolver } from "./secret-resolver.js";
import {
  redactSecretValidationIssues,
  SecretResolutionResultValidator,
} from "./secret-resolution-validator.js";
import {
  MAX_SECRET_VALUE_BYTES,
  SECRET_VALUE_CONTRACT_VERSION,
  type SecretResolutionResult,
} from "./secret-value.js";

export type LocalSecretResolverReadFile = (
  path: string,
) => Promise<Uint8Array>;

export interface LocalSecretResolverDependencies {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly readFile?: LocalSecretResolverReadFile;
}

type SecretResolutionErrorCode =
  | "secret_reference_invalid"
  | "secret_environment_missing"
  | "secret_file_missing"
  | "secret_file_unavailable"
  | "secret_value_invalid";

class SecretFileTooLargeError extends Error {}

export class SecretResolutionError extends CoreError {
  public constructor(
    code: SecretResolutionErrorCode,
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: code === "secret_value_invalid" ? "validation" : "not_found",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "secret_resolution",
    });
  }
}

export class LocalSecretResolver implements SecretResolver {
  readonly #environment: Readonly<Record<string, string | undefined>>;
  readonly #readFile: LocalSecretResolverReadFile;
  readonly #referenceValidator = new SecretReferenceValidator();
  readonly #resultValidator = new SecretResolutionResultValidator();

  public constructor(dependencies: LocalSecretResolverDependencies = {}) {
    this.#environment = dependencies.environment ?? {};
    this.#readFile =
      dependencies.readFile ??
      (async (path: string): Promise<Uint8Array> =>
        readBoundedRegularFile(path));
  }

  public async resolve(
    reference: SecretReference,
  ): Promise<SecretResolutionResult> {
    const referenceValidation = this.#referenceValidator.validate(reference);
    if (!referenceValidation.ok) {
      throw new SecretResolutionError(
        "secret_reference_invalid",
        "Secret reference is invalid",
        {
          issues: validationIssuesToJson(
            redactSecretValidationIssues(referenceValidation.issues),
          ),
        },
      );
    }

    const validatedReference = referenceValidation.value;
    const value =
      validatedReference.source === "environment"
        ? this.#resolveEnvironment(validatedReference.variableName)
        : await this.#resolveLocalFile(validatedReference.path);

    const result: SecretResolutionResult = {
      contractVersion: SECRET_VALUE_CONTRACT_VERSION,
      secretId: validatedReference.secretId,
      source: validatedReference.source,
      value: {
        contractVersion: SECRET_VALUE_CONTRACT_VERSION,
        secretId: validatedReference.secretId,
        value,
      },
    };
    const resultValidation = this.#resultValidator.validate(result);
    if (!resultValidation.ok) {
      throw new SecretResolutionError(
        "secret_value_invalid",
        "Resolved secret value is invalid",
        {
          issues: validationIssuesToJson(resultValidation.issues),
          source: validatedReference.source,
        },
      );
    }

    return resultValidation.value;
  }

  #resolveEnvironment(variableName: string): string {
    const value = this.#environment[variableName];
    if (value === undefined) {
      throw new SecretResolutionError(
        "secret_environment_missing",
        "Environment secret is not available",
        { source: "environment" },
      );
    }
    return value;
  }

  async #resolveLocalFile(path: string): Promise<string> {
    let bytes: Uint8Array;
    try {
      bytes = await this.#readFile(path);
    } catch (error) {
      if (error instanceof SecretFileTooLargeError) {
        throw secretValueTooLargeError();
      }
      throw new SecretResolutionError(
        isMissingFileError(error)
          ? "secret_file_missing"
          : "secret_file_unavailable",
        "Local secret file is not available",
        { source: "local-file" },
      );
    }

    if (bytes.byteLength > MAX_SECRET_VALUE_BYTES) {
      throw secretValueTooLargeError();
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new SecretResolutionError(
        "secret_value_invalid",
        "Resolved secret value is invalid",
        {
          issues: [
            {
              code: "invalid_encoding",
              message: "secret value must be valid UTF-8",
              path: "<redacted>",
            },
          ],
          source: "local-file",
        },
      );
    }
  }
}

async function readBoundedRegularFile(path: string): Promise<Uint8Array> {
  const handle = await open(
    path,
    fileConstants.O_RDONLY |
      fileConstants.O_NOFOLLOW |
      fileConstants.O_NONBLOCK,
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new Error("Secret path is not a regular file");
    }
    if (metadata.size > MAX_SECRET_VALUE_BYTES) {
      throw new SecretFileTooLargeError();
    }

    const buffer = Buffer.alloc(MAX_SECRET_VALUE_BYTES + 1);
    let totalBytes = 0;
    while (totalBytes < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        totalBytes,
        buffer.byteLength - totalBytes,
        totalBytes,
      );
      if (bytesRead === 0) {
        break;
      }
      totalBytes += bytesRead;
    }
    return buffer.subarray(0, totalBytes);
  } finally {
    await handle.close();
  }
}

function secretValueTooLargeError(): SecretResolutionError {
  return new SecretResolutionError(
    "secret_value_invalid",
    "Resolved secret value is invalid",
    {
      issues: [
        {
          code: "too_large",
          message: "secret value exceeds the size limit",
          path: "<redacted>",
        },
      ],
      source: "local-file",
    },
  );
}

function validationIssuesToJson(
  issues: readonly ValidationIssue[],
): readonly JsonObject[] {
  return Object.freeze(
    issues.map(({ code, message, path }) => ({
      code,
      message,
      path,
    })),
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
