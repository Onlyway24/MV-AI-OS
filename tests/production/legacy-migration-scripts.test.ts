import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);

describe("standalone legacy migration scripts", () => {
  it("rejects inventory drift and never trusts the mutable legacy tag", async () => {
    const repositoryRoot = resolve(".");
    const result = await executeFile(
      "bash",
      [
        resolve("scripts/production/tests/legacy-migration-contract.sh"),
        repositoryRoot,
      ],
      { cwd: repositoryRoot },
    );
    expect(result.stdout).toContain("legacy migration contract fixtures: PASS");

    const common = await readFile(
      resolve("scripts/production/lib/legacy-migration-common.sh"),
      "utf8",
    );
    expect(common).toContain("exactly four --container NAME=FULL_ID");
    expect(common).toContain(".Image == $expectedImageId");
    expect(common).toContain("com.docker.compose.");
    expect(common).toContain("covered_by_bind($excludedSecret) | not");
    expect(common).not.toContain("onlyway/mv-ai-os:1982d7f");
    expect(common).not.toContain("docker stop $(docker");
  });

  it("binds copy-on-migrate and rollback to signed exact-ID receipts", async () => {
    const [preflight, quiesce, success, rollback] = await Promise.all([
      readFile(
        resolve("scripts/production/legacy-migration-preflight.sh"),
        "utf8",
      ),
      readFile(
        resolve("scripts/production/legacy-migration-quiesce.sh"),
        "utf8",
      ),
      readFile(
        resolve("scripts/production/mark-legacy-migration-success.sh"),
        "utf8",
      ),
      readFile(
        resolve("scripts/production/rollback-legacy-migration.sh"),
        "utf8",
      ),
    ]);

    expect(preflight).toContain("PREPARE_LEGACY_MIGRATION_V1");
    expect(preflight).toContain('"ABSENT"');
    expect(preflight).toContain("contentRead: false");
    expect(preflight).toContain("legacy_publish_signed_json");

    expect(quiesce).toContain("QUIESCE_AND_COPY_LEGACY_V1");
    expect(quiesce).toContain("REQUIESCE_FOR_FORWARD_DEPLOY_V1");
    expect(quiesce).toContain("rollback evidence does not bind the first success marker");
    expect(quiesce).toContain("RETAINED_NEW_STACK_STATE");
    expect(quiesce).toContain("legacy_assert_host_path_not_mounted");
    expect(quiesce).toContain("docker update --restart=no");
    expect(quiesce).toContain("legacy_create_sqlite_copy");
    expect(quiesce).toContain("legacy database changed during copy-on-migrate");
    expect(quiesce).toContain("forensic database copy");
    expect(quiesce).toContain("legacy SQLite sidecar remains");
    expect(quiesce).toContain("restore_legacy_after_failure");
    expect(quiesce).toContain("secretCopied: false");

    expect(success).toContain("RETAIN_LEGACY_ROLLBACK_V1");
    expect(success).toContain("legacy_validate_new_admin_state");
    expect(success).toContain("legacy_validate_new_admin_bootstrap");
    expect(success).toContain("legacyCredentialContinuityClaimed: false");
    expect(success).toContain("newAdminStateUid");
    expect(success).toContain("RETAINED_NEW_STACK_PEPPER");
    expect(success).toContain("retainUntil");

    expect(rollback).toContain("ROLLBACK_LEGACY_WITHIN_RETENTION_V1");
    expect(rollback).toContain("legacy_verify_backup_bundle_manifest");
    expect(rollback).toContain("legacy_restore_directory_metadata");
    expect(rollback).toContain("legacy_restore_regular_file_exact");
    expect(rollback).toContain("systemctl disable --now");
    expect(rollback).toContain("docker start");
    expect(rollback).toContain("legacy_wait_for_legacy_bootstrap");
    expect(rollback).toContain("postCutoverWritesAppliedToLegacy: false");
    expect(rollback).toContain("restore_new_stack_after_failure");
  });
});
