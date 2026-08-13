import type { AuditRepository } from "./audit-repository.js";
import type { RequestRepository } from "./request-repository.js";
import type { TaskRepository } from "./task-repository.js";
import type { WorkflowPersistenceTransaction } from "../workflows/runtime/workflow-persistence.js";
import type { LocalWorkflowCommandRepository } from "../runtime/local-workflow-command-repository.js";
import type { MetodoVeloceContentProductionRepository } from "../content-production/metodo-veloce-content-production-repository.js";
import type { ProductionRuntimeJobRepository } from "../production-runtime/production-runtime-job-repository.js";
import type { OperationalPlaneRepository } from "../operational-planes/operational-plane-repository.js";
import type { BusinessMissionRepository } from "../business/business-mission-repository.js";
import type { AgentCompanyWorkdayRepository } from "../agent-company/agent-company-workday-repository.js";
import type { AuthorizedResearchRepository } from "../research/authorized-research-repository.js";
import type { OperationalEventRepository } from "../operations-runtime/operational-event-repository.js";
import type { OperationsRuntimeRepository } from "../operations-runtime/operations-runtime-repository.js";
import type { OperationsControlRepository } from "../operations-control/operations-control-repository.js";
import type { FounderWorkdayRepository } from "../agent-company/founder-workday-repository.js";
import type { DailyOperatingBriefRepository } from "../daily-brief/daily-operating-brief-repository.js";

export interface RepositoryTransaction {
  readonly agentCompanyWorkdays: AgentCompanyWorkdayRepository;
  readonly authorizedResearch: AuthorizedResearchRepository;
  readonly audits: AuditRepository;
  readonly businessMissions: BusinessMissionRepository;
  readonly contentProductions: MetodoVeloceContentProductionRepository;
  readonly dailyOperatingBriefs: DailyOperatingBriefRepository;
  readonly founderWorkdays: FounderWorkdayRepository;
  readonly operationalEvents: OperationalEventRepository;
  readonly operationsControls: OperationsControlRepository;
  readonly operationsRuntime: OperationsRuntimeRepository;
  readonly productionRuntimeJobs: ProductionRuntimeJobRepository;
  readonly operationalPlanes: OperationalPlaneRepository;
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
