import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

const SHA = {
  coherentCopy: "d".repeat(64),
  container: ["1", "2", "3", "4"].map((digit) => digit.repeat(64)),
  fingerprint: "a".repeat(64),
  sourceDatabase: "b".repeat(64),
  sourceRuntime: "c".repeat(64),
} as const;

function initialQuiesceReceipt(): Readonly<Record<string, unknown>> {
  return {
    confirmedAction: "QUIESCE_AND_COPY_LEGACY_V1",
    containers: {
      configurationFingerprint: SHA.fingerprint,
      exactIdentities: [
        { id: SHA.container[0], name: "command-center" },
        { id: SHA.container[1], name: "scheduler" },
        { id: SHA.container[2], name: "worker" },
        { id: SHA.container[3], name: "health-monitor" },
      ],
      restartPolicyAfterQuiesce: "no",
      restartPolicyBeforeQuiesce: "unless-stopped",
      runningAfterQuiesce: false,
    },
    contractVersion: "1",
    copy: {
      database: { sha256: SHA.coherentCopy },
      forensicDatabase: { sha256: SHA.sourceDatabase },
      runtimeConfig: { sha256: SHA.sourceRuntime },
    },
    kind: "LEGACY_MIGRATION_QUIESCE_COPY",
    legacyBoundary: {
      adminPepper: { status: "ABSENT" },
      adminSecurityState: { status: "ABSENT" },
      bootstrap: { secretCopied: false },
      dormantSecret: { contentRead: false, importAllowed: false },
    },
    quiescePhase: "INITIAL",
    retention: {
      legacyContainersRemoved: false,
      originalSourcesRemoved: false,
    },
    rollbackEvidence: {
      firstSuccessMarker: null,
      firstSuccessMarkerSha256: "NOT_APPLICABLE_INITIAL_QUIESCE",
      firstSuccessSignatureSha256: "NOT_APPLICABLE_INITIAL_QUIESCE",
      receiptPath: null,
      receiptSha256: "NOT_APPLICABLE_INITIAL_QUIESCE",
      signatureSha256: "NOT_APPLICABLE_INITIAL_QUIESCE",
    },
    secretsExposed: false,
    source: {
      database: { sha256: SHA.sourceDatabase },
      directories: ["/srv/onlyway/config", "/srv/onlyway/data", "/srv/onlyway/run"],
      runtimeConfig: { sha256: SHA.sourceRuntime },
    },
    status: "QUIESCED_COPY_VERIFIED",
  };
}

function jq(program: string, input: unknown): Promise<string> {
  try {
    return Promise.resolve(
      execFileSync("jq", ["-S", "-e", "-f", resolve(ROOT, program)], {
        encoding: "utf8",
        input: JSON.stringify(input),
      }),
    );
  } catch (error: unknown) {
    return Promise.reject(
      error instanceof Error ? error : new Error("jq execution failed"),
    );
  }
}

