import type {
  AgentInvocation,
  AgentResult,
} from "../contracts/agent-execution.js";
import type { ErrorCategory } from "../contracts/error-record.js";
import { AgentRuntimeError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import type { AgentExecutor, AgentRuntime } from "./agent-runtime.js";

export class InProcessAgentRuntime implements AgentRuntime {
  readonly #clock: Clock;
  readonly #executors: ReadonlyMap<string, AgentExecutor>;
  readonly #invocationValidator: Validator<AgentInvocation>;
  readonly #resultValidator: Validator<AgentResult>;

  public constructor(
    executors: readonly AgentExecutor[],
    invocationValidator: Validator<AgentInvocation>,
    resultValidator: Validator<AgentResult>,
    clock: Clock,
  ) {
    const executorMap = new Map<string, AgentExecutor>();
    for (const executor of executors) {
      const key = agentKey(executor.agent.agentId, executor.agent.version);
      if (executorMap.has(key)) {
        throw new AgentRuntimeError(
          "agent_runtime_invariant",
          `Agent executor ${key} is registered more than once`,
          {
            agentId: executor.agent.agentId,
            version: executor.agent.version,
          },
        );
      }
      executorMap.set(key, executor);
    }

    this.#clock = clock;
    this.#executors = executorMap;
    this.#invocationValidator = invocationValidator;
    this.#resultValidator = resultValidator;
  }

  public async execute(invocation: AgentInvocation): Promise<AgentResult> {
    const invocationValidation =
      this.#invocationValidator.validate(invocation);
    if (!invocationValidation.ok) {
      throw new AgentRuntimeError(
        "agent_invocation_invalid",
        "Agent invocation failed runtime validation",
        {
          issues: invocationValidation.issues.map(
            ({ code, message, path }) => ({
              code,
              message,
              path,
            }),
          ),
        },
      );
    }

    const validatedInvocation = invocationValidation.value;
    const executor = this.#executors.get(
      agentKey(
        validatedInvocation.agent.agentId,
        validatedInvocation.agent.version,
      ),
    );
    if (executor === undefined) {
      return this.#failureResult(
        validatedInvocation,
        "agent_executor_not_found",
        "No executor is registered for the selected agent",
        "not_found",
      );
    }

    let candidate: unknown;
    try {
      candidate = await executor.execute(validatedInvocation);
    } catch {
      return this.#failureResult(
        validatedInvocation,
        "agent_execution_failed",
        "Agent execution failed",
        "internal",
      );
    }

    const resultValidation = this.#resultValidator.validate(candidate);
    if (!resultValidation.ok) {
      return this.#failureResult(
        validatedInvocation,
        "agent_result_invalid",
        "Agent returned an invalid result",
        "validation",
      );
    }

    const result = resultValidation.value;
    if (
      result.invocationId !== validatedInvocation.invocationId ||
      result.taskId !== validatedInvocation.taskId ||
      result.agent.agentId !== validatedInvocation.agent.agentId ||
      result.agent.version !== validatedInvocation.agent.version
    ) {
      return this.#failureResult(
        validatedInvocation,
        "agent_result_mismatch",
        "Agent result identity does not match the invocation",
        "conflict",
      );
    }

    if (
      result.output !== undefined &&
      Buffer.byteLength(JSON.stringify(result.output), "utf8") >
        validatedInvocation.limits.maxResultBytes
    ) {
      return this.#failureResult(
        validatedInvocation,
        "agent_result_too_large",
        "Agent result exceeds the configured size limit",
        "validation",
      );
    }

    return result;
  }

  #failureResult(
    invocation: AgentInvocation,
    code: string,
    message: string,
    category: ErrorCategory,
  ): AgentResult {
    const completedAt = this.#timestamp();
    const candidate: AgentResult = {
      agent: Object.freeze({ ...invocation.agent }),
      completedAt,
      contractVersion: "1",
      error: {
        category,
        code,
        message,
        occurredAt: completedAt,
        retryable: false,
        stage: "agent_execution",
      },
      evidence: Object.freeze([]),
      invocationId: invocation.invocationId,
      memoryProposals: Object.freeze([]),
      status: "failed",
      taskId: invocation.taskId,
    };
    const validation = this.#resultValidator.validate(candidate);
    if (!validation.ok) {
      throw new AgentRuntimeError(
        "agent_runtime_invariant",
        "Runtime generated an invalid failure result",
        {
          issues: validation.issues.map(({ code, message: detail, path }) => ({
            code,
            message: detail,
            path,
          })),
        },
      );
    }

    return validation.value;
  }

  #timestamp(): string {
    const value = this.#clock.now();
    if (Number.isNaN(value.getTime())) {
      throw new AgentRuntimeError(
        "agent_runtime_invariant",
        "Clock returned an invalid date",
      );
    }
    return value.toISOString();
  }
}

function agentKey(agentId: string, version: string): string {
  return `${agentId}@${version}`;
}
