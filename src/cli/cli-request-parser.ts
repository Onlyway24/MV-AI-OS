import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { Validator } from "../validation/validation.js";
import { CliBoundaryError } from "./cli-error-response.js";

export class CliRequestParser {
  readonly #validator: Validator<RequestEnvelope>;

  public constructor(validator: Validator<RequestEnvelope>) {
    this.#validator = validator;
  }

  public parse(input: Uint8Array, maximumBytes: number): RequestEnvelope {
    if (input.byteLength === 0) {
      throw new CliBoundaryError(
        "cli_request_missing",
        "No request was provided on standard input",
        "cli_request_input",
      );
    }
    if (input.byteLength > maximumBytes) {
      throw new CliBoundaryError(
        "cli_request_too_large",
        "The request exceeds the configured size limit",
        "cli_request_input",
      );
    }

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      throw new CliBoundaryError(
        "cli_request_encoding_invalid",
        "The request must be valid UTF-8",
        "cli_request_input",
      );
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(text) as unknown;
    } catch {
      throw new CliBoundaryError(
        "cli_request_json_invalid",
        "The request must be valid JSON",
        "cli_request_input",
      );
    }

    const validation = this.#validator.validate(candidate);
    if (!validation.ok) {
      throw new CliBoundaryError(
        "cli_request_invalid",
        "The request does not satisfy the RequestEnvelope contract",
        "cli_request_validation",
      );
    }
    if (validation.value.source !== "local") {
      throw new CliBoundaryError(
        "cli_request_source_invalid",
        "The local CLI accepts only requests with source local",
        "cli_request_validation",
      );
    }
    return validation.value;
  }
}
