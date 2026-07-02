import type { RoutingDecision } from "./models/decision.js";
import type { ExecutionContext } from "./models/execution-context.js";
import type { RoutedTask } from "./models/task.js";

export interface PreparedExecution {
  readonly context: ExecutionContext;
  readonly decision: RoutingDecision;
  readonly task: RoutedTask;
}
