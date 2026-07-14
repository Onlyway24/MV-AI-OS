import { randomUUID } from "node:crypto";

import { DETERMINISTIC_CONTENT_DIRECTOR_BINDING, DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR, DeterministicContentDirectorExecutor } from "../agents/content/deterministic-content-director.js";
import { InProcessAgentRuntime } from "../agents/in-process-agent-runtime.js";
import { DefaultDenyAgentRuntimeResolver, ImmutableAgentRuntimeCatalog } from "../agents/agent-runtime-resolution.js";
import { ImmutableAgentSpecificationRegistry } from "../agents/specification/immutable-agent-specification-registry.js";
import { AgentSpecificationValidator } from "../agents/specification/agent-specification-validator.js";
import { CONTENT_DIRECTOR_SPECIFICATION } from "../assistants/core-agent-specifications.js";
import { DEFAULT_AGENT_CAPABILITY_REGISTRY } from "../assistants/agent-capability-registry.js";
import { DEFAULT_AGENT_COMPANY_MAP } from "../assistants/agent-company-specification.js";
import { DEFAULT_AGENT_PERMISSION_MATRIX } from "../assistants/agent-permission-matrix.js";
import { DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX } from "../assistants/inter-agent-responsibility-matrix.js";
import { DeterministicLocalMissionPlanningDryRun } from "../missions/local-mission-planning-dry-run-service.js";
import { DeterministicMetodoVeloceContentProductionLine } from "../content-production/deterministic-metodo-veloce-content-production-line.js";
import { ProductionRuntimeService } from "../production-runtime/production-runtime-service.js";
import { OperationalPlaneService } from "../operational-planes/operational-plane-service.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { AgentInvocationValidator } from "../validation/agent-invocation-validator.js";
import { AgentResultValidator } from "../validation/agent-result-validator.js";
import { createWorkflowAgentInvoker } from "../workflows/runtime/repository-backed-workflow-agent-invoker.js";
import { createWorkflowLifecycleService } from "../workflows/runtime/repository-backed-workflow-lifecycle-service.js";
import { createWorkflowStepExecutionBoundary } from "../workflows/runtime/repository-backed-workflow-step-execution-boundary.js";
import { createWorkflowStepOutcomeService } from "../workflows/runtime/repository-backed-workflow-step-outcome-service.js";
import { createWorkflowControlCheckpointService } from "../workflows/runtime/workflow-control-checkpoint-service.js";
import { createWorkflowOperatorReportService } from "../workflows/runtime/workflow-operator-report.js";
import { createWorkflowReadinessService } from "../workflows/runtime/workflow-readiness-service.js";
import { LocalWorkflowCommandBoundary } from "./local-workflow-command.js";

export function createLocalWorkflowCommandBoundary(input: { readonly actorId: string; readonly workspaceId: string; readonly clock: Clock; readonly repositories: RepositoryTransactionRunner }): LocalWorkflowCommandBoundary {
  const specifications = new ImmutableAgentSpecificationRegistry([CONTENT_DIRECTOR_SPECIFICATION], new AgentSpecificationValidator());
  const executor = new DeterministicContentDirectorExecutor();
  const catalog = new ImmutableAgentRuntimeCatalog([{ descriptor: DETERMINISTIC_CONTENT_DIRECTOR_DESCRIPTOR, executor }], [DETERMINISTIC_CONTENT_DIRECTOR_BINDING], specifications);
  const resolver = new DefaultDenyAgentRuntimeResolver(catalog, specifications);
  const boundary = createWorkflowStepExecutionBoundary({ agentCompany: DEFAULT_AGENT_COMPANY_MAP, agentSpecifications: specifications, capabilities: DEFAULT_AGENT_CAPABILITY_REGISTRY, controlEvidenceMode: "DURABLE_ONLY", operatorActorId: input.actorId, permissionMatrix: DEFAULT_AGENT_PERMISSION_MATRIX, repositories: input.repositories, responsibilities: DEFAULT_INTER_AGENT_RESPONSIBILITY_MATRIX });
  const resultValidator = new AgentResultValidator();
  const agentRuntime = new InProcessAgentRuntime([executor], new AgentInvocationValidator(), resultValidator, input.clock);
  return new LocalWorkflowCommandBoundary({
    actorId: input.actorId,
    candidates: boundary,
    clock: input.clock,
    contentProduction: new DeterministicMetodoVeloceContentProductionLine(input.clock),
    controls: createWorkflowControlCheckpointService({ eventIds: { nextWorkflowControlCheckpointEventId: () => randomId() }, guardianAuthorities: { operator_safety: "operator_safety-guardian", quality: "quality-guardian" }, operatorActorId: input.actorId, repositories: input.repositories }),
    invoker: createWorkflowAgentInvoker({ agentRuntime, agentSpecifications: specifications, boundary, clock: input.clock, repositories: input.repositories, resolver, resultValidator }),
    lifecycle: createWorkflowLifecycleService({ clock: input.clock, maxAttempts: 3, operatorActorId: input.actorId, repositories: input.repositories, timeoutMs: 60_000 }),
    missionPlanning: new DeterministicLocalMissionPlanningDryRun(),
    outcomes: createWorkflowStepOutcomeService({ clock: input.clock, operatorActorId: input.actorId, repositories: input.repositories, resolver }),
    operationalPlanes: new OperationalPlaneService({ actorId: input.actorId, clock: input.clock, repositories: input.repositories, workspaceId: input.workspaceId }),
    productionRuntime: new ProductionRuntimeService({ actorId: input.actorId, clock: input.clock, repositories: input.repositories, workspaceId: input.workspaceId }),
    readiness: createWorkflowReadinessService({ repositories: input.repositories }),
    report: createWorkflowOperatorReportService(input.repositories),
    repositories: input.repositories,
    workspaceId: input.workspaceId,
  });
}

function randomId(): string { return `local-${randomUUID()}`; }
