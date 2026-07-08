# MV AI OS Agent Lab — Cost, Security, and Backup Playbook

## Purpose

This playbook turns transcript-derived risks into practical operating rules for MV AI
OS. It is intentionally local-first and control-first. It does not add runtime
behavior by itself.

## Shared operating rule

Cost, security, and backup are not administrative chores after the system works. They
are the conditions that allow the system to become more autonomous safely.

```text
usage visibility
  -> budget enforcement
  -> guardian reporting
  -> controlled live providers
  -> controlled workflows
  -> controlled cloud / 24/7 operation
```

## Cost playbook

### Objective

Prevent surprise spend, runaway retries, and invisible model usage while preserving
provider neutrality.

### Current foundation

- Provider-neutral `LlmGateway`.
- Controlled OpenAI provider adapter behind `ModelProvider`.
- Controlled local OpenAI provider wiring.
- Gateway-enforced model operation limits.
- Deterministic offline tests.

### Next controls

1. Usage accounting from validated `ModelUsage`.
2. Explicit pricing configuration.
3. Budget enforcement by actor, workspace, profile, and time window.
4. Cost Guardian reporting.
5. Operator-visible usage summaries.

### Rules

- Do not invent cost when usage is missing.
- Do not hardcode provider pricing in agent logic.
- Do not store prompts, secrets, provider payloads, or raw diagnostics for accounting.
- Do not allow retries outside the gateway budget.
- Do not enable deeper autonomy until usage and budget controls are visible.

### Cost incident signals

- Repeated provider calls for the same task.
- Retry exhaustion.
- Requests near or above token limits.
- Unexpected expensive profile selection.
- Missing usage from a provider that should report it.
- Cost estimates outside configured budget.

### Cost Guardian first version

The first Cost Guardian should be deterministic and report-only:

- read sanitized usage/accounting records;
- flag threshold breaches;
- produce concise operator recommendations;
- never call models by default to analyze model costs;
- never block execution until budget enforcement contracts exist.

## Security playbook

### Objective

Prevent credentials, untrusted content, tools, and autonomy from combining into
operator or business harm.

### Current foundation

- Default-deny policy.
- Effective permission calculation.
- Secret references and explicit local secret resolution.
- OpenAI provider receives ephemeral credential input.
- Public provider and validation errors are redaction-safe.
- No direct tool execution.
- No HTTP, dashboard, n8n, browser automation, or filesystem tools.

### Next controls

1. Security Guardian Foundation.
2. Configuration and secret-boundary review.
3. Threat model for live providers, future tools, n8n, and dashboard.
4. Prompt-injection and data-exposure tests.
5. Incident playbooks before cloud/VPS.

### Rules

- Secrets are never prompts, knowledge, memory, audit payloads, or public errors.
- Retrieved content is untrusted.
- Provider responses are untrusted until validated.
- Direct tool execution remains unavailable until approval, idempotency, and audit are
  complete.
- Cloud or VPS deployment waits for security, backup, and incident controls.

### Security incident signals

- Secret reference appears in a public error.
- Raw provider diagnostics escape adapter boundaries.
- Agent attempts to request a capability not in its spec.
- Policy grants expand without a matching requirement.
- Knowledge or memory text tries to override instructions.
- A proposed tool would mutate files, send messages, browse, or execute commands.

### Security Guardian first version

The first Security Guardian should be review/report-only:

- inspect sanitized local configuration and project-state docs;
- verify that provider wiring remains explicit;
- flag forbidden capability drift;
- produce operator-readable risk summaries;
- never execute scans that mutate external systems;
- never claim full security certification.

## Backup playbook

### Objective

Make local durability meaningful by proving recoverability, not just backup file
creation.

### Current foundation

- SQLite is the source of truth for task lifecycle, request replay, audit, memory, and
  knowledge.
- Controlled backup and restore validate application identity, schema version, paths,
  overwrite intent, and restored usability.
- Restore into active runtime is forbidden.

### Next controls

1. Backup Guardian Foundation.
2. Backup status and restore verification reporting.
3. Retention policy design.
4. Pre-change backup checks before risky migrations or cloud deployment.
5. Future scheduled backup through governed workflow only after approvals exist.

### Rules

- A backup is not trusted until restore is verified.
- Restore must target inactive destinations.
- No partial restore.
- No overwrite without explicit intent.
- Schema and application identity must match.
- Recovery reporting must include what was verified.

### Backup incident signals

- Backup file missing or unreadable.
- Restore file fails schema identity check.
- Restored database cannot replay a known request.
- Audit records missing after restore.
- Memory or knowledge records missing after restore.
- Backup age exceeds local operating policy.

### Backup Guardian first version

The first Backup Guardian should be deterministic and local:

- read backup/restore operation results;
- verify recovery criteria from existing repositories;
- report stale or unverified backups;
- recommend backup before risky changes;
- never perform destructive restore itself.

## Combined control gates

Before enabling each future capability, require:

| Future capability | Cost gate | Security gate | Backup gate |
| --- | --- | --- | --- |
| Live model smoke tests | usage visible | secret redaction verified | not required |
| Broader provider use | budget enforced | adapter boundary reviewed | not required |
| n8n workflows | side-effect cost known | callback/auth review | backup before workflow persistence |
| Dashboard | usage visible | auth/redaction review | backup before migrations |
| Cloud/VPS | budget alerts | threat model | restore verified |
| 24/7 operation | budgets + alerts | incident plan | scheduled verified backups |

## Operator report shape

Guardian reports should answer:

1. What changed?
2. What is the risk?
3. What evidence supports the warning?
4. What is the recommended action?
5. Is Fabio approval required?
6. What should not be done automatically?

Reports should be short enough for Fabio to act on without becoming a system
babysitter.
