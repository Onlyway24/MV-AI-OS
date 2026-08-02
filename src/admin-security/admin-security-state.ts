import {
  AdminSecurityError,
  type AdminSecurityState,
} from "./admin-security-contracts.js";
import type { AdminSecurityRepository } from "./admin-security-repository.js";

const DEFAULT_CONFLICT_RETRIES = 12;

export interface AdminSecurityStateMutation<T> {
  readonly result: T;
  readonly state: Omit<AdminSecurityState, "revision">;
}

export const mutateAdminSecurityState = async <T>(
  repository: AdminSecurityRepository,
  mutate: (state: AdminSecurityState) => AdminSecurityStateMutation<T>,
  conflictRetries = DEFAULT_CONFLICT_RETRIES,
): Promise<T> => {
  for (let attempt = 0; attempt < conflictRetries; attempt += 1) {
    const current = await repository.read();
    const mutation = mutate(structuredClone(current));
    const next: AdminSecurityState = Object.freeze({
      ...mutation.state,
      revision: current.revision + 1,
    });
    if (await repository.compareAndSet(current.revision, next)) {
      return mutation.result;
    }
  }
  throw new AdminSecurityError(
    "REPOSITORY_CONFLICT",
    "Admin security state changed concurrently.",
  );
};

export const withoutRevision = (
  state: AdminSecurityState,
): Omit<AdminSecurityState, "revision"> => {
  const {
    revision: _revision,
    ...without
  } = state;
  void _revision;
  return without;
};
