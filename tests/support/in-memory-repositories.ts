import type { AuditEvent } from "../../src/contracts/audit-event.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import type { TaskResponse } from "../../src/contracts/task-response.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
  RequestIdConflictError,
} from "../../src/errors/core-error.js";
import { isTaskTransitionAllowed } from "../../src/core/models/task.js";
import type { TaskRecord } from "../../src/core/models/task.js";
import { AuditEventValidator } from "../../src/validation/audit-event-validator.js";
import type { AuditRepository } from "../../src/persistence/audit-repository.js";
import type {
  RequestRepository,
  StoredRequest,
} from "../../src/persistence/request-repository.js";
import type {
  RepositoryTransaction,
  RepositoryTransactionRunner,
} from "../../src/persistence/repository-transaction.js";
import type {
  TaskRepository,
  TaskUpdateExpectation,
} from "../../src/persistence/task-repository.js";
import { isRfc3339Timestamp } from "../../src/validation/primitives.js";
import { TaskResponseValidator } from "../../src/validation/task-response-validator.js";
import type {
  WorkflowCommandReceipt,
  WorkflowDefinition,
  WorkflowInstance,
} from "../../src/workflows/runtime/workflow-runtime.js";
import type {
  WorkflowApprovalCheckpoint,
  WorkflowControlCheckpointEvent,
  WorkflowControlCheckpointEventDraft,
  WorkflowGuardianCheckpoint,
} from "../../src/workflows/runtime/workflow-control-checkpoint.js";
import {
  WorkflowApprovalCheckpointValidator,
  WorkflowControlCheckpointEventDraftValidator,
  WorkflowControlCheckpointEventValidator,
  WorkflowGuardianCheckpointValidator,
} from "../../src/workflows/runtime/workflow-control-checkpoint-validator.js";
import {
  WorkflowCommandReceiptValidator,
  WorkflowDefinitionValidator,
  WorkflowInstanceValidator,
} from "../../src/workflows/runtime/workflow-runtime-validator.js";
import {
  isWorkflowStepTransitionAllowed,
  isWorkflowTransitionAllowed,
} from "../../src/workflows/runtime/deterministic-workflow-state-machine.js";
import type {
  WorkflowEvent,
  WorkflowEventDraft,
} from "../../src/workflows/runtime/workflow-persistence.js";
import {
  WorkflowEventDraftValidator,
  WorkflowEventValidator,
} from "../../src/workflows/runtime/workflow-persistence-validator.js";
import type { WorkflowAgentInvocationEvent, WorkflowAgentInvocationReceipt } from "../../src/workflows/runtime/workflow-agent-invocation.js";
import type { WorkflowStepOutcomeReceipt } from "../../src/workflows/runtime/workflow-step-outcome.js";
import type { WorkflowLifecycleEvent, WorkflowLifecycleRecord } from "../../src/workflows/runtime/workflow-lifecycle.js";
import type { LocalWorkflowCommandReceipt, LocalWorkflowOwnership } from "../../src/runtime/local-workflow-command-repository.js";
import type { MetodoVeloceContentProductionRecord } from "../../src/content-production/metodo-veloce-content-production-record.js";
import { isMetodoVeloceContentProductionTransitionAllowed } from "../../src/content-production/metodo-veloce-content-production-record.js";
import { MetodoVeloceContentProductionRecordValidator } from "../../src/content-production/metodo-veloce-content-production-validator.js";
import { isProductionRuntimeJobTransitionAllowed, type ProductionRuntimeJob } from "../../src/production-runtime/production-runtime-job.js";
import { ProductionRuntimeJobValidator } from "../../src/production-runtime/production-runtime-validator.js";
import type { Validator } from "../../src/validation/validation.js";
import type { EvidencePack, EvidenceRecord, FeedbackMetricSnapshot, PublicationKillSwitch, PublicationPlan, SourceRegistryEntry } from "../../src/operational-planes/operational-plane.js";
import { isPublicationTransitionAllowed } from "../../src/operational-planes/operational-plane.js";
import { EvidencePackValidator, EvidenceRecordValidator, FeedbackMetricSnapshotValidator, PublicationKillSwitchValidator, PublicationPlanValidator, SourceRegistryEntryValidator } from "../../src/operational-planes/operational-plane-validator.js";
import type { BusinessMissionDossier } from "../../src/business/business-mission.js";
import { BusinessMissionDossierValidator } from "../../src/business/business-mission-validator.js";
import type { AgentCompanyWorkday } from "../../src/agent-company/operational-agent-company.js";
import { AgentCompanyWorkdayValidator } from "../../src/agent-company/operational-agent-company-validator.js";
import type { AuthorizedResearchMission, ResearchAcquisitionSnapshot } from "../../src/research/authorized-research.js";
import { AuthorizedResearchMissionValidator, ResearchAcquisitionSnapshotValidator } from "../../src/research/authorized-research-validator.js";
import type { SocialLiveRecord } from "../../src/social-intelligence-live/social-intelligence-live.js";
import { SocialLiveRecordValidator } from "../../src/social-intelligence-live/social-intelligence-live-validator.js";
import type { OperationalEvent, OperationalEventDraft } from "../../src/operations-runtime/operational-event.js";
import type { OperationalEventRepository } from "../../src/operations-runtime/operational-event-repository.js";
import { OperationalEventDraftValidator, OperationalEventValidator } from "../../src/operations-runtime/operational-event-validator.js";
import { isOperationsJobTransitionAllowed, type OperationsJob, type OperationsJobAttempt, type OperationsJobSummary, type OperationsJobSuccessor, type OperationsProcessLease, type OperationsRuntimeControl, type OperationsRuntimeUsageSummary, type OperationsSchedule } from "../../src/operations-runtime/operations-runtime.js";
import type { OperationsRuntimeRepository } from "../../src/operations-runtime/operations-runtime-repository.js";
import { OperationsJobAttemptValidator, OperationsJobValidator, OperationsProcessLeaseValidator, OperationsRuntimeControlValidator, OperationsScheduleValidator } from "../../src/operations-runtime/operations-runtime-validator.js";
import type { FounderWorkdayRecord } from "../../src/agent-company/founder-workday.js";
import { FounderWorkdayRecordValidator } from "../../src/agent-company/founder-workday-validator.js";
import type { DailyOperatingBriefRecord } from "../../src/daily-brief/daily-operating-brief.js";
import { DailyOperatingBriefRecordValidator } from "../../src/daily-brief/daily-operating-brief-validator.js";
import type { ControlActionProposal, ControlActionReceipt, OperationsIncidentRecord, ProductionControlRecord } from "../../src/operations-control/operations-control.js";
import { ControlActionProposalValidator, ControlActionReceiptValidator, OperationsIncidentRecordValidator, ProductionControlRecordValidator } from "../../src/operations-control/operations-control-validator.js";

const REQUEST_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

interface RepositoryState {
  readonly agentCompanyWorkdays: Map<string, AgentCompanyWorkday>;
  readonly authorizedResearchMissions: Map<string, AuthorizedResearchMission>;
  readonly authorizedResearchSnapshots: Map<string, ResearchAcquisitionSnapshot>;
  readonly audits: Map<string, AuditEvent>;
  readonly businessMissions: Map<string, BusinessMissionDossier>;
  readonly controlActionProposals: Map<string, ControlActionProposal>;
  readonly controlActionReceipts: Map<string, ControlActionReceipt>;
  readonly dailyOperatingBriefs: Map<string, DailyOperatingBriefRecord>;
  readonly founderWorkdays: Map<string, FounderWorkdayRecord>;
  readonly operationsIncidents: Map<string, OperationsIncidentRecord>;
  readonly productionControls: Map<string, ProductionControlRecord>;
  readonly requests: Map<string, StoredRequest>;
  readonly tasks: Map<string, TaskRecord>;
  readonly workflowCommandReceipts: Map<string, WorkflowCommandReceipt>;
  readonly workflowApprovalCheckpoints: Map<string, WorkflowApprovalCheckpoint>;
  readonly workflowControlCheckpointEvents: Map<string, WorkflowControlCheckpointEvent>;
  readonly workflowDefinitions: Map<string, WorkflowDefinition>;
  readonly workflowEvents: Map<string, WorkflowEvent>;
  readonly workflowInstances: Map<string, WorkflowInstance>;
  readonly workflowGuardianCheckpoints: Map<string, WorkflowGuardianCheckpoint>;
  readonly workflowAgentInvocations: Map<string, WorkflowAgentInvocationReceipt>;
  readonly workflowAgentInvocationEvents: Map<string, WorkflowAgentInvocationEvent>;
  readonly workflowStepOutcomes: Map<string, WorkflowStepOutcomeReceipt>;
  readonly workflowLifecycleRecords: Map<string, WorkflowLifecycleRecord>;
  readonly workflowLifecycleEvents: Map<string, WorkflowLifecycleEvent>;
  readonly localWorkflowCommands: Map<string, LocalWorkflowCommandReceipt>;
  readonly localWorkflowOwnership: Map<string, LocalWorkflowOwnership>;
  readonly metodoVeloceContentProductions: Map<string, MetodoVeloceContentProductionRecord>;
  readonly productionRuntimeJobs: Map<string, ProductionRuntimeJob>;
  readonly sources: Map<string, SourceRegistryEntry>;
  readonly evidenceRecords: Map<string, EvidenceRecord>;
  readonly evidencePacks: Map<string, EvidencePack>;
  readonly publicationPlans: Map<string, PublicationPlan>;
  readonly publicationKillSwitches: Map<string, PublicationKillSwitch>;
  readonly feedbackMetricSnapshots: Map<string, FeedbackMetricSnapshot>;
  readonly socialLiveRecords: Map<string, SocialLiveRecord>;
  readonly operationalEvents: Map<string, OperationalEvent>;
  readonly operationsJobs: Map<string, OperationsJob>;
  readonly operationsJobAttempts: Map<string, OperationsJobAttempt>;
  readonly operationsJobSuccessors: Map<string, OperationsJobSuccessor>;
  readonly operationsRuntimeUsageRollups: Map<string, OperationsRuntimeUsageSummary>;
  readonly operationsProcessLeases: Map<string, OperationsProcessLease>;
  readonly operationsRuntimeControls: Map<string, OperationsRuntimeControl>;
  readonly operationsSchedules: Map<string, OperationsSchedule>;
  operationalEventSequence: number;
  workflowControlCheckpointEventSequence: number;
  workflowEventSequence: number;
}

export class InMemoryRepositoryTransactionRunner
  implements RepositoryTransactionRunner
{
  #state: RepositoryState = createState();
  #tail: Promise<void> = Promise.resolve();

  public transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const execution = this.#tail.then(async () => {
      const workingState = cloneState(this.#state);
      const result = await operation(createRepositories(workingState));
      this.#state = workingState;
      return result;
    });

    this.#tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }
}

function createRepositories(
  state: RepositoryState,
): RepositoryTransaction {
  return Object.freeze({
    agentCompanyWorkdays: new InMemoryAgentCompanyWorkdayRepository(state),
    authorizedResearch: new InMemoryAuthorizedResearchRepository(state),
    audits: new InMemoryAuditRepository(state),
    businessMissions: new InMemoryBusinessMissionRepository(state),
    contentProductions: new InMemoryMetodoVeloceContentProductionRepository(state),
    dailyOperatingBriefs: new InMemoryDailyOperatingBriefRepository(state),
    founderWorkdays: new InMemoryFounderWorkdayRepository(state),
    operationalEvents: new InMemoryOperationalEventRepository(state),
    operationsControls: new InMemoryOperationsControlRepository(state),
    operationsRuntime: new InMemoryOperationsRuntimeRepository(state),
    productionRuntimeJobs: new InMemoryProductionRuntimeJobRepository(state),
    operationalPlanes: new InMemoryOperationalPlaneRepository(state),
    requests: new InMemoryRequestRepository(state),
    tasks: new InMemoryTaskRepository(state),
    workflowCommands: new InMemoryLocalWorkflowCommandRepository(state),
    workflows: Object.freeze({
      agentInvocationEvents: new InMemoryWorkflowAgentInvocationEventRepository(state),
      agentInvocations: new InMemoryWorkflowAgentInvocationRepository(state),
      approvals: new InMemoryWorkflowApprovalCheckpointRepository(state),
      controlEvents: new InMemoryWorkflowControlCheckpointEventRepository(state),
      definitions: new InMemoryWorkflowDefinitionRepository(state),
      events: new InMemoryWorkflowEventRepository(state),
      instances: new InMemoryWorkflowInstanceRepository(state),
      guardians: new InMemoryWorkflowGuardianCheckpointRepository(state),
      lifecycleEvents: new InMemoryWorkflowLifecycleEventRepository(state),
      lifecycleRecords: new InMemoryWorkflowLifecycleRecordRepository(state),
      receipts: new InMemoryWorkflowCommandReceiptRepository(state),
      stepOutcomes: new InMemoryWorkflowStepOutcomeRepository(state),
    }),
  });
}

