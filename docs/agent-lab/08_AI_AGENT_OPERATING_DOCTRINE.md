# MV AI OS Agent Lab — AI Agent Operating Doctrine

## Purpose

This document records permanent operating doctrine derived from founder/operator
research and transcript analysis. It is not raw transcript storage. It contains the
principles MV AI OS should follow as it grows from a local controlled runtime into a
future AI company operating system.

## North star

Fabio should operate MV AI OS like an investor/operator of an AI company, not like a
babysitter of scattered bots.

The system must help Fabio:

- save time;
- make better decisions;
- create business assets;
- reduce operational risk;
- preserve attention for strategy, relationships, offers, and judgment.

If an agent feature does not save time, make money, reduce risk, or improve decision
quality, it should not be promoted toward production.

## One visible assistant

Fabio should interact primarily with one main assistant/orchestrator.

Sub-agents are internal specialists. They should feel like departments inside the
operating system, not separate personalities Fabio must supervise manually.

### Implications

- Multi-agent work is orchestrated through Core Brain.
- Handoffs are explicit, bounded, and auditable.
- Fabio receives summaries, decisions, approval requests, and exceptions.
- Fabio should not need to inspect every internal model call or sub-agent step unless
  something needs approval or review.

## Safety before power

The system should gain capability only after the matching safety control exists.

| Capability | Required control first |
| --- | --- |
| More model providers | Provider-neutral gateway, usage accounting, limits |
| More model autonomy | Budget enforcement and audit |
| Cloud/VPS deployment | Security review, secret boundaries, backup recovery |
| 24/7 operation | Cost, security, backup, incident, and approval guardians |
| Direct tools | Policy, approval, idempotency, result validation, audit |
| n8n workflows | Workflow allowlist, approvals, callbacks, replay safety |
| Browser/computer control | Strong sandboxing, approvals, redaction, and audit |
| Email or publishing | Review pass, exact destination, human approval |

## No hidden work

MV AI OS must not perform hidden work that Fabio cannot understand or audit.

Forbidden patterns:

- hidden model calls;
- hidden tool calls;
- hidden network calls;
- background token-burning loops;
- silent retries that increase cost or duplicate side effects;
- unreported fallback providers;
- secret lookup through implicit environment discovery;
- claims that a backup is safe without restore verification.

## Default-deny remains doctrine

Every capability starts unavailable.

An agent declaration means "this agent may request this capability." It does not mean
"this agent is authorized." Effective permission must still come from the existing
policy system and, where required, human approval.

## Trust requires verification

Model output, transcripts, memory, knowledge, websites, tool results, and prior agent
answers are untrusted until validated against their contract, provenance, and policy
scope.

The system should prefer:

- explicit evidence over confidence;
- restore tests over backup claims;
- measured usage over guessed cost;
- scoped permissions over broad access;
- deterministic test doubles before live provider calls.

## Founder/operator posture

Fabio's job is to define direction, approve risk, choose offers, review important
outputs, and make business decisions.

Fabio's job is not to:

- manually coordinate every sub-agent;
- watch token loops;
- check if backups are fake;
- hunt for leaked secrets;
- inspect every internal prompt;
- rescue vague autonomous behavior.

The system should present concise operator-level control surfaces:

- what happened;
- what it cost or may cost;
- what evidence supports it;
- what risks exist;
- what approval is needed;
- what the recommended next action is.

## Local-first before cloud

Local-first does not mean casual. It means control is easier to reason about while the
architecture matures.

Cloud, VPS, public endpoints, background workers, and 24/7 autonomy should wait until:

- secret boundaries are hardened;
- backups and restore verification are routine;
- cost accounting and budget enforcement exist;
- policy and approvals are durable;
- security review and incident handling are in place.

## Content and knowledge doctrine

The transcripts reinforce that Fabio's knowledge, voice, and business perspective are
assets. MV AI OS should help structure them, not dilute them into generic AI output.

### Rules

- Voice profile is knowledge, not hidden prompt folklore.
- Approved preferences may become memory only after explicit confirmation.
- Source material remains knowledge with provenance.
- Decisions and stable conclusions become memory only through governed proposals.
- Customer-facing content must distinguish facts, assumptions, and creative framing.
- Unsupported claims must become warnings, gaps, or review failures.

## Cost doctrine

Cost governance is not a later dashboard decoration. It is core operating safety.

### Rules

- Usage accounting comes before deeper autonomy.
- Budget enforcement comes before uncontrolled provider expansion.
- Repeated retries must be bounded.
- Expensive model profiles must be explicit.
- Costs should be visible at the operator level without storing prompts, secrets, or
  provider payloads.

## Security doctrine

Security is not only encryption or authentication. It is the discipline of preventing
untrusted input, credentials, tools, and autonomy from combining into damage.

### Rules

- Secrets are infrastructure values, never domain data.
- Prompt-injection content must not override system policy.
- Browser, filesystem, terminal, email, and computer control are high-risk future
  capabilities.
- Public endpoints and cloud deployment require a security milestone first.
- Rapidly copied agent code is treated as untrusted until reviewed.

## Backup doctrine

A backup is not real until restore has been proven.

### Rules

- Backup before risky infrastructure changes.
- Restore into inactive destinations only.
- Verify schema identity and application identity.
- Verify task, request, audit, memory, and knowledge survival.
- Report backup age and restore confidence.

## Autonomy doctrine

Autonomy is earned, not assumed.

Future 24/7 behavior must be:

- bounded by budget;
- bounded by permission;
- observable;
- interruptible;
- auditable;
- recoverable;
- useful without requiring Fabio to watch it constantly.

## Practical decision filter

Before implementing any agent capability, ask:

1. What operator problem does this solve?
2. Which existing boundary should own it?
3. What permission is required?
4. What can go wrong if it loops, lies, spends, leaks, deletes, or publishes?
5. How will Fabio approve or stop it?
6. How will we test it deterministically?
7. What must be audited?
8. What is explicitly out of scope?

If these answers are weak, the feature is not ready.
