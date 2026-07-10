import { createHash } from "node:crypto";

import type { WorkflowCommand } from "./workflow-runtime.js";

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

export function createWorkflowCommandFingerprint(
  command: WorkflowCommand,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        expectedVersion: command.expectedVersion,
        kind: command.kind,
        reasonCode: command.reasonCode,
        ...(command.stepId === undefined ? {} : { stepId: command.stepId }),
      }),
      "utf8",
    )
    .digest("hex");
}

export function isWorkflowCommandFingerprint(value: string): boolean {
  return FINGERPRINT_PATTERN.test(value);
}
