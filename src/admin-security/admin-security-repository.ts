import type { AdminSecurityState } from "./admin-security-contracts.js";

/**
 * Provider-neutral optimistic repository boundary.
 *
 * Implementations must atomically persist `nextState` only when the currently
 * stored revision equals `expectedRevision`.
 */
export interface AdminSecurityRepository {
  compareAndSet(
    expectedRevision: number,
    nextState: AdminSecurityState,
  ): Promise<boolean>;
  read(): Promise<AdminSecurityState>;
}
