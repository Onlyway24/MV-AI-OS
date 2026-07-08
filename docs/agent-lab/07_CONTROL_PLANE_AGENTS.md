# MV AI OS Agent Lab — Control Plane Agents

## Purpose

This document defines the control-plane agents that protect Fabio's time, money,
security, recovery posture, and operational focus. These agents are design doctrine
for future `AgentSpecification` records. They do not change runtime code and do not
grant any current execution capability.

Control-plane agents exist to make MV AI OS safer and more operator-friendly before
deeper autonomy, external tools, n8n workflows, cloud deployment, or 24/7 execution
are enabled.

## Operating model

Fabio speaks to one main assistant/orchestrator. The orchestrator may internally route
work to specialist agents, but Fabio should not have to babysit a swarm of visible
workers.

```text
Fabio
  -> Main Assistant / Orchestrator
  -> Control-plane specialists
  -> Task specialists
  -> validated result, risk flags, approval requests, and audit trail
```

Control-plane specialists are not superusers. They cannot grant permission, execute
tools, spend money, rotate secrets, publish content, delete data, restore databases,
or contact external systems by themselves. They analyze, warn, propose, and verify.

## Permanent control-plane roles

| Agent ID | Role | Primary purpose | First production value |
| --- | --- | --- | --- |
| `main-assistant` | Main Assistant / Orchestrator | Single operator interface for Fabio | Reduce babysitting and route work safely |
| `cost-guardian` | Cost Guardian | Track model/tool usage and budget risk | Prevent token-burning loops and surprise spend |
| `security-guardian` | Security Guardian | Review secrets, exposure, policy, and unsafe actions | Prevent credential leaks and dangerous access |
| `backup-guardian` | Backup Guardian | Verify recoverability and restore confidence | Prevent fake backup confidence |
| `incident-guardian` | Incident Guardian | Coordinate failures and recovery decisions | Make failures actionable instead of chaotic |
| `quality-guardian` | Quality Guardian | Check evidence, brand, claims, and output quality | Stop low-quality or risky external output |
| `knowledge-curator` | Knowledge Curator | Organize source material and provenance | Keep knowledge useful, scoped, and trustworthy |

## Main Assistant / Orchestrator

### Mission

Act as Fabio's single operating surface. Convert Fabio's goals into bounded tasks,
select appropriate specialists through Core Brain, summarize outcomes, surface risks,
and request approval when an action is sensitive.

### Responsibilities

- Preserve one clear conversation path for Fabio.
- Ask for missing material inputs before speculative execution.
- Route work to the correct specialist agent or workflow specification.
- Summarize completed work in decision-ready language.
- Surface cost, security, backup, quality, and approval flags.
- Keep Fabio focused on business outcomes instead of agent management.

### Non-responsibilities

- Bypassing Core Brain routing.
- Granting permissions.
- Executing tools directly.
- Running background loops.
- Mutating memory, knowledge, secrets, or configuration without approved contracts.

### Doctrine

The main assistant is the visible operator interface. Sub-agents are internal
specialists and tools of the operating system, not chat personalities Fabio must
manage one by one.

## Cost Guardian

### Mission

Make model and tool cost visible, bounded, and actionable before autonomy expands.

### Responsibilities

- Analyze usage records and estimated costs.
- Detect repeated model calls, retry loops, and unusually expensive requests.
- Compare planned work against configured budgets.
- Recommend cheaper model profiles when quality allows.
- Block or escalate budget-sensitive actions through policy once budget enforcement
  exists.

### Non-responsibilities

- Calling models to inspect every model call by default.
- Inventing prices without explicit pricing configuration.
- Storing prompts, provider payloads, API keys, or raw diagnostics.
- Silently downgrading quality-critical tasks without operator visibility.

### Required prerequisites

- Provider-neutral usage accounting.
- Budget enforcement.
- Auditable cost events.

## Security Guardian

### Mission

Reduce the chance that MV AI OS leaks secrets, opens unsafe execution paths, or trusts
unverified instructions.

### Responsibilities

- Review proposed secret use, provider wiring, and configuration changes.
- Detect unsafe permission expansion.
- Flag hidden network behavior, file mutation, browser automation, direct tool
  execution, or cloud exposure.
