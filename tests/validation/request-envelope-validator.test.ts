import { describe, expect, it } from "vitest";

import { RequestEnvelopeValidator } from "../../src/index.js";
import { createRequest } from "../support/fixtures.js";

describe("RequestEnvelopeValidator", () => {
  const validator = new RequestEnvelopeValidator();

  it("accepts the documented request contract", () => {
    const result = validator.validate(
      createRequest({
        constraints: { tone: "clear" },
        input: { product: "MV AI OS" },
        requestedWorkflow: { operation: "export" },
        sessionId: "session-001",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        contractVersion: "1",
        source: "local",
        taskType: "business.content",
      });
    }
  });

  it("validates the contract after a JSON serialization round trip", () => {
    const serialized = JSON.stringify(
      createRequest({ input: { product: "MV AI OS" } }),
    );
    const parsed: unknown = JSON.parse(serialized);

    const result = validator.validate(parsed);

    expect(result.ok).toBe(true);
  });

  it("rejects unknown contract versions and non-UTC timestamps", () => {
    const result = validator.validate({
      ...createRequest(),
      contractVersion: "2",
      receivedAt: "2026-07-02T12:00:00+02:00",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "unsupported_version" }),
          expect.objectContaining({ code: "invalid_timestamp" }),
        ]),
      );
    }
  });

  it("rejects cyclic values that cannot cross a JSON boundary", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const result = validator.validate({
      ...createRequest(),
      input: cyclic,
    });

    expect(result).toEqual({
      issues: [
        expect.objectContaining({
          code: "invalid_json_object",
          path: "input",
        }),
      ],
      ok: false,
    });
  });
});
