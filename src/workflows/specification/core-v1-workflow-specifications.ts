import { CONTENT_DIRECTOR_SPECIFICATION } from "../../assistants/core-agent-specifications.js";
import type { WorkflowSpecification } from "./workflow-specification.js";

export const CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID =
  "core-v1-content-direction" as const;
export const CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION = "1.0.0" as const;

export const CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION: WorkflowSpecification =
  deepFreeze({
    allowCycles: false,
    description:
      "Prepare one bounded local content direction for explicit operator review.",
    entryStepId: "content-direction",
    failurePolicy: {
      preserveSuccessfulOutputs: false,
      strategy: "fail_workflow",
    },
    input: {
      contractId: "core-v1-content-direction-input",
      contractVersion: "1",
      schema: {
        additionalProperties: false,
        properties: {
          missionReference: { type: "string" },
          objective: { type: "string" },
        },
        required: ["missionReference", "objective"],
        type: "object",
      },
      strict: true,
    },
    name: "Core V1 Content Direction",
    output: {
      contractId: CONTENT_DIRECTOR_SPECIFICATION.outputSchema.contractId,
      contractVersion:
        CONTENT_DIRECTOR_SPECIFICATION.outputSchema.contractVersion,
      schema: CONTENT_DIRECTOR_SPECIFICATION.outputSchema.schema,
      sourceStepIds: ["content-direction"],
      strict: CONTENT_DIRECTOR_SPECIFICATION.outputSchema.strict,
    },
    schemaVersion: "1",
    status: "active",
    steps: [
      {
        agent: {
          agentId: "content-director",
          version: "1.0.0",
        },
        inputMapping: {
          objective: "workflow.input.objective",
        },
        name: "Content Direction",
        objective:
          "Prepare a deterministic content-direction artifact without external effects.",
        stepId: "content-direction",
        terminal: true,
      },
    ],
    transitions: [],
    version: CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION,
    workflowId: CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID,
  });

export const CORE_V1_WORKFLOW_SPECIFICATIONS: readonly WorkflowSpecification[] =
  deepFreeze([CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION]);

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
