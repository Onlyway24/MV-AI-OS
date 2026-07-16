import { createHash } from "node:crypto";

import { FounderMissionBriefValidator } from "../missions/founder-mission-brief-validator.js";
import type { LocalMissionPlanningDryRun } from "../missions/local-mission-planning-dry-run.js";
import type { MetodoVeloceContentProductionBrief, MetodoVeloceContentProductionPackage } from "../content-production/metodo-veloce-content-production.js";
import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import type { MetodoVeloceContentProductionRepository } from "../content-production/metodo-veloce-content-production-repository.js";
import { MetodoVeloceContentProductionArchiveRequestValidator, MetodoVeloceContentProductionBriefValidator, MetodoVeloceContentProductionMetricsRequestValidator, MetodoVeloceContentProductionReviewRequestValidator, MetodoVeloceContentProductionScheduleRequestValidator } from "../content-production/metodo-veloce-content-production-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service.js";
import { ProductionRuntimeEnqueueRequestValidator } from "../production-runtime/production-runtime-validator.js";
import { OperationalPlaneService } from "../operational-planes/operational-plane-service.js";
import { EvidencePackRequestValidator, EvidenceRecordRequestValidator, FeedbackMetricImportRequestValidator, PublicationAuthorizationRequestValidator, PublicationDryRunRequestValidator, PublicationKillSwitchRequestValidator, PublicationReceiptRequestValidator, SourceRegistrationRequestValidator } from "../operational-planes/operational-plane-validator.js";
import type { Validator, ValidationResult } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import type { WorkflowControlCheckpointService } from "../workflows/runtime/workflow-control-checkpoint.js";
import type { ControlledWorkflowAgentInvoker } from "../workflows/runtime/workflow-agent-invocation.js";
import type { WorkflowLifecycleService } from "../workflows/runtime/workflow-lifecycle.js";
import type { WorkflowOperatorReportRequest, RepositoryBackedWorkflowOperatorReportService } from "../workflows/runtime/workflow-operator-report.js";
import type { WorkflowReadinessService } from "../workflows/runtime/workflow-readiness.js";
import type { WorkflowStepExecutionBoundary } from "../workflows/runtime/workflow-step-execution-boundary.js";
import type { WorkflowStepOutcomeService } from "../workflows/runtime/workflow-step-outcome.js";
import { WorkflowDefinitionValidator, WorkflowInstanceValidator } from "../workflows/runtime/workflow-runtime-validator.js";
import { BusinessMissionService } from "../business/business-mission-service.js";
import { OPERATIONAL_AGENT_COMPANY_CATALOG } from "../agent-company/operational-agent-company.js";
import { OperationalAgentCompanyService } from "../agent-company/operational-agent-company-service.js";
import { AuthorizedResearchService } from "../research/authorized-research-service.js";
import type { MetodoVeloceSocialIntelligenceRequest } from "../social-intelligence/metodo-veloce-social-intelligence.js";
import { MetodoVeloceSocialIntelligenceRequestValidator } from "../social-intelligence/metodo-veloce-social-intelligence-validator.js";
import { SocialIntelligenceLiveService, createFirstMetodoVeloceExperiment } from "../social-intelligence-live/social-intelligence-live-service.js";
import { ensureInitialSocialSources } from "../social-intelligence-live/social-official-sources.js";
import type { GoogleTrendsLiveAcquisitionService } from "../social-intelligence-live/google-trends-live-acquisition-service.js";
import { parseSocialAnalyticsCsv } from "../social-intelligence-live/social-analytics-csv-adapter.js";
import { authorizeInitialSocialCompetitors, authorizeSocialCompetitorReplacement } from "../social-intelligence-live/social-competitor-authorization.js";
import { parseCompetitorObservationsCsv } from "../social-intelligence-live/social-competitor-observation-csv-adapter.js";
import { parseAudioRightsCsv } from "../social-intelligence-live/social-audio-rights-csv-adapter.js";

export const LOCAL_WORKFLOW_COMMAND_CONTRACT_VERSION = "1" as const;
export const LOCAL_WORKFLOW_OPERATIONS = Object.freeze(["CREATE_MISSION", "PLAN_MISSION", "CREATE_WORKFLOW", "INSPECT_WORKFLOW", "RUN_AUTHORIZED_RESEARCH_MISSION", "INSPECT_AUTHORIZED_RESEARCH_MISSION", "LIST_AUTHORIZED_RESEARCH_MISSIONS", "RUN_AGENT_COMPANY_WORKDAY", "INSPECT_AGENT_COMPANY_WORKDAY", "LIST_AGENT_COMPANY_WORKDAYS", "GET_AGENT_COMPANY_CATALOG", "GET_AGENT_COMPANY_METRICS", "CREATE_BUSINESS_MISSION_DOSSIER", "INSPECT_BUSINESS_MISSION_DOSSIER", "LIST_BUSINESS_MISSION_DOSSIERS", "REVIEW_BUSINESS_MISSION_DOSSIER", "REGISTER_SOCIAL_OFFICIAL_SOURCES", "ACQUIRE_GOOGLE_TRENDS_LIVE", "CLASSIFY_SOCIAL_TREND", "IMPORT_SOCIAL_ANALYTICS_CSV", "AUTHORIZE_SOCIAL_COMPETITOR_SET", "REPLACE_SOCIAL_COMPETITOR", "MATERIALIZE_COMPETITOR_INTELLIGENCE_PACK", "IMPORT_SOCIAL_COMPETITOR_OBSERVATIONS_CSV", "IMPORT_SOCIAL_AUDIO_RIGHTS_CSV", "IMPORT_SOCIAL_LIVE_RECORD", "PREVIEW_SOCIAL_LIVE_BATCH", "IMPORT_SOCIAL_LIVE_BATCH", "GET_SOCIAL_LIVE_REPORT", "CREATE_FIRST_SOCIAL_EXPERIMENT", "PRODUCE_METODO_VELOCE_CONTENT", "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE", "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE_PACK", "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK", "INSPECT_METODO_VELOCE_CONTENT", "REVIEW_METODO_VELOCE_CONTENT", "SCHEDULE_METODO_VELOCE_CONTENT", "RECORD_METODO_VELOCE_CONTENT_METRICS", "ARCHIVE_METODO_VELOCE_CONTENT", "LIST_METODO_VELOCE_CONTENT_QUEUE", "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION", "RUN_PRODUCTION_RUNTIME_ONCE", "GET_PRODUCTION_RUNTIME_HEALTH", "REGISTER_EVIDENCE_SOURCE", "RECORD_EVIDENCE", "CREATE_EVIDENCE_PACK", "INSPECT_EVIDENCE_PACK", "CREATE_PUBLICATION_DRY_RUN", "AUTHORIZE_PUBLICATION_DRY_RUN", "RECORD_PUBLICATION_RECEIPT", "SET_PUBLICATION_KILL_SWITCH", "IMPORT_FEEDBACK_METRICS", "ANALYZE_PUBLICATION_FEEDBACK", "GET_OPERATOR_REPORT", "EVALUATE_READINESS", "GET_NEXT_CANDIDATE", "RECORD_APPROVAL", "RECORD_GUARDIAN", "INVOKE_AGENT", "INSPECT_AGENT_RESULT", "ACCEPT_OUTCOME", "REJECT_OUTCOME", "FAIL_STEP", "INSPECT_RETRY_ELIGIBILITY", "AUTHORIZE_RETRY", "EXECUTE_RETRY", "PAUSE_WORKFLOW", "RESUME_WORKFLOW", "CANCEL_WORKFLOW", "EVALUATE_TIMEOUT", "INSPECT_AUDIT_EVENTS"] as const);
export type LocalWorkflowOperation = typeof LOCAL_WORKFLOW_OPERATIONS[number];
export interface LocalWorkflowCommand { readonly contractVersion: "1"; readonly commandId: string; readonly actorId: string; readonly workspaceId: string; readonly operation: LocalWorkflowOperation; readonly input: Readonly<Record<string, unknown>>; }
export interface LocalWorkflowCommandResponse { readonly contractVersion: "1"; readonly status: "ok"; readonly operation: LocalWorkflowOperation; readonly commandId: string; readonly result: unknown; readonly nextAction: string; readonly replayed: boolean; readonly unauthorizedExternalEffectOccurred: false; }

