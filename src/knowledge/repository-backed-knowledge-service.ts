import {
  KnowledgeInvariantError,
  KnowledgePermissionError,
  KnowledgeValidationError,
} from "./knowledge-error.js";
import type { KnowledgeQuery } from "./knowledge-query.js";
import type {
  KnowledgeRepository,
  KnowledgeRepositorySearch,
} from "./knowledge-repository.js";
import type { KnowledgeRecord } from "./knowledge-record.js";
import {
  compareKnowledgeRecords,
  matchesKnowledgeSearch,
} from "./knowledge-retrieval.js";
import type { KnowledgeSearchResult } from "./knowledge-search-result.js";
import type { KnowledgeService } from "./knowledge-service.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";

export interface RepositoryBackedKnowledgeServiceDependencies {
  readonly clock: Clock;
  readonly queryValidator: Validator<KnowledgeQuery>;
  readonly recordValidator: Validator<KnowledgeRecord>;
  readonly repository: KnowledgeRepository;
  readonly resultValidator: Validator<KnowledgeSearchResult>;
}

export class RepositoryBackedKnowledgeService
  implements KnowledgeService
{
  readonly #dependencies: RepositoryBackedKnowledgeServiceDependencies;

  public constructor(
    dependencies: RepositoryBackedKnowledgeServiceDependencies,
  ) {
    this.#dependencies = dependencies;
  }

  public async search(
    query: KnowledgeQuery,
  ): Promise<KnowledgeSearchResult> {
    const queryValidation =
      this.#dependencies.queryValidator.validate(query);
    if (!queryValidation.ok) {
      throw new KnowledgeValidationError(
        "Knowledge query failed validation",
        queryValidation.issues,
      );
    }
    const validQuery = queryValidation.value;
    if (
      !validQuery.scope.effectivePermissions.includes("knowledge:search")
    ) {
      throw new KnowledgePermissionError({
        actorId: validQuery.scope.actorId,
        taskId: validQuery.scope.taskId,
        workspaceId: validQuery.scope.workspaceId,
      });
    }

    const searchedAt = this.#timestamp();
    const repositoryQuery = toRepositorySearch(validQuery, searchedAt);
    const candidates =
      await this.#dependencies.repository.search(repositoryQuery);
    if (candidates.length > validQuery.limit) {
      throw new KnowledgeInvariantError(
        "Knowledge repository exceeded the requested result limit",
        {
          actual: candidates.length,
          limit: validQuery.limit,
          queryId: validQuery.queryId,
        },
      );
    }

    const records: KnowledgeRecord[] = [];
    for (const candidate of candidates) {
      const validation =
        this.#dependencies.recordValidator.validate(candidate);
      if (!validation.ok) {
        throw new KnowledgeInvariantError(
          "Knowledge repository returned an invalid record",
          {
            issues: validation.issues.map(({ code, message, path }) => ({
              code,
              message,
              path,
            })),
            queryId: validQuery.queryId,
          },
        );
      }
      if (!matchesKnowledgeSearch(validation.value, repositoryQuery)) {
        throw new KnowledgeInvariantError(
          "Knowledge repository returned a record outside the authorized query",
          {
            knowledgeId: validation.value.knowledgeId,
            queryId: validQuery.queryId,
          },
        );
      }
      records.push(validation.value);
    }
    records.sort(compareKnowledgeRecords);

    const result: KnowledgeSearchResult = Object.freeze({
      contractVersion: validQuery.contractVersion,
      queryId: validQuery.queryId,
      records: Object.freeze(records),
      searchedAt,
    });
    const resultValidation =
      this.#dependencies.resultValidator.validate(result);
    if (!resultValidation.ok) {
      throw new KnowledgeInvariantError(
        "Knowledge service generated an invalid search result",
        {
          issues: resultValidation.issues.map(
            ({ code, message, path }) => ({
              code,
              message,
              path,
            }),
          ),
          queryId: validQuery.queryId,
        },
      );
    }
    return result;
  }

  #timestamp(): string {
    const value = this.#dependencies.clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new KnowledgeInvariantError("Clock returned an invalid date");
    }
    return value.toISOString();
  }
}

function toRepositorySearch(
  query: KnowledgeQuery,
  activeAt: string,
): KnowledgeRepositorySearch {
  return Object.freeze({
    activeAt,
    actorId: query.scope.actorId,
    allowedScopes: Object.freeze([...query.scope.allowedScopes]),
    ...(query.freshAfter === undefined
      ? {}
      : { freshAfter: query.freshAfter }),
    limit: query.limit,
    permissionTags: Object.freeze([...query.scope.permissionTags]),
    ...(query.sourceTypes === undefined
      ? {}
      : { sourceTypes: Object.freeze([...query.sourceTypes]) }),
    ...(query.tags === undefined
      ? {}
      : { tags: Object.freeze([...query.tags]) }),
    ...(query.text === undefined ? {} : { text: query.text }),
    workspaceId: query.scope.workspaceId,
  });
}
