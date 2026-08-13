import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import {
  execFileSync,
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/production/pre-scan-verification.sh");
const BRANCH = "main";
const SIGNATURE_IDENTITY = "onlyway-pre-scan";
const SIGNATURE_NAMESPACE = "onlyway-pre-scan-verification-v1";
const REQUIRED_TOOLS = ["bash", "git", "jq", "node", "npm", "ssh-keygen"];
const FUNCTIONAL_TESTS_AVAILABLE = REQUIRED_TOOLS.every((command) =>
  spawnSync(command, command === "ssh-keygen" ? ["-?"] : ["--version"], {
    encoding: "utf8",
  }).error === undefined
);
const functionalIt = FUNCTIONAL_TESTS_AVAILABLE ? it : it.skip;

describe("pre-scan verification script", () => {
  it("keeps the pre-scan boundary explicit and fail-closed", async () => {
    const source = await readFile(SCRIPT, "utf8");
    expect(source).toContain('readonly REQUIRED_BRANCH="main"');
    expect(source).toContain("run pre-scan verification as the local operator, not root");
    expect(source).toContain('git ls-remote --exit-code "$REMOTE_URL" "$REMOTE_REF"');
    expect(source).toContain('(cd -- "$REPOSITORY" && npm run check)');
    expect(source).toContain('suiteCommand: "npm run check"');
    expect(source).toContain('status: "PASSED"');
    expect(source).toContain("ssh-keygen -Y sign");
    expect(source).toContain("ssh-keygen -Y verify");
    expect(source).toContain('ln "$SIGNATURE_TEMPORARY" "$OUTPUT_SIGNATURE"');
    expect(source).toContain('ln "$RECEIPT_TEMPORARY" "$OUTPUT"');
    expect(source).toContain('fsync_paths "$OUTPUT_PARENT"');
  });

  functionalIt(
    "runs the exact full suite, emits bounded mode-0600 evidence and detects tamper, a missing signature and a wrong verifier key",
    async () => {
      const fixture = await createFixture();
      try {
        const execution = runScript(fixture);
        expect(execution.status, execution.stderr).toBe(0);
        expect(await readFile(fixture.npmMarker, "utf8")).toBe("run check\n");

        const receiptBytes = await readFile(fixture.output);
        const receipt = JSON.parse(receiptBytes.toString("utf8")) as {
          readonly branch: string;
          readonly commit: string;
          readonly completedAt: string;
          readonly contractVersion: string;
          readonly gitTree: string;
          readonly kind: string;
          readonly remote: Readonly<{
            readonly commit: string;
            readonly name: string;
            readonly ref: string;
            readonly url: string;
          }>;
          readonly secretsExposed: boolean;
          readonly signature: Readonly<{
            readonly algorithm: string;
            readonly namespace: string;
            readonly signerFingerprint: string;
            readonly signerPublicKey: string;
          }>;
          readonly startedAt: string;
          readonly status: string;
          readonly suiteCommand: string;
          readonly suiteStatus: string;
          readonly workingTree: string;
        };
        expect(receipt).toMatchObject({
          branch: BRANCH,
          commit: fixture.commit,
          contractVersion: "1",
          gitTree: fixture.gitTree,
          kind: "PRE_SCAN_VERIFICATION_RECEIPT",
          remote: {
            commit: fixture.commit,
            name: "origin",
            ref: `refs/heads/${BRANCH}`,
            url: fixture.remote,
          },
          secretsExposed: false,
          signature: {
            algorithm: "OPENSSH_SSHSIG_ED25519",
            namespace: SIGNATURE_NAMESPACE,
          },
          status: "PASSED",
          suiteCommand: "npm run check",
          suiteStatus: "PASSED",
          workingTree: "CLEAN",
        });
        expect(receipt.commit).toMatch(/^[a-f0-9]{40}$/u);
        expect(receipt.gitTree).toMatch(/^[a-f0-9]{40}$/u);
        expect(receipt.signature.signerFingerprint).toMatch(
          /^SHA256:[A-Za-z0-9+/]{43}$/u,
        );
        expect(receipt.signature.signerPublicKey).toMatch(
          /^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$/u,
        );
        expect(Date.parse(receipt.startedAt)).not.toBeNaN();
        expect(Date.parse(receipt.completedAt)).not.toBeNaN();
        expect(Date.parse(receipt.completedAt)).toBeGreaterThanOrEqual(
          Date.parse(receipt.startedAt),
        );
        expect(receiptBytes.byteLength).toBeGreaterThan(0);
        expect(receiptBytes.byteLength).toBeLessThanOrEqual(65_536);
        expect((await stat(fixture.output)).mode & 0o777).toBe(0o600);
        expect((await stat(`${fixture.output}.sig`)).mode & 0o777).toBe(0o600);
        expect(await verifyEvidence(
          fixture.output,
          `${fixture.signingKey}.pub`,
        )).toBe(true);

        const otherKey = join(fixture.root, "wrong-verifier");
        generateKey(otherKey);
        expect(await verifyEvidence(
          fixture.output,
          `${otherKey}.pub`,
        )).toBe(false);

        await appendFile(fixture.output, "\n", "utf8");
        expect(await verifyEvidence(
          fixture.output,
          `${fixture.signingKey}.pub`,
        )).toBe(false);

        await rm(`${fixture.output}.sig`);
        expect(await verifyEvidence(
          fixture.output,
          `${fixture.signingKey}.pub`,
        )).toBe(false);
      } finally {
        await rm(fixture.root, { force: true, recursive: true });
      }
    },
    30_000,
  );

  functionalIt(
    "rejects a missing signing key and a mismatched private/public key pair without publishing evidence",
    async () => {
      const missing = await createFixture();
      try {
        const execution = runScript(missing, {
          signingKey: join(missing.root, "missing-signing-key"),
        });
        expect(execution.status).not.toBe(0);
        expect(execution.stderr).toContain(
          "dedicated Ed25519 signing key is unavailable",
        );
        await expect(access(missing.output)).rejects.toThrow();
        await expect(access(missing.npmMarker)).rejects.toThrow();
      } finally {
        await rm(missing.root, { force: true, recursive: true });
      }

      const mismatch = await createFixture();
      try {
        const wrongKey = join(mismatch.root, "wrong-pair");
        generateKey(wrongKey);
        await copyFile(`${wrongKey}.pub`, `${mismatch.signingKey}.pub`);
        await chmod(`${mismatch.signingKey}.pub`, 0o644);
        prepareRunnerOwnership(mismatch.root);
        const execution = runScript(mismatch);
        expect(execution.status).not.toBe(0);
        expect(execution.stderr).toContain(
          "dedicated signing key does not match its public key",
        );
        await expect(access(mismatch.output)).rejects.toThrow();
        await expect(access(mismatch.npmMarker)).rejects.toThrow();
      } finally {
        await rm(mismatch.root, { force: true, recursive: true });
      }
    },
    30_000,
  );

  functionalIt(
    "rejects a dirty worktree and a local HEAD that differs from origin feature HEAD",
    async () => {
      const dirty = await createFixture({
        beforeRunnerOwnership: async ({ repository }) => {
          await writeFile(join(repository, "untracked.txt"), "dirty\n", "utf8");
        },
      });
      try {
        const execution = runScript(dirty);
        expect(execution.status).not.toBe(0);
        expect(execution.stderr).toContain("working tree is not clean");
        await expect(access(dirty.output)).rejects.toThrow();
        await expect(access(dirty.npmMarker)).rejects.toThrow();
      } finally {
        await rm(dirty.root, { force: true, recursive: true });
      }

      const mismatch = await createFixture({
        beforeRunnerOwnership: async ({ repository }) => {
          await appendFile(join(repository, "tracked.txt"), "local-only\n");
          git(repository, "add", "tracked.txt");
          git(repository, "commit", "-m", "local only");
        },
      });
      try {
        const execution = runScript(mismatch);
        expect(execution.status).not.toBe(0);
        expect(execution.stderr).toContain(
          "local HEAD does not equal origin feature HEAD",
        );
        await expect(access(mismatch.output)).rejects.toThrow();
        await expect(access(mismatch.npmMarker)).rejects.toThrow();
      } finally {
        await rm(mismatch.root, { force: true, recursive: true });
      }
    },
    30_000,
  );
});

interface Fixture {
  readonly commit: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly gitTree: string;
  readonly npmMarker: string;
  readonly output: string;
  readonly remote: string;
  readonly repository: string;
  readonly root: string;
  readonly runner?: Readonly<{ readonly gid: number; readonly uid: number }>;
  readonly signingKey: string;
}

async function createFixture(options: Readonly<{
  readonly beforeRunnerOwnership?: (
    fixture: Readonly<{ readonly repository: string }>,
  ) => Promise<void>;
}> = {}): Promise<Fixture> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "onlyway-pre-scan-")),
  );
  const remote = join(root, "remote.git");
  const repository = join(root, "repository");
  const fakeBin = join(root, "bin");
  const signingKey = join(root, "pre-scan-ed25519");
  const output = join(root, "pre-scan-verification.json");
  const npmMarker = join(root, "npm-check-invocation.txt");
  await mkdir(fakeBin, { mode: 0o755 });
  git(root, "init", "--bare", remote);
  git(root, "init", repository);
  git(repository, "config", "user.email", "pre-scan@example.invalid");
  git(repository, "config", "user.name", "Pre Scan Test");
  git(repository, "checkout", "-b", BRANCH);
  await writeFile(join(repository, "package.json"), JSON.stringify({
    name: "pre-scan-fixture",
    private: true,
    scripts: { check: "exit 99" },
  }), "utf8");
  await writeFile(join(repository, "tracked.txt"), "verified\n", "utf8");
  git(repository, "add", "package.json", "tracked.txt");
  git(repository, "commit", "-m", "fixture");
  git(repository, "remote", "add", "origin", remote);
  git(repository, "push", "--set-upstream", "origin", BRANCH);
  generateKey(signingKey);
  await writeFile(
    join(fakeBin, "npm"),
    [
      "#!/bin/sh",
      'if [ "$#" -eq 2 ] && [ "$1" = "run" ] && [ "$2" = "check" ]; then',
      '  printf "%s\\n" "run check" >"$PRE_SCAN_NPM_MARKER"',
      "  exit 0",
      "fi",
      "exit 97",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  await options.beforeRunnerOwnership?.({ repository });
  const commit = git(repository, "rev-parse", "HEAD").trim();
  const gitTree = git(repository, "rev-parse", "HEAD^{tree}").trim();
  const runner = prepareRunnerOwnership(root);
  return {
    commit,
    environment: {
      ...process.env,
      HOME: root,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
      PRE_SCAN_NPM_MARKER: npmMarker,
    },
    gitTree,
    npmMarker,
    output,
    remote,
    repository,
    root,
    ...(runner === undefined ? {} : { runner }),
    signingKey,
  };
}

function prepareRunnerOwnership(
  root: string,
): Readonly<{ readonly gid: number; readonly uid: number }> | undefined {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    return undefined;
  }
  const uid = 65_534;
  const gid = 65_534;
  execFileSync("chown", [
    "-R",
    `${String(uid)}:${String(gid)}`,
    root,
  ]);
  return Object.freeze({ gid, uid });
}

