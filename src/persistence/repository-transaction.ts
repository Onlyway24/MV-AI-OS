import type { AuditRepository } from "./audit-repository.js";
import type { RequestRepository } from "./request-repository.js";
import type { TaskRepository } from "./task-repository.js";
import type { WorkflowPersistenceTransaction } from "../workflows/runtime/workflow-persistence.js";
import type { LocalWorkflowCommandRepository } from "../runtime/local-workflow-command-repository.js";
import type { MetodoVeloceContentProductionRepository } from "../content-production/metodo-veloce-content-production-repository.js";
import type { ProductionRuntimeJobRepository } from "../production-runtime/production-runtime-job-repository.js";

export interface RepositoryTransaction {
  readonly audits: AuditRepository;
  readonly contentProductions: MetodoVeloceContentProductionRepository;
  readonly productionRuntimeJobs: ProductionRuntimeJobRepository;
  readonly requests: RequestRepository;
  readonly tasks: TaskRepository;
  readonly workflowCommands: LocalWorkflowCommandRepository;
  readonly workflows: WorkflowPersistenceTransaction;
}

export interface RepositoryTransactionRunner {
  transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;
}