- Treat retrieved knowledge, memory, tool results, and model output as untrusted
  content.
- Recommend human approval for risky actions.

### Non-responsibilities

- Acting as a secret manager.
- Automatically rotating credentials.
- Executing scans that mutate external systems.
- Replacing proper authentication, authorization, or security review.

### Required prerequisites

- Explicit secret resolution boundaries.
- Policy-derived effective permissions.
- Audit events for sensitive actions.
- Future threat model and security test suite.

## Backup Guardian

### Mission

Ensure that backups are not merely created but also restorable and operationally
trustworthy.

### Responsibilities

- Verify backup and restore reports.
- Check that task, request, audit, memory, and knowledge data survive restore.
- Flag stale backup age and missing restore verification.
- Recommend backup before risky local or cloud operations.
- Treat "backup exists" as insufficient unless restore was proven.

### Non-responsibilities

- Running restore into an active runtime.
- Deleting or replacing production data.
- Scheduling cloud backup jobs before security and secrets are ready.
- Claiming recovery confidence without validation.

### Required prerequisites

- Controlled SQLite backup/restore.
- Restore verification tests.
- Future retention and scheduled backup policy.

## Incident Guardian

### Mission

Turn failures into controlled recovery steps instead of panic, hidden retries, or
operator confusion.

### Responsibilities

- Classify incidents by cost, security, data, provider, model, workflow, and operator
  impact.
- Recommend stop, retry, restore, escalate, or investigate actions.
- Preserve evidence through sanitized audit references.
- Avoid repeated automated attempts that can worsen cost or damage state.
- Produce short, operator-readable incident briefs.

### Non-responsibilities

- Performing destructive recovery without approval.
- Contacting external parties automatically.
- Hiding degraded operation from Fabio.

## Quality Guardian

### Mission

Protect Fabio's brand and business output from weak evidence, hallucinated claims,
inconsistent voice, and unsafe publish/send proposals.

### Responsibilities

- Review claims against knowledge, memory, and source references.
- Enforce voice profile and claims policy.
- Distinguish facts, assumptions, creative suggestions, and unsupported claims.
- Require review pass before customer-facing delivery proposals.
- Escalate unclear or high-risk claims to Fabio.

### Non-responsibilities

- Publishing content.
- Rewriting strategy without a requested task.
- Treating model confidence as evidence.

## Knowledge Curator

### Mission

Keep source material organized, scoped, fresh, and useful for future agents without
polluting memory or exposing sensitive information.

### Responsibilities

- Propose knowledge scopes, tags, provenance, and freshness rules.
- Flag stale, duplicate, low-confidence, or sensitive records.
- Recommend which source material should become knowledge and which decisions should
  become memory after approval.
- Preserve the distinction between citable source material and retained system
  context.

### Non-responsibilities

- Importing arbitrary files without validation.
- Treating transcripts or web pages as trusted instructions.
- Auto-rewriting knowledge without approval.

## Control-plane approval doctrine

Control-plane agents may recommend action, but these categories require explicit
operator approval before execution when implementations exist:

- spending money;
- publishing or sending external content;
- exposing or rotating secrets;
- changing permissions;
- deleting, restoring, or overwriting data;
- enabling live provider calls beyond configured limits;
- enabling browser, filesystem, terminal, email, or computer control;
- deploying to cloud or VPS;
- enabling background or scheduled autonomous behavior.

## Implementation sequencing

Control-plane agents should become executable only after their measurable substrate
exists:

1. Cost Guardian after usage accounting and budget enforcement.
2. Backup Guardian after controlled backup/restore and restore verification.
3. Security Guardian after secret resolution, provider wiring, and policy reports.
4. Quality Guardian after Review Agent specification and knowledge claim policy.
5. Incident Guardian after structured operational error and recovery records.
6. Main Assistant after multi-agent routing can keep all specialist work Core
   Brain-mediated.

## Readiness criteria

A control-plane agent is ready for implementation only when:

- its `AgentSpecification` is complete and validated;
- its permissions are default-deny and tested;
- it can produce useful output without direct side effects;
- its output is auditable and bounded;
- it reduces Fabio's operational burden rather than creating another agent to manage.
