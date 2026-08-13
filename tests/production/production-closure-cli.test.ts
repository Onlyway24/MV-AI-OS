import {
  generateKeyPairSync,
  type KeyObject,
  sign,
} from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  runOfflineProductionRehearsal,
} from "../../src/production/offline-production-rehearsal.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import {
  PAYMENT_EXTERNAL_STATES,
  PAYMENT_READY_CAPABILITIES,
  privateDeploymentAttestationFingerprint,
} from "../../src/production/payment-readiness.js";
import {
  executeProductionClosureCommandForTest,
  type ProductionClosureTestTrustAnchor,
} from "../../src/production/production-closure-cli.js";
import { ensureProductionSafetyState } from "../../src/production/production-safety-state.js";
import {
  SECURITY_READINESS_CONTROL_KEYS,
  SECURITY_READINESS_PREREQUISITE_KEYS,
  evaluateSecurityReadiness,
  securityAttestationFingerprint,
  securityScanResultFingerprint,
} from "../../src/production/security-readiness.js";

describe("Production Closure CLI gates", () => {
  it("reports private security readiness only after the updated main scan and every control proof", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-security-readiness-"));
    const path = join(root, "attestation.json");
    const commit = "a".repeat(40);
    const complete = securityAttestation(commit);
    const signing = await testSigningIdentity(root);
    const execute = (arguments_: readonly string[]) =>
      executeProductionClosureCommandForTest(arguments_, signing.trustAnchor);
    try {
      await writeFile(path, JSON.stringify(complete), { mode: 0o600 });
      expect(evaluateSecurityReadiness(complete)).toMatchObject({
        securityState: "SECURE_DEPLOYMENT_NOT_READY",
        status: "NOT_READY",
      });
      await expect(execute([
        "security-readiness",
        "--attestation",
        path,
      ])).rejects.toThrow();

      await writeSignedJson(path, complete, signing.privateKey);
      const ready = await execute([
        "security-readiness",
        "--attestation",
        path,
      ]);
      expect(ready).toMatchObject({
        kind: "SECURITY_READINESS",
        publicExposureAuthorized: false,
        scanExecuted: true,
        securityState: "SECURE_DEPLOYMENT_READY_PRIVATE",
        status: "READY",
        targetBranch: "main",
      });
      expect((ready.checks as readonly { readonly status: string }[])
        .every(({ status }) => status === "PASS")).toBe(true);
      expect(JSON.stringify(ready)).not.toContain("SAFE_TO_EXPOSE_PUBLICLY");

      const attacker = generateKeyPairSync("ed25519");
      const completeBytes = await readFile(path);
      await writeFile(
        `${path}.sig`,
        sign(null, completeBytes, attacker.privateKey),
      );
      await expect(execute([
        "security-readiness",
        "--attestation",
        path,
      ])).rejects.toThrow("failed verification");
      await rm(`${path}.sig`);
      await expect(execute([
        "security-readiness",
        "--attestation",
        path,
      ])).rejects.toThrow();
      await writeSignedJson(path, complete, signing.privateKey);

      await writeFile(path, JSON.stringify({
        ...complete,
        controls: {
          ...complete.controls,
          csrfProtection: true,
        },
      }));
      await expect(execute([
        "security-readiness",
        "--attestation",
        path,
      ])).rejects.toThrow("failed verification");

      const partialCandidate = {
        ...complete,
        controls: {
          ...complete.controls,
          csrfProtection: true,
        },
      };
      await writeSignedJson(path, partialCandidate, signing.privateKey);
      const partial = await execute([
        "security-readiness",
        "--attestation",
        path,
      ]);
      expect(partial).toMatchObject({
        scanExecuted: true,
        securityState: "SECURE_DEPLOYMENT_NOT_READY",
        status: "NOT_READY",
      });
      expect(partial.checks).toContainEqual(expect.objectContaining({
        name: "csrf_protection",
        status: "FAIL",
      }));

      const booleanOnly = {
        ...complete,
        controls: Object.fromEntries(
          SECURITY_READINESS_CONTROL_KEYS.map((key) => [key, true]),
        ),
      };
      await writeSignedJson(path, {
        ...booleanOnly,
        attestationFingerprint: securityAttestationFingerprint(booleanOnly),
      }, signing.privateKey);
      await expect(execute([
        "security-readiness",
        "--attestation",
        path,
      ])).resolves.toMatchObject({
        status: "NOT_READY",
      });

      const scanWithoutFingerprint = {
        ...complete.scanResult,
        openMaterialP2Findings: 1,
      };
      delete (scanWithoutFingerprint as { fingerprint?: string }).fingerprint;
      const materialP2Candidate = refingerprintSecurityAttestation({
        ...complete,
        scanResult: {
          ...scanWithoutFingerprint,
          fingerprint:
            securityScanResultFingerprint(scanWithoutFingerprint),
        },
      });
      await writeSignedJson(
        path,
        materialP2Candidate,
        signing.privateKey,
      );
      const materialP2 = await execute([
        "security-readiness",
        "--attestation",
        path,
      ]);
      expect(materialP2).toMatchObject({ status: "NOT_READY" });
      expect(materialP2.checks).toContainEqual(expect.objectContaining({
        name: "deep_security_scan",
        status: "FAIL",
      }));

      const extendedScanWithoutFingerprint = {
        ...complete.scanResult,
        untrustedExtension: "must-not-be-accepted",
      };
      delete (extendedScanWithoutFingerprint as { fingerprint?: string })
        .fingerprint;
      const extendedScanCandidate = refingerprintSecurityAttestation({
        ...complete,
        scanResult: {
          ...extendedScanWithoutFingerprint,
          fingerprint:
            securityScanResultFingerprint(extendedScanWithoutFingerprint),
        },
      });
      await writeSignedJson(path, extendedScanCandidate, signing.privateKey);
      const extendedScan = await execute([
        "security-readiness",
        "--attestation",
        path,
      ]);
      expect(extendedScan.checks).toContainEqual(expect.objectContaining({
        name: "deep_security_scan",
        status: "FAIL",
      }));

      const earlyScanWithoutFingerprint = {
        ...complete.scanResult,
        startedAt: "2026-07-26T11:59:59.000Z",
      };
      delete (earlyScanWithoutFingerprint as { fingerprint?: string })
        .fingerprint;
      const earlyScanCandidate = refingerprintSecurityAttestation({
        ...complete,
        scanResult: {
          ...earlyScanWithoutFingerprint,
          fingerprint:
            securityScanResultFingerprint(earlyScanWithoutFingerprint),
        },
      });
      await writeSignedJson(path, earlyScanCandidate, signing.privateKey);
      const earlyScan = await execute([
        "security-readiness",
        "--attestation",
        path,
      ]);
      expect(earlyScan.checks).toContainEqual(expect.objectContaining({
        name: "deep_security_scan",
        status: "FAIL",
      }));

      await writeSignedJson(path, {
        ...complete,
        branch: "main",
        scanTarget: { kind: "COMMIT", ref: "main@901c126" },
      }, signing.privateKey);
      await expect(execute([
        "security-readiness",
        "--attestation",
        path,
      ])).resolves.toMatchObject({
        status: "NOT_READY",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("emits every exact payment state and fails closed when durable proof is absent or tampered", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-payment-readiness-"));
    const configPath = join(root, "runtime.json");
    const receiptPath = join(root, "rehearsal.json");
    const deploymentPath = join(root, "deployment.json");
    const signing = await testSigningIdentity(root);
    const execute = (arguments_: readonly string[]) =>
      executeProductionClosureCommandForTest(arguments_, signing.trustAnchor);
    try {
      await writeFile(configPath, JSON.stringify({
        contractVersion: "1",
        maxRequestBytes: 1_048_576,
        runtime: {
          actorId: "fabio-rehearsal",
          contentAgentMode: "deterministic",
          contractVersion: "1",
          permissions: {
            actorGrants: [],
            policyGrants: [],
            taskGrants: [],
          },
          providerMode: "OFFLINE_REHEARSAL",
          sqlite: {
            path: join(root, "production.sqlite"),
            timeoutMs: 2_000,
          },
          workspaceId: "production-rehearsal",
        },
      }), { mode: 0o600 });
      const rehearsal = await runOfflineProductionRehearsal({
        backupPath: join(root, "rehearsal.backup.sqlite"),
        databasePath: join(root, "rehearsal.sqlite"),
        receiptPath,
        restoredDatabasePath: join(root, "rehearsal.restored.sqlite"),
        runId: "payment-rehearsal-001",
        startedAt: "2026-07-26T12:00:00.000Z",
      });
      const unsignedDeployment = {
        branch: "main" as const,
        commit: "b".repeat(40),
        contractVersion: "2" as const,
        deployed: true as const,
        kind: "PRIVATE_DEPLOYMENT_ATTESTATION" as const,
        privateTunnelReceiptFingerprint: "f".repeat(64),
        privateTunnelVerified: true as const,
        publicApplicationPorts: 0 as const,
        readinessVerified: true as const,
        rehearsalReceiptFingerprint: rehearsal.receiptFingerprint,
        rebootRecoveryVerified: true as const,
        rollbackVerified: true as const,
        status: "DEPLOYED_PRIVATE" as const,
      };
      await writeSignedJson(deploymentPath, {
        ...unsignedDeployment,
        receiptFingerprint:
          privateDeploymentAttestationFingerprint(unsignedDeployment),
      }, signing.privateKey);
      const productionRepositories = new SqliteRepositoryTransactionRunner({
        path: join(root, "production.sqlite"),
        timeoutMs: 2_000,
      });
      await ensureProductionSafetyState({
        actorId: "fabio-rehearsal",
        clock: { now: () => new Date("2026-07-26T12:00:00.000Z") },
        repositories: productionRepositories,
        workspaceId: "production-rehearsal",
      });
      await productionRepositories.close();

      const ready = await execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ]);
      expect(ready).toMatchObject({
        kind: "PAYMENT_READINESS",
        openAIProviderState: "DISABLED",
        openAISecretState: "NOT_CONFIGURED",
        paidCallsAllowed: false,
        paymentState: "PAYMENT_READY_OFFLINE",
        providerMode: "OFFLINE_REHEARSAL",
        publicationState: "LOCKED",
        status: "READY",
      });
      const capabilities = ready.capabilities as readonly {
        readonly name: string;
        readonly state: string;
      }[];
      expect(capabilities.map(({ name }) => name)).toEqual([
        ...PAYMENT_READY_CAPABILITIES,
        ...PAYMENT_EXTERNAL_STATES,
      ]);
      expect(capabilities.slice(0, PAYMENT_READY_CAPABILITIES.length)
        .every(({ state }) => state === "READY")).toBe(true);
      expect(Object.fromEntries(capabilities.map(({ name, state }) =>
        [name, state]))).toMatchObject({
        "Instagram Connector": "CONFIGURATION_REQUIRED",
        "OpenAI Provider": "DISABLED",
        "OpenAI Secret": "NOT_CONFIGURED",
        "Production Domain": "CONFIGURATION_REQUIRED",
        "Publication": "LOCKED",
        "TikTok Connector": "CONFIGURATION_REQUIRED",
      });

      const deploymentBytes = await readFile(deploymentPath);
      const attacker = generateKeyPairSync("ed25519");
      await writeFile(
        `${deploymentPath}.sig`,
        sign(null, deploymentBytes, attacker.privateKey),
      );
      await expect(execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ])).rejects.toThrow("failed verification");
      await rm(`${deploymentPath}.sig`);
      await expect(execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ])).rejects.toThrow();
      await writeSignedJson(deploymentPath, {
        ...unsignedDeployment,
        receiptFingerprint:
          privateDeploymentAttestationFingerprint(unsignedDeployment),
      }, signing.privateKey);

      await writeFile(deploymentPath, JSON.stringify({
        ...unsignedDeployment,
        receiptFingerprint: "0".repeat(64),
      }));
      await expect(execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ])).rejects.toThrow("failed verification");

      await writeSignedJson(deploymentPath, {
        ...unsignedDeployment,
        receiptFingerprint: "0".repeat(64),
      }, signing.privateKey);
      const invalidFingerprint = await execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ]);
      expect(invalidFingerprint).toMatchObject({
        paymentState: "PAYMENT_NOT_READY",
        status: "NOT_READY",
      });
      expect(invalidFingerprint.capabilities).toContainEqual(
        expect.objectContaining({
        name: "VPS Deployment",
        state: "NOT_READY",
        }),
      );

      const wrongRehearsal = {
        ...unsignedDeployment,
        rehearsalReceiptFingerprint: "1".repeat(64),
      };
      await writeSignedJson(deploymentPath, {
        ...wrongRehearsal,
        receiptFingerprint:
          privateDeploymentAttestationFingerprint(wrongRehearsal),
      }, signing.privateKey);
      await expect(execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ])).resolves.toMatchObject({
        paymentState: "PAYMENT_NOT_READY",
        status: "NOT_READY",
      });

      const {
        privateTunnelReceiptFingerprint: _removedTunnelProof,
        ...deploymentWithoutTunnelProof
      } = unsignedDeployment;
      expect(_removedTunnelProof).toMatch(/^[a-f0-9]{64}$/u);
      await writeSignedJson(deploymentPath, {
        ...deploymentWithoutTunnelProof,
        receiptFingerprint:
          privateDeploymentAttestationFingerprint(
            deploymentWithoutTunnelProof as typeof unsignedDeployment,
          ),
      }, signing.privateKey);
      await expect(execute([
        "payment-readiness",
        "--config",
        configPath,
        "--rehearsal-receipt",
        receiptPath,
        "--deployment-attestation",
        deploymentPath,
      ])).resolves.toMatchObject({
        paymentState: "PAYMENT_NOT_READY",
        status: "NOT_READY",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("refuses a symlinked readiness input before parsing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-readiness-input-"));
    const target = join(root, "target.json");
    const link = join(root, "attestation.json");
    const signing = await testSigningIdentity(root);
    try {
      await writeFile(target, JSON.stringify(
        securityAttestation("c".repeat(40)),
      ), { mode: 0o600 });
      await symlink(target, link);
      await expect(executeProductionClosureCommandForTest([
        "security-readiness",
        "--attestation",
        link,
      ], signing.trustAnchor)).rejects.toThrow("regular non-symlink");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

async function testSigningIdentity(root: string): Promise<Readonly<{
  readonly privateKey: KeyObject;
  readonly trustAnchor: ProductionClosureTestTrustAnchor;
}>> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPath = join(root, "release-acceptance-ed25519.pub.pem");
  await writeFile(
    publicKeyPath,
    publicKey.export({ format: "pem", type: "spki" }),
    { mode: 0o644 },
  );
  return Object.freeze({
    privateKey,
    trustAnchor: Object.freeze({
      expectedOwnerUid: process.getuid?.() ?? 0,
      publicKeyPath,
    }),
  });
}

async function writeSignedJson(
  path: string,
  value: unknown,
  privateKey: KeyObject,
): Promise<void> {
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(path, bytes, { mode: 0o600 });
  await writeFile(`${path}.sig`, sign(null, bytes, privateKey), {
    mode: 0o600,
  });
  expect(await readFile(`${path}.sig`)).toHaveLength(64);
}

function refingerprintSecurityAttestation(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const unsigned = { ...value };
  delete unsigned.attestationFingerprint;
  return Object.freeze({
    ...unsigned,
    attestationFingerprint: securityAttestationFingerprint(unsigned),
  });
}

function securityAttestation(commit: string) {
  const preScanCompletedAt = "2026-07-26T12:00:00.000Z";
  const scanStartedAt = "2026-07-26T12:00:01.000Z";
  const observedAt = "2026-07-26T12:00:02.000Z";
  const fingerprint = "d".repeat(64);
  const evidence = (
    kind: string,
    source: string,
  ) => ({
    commit,
    contractVersion: "1",
    fingerprint,
    kind,
    observedAt,
    source,
    verified: true,
  });
  const codeEvidence = evidence(
    "CODE_VERIFICATION",
    "verification-image/npm-check",
  );
  const controlEvidence = Object.fromEntries(
    SECURITY_READINESS_CONTROL_KEYS.map((key) => {
      const source = (() => {
        switch (key) {
          case "backupRestoreVerified":
            return ["RUNTIME_RECEIPT", "runtime/backup-restore"];
          case "backupStoragePrivate":
          case "privateFilePermissions":
          case "serviceAccountsSeparated":
            return ["HOST_CONFIGURATION", "host/filesystem"];
          case "bruteForceProtection":
            return ["HOST_CONFIGURATION", "host/fail2ban"];
          case "containerNotPrivileged":
          case "databaseOutsideImage":
          case "dockerfileNonRoot":
          case "dockerSocketAbsent":
          case "hostNetworkAbsent":
          case "linuxCapabilitiesDropped":
          case "logRotation":
          case "noNewPrivileges":
          case "readOnlyRootFilesystem":
          case "secretsOutsideImage":
            return ["CONTAINER_INSPECTION", "docker/inspect"];
          case "firewallActive":
            return ["HOST_CONFIGURATION", "host/ufw"];
          case "localFounderBootstrap":
            return ["RUNTIME_RECEIPT", "runtime/founder-bootstrap"];
          case "noSecretScan":
            return ["CODE_VERIFICATION", "verification-image/secret-scan"];
          case "publicAdminPortClosed":
          case "reverseProxyPrivate":
            return ["NETWORK_MEASUREMENT", "host/listeners"];
          case "readinessVerified":
            return ["RUNTIME_RECEIPT", "runtime/readiness"];
          case "rebootRecoveryVerified":
            return ["RUNTIME_RECEIPT", "runtime/reboot-recovery"];
          case "rollbackVerified":
            return ["RUNTIME_RECEIPT", "runtime/rollback"];
          case "sshKeyOnly":
            return ["HOST_CONFIGURATION", "host/sshd"];
          default:
            return ["CODE_VERIFICATION", "verification-image/npm-check"];
        }
      })();
      return [key, evidence(source[0] ?? "", source[1] ?? "")];
    }),
  );
  const scanWithoutFingerprint = {
    artifactFingerprint: "e".repeat(64),
    branch: "main",
    completedAt: observedAt,
    contractVersion: "1",
    executed: true,
    kind: "DEEP_SECURITY_SCAN_RESULT",
    openCriticalFindings: 0,
    openHighFindings: 0,
    openMaterialP2Findings: 0,
    scanId: "deep-scan-main-001",
    scannedCommit: commit,
    source: "codex-security/deep-scan",
    startedAt: scanStartedAt,
    status: "COMPLETED",
    targetKind: "COMMIT",
    targetRef: commit,
  };
  const scanResult = {
    ...scanWithoutFingerprint,
    fingerprint: securityScanResultFingerprint(scanWithoutFingerprint),
  };
  const unsigned = {
    branch: "main",
    contractVersion: "2",
    controls: controlEvidence,
    finalCommit: commit,
    kind: "SECURITY_EVIDENCE_ATTESTATION",
    maximumDeploymentState: "SECURE_DEPLOYMENT_READY_PRIVATE",
    prerequisites: Object.fromEntries(
      SECURITY_READINESS_PREREQUISITE_KEYS.map((key) => [
        key,
        key === "preScanVerified"
          ? {
              ...evidence(
                "CODE_VERIFICATION",
                "pre-scan/signed-verification",
              ),
              observedAt: preScanCompletedAt,
            }
          : key === "productionRehearsalPassed"
          ? evidence(
              "RUNTIME_RECEIPT",
              "runtime/production-rehearsal",
            )
          : key === "finalCommitPushed"
            ? evidence(
                "RELEASE_ACCEPTANCE",
                "release/signed-acceptance",
              )
            : codeEvidence,
      ]),
    ),
    publicExposureAuthorized: false,
    pushedCommit: commit,
    scanResult,
    scanTarget: { kind: "COMMIT", ref: commit },
  };
  return {
    ...unsigned,
    attestationFingerprint: securityAttestationFingerprint(unsigned),
  };
}