function generateKey(path: string): void {
  execFileSync("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    "onlyway-pre-scan-test",
    "-f",
    path,
  ]);
}

function git(cwd: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

function runScript(
  fixture: Fixture,
  overrides: Readonly<{ readonly signingKey?: string }> = {},
) {
  const options: SpawnSyncOptionsWithStringEncoding = {
    cwd: fixture.repository,
    encoding: "utf8",
    env: fixture.environment,
    timeout: 20_000,
    ...(fixture.runner ?? {}),
  };
  return spawnSync("/bin/bash", [
    SCRIPT,
    "--repository",
    fixture.repository,
    "--output",
    fixture.output,
    "--signing-key",
    overrides.signingKey ?? fixture.signingKey,
  ], options);
}

async function verifyEvidence(
  receipt: string,
  publicKeyPath: string,
): Promise<boolean> {
  try {
    const [receiptBytes, signature, publicKey] = await Promise.all([
      readFile(receipt),
      readFile(`${receipt}.sig`),
      readFile(publicKeyPath, "utf8"),
    ]);
    if (
      receiptBytes.byteLength < 1 ||
      receiptBytes.byteLength > 65_536 ||
      signature.byteLength < 1 ||
      signature.byteLength > 16_384
    ) {
      return false;
    }
    const fields = publicKey.trim().split(/\s+/u);
    if (
      fields[0] !== "ssh-ed25519" ||
      fields[1] === undefined ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(fields[1])
    ) {
      return false;
    }
    const root = await mkdtemp(join(tmpdir(), "pre-scan-verifier-"));
    try {
      const allowedSigners = join(root, "allowed-signers");
      await writeFile(
        allowedSigners,
        `${SIGNATURE_IDENTITY} ssh-ed25519 ${fields[1]}\n`,
        { mode: 0o600 },
      );
      const verification = spawnSync("ssh-keygen", [
        "-Y",
        "verify",
        "-f",
        allowedSigners,
        "-I",
        SIGNATURE_IDENTITY,
        "-n",
        SIGNATURE_NAMESPACE,
        "-s",
        `${receipt}.sig`,
      ], {
        encoding: "utf8",
        input: receiptBytes,
      });
      return verification.status === 0;
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  } catch {
    return false;
  }
}
