import {
  LOCAL_CLI_CONTRACT_VERSION,
  type LocalCliConfig,
} from "../cli/local-cli-config.js";
import type { JsonObject } from "../contracts/json.js";
import { CoreError } from "../errors/core-error.js";
import type { ValidationIssue } from "../validation/validation.js";
import {
  MAX_LOCAL_APPLICATION_CONFIG_BYTES,
  type LocalApplicationConfig,
} from "./local-application-config.js";
import { LocalApplicationConfigValidator } from "./local-application-config-validator.js";

export class LocalConfigurationError extends CoreError {
  public constructor(
    code:
      | "local_configuration_empty"
      | "local_configuration_too_large"
      | "local_configuration_encoding_invalid"
      | "local_configuration_json_invalid"
      | "local_configuration_invalid",
    message: string,
    details?: JsonObject,
  ) {
    super({
      category: "validation",
      code,
      ...(details === undefined ? {} : { details }),
      message,
      stage: "local_configuration",
    });
  }
}

export class LocalConfigurationLoader {
  readonly #validator = new LocalApplicationConfigValidator();

  public load(input: Uint8Array | string): LocalApplicationConfig {
    const bytes =
      typeof input === "string" ? Buffer.from(input, "utf8") : input;
    if (bytes.byteLength === 0) {
      throw new LocalConfigurationError(
        "local_configuration_empty",
        "Local configuration input must not be empty",
      );
    }
    if (bytes.byteLength > MAX_LOCAL_APPLICATION_CONFIG_BYTES) {
      throw new LocalConfigurationError(
        "local_configuration_too_large",
        "Local configuration input exceeds the size limit",
      );
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new LocalConfigurationError(
        "local_configuration_encoding_invalid",
        "Local configuration input must be valid UTF-8",
      );
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(text) as unknown;
    } catch {
      throw new LocalConfigurationError(
        "local_configuration_json_invalid",
        "Local configuration input must be valid JSON",
      );
    }

    const validation = this.#validator.validate(candidate);
    if (!validation.ok) {
      throw new LocalConfigurationError(
        "local_configuration_invalid",
        "Local configuration failed validation",
        { issues: validationIssuesToJson(redactValidationIssues(validation.issues)) },
      );
    }

    return validation.value;
  }

  public toCliConfig(config: LocalApplicationConfig): LocalCliConfig {
    return {
      contractVersion: LOCAL_CLI_CONTRACT_VERSION,
      maxRequestBytes: config.cli.maxRequestBytes,
      runtime: config.runtime,
    };
  }
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

export function redactValidationIssues(
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  return Object.freeze(
    issues.map(({ code, message, path }) => ({
      code,
      message,
      path: redactSecretPath(path),
    })),
  );
}

function redactSecretPath(path: string): string {
  return path.replace(
    /secretReferences\[(\d+)\]\.(secretId|variableName|path)/gu,
    "secretReferences[$1].<redacted>",
  );
}
