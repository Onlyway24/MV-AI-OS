export interface AgentLimit {
  readonly timeoutMs: number;
  readonly maxInputBytes: number;
  readonly maxResultBytes: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
}