export interface LocalWorkflowCommandDependencies {
  readonly agentCompany?: OperationalAgentCompanyService;
  readonly actorId: string;
  readonly authorizedResearch?: AuthorizedResearchService;
  readonly businessMissions?: BusinessMissionService;
  readonly clock: Clock;
  readonly googleTrendsLive?: GoogleTrendsLiveAcquisitionService;
  readonly workspaceId: string;
  readonly missionPlanning: LocalMissionPlanningDryRun;
  readonly contentProduction: { produce(candidate: MetodoVeloceContentProductionBrief): MetodoVeloceContentProductionPackage };
  readonly socialContentProduction?: { produce(brief: MetodoVeloceContentProductionBrief, intelligence: MetodoVeloceSocialIntelligenceRequest): MetodoVeloceContentProductionPackage };
  readonly socialIntelligenceLive?: SocialIntelligenceLiveService;
  readonly productionRuntime: ProductionRuntimeService;
  readonly operationalPlanes: OperationalPlaneService;
  readonly readiness: WorkflowReadinessService;
  readonly candidates: WorkflowStepExecutionBoundary;
  readonly controls: WorkflowControlCheckpointService;
  readonly invoker: ControlledWorkflowAgentInvoker;
  readonly outcomes: WorkflowStepOutcomeService;
  readonly lifecycle: WorkflowLifecycleService;
  readonly report: RepositoryBackedWorkflowOperatorReportService;
  readonly repositories: RepositoryTransactionRunner;
}

export class LocalWorkflowCommandValidator implements Validator<LocalWorkflowCommand> {
  public validate(value: unknown): ValidationResult<LocalWorkflowCommand> {
    const serialized = json(value);
    if (!record(value) || Object.keys(value).length !== 6 || value.contractVersion !== "1" || !safeId(value.commandId) || !safeId(value.actorId) || !safeId(value.workspaceId) || !LOCAL_WORKFLOW_OPERATIONS.includes(value.operation as LocalWorkflowOperation) || !record(value.input) || serialized === undefined || serialized.length > 262_144 || prohibited(serialized)) return invalid("Local Workflow command is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as LocalWorkflowCommand)));
  }
}

export class LocalWorkflowCommandResponseValidator implements Validator<LocalWorkflowCommandResponse> {
  public validate(value: unknown): ValidationResult<LocalWorkflowCommandResponse> {
    const serialized = json(value);
    if (
      !record(value) ||
      !keys(value, ["commandId", "contractVersion", "nextAction", "operation", "replayed", "result", "status", "unauthorizedExternalEffectOccurred"]) ||
      value.contractVersion !== "1" ||
      !safeId(value.commandId) ||
      !LOCAL_WORKFLOW_OPERATIONS.includes(value.operation as LocalWorkflowOperation) ||
      value.status !== "ok" ||
      typeof value.nextAction !== "string" ||
      value.nextAction.length < 1 ||
      value.nextAction.length > 1_000 ||
      typeof value.replayed !== "boolean" ||
      value.unauthorizedExternalEffectOccurred !== false ||
      !jsonValue(value.result) ||
      serialized === undefined ||
      serialized.length > 524_288 ||
      prohibited(serialized)
    ) return invalid("Local Workflow command response is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as LocalWorkflowCommandResponse)));
  }
}

export class LocalWorkflowCommandBoundary {
  readonly #validator = new LocalWorkflowCommandValidator();
  readonly #missionValidator = new FounderMissionBriefValidator();
  readonly #contentBriefValidator = new MetodoVeloceContentProductionBriefValidator();
  readonly #contentReviewValidator = new MetodoVeloceContentProductionReviewRequestValidator();
  readonly #contentScheduleValidator = new MetodoVeloceContentProductionScheduleRequestValidator();
  readonly #contentMetricsValidator = new MetodoVeloceContentProductionMetricsRequestValidator();
  readonly #contentArchiveValidator = new MetodoVeloceContentProductionArchiveRequestValidator();
  readonly #socialIntelligenceValidator = new MetodoVeloceSocialIntelligenceRequestValidator();
  readonly #productionRuntimeEnqueueValidator = new ProductionRuntimeEnqueueRequestValidator();
  readonly #sourceRegistrationValidator = new SourceRegistrationRequestValidator();
  readonly #evidenceRecordValidator = new EvidenceRecordRequestValidator();
  readonly #evidencePackValidator = new EvidencePackRequestValidator();
  readonly #publicationDryRunValidator = new PublicationDryRunRequestValidator();
  readonly #publicationAuthorizationValidator = new PublicationAuthorizationRequestValidator();
  readonly #publicationReceiptValidator = new PublicationReceiptRequestValidator();
  readonly #publicationKillSwitchValidator = new PublicationKillSwitchRequestValidator();
  readonly #feedbackMetricImportValidator = new FeedbackMetricImportRequestValidator();
  readonly #definitionValidator = new WorkflowDefinitionValidator();
  readonly #instanceValidator = new WorkflowInstanceValidator();
  public constructor(private readonly dependencies: LocalWorkflowCommandDependencies) {}

  public async execute(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
    const valid = validate(command, this.#validator, "Local Workflow command");
    if (valid.actorId !== this.dependencies.actorId || valid.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Local Workflow command identity is unauthorized");
    if (typeof valid.input.commandId === "string" && valid.input.commandId !== valid.commandId) throw new RepositoryConflictError("Local Workflow command ID does not match the operation request");
    const fingerprint = createHash("sha256").update(JSON.stringify(valid), "utf8").digest("hex");
    const existing = await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.getById(valid.commandId));
    if (existing !== undefined) return replay(existing.fingerprint, fingerprint, existing.response);
    const resourceInstanceId = await this.#resourceInstanceId(valid);
    if (resourceInstanceId !== undefined) await this.#assertOwnership(resourceInstanceId);
    const result = await this.#dispatch(valid);
    const response = validate({ commandId: valid.commandId, contractVersion: "1" as const, nextAction: action(valid.operation, valid.input, result), operation: valid.operation, replayed: false, result, status: "ok" as const, unauthorizedExternalEffectOccurred: false as const }, new LocalWorkflowCommandResponseValidator(), "Local Workflow command response");
    const frozen = freeze(response);
    try { await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.insert({ commandId: valid.commandId, fingerprint, response: frozen })); }
    catch (error) { const raced = await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.getById(valid.commandId)); if (raced === undefined) throw error; return replay(raced.fingerprint, fingerprint, raced.response); }
    return frozen;
  }

