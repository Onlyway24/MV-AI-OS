# Pre-scan verification

Run this local, non-root gate only after the implementation is complete and the
final commit has been pushed to `main`. The command
does not start Codex Security. It proves the prerequisites that must precede the
separate final scan.

Create a dedicated Ed25519 signing key once. Do not reuse the VPS login key,
deploy key, or release-acceptance key:

```sh
ssh-keygen -t ed25519 -a 100 \
  -C onlyway-pre-scan-verification \
  -f "$HOME/.ssh/onlyway_pre_scan_ed25519"
chmod 0600 "$HOME/.ssh/onlyway_pre_scan_ed25519"
chmod 0644 "$HOME/.ssh/onlyway_pre_scan_ed25519.pub"
```

From a clean, final feature worktree, run:

```sh
scripts/production/pre-scan-verification.sh \
  --repository /absolute/path/to/MV-AI-OS \
  --output /private/tmp/onlyway-pre-scan-verification.json \
  --signing-key "$HOME/.ssh/onlyway_pre_scan_ed25519"
```

The gate refuses root, detached HEAD, any other branch, a dirty tree, a
non-canonical path, an unsafe key, an origin URL containing credentials, or a
local commit different from
`origin/main`. It resolves the exact remote branch
before and after running the fixed command `npm run check`, then rechecks the
local branch, commit, Git tree, origin URL, and clean state.

Successful output consists of two owner-only files:

- `onlyway-pre-scan-verification.json`;
- `onlyway-pre-scan-verification.json.sig`.

The JSON records `startedAt`, `completedAt`, branch, full commit, Git tree,
exact origin URL/ref/commit, `suiteCommand: "npm run check"`,
`suiteStatus: "PASSED"`, `workingTree: "CLEAN"`,
`secretsExposed: false`, and the normalized public-key identity. The `.sig` is
an OpenSSH detached Ed25519 signature over the exact JSON bytes under namespace
`onlyway-pre-scan-verification-v1`.

Both files are bounded, mode `0600`, fsynced, and installed without overwriting
an existing target. Signature publication happens first, so an interrupted
pair is incomplete and must fail closed.

Verify against a separately trusted copy of the dedicated public key:

```sh
awk '
  NR == 1 && $1 == "ssh-ed25519" {print "onlyway-pre-scan " $1 " " $2}
' "$HOME/.ssh/onlyway_pre_scan_ed25519.pub" \
  > /private/tmp/onlyway-pre-scan-allowed-signers
chmod 0600 /private/tmp/onlyway-pre-scan-allowed-signers

ssh-keygen -Y verify \
  -f /private/tmp/onlyway-pre-scan-allowed-signers \
  -I onlyway-pre-scan \
  -n onlyway-pre-scan-verification-v1 \
  -s /private/tmp/onlyway-pre-scan-verification.json.sig \
  < /private/tmp/onlyway-pre-scan-verification.json
```

The final Deep Security Scan must target the receipt’s exact commit and start
only after `completedAt`. A self-consistent JSON file, embedded public key, or
fingerprint is not sufficient without successful verification against the
separately trusted public key.

Transfer all three public evidence inputs independently to the VPS. Install the
receipt and signature beneath `/srv/onlyway/run/` as `root:onlyway` mode
`0600` or `0640`, and the dedicated public trust key beneath
`/srv/onlyway/secrets/deploy/` as `root:root` mode `0644`. Supply their exact
absolute paths to `collect-production-evidence.sh` through
`--pre-scan-receipt`, `--pre-scan-signature`, and `--pre-scan-trust-key`.
The collector snapshots them without following links, verifies the SSHSIG
identity/namespace, binds commit and Git tree, and rejects a scan whose
`startedAt` predates the signed receipt’s `completedAt`.
