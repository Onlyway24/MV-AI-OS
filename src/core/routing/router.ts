import type { AgentManifest } from "../../agents/agent-manifest.js";
import type { RequestEnvelope } from "../../contracts/request-envelope.js";
import type { RoutingDecision } from "../models/decision.js";
import type { TaskRecord } from "../models/task.js";

export interface RouteInput {
  readonly task: TaskRecord;
  readonly request: RequestEnvelope;
}

export interface RouteResult {
  readonly decision: RoutingDecision;
  readonly agent: AgentManifest;
}

export interface Router {
  route(input: RouteInput): Promise<RouteResult>;
}
