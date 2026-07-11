import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { LocalCliConfigValidator, LocalWorkflowCommandValidator, WorkflowDefinitionValidator, WorkflowInstanceValidator } from "../../src/index.js";

describe("Core V1 Operator and Recovery Guide", () => {
  it("tracks one truthful guide with valid bounded configuration and command fixtures", async () => {
    const guide = await readFile("docs/CORE_V1_OPERATOR_GUIDE.md", "utf8");
    for (const required of ["CREATE_MISSION", "PLAN_MISSION", "GET_OPERATOR_REPORT", "RECORD_APPROVAL", "RECORD_GUARDIAN", "INVOKE_AGENT", "ACCEPT_OUTCOME", "REJECT_OUTCOME", "AUTHORIZE_RETRY", "EXECUTE_RETRY", "PAUSE_WORKFLOW", "RESUME_WORKFLOW", "CANCEL_WORKFLOW", "EVALUATE_TIMEOUT", "SIGINT", "origin/main...HEAD", "does not include GPT or Claude"]) expect(guide).toContain(required);
    expect(guide).not.toMatch(/sk-[a-z0-9]|api[_-]?key|autonomously publish/iu);

    const config = JSON.parse(await readFile("examples/core-v1/local-config.json", "utf8")) as unknown;
    expect(new LocalCliConfigValidator().validate(config).ok).toBe(true);
    const create = JSON.parse(await readFile("examples/core-v1/create-workflow.json", "utf8")) as unknown;
    const command = new LocalWorkflowCommandValidator().validate(create);
    expect(command.ok).toBe(true);
    if (!command.ok) throw new Error("invalid command fixture");
    expect(new WorkflowDefinitionValidator().validate(command.value.input.definition).ok).toBe(true);
    expect(new WorkflowInstanceValidator().validate(command.value.input.instance).ok).toBe(true);
    const report = JSON.parse(await readFile("examples/core-v1/get-operator-report.json", "utf8")) as unknown;
    expect(new LocalWorkflowCommandValidator().validate(report).ok).toBe(true);
  });
});
