export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
    };

export interface Validator<T> {
  validate(value: unknown): ValidationResult<T>;
}

export function validationSuccess<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function validationFailure<T>(
  issues: readonly ValidationIssue[],
): ValidationResult<T> {
  return { issues, ok: false };
}