  async #dispatch(command: LocalWorkflowCommand): Promise<unknown> {
    const input = command.input;
    switch (command.operation) {
      case "CREATE_MISSION": return validate(input.brief, this.#missionValidator, "Founder Mission Brief");
      case "PLAN_MISSION": return this.dependencies.missionPlanning.run({ brief: validate(input.brief, this.#missionValidator, "Founder Mission Brief"), contractVersion: "1" });
      case "CREATE_WORKFLOW": return this.#createWorkflow(input.definition, input.instance);
      case "INSPECT_WORKFLOW": return this.dependencies.repositories.transaction(async ({ workflows }) => { const instance = await workflows.instances.getById(requiredId(input, "instanceId")); if (instance === undefined) throw new RepositoryConflictError("Inspected Workflow does not exist"); return instance; });
      case "RUN_AUTHORIZED_RESEARCH_MISSION": return this.#authorizedResearch().run(input.mission);
      case "INSPECT_AUTHORIZED_RESEARCH_MISSION": return this.#authorizedResearch().inspect(requiredId(input, "missionId"));
      case "LIST_AUTHORIZED_RESEARCH_MISSIONS": return this.#authorizedResearch().list(requiredLimit(input));
      case "RUN_AGENT_COMPANY_WORKDAY": return this.#agentCompany().run(input.workday);
      case "INSPECT_AGENT_COMPANY_WORKDAY": return this.#agentCompany().inspect(requiredId(input, "workdayId"));
      case "LIST_AGENT_COMPANY_WORKDAYS": return this.#agentCompany().list(requiredLimit(input));
      case "GET_AGENT_COMPANY_CATALOG": if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Agent Company catalog request is invalid"); return OPERATIONAL_AGENT_COMPANY_CATALOG;
      case "GET_AGENT_COMPANY_METRICS": if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Agent Company metrics request is invalid"); return this.#agentCompany().metrics();
      case "CREATE_BUSINESS_MISSION_DOSSIER": return this.#businessMissions().create(input.mission);
      case "INSPECT_BUSINESS_MISSION_DOSSIER": return this.#businessMissions().inspect(requiredId(input, "missionId"));
      case "LIST_BUSINESS_MISSION_DOSSIERS": return this.#businessMissions().list(requiredLimit(input));
      case "REVIEW_BUSINESS_MISSION_DOSSIER": return this.#businessMissions().review(input);
      case "REGISTER_SOCIAL_OFFICIAL_SOURCES": if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Official Social source registration request is invalid"); return ensureInitialSocialSources({ operationalPlanes: this.dependencies.operationalPlanes, repositories: this.dependencies.repositories, workspaceId: this.dependencies.workspaceId });
      case "ACQUIRE_GOOGLE_TRENDS_LIVE": if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Google Trends Live acquisition request is invalid"); return this.#googleTrendsLive().acquire();
      case "CLASSIFY_SOCIAL_TREND": {
        if (!keys(input, ["trend"]) || !record(input.trend) || !keys(input.trend, ["audience", "classificationEvidenceRecordIds", "classificationRationale", "compatibility", "expiresAt", "keyword", "observedAt", "phase", "platform", "recordId", "sourceId", "territory"]) || typeof input.trend.compatibility !== "string" || !["COMPATIBLE", "INCOMPATIBLE"].includes(input.trend.compatibility) || input.trend.phase !== "UNCLASSIFIED") throw new RepositoryValidationError("Social trend compatibility classification request is invalid");
        const classified = this.#socialIntelligenceLive().createRecord({ ...input.trend, classifiedAt: this.dependencies.clock.now().toISOString(), classifiedBy: this.dependencies.actorId, kind: "TREND" });
        return this.#socialIntelligenceLive().importRecord(classified);
      }
      case "IMPORT_SOCIAL_ANALYTICS_CSV": {
        if (!keys(input, ["accountRecordId", "batchId", "csv", "platform"]) || !safeId(input.accountRecordId) || !safeId(input.batchId) || typeof input.csv !== "string" || !["INSTAGRAM", "TIKTOK"].includes(String(input.platform))) throw new RepositoryValidationError("Social analytics CSV import request is invalid");
        const records = parseSocialAnalyticsCsv({ accountRecordId: input.accountRecordId, csv: input.csv, platform: input.platform as "INSTAGRAM" | "TIKTOK", service: this.#socialIntelligenceLive(), sourceId: "social-instagram-insights-export" });
        return this.#socialIntelligenceLive().importBatch({ batchId: input.batchId, records });
      }
      case "AUTHORIZE_SOCIAL_COMPETITOR_SET": return authorizeInitialSocialCompetitors({ actorId: this.dependencies.actorId, request: input.authorization, service: this.#socialIntelligenceLive() });
      case "REPLACE_SOCIAL_COMPETITOR": return authorizeSocialCompetitorReplacement({ actorId: this.dependencies.actorId, request: input.authorization, service: this.#socialIntelligenceLive() });
      case "MATERIALIZE_COMPETITOR_INTELLIGENCE_PACK": {
        if (!keys(input, ["recordId"]) || !safeId(input.recordId)) throw new RepositoryValidationError("Competitor Intelligence Pack materialization request is invalid");
        return this.#socialIntelligenceLive().materializeCompetitorIntelligencePack(input.recordId);
      }
      case "IMPORT_SOCIAL_COMPETITOR_OBSERVATIONS_CSV": {
        if (!keys(input, ["batchId", "csv"]) || !safeId(input.batchId) || typeof input.csv !== "string") throw new RepositoryValidationError("Social competitor observation CSV import request is invalid");
        const records = parseCompetitorObservationsCsv({ csv: input.csv, service: this.#socialIntelligenceLive(), sourceId: "social-instagram-public-competitors" });
        return this.#socialIntelligenceLive().importBatch({ batchId: input.batchId, records });
      }
      case "IMPORT_SOCIAL_AUDIO_RIGHTS_CSV": {
        if (!keys(input, ["batchId", "csv"]) || !safeId(input.batchId) || typeof input.csv !== "string") throw new RepositoryValidationError("Social audio rights CSV import request is invalid");
        const records = parseAudioRightsCsv({ csv: input.csv, service: this.#socialIntelligenceLive(), sourceId: "social-tiktok-commercial-music-library" });
        return this.#socialIntelligenceLive().importBatch({ batchId: input.batchId, records });
      }
      case "IMPORT_SOCIAL_LIVE_RECORD": return this.#socialIntelligenceLive().importRecord(input.record);
      case "PREVIEW_SOCIAL_LIVE_BATCH": return this.#socialIntelligenceLive().previewBatch(input.batch);
      case "IMPORT_SOCIAL_LIVE_BATCH": return this.#socialIntelligenceLive().importBatch(input.batch);
      case "GET_SOCIAL_LIVE_REPORT": if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Social Intelligence Live report request is invalid"); return this.#socialIntelligenceLive().report();
      case "CREATE_FIRST_SOCIAL_EXPERIMENT": { const experiment = createFirstMetodoVeloceExperiment(this.#socialIntelligenceLive(), { experimentId: requiredId(input, "experimentId"), ...(typeof input.eveningPublicationAt === "string" ? { eveningPublicationAt: input.eveningPublicationAt } : {}), ...(typeof input.lunchPublicationAt === "string" ? { lunchPublicationAt: input.lunchPublicationAt } : {}) }); return this.#socialIntelligenceLive().importRecord(experiment); }
      case "PRODUCE_METODO_VELOCE_CONTENT": return this.#produceContentProduction(input.brief);
      case "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE": return this.#produceContentProductionFromEvidence(input);
      case "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE_PACK": return this.#produceContentProductionFromEvidencePack(input);
      case "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK": return this.#produceSocialContentProductionFromEvidencePack(input);
      case "INSPECT_METODO_VELOCE_CONTENT": return this.#inspectContentProduction(requiredId(input, "productionId"));
      case "REVIEW_METODO_VELOCE_CONTENT": return this.#reviewContentProduction(input);
      case "SCHEDULE_METODO_VELOCE_CONTENT": return this.#scheduleContentProduction(input);
      case "RECORD_METODO_VELOCE_CONTENT_METRICS": return this.#recordContentProductionMetrics(input);
      case "ARCHIVE_METODO_VELOCE_CONTENT": return this.#archiveContentProduction(input);
      case "LIST_METODO_VELOCE_CONTENT_QUEUE": return this.#listContentProductionQueue(input);
      case "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION": return this.#enqueueContentProductionRuntime(input);
      case "RUN_PRODUCTION_RUNTIME_ONCE": return this.#runProductionRuntimeOnce(input);
      case "GET_PRODUCTION_RUNTIME_HEALTH": return this.#productionRuntimeHealth(input);
      case "REGISTER_EVIDENCE_SOURCE": return this.dependencies.operationalPlanes.registerSource(validate(input, this.#sourceRegistrationValidator, "Evidence source registration request"));
      case "RECORD_EVIDENCE": return this.dependencies.operationalPlanes.recordEvidence(validate(input, this.#evidenceRecordValidator, "Evidence record request"));
      case "CREATE_EVIDENCE_PACK": return this.dependencies.operationalPlanes.createEvidencePack(validate(input, this.#evidencePackValidator, "Evidence Pack request"));
      case "INSPECT_EVIDENCE_PACK": if (!keys(input, ["packId"])) throw new RepositoryValidationError("Evidence Pack inspection request is invalid"); return this.dependencies.operationalPlanes.inspectEvidencePack(requiredId(input, "packId"));
      case "CREATE_PUBLICATION_DRY_RUN": return this.dependencies.operationalPlanes.createPublicationDryRun(validate(input, this.#publicationDryRunValidator, "Publication dry-run request"));
      case "AUTHORIZE_PUBLICATION_DRY_RUN": return this.dependencies.operationalPlanes.authorizePublication(validate(input, this.#publicationAuthorizationValidator, "Publication authorization request"));
      case "RECORD_PUBLICATION_RECEIPT": return this.dependencies.operationalPlanes.recordPublicationReceipt(validate(input, this.#publicationReceiptValidator, "Publication receipt request"));
      case "SET_PUBLICATION_KILL_SWITCH": return this.dependencies.operationalPlanes.setPublicationKillSwitch(validate(input, this.#publicationKillSwitchValidator, "Publication kill-switch request"));
      case "IMPORT_FEEDBACK_METRICS": return this.dependencies.operationalPlanes.importFeedbackMetrics(validate(input, this.#feedbackMetricImportValidator, "Feedback metric import request"));
      case "ANALYZE_PUBLICATION_FEEDBACK": if (!keys(input, ["publicationId"])) throw new RepositoryValidationError("Publication feedback analysis request is invalid"); return this.dependencies.operationalPlanes.analyzeFeedback(requiredId(input, "publicationId"));
      case "GET_OPERATOR_REPORT": return this.dependencies.report.create(input as unknown as WorkflowOperatorReportRequest);
      case "EVALUATE_READINESS": return this.dependencies.readiness.evaluate(input as never);
      case "GET_NEXT_CANDIDATE": return this.dependencies.candidates.prepare(input as never);
      case "RECORD_APPROVAL": return this.dependencies.controls.recordApproval(input.checkpoint as never);
      case "RECORD_GUARDIAN": return this.dependencies.controls.recordGuardian(input.checkpoint as never);
      case "INVOKE_AGENT": return this.dependencies.invoker.invoke(input as never);
      case "INSPECT_AGENT_RESULT": return this.dependencies.repositories.transaction(async ({ workflows }) => { const invocation = await workflows.agentInvocations.getById(requiredId(input, "invocationId")); if (invocation === undefined) throw new RepositoryConflictError("Inspected Agent result does not exist"); return invocation; });
      case "ACCEPT_OUTCOME": return this.dependencies.outcomes.review(input as never);
      case "REJECT_OUTCOME": return this.dependencies.outcomes.reject(input as never);
      case "FAIL_STEP": return this.dependencies.lifecycle.recordFailure(input as never);
      case "INSPECT_RETRY_ELIGIBILITY": { const report = await this.dependencies.report.create(input as unknown as WorkflowOperatorReportRequest); return report.retry; }
      case "AUTHORIZE_RETRY": return this.dependencies.lifecycle.authorizeRetry(input as never);
      case "EXECUTE_RETRY": return this.dependencies.lifecycle.executeRetry(input as never);
      case "PAUSE_WORKFLOW": return this.dependencies.lifecycle.controlWorkflow({ ...input, action: "PAUSE" } as never);
      case "RESUME_WORKFLOW": return this.dependencies.lifecycle.controlWorkflow({ ...input, action: "RESUME" } as never);
      case "CANCEL_WORKFLOW": return this.dependencies.lifecycle.controlWorkflow({ ...input, action: "CANCEL" } as never);
      case "EVALUATE_TIMEOUT": return this.dependencies.lifecycle.evaluateTimeout(input as never);
      case "INSPECT_AUDIT_EVENTS": return this.dependencies.repositories.transaction(({ audits }) => audits.listByWorkspaceAndCorrelationId(this.dependencies.workspaceId, requiredId(input, "correlationId"), requiredLimit(input)));
    }
  }

  #socialIntelligenceLive(): SocialIntelligenceLiveService { if (this.dependencies.socialIntelligenceLive === undefined) throw new RepositoryConflictError("Social Intelligence Live service is unavailable"); return this.dependencies.socialIntelligenceLive; }
  #googleTrendsLive(): GoogleTrendsLiveAcquisitionService { if (this.dependencies.googleTrendsLive === undefined) throw new RepositoryConflictError("Google Trends Live acquisition service is unavailable"); return this.dependencies.googleTrendsLive; }

  async #createWorkflow(definitionInput: unknown, instanceInput: unknown): Promise<{ readonly created: boolean }> {
    const definition = validate(definitionInput, this.#definitionValidator, "Workflow definition");
    const instance = validate(instanceInput, this.#instanceValidator, "Workflow instance");
    if (instance.definitionId !== definition.definitionId || instance.version !== 0 || instance.receipts.length !== 0 || definition.steps.length !== instance.steps.length || definition.steps.some((step, index) => step.stepId !== instance.steps[index]?.stepId)) throw new RepositoryValidationError("Created Workflow identity is invalid");
    return this.dependencies.repositories.transaction(async ({ workflows, workflowCommands }) => {
      const existingDefinition = await workflows.definitions.getById(definition.definitionId);
      const existingInstance = await workflows.instances.getById(instance.instanceId);
      if (existingDefinition !== undefined || existingInstance !== undefined) {
        const ownership = await workflowCommands.getOwnership(instance.instanceId);
        if (JSON.stringify(existingDefinition) === JSON.stringify(definition) && JSON.stringify(existingInstance) === JSON.stringify(instance) && ownership?.workspaceId === this.dependencies.workspaceId && ownership.actorId === this.dependencies.actorId) return freeze({ created: false });
        throw new RepositoryConflictError("Created Workflow conflicts with durable state");
      }
      await workflows.definitions.insert(definition);
      await workflows.instances.insert(instance);
      await workflowCommands.insertOwnership({ actorId: this.dependencies.actorId, instanceId: instance.instanceId, workspaceId: this.dependencies.workspaceId });
      return freeze({ created: true });
    });
  }

  async #produceContentProduction(input: unknown): Promise<MetodoVeloceContentProductionRecord> {
    const brief = validate(input, this.#contentBriefValidator, "Metodo Veloce content production brief");
    const record = this.#contentProductionRecord(brief);
    return this.#insertContentProduction(record);
  }

  #contentProductionRecord(brief: MetodoVeloceContentProductionBrief, evidencePack?: MetodoVeloceContentProductionRecord["evidencePack"], preparedPackage?: MetodoVeloceContentProductionPackage): MetodoVeloceContentProductionRecord {
    const contentPackage = preparedPackage ?? this.dependencies.contentProduction.produce(brief);
    return {
      actorId: this.dependencies.actorId,
      contractVersion: "1",
      createdAt: contentPackage.generatedAt,
      ...(evidencePack === undefined ? {} : { evidencePack }),
      package: contentPackage,
      productionId: brief.productionId,
      status: contentPackage.status === "BLOCKED" ? "BLOCKED" : "PENDING_FABIO_APPROVAL",
      updatedAt: contentPackage.generatedAt,
      version: 0,
      workspaceId: this.dependencies.workspaceId,
    };
  }

  async #insertContentProduction(record: MetodoVeloceContentProductionRecord): Promise<MetodoVeloceContentProductionRecord> {
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      if (await contentProductions.getById(record.productionId) !== undefined) throw new RepositoryConflictError("Metodo Veloce content production already exists");
      await contentProductions.insert(record);
      return record;
    });
  }

  async #produceContentProductionFromEvidence(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    if (!keys(input, ["brief", "evidenceIds"]) || !Array.isArray(input.evidenceIds) || input.evidenceIds.length < 1 || input.evidenceIds.length > 8 || !input.evidenceIds.every(safeId) || new Set(input.evidenceIds).size !== input.evidenceIds.length) throw new RepositoryValidationError("Evidence-bound content production request is invalid");
    const brief = validate(input.brief, this.#contentBriefValidator, "Metodo Veloce evidence-bound content production brief");
    await this.dependencies.operationalPlanes.assertEvidenceForContent(brief.evidence, input.evidenceIds);
    return this.#produceContentProduction(brief);
  }

  async #produceContentProductionFromEvidencePack(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const evidencePackId = input.evidencePackId;
    if (!keys(input, ["brief", "evidencePackId"]) || !safeId(evidencePackId)) throw new RepositoryValidationError("Evidence Pack content production request is invalid");
    const brief = validate(input.brief, this.#contentBriefValidator, "Metodo Veloce Evidence Pack content production brief");
    return this.dependencies.repositories.transaction(async ({ contentProductions, operationalPlanes }) => {
      const pack = await this.dependencies.operationalPlanes.assertEvidencePackForContentInTransaction(operationalPlanes, evidencePackId, brief.evidence);
      const record = this.#contentProductionRecord(brief, { fingerprint: pack.fingerprint, minFreshnessExpiresAt: pack.minFreshnessExpiresAt, packId: pack.packId, verifiedAt: this.dependencies.clock.now().toISOString() });
      if (await contentProductions.getById(record.productionId) !== undefined) throw new RepositoryConflictError("Metodo Veloce content production already exists");
      await contentProductions.insert(record);
      return record;
    });
  }

  async #produceSocialContentProductionFromEvidencePack(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const evidencePackId = input.evidencePackId;
    if (!keys(input, ["brief", "evidencePackId", "socialIntelligence"]) || !safeId(evidencePackId)) throw new RepositoryValidationError("Social Publishing Pack production request is invalid");
    const brief = validate(input.brief, this.#contentBriefValidator, "Metodo Veloce Social Publishing brief");
    const intelligence = validate(input.socialIntelligence, this.#socialIntelligenceValidator, "Metodo Veloce Social Intelligence request");
    const production = this.dependencies.socialContentProduction;
    if (production === undefined) throw new RepositoryConflictError("Social content production service is not configured");
    return this.dependencies.repositories.transaction(async ({ contentProductions, operationalPlanes }) => {
      const pack = await this.dependencies.operationalPlanes.assertEvidencePackForContentInTransaction(operationalPlanes, evidencePackId, brief.evidence);
      const preparedPackage = production.produce(brief, intelligence);
      const record = this.#contentProductionRecord(brief, { fingerprint: pack.fingerprint, minFreshnessExpiresAt: pack.minFreshnessExpiresAt, packId: pack.packId, verifiedAt: this.dependencies.clock.now().toISOString() }, preparedPackage);
      if (await contentProductions.getById(record.productionId) !== undefined) throw new RepositoryConflictError("Metodo Veloce content production already exists");
      await contentProductions.insert(record);
      return record;
    });
  }

  async #inspectContentProduction(productionId: string): Promise<MetodoVeloceContentProductionRecord> { return this.dependencies.repositories.transaction(({ contentProductions }) => this.#ownedContentProduction(contentProductions, productionId)); }
  async #reviewContentProduction(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentReviewValidator, "Metodo Veloce content review request");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (current.status !== "PENDING_FABIO_APPROVAL" || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for review");
      const reviewedAt = this.dependencies.clock.now().toISOString();
      const next: MetodoVeloceContentProductionRecord = request.decision === "APPROVED" ? { ...current, review: { decision: request.decision, note: request.note, reviewedAt, reviewedBy: this.dependencies.actorId }, status: "APPROVED_FOR_SCHEDULING", updatedAt: reviewedAt, version: current.version + 1 } : { ...current, archive: { archivedAt: reviewedAt, reason: "REJECTED_BY_FABIO" }, review: { decision: request.decision, note: request.note, reviewedAt, reviewedBy: this.dependencies.actorId }, status: "ARCHIVED", updatedAt: reviewedAt, version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #scheduleContentProduction(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentScheduleValidator, "Metodo Veloce content schedule request");
    if (Date.parse(request.scheduledFor) <= this.dependencies.clock.now().getTime()) throw new RepositoryValidationError("Metodo Veloce content schedule must be in the future");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (current.status !== "APPROVED_FOR_SCHEDULING" || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for scheduling");
      const next = { ...current, schedule: { scheduledFor: request.scheduledFor }, status: "SCHEDULED" as const, updatedAt: this.dependencies.clock.now().toISOString(), version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #recordContentProductionMetrics(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentMetricsValidator, "Metodo Veloce content metrics request");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (current.status !== "SCHEDULED" || current.metrics !== undefined || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for metrics");
      const reportedAt = this.dependencies.clock.now().toISOString();
      const next = { ...current, metrics: { conversions: request.conversions, costCents: request.costCents, leadCount: request.leadCount, reportedAt, reportedBy: this.dependencies.actorId, saves: request.saves, views: request.views }, updatedAt: reportedAt, version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #archiveContentProduction(input: Readonly<Record<string, unknown>>): Promise<MetodoVeloceContentProductionRecord> {
    const request = validate(input, this.#contentArchiveValidator, "Metodo Veloce content archive request");
    return this.dependencies.repositories.transaction(async ({ contentProductions }) => {
      const current = await this.#ownedContentProduction(contentProductions, request.productionId);
      if (!["PENDING_FABIO_APPROVAL", "APPROVED_FOR_SCHEDULING", "SCHEDULED"].includes(current.status) || current.version !== request.expectedVersion) throw new RepositoryConflictError("Metodo Veloce content production is not eligible for archive");
      const archivedAt = this.dependencies.clock.now().toISOString();
      const next = { ...current, archive: { archivedAt, reason: request.reason }, status: "ARCHIVED" as const, updatedAt: archivedAt, version: current.version + 1 };
      await contentProductions.update(next, { version: current.version });
      return next;
    });
  }
  async #listContentProductionQueue(input: Readonly<Record<string, unknown>>): Promise<readonly MetodoVeloceContentProductionRecord[]> {
    if (Object.keys(input).length !== 1 || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 25) throw new RepositoryValidationError("Metodo Veloce content production queue request is invalid");
    return this.dependencies.repositories.transaction(({ contentProductions }) => contentProductions.listByWorkspaceId(this.dependencies.workspaceId, input.limit as number));
  }
  async #enqueueContentProductionRuntime(input: Readonly<Record<string, unknown>>) { return this.dependencies.productionRuntime.enqueue(validate(input, this.#productionRuntimeEnqueueValidator, "Production Runtime enqueue request")); }
  async #runProductionRuntimeOnce(input: Readonly<Record<string, unknown>>) {
    if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Production Runtime run request is invalid");
    return this.dependencies.productionRuntime.runOnce(async (job) => {
      const response = await this.execute({ actorId: this.dependencies.actorId, commandId: productionRuntimeCommandId(job.jobId), contractVersion: "1", input: { brief: job.brief }, operation: "PRODUCE_METODO_VELOCE_CONTENT", workspaceId: this.dependencies.workspaceId });
      if (!record(response.result) || !safeId(response.result.productionId)) throw new RepositoryValidationError("Production Runtime content result is invalid");
      return response.result.productionId;
    });
  }
  async #productionRuntimeHealth(input: Readonly<Record<string, unknown>>) { if (Object.keys(input).length !== 0) throw new RepositoryValidationError("Production Runtime health request is invalid"); return this.dependencies.productionRuntime.health(); }
  async #ownedContentProduction(repository: MetodoVeloceContentProductionRepository, productionId: string): Promise<MetodoVeloceContentProductionRecord> {
    const record = await repository.getById(productionId);
    if (record === undefined) throw new RepositoryConflictError("Metodo Veloce content production does not exist");
    if (record.actorId !== this.dependencies.actorId || record.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Metodo Veloce content production ownership is unauthorized");
    return record;
  }

  async #resourceInstanceId(command: LocalWorkflowCommand): Promise<string | undefined> {
    const input = command.input;
    if (["CREATE_MISSION", "PLAN_MISSION", "CREATE_WORKFLOW", "RUN_AUTHORIZED_RESEARCH_MISSION", "INSPECT_AUTHORIZED_RESEARCH_MISSION", "LIST_AUTHORIZED_RESEARCH_MISSIONS", "RUN_AGENT_COMPANY_WORKDAY", "INSPECT_AGENT_COMPANY_WORKDAY", "LIST_AGENT_COMPANY_WORKDAYS", "GET_AGENT_COMPANY_CATALOG", "GET_AGENT_COMPANY_METRICS", "CREATE_BUSINESS_MISSION_DOSSIER", "INSPECT_BUSINESS_MISSION_DOSSIER", "LIST_BUSINESS_MISSION_DOSSIERS", "REVIEW_BUSINESS_MISSION_DOSSIER", "PRODUCE_METODO_VELOCE_CONTENT", "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE", "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE_PACK", "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK", "INSPECT_METODO_VELOCE_CONTENT", "REVIEW_METODO_VELOCE_CONTENT", "SCHEDULE_METODO_VELOCE_CONTENT", "RECORD_METODO_VELOCE_CONTENT_METRICS", "ARCHIVE_METODO_VELOCE_CONTENT", "LIST_METODO_VELOCE_CONTENT_QUEUE", "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION", "RUN_PRODUCTION_RUNTIME_ONCE", "GET_PRODUCTION_RUNTIME_HEALTH", "REGISTER_EVIDENCE_SOURCE", "RECORD_EVIDENCE", "CREATE_EVIDENCE_PACK", "INSPECT_EVIDENCE_PACK", "CREATE_PUBLICATION_DRY_RUN", "AUTHORIZE_PUBLICATION_DRY_RUN", "RECORD_PUBLICATION_RECEIPT", "SET_PUBLICATION_KILL_SWITCH", "IMPORT_FEEDBACK_METRICS", "ANALYZE_PUBLICATION_FEEDBACK", "INSPECT_AUDIT_EVENTS"].includes(command.operation)) return undefined;
    if (typeof input.instanceId === "string") return input.instanceId;
    if (record(input.checkpoint) && typeof input.checkpoint.instanceId === "string") return input.checkpoint.instanceId;
    if (record(input.boundaryRequest) && typeof input.boundaryRequest.instanceId === "string") return input.boundaryRequest.instanceId;
    if (typeof input.invocationId === "string") return this.dependencies.repositories.transaction(async ({ workflows }) => (await workflows.agentInvocations.getById(input.invocationId as string))?.instanceId);
    return undefined;
  }

  async #assertOwnership(instanceId: string): Promise<void> { const ownership = await this.dependencies.repositories.transaction(({ workflowCommands }) => workflowCommands.getOwnership(instanceId)); if (ownership?.workspaceId !== this.dependencies.workspaceId || ownership.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Local Workflow resource ownership is unauthorized"); }
  #businessMissions(): BusinessMissionService { if (this.dependencies.businessMissions === undefined) throw new RepositoryConflictError("Business Mission service is not configured"); return this.dependencies.businessMissions; }
  #agentCompany(): OperationalAgentCompanyService { if (this.dependencies.agentCompany === undefined) throw new RepositoryConflictError("Operational Agent Company service is not configured"); return this.dependencies.agentCompany; }
  #authorizedResearch(): AuthorizedResearchService { if (this.dependencies.authorizedResearch === undefined) throw new RepositoryConflictError("Authorized Research service is not configured"); return this.dependencies.authorizedResearch; }
}

function action(operation: LocalWorkflowOperation, input: Readonly<Record<string, unknown>>, result: unknown): string {
  if (operation === "GET_OPERATOR_REPORT" && record(result) && typeof result.nextAction === "string") return result.nextAction;
  if (operation === "CREATE_MISSION") return `Plan validated Mission Brief ${nestedId(input, "brief", "briefId") ?? "mission"}.`;
  if (operation === "PLAN_MISSION") return "Create a durable Workflow from the validated Mission Plan.";
  if (operation === "CREATE_WORKFLOW") return `Request the Operator Workflow Report for Workflow ${nestedId(input, "instance", "instanceId") ?? "unknown"}.`;
  if (operation === "RUN_AUTHORIZED_RESEARCH_MISSION") return record(result) && result.status === "READY" ? "Use the durable Evidence Packs in the shared Onlyway workday." : "Resolve the Authorized Research blockers before Business selection.";
  if (operation === "INSPECT_AUTHORIZED_RESEARCH_MISSION" || operation === "LIST_AUTHORIZED_RESEARCH_MISSIONS") return "Review sources, immutable snapshots, claim corroboration, freshness, and blockers.";
  if (operation === "RUN_AGENT_COMPANY_WORKDAY") return record(result) && result.status === "AWAITING_FABIO" ? "Open the Agent Company workday in the Onlyway Command Center for Fabio review; no external action was executed." : "Resolve the durable Agent Company blocker before resuming the shared Mission.";
  if (operation === "INSPECT_AGENT_COMPANY_WORKDAY" || operation === "LIST_AGENT_COMPANY_WORKDAYS") return "Review assigned tasks, durable outputs, gates, costs, blockers, and approvals.";
  if (operation === "GET_AGENT_COMPANY_CATALOG" || operation === "GET_AGENT_COMPANY_METRICS") return "Only agents with an executable task and durable measured results are reported as operational.";
  if (operation === "CREATE_BUSINESS_MISSION_DOSSIER") return "Open the durable Business Mission dossier in the Onlyway Approval Center; no external action was executed.";
  if (operation === "INSPECT_BUSINESS_MISSION_DOSSIER" || operation === "LIST_BUSINESS_MISSION_DOSSIERS") return "Review scorecards, economics, validation plan, artifacts, and gates before any decision.";
  if (operation === "REVIEW_BUSINESS_MISSION_DOSSIER") return "The Business Mission decision is recorded durably; experiments and external actions remain separately locked.";
  if (operation === "REGISTER_SOCIAL_OFFICIAL_SOURCES") return "Import only attributable observations from these official sources; registration does not create a trend or metric.";
  if (operation === "ACQUIRE_GOOGLE_TRENDS_LIVE") return "Classify the imported Italian trend observations for Metodo Veloce compatibility; unclassified signals cannot justify production.";
  if (operation === "CLASSIFY_SOCIAL_TREND") return "Review the evidence-linked compatibility decision; phase, velocity and saturation remain unclassified unless separately evidenced.";
  if (operation === "IMPORT_SOCIAL_ANALYTICS_CSV") return "Review the real account baseline; insufficient history must remain an experiment rather than a claimed best time.";
  if (operation === "AUTHORIZE_SOCIAL_COMPETITOR_SET") return "Observe only these six public accounts and preserve attributable snapshots; authorization does not permit outreach, login, or copying.";
  if (operation === "REPLACE_SOCIAL_COMPETITOR") return "Acquire one attributable public observation for the replacement profile; do not interact with the account or use it as claim evidence.";
  if (operation === "MATERIALIZE_COMPETITOR_INTELLIGENCE_PACK") return "Preserve this exact pack version and fingerprint; any later source change requires a new version.";
  if (operation === "IMPORT_SOCIAL_COMPETITOR_OBSERVATIONS_CSV") return "Review the six attributable public observations and competitor gaps; no profile interaction or outreach occurred.";
  if (operation === "IMPORT_SOCIAL_AUDIO_RIGHTS_CSV") return "Use only currently available audio candidates allowed for the exact account and country; otherwise retain AUDIO_NON_AUTORIZZATO.";
  if (operation === "IMPORT_SOCIAL_LIVE_RECORD") return "Inspect the updated Social Intelligence Live report; imported observations remain append-only and cannot authorize publication.";
  if (operation === "PREVIEW_SOCIAL_LIVE_BATCH") return record(result) && result.status === "READY" ? "The batch is valid for an explicit atomic import." : "Resolve every batch blocker before importing any record.";
  if (operation === "IMPORT_SOCIAL_LIVE_BATCH") return "Review the durable batch receipt and refreshed Social Intelligence Live report; no external action was executed.";
  if (operation === "GET_SOCIAL_LIVE_REPORT") return "Resolve missing real inputs or review the controlled timing experiment in the Onlyway Command Center.";
  if (operation === "CREATE_FIRST_SOCIAL_EXPERIMENT") return "Fabio must set both exact test windows before internal scheduling; publication remains manual and separately authorized.";
  if (operation === "PRODUCE_METODO_VELOCE_CONTENT" || operation === "INSPECT_METODO_VELOCE_CONTENT") return `Request Fabio review for Metodo Veloce content package ${operation === "PRODUCE_METODO_VELOCE_CONTENT" ? nestedId(input, "brief", "productionId") ?? "unknown" : id(input.productionId)}.`;
  if (operation === "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE") return `Request Fabio review for evidence-bound Metodo Veloce content package ${nestedId(input, "brief", "productionId") ?? "unknown"}.`;
  if (operation === "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE_PACK") return `Open the evidence-led Metodo Veloce content package ${nestedId(input, "brief", "productionId") ?? "unknown"} in Telegram for Fabio review.`;
  if (operation === "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK") return `Open Social Publishing Pack ${nestedId(input, "brief", "productionId") ?? "unknown"}: review opportunity, expiry, rights, timing experiment, claims, and six-slide carousel before any external action.`;
  if (operation === "REVIEW_METODO_VELOCE_CONTENT") return record(result) && result.status === "APPROVED_FOR_SCHEDULING" ? `The exact internal Metodo Veloce package ${id(input.productionId)} is approved. Scheduling and publication remain separate and locked.` : `Keep archived Metodo Veloce content package ${id(input.productionId)} out of the publication queue.`;
  if (operation === "SCHEDULE_METODO_VELOCE_CONTENT") return `Await Fabio's separate publication decision for scheduled Metodo Veloce content package ${id(input.productionId)}.`;
  if (operation === "RECORD_METODO_VELOCE_CONTENT_METRICS") return `Review declared metrics for Metodo Veloce content package ${id(input.productionId)}; this did not publish anything.`;
  if (operation === "ARCHIVE_METODO_VELOCE_CONTENT") return `Keep archived Metodo Veloce content package ${id(input.productionId)} out of the active queue.`;
  if (operation === "LIST_METODO_VELOCE_CONTENT_QUEUE") return "Review the durable Metodo Veloce content production queue and choose one explicit next action.";
  if (operation === "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION") return `Run the controlled Production Runtime worker for job ${id(input.jobId)} when its schedule is due.`;
  if (operation === "RUN_PRODUCTION_RUNTIME_ONCE") return record(result) && result.status === "IDLE" ? "No due preparation job exists; inspect Production Runtime health." : "Review the completed or retrying Production Runtime job; no external action was executed.";
  if (operation === "GET_PRODUCTION_RUNTIME_HEALTH") return record(result) && result.status === "ATTENTION_REQUIRED" ? "Inspect the Production Runtime dead-letter queue before scheduling additional work." : "Production Runtime is healthy; run one controlled worker tick when due work exists.";
  if (operation === "REGISTER_EVIDENCE_SOURCE") return "Record attributable evidence only from this registered source; no browsing was enabled.";
  if (operation === "RECORD_EVIDENCE") return "Use only verified, current evidence mapped to the supported claim; no source was fetched by the runtime.";
  if (operation === "CREATE_EVIDENCE_PACK") return `Review the immutable Evidence Pack ${id(input.packId)} before creating a content package.`;
  if (operation === "INSPECT_EVIDENCE_PACK") return `Inspect the sources, claims, limits, and freshness of Evidence Pack ${id(input.packId)}.`;
  if (operation === "CREATE_PUBLICATION_DRY_RUN") return "Review the exact account, platform, content fingerprint, time, and idempotency key before final authorization; nothing was published.";
  if (operation === "AUTHORIZE_PUBLICATION_DRY_RUN") return "A final authorization record exists, but no publication connector was invoked. Record a confirmed or uncertain receipt separately.";
  if (operation === "RECORD_PUBLICATION_RECEIPT") return "Do not retry publication blindly. Treat an uncertain receipt as unresolved until the platform is checked separately.";
  if (operation === "SET_PUBLICATION_KILL_SWITCH") return record(result) && result.enabled === true ? "Global publication kill switch is active; no publication may be authorized." : "Publication kill switch is off; only explicit dry-run and authorization controls remain available.";
  if (operation === "IMPORT_FEEDBACK_METRICS") return "Review imported, fingerprinted metrics and their attribution; no metric was generated by the runtime.";
  if (operation === "ANALYZE_PUBLICATION_FEEDBACK") return "Use the append-only snapshot analysis for measured improvement; corrections remain traceable.";
  if (operation === "INSPECT_WORKFLOW") return `Request the Operator Workflow Report for Workflow ${id(input.instanceId)}.`;
  if (operation === "EVALUATE_READINESS") return `Request the next controlled candidate for Workflow ${id(input.instanceId)} at version ${number(input.expectedVersion)}.`;
  if (operation === "GET_NEXT_CANDIDATE") return record(result) && result.status === "CANDIDATE_AVAILABLE" ? `Invoke the controlled candidate for step ${nestedId(result, "candidate", "stepId") ?? "unknown"}.` : `Resolve the reported candidate blockers for Workflow ${id(input.instanceId)}.`;
  if (operation === "RECORD_APPROVAL" || operation === "RECORD_GUARDIAN") return `Evaluate readiness for Workflow ${nestedId(input, "checkpoint", "instanceId") ?? "unknown"} at version ${nestedNumber(input, "checkpoint", "instanceVersion")}.`;
  if (operation === "INVOKE_AGENT") return `Inspect Agent result ${record(result) && record(result.receipt) && typeof result.receipt.invocationId === "string" ? result.receipt.invocationId : id(input.invocationId)}.`;
  if (operation === "INSPECT_AGENT_RESULT") return `Explicitly accept or reject Agent result ${id(input.invocationId)}.`;
  if (operation === "ACCEPT_OUTCOME" || operation === "REJECT_OUTCOME") return `Request the Operator Workflow Report for Workflow ${record(result) && record(result.receipt) && typeof result.receipt.instanceId === "string" ? result.receipt.instanceId : "unknown"}.`;
  if (operation === "INSPECT_AUDIT_EVENTS") return `No state change occurred; audit inspection for ${id(input.correlationId)} is complete.`;
  const instanceId = typeof input.instanceId === "string" ? input.instanceId : record(result) && record(result.record) && typeof result.record.instanceId === "string" ? result.record.instanceId : "unknown";
  return `Request the Operator Workflow Report for Workflow ${instanceId}.`;
}
function id(value: unknown): string { return typeof value === "string" ? value : "unknown"; }
function productionRuntimeCommandId(jobId: string): string { return `runtime-produce-${createHash("sha256").update(jobId, "utf8").digest("hex").slice(0, 24)}`; }
function number(value: unknown): string { return typeof value === "number" ? String(value) : "unknown"; }
function nestedId(input: Readonly<Record<string, unknown>>, parent: string, child: string): string | undefined { const value = input[parent]; return record(value) && typeof value[child] === "string" ? value[child] : undefined; }
function nestedNumber(input: Readonly<Record<string, unknown>>, parent: string, child: string): string { const value = input[parent]; return record(value) && typeof value[child] === "number" ? String(value[child]) : "unknown"; }
function requiredId(input: Readonly<Record<string, unknown>>, key: string): string { const value = input[key]; if (!safeId(value)) throw new RepositoryValidationError(`Local Workflow command ${key} is invalid`); return value; }
function requiredLimit(input: Readonly<Record<string, unknown>>): number { const value = input.limit; if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new RepositoryValidationError("Local Workflow audit limit is invalid"); return value as number; }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const checked = validator.validate(value); if (!checked.ok) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: checked.issues.length }); return checked.value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key)); }
function safeId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function prohibited(value: string): boolean { return /(?:\bsk-[a-z0-9][a-z0-9_-]{10,}|rawPrompt|rawCompletion|providerPayload|secret|stack trace)/iu.test(value); }
function json(value: unknown): string | undefined { try { return jsonValue(value) ? JSON.stringify(value) : undefined; } catch { return undefined; } }
function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => jsonValue(entry));
  if (!record(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  return Object.values(value).every((entry) => jsonValue(entry));
}
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function replay(storedFingerprint: string, expectedFingerprint: string, response: LocalWorkflowCommandResponse): LocalWorkflowCommandResponse { if (storedFingerprint !== expectedFingerprint) throw new RepositoryConflictError("Local Workflow command ID conflicts with a prior command"); return freeze({ ...response, replayed: true }); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
