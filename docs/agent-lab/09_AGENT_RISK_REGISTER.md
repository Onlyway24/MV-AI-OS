# MV AI OS Agent Lab — Agent Risk Register

## Purpose

This register captures risks surfaced by transcript analysis and maps them to MV AI OS
controls. It is a planning document for future milestones, not a runtime enforcement
module.

Risk level describes when a capability should be treated as dangerous if implemented
without the listed controls.

## Risk register

| ID | Risk | Level | Why it matters | Required controls before production |
| --- | --- | --- | --- | --- |
| R-001 | Token-burning loops | High | Repeated model calls can waste money without useful output | Usage accounting, operation limits, budget enforcement, audit |
| R-002 | Hidden model calls | High | Fabio cannot govern cost or behavior he cannot see | Gateway-only model access, usage records, no bypass paths |
| R-003 | Provider-specific leakage | Medium | Agents become locked to one SDK or provider behavior | Provider-neutral contracts and adapter-local translation |
| R-004 | Secret leakage | Critical | Credentials in prompts, logs, errors, or records can compromise systems | Secret references, ephemeral resolution, redaction, security review |
| R-005 | Fake backup confidence | Critical | Backups that cannot restore create false safety | Restore verification, schema identity checks, Backup Guardian |
| R-006 | Unsafe restore into active runtime | Critical | Restoring while active can corrupt state or lose work | Inactive destination only, no partial restore, explicit config |
| R-007 | Browser/computer control misuse | Critical | The agent could click, send, delete, buy, or expose private data | Strong sandbox, approvals, tool gateway, audit, future security work |
| R-008 | Email or publishing mistakes | Critical | External messages can damage reputation or relationships | Review pass, exact destination, human approval, n8n idempotency |
| R-009 | Direct filesystem mutation | High | Local files can be damaged or secrets exposed | Explicit tool definition, approvals, path policy, audit |
| R-010 | Shell/terminal execution | Critical | Commands can destroy data or leak credentials | Deferred until security and approval controls exist |
| R-011 | Prompt injection through knowledge | High | Source text may try to override policy or leak data | Treat knowledge as untrusted, scope filtering, context boundaries |
| R-012 | Memory pollution | High | False or stale preferences can steer future work badly | Memory proposals, validation, approval, deletion, provenance |
| R-013 | Stale knowledge | Medium | Old market, pricing, or legal facts can cause bad decisions | Freshness metadata, warnings, curation, review |
| R-014 | Fabricated citations | High | Unsupported claims reduce trust and can harm business output | Evidence validation, source IDs, Review Agent |
| R-015 | Autonomous spending | Critical | Ads, tools, inventory, or API usage can consume money | Budget enforcement, approvals, Cost Guardian |
| R-016 | Unbounded retries | High | Retries can duplicate cost or side effects | Retry budgets, idempotency, failure normalization |
| R-017 | Cloud/VPS exposure too early | Critical | Public surfaces and open services increase attack risk | Security milestone, secrets, backups, incident procedures |
| R-018 | Dashboard mutation bypass | High | UI changes could bypass policy if built too soon | Same application contracts, policy, audit, redaction |
| R-019 | n8n side-effect duplication | Critical | Repeated workflow calls can publish/send/buy twice | Idempotency keys, allowlist, callbacks, durable workflow state |
| R-020 | Over-agentification | Medium | Too many visible agents make Fabio a manager of bots | One main assistant, internal specialists, concise operator reports |
| R-021 | Self-improvement without review | High | Agents could degrade prompts, memory, policy, or behavior | Versioned changes, diff review, approval, rollback |
| R-022 | Dreaming/background reflection over sensitive data | High | Background summarization can leak or distort data | Explicit scopes, redaction, budgets, approval, audit |
| R-023 | Model confidence mistaken for truth | High | Polished outputs can hide unsupported claims | Evidence fields, warnings, review, knowledge provenance |
| R-024 | Cost Guardian causing cost | Medium | A guardian that calls models on every event can become the cost problem | Accounting-first, deterministic checks, bounded model use |
| R-025 | Security Guardian overclaiming safety | High | A report can create false confidence if not backed by tests | Evidence-backed findings, threat model, verification gates |

## Capability risk categories

### Low risk

Safe for near-term design or deterministic implementation when policy and validation
are preserved:

- usage accounting from validated model responses;
- budget calculation from explicit configuration;
- structured cost reports;
- static security checks over local configuration;
- backup/restore status reports;
- agent specification documents;
- knowledge curation proposals.

### Medium risk

Requires careful boundaries but may be near-term after accounting and policy support:

- Cost Guardian recommendations;
- Security Guardian analysis;
- Backup Guardian reports;
- provider smoke harness with explicit opt-in;
- main assistant planning without side effects;
- review-only quality gates.

### High risk

Must wait for approvals, audit, and operational controls:

- workflow execution;
- n8n external side effects;
- live provider calls in operator mode;
- automated memory write approval;
- scheduled jobs;
- dashboard mutations.

### Critical risk

Must not be implemented until the architecture has mature security, approvals, and
incident recovery:

- browser automation;
- computer control;
- terminal execution;
- file mutation tools;
- email sending;
- payment or money movement;
- inventory ordering;
- public cloud/VPS exposure;
- 24/7 autonomous loops.

## Required doctrine by risk

Every future milestone should identify whether it touches:

- money;
- secrets;
- external communication;
- data deletion or restore;
- live network calls;
- background execution;
- durable memory changes;
- permissions;
- public exposure.

If yes, the milestone must include policy, validation, audit, deterministic tests, and
human approval behavior appropriate to the risk.

## Risk response strategy

| Response | Use when |
| --- | --- |
| Avoid | Capability is powerful but not needed for the next operator outcome |
| Defer | Capability is useful but missing cost/security/approval prerequisites |
| Contain | Capability can be added behind strict contracts and tests |
| Approve | Capability has explicit human approval and audit path |
| Monitor | Capability needs ongoing usage, cost, or security observation |

## Near-term risk priorities

1. Complete model usage accounting.
2. Add budget enforcement before wider model autonomy.
3. Add Cost Guardian as analysis/reporting before autonomous blocking.
4. Add Security Guardian for configuration and secret-boundary review.
5. Add Backup Guardian for recovery confidence.
6. Keep direct tools, n8n execution, dashboard mutation, browser control, and 24/7
   operation deferred.
