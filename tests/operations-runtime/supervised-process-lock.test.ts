import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryConflictError } from "../../src/errors/core-error.js";
import { SupervisedProcessLock } from "../../src/operations-runtime/supervised-process-lock.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("SupervisedProcessLock atomic publication", () => {
  it.each([
    ["empty", ""],
    ["partial", '{"contractVersion":"1","pid":'],
  ])("fails closed without replacing an existing %s lock record", async (_label, content) => {
    const root = await tempRoot();
    const path = join(root, "runtime.lock");
    await writeFile(path, content, { encoding: "utf8", mode: 0o600 });

    await expect(SupervisedProcessLock.acquire({ instanceId: "candidate", path, role: "worker" })).rejects.toMatchObject({
      code: "repository_conflict",
      message: "Supervised process lock record is invalid",
    });

    await expect(readFile(path, "utf8")).resolves.toBe(content);
    await expect(candidateArtifacts(root)).resolves.toEqual([]);
  });

  it("publishes exactly one complete mode-0600 record under concurrent acquisition", async () => {
    const root = await tempRoot();
    const path = join(root, "runtime.lock");
    const outcomes = await Promise.allSettled(
      Array.from({ length: 24 }, (_, index) => SupervisedProcessLock.acquire({ instanceId: `worker-${String(index)}`, path, role: "worker" })),
    );
    const acquired = outcomes.filter((outcome): outcome is PromiseFulfilledResult<SupervisedProcessLock> => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");

    expect(acquired).toHaveLength(1);
    expect(rejected).toHaveLength(23);
    expect(rejected.every(({ reason }) => reason instanceof RepositoryConflictError)).toBe(true);
    expect(rejected.every(({ reason }) => !(reason instanceof Error) || !reason.message.includes("record is invalid"))).toBe(true);
    await expect(readFile(path, "utf8").then((text) => JSON.parse(text) as unknown)).resolves.toMatchObject({
      contractVersion: "1",
      pid: process.pid,
      role: "worker",
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(candidateArtifacts(root)).resolves.toEqual([]);

    const [winner] = acquired;
    if (winner === undefined) throw new Error("Expected one acquired process lock");
    await winner.value.close();
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("elects one owner during concurrent stale recovery and leaves no recovery artifacts", async () => {
    const root = await tempRoot();
    const path = join(root, "runtime.lock");
    await writeFile(path, `${JSON.stringify({ contractVersion: "1", createdAt: "2026-07-19T00:00:00.000Z", instanceId: "stale", pid: 2_147_483_647, role: "worker", token: "lock-stale" })}\n`, { encoding: "utf8", mode: 0o600 });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 24 }, (_, index) => SupervisedProcessLock.acquire({ instanceId: `recovery-${String(index)}`, path, role: "worker" })),
    );
    const acquired = outcomes.filter((outcome): outcome is PromiseFulfilledResult<SupervisedProcessLock> => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");

    expect(acquired).toHaveLength(1);
    expect(rejected).toHaveLength(23);
    expect(rejected.every(({ reason }) => reason instanceof RepositoryConflictError)).toBe(true);
    expect(rejected.every(({ reason }) => !(reason instanceof Error) || !reason.message.includes("record is invalid"))).toBe(true);
    await expect(readFile(path, "utf8").then((text) => JSON.parse(text) as unknown)).resolves.toMatchObject({
      contractVersion: "1",
      pid: process.pid,
      role: "worker",
    });
    await expect(candidateArtifacts(root)).resolves.toEqual([]);

    const [winner] = acquired;
    if (winner === undefined) throw new Error("Expected one recovered process lock");
    await winner.value.close();
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reclaims one matching orphaned recovery claim and leaves no coordination artifacts", async () => {
    const root = await tempRoot();
    const path = join(root, "runtime.lock");
    const stale = { contractVersion: "1", createdAt: "2026-07-19T00:00:00.000Z", instanceId: "stale", pid: 2_147_483_647, role: "worker", token: "lock-stale-orphan" };
    await writeFile(path, `${JSON.stringify(stale)}\n`, { encoding: "utf8", mode: 0o600 });
    const identity = await stat(path);
    await writeFile(`${path}.recovery`, `${JSON.stringify({ contractVersion: "1", createdAt: "2026-07-19T00:01:00.000Z", expectedDevice: identity.dev, expectedInode: identity.ino, expectedToken: stale.token, ownerPid: 2_147_483_647, token: "recovery-orphan" })}\n`, { encoding: "utf8", mode: 0o600 });

    const recovered = await SupervisedProcessLock.acquire({ instanceId: "recovered-after-orphan", path, role: "worker" });
    await expect(readFile(path, "utf8").then((text) => JSON.parse(text) as unknown)).resolves.toMatchObject({ instanceId: "recovered-after-orphan", pid: process.pid });
    await expect(candidateArtifacts(root)).resolves.toEqual([]);
    await recovered.close();
  });
});

async function candidateArtifacts(root: string): Promise<readonly string[]> {
  return (await readdir(root)).filter((name) => name.includes(".candidate.") || name.endsWith(".recovery"));
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mv-ai-os-process-lock-"));
  roots.push(root);
  return root;
}
