import { InvariantError } from "../errors/core-error.js";
import type {
  Clock,
  IdentifierGenerator,
  IdentifierScope,
} from "./dependencies.js";

export function currentTimestamp(clock: Clock, stage: string): string {
  const value = clock.now();
  if (Number.isNaN(value.getTime())) {
    throw new InvariantError("Clock returned an invalid date", stage);
  }

  return value.toISOString();
}

export function nextIdentifier(
  identifiers: IdentifierGenerator,
  scope: IdentifierScope,
  stage: string,
): string {
  const value = identifiers.next(scope);
  if (value.trim().length === 0) {
    throw new InvariantError("Identifier generator returned an empty value", stage, {
      scope,
    });
  }

  return value;
}
