import { createHash } from "node:crypto";

export const OFFLINE_PROVIDER_SUITE_CONTRACT_VERSION = "1" as const;
export const OFFLINE_PROVIDER_ID = "onlyway-offline-rehearsal" as const;

export type OfflineProviderOperation =
  | "ANALYTICS"
  | "IMAGE"
  | "INSTAGRAM"
  | "PUBLICATION"
  | "RESEARCH"
  | "TELEGRAM"
  | "TEXT"
  | "TIKTOK"
  | "VIDEO";

export interface OfflineProviderReceipt {
  readonly contractVersion: "1";
  readonly costCents: 0;
  readonly externalEffectsExecuted: false;
  readonly operation: OfflineProviderOperation;
  readonly outputFingerprint: string;
  readonly paidProviderCalls: 0;
  readonly providerId: typeof OFFLINE_PROVIDER_ID;
  readonly receiptId: string;
  readonly simulated: true;
}

const MAX_INPUT_CHARACTERS = 65_536;
const PROHIBITED =
  /(?:\bsk-[A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z0-9._~+/-]{12,}|\bpassword\b|\bsecret\b)/iu;

/**
 * A deliberately capability-free provider suite. It has no transport,
 * resolver, socket, filesystem, or process dependency and can only produce
 * deterministic simulation receipts.
 */
export class DeterministicOfflineProviderSuite {
  public invoke(
    operation: OfflineProviderOperation,
    input: Readonly<Record<string, unknown>>,
  ): OfflineProviderReceipt {
    const serialized = JSON.stringify({ input, operation });
    if (
      serialized.length > MAX_INPUT_CHARACTERS ||
      PROHIBITED.test(serialized)
    ) {
      throw new Error("Offline provider input is invalid");
    }
    const outputFingerprint = createHash("sha256")
      .update(`${OFFLINE_PROVIDER_ID}\n${serialized}`, "utf8")
      .digest("hex");
    return Object.freeze({
      contractVersion: OFFLINE_PROVIDER_SUITE_CONTRACT_VERSION,
      costCents: 0,
      externalEffectsExecuted: false,
      operation,
      outputFingerprint,
      paidProviderCalls: 0,
      providerId: OFFLINE_PROVIDER_ID,
      receiptId: `offline-${operation.toLocaleLowerCase("en")}-${outputFingerprint.slice(0, 40)}`,
      simulated: true,
    });
  }
}
