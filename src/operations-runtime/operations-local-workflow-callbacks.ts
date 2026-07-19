import { createHash } from "node:crypto";

import type { AgentCompanyWorkday } from "../agent-company/operational-agent-company.js";
import { createAgentCompanyInputFingerprint } from "../agent-company/operational-agent-company-validator.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import type { LocalWorkflowCommandBoundary, LocalWorkflowCommandResponse } from "../runtime/local-workflow-command.js";
import type { OperationsLocalWorkflowCallbacks } from "./operations-handler-registry.js";
import type { OperationsJobBlock } from "./operations-runtime.js";

const AGENT_COMPANY_BLOCK_REASON_CODES = Object.freeze([
  "BACKUP_RESTORE_RECEIPT_REQUIRED",
  "COST_GATE_BLOCKED",
  "DEPENDENCY_NOT_COMPLETED",
  "EXECUTOR_OUTPUT_UNVERIFIED",
  "QUALITY_GATE_BLOCKED",
  "RISK_GATE_BLOCKED",
] as const satisfies readonly OperationsJobBlock["code"][]);

interface FounderWorkdayBoundary {
  run(workdayId: string, budgetCents: number): Promise<Readonly<{ readonly fingerprint: string }>>;
}
interface DailyOperatingReportBoundary {
  generate(businessDate: string): Promise<Readonly<{ readonly fingerprint: string }>>;
}

/** Adapts real local services without introducing a dependency back into them. */
export function createOperationsLocalWorkflowCallbacks(input: Readonly<{
  readonly actorId: string;
  readonly commandBoundary: LocalWorkflowCommandBoundary;
  readonly dailyOperatingReport: DailyOperatingReportBoundary;
  readonly founderWorkday: FounderWorkdayBoundary;
  readonly workspaceId: string;
}>): OperationsLocalWorkflowCallbacks {
  const callbacks: OperationsLocalWorkflowCallbacks = {
    generateDailyOperatingReport: async ({ businessDate, signal }: Parameters<OperationsLocalWorkflowCallbacks["generateDailyOperatingReport"]>[0]) => {
      signal.throwIfAborted();
      const record = await input.dailyOperatingReport.generate(businessDate);
      signal.throwIfAborted();
      return Object.freeze({ resultRef: fingerprintRef("daily", record.fingerprint), status: "COMPLETED" });
    },
    startAgentCompanyWorkday: async ({ budgetCents, operationIdentity, signal, workday, workdayId }: Parameters<OperationsLocalWorkflowCallbacks["startAgentCompanyWorkday"]>[0]) => {
      signal.throwIfAborted();
      await input.founderWorkday.run(workdayId, budgetCents);
      signal.throwIfAborted();
      if (workday === undefined) return Object.freeze({ reasonCode: "AGENT_COMPANY_INPUT_REQUIRED", resultRef: "AGENT_COMPANY_INPUT_REQUIRED", status: "BLOCKED" });
      const response = await input.commandBoundary.execute({
        actorId: input.actorId,
        commandId: agentCompanyCommandId(operationIdentity, createAgentCompanyInputFingerprint(workday)),
        contractVersion: "1",
        input: Object.freeze({ workday }),
        operation: "RUN_AGENT_COMPANY_WORKDAY",
        workspaceId: input.workspaceId,
      });
      signal.throwIfAborted();
      const workdayResult = assertAgentCompanyResponse(response);
      const resultRef = fingerprintRef("company", workdayResult.inputFingerprint);
      return workdayResult.status === "BLOCKED"
        ? Object.freeze({ reasonCode: agentCompanyBlockReasonCode(workdayResult), resultRef, status: "BLOCKED" })
        : Object.freeze({ resultRef, status: "COMPLETED" });
    },
  };
  return Object.freeze(callbacks);
}

function fingerprintRef(prefix: "company" | "daily" | "founder", fingerprint: string): string {
  if (!/^[a-f0-9]{64}$/u.test(fingerprint)) throw new RepositoryValidationError("Local workflow fingerprint is invalid");
  return `${prefix}-${fingerprint.slice(0, 48)}`;
}

function agentCompanyCommandId(operationIdentity: string, inputFingerprint: string): string {
  return `ops-agent-company-${createHash("sha256").update(`${operationIdentity}\n${inputFingerprint}`, "utf8").digest("hex").slice(0, 40)}`;
}

function assertAgentCompanyResponse(response: LocalWorkflowCommandResponse): AgentCompanyWorkday {
  const value = response.result;
  if (typeof value !== "object" || value === null || !("inputFingerprint" in value) || !("status" in value) || typeof value.inputFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(value.inputFingerprint) || !["AWAITING_FABIO", "BLOCKED"].includes(String(value.status)) || (value.status === "BLOCKED" && (!("tasks" in value) || !Array.isArray(value.tasks)))) throw new RepositoryValidationError("Agent Company workflow response is invalid");
  return value as AgentCompanyWorkday;
}

function agentCompanyBlockReasonCode(workday: AgentCompanyWorkday): OperationsJobBlock["code"] {
  const blocked = workday.tasks.find(({ status }) => status === "BLOCKED");
  const reasonCode = blocked?.blocker?.reasonCode;
  if (typeof reasonCode !== "string" || !(AGENT_COMPANY_BLOCK_REASON_CODES as readonly string[]).includes(reasonCode)) throw new RepositoryValidationError("Agent Company workflow BLOCKED reason is invalid");
  return reasonCode as OperationsJobBlock["code"];
}
