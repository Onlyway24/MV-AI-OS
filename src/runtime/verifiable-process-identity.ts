import { randomUUID } from "node:crypto";
import { lstat, readFile, stat } from "node:fs/promises";

const LINUX_BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";
const DECIMAL_ID = /^(?:0|[1-9][0-9]{0,39})$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface LinuxProcessIdentity {
  readonly bootId: string;
  readonly kind: "linux-proc-v1";
  readonly pidNamespaceDevice: string;
  readonly pidNamespaceInode: string;
  readonly processDevice: string;
  readonly processInode: string;
  readonly startTimeTicks: string;
}

export interface LocalProcessIdentity {
  readonly kind: "local-process-v1";
  readonly nonce: string;
}

export type VerifiableProcessIdentity =
  | LinuxProcessIdentity
  | LocalProcessIdentity;

const LOCAL_PROCESS_IDENTITY: LocalProcessIdentity = Object.freeze({
  kind: "local-process-v1",
  nonce: randomUUID(),
});

/**
 * Captures an identity that distinguishes a Linux process instance across PID
 * reuse, host reboot and container PID-namespace replacement.
 */
export async function captureCurrentProcessIdentity(): Promise<VerifiableProcessIdentity> {
  if (process.platform !== "linux") return LOCAL_PROCESS_IDENTITY;
  const identity = await captureLinuxProcessIdentity(process.pid);
  if (identity === undefined) {
    throw new Error("Current Linux process identity is unavailable.");
  }
  return identity;
}

/**
 * Returns true only when the PID currently identifies the exact recorded
 * process instance. Legacy records without an identity retain conservative
 * PID-only behavior for upgrade compatibility.
 */
export async function isRecordedProcessActive(
  pid: number,
  identity: VerifiableProcessIdentity | undefined,
): Promise<boolean> {
  if (identity === undefined) return legacyProcessIsAlive(pid);
  if (identity.kind === "local-process-v1") {
    if (pid === process.pid) {
      return sameProcessIdentity(identity, LOCAL_PROCESS_IDENTITY);
    }
    return legacyProcessIsAlive(pid);
  }
  if (process.platform !== "linux") return legacyProcessIsAlive(pid);
  const current = await captureLinuxProcessIdentity(pid);
  return current !== undefined && sameProcessIdentity(current, identity);
}

export function isVerifiableProcessIdentity(
  value: unknown,
): value is VerifiableProcessIdentity {
  if (!isRecord(value)) return false;
  if (value.kind === "local-process-v1") {
    return hasOnlyKeys(value, ["kind", "nonce"])
      && typeof value.nonce === "string"
      && UUID.test(value.nonce);
  }
  return value.kind === "linux-proc-v1"
    && hasOnlyKeys(value, [
      "bootId",
      "kind",
      "pidNamespaceDevice",
      "pidNamespaceInode",
      "processDevice",
      "processInode",
      "startTimeTicks",
    ])
    && typeof value.bootId === "string"
    && UUID.test(value.bootId)
    && decimalId(value.pidNamespaceDevice)
    && decimalId(value.pidNamespaceInode)
    && decimalId(value.processDevice)
    && decimalId(value.processInode)
    && decimalId(value.startTimeTicks);
}

export function sameProcessIdentity(
  left: VerifiableProcessIdentity,
  right: VerifiableProcessIdentity,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "local-process-v1") {
    return right.kind === "local-process-v1" && left.nonce === right.nonce;
  }
  return right.kind === "linux-proc-v1"
    && left.bootId === right.bootId
    && left.pidNamespaceDevice === right.pidNamespaceDevice
    && left.pidNamespaceInode === right.pidNamespaceInode
    && left.processDevice === right.processDevice
    && left.processInode === right.processInode
    && left.startTimeTicks === right.startTimeTicks;
}

async function captureLinuxProcessIdentity(
  pid: number,
): Promise<LinuxProcessIdentity | undefined> {
  if (!Number.isSafeInteger(pid) || pid < 1) return undefined;
  const processPath = `/proc/${String(pid)}`;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const statBefore = parseLinuxStartTime(
        await readFile(`${processPath}/stat`, "utf8"),
      );
      const processMetadata = await lstat(processPath, { bigint: true });
      const namespaceMetadata = await stat(
        `${processPath}/ns/pid`,
        { bigint: true },
      );
      const statAfter = parseLinuxStartTime(
        await readFile(`${processPath}/stat`, "utf8"),
      );
      if (
        statBefore === undefined
        || statAfter === undefined
        || !processMetadata.isDirectory()
      ) {
        throw new Error("Linux process identity is invalid.");
      }
      if (statBefore !== statAfter) continue;
      const bootId = (await readFile(LINUX_BOOT_ID_PATH, "utf8"))
        .trim()
        .toLowerCase();
      const identity: LinuxProcessIdentity = Object.freeze({
        bootId,
        kind: "linux-proc-v1",
        pidNamespaceDevice: namespaceMetadata.dev.toString(),
        pidNamespaceInode: namespaceMetadata.ino.toString(),
        processDevice: processMetadata.dev.toString(),
        processInode: processMetadata.ino.toString(),
        startTimeTicks: statAfter,
      });
      if (!isVerifiableProcessIdentity(identity)) {
        throw new Error("Linux process identity is invalid.");
      }
      return identity;
    }
    throw new Error("Linux process identity changed while being captured.");
  } catch (error) {
    if (
      isNodeError(error)
      && (error.code === "ENOENT" || error.code === "ESRCH")
    ) {
      return undefined;
    }
    throw error;
  }
}

function parseLinuxStartTime(value: string): string | undefined {
  const commandEnd = value.lastIndexOf(")");
  if (commandEnd < 1) return undefined;
  const fields = value.slice(commandEnd + 1).trim().split(/\s+/u);
  const startTime = fields[19];
  return decimalId(startTime) ? startTime : undefined;
}

function legacyProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(isNodeError(error) && error.code === "ESRCH");
  }
}

function decimalId(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_ID.test(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length
    && keys.every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
