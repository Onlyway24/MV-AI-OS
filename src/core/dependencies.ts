import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { Logger } from "../logging/logger.js";
import type { Validator } from "../validation/validation.js";
import type { ExecutionContextBuilder } from "./execution-context-builder.js";
import type { Router } from "./routing/router.js";

export type IdentifierScope =
  | "context"
  | "decision"
  | "plan"
  | "plan_step"
  | "task";

export interface Clock {
  now(): Date;
}

export interface IdentifierGenerator {
  next(scope: IdentifierScope): string;
}

export interface CoreBrainDependencies {
  readonly clock: Clock;
  readonly contextBuilder: ExecutionContextBuilder;
  readonly identifiers: IdentifierGenerator;
  readonly logger: Logger;
  readonly requestValidator: Validator<RequestEnvelope>;
  readonly router: Router;
}