describe("legacy deployment integration", () => {
  it("imports only a signed coherent copy and restores legacy on failure", async () => {
    const script = await readFile(
      resolve(ROOT, "scripts/production/deploy-release.sh"),
      "utf8",
    );

    expect(script).toContain("--legacy-quiesce-receipt");
    expect(script).toContain("--legacy-quiesce-signature");
    expect(script).toContain("--legacy-rollback-receipt");
    expect(script).toContain("legacy_verify_signed_json");
    expect(script).toContain(
      'CANDIDATE_DATABASE=$LEGACY_DATABASE_COPY',
    );
    expect(script).toContain("install_verified_candidate_database");
    expect(script).toContain('GPG_AES256_SYMMETRIC');
    expect(script).toContain('--decrypt --output "$temporary" "$encrypted_backup"');
    expect(script).toContain(
      '"$CANDIDATE_DATABASE" "${CANDIDATE_ROOT}/data/mv-ai-os.sqlite"',
    );
    expect(script).toContain("install_migrated_live_state");
    expect(script).toContain("rollback_quiesced_legacy");
    expect(script).toContain("ROLLBACK_QUIESCED_LEGACY_V1");
    expect(script).toContain("LEGACY_ROLLBACK_ARMED=true");
    expect(script).toContain("MIGRATED_LIVE_STATE_MUTATED=true");
    expect(script).toContain("remove_first_deploy_application_state");
    expect(script).toContain(
      "pre-existing containers require the signed legacy migration boundary",
    );
    expect(script).not.toMatch(
      /install[^\n]*LEGACY_DATABASE_FORENSIC|install[^\n]*DATABASE_SOURCE/u,
    );

    const earlyTrapIndex = script.indexOf("trap early_legacy_on_exit EXIT");
    const rollbackArmedIndex = script.indexOf("LEGACY_ROLLBACK_ARMED=true");
    const fullContractIndex = script.indexOf(
      'lib/legacy-deploy-quiesce-contract.jq',
    );
    const diskGuardIndex = script.indexOf("DEPLOY_REQUIRED_KIB=");
    const candidateIndex = script.indexOf(
      "PROMOTION_STEP=candidate-offline-rehearsal",
    );
    const transactionIndex = script.indexOf(
      "PROMOTION_STEP=promotion-transaction-snapshot",
    );
    const revalidationIndex = script.indexOf(
      "PROMOTION_STEP=legacy-quiesce-revalidation",
    );
    const migratedStateIndex = script.indexOf(
      "install_migrated_live_state",
      revalidationIndex,
    );
    const systemdStartIndex = script.indexOf(
      "PROMOTION_STEP=systemd-restart",
    );

    expect(earlyTrapIndex).toBeGreaterThan(0);
    expect(rollbackArmedIndex).toBeGreaterThan(earlyTrapIndex);
    expect(fullContractIndex).toBeGreaterThan(rollbackArmedIndex);
    expect(diskGuardIndex).toBeGreaterThan(fullContractIndex);
    expect(candidateIndex).toBeGreaterThan(0);
    expect(transactionIndex).toBeGreaterThan(candidateIndex);
    expect(revalidationIndex).toBeGreaterThan(transactionIndex);
    expect(migratedStateIndex).toBeGreaterThan(revalidationIndex);
    expect(systemdStartIndex).toBeGreaterThan(migratedStateIndex);
  });

  it("renders the migrated runtime into the zero-cost offline contract", async () => {
    const script = await readFile(
      resolve(ROOT, "scripts/production/deploy-release.sh"),
      "utf8",
    );

    expect(script).toContain("lib/render-legacy-runtime.jq");
    const rendered = JSON.parse(
      await jq("scripts/production/lib/render-legacy-runtime.jq", {
        actorId: "fabio",
        contentAgentMode: "deterministic",
        contractVersion: "1",
        permissions: {
          actorGrants: [],
          policyGrants: [],
          taskGrants: [],
        },
        sqlite: { path: "/data/onlyway.sqlite", timeoutMs: 5_000 },
        workspaceId: "onlyway-private",
      }),
    ) as {
      readonly runtime: Readonly<Record<string, unknown>>;
    };
    expect(rendered.runtime).toMatchObject({
      actorId: "fabio",
      contentAgentMode: "deterministic",
      providerMode: "OFFLINE_REHEARSAL",
      sqlite: {
        path: "/var/lib/onlyway/mv-ai-os.sqlite",
        timeoutMs: 5_000,
      },
      workspaceId: "onlyway-private",
    });
    await expect(
      jq("scripts/production/lib/render-legacy-runtime.jq", {
        actorId: "fabio",
        contentAgentMode: "deterministic",
        contractVersion: "1",
        modelProvider: { providerId: "openai" },
        permissions: {
          actorGrants: [],
          policyGrants: [],
          taskGrants: [],
        },
        providerMode: "LIVE_PAID",
        sqlite: { path: "/data/onlyway.sqlite", timeoutMs: 5_000 },
        workspaceId: "onlyway-private",
      }),
    ).rejects.toThrow();
  });

  it("accepts a distinct coherent SQLite backup but binds the forensic copy to the source", async () => {
    await expect(
      jq(
        "scripts/production/lib/legacy-deploy-quiesce-contract.jq",
        initialQuiesceReceipt(),
      ),
    ).resolves.toContain("true");

    const wrongForensic = structuredClone(initialQuiesceReceipt()) as {
      copy: { forensicDatabase: { sha256: string } };
    };
    wrongForensic.copy.forensicDatabase.sha256 = "e".repeat(64);
    await expect(
      jq(
        "scripts/production/lib/legacy-deploy-quiesce-contract.jq",
        wrongForensic,
      ),
    ).rejects.toThrow();
  });

  it("enforces phase-specific INITIAL and FORWARD evidence", async () => {
    const forward = structuredClone(initialQuiesceReceipt()) as Record<
      string,
      unknown
    >;
    forward.confirmedAction = "REQUIESCE_FOR_FORWARD_DEPLOY_V1";
    forward.quiescePhase = "FORWARD_AFTER_ROLLBACK";
    forward.legacyBoundary = {
      adminPepper: { status: "RETAINED_NEW_STACK_PEPPER" },
      adminSecurityState: { status: "RETAINED_NEW_STACK_STATE" },
      bootstrap: { secretCopied: false },
      dormantSecret: { contentRead: false, importAllowed: false },
    };
    forward.rollbackEvidence = {
      firstSuccessMarker: "/srv/onlyway/run/legacy-first-success.json",
      firstSuccessMarkerSha256: "f".repeat(64),
      firstSuccessSignatureSha256: "1".repeat(64),
      receiptPath: "/srv/onlyway/run/legacy-cutover-rollback.json",
      receiptSha256: "2".repeat(64),
      signatureSha256: "3".repeat(64),
    };
    await expect(
      jq(
        "scripts/production/lib/legacy-deploy-quiesce-contract.jq",
        forward,
      ),
    ).resolves.toContain("true");

    const mixedPhase = structuredClone(forward);
    mixedPhase.confirmedAction = "QUIESCE_AND_COPY_LEGACY_V1";
    await expect(
      jq(
        "scripts/production/lib/legacy-deploy-quiesce-contract.jq",
        mixedPhase,
      ),
    ).rejects.toThrow();
  });

  it("arms cleanup before a partial candidate start can fail", async () => {
    const script = await readFile(
      resolve(ROOT, "scripts/production/deploy-release.sh"),
      "utf8",
    );
    const startAttemptIndex = script.indexOf("CANDIDATE_START_ATTEMPTED=true");
    const composeUpIndex = script.indexOf(
      "candidate_compose up --detach --remove-orphans",
    );
    expect(startAttemptIndex).toBeGreaterThan(0);
    expect(composeUpIndex).toBeGreaterThan(startAttemptIndex);
    expect(script).toContain(
      'label=com.docker.compose.project=${CANDIDATE_PROJECT}',
    );
    expect(script).toContain(
      "candidate teardown left project containers or networks behind",
    );
    expect(script).toContain("ONLYWAY_RESTART_POLICY=no");
    expect(script).toContain(
      'source "${SCRIPT_DIR}/lib/candidate-recovery.sh"',
    );
    const recoveryIndex = script.indexOf("candidate_recovery_recover_all");
    const preexistingInventoryIndex = script.indexOf(
      "PREEXISTING_INVENTORY=",
    );
    const guardIndex = script.indexOf("candidate_recovery_arm_guard");
    expect(recoveryIndex).toBeGreaterThan(0);
    expect(preexistingInventoryIndex).toBeGreaterThan(recoveryIndex);
    expect(guardIndex).toBeGreaterThan(0);
    expect(startAttemptIndex).toBeGreaterThan(guardIndex);
  });

  it("persists a secret-free exact-project recovery guard for killed candidates", async () => {
    const recovery = await readFile(
      resolve(ROOT, "scripts/production/lib/candidate-recovery.sh"),
      "utf8",
    );
    expect(recovery).toContain(
      'kind: "CANDIDATE_RECOVERY_GUARD"',
    );
    expect(recovery).toContain("containsSecrets: false");
    expect(recovery).toContain('restartPolicy: "no"');
    expect(recovery).toContain(
      '.HostConfig.RestartPolicy.Name == "no"',
    );
    expect(recovery).toContain(
      '.Config.Labels["com.docker.compose.project.working_dir"] == $source',
    );
    expect(recovery).toContain(
      "untracked candidate containers require operator review",
    );
    expect(recovery).toContain(
      "candidate_recovery_remove_safe_temporary_entries",
    );
    expect(recovery).toContain(
      "candidate recovery found an unsafe temporary entry",
    );
    expect(recovery).toContain(
      "candidate_recovery_remove_staging_source",
    );
    expect(recovery).toContain(
      "candidate recovery staging source is dirty or has the wrong commit",
    );
  });
});
