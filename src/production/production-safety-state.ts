import type { OperationsRuntimeControl } from "../operations-runtime/operations-runtime.js";
import type { PublicationKillSwitch } from "../operational-planes/operational-plane.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";

export interface ProductionSafetyState {
  readonly publicationKillSwitch: PublicationKillSwitch;
  readonly runtimeControl: OperationsRuntimeControl;
}

/**
 * Creates only missing production controls. Existing operator decisions are
 * never overwritten. A fresh database starts with publication locked while
 * the private, zero-cost internal scheduler and worker remain available.
 */
export function ensureProductionSafetyState(input: Readonly<{
  readonly actorId: string;
  readonly clock: Clock;
  readonly repositories: RepositoryTransactionRunner;
  readonly workspaceId: string;
}>): Promise<ProductionSafetyState> {
  return input.repositories.transaction(async ({
    operationalPlanes,
    operationsRuntime,
  }) => {
    const now = input.clock.now().toISOString();
    let runtimeControl = await operationsRuntime.getControl(input.workspaceId);
    if (runtimeControl === undefined) {
      runtimeControl = Object.freeze({
        contractVersion: "1",
        killSwitch: "RELEASED",
        maintenanceMode: "DISABLED",
        reasonCode: "PRIVATE_OFFLINE_PRODUCTION_BOOTSTRAP",
        updatedAt: now,
        updatedBy: input.actorId,
        version: 1,
        workspaceId: input.workspaceId,
      });
      await operationsRuntime.updateControl(runtimeControl, { version: 0 });
    }

    let publicationKillSwitch =
      await operationalPlanes.getPublicationKillSwitch(input.workspaceId);
    if (publicationKillSwitch === undefined) {
      publicationKillSwitch = Object.freeze({
        enabled: true,
        updatedAt: now,
        updatedBy: input.actorId,
        version: 1,
        workspaceId: input.workspaceId,
      });
      await operationalPlanes.upsertPublicationKillSwitch(
        publicationKillSwitch,
        { version: 0 },
      );
    }

    return Object.freeze({ publicationKillSwitch, runtimeControl });
  });
}
