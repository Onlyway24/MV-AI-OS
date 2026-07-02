import type { AuditEvent } from "../contracts/audit-event.js";
import type { JsonObject } from "../contracts/json.js";
import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { TaskResponse } from "../contracts/task-response.js";
import {
  type CoreError,
  RepositoryConflictError,
  RequestIdConflictError,
  RequestInProgressError,
} from "../errors/core-error.js";
import {
  STORED_REQUEST_SCHEMA_VERSION,
  type StoredRequest,
} from "../persistence/request-repository.js";
import { createRequestFingerprint } from "../persistence/request-identity.js";
import type {
  RepositoryTransaction,
  RepositoryTransactionRunner,
} from "../persistence/repository-transaction.js";
import type { TaskRecord } from "./models/task.js";
import type { IdentifierGenerator } from "./dependencies.js";
import { nextIdentifier } from "./runtime-values.js";

type RequestAcceptance =
  | {
      readonly kind: "accepted";
      readonly task: TaskRecord;
    }
  | {
      readonly kind: "replayed";
      readonly response: TaskResponse;
      readonly task: TaskRecord;
    };

type RequestAcceptanceAttempt =
  | RequestAcceptance
  | {
      readonly error: CoreError;
      readonly kind: "rejected";
    };

interface TransitionAudit {
  readonly eventType: string;
  readonly action: string;
  readonly metadata?: JsonObject;
  readonly outcome?: AuditEvent["outcome"];
}

export class RepositoryBackedTaskLifecycle {
  readonly #identifiers: IdentifierGenerator;
  readonly #repositories: RepositoryTransactionRunner;

  public constructor(
    repositories: RepositoryTransactionRunner,
    identifiers: IdentifierGenerator,
  ) {
    this.#repositories = repositories;
    this.#identifiers = identifiers;
  }

  public async accept(
    request: RequestEnvelope,
    candidate: TaskRecord,
  ): Promise<RequestAcceptance> {
    const attempt = await this.#repositories.transaction(
      (repositories) =>
        this.#acceptInTransaction(repositories, request, candidate),
      );

    if (attempt.kind === "rejected") {
      throw attempt.error;
    }
    return attempt;
  }

  async #acceptInTransaction(
    repositories: RepositoryTransaction,
    request: RequestEnvelope,
    candidate: TaskRecord,
  ): Promise<RequestAcceptanceAttempt> {
    const requestFingerprint = createRequestFingerprint(request);
    const existingRequest = await repositories.requests.getById(
      request.requestId,
    );
    if (existingRequest !== undefined) {
      const existingTask = await repositories.tasks.getById(
        existingRequest.taskId,
      );
      if (existingTask === undefined) {
        throw new RepositoryConflictError(
          "Stored request references a missing task",
          {
            requestId: request.requestId,
            taskId: existingRequest.taskId,
          },
        );
      }
      if (existingRequest.requestFingerprint !== requestFingerprint) {
        const error = new RequestIdConflictError(
          request.requestId,
          existingRequest.taskId,
        );
        await repositories.audits.append(
          this.#event(existingTask, candidate.createdAt, {
            action: "request.accept",
            eventType: "request.rejected",
            metadata: {
              attemptedCorrelationId: request.correlationId,
              code: error.code,
              requestId: request.requestId,
            },
            outcome: "failure",
          }),
        );
        return Object.freeze({
          error,
          kind: "rejected" as const,
        });
      }
      if (existingRequest.response === undefined) {
        const error = new RequestInProgressError(
          request.requestId,
          existingTask.taskId,
          existingTask.state,
        );
        await repositories.audits.append(
          this.#event(existingTask, candidate.createdAt, {
            action: "request.replay",
            eventType: "request.rejected",
            metadata: {
              code: error.code,
              requestId: request.requestId,
              state: existingTask.state,
            },
            outcome: "failure",
          }),
        );
        return Object.freeze({
          error,
          kind: "rejected" as const,
        });
      }

      await repositories.audits.append(
        this.#event(existingTask, candidate.createdAt, {
          action: "request.replay",
          eventType: "request.replayed",
          metadata: {
            requestId: request.requestId,
            responseStatus: existingRequest.response.status,
          },
        }),
      );
      return Object.freeze({
        kind: "replayed" as const,
        response: existingRequest.response,
        task: existingTask,
      });
    }

    const storedRequest: StoredRequest = Object.freeze({
      createdAt: candidate.createdAt,
      requestFingerprint,
      requestId: request.requestId,
      schemaVersion: STORED_REQUEST_SCHEMA_VERSION,
      taskId: candidate.taskId,
      updatedAt: candidate.updatedAt,
    });
    await repositories.requests.insert(storedRequest);
    await repositories.tasks.insert(candidate);
    await repositories.audits.append(
      this.#event(candidate, candidate.createdAt, {
        action: "request.accept",
        eventType: "request.accepted",
        metadata: {
          requestId: request.requestId,
          source: request.source,
          taskType: request.taskType,
        },
      }),
    );

    return Object.freeze({
      kind: "accepted" as const,
      task: candidate,
    });
  }

  public transition(
    previous: TaskRecord,
    next: TaskRecord,
    audit: TransitionAudit,
  ): Promise<void> {
    return this.#repositories.transaction(async (repositories) => {
      await repositories.tasks.update(next, {
        state: previous.state,
        updatedAt: previous.updatedAt,
      });
      await repositories.audits.append(
        this.#event(next, next.updatedAt, {
          ...audit,
          metadata: {
            from: previous.state,
            ...(audit.metadata ?? {}),
            to: next.state,
          },
        }),
      );
    });
  }

  public audit(
    task: TaskRecord,
    audit: TransitionAudit,
    occurredAt: string,
  ): Promise<void> {
    return this.#repositories.transaction(({ audits }) =>
      audits.append(this.#event(task, occurredAt, audit)),
    );
  }

  public complete(
    previous: TaskRecord,
    next: TaskRecord,
    response: TaskResponse,
    audit: TransitionAudit,
  ): Promise<void> {
    return this.#repositories.transaction(async (repositories) => {
      await repositories.tasks.update(next, {
        state: previous.state,
        updatedAt: previous.updatedAt,
      });
      await repositories.requests.saveResponse(
        next.requestId,
        next.taskId,
        response,
        next.updatedAt,
      );
      await repositories.audits.append(
        this.#event(next, next.updatedAt, {
          ...audit,
          metadata: {
            from: previous.state,
            ...(audit.metadata ?? {}),
            responseStatus: response.status,
            to: next.state,
          },
        }),
      );
    });
  }

  #event(
    task: TaskRecord,
    occurredAt: string,
    audit: TransitionAudit,
  ): AuditEvent {
    return Object.freeze({
      action: audit.action,
      actorId: task.actorId,
      contractVersion: "1",
      correlationId: task.correlationId,
      eventId: nextIdentifier(
        this.#identifiers,
        "audit",
        "audit_persistence",
      ),
      eventType: audit.eventType,
      metadata: audit.metadata ?? {},
      occurredAt,
      outcome: audit.outcome ?? "success",
      schemaVersion: "1",
      subject: {
        requestId: task.requestId,
        taskId: task.taskId,
      },
      taskId: task.taskId,
      workspaceId: task.workspaceId,
    });
  }
}
