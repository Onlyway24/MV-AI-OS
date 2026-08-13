import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);

describe("install-host legacy preflight gate", () => {
  it("runs the signed exact-ID gate before dry-run and every host mutation", async () => {
    const installer = await readFile(
      resolve("scripts/production/install-host.sh"),
      "utf8",
    );
    const gateCall = installer.indexOf(
      "\nverify_legacy_install_preflight_gate\n",
    );
    expect(gateCall).toBeGreaterThan(0);

    for (const required of [
      "--legacy-preflight-receipt",
      "--legacy-preflight-signature",
      "--legacy-public-key",
      "--legacy-container",
      "ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1",
      "legacy_verify_signed_json",
      "legacy_validate_install_preflight_contract",
      "legacy_capture_exact_inventory",
      "legacy_validate_inventory_file",
      "legacy_assert_configuration_fingerprint",
      "legacy_verify_directory_metadata",
      "legacy_verify_file_observation",
    ]) {
      expect(installer).toContain(required);
    }
    expect(installer).toContain(
      '[[ ${#LEGACY_CONTAINER_SPECS[@]} -eq 4 ]]',
    );
    expect(installer).toContain(
      'legacy_container_is_approved "$container_id" "$container_name"',
    );
    expect(installer).toContain(
      '[[ $POST_INSTALL_CONTAINER_COUNT -eq 4 ]]',
    );

    for (const mutation of [
      "\nif $DRY_RUN; then",
      "\nexport DEBIAN_FRONTEND=noninteractive",
      "\napt-get update",
      "\nsystemctl enable --now docker.service containerd.service",
      "\nif getent group",
      "\ninstall -d -o root -g",
    ]) {
      const mutationIndex = installer.indexOf(mutation);
      expect(mutationIndex, mutation).toBeGreaterThan(gateCall);
    }

    const gateBodyStart = installer.indexOf(
      "verify_legacy_install_preflight_gate() (",
    );
    const firstSignatureCheck = installer.indexOf(
      "signed_sha=$(legacy_verify_signed_json",
      gateBodyStart,
    );
    const contractCheck = installer.indexOf(
      "legacy_validate_install_preflight_contract",
      firstSignatureCheck,
    );
    const exactInventory = installer.indexOf(
      "legacy_capture_exact_inventory",
      contractCheck,
    );
    const configurationFingerprint = installer.indexOf(
      "legacy_assert_configuration_fingerprint",
      exactInventory,
    );
    const secondSignatureCheck = installer.indexOf(
      "reverified_sha=$(legacy_verify_signed_json",
      configurationFingerprint,
    );
    const contractOrder = [
      gateBodyStart,
      firstSignatureCheck,
      contractCheck,
      exactInventory,
      configurationFingerprint,
      secondSignatureCheck,
      gateCall,
    ];
    expect(contractOrder).toEqual(
      [...contractOrder].sort((left, right) => left - right),
    );
  });

  it("rejects expiry, identity drift, extra containers and unsafe policy fields", async () => {
    const repositoryRoot = resolve(".");
    const result = await executeFile(
      "bash",
      [
        resolve(
          "scripts/production/tests/legacy-install-gate-contract.sh",
        ),
        repositoryRoot,
      ],
      { cwd: repositoryRoot },
    );
    expect(result.stdout).toContain(
      "legacy install gate contract fixtures: PASS",
    );
  });

  it("covers tamper, missing-signature and wrong-key rejection on Linux root", async () => {
    const repositoryRoot = resolve(".");
    const result = await executeFile(
      "bash",
      [
        resolve(
          "scripts/production/tests/legacy-install-gate-signature-contract.sh",
        ),
        repositoryRoot,
      ],
      { cwd: repositoryRoot },
    );
    expect(result.stdout).toMatch(
      /legacy install gate signature contract: (PASS|SKIP)/u,
    );

    const signatureContract = await readFile(
      resolve(
        "scripts/production/tests/legacy-install-gate-signature-contract.sh",
      ),
      "utf8",
    );
    expect(signatureContract).toContain(
      'expect_rejection "tampered receipt content"',
    );
    expect(signatureContract).toContain(
      '"missing detached signature"',
    );
    expect(signatureContract).toContain(
      '"signature verified with an untrusted key"',
    );
  });
});
