import { describe, expect, it } from "vitest";

import { ModelRequestValidator } from "../../src/index.js";
import { createModelRequest } from "../support/model-gateway-fixtures.js";

describe("ModelRequestValidator", () => {
  const validator = new ModelRequestValidator();

  it("accepts text and structured request contracts", () => {
    expect(validator.validate(createModelRequest()).ok).toBe(true);
    expect(
      validator.validate(
        createModelRequest({
          output: {
            format: "json",
            schema: { type: "object" },
          },
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects unsupported versions, empty messages, and incomplete JSON output", () => {
    const result = validator.validate({
      ...createModelRequest(),
      contractVersion: "2",
      messages: [],
      output: { format: "json" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "unsupported_version" }),
          expect.objectContaining({ code: "empty", path: "messages" }),
          expect.objectContaining({
            code: "required",
            path: "output.schema",
          }),
        ]),
      );
    }
  });
});
