import {
  AgentSpecificationValidator,
  WorkflowSpecificationValidator,
  type WorkflowCondition,
  type WorkflowFailurePolicy,
  type WorkflowInput,
  type WorkflowOutput,
  type WorkflowSpecification,
  type WorkflowStep,
  type WorkflowTransition,
} from "../../src/index.js";
import { createAgentSpecification } from "../agent-specifications/fixtures.js";
import { InMemoryAgentSpecificationRegistry } from "../support/in-memory-agent-specification-registry.js";

export function createWorkflowInput(
  overrides: Partial<WorkflowInput> = {},
): WorkflowInput {
  return {
    contractId: "content-workflow-input",
    contractVersion: "1",
    schema: {
      properties: {
        instruction: { type: "string" },
      },
      required: ["instruction"],
      type: "object",
    },
    strict: true,
    ...overrides,
  };
}

export function createWorkflowOutput(
  overrides: Partial<WorkflowOutput> = {},
): WorkflowOutput {
  return {
    contractId: "content-workflow-output",
    contractVersion: "1",
    schema: {
      properties: {
        content: { type: "string" },
      },
      required: ["content"],
      type: "object",
    },
    sourceStepIds: ["compose"],
    strict: true,
    ...overrides,
  };
}

export function createWorkflowCondition(
  overrides: Partial<WorkflowCondition> = {},
): WorkflowCondition {
  return {
    conditionId: "research-complete",
    expectedValue: true,
    field: "complete",
    operator: "equals",
    source: "step_output",
    sourceStepId: "research",
    ...overrides,
  };
}

export function createWorkflowStep(
  overrides: Partial<WorkflowStep> = {},
): WorkflowStep {
  return {
    agent: {
      agentId: "research",
      version: "1.0.0",
    },
    inputMapping: {
      instruction: "workflow.input.instruction",
    },
    name: "Research",
    objective: "Collect the bounded facts required for content creation.",
    stepId: "research",
    terminal: false,
    ...overrides,
  };
}

export function createWorkflowTransition(
  overrides: Partial<WorkflowTransition> = {},
): WorkflowTransition {
  return {
    fromStepId: "research",
    priority: 0,
    toStepId: "compose",
    transitionId: "research-to-compose",
    ...overrides,
  };
}

export function createWorkflowFailurePolicy(
  overrides: Partial<WorkflowFailurePolicy> = {},
): WorkflowFailurePolicy {
  return {
    preserveSuccessfulOutputs: false,
    strategy: "fail_workflow",
    ...overrides,
  };
}

export function createWorkflowSpecification(
  overrides: Partial<WorkflowSpecification> = {},
): WorkflowSpecification {
  return {
    allowCycles: false,
    description:
      "Researches a bounded topic before composing structured content.",
    entryStepId: "research",
    failurePolicy: createWorkflowFailurePolicy(),
    input: createWorkflowInput(),
    name: "Research and Compose",
    output: createWorkflowOutput(),
    schemaVersion: "1",
    status: "active",
    steps: [
      createWorkflowStep(),
      createWorkflowStep({
        agent: {
          agentId: "content",
          version: "1.0.0",
        },
        inputMapping: {
          evidence: "steps.research.output",
          instruction: "workflow.input.instruction",
        },
        name: "Compose",
        objective: "Produce content grounded in the research output.",
        stepId: "compose",
        terminal: true,
      }),
    ],
    transitions: [createWorkflowTransition()],
    version: "1.0.0",
    workflowId: "research-and-compose",
    ...overrides,
  };
}

export function createWorkflowSpecificationValidator(): WorkflowSpecificationValidator {
  const agentValidator = new AgentSpecificationValidator();
  const agents = new InMemoryAgentSpecificationRegistry(
    [
      createAgentSpecification(),
      createAgentSpecification({
        agentId: "research",
        name: "Research Agent",
        taskTypes: ["business.research"],
      }),
    ],
    agentValidator,
  );
  return new WorkflowSpecificationValidator(agents);
}