class InMemoryAgentCompanyWorkdayRepository {
  readonly #validator = new AgentCompanyWorkdayValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getByOwner(identity: { readonly actorId: string; readonly workspaceId: string }, workdayId: string): Promise<AgentCompanyWorkday | undefined> { const record = this.state.agentCompanyWorkdays.get(workdayId); return Promise.resolve(record?.actorId === identity.actorId && record.workspaceId === identity.workspaceId ? cloneFrozen(record) : undefined); }
  public insert(record: AgentCompanyWorkday): Promise<void> { const checked = this.#valid(record); if (checked.version !== 0 || this.state.agentCompanyWorkdays.has(checked.workdayId)) throw new RepositoryConflictError("Agent Company workday already exists"); this.state.agentCompanyWorkdays.set(checked.workdayId, cloneFrozen(checked)); return Promise.resolve(); }
  public listByOwner(identity: { readonly actorId: string; readonly workspaceId: string }, limit: number): Promise<readonly AgentCompanyWorkday[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RepositoryValidationError("Agent Company workday limit is invalid"); return Promise.resolve(Object.freeze([...this.state.agentCompanyWorkdays.values()].filter((record) => record.workspaceId === identity.workspaceId && record.actorId === identity.actorId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.workdayId.localeCompare(right.workdayId)).slice(0, limit).map(cloneFrozen))); }
  public update(record: AgentCompanyWorkday, expectation: { readonly version: number }): Promise<void> { const checked = this.#valid(record); const current = this.state.agentCompanyWorkdays.get(checked.workdayId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.inputFingerprint !== checked.inputFingerprint || current.status !== "RUNNING") throw new RepositoryConflictError("Agent Company workday transition is invalid"); this.state.agentCompanyWorkdays.set(checked.workdayId, cloneFrozen(checked)); return Promise.resolve(); }
  #valid(value: unknown): AgentCompanyWorkday { const result = this.#validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Agent Company workday is invalid"); return result.value; }
}

class InMemoryAuthorizedResearchRepository {
  readonly #mission = new AuthorizedResearchMissionValidator();
  readonly #snapshot = new ResearchAcquisitionSnapshotValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getMissionById(missionId: string): Promise<AuthorizedResearchMission | undefined> { return Promise.resolve(cloneOptional(this.state.authorizedResearchMissions.get(missionId))); }
  public getSnapshotById(snapshotId: string): Promise<ResearchAcquisitionSnapshot | undefined> { return Promise.resolve(cloneOptional(this.state.authorizedResearchSnapshots.get(snapshotId))); }
  public insertMission(mission: AuthorizedResearchMission): Promise<void> { const checked = this.#validMission(mission); if (checked.version !== 0 || checked.status !== "RUNNING" || this.state.authorizedResearchMissions.has(checked.input.missionId)) throw new RepositoryConflictError("Authorized Research Mission already exists"); this.state.authorizedResearchMissions.set(checked.input.missionId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertSnapshot(snapshot: ResearchAcquisitionSnapshot): Promise<void> { const checked = this.#validSnapshot(snapshot); if (this.state.authorizedResearchSnapshots.has(checked.snapshotId)) throw new RepositoryConflictError("Authorized Research snapshot already exists"); this.state.authorizedResearchSnapshots.set(checked.snapshotId, cloneFrozen(checked)); return Promise.resolve(); }
  public listMissionsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly AuthorizedResearchMission[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RepositoryValidationError("Authorized Research list limit is invalid"); return Promise.resolve(Object.freeze([...this.state.authorizedResearchMissions.values()].filter((mission) => mission.workspaceId === workspaceId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.input.missionId.localeCompare(right.input.missionId)).slice(0, limit).map(cloneFrozen))); }
  public listSnapshotsByMissionId(missionId: string): Promise<readonly ResearchAcquisitionSnapshot[]> { return Promise.resolve(Object.freeze([...this.state.authorizedResearchSnapshots.values()].filter((snapshot) => snapshot.missionId === missionId).sort((left, right) => left.acquiredAt.localeCompare(right.acquiredAt) || left.snapshotId.localeCompare(right.snapshotId)).map(cloneFrozen))); }
  public updateMission(mission: AuthorizedResearchMission, expectation: { readonly version: number }): Promise<void> { const checked = this.#validMission(mission); const current = this.state.authorizedResearchMissions.get(checked.input.missionId); if (current?.version !== expectation.version || current.status !== "RUNNING" || checked.version !== expectation.version + 1 || !["BLOCKED", "READY"].includes(checked.status) || current.inputFingerprint !== checked.inputFingerprint) throw new RepositoryConflictError("Authorized Research Mission transition is invalid"); this.state.authorizedResearchMissions.set(checked.input.missionId, cloneFrozen(checked)); return Promise.resolve(); }
  #validMission(value: unknown): AuthorizedResearchMission { const checked = this.#mission.validate(value); if (!checked.ok) throw new RepositoryValidationError("Authorized Research Mission is invalid"); return checked.value; }
  #validSnapshot(value: unknown): ResearchAcquisitionSnapshot { const checked = this.#snapshot.validate(value); if (!checked.ok) throw new RepositoryValidationError("Authorized Research snapshot is invalid"); return checked.value; }
}

class InMemoryBusinessMissionRepository {
  readonly #validator = new BusinessMissionDossierValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getById(missionId: string): Promise<BusinessMissionDossier | undefined> { return Promise.resolve(cloneOptional(this.state.businessMissions.get(missionId))); }
  public insert(record: BusinessMissionDossier): Promise<void> { const checked = this.#valid(record); if (checked.version !== 0 || this.state.businessMissions.has(checked.mission.missionId)) throw new RepositoryConflictError("Business Mission dossier already exists"); this.state.businessMissions.set(checked.mission.missionId, cloneFrozen(checked)); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly BusinessMissionDossier[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RepositoryValidationError("Business Mission list limit is invalid"); return Promise.resolve(Object.freeze([...this.state.businessMissions.values()].filter((record) => record.workspaceId === workspaceId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.mission.missionId.localeCompare(right.mission.missionId)).slice(0, limit).map(cloneFrozen))); }
  public update(record: BusinessMissionDossier, expectation: { readonly version: number }): Promise<void> { const checked = this.#valid(record); const current = this.state.businessMissions.get(checked.mission.missionId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.fingerprint !== checked.fingerprint || current.status !== "PENDING_FABIO_APPROVAL" || !["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(checked.status)) throw new RepositoryConflictError("Business Mission dossier transition is invalid"); this.state.businessMissions.set(checked.mission.missionId, cloneFrozen(checked)); return Promise.resolve(); }
  #valid(value: unknown): BusinessMissionDossier { const checked = this.#validator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Business Mission dossier is invalid"); return checked.value; }
}

class InMemoryFounderWorkdayRepository {
  readonly #validator = new FounderWorkdayRecordValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<FounderWorkdayRecord | undefined> { return Promise.resolve(cloneOptional(this.state.founderWorkdays.get(id))); }
  public insert(record: FounderWorkdayRecord): Promise<void> { const checked = memoryValidated(record, this.#validator, "Founder workday"); if (checked.version !== 0 || this.state.founderWorkdays.has(checked.workdayId)) throw new RepositoryConflictError("Founder workday already exists"); this.state.founderWorkdays.set(checked.workdayId, cloneFrozen(checked)); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly FounderWorkdayRecord[]> { memoryLimit(limit, 100); return Promise.resolve(Object.freeze([...this.state.founderWorkdays.values()].filter((record) => record.workspaceId === workspaceId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.workdayId.localeCompare(right.workdayId)).slice(0, limit).map(cloneFrozen))); }
  public update(record: FounderWorkdayRecord, expectation: { readonly version: number }): Promise<void> { const checked = memoryValidated(record, this.#validator, "Founder workday"); const current = this.state.founderWorkdays.get(checked.workdayId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.actorId !== checked.actorId || current.workspaceId !== checked.workspaceId || current.createdAt !== checked.createdAt) throw new RepositoryConflictError("Founder workday transition is invalid"); this.state.founderWorkdays.set(checked.workdayId, cloneFrozen(checked)); return Promise.resolve(); }
}

class InMemoryDailyOperatingBriefRepository {
  readonly #validator = new DailyOperatingBriefRecordValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getByBusinessDate(workspaceId: string, businessDate: string): Promise<DailyOperatingBriefRecord | undefined> { return Promise.resolve(cloneOptional([...this.state.dailyOperatingBriefs.values()].filter((record) => record.workspaceId === workspaceId && record.businessDate === businessDate).sort((left, right) => right.version - left.version)[0])); }
  public getById(id: string): Promise<DailyOperatingBriefRecord | undefined> { return Promise.resolve(cloneOptional(this.state.dailyOperatingBriefs.get(id))); }
  public insert(record: DailyOperatingBriefRecord): Promise<void> { const checked = memoryValidated(record, this.#validator, "Daily Operating Brief"); if (this.state.dailyOperatingBriefs.has(checked.briefId) || [...this.state.dailyOperatingBriefs.values()].some((item) => item.workspaceId === checked.workspaceId && item.businessDate === checked.businessDate && item.version === checked.version)) throw new RepositoryConflictError("Daily Operating Brief already exists"); this.state.dailyOperatingBriefs.set(checked.briefId, cloneFrozen(checked)); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly DailyOperatingBriefRecord[]> { memoryLimit(limit, 100); return Promise.resolve(Object.freeze([...this.state.dailyOperatingBriefs.values()].filter((record) => record.workspaceId === workspaceId).sort((left, right) => right.businessDate.localeCompare(left.businessDate) || right.version - left.version || left.briefId.localeCompare(right.briefId)).slice(0, limit).map(cloneFrozen))); }
}

class InMemoryOperationsControlRepository {
  readonly #incidentValidator = new OperationsIncidentRecordValidator();
  readonly #productionValidator = new ProductionControlRecordValidator();
  readonly #proposalValidator = new ControlActionProposalValidator();
  readonly #receiptValidator = new ControlActionReceiptValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getIncident(id: string): Promise<OperationsIncidentRecord | undefined> { return Promise.resolve(cloneOptional(this.state.operationsIncidents.get(id))); }
  public getProductionControl(id: string): Promise<ProductionControlRecord | undefined> { return Promise.resolve(cloneOptional(this.state.productionControls.get(id))); }
  public getProposal(id: string): Promise<ControlActionProposal | undefined> { return Promise.resolve(cloneOptional(this.state.controlActionProposals.get(id))); }
  public getProposalByIdempotencyKey(workspaceId: string, key: string): Promise<ControlActionProposal | undefined> { return Promise.resolve(cloneOptional([...this.state.controlActionProposals.values()].find((record) => record.workspaceId === workspaceId && record.idempotencyKey === key))); }
  public getReceiptByIdempotencyKey(workspaceId: string, key: string): Promise<ControlActionReceipt | undefined> { return Promise.resolve(cloneOptional([...this.state.controlActionReceipts.values()].find((record) => record.workspaceId === workspaceId && record.idempotencyKey === key))); }
  public insertIncident(record: OperationsIncidentRecord): Promise<void> { const checked = memoryValidated(record, this.#incidentValidator, "Operations incident"); if (checked.version !== 0 || checked.status !== "OPEN" || this.state.operationsIncidents.has(checked.incidentId)) throw new RepositoryConflictError("Operations incident already exists"); this.state.operationsIncidents.set(checked.incidentId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertProductionControl(record: ProductionControlRecord): Promise<void> { const checked = memoryValidated(record, this.#productionValidator, "Production control"); if (checked.version !== 0 || checked.state !== "ACTIVE" || this.state.productionControls.has(checked.productionId)) throw new RepositoryConflictError("Production control already exists"); this.state.productionControls.set(checked.productionId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertProposal(record: ControlActionProposal): Promise<void> { const checked = memoryValidated(record, this.#proposalValidator, "Control action proposal"); if (checked.version !== 0 || checked.state !== "PENDING" || this.state.controlActionProposals.has(checked.proposalId) || [...this.state.controlActionProposals.values()].some((item) => item.workspaceId === checked.workspaceId && item.idempotencyKey === checked.idempotencyKey)) throw new RepositoryConflictError("Control action proposal already exists"); this.state.controlActionProposals.set(checked.proposalId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertReceipt(record: ControlActionReceipt): Promise<void> { const checked = memoryValidated(record, this.#receiptValidator, "Control action receipt"); if (this.state.controlActionReceipts.has(checked.receiptId) || [...this.state.controlActionReceipts.values()].some((item) => item.proposalId === checked.proposalId || (item.workspaceId === checked.workspaceId && item.idempotencyKey === checked.idempotencyKey))) throw new RepositoryConflictError("Control action receipt already exists"); this.state.controlActionReceipts.set(checked.receiptId, cloneFrozen(checked)); return Promise.resolve(); }
  public listIncidents(workspaceId: string, limit: number): Promise<readonly OperationsIncidentRecord[]> { memoryLimit(limit, 250); return Promise.resolve(Object.freeze([...this.state.operationsIncidents.values()].filter((record) => record.workspaceId === workspaceId).slice(0, limit).map(cloneFrozen))); }
  public listProductionControls(workspaceId: string, limit: number): Promise<readonly ProductionControlRecord[]> { memoryLimit(limit, 250); return Promise.resolve(Object.freeze([...this.state.productionControls.values()].filter((record) => record.workspaceId === workspaceId).slice(0, limit).map(cloneFrozen))); }
  public listReceipts(workspaceId: string, limit: number): Promise<readonly ControlActionReceipt[]> { memoryLimit(limit, 250); return Promise.resolve(Object.freeze([...this.state.controlActionReceipts.values()].filter((record) => record.workspaceId === workspaceId).slice(0, limit).map(cloneFrozen))); }
  public updateIncident(record: OperationsIncidentRecord, expectation: { readonly version: number }): Promise<void> { const checked = memoryValidated(record, this.#incidentValidator, "Operations incident"); const current = this.state.operationsIncidents.get(checked.incidentId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.status !== "OPEN" || checked.status !== "ACKNOWLEDGED") throw new RepositoryConflictError("Operations incident transition is invalid"); this.state.operationsIncidents.set(checked.incidentId, cloneFrozen(checked)); return Promise.resolve(); }
  public updateProductionControl(record: ProductionControlRecord, expectation: { readonly version: number }): Promise<void> { const checked = memoryValidated(record, this.#productionValidator, "Production control"); const current = this.state.productionControls.get(checked.productionId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.workspaceId !== checked.workspaceId || current.actorId !== checked.actorId || checked.history.length !== current.history.length + 1) throw new RepositoryConflictError("Production control transition is invalid"); this.state.productionControls.set(checked.productionId, cloneFrozen(checked)); return Promise.resolve(); }
  public updateProposal(record: ControlActionProposal, expectation: { readonly version: number }): Promise<void> { const checked = memoryValidated(record, this.#proposalValidator, "Control action proposal"); const current = this.state.controlActionProposals.get(checked.proposalId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.state !== "PENDING" || !["CONSUMED", "EXPIRED"].includes(checked.state)) throw new RepositoryConflictError("Control action proposal transition is invalid"); this.state.controlActionProposals.set(checked.proposalId, cloneFrozen(checked)); return Promise.resolve(); }
}

class InMemoryLocalWorkflowCommandRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<LocalWorkflowCommandReceipt | undefined> { return Promise.resolve(cloneOptional(this.state.localWorkflowCommands.get(id))); }
  public insert(receipt: LocalWorkflowCommandReceipt): Promise<void> { if (this.state.localWorkflowCommands.has(receipt.commandId)) throw new RepositoryConflictError("Local Workflow command ID already exists"); this.state.localWorkflowCommands.set(receipt.commandId, cloneFrozen(receipt)); return Promise.resolve(); }
  public getOwnership(id: string): Promise<LocalWorkflowOwnership | undefined> { return Promise.resolve(cloneOptional(this.state.localWorkflowOwnership.get(id))); }
  public insertOwnership(ownership: LocalWorkflowOwnership): Promise<void> { if (this.state.localWorkflowOwnership.has(ownership.instanceId)) throw new RepositoryConflictError("Local Workflow ownership already exists"); this.state.localWorkflowOwnership.set(ownership.instanceId, cloneFrozen(ownership)); return Promise.resolve(); }
}

class InMemoryMetodoVeloceContentProductionRepository {
  readonly #validator = new MetodoVeloceContentProductionRecordValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getById(productionId: string): Promise<MetodoVeloceContentProductionRecord | undefined> { return Promise.resolve(cloneOptional(this.state.metodoVeloceContentProductions.get(productionId))); }
  public insert(record: MetodoVeloceContentProductionRecord): Promise<void> { const checked = this.#validate(record); if (checked.version !== 0) throw new RepositoryValidationError("A new Metodo Veloce content production must start at version zero"); if (this.state.metodoVeloceContentProductions.has(checked.productionId)) throw new RepositoryConflictError("Metodo Veloce content production already exists"); this.state.metodoVeloceContentProductions.set(checked.productionId, cloneFrozen(checked)); return Promise.resolve(); }
  public listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly MetodoVeloceContentProductionRecord[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new RepositoryValidationError("Metodo Veloce content production queue limit is invalid"); const order: Record<MetodoVeloceContentProductionRecord["status"], number> = { SCHEDULED: 0, PENDING_FABIO_APPROVAL: 1, APPROVED_FOR_SCHEDULING: 2, BLOCKED: 3, ARCHIVED: 4 }; return Promise.resolve(Object.freeze([...this.state.metodoVeloceContentProductions.values()].filter((record) => record.workspaceId === workspaceId).sort((left, right) => order[left.status] - order[right.status] || (left.schedule?.scheduledFor ?? left.updatedAt).localeCompare(right.schedule?.scheduledFor ?? right.updatedAt) || left.productionId.localeCompare(right.productionId)).slice(0, limit).map(cloneFrozen))); }
  public update(record: MetodoVeloceContentProductionRecord, expectation: { readonly version: number }): Promise<void> { const checked = this.#validate(record); const existing = this.state.metodoVeloceContentProductions.get(checked.productionId); if (existing?.version !== expectation.version || checked.version !== expectation.version + 1) throw new RepositoryConflictError("Metodo Veloce content production changed after read"); if (!sameContentIdentity(existing, checked) || !isContentTransitionValid(existing, checked)) throw new RepositoryConflictError("Metodo Veloce content production transition is invalid"); this.state.metodoVeloceContentProductions.set(checked.productionId, cloneFrozen(checked)); return Promise.resolve(); }
  #validate(value: unknown): MetodoVeloceContentProductionRecord { const checked = this.#validator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Metodo Veloce content production record is invalid"); return checked.value; }
}

function isContentTransitionValid(previous: MetodoVeloceContentProductionRecord, next: MetodoVeloceContentProductionRecord): boolean { if (!isMetodoVeloceContentProductionTransitionAllowed(previous.status, next.status)) return false; return previous.status !== "SCHEDULED" || next.status !== "SCHEDULED" || (previous.metrics === undefined && next.metrics !== undefined && JSON.stringify({ ...previous, metrics: next.metrics, updatedAt: next.updatedAt, version: next.version }) === JSON.stringify(next)); }
function sameContentIdentity(previous: MetodoVeloceContentProductionRecord, next: MetodoVeloceContentProductionRecord): boolean { return previous.actorId === next.actorId && previous.createdAt === next.createdAt && previous.productionId === next.productionId && previous.workspaceId === next.workspaceId && JSON.stringify(previous.package) === JSON.stringify(next.package); }

class InMemoryProductionRuntimeJobRepository {
  readonly #validator = new ProductionRuntimeJobValidator();
  public constructor(private readonly state: RepositoryState) {}
  public claimNextDue(workspaceId: string, now: string, leaseExpiresAt: string): Promise<ProductionRuntimeJob | undefined> { const current = [...this.state.productionRuntimeJobs.values()].filter((job) => job.workspaceId === workspaceId && ["QUEUED", "RETRY_SCHEDULED"].includes(job.status) && job.runAfter <= now).sort((left, right) => left.runAfter.localeCompare(right.runAfter) || left.jobId.localeCompare(right.jobId))[0]; if (current === undefined) return Promise.resolve(undefined); const next = this.#valid(runtimeJobClaimed(current, now, leaseExpiresAt)); this.state.productionRuntimeJobs.set(next.jobId, cloneFrozen(next)); return Promise.resolve(cloneFrozen(next)); }
  public getById(jobId: string): Promise<ProductionRuntimeJob | undefined> { return Promise.resolve(cloneOptional(this.state.productionRuntimeJobs.get(jobId))); }
  public insert(job: ProductionRuntimeJob): Promise<void> { const checked = this.#valid(job); if (checked.version !== 0 || checked.status !== "QUEUED" || this.state.productionRuntimeJobs.has(checked.jobId)) throw new RepositoryConflictError("Production Runtime job already exists"); this.state.productionRuntimeJobs.set(checked.jobId, cloneFrozen(checked)); return Promise.resolve(); }
  public listExpiredClaims(workspaceId: string, now: string, limit: number): Promise<readonly ProductionRuntimeJob[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new RepositoryValidationError("Production Runtime expiry limit is invalid"); return Promise.resolve(Object.freeze([...this.state.productionRuntimeJobs.values()].filter((job) => job.workspaceId === workspaceId && job.status === "RUNNING" && (job.leaseExpiresAt ?? "") <= now).sort((left, right) => (left.leaseExpiresAt ?? "").localeCompare(right.leaseExpiresAt ?? "") || left.jobId.localeCompare(right.jobId)).slice(0, limit).map(cloneFrozen))); }
  public summarize(workspaceId: string): Promise<{ readonly completed: number; readonly deadLetter: number; readonly queued: number; readonly retryScheduled: number; readonly running: number }> { const jobs = [...this.state.productionRuntimeJobs.values()].filter((job) => job.workspaceId === workspaceId); return Promise.resolve(Object.freeze({ completed: jobs.filter(({ status }) => status === "COMPLETED").length, deadLetter: jobs.filter(({ status }) => status === "DEAD_LETTER").length, queued: jobs.filter(({ status }) => status === "QUEUED").length, retryScheduled: jobs.filter(({ status }) => status === "RETRY_SCHEDULED").length, running: jobs.filter(({ status }) => status === "RUNNING").length })); }
  public update(job: ProductionRuntimeJob, expectation: { readonly version: number }): Promise<void> { const checked = this.#valid(job); const current = this.state.productionRuntimeJobs.get(checked.jobId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || !sameRuntimeJobIdentity(current, checked) || !runtimeJobTransition(current, checked)) throw new RepositoryConflictError("Production Runtime job transition is invalid"); this.state.productionRuntimeJobs.set(checked.jobId, cloneFrozen(checked)); return Promise.resolve(); }
  #valid(value: unknown): ProductionRuntimeJob { const checked = this.#validator.validate(value); if (!checked.ok) throw new RepositoryValidationError("Production Runtime job is invalid"); return checked.value; }
}

class InMemoryOperationalPlaneRepository {
  readonly #evidence = new EvidenceRecordValidator(); readonly #evidencePack = new EvidencePackValidator(); readonly #feedback = new FeedbackMetricSnapshotValidator(); readonly #kill = new PublicationKillSwitchValidator(); readonly #publication = new PublicationPlanValidator(); readonly #source = new SourceRegistryEntryValidator(); readonly #socialLive = new SocialLiveRecordValidator();
  public constructor(private readonly state: RepositoryState) {}
  public getSourceById(sourceId: string): Promise<SourceRegistryEntry | undefined> { return Promise.resolve(cloneOptional(this.state.sources.get(sourceId))); }
  public getEvidenceById(evidenceId: string): Promise<EvidenceRecord | undefined> { return Promise.resolve(cloneOptional(this.state.evidenceRecords.get(evidenceId))); }
  public getEvidencePackById(packId: string): Promise<EvidencePack | undefined> { return Promise.resolve(cloneOptional(this.state.evidencePacks.get(packId))); }
  public getPublicationById(publicationId: string): Promise<PublicationPlan | undefined> { return Promise.resolve(cloneOptional(this.state.publicationPlans.get(publicationId))); }
  public getPublicationKillSwitch(workspaceId: string): Promise<PublicationKillSwitch | undefined> { return Promise.resolve(cloneOptional(this.state.publicationKillSwitches.get(workspaceId))); }
  public getFeedbackSnapshotById(snapshotId: string): Promise<FeedbackMetricSnapshot | undefined> { return Promise.resolve(cloneOptional(this.state.feedbackMetricSnapshots.get(snapshotId))); }
  public getSocialLiveRecordById(recordId: string): Promise<SocialLiveRecord | undefined> { return Promise.resolve(cloneOptional(this.state.socialLiveRecords.get(recordId))); }
  public insertSource(record: SourceRegistryEntry): Promise<void> { const checked = this.#valid(record, this.#source, "Evidence source"); if (this.state.sources.has(checked.sourceId)) throw new RepositoryConflictError("Evidence source already exists"); this.state.sources.set(checked.sourceId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertEvidence(record: EvidenceRecord): Promise<void> { const checked = this.#valid(record, this.#evidence, "Evidence record"); if (this.state.evidenceRecords.has(checked.evidenceId)) throw new RepositoryConflictError("Evidence record already exists"); this.state.evidenceRecords.set(checked.evidenceId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertEvidencePack(record: EvidencePack): Promise<void> { const checked = this.#valid(record, this.#evidencePack, "Evidence Pack"); if (this.state.evidencePacks.has(checked.packId)) throw new RepositoryConflictError("Evidence Pack already exists"); this.state.evidencePacks.set(checked.packId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertPublication(record: PublicationPlan): Promise<void> { const checked = this.#valid(record, this.#publication, "Publication plan"); if (checked.version !== 0 || checked.status !== "DRY_RUN" || this.state.publicationPlans.has(checked.publicationId) || [...this.state.publicationPlans.values()].some((item) => item.workspaceId === checked.workspaceId && item.idempotencyKey === checked.idempotencyKey)) throw new RepositoryConflictError("Publication plan already exists"); this.state.publicationPlans.set(checked.publicationId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertFeedbackSnapshot(record: FeedbackMetricSnapshot): Promise<void> { const checked = this.#valid(record, this.#feedback, "Feedback metric snapshot"); if (this.state.feedbackMetricSnapshots.has(checked.snapshotId)) throw new RepositoryConflictError("Feedback metric snapshot already exists"); this.state.feedbackMetricSnapshots.set(checked.snapshotId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertSocialLiveRecord(record: SocialLiveRecord): Promise<void> { const checked = this.#valid(record, this.#socialLive, "Social Intelligence Live record"); if (this.state.socialLiveRecords.has(checked.recordId)) throw new RepositoryConflictError("Social Intelligence Live record already exists"); this.state.socialLiveRecords.set(checked.recordId, cloneFrozen(checked)); return Promise.resolve(); }
  public updatePublication(record: PublicationPlan, expectation: { readonly version: number }): Promise<void> { const checked = this.#valid(record, this.#publication, "Publication plan"); const current = this.state.publicationPlans.get(checked.publicationId); if (current === undefined) throw new RepositoryConflictError("Publication plan transition is invalid"); if (current.version !== expectation.version || checked.version !== expectation.version + 1 || !isPublicationTransitionAllowed(current.status, checked.status) || !samePublicationIdentity(current, checked)) throw new RepositoryConflictError("Publication plan transition is invalid"); this.state.publicationPlans.set(checked.publicationId, cloneFrozen(checked)); return Promise.resolve(); }
  public upsertPublicationKillSwitch(record: PublicationKillSwitch, expectation: { readonly version: number }): Promise<void> { const checked = this.#valid(record, this.#kill, "Publication kill switch"); const current = this.state.publicationKillSwitches.get(checked.workspaceId); if ((current?.version ?? 0) !== expectation.version || checked.version !== expectation.version + 1) throw new RepositoryConflictError("Publication kill switch changed during update"); this.state.publicationKillSwitches.set(checked.workspaceId, cloneFrozen(checked)); return Promise.resolve(); }
  public listFeedbackSnapshots(publicationId: string): Promise<readonly FeedbackMetricSnapshot[]> { return Promise.resolve(Object.freeze([...this.state.feedbackMetricSnapshots.values()].filter((item) => item.publicationId === publicationId).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt) || left.snapshotId.localeCompare(right.snapshotId)).map(cloneFrozen))); }
  public listOpenPublicationsByProductionId(productionId: string, limit: number): Promise<readonly PublicationPlan[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 101) throw new RepositoryValidationError("Publication plan list limit is invalid"); return Promise.resolve(Object.freeze([...this.state.publicationPlans.values()].filter((item) => item.productionId === productionId && (item.status === "AUTHORIZED" || item.status === "DRY_RUN")).sort((left, right) => left.publicationId.localeCompare(right.publicationId)).slice(0, limit).map(cloneFrozen))); }
  public listSourcesByWorkspaceId(workspaceId: string, limit: number): Promise<readonly SourceRegistryEntry[]> { return Promise.resolve(this.#list(this.state.sources.values(), workspaceId, limit, (item) => item.sourceId)); }
  public listEvidenceByWorkspaceId(workspaceId: string, limit: number): Promise<readonly EvidenceRecord[]> { return Promise.resolve(this.#list(this.state.evidenceRecords.values(), workspaceId, limit, (item) => item.evidenceId)); }
  public listEvidencePacksByWorkspaceId(workspaceId: string, limit: number): Promise<readonly EvidencePack[]> { return Promise.resolve(this.#list(this.state.evidencePacks.values(), workspaceId, limit, (item) => item.packId)); }
  public listSocialLiveRecordsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly SocialLiveRecord[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RepositoryValidationError("Social Intelligence Live list limit is invalid"); const latest = [...this.state.socialLiveRecords.values()].filter((item) => item.workspaceId === workspaceId).sort((left, right) => right.importedAt.localeCompare(left.importedAt) || right.recordId.localeCompare(left.recordId)).slice(0, limit).sort((left, right) => left.importedAt.localeCompare(right.importedAt) || left.recordId.localeCompare(right.recordId)); return Promise.resolve(Object.freeze(latest.map(cloneFrozen))); }
  #list<T extends { readonly workspaceId: string }>(items: Iterable<T>, workspaceId: string, limit: number, identifier: (item: T) => string): readonly T[] { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RepositoryValidationError("Operational plane list limit is invalid"); return Object.freeze([...items].filter((item) => item.workspaceId === workspaceId).sort((left, right) => identifier(left).localeCompare(identifier(right))).slice(0, limit).map(cloneFrozen)); }
  #valid<T>(value: unknown, validator: Validator<T>, label: string): T { const checked = validator.validate(value); if (!checked.ok) throw new RepositoryValidationError(`${label} is invalid`); return checked.value; }
}

function samePublicationIdentity(left: PublicationPlan, right: PublicationPlan): boolean { return left.accountRef === right.accountRef && left.actorId === right.actorId && left.contentPackageFingerprint === right.contentPackageFingerprint && left.contentVersion === right.contentVersion && left.createdAt === right.createdAt && left.idempotencyKey === right.idempotencyKey && left.platform === right.platform && JSON.stringify(left.productionControlBinding) === JSON.stringify(right.productionControlBinding) && left.productionId === right.productionId && left.publicationId === right.publicationId && left.scheduledFor === right.scheduledFor && left.workspaceId === right.workspaceId; }

function runtimeJobTransition(previous: ProductionRuntimeJob, next: ProductionRuntimeJob): boolean { return isProductionRuntimeJobTransitionAllowed(previous.status, next.status) && (next.status === "RUNNING" ? next.attempt === previous.attempt + 1 : next.attempt === previous.attempt); }
function sameRuntimeJobIdentity(previous: ProductionRuntimeJob, next: ProductionRuntimeJob): boolean { return previous.actorId === next.actorId && previous.createdAt === next.createdAt && previous.jobId === next.jobId && previous.maxAttempts === next.maxAttempts && previous.workspaceId === next.workspaceId && JSON.stringify(previous.brief) === JSON.stringify(next.brief); }
function runtimeJobClaimed(current: ProductionRuntimeJob, updatedAt: string, leaseExpiresAt: string): ProductionRuntimeJob { return { actorId: current.actorId, attempt: current.attempt + 1, brief: current.brief, contractVersion: current.contractVersion, createdAt: current.createdAt, jobId: current.jobId, leaseExpiresAt, maxAttempts: current.maxAttempts, runAfter: current.runAfter, status: "RUNNING", updatedAt, version: current.version + 1, workspaceId: current.workspaceId }; }

class InMemoryWorkflowAgentInvocationRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<WorkflowAgentInvocationReceipt | undefined> { return Promise.resolve(cloneOptional(this.state.workflowAgentInvocations.get(id))); }
  public listByInstanceId(id: string, limit: number): Promise<readonly WorkflowAgentInvocationReceipt[]> { return Promise.resolve(Object.freeze([...this.state.workflowAgentInvocations.values()].filter((entry) => entry.instanceId === id).slice(-limit).reverse().map(cloneFrozen))); }
  public insert(receipt: WorkflowAgentInvocationReceipt): Promise<void> { if (this.state.workflowAgentInvocations.has(receipt.invocationId)) throw new RepositoryConflictError("Workflow invocation exists"); this.state.workflowAgentInvocations.set(receipt.invocationId, cloneFrozen(receipt)); return Promise.resolve(); }
  public update(receipt: WorkflowAgentInvocationReceipt, expected: "RESERVED"): Promise<void> { const current = this.state.workflowAgentInvocations.get(receipt.invocationId); if (current?.status !== expected || current.fingerprint !== receipt.fingerprint) throw new RepositoryConflictError("Workflow invocation conflicts"); this.state.workflowAgentInvocations.set(receipt.invocationId, cloneFrozen(receipt)); return Promise.resolve(); }
}

class InMemoryWorkflowAgentInvocationEventRepository {
  public constructor(private readonly state: RepositoryState) {}
  public append(event: WorkflowAgentInvocationEvent): Promise<void> { if (this.state.workflowAgentInvocationEvents.has(event.eventId)) throw new RepositoryConflictError("Workflow invocation event exists"); this.state.workflowAgentInvocationEvents.set(event.eventId, cloneFrozen(event)); return Promise.resolve(); }
  public listByInvocationId(id: string): Promise<readonly WorkflowAgentInvocationEvent[]> { return Promise.resolve(Object.freeze([...this.state.workflowAgentInvocationEvents.values()].filter((event) => event.invocationId === id).map(cloneFrozen))); }
}

class InMemoryWorkflowStepOutcomeRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<WorkflowStepOutcomeReceipt | undefined> { return Promise.resolve(cloneOptional(this.state.workflowStepOutcomes.get(id))); }
  public getByInvocationId(id: string): Promise<WorkflowStepOutcomeReceipt | undefined> { return Promise.resolve(cloneOptional([...this.state.workflowStepOutcomes.values()].find((entry) => entry.invocationId === id))); }
  public insert(receipt: WorkflowStepOutcomeReceipt): Promise<void> { if (this.state.workflowStepOutcomes.has(receipt.outcomeId) || [...this.state.workflowStepOutcomes.values()].some((entry) => entry.invocationId === receipt.invocationId)) throw new RepositoryConflictError("Workflow outcome exists"); this.state.workflowStepOutcomes.set(receipt.outcomeId, cloneFrozen(receipt)); return Promise.resolve(); }
}

class InMemoryWorkflowLifecycleRecordRepository {
  public constructor(private readonly state: RepositoryState) {}
  public getById(id: string): Promise<WorkflowLifecycleRecord | undefined> { return Promise.resolve(cloneOptional(this.state.workflowLifecycleRecords.get(id))); }
  public insert(record: WorkflowLifecycleRecord): Promise<void> { if (this.state.workflowLifecycleRecords.has(record.recordId)) throw new RepositoryConflictError("Workflow lifecycle record exists"); this.state.workflowLifecycleRecords.set(record.recordId, cloneFrozen(record)); return Promise.resolve(); }
  public listByStep(instanceId: string, stepId: string, limit?: number): Promise<readonly WorkflowLifecycleRecord[]> { const records = [...this.state.workflowLifecycleRecords.values()].filter((record) => record.instanceId === instanceId && record.stepId === stepId); return Promise.resolve(Object.freeze((limit === undefined ? records : records.slice(-limit)).map(cloneFrozen))); }
}

class InMemoryWorkflowLifecycleEventRepository {
  public constructor(private readonly state: RepositoryState) {}
  public append(event: WorkflowLifecycleEvent): Promise<void> { if (this.state.workflowLifecycleEvents.has(event.eventId)) throw new RepositoryConflictError("Workflow lifecycle event exists"); this.state.workflowLifecycleEvents.set(event.eventId, cloneFrozen(event)); return Promise.resolve(); }
  public listByRecordId(recordId: string): Promise<readonly WorkflowLifecycleEvent[]> { return Promise.resolve(Object.freeze([...this.state.workflowLifecycleEvents.values()].filter((event) => event.recordId === recordId).map(cloneFrozen))); }
}

class InMemoryTaskRepository implements TaskRepository {
  readonly #state: RepositoryState;

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(taskId: string): Promise<TaskRecord | undefined> {
    return Promise.resolve(cloneOptional(this.#state.tasks.get(taskId)));
  }

  public getByRequestId(
    requestId: string,
  ): Promise<TaskRecord | undefined> {
    const task = [...this.#state.tasks.values()].find(
      (candidate) => candidate.requestId === requestId,
    );
    return Promise.resolve(cloneOptional(task));
  }

  public insert(task: TaskRecord): Promise<void> {
    if (
      task.taskId.trim().length === 0 ||
      task.requestId.trim().length === 0 ||
      !isRfc3339Timestamp(task.createdAt) ||
      !isRfc3339Timestamp(task.updatedAt)
    ) {
      throw new RepositoryValidationError("Task record failed validation", {
        taskId: task.taskId,
      });
    }
    if (this.#state.tasks.has(task.taskId)) {
      throw new RepositoryConflictError("Task ID already exists", {
        taskId: task.taskId,
      });
    }
    if (
      [...this.#state.tasks.values()].some(
        (candidate) => candidate.requestId === task.requestId,
      )
    ) {
      throw new RepositoryConflictError(
        "A task already exists for the request ID",
        { requestId: task.requestId },
      );
    }

    this.#state.tasks.set(task.taskId, cloneFrozen(task));
    return Promise.resolve();
  }

  public update(
    task: TaskRecord,
    expectation: TaskUpdateExpectation,
  ): Promise<void> {
    if (!isRfc3339Timestamp(task.updatedAt)) {
      throw new RepositoryValidationError("Task record failed validation", {
        taskId: task.taskId,
      });
    }
    const existing = this.#state.tasks.get(task.taskId);
    if (existing === undefined) {
      throw new RepositoryConflictError("Task does not exist", {
        taskId: task.taskId,
      });
    }
    if (
      existing.state !== expectation.state ||
      existing.updatedAt !== expectation.updatedAt
    ) {
      throw new RepositoryConflictError(
        "Task changed after it was read",
        {
          actualState: existing.state,
          expectedState: expectation.state,
          taskId: task.taskId,
        },
      );
    }
    if (
      existing.requestId !== task.requestId ||
      existing.correlationId !== task.correlationId ||
      existing.workspaceId !== task.workspaceId ||
      existing.actorId !== task.actorId ||
      existing.createdAt !== task.createdAt
    ) {
      throw new RepositoryConflictError(
        "Task ownership fields cannot be changed",
        { taskId: task.taskId },
      );
    }
    if (!isTaskTransitionAllowed(existing.state, task.state)) {
      throw new RepositoryConflictError(
        "Repository rejected an invalid task transition",
        {
          from: existing.state,
          taskId: task.taskId,
          to: task.state,
        },
      );
    }

    this.#state.tasks.set(task.taskId, cloneFrozen(task));
    return Promise.resolve();
  }
}

class InMemoryRequestRepository implements RequestRepository {
  readonly #state: RepositoryState;
  readonly #responseValidator = new TaskResponseValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(requestId: string): Promise<StoredRequest | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.requests.get(requestId)),
    );
  }

  public insert(request: StoredRequest): Promise<void> {
    if (
      request.requestId.trim().length === 0 ||
      request.taskId.trim().length === 0 ||
      !REQUEST_FINGERPRINT_PATTERN.test(request.requestFingerprint) ||
      !isRfc3339Timestamp(request.createdAt) ||
      !isRfc3339Timestamp(request.updatedAt) ||
      request.response !== undefined
    ) {
      throw new RepositoryValidationError(
        "Stored request failed validation",
        { requestId: request.requestId },
      );
    }
    const existing = this.#state.requests.get(request.requestId);
    if (existing !== undefined) {
      throw new RequestIdConflictError(
        request.requestId,
        existing.taskId,
      );
    }
    if (
      [...this.#state.requests.values()].some(
        (candidate) => candidate.taskId === request.taskId,
      )
    ) {
      throw new RepositoryConflictError(
        "A request already exists for the task ID",
        { taskId: request.taskId },
      );
    }

    this.#state.requests.set(request.requestId, cloneFrozen(request));
    return Promise.resolve();
  }

  public saveResponse(
    requestId: string,
    taskId: string,
    response: TaskResponse,
    updatedAt: string,
  ): Promise<void> {
    const responseValidation = this.#responseValidator.validate(response);
    if (
      !responseValidation.ok ||
      !isRfc3339Timestamp(updatedAt) ||
      response.updatedAt !== updatedAt
    ) {
      throw new RepositoryValidationError(
        "Stored request response failed validation",
        { requestId, taskId },
      );
    }
    const existing = this.#state.requests.get(requestId);
    if (existing === undefined) {
      throw new RepositoryConflictError("Request does not exist", {
        requestId,
      });
    }
    if (
      existing.taskId !== taskId ||
      response.taskId !== taskId ||
      response.requestId !== requestId
    ) {
      throw new RepositoryConflictError(
        "Response ownership does not match the stored request",
        { requestId, taskId },
      );
    }
    if (existing.response !== undefined) {
      throw new RepositoryConflictError(
        "Request response is already stored",
        { requestId, taskId },
      );
    }

    this.#state.requests.set(
      requestId,
      cloneFrozen({
        ...existing,
        response: responseValidation.value,
        updatedAt,
      }),
    );
    return Promise.resolve();
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly #state: RepositoryState;
  readonly #validator = new AuditEventValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public append(event: AuditEvent): Promise<void> {
    const validation = this.#validator.validate(event);
    if (!validation.ok) {
      throw new RepositoryValidationError(
        "Audit event failed validation",
        {
          eventId: event.eventId,
          issues: validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        },
      );
    }
    if (this.#state.audits.has(event.eventId)) {
      throw new RepositoryConflictError("Audit event ID already exists", {
        eventId: event.eventId,
      });
    }

    this.#state.audits.set(event.eventId, cloneFrozen(validation.value));
    return Promise.resolve();
  }

  public listByCorrelationId(
    correlationId: string,
  ): Promise<readonly AuditEvent[]> {
    const events = [...this.#state.audits.values()]
      .filter((event) => event.correlationId === correlationId)
      .map((event) => cloneFrozen(event));
    return Promise.resolve(Object.freeze(events));
  }
  public listByWorkspaceAndCorrelationId(workspaceId: string, correlationId: string, limit: number): Promise<readonly AuditEvent[]> { return Promise.resolve(Object.freeze([...this.#state.audits.values()].filter((event) => event.workspaceId === workspaceId && event.correlationId === correlationId).slice(-limit).reverse().map(cloneFrozen))); }
}

class InMemoryWorkflowDefinitionRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowDefinitionValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(
    definitionId: string,
  ): Promise<WorkflowDefinition | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.workflowDefinitions.get(definitionId)),
    );
  }

  public insert(definition: WorkflowDefinition): Promise<void> {
    const validation = this.#validator.validate(definition);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow definition failed validation");
    }
    if (this.#state.workflowDefinitions.has(validation.value.definitionId)) {
      throw new RepositoryConflictError("Workflow definition ID already exists", {
        definitionId: validation.value.definitionId,
      });
    }
    if (
      [...this.#state.workflowDefinitions.values()].some(
        (candidate) =>
          candidate.workflowId === validation.value.workflowId &&
          candidate.workflowVersion === validation.value.workflowVersion,
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow identity and version already exist",
        { definitionId: validation.value.definitionId },
      );
    }
    this.#state.workflowDefinitions.set(
      validation.value.definitionId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }
}

class InMemoryWorkflowInstanceRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowInstanceValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(
    instanceId: string,
  ): Promise<WorkflowInstance | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.workflowInstances.get(instanceId)),
    );
  }

  public insert(instance: WorkflowInstance): Promise<void> {
    const validation = this.#validator.validate(instance);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow instance failed validation");
    }
    if (this.#state.workflowInstances.has(validation.value.instanceId)) {
      throw new RepositoryConflictError("Workflow instance ID already exists", {
        instanceId: validation.value.instanceId,
      });
    }
    if (
      validation.value.version !== 0 ||
      validation.value.receipts.length !== 0
    ) {
      throw new RepositoryValidationError(
        "A new workflow instance cannot contain processed commands",
      );
    }
    this.#state.workflowInstances.set(
      validation.value.instanceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }

  public update(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
  ): Promise<void> {
    return this.#update(instance, expectation);
  }

  public retry(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
    authorizationId: string,
  ): Promise<void> {
    const authorization = this.#state.workflowLifecycleRecords.get(authorizationId);
    if (
      authorization?.kind !== "RETRY_AUTHORIZATION" ||
      authorization.retryDecision !== "AUTHORIZED" ||
      authorization.instanceId !== instance.instanceId ||
      authorization.instanceVersion !== expectation.version ||
      instance.steps.find(({ stepId }) => stepId === authorization.stepId)?.status !== "READY"
    ) {
      throw new RepositoryConflictError("Workflow retry authorization is missing or invalid");
    }
    const records = [...this.#state.workflowLifecycleRecords.values()].filter((entry) => entry.instanceId === instance.instanceId && entry.stepId === authorization.stepId);
    const latestFailure = records.filter(({ kind }) => kind === "FAILURE").at(-1);
    const latestAuthorization = records.filter(({ kind, failureId }) => kind === "RETRY_AUTHORIZATION" && failureId === authorization.failureId).at(-1);
    if (latestFailure?.recordId !== authorization.failureId || latestAuthorization?.recordId !== authorizationId || records.some(({ kind, authorizationId: consumedId }) => kind === "RETRY_EXECUTION" && consumedId === authorizationId)) throw new RepositoryConflictError("Workflow retry authorization is stale or consumed");
    return this.#update(instance, expectation, authorization.stepId);
  }

  public control(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
    controlId: string,
  ): Promise<void> {
    const control = this.#state.workflowLifecycleRecords.get(controlId);
    if (control === undefined || !["CANCELLATION", "PAUSE", "RESUME"].includes(control.kind) || control.instanceId !== instance.instanceId || control.instanceVersion !== instance.version) {
      throw new RepositoryConflictError("Workflow control evidence is missing or invalid");
    }
    return this.#update(instance, expectation, undefined, control.kind as "CANCELLATION" | "PAUSE" | "RESUME");
  }

  #update(
    instance: WorkflowInstance,
    expectation: { readonly version: number },
    retryStepId?: string,
    controlKind?: "CANCELLATION" | "PAUSE" | "RESUME",
  ): Promise<void> {
    const validation = this.#validator.validate(instance);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow instance failed validation");
    }
    const existing = this.#state.workflowInstances.get(
      validation.value.instanceId,
    );
    if (existing?.version !== expectation.version) {
      throw new RepositoryConflictError("Workflow version changed after read", {
        instanceId: validation.value.instanceId,
      });
    }
    if (validation.value.version !== expectation.version + 1) {
      throw new RepositoryConflictError(
        "Workflow version must increment exactly once",
        { instanceId: validation.value.instanceId },
      );
    }
    if (
      existing.definitionId !== validation.value.definitionId ||
      existing.createdAt !== validation.value.createdAt
    ) {
      throw new RepositoryConflictError(
        "Workflow instance identity fields cannot be changed",
        { instanceId: validation.value.instanceId },
      );
    }
    assertAllowedWorkflowInstanceTransition(existing, validation.value, retryStepId, controlKind);
    this.#state.workflowInstances.set(
      validation.value.instanceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }
}

function assertAllowedWorkflowInstanceTransition(
  previous: WorkflowInstance,
  next: WorkflowInstance,
  retryStepId?: string,
  controlKind?: "CANCELLATION" | "PAUSE" | "RESUME",
): void {
  const recoverySteps = previous.steps.filter((step, index) => step.status === "FAILED" && next.steps[index]?.status === "READY");
  const isRecovery = previous.status === "FAILED" && next.status === "ACTIVE";
  if ((isRecovery || recoverySteps.length > 0) && retryStepId === undefined) {
    throw new RepositoryConflictError(
      "Workflow recovery requires an explicit retry authorization",
      { instanceId: next.instanceId },
    );
  }
  if (
    retryStepId !== undefined &&
    (!isRecovery || recoverySteps.length !== 1 || recoverySteps[0]?.stepId !== retryStepId ||
      previous.steps.some((step, index) => step.stepId !== retryStepId && JSON.stringify(step) !== JSON.stringify(next.steps[index])))
  ) {
    throw new RepositoryConflictError("Workflow retry recovery delta is invalid", {
      instanceId: next.instanceId,
      stepId: retryStepId,
    });
  }
  const expectedControl = previous.status === "ACTIVE" && next.status === "PAUSED" ? "PAUSE" : previous.status === "PAUSED" && next.status === "ACTIVE" ? "RESUME" : (previous.status === "ACTIVE" || previous.status === "PAUSED") && next.status === "CANCELLED" ? "CANCELLATION" : undefined;
  if (expectedControl !== undefined && controlKind !== expectedControl) {
    throw new RepositoryConflictError("Workflow lifecycle control requires exact operator evidence", { instanceId: next.instanceId });
  }
  if (controlKind !== undefined && expectedControl !== controlKind) {
    throw new RepositoryConflictError("Workflow control transition does not match its evidence", { instanceId: next.instanceId });
  }
  if (
    previous.status !== next.status &&
    !isWorkflowTransitionAllowed(previous.status, next.status)
  ) {
    throw new RepositoryConflictError(
      "Repository rejected an invalid workflow transition",
      { instanceId: next.instanceId },
    );
  }
  if (previous.steps.length !== next.steps.length) {
    throw new RepositoryConflictError(
      "Workflow instance step identities cannot change",
      { instanceId: next.instanceId },
    );
  }
  for (const [index, previousStep] of previous.steps.entries()) {
    const nextStep = next.steps[index];
    if (nextStep?.stepId !== previousStep.stepId) {
      throw new RepositoryConflictError(
        "Workflow instance step identities cannot change",
        { instanceId: next.instanceId },
      );
    }
    if (
      previousStep.status !== nextStep.status &&
      !isWorkflowStepTransitionAllowed(
        previousStep.status,
        nextStep.status,
      )
    ) {
      throw new RepositoryConflictError(
        "Repository rejected an invalid workflow step transition",
        { instanceId: next.instanceId, stepId: nextStep.stepId },
      );
    }
  }
}

class InMemoryWorkflowCommandReceiptRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowCommandReceiptValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getByInstanceIdAndCommandId(
    instanceId: string,
    commandId: string,
  ): Promise<WorkflowCommandReceipt | undefined> {
    return Promise.resolve(
      cloneOptional(this.#state.workflowCommandReceipts.get(receiptKey(instanceId, commandId))),
    );
  }

  public insert(
    instanceId: string,
    receipt: WorkflowCommandReceipt,
  ): Promise<void> {
    const validation = this.#validator.validate(receipt);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow receipt failed validation");
    }
    const key = receiptKey(instanceId, validation.value.commandId);
    if (this.#state.workflowCommandReceipts.has(key)) {
      throw new RepositoryConflictError("Workflow command receipt already exists", {
        commandId: validation.value.commandId,
        instanceId,
      });
    }
    const instance = this.#state.workflowInstances.get(instanceId);
    if (
      instance?.version !== validation.value.resultingVersion ||
      !instance.receipts.some(
        (candidate) =>
          candidate.commandId === validation.value.commandId &&
          candidate.fingerprint === validation.value.fingerprint &&
          candidate.resultingVersion === validation.value.resultingVersion,
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow receipt does not match the current workflow instance",
        { instanceId },
      );
    }
    const sameVersion = [...this.#state.workflowCommandReceipts.entries()].some(
      ([existingKey, existing]) =>
        existingKey.startsWith(`${instanceId}\u0000`) &&
        existing.resultingVersion === validation.value.resultingVersion,
    );
    if (sameVersion) {
      throw new RepositoryConflictError("Workflow receipt version already exists", {
        instanceId,
      });
    }
    this.#state.workflowCommandReceipts.set(key, cloneFrozen(validation.value));
    return Promise.resolve();
  }

  public listByInstanceId(
    instanceId: string,
  ): Promise<readonly WorkflowCommandReceipt[]> {
    return Promise.resolve(
      Object.freeze(
        [...this.#state.workflowCommandReceipts.entries()]
          .filter(([key]) => key.startsWith(`${instanceId}\u0000`))
          .map(([, receipt]) => cloneFrozen(receipt))
          .sort(
            (left, right) =>
              left.resultingVersion - right.resultingVersion ||
              left.commandId.localeCompare(right.commandId),
          ),
      ),
    );
  }
}

class InMemoryWorkflowEventRepository {
  readonly #draftValidator = new WorkflowEventDraftValidator();
  readonly #eventValidator = new WorkflowEventValidator();
  readonly #state: RepositoryState;

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public append(draft: WorkflowEventDraft): Promise<WorkflowEvent> {
    const validation = this.#draftValidator.validate(draft);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow event draft failed validation");
    }
    if (this.#state.workflowEvents.has(validation.value.eventId)) {
      throw new RepositoryConflictError("Workflow event ID already exists", {
        eventId: validation.value.eventId,
      });
    }
    if (
      [...this.#state.workflowEvents.values()].some(
        (event) =>
          event.instanceId === validation.value.instanceId &&
          event.commandId === validation.value.commandId,
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow command event already exists",
        {
          commandId: validation.value.commandId,
          instanceId: validation.value.instanceId,
        },
      );
    }
    const instance = this.#state.workflowInstances.get(
      validation.value.instanceId,
    );
    if (
      instance?.definitionId !== validation.value.definitionId ||
      instance.version !== validation.value.instanceVersion ||
      !instance.receipts.some(
        (receipt) =>
          receipt.commandId === validation.value.commandId &&
          receipt.resultingVersion === validation.value.instanceVersion,
      ) ||
      !this.#state.workflowCommandReceipts.has(
        receiptKey(
          validation.value.instanceId,
          validation.value.commandId,
        ),
      )
    ) {
      throw new RepositoryConflictError(
        "Workflow event does not match the current workflow instance",
        { instanceId: validation.value.instanceId },
      );
    }
    this.#state.workflowEventSequence += 1;
    const eventValidation = this.#eventValidator.validate({
      ...validation.value,
      sequence: this.#state.workflowEventSequence,
    });
    if (!eventValidation.ok) {
      throw new RepositoryValidationError("Workflow event failed validation");
    }
    const event = cloneFrozen(eventValidation.value);
    this.#state.workflowEvents.set(event.eventId, event);
    return Promise.resolve(cloneFrozen(event));
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryValidationError("Workflow event list limit is invalid");
    }
    return Promise.resolve(
      Object.freeze(
        [...this.#state.workflowEvents.values()]
          .filter((event) => event.instanceId === instanceId)
          .sort((left, right) => left.sequence - right.sequence)
          .slice(0, limit)
          .map((event) => cloneFrozen(event)),
      ),
    );
  }
}

class InMemoryWorkflowApprovalCheckpointRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowApprovalCheckpointValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(evidenceId: string): Promise<WorkflowApprovalCheckpoint | undefined> {
    return Promise.resolve(cloneOptional(this.#state.workflowApprovalCheckpoints.get(evidenceId)));
  }

  public insert(checkpoint: WorkflowApprovalCheckpoint): Promise<void> {
    const validation = this.#validator.validate(checkpoint);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow approval checkpoint failed validation");
    }
    if (this.#state.workflowApprovalCheckpoints.has(validation.value.evidenceId)) {
      throw new RepositoryConflictError("Workflow approval checkpoint ID already exists");
    }
    if (!this.#state.workflowInstances.has(validation.value.instanceId)) {
      throw new RepositoryConflictError("Workflow instance does not exist");
    }
    this.#state.workflowApprovalCheckpoints.set(
      validation.value.evidenceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }

  public listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowApprovalCheckpoint[]> {
    return Promise.resolve(Object.freeze(
      [...this.#state.workflowApprovalCheckpoints.values()]
        .filter((entry) => entry.instanceId === instanceId && entry.instanceVersion === instanceVersion && entry.stepId === stepId)
        .map((entry) => cloneFrozen(entry)),
    ));
  }
}

class InMemoryWorkflowGuardianCheckpointRepository {
  readonly #state: RepositoryState;
  readonly #validator = new WorkflowGuardianCheckpointValidator();

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public getById(evidenceId: string): Promise<WorkflowGuardianCheckpoint | undefined> {
    return Promise.resolve(cloneOptional(this.#state.workflowGuardianCheckpoints.get(evidenceId)));
  }

  public insert(checkpoint: WorkflowGuardianCheckpoint): Promise<void> {
    const validation = this.#validator.validate(checkpoint);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow Guardian checkpoint failed validation");
    }
    if (this.#state.workflowGuardianCheckpoints.has(validation.value.evidenceId)) {
      throw new RepositoryConflictError("Workflow Guardian checkpoint ID already exists");
    }
    if (!this.#state.workflowInstances.has(validation.value.instanceId)) {
      throw new RepositoryConflictError("Workflow instance does not exist");
    }
    this.#state.workflowGuardianCheckpoints.set(
      validation.value.evidenceId,
      cloneFrozen(validation.value),
    );
    return Promise.resolve();
  }

  public listBySnapshot(
    instanceId: string,
    instanceVersion: number,
    stepId: string,
  ): Promise<readonly WorkflowGuardianCheckpoint[]> {
    return Promise.resolve(Object.freeze(
      [...this.#state.workflowGuardianCheckpoints.values()]
        .filter((entry) => entry.instanceId === instanceId && entry.instanceVersion === instanceVersion && entry.stepId === stepId)
        .map((entry) => cloneFrozen(entry)),
    ));
  }
}

class InMemoryWorkflowControlCheckpointEventRepository {
  readonly #draftValidator = new WorkflowControlCheckpointEventDraftValidator();
  readonly #eventValidator = new WorkflowControlCheckpointEventValidator();
  readonly #state: RepositoryState;

  public constructor(state: RepositoryState) {
    this.#state = state;
  }

  public append(draft: WorkflowControlCheckpointEventDraft): Promise<WorkflowControlCheckpointEvent> {
    const validation = this.#draftValidator.validate(draft);
    if (!validation.ok) {
      throw new RepositoryValidationError("Workflow control checkpoint event failed validation");
    }
    if (
      this.#state.workflowControlCheckpointEvents.has(validation.value.eventId) ||
      [...this.#state.workflowControlCheckpointEvents.values()].some(
        (event) => event.checkpointKind === validation.value.checkpointKind && event.checkpointId === validation.value.checkpointId,
      )
    ) {
      throw new RepositoryConflictError("Workflow control checkpoint event already exists");
    }
    const exists = validation.value.checkpointKind === "APPROVAL"
      ? this.#state.workflowApprovalCheckpoints.has(validation.value.checkpointId)
      : this.#state.workflowGuardianCheckpoints.has(validation.value.checkpointId);
    if (!exists) {
      throw new RepositoryConflictError("Workflow control checkpoint does not exist");
    }
    this.#state.workflowControlCheckpointEventSequence += 1;
    const event = this.#eventValidator.validate({
      ...validation.value,
      sequence: this.#state.workflowControlCheckpointEventSequence,
    });
    if (!event.ok) {
      throw new RepositoryValidationError("Workflow control checkpoint event failed validation");
    }
    this.#state.workflowControlCheckpointEvents.set(event.value.eventId, cloneFrozen(event.value));
    return Promise.resolve(cloneFrozen(event.value));
  }

  public getByCheckpoint(
    checkpointKind: WorkflowControlCheckpointEvent["checkpointKind"],
    checkpointId: string,
  ): Promise<WorkflowControlCheckpointEvent | undefined> {
    return Promise.resolve(cloneOptional(
      [...this.#state.workflowControlCheckpointEvents.values()].find(
        (event) => event.checkpointKind === checkpointKind && event.checkpointId === checkpointId,
      ),
    ));
  }

  public listByInstanceId(
    instanceId: string,
    limit: number,
  ): Promise<readonly WorkflowControlCheckpointEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryValidationError("Workflow control checkpoint event limit is invalid");
    }
    return Promise.resolve(Object.freeze(
      [...this.#state.workflowControlCheckpointEvents.values()]
        .filter((event) => event.instanceId === instanceId)
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, limit)
        .map((event) => cloneFrozen(event)),
    ));
  }
}

class InMemoryOperationalEventRepository implements OperationalEventRepository {
  readonly #draftValidator = new OperationalEventDraftValidator();
  readonly #eventValidator = new OperationalEventValidator();
  public constructor(private readonly state: RepositoryState) {}

  public append(draft: OperationalEventDraft): Promise<OperationalEvent> {
    const checked = this.#draftValidator.validate(draft);
    if (!checked.ok) throw new RepositoryValidationError("Operational event draft is invalid");
    if (this.state.operationalEvents.has(checked.value.eventId)) throw new RepositoryConflictError("Operational event already exists");
    this.state.operationalEventSequence += 1;
    const event = this.#eventValidator.validate({ ...checked.value, sequence: this.state.operationalEventSequence });
    if (!event.ok) throw new RepositoryValidationError("Operational event is invalid");
    this.state.operationalEvents.set(event.value.eventId, cloneFrozen(event.value));
    return Promise.resolve(cloneFrozen(event.value));
  }

  public cursorWindow(workspaceId: string): Promise<{ readonly latestSequence: number; readonly oldestSequence?: number }> {
    const events = [...this.state.operationalEvents.values()].filter((event) => event.workspaceId === workspaceId).sort((left, right) => left.sequence - right.sequence);
    return Promise.resolve(Object.freeze({ latestSequence: events.at(-1)?.sequence ?? 0, ...(events[0] === undefined ? {} : { oldestSequence: events[0].sequence }) }));
  }

  public getLatestByType(workspaceId: string, eventType: OperationalEvent["eventType"]): Promise<OperationalEvent | undefined> {
    const event = [...this.state.operationalEvents.values()]
      .filter((candidate) => candidate.workspaceId === workspaceId && candidate.eventType === eventType)
      .sort((left, right) => right.sequence - left.sequence)[0];
    return Promise.resolve(cloneOptional(event));
  }

  public listAfter(workspaceId: string, afterSequence: number, limit: number): Promise<readonly OperationalEvent[]> {
    memoryLimit(limit, 1_000);
    return Promise.resolve(Object.freeze([...this.state.operationalEvents.values()].filter((event) => event.workspaceId === workspaceId && event.sequence > afterSequence).sort((left, right) => left.sequence - right.sequence).slice(0, limit).map(cloneFrozen)));
  }

  public pruneBefore(workspaceId: string, beforeSequence: number, limit: number): Promise<number> {
    memoryLimit(limit, 1_000);
    const selected = [...this.state.operationalEvents.values()].filter((event) => event.workspaceId === workspaceId && event.sequence < beforeSequence).sort((left, right) => left.sequence - right.sequence).slice(0, limit);
    for (const event of selected) this.state.operationalEvents.delete(event.eventId);
    return Promise.resolve(selected.length);
  }
}

class InMemoryOperationsRuntimeRepository implements OperationsRuntimeRepository {
  readonly #attemptValidator = new OperationsJobAttemptValidator();
  readonly #controlValidator = new OperationsRuntimeControlValidator();
  readonly #jobValidator = new OperationsJobValidator();
  readonly #leaseValidator = new OperationsProcessLeaseValidator();
  readonly #scheduleValidator = new OperationsScheduleValidator();
  public constructor(private readonly state: RepositoryState) {}

  public claimNextDue(input: { readonly fencingToken: number; readonly leaseId: string; readonly now: string; readonly workerId: string; readonly workspaceId: string }): Promise<OperationsJob | undefined> {
    const current = [...this.state.operationsJobs.values()].filter((job) => job.workspaceId === input.workspaceId && ["QUEUED", "RETRY_SCHEDULED"].includes(job.status) && job.runAfter <= input.now).sort((left, right) => right.priority - left.priority || left.runAfter.localeCompare(right.runAfter) || left.jobId.localeCompare(right.jobId))[0];
    if (current === undefined) return Promise.resolve(undefined);
    const lease = { acquiredAt: input.now, expiresAt: new Date(Date.parse(input.now) + current.leaseDurationMs).toISOString(), fencingToken: input.fencingToken, heartbeatAt: input.now, leaseId: input.leaseId, workerId: input.workerId };
    const next = this.#job({ ...memoryJobWithoutRuntime(current), attempt: current.attempt + 1, lease, status: "RUNNING", updatedAt: input.now, version: current.version + 1 });
    this.state.operationsJobs.set(next.jobId, cloneFrozen(next));
    return Promise.resolve(cloneFrozen(next));
  }

  public deleteProcessLease(input: { readonly fencingToken: number; readonly instanceId: string; readonly leaseKey: string; readonly version: number; readonly workspaceId: string }): Promise<void> {
    const key = processLeaseKey(input.workspaceId, input.leaseKey);
    const current = this.state.operationsProcessLeases.get(key);
    if (current?.instanceId !== input.instanceId || current.fencingToken !== input.fencingToken || current.version !== input.version) throw new RepositoryConflictError("Operations process lease changed before release");
    this.state.operationsProcessLeases.delete(key);
    return Promise.resolve();
  }

  public deleteTerminalJob(jobId: string, expectation: { readonly version: number }): Promise<void> {
    const current = this.state.operationsJobs.get(jobId);
    if (current?.version !== expectation.version || !["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED"].includes(current.status)) throw new RepositoryConflictError("Operations terminal job is not eligible for cleanup");
    const attempts = [...this.state.operationsJobAttempts.values()].filter((attempt) => attempt.jobId === jobId);
    if (attempts.length > 0) {
      const previous = this.state.operationsRuntimeUsageRollups.get(current.workspaceId) ?? Object.freeze({ attempts: 0, costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 });
      this.state.operationsRuntimeUsageRollups.set(current.workspaceId, Object.freeze({ attempts: sum([previous.attempts, attempts.length]), costCents: sum([previous.costCents, ...attempts.map(({ costCents }) => costCents)]), externalEffectsExecuted: false, providerCalls: sum([previous.providerCalls, ...attempts.map(({ providerCalls }) => providerCalls)]), toolCalls: sum([previous.toolCalls, ...attempts.map(({ toolCalls }) => toolCalls)]) }));
      for (const attempt of attempts) this.state.operationsJobAttempts.delete(attempt.attemptId);
    }
    this.state.operationsJobs.delete(jobId);
    return Promise.resolve();
  }

  public getControl(workspaceId: string): Promise<OperationsRuntimeControl | undefined> { return Promise.resolve(cloneOptional(this.state.operationsRuntimeControls.get(workspaceId))); }
  public getJobById(jobId: string): Promise<OperationsJob | undefined> { return Promise.resolve(cloneOptional(this.state.operationsJobs.get(jobId))); }
  public getJobByOperationIdentity(workspaceId: string, operationIdentity: string): Promise<OperationsJob | undefined> { return Promise.resolve(cloneOptional([...this.state.operationsJobs.values()].find((job) => job.workspaceId === workspaceId && job.operationIdentity === operationIdentity))); }
  public getSuccessorByPredecessor(workspaceId: string, predecessorJobId: string): Promise<OperationsJobSuccessor | undefined> { return Promise.resolve(cloneOptional(this.state.operationsJobSuccessors.get(successorKey(workspaceId, predecessorJobId)))); }
  public getProcessLease(workspaceId: string, leaseKey: string): Promise<OperationsProcessLease | undefined> { return Promise.resolve(cloneOptional(this.state.operationsProcessLeases.get(processLeaseKey(workspaceId, leaseKey)))); }
  public getScheduleById(scheduleId: string): Promise<OperationsSchedule | undefined> { return Promise.resolve(cloneOptional(this.state.operationsSchedules.get(scheduleId))); }

  public insertAttempt(attempt: OperationsJobAttempt): Promise<void> { const checked = this.#attempt(attempt); if (this.state.operationsJobAttempts.has(checked.attemptId) || [...this.state.operationsJobAttempts.values()].some((item) => item.jobId === checked.jobId && item.attempt === checked.attempt)) throw new RepositoryConflictError("Operations job attempt already exists"); this.state.operationsJobAttempts.set(checked.attemptId, cloneFrozen(checked)); return Promise.resolve(); }
  public insertJob(job: OperationsJob): Promise<void> { const checked = this.#job(job); const successor = checked.predecessorJobId === undefined ? undefined : Object.freeze({ predecessorJobId: checked.predecessorJobId, successorJobId: checked.jobId, workspaceId: checked.workspaceId }); if (checked.version !== 0 || checked.status !== "QUEUED" || this.state.operationsJobs.has(checked.jobId) || [...this.state.operationsJobs.values()].some((item) => item.workspaceId === checked.workspaceId && item.operationIdentity === checked.operationIdentity) || (successor !== undefined && this.state.operationsJobSuccessors.has(successorKey(successor.workspaceId, successor.predecessorJobId)))) throw new RepositoryConflictError(successor === undefined ? "Operations job already exists" : "Operations predecessor already has a successor"); this.state.operationsJobs.set(checked.jobId, cloneFrozen(checked)); if (successor !== undefined) this.state.operationsJobSuccessors.set(successorKey(successor.workspaceId, successor.predecessorJobId), cloneFrozen(successor)); return Promise.resolve(); }
  public insertProcessLease(lease: OperationsProcessLease): Promise<void> { const checked = this.#lease(lease); const key = processLeaseKey(checked.workspaceId, checked.leaseKey); if (checked.version !== 0 || this.state.operationsProcessLeases.has(key)) throw new RepositoryConflictError("Operations process lease already exists"); this.state.operationsProcessLeases.set(key, cloneFrozen(checked)); return Promise.resolve(); }
  public insertSchedule(schedule: OperationsSchedule): Promise<void> { const checked = this.#schedule(schedule); if (checked.version !== 0 || this.state.operationsSchedules.has(checked.scheduleId)) throw new RepositoryConflictError("Operations schedule already exists"); this.state.operationsSchedules.set(checked.scheduleId, cloneFrozen(checked)); return Promise.resolve(); }

  public listAttempts(jobId: string): Promise<readonly OperationsJobAttempt[]> { return Promise.resolve(Object.freeze([...this.state.operationsJobAttempts.values()].filter((attempt) => attempt.jobId === jobId).sort((left, right) => left.attempt - right.attempt).map(cloneFrozen))); }
  public listDueSchedules(workspaceId: string, now: string, limit: number): Promise<readonly OperationsSchedule[]> { memoryLimit(limit, 100); return Promise.resolve(Object.freeze([...this.state.operationsSchedules.values()].filter((schedule) => schedule.workspaceId === workspaceId && schedule.status === "ENABLED" && schedule.nextRunAt <= now).sort((left, right) => left.nextRunAt.localeCompare(right.nextRunAt) || left.scheduleId.localeCompare(right.scheduleId)).slice(0, limit).map(cloneFrozen))); }
  public listExpiredClaims(workspaceId: string, now: string, limit: number): Promise<readonly OperationsJob[]> { memoryLimit(limit, 100); return Promise.resolve(Object.freeze([...this.state.operationsJobs.values()].filter((job) => job.workspaceId === workspaceId && job.status === "RUNNING" && (job.lease?.expiresAt ?? "") <= now).sort((left, right) => (left.lease?.expiresAt ?? "").localeCompare(right.lease?.expiresAt ?? "") || left.jobId.localeCompare(right.jobId)).slice(0, limit).map(cloneFrozen))); }
  public listJobsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly OperationsJobSummary[]> { memoryLimit(limit, 250); return Promise.resolve(Object.freeze([...this.state.operationsJobs.values()].filter((job) => job.workspaceId === workspaceId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.jobId.localeCompare(right.jobId)).slice(0, limit).map(memoryJobSummary))); }
  public listProcessLeases(workspaceId: string, role: OperationsProcessLease["role"], limit: number): Promise<readonly OperationsProcessLease[]> { memoryLimit(limit, 100); return Promise.resolve(Object.freeze([...this.state.operationsProcessLeases.values()].filter((lease) => lease.workspaceId === workspaceId && lease.role === role).sort((left, right) => left.leaseKey.localeCompare(right.leaseKey)).slice(0, limit).map(cloneFrozen))); }
  public listTerminalBefore(workspaceId: string, before: string, limit: number): Promise<readonly OperationsJob[]> { memoryLimit(limit, 1_000); return Promise.resolve(Object.freeze([...this.state.operationsJobs.values()].filter((job) => job.workspaceId === workspaceId && ["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED"].includes(job.status) && job.updatedAt < before).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.jobId.localeCompare(right.jobId)).slice(0, limit).map(cloneFrozen))); }

  public summarize(workspaceId: string): Promise<{ readonly blocked: number; readonly cancelled: number; readonly completed: number; readonly deadLetter: number; readonly failed: number; readonly queued: number; readonly retryScheduled: number; readonly running: number }> { const jobs = [...this.state.operationsJobs.values()].filter((job) => job.workspaceId === workspaceId); return Promise.resolve(Object.freeze({ blocked: jobs.filter(({ status }) => status === "BLOCKED").length, cancelled: jobs.filter(({ status }) => status === "CANCELLED").length, completed: jobs.filter(({ status }) => status === "COMPLETED").length, deadLetter: jobs.filter(({ status }) => status === "DEAD_LETTER").length, failed: jobs.filter(({ status }) => status === "FAILED").length, queued: jobs.filter(({ status }) => status === "QUEUED").length, retryScheduled: jobs.filter(({ status }) => status === "RETRY_SCHEDULED").length, running: jobs.filter(({ status }) => status === "RUNNING").length })); }
  public summarizeUsage(workspaceId: string): Promise<OperationsRuntimeUsageSummary> { const attempts = [...this.state.operationsJobAttempts.values()].filter((attempt) => attempt.workspaceId === workspaceId); const rollup = this.state.operationsRuntimeUsageRollups.get(workspaceId) ?? Object.freeze({ attempts: 0, costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 }); return Promise.resolve(Object.freeze({ attempts: sum([rollup.attempts, attempts.length]), costCents: sum([rollup.costCents, ...attempts.map(({ costCents }) => costCents)]), externalEffectsExecuted: false, providerCalls: sum([rollup.providerCalls, ...attempts.map(({ providerCalls }) => providerCalls)]), toolCalls: sum([rollup.toolCalls, ...attempts.map(({ toolCalls }) => toolCalls)]) })); }

  public updateControl(control: OperationsRuntimeControl, expectation: { readonly version: number }): Promise<void> { const checked = this.#control(control); const current = this.state.operationsRuntimeControls.get(checked.workspaceId); if ((current?.version ?? 0) !== expectation.version || checked.version !== expectation.version + 1) throw new RepositoryConflictError("Operations runtime control changed after read"); this.state.operationsRuntimeControls.set(checked.workspaceId, cloneFrozen(checked)); return Promise.resolve(); }
  public updateJob(job: OperationsJob, expectation: { readonly version: number }): Promise<void> { const checked = this.#job(job); const current = this.state.operationsJobs.get(checked.jobId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || !memorySameJobIdentity(current, checked) || !isOperationsJobTransitionAllowed(current.status, checked.status) || (checked.status !== "RUNNING" && checked.attempt !== current.attempt) || (current.status === "RUNNING" && checked.status === "RUNNING" && checked.attempt !== current.attempt)) throw new RepositoryConflictError("Operations job transition is invalid"); this.state.operationsJobs.set(checked.jobId, cloneFrozen(checked)); return Promise.resolve(); }
  public updateProcessLease(lease: OperationsProcessLease, expectation: { readonly version: number }): Promise<void> { const checked = this.#lease(lease); const key = processLeaseKey(checked.workspaceId, checked.leaseKey); const current = this.state.operationsProcessLeases.get(key); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.role !== checked.role || checked.fencingToken < current.fencingToken || (checked.instanceId !== current.instanceId && checked.fencingToken <= current.fencingToken)) throw new RepositoryConflictError("Operations process lease transition is invalid"); this.state.operationsProcessLeases.set(key, cloneFrozen(checked)); return Promise.resolve(); }
  public updateSchedule(schedule: OperationsSchedule, expectation: { readonly version: number }): Promise<void> { const checked = this.#schedule(schedule); const current = this.state.operationsSchedules.get(checked.scheduleId); if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || !memorySameScheduleIdentity(current, checked)) throw new RepositoryConflictError("Operations schedule transition is invalid"); this.state.operationsSchedules.set(checked.scheduleId, cloneFrozen(checked)); return Promise.resolve(); }

  #attempt(value: unknown): OperationsJobAttempt { return memoryValidated(value, this.#attemptValidator, "Operations job attempt"); }
  #control(value: unknown): OperationsRuntimeControl { return memoryValidated(value, this.#controlValidator, "Operations runtime control"); }
  #job(value: unknown): OperationsJob { return memoryValidated(value, this.#jobValidator, "Operations job"); }
  #lease(value: unknown): OperationsProcessLease { return memoryValidated(value, this.#leaseValidator, "Operations process lease"); }
  #schedule(value: unknown): OperationsSchedule { return memoryValidated(value, this.#scheduleValidator, "Operations schedule"); }
}

function memoryJobSummary(job: OperationsJob): OperationsJobSummary { return cloneFrozen({ attempt: job.attempt, ...(job.block === undefined ? {} : { blockCode: job.block.code }), ...(job.lastFailure === undefined ? {} : { failureCode: job.lastFailure.code }), jobId: job.jobId, jobType: job.jobType, owner: job.owner, ...(job.predecessorJobId === undefined ? {} : { predecessorJobId: job.predecessorJobId }), priority: job.priority, ...(job.receipt === undefined ? {} : { receipt: { costCents: job.receipt.costCents, externalEffectsExecuted: false as const, outcome: job.receipt.outcome, providerCalls: job.receipt.providerCalls, toolCalls: job.receipt.toolCalls } }), runAfter: job.runAfter, scheduledFor: job.scheduledFor, status: job.status, targetFingerprint: canonicalSha256(job), updatedAt: job.updatedAt, version: job.version }); }
function sum(values: readonly number[]): number { const total = values.reduce((sum_, value) => sum_ + value, 0); if (!Number.isSafeInteger(total) || total < 0) throw new RepositoryValidationError("Operations usage aggregate is invalid"); return total; }

function createState(): RepositoryState {
  return {
    agentCompanyWorkdays: new Map(),
    authorizedResearchMissions: new Map(),
    authorizedResearchSnapshots: new Map(),
    audits: new Map(),
    businessMissions: new Map(),
    controlActionProposals: new Map(),
    controlActionReceipts: new Map(),
    dailyOperatingBriefs: new Map(),
    founderWorkdays: new Map(),
    operationsIncidents: new Map(),
    productionControls: new Map(),
    requests: new Map(),
    tasks: new Map(),
    workflowCommandReceipts: new Map(),
    workflowApprovalCheckpoints: new Map(),
    workflowControlCheckpointEvents: new Map(),
    workflowControlCheckpointEventSequence: 0,
    workflowDefinitions: new Map(),
    workflowEventSequence: 0,
    workflowEvents: new Map(),
    workflowInstances: new Map(),
    workflowGuardianCheckpoints: new Map(),
    workflowAgentInvocations: new Map(),
    workflowAgentInvocationEvents: new Map(),
    workflowStepOutcomes: new Map(),
    workflowLifecycleRecords: new Map(),
    workflowLifecycleEvents: new Map(),
    localWorkflowCommands: new Map(),
    localWorkflowOwnership: new Map(),
    metodoVeloceContentProductions: new Map(),
    productionRuntimeJobs: new Map(),
    sources: new Map(),
    evidenceRecords: new Map(),
    evidencePacks: new Map(),
    publicationPlans: new Map(),
    publicationKillSwitches: new Map(),
    feedbackMetricSnapshots: new Map(),
    socialLiveRecords: new Map(),
    operationalEvents: new Map(),
    operationalEventSequence: 0,
    operationsJobs: new Map(),
    operationsJobAttempts: new Map(),
    operationsJobSuccessors: new Map(),
    operationsRuntimeUsageRollups: new Map(),
    operationsProcessLeases: new Map(),
    operationsRuntimeControls: new Map(),
    operationsSchedules: new Map(),
  };
}

function cloneState(state: RepositoryState): RepositoryState {
  return {
    agentCompanyWorkdays: new Map([...state.agentCompanyWorkdays].map(([key, value]) => [key, cloneFrozen(value)])),
    authorizedResearchMissions: new Map([...state.authorizedResearchMissions].map(([key, value]) => [key, cloneFrozen(value)])),
    authorizedResearchSnapshots: new Map([...state.authorizedResearchSnapshots].map(([key, value]) => [key, cloneFrozen(value)])),
    audits: new Map(
      [...state.audits].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    businessMissions: new Map([...state.businessMissions].map(([key, value]) => [key, cloneFrozen(value)])),
    controlActionProposals: new Map([...state.controlActionProposals].map(([key, value]) => [key, cloneFrozen(value)])),
    controlActionReceipts: new Map([...state.controlActionReceipts].map(([key, value]) => [key, cloneFrozen(value)])),
    dailyOperatingBriefs: new Map([...state.dailyOperatingBriefs].map(([key, value]) => [key, cloneFrozen(value)])),
    founderWorkdays: new Map([...state.founderWorkdays].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsIncidents: new Map([...state.operationsIncidents].map(([key, value]) => [key, cloneFrozen(value)])),
    productionControls: new Map([...state.productionControls].map(([key, value]) => [key, cloneFrozen(value)])),
    requests: new Map(
      [...state.requests].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    tasks: new Map(
      [...state.tasks].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowCommandReceipts: new Map(
      [...state.workflowCommandReceipts].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowApprovalCheckpoints: new Map(
      [...state.workflowApprovalCheckpoints].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowControlCheckpointEvents: new Map(
      [...state.workflowControlCheckpointEvents].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowControlCheckpointEventSequence: state.workflowControlCheckpointEventSequence,
    workflowDefinitions: new Map(
      [...state.workflowDefinitions].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowEventSequence: state.workflowEventSequence,
    workflowEvents: new Map(
      [...state.workflowEvents].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowInstances: new Map(
      [...state.workflowInstances].map(([key, value]) => [
        key,
        cloneFrozen(value),
      ]),
    ),
    workflowGuardianCheckpoints: new Map(
      [...state.workflowGuardianCheckpoints].map(([key, value]) => [key, cloneFrozen(value)]),
    ),
    workflowAgentInvocations: new Map([...state.workflowAgentInvocations].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowAgentInvocationEvents: new Map([...state.workflowAgentInvocationEvents].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowStepOutcomes: new Map([...state.workflowStepOutcomes].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowLifecycleRecords: new Map([...state.workflowLifecycleRecords].map(([key, value]) => [key, cloneFrozen(value)])),
    workflowLifecycleEvents: new Map([...state.workflowLifecycleEvents].map(([key, value]) => [key, cloneFrozen(value)])),
    localWorkflowCommands: new Map([...state.localWorkflowCommands].map(([key, value]) => [key, cloneFrozen(value)])),
    localWorkflowOwnership: new Map([...state.localWorkflowOwnership].map(([key, value]) => [key, cloneFrozen(value)])),
    metodoVeloceContentProductions: new Map([...state.metodoVeloceContentProductions].map(([key, value]) => [key, cloneFrozen(value)])),
    productionRuntimeJobs: new Map([...state.productionRuntimeJobs].map(([key, value]) => [key, cloneFrozen(value)])),
    sources: new Map([...state.sources].map(([key, value]) => [key, cloneFrozen(value)])),
    evidenceRecords: new Map([...state.evidenceRecords].map(([key, value]) => [key, cloneFrozen(value)])),
    evidencePacks: new Map([...state.evidencePacks].map(([key, value]) => [key, cloneFrozen(value)])),
    publicationPlans: new Map([...state.publicationPlans].map(([key, value]) => [key, cloneFrozen(value)])),
    publicationKillSwitches: new Map([...state.publicationKillSwitches].map(([key, value]) => [key, cloneFrozen(value)])),
    feedbackMetricSnapshots: new Map([...state.feedbackMetricSnapshots].map(([key, value]) => [key, cloneFrozen(value)])),
    socialLiveRecords: new Map([...state.socialLiveRecords].map(([key, value]) => [key, cloneFrozen(value)])),
    operationalEvents: new Map([...state.operationalEvents].map(([key, value]) => [key, cloneFrozen(value)])),
    operationalEventSequence: state.operationalEventSequence,
    operationsJobs: new Map([...state.operationsJobs].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsJobAttempts: new Map([...state.operationsJobAttempts].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsJobSuccessors: new Map([...state.operationsJobSuccessors].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsRuntimeUsageRollups: new Map([...state.operationsRuntimeUsageRollups].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsProcessLeases: new Map([...state.operationsProcessLeases].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsRuntimeControls: new Map([...state.operationsRuntimeControls].map(([key, value]) => [key, cloneFrozen(value)])),
    operationsSchedules: new Map([...state.operationsSchedules].map(([key, value]) => [key, cloneFrozen(value)])),
  };
}

function memoryJobWithoutRuntime(job: OperationsJob): Omit<OperationsJob, "block" | "cancellationRequestedAt" | "cancellationRequestedBy" | "lastFailure" | "lease" | "receipt"> { return { actorId: job.actorId, attempt: job.attempt, budget: job.budget, contractVersion: job.contractVersion, createdAt: job.createdAt, heartbeatIntervalMs: job.heartbeatIntervalMs, jobId: job.jobId, jobType: job.jobType, leaseDurationMs: job.leaseDurationMs, operationIdentity: job.operationIdentity, owner: job.owner, payload: job.payload, payloadFingerprint: job.payloadFingerprint, ...(job.predecessorJobId === undefined ? {} : { predecessorJobId: job.predecessorJobId }), priority: job.priority, recoveryStrategy: job.recoveryStrategy, retryPolicy: job.retryPolicy, runAfter: job.runAfter, ...(job.scheduleId === undefined ? {} : { scheduleId: job.scheduleId }), scheduledFor: job.scheduledFor, status: job.status, timeoutMs: job.timeoutMs, updatedAt: job.updatedAt, version: job.version, workspaceId: job.workspaceId }; }
function memorySameJobIdentity(left: OperationsJob, right: OperationsJob): boolean { return left.actorId === right.actorId && left.workspaceId === right.workspaceId && left.createdAt === right.createdAt && left.jobId === right.jobId && left.jobType === right.jobType && left.operationIdentity === right.operationIdentity && left.owner === right.owner && left.payloadFingerprint === right.payloadFingerprint && left.predecessorJobId === right.predecessorJobId && left.scheduleId === right.scheduleId && left.scheduledFor === right.scheduledFor && JSON.stringify(left.payload) === JSON.stringify(right.payload) && JSON.stringify(left.budget) === JSON.stringify(right.budget) && JSON.stringify(left.retryPolicy) === JSON.stringify(right.retryPolicy) && left.timeoutMs === right.timeoutMs && left.leaseDurationMs === right.leaseDurationMs && left.heartbeatIntervalMs === right.heartbeatIntervalMs; }
function memorySameScheduleIdentity(left: OperationsSchedule, right: OperationsSchedule): boolean { return left.actorId === right.actorId && left.workspaceId === right.workspaceId && left.createdAt === right.createdAt && left.scheduleId === right.scheduleId && left.jobType === right.jobType && left.owner === right.owner && left.payloadFingerprint === right.payloadFingerprint && JSON.stringify(left.payload) === JSON.stringify(right.payload) && JSON.stringify(left.budget) === JSON.stringify(right.budget) && JSON.stringify(left.retryPolicy) === JSON.stringify(right.retryPolicy) && JSON.stringify(left.cadence) === JSON.stringify(right.cadence) && left.catchUpPolicy === right.catchUpPolicy && left.priority === right.priority && left.timeoutMs === right.timeoutMs && left.leaseDurationMs === right.leaseDurationMs && left.heartbeatIntervalMs === right.heartbeatIntervalMs; }
function memoryValidated<T>(value: unknown, validator: Validator<T>, label: string): T { const checked = validator.validate(value); if (!checked.ok) throw new RepositoryValidationError(`${label} is invalid`); return checked.value; }
function processLeaseKey(workspaceId: string, leaseKey: string): string { return `${workspaceId}\u0000${leaseKey}`; }
function successorKey(workspaceId: string, predecessorJobId: string): string { return `${workspaceId}\u0000${predecessorJobId}`; }
function memoryLimit(value: number, maximum: number): void { if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RepositoryValidationError("Repository list limit is invalid"); }

function receiptKey(instanceId: string, commandId: string): string {
  return `${instanceId}\u0000${commandId}`;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneFrozen(value);
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
