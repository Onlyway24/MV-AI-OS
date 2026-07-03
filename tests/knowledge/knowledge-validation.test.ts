import { describe, expect, it } from "vitest";

import {
  KnowledgeQueryValidator,
  KnowledgeRecordValidator,
  KnowledgeScopeValidator,
  KnowledgeSearchResultValidator,
  KnowledgeSourceValidator,
} from "../../src/index.js";
import {
  createKnowledgeQuery,
  createKnowledgeRecord,
  createKnowledgeScope,
  createKnowledgeSource,
} from "./fixtures.js";

describe("Knowledge contract validation", () => {
  it("accepts valid public knowledge contracts", () => {
    const source = createKnowledgeSource();
    const record = createKnowledgeRecord("knowledge-001");
    const scope = createKnowledgeScope();
    const query = createKnowledgeQuery();

    expect(new KnowledgeSourceValidator().validate(source).ok).toBe(true);
    expect(new KnowledgeRecordValidator().validate(record).ok).toBe(true);
    expect(new KnowledgeScopeValidator().validate(scope).ok).toBe(true);
    expect(new KnowledgeQueryValidator().validate(query).ok).toBe(true);
    expect(
      new KnowledgeSearchResultValidator().validate({
        contractVersion: "1",
        queryId: query.queryId,
        records: [record],
        searchedAt: "2026-07-02T10:00:00.000Z",
      }).ok,
    ).toBe(true);
  });

  it("rejects invalid knowledge sources", () => {
    const result = new KnowledgeSourceValidator().validate({
      ...createKnowledgeSource(),
      capturedAt: "not-a-timestamp",
      sourceType: "unknown",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_value",
            path: "sourceType",
          }),
          expect.objectContaining({
            code: "invalid_timestamp",
            path: "capturedAt",
          }),
        ]),
      );
    }
  });

  it("rejects invalid knowledge records and nested source contracts", () => {
    const result = new KnowledgeRecordValidator().validate({
      ...createKnowledgeRecord("knowledge-invalid"),
      source: {
        ...createKnowledgeSource(),
        schemaVersion: "2",
      },
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unsupported_version",
            path: "source.schemaVersion",
          }),
          expect.objectContaining({
            code: "invalid_order",
            path: "updatedAt",
          }),
        ]),
      );
    }
  });

  it("rejects invalid scope permissions and malformed queries", () => {
    const scopeResult = new KnowledgeScopeValidator().validate({
      ...createKnowledgeScope(),
      effectivePermissions: ["knowledge:unscoped"],
    });
    const queryResult = new KnowledgeQueryValidator().validate({
      ...createKnowledgeQuery(),
      freshAfter: "yesterday",
      limit: 101,
      sourceTypes: ["unknown"],
    });

    expect(scopeResult.ok).toBe(false);
    expect(queryResult.ok).toBe(false);
    if (!queryResult.ok) {
      expect(queryResult.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_timestamp",
            path: "freshAfter",
          }),
          expect.objectContaining({
            code: "too_large",
            path: "limit",
          }),
          expect.objectContaining({
            code: "invalid_value",
            path: "sourceTypes[0]",
          }),
        ]),
      );
    }
  });

  it("rejects duplicate or non-deterministically ordered search results", () => {
    const older = createKnowledgeRecord("knowledge-older", {
      verifiedAt: "2026-07-01T09:00:00.000Z",
    });
    const newer = createKnowledgeRecord("knowledge-newer", {
      verifiedAt: "2026-07-02T09:00:00.000Z",
    });
    const result = new KnowledgeSearchResultValidator().validate({
      contractVersion: "1",
      queryId: "knowledge-query-001",
      records: [older, newer, older],
      searchedAt: "2026-07-02T10:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "duplicate",
            path: "records",
          }),
          expect.objectContaining({
            code: "invalid_order",
            path: "records",
          }),
        ]),
      );
    }
  });
});
