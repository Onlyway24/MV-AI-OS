import type { AuditRepository } from "./audit-repository.js";
import type { RequestRepository } from "./request-repository.js";
import type { TaskRepository } from "./task-repository.js";

export interface RepositoryTransaction {
  readonly audits: AuditRepository;
  readonly requests: RequestRepository;
  readonly tasks: TaskRepository;
}

export interface RepositoryTransactionRunner {
  transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;
}
