# MV AI OS Agent Lab — Transcript Insights Index

## Purpose

This index records derived insights from the reviewed transcript PDFs without copying
raw transcript text into the repository. It links the insights to MV AI OS doctrine,
risks, and engineering implications.

## Source set reviewed

The transcript analysis covered five local PDF exports from Fabio's transcript folder.
They discussed:

- AI-assisted book and content production;
- founder/operator focus versus technical rabbit holes;
- LLM tools, code execution, retrieval, and integrations;
- entrepreneurship, resilience, cash, strategy, and delegation;
- multi-agent architectures, autonomous assistants, and security risks.

The PDFs themselves remain outside the repository. This file stores only synthesized
project implications.

## Insight map

| Insight | MV AI OS interpretation | Related doctrine |
| --- | --- | --- |
| One main operator interface is better than many visible agents | Fabio should talk to a main assistant while sub-agents remain internal specialists | `07_CONTROL_PLANE_AGENTS.md`, `08_AI_AGENT_OPERATING_DOCTRINE.md` |
| Founder time is the scarce resource | Agent work should reduce babysitting and produce decision-ready outputs | Operating doctrine |
| Cost loops can become dangerous quickly | Usage accounting and budget enforcement must precede deeper autonomy | Cost playbook |
| Security mistakes can happen through small exposed surfaces | Secret handling, public endpoints, browser control, and cloud/VPS must be delayed until guarded | Risk register, Security playbook |
| Backups are only useful if restored successfully | Backup Guardian and restore verification are first-class controls | Backup playbook |
| Multi-agent systems are useful when orchestrated, not chaotic | Core Brain remains the control plane; agents do not call each other directly | Architecture principles |
| Tool access is powerful but dangerous | Direct tools wait for policy, approval, idempotency, validation, and audit | Risk register |
| Retrieval reduces hallucination but does not create truth | Knowledge remains untrusted source material with provenance and freshness | Knowledge plan |
| AI content should preserve Fabio's voice | Voice profile, brand knowledge, Review Agent, and claim checks are required | Voice profile |
| Strategy beats tool obsession | Milestones should increase real operator capability, not isolated novelty | Operating doctrine |
| 24/7 agents sound valuable but amplify risk | Always-on behavior waits for cost, security, backup, incident, and approval controls | Risk register |
| Self-improvement is risky without change control | Prompt/memory/spec changes need versioning, diff review, approval, and rollback | Risk register |

## Useful near-term ideas

1. Model usage accounting.
2. Model budget enforcement.
3. Cost Guardian as deterministic reporting.
4. Security Guardian as boundary review.
5. Backup Guardian as restore-confidence reporting.
6. Main Assistant specification.
7. Review/Quality Guardian specification.
8. Knowledge curation workflow for Fabio's source material.

## Ideas to defer

These ideas may be valuable later but are unsafe or premature now:

- 24/7 autonomous agents;
- background self-improvement;
- browser or computer control;
- terminal execution;
- file mutation tools;
- email sending;
- automatic publishing;
- autonomous n8n side effects;
- cloud/VPS deployment;
- autonomous spending or inventory actions;
- dashboard mutation paths before policy and audit are complete.

## Module mapping

| Module | Transcript implication |
| --- | --- |
| CoreBrain | Must remain the control plane and prevent agents from self-routing |
| Model Gateway | Must remain the only normal model path, with limits, usage, and cost controls |
| Policy | Must stay default-deny and govern memory, knowledge, models, tools, workflows, and approvals |
| Memory | Stores approved stable context, not every transcript thought or unverified preference |
| Knowledge | Stores source material with provenance, scope, freshness, and permissions |
| SQLite Backup/Restore | Enables local durability only when restore is verified |
| Secret Resolution | Must stay explicit, ephemeral, and adapter-local |
| OpenAI Provider | Remains an adapter, never an agent dependency |
| Operation Limits | Prevent oversize requests, timeout abuse, and unbounded retries |
| Usage Accounting | Next required visibility layer before broader model autonomy |
| Budget Enforcement | Required before uncontrolled model expansion |
| Cost Guardian | First-class control-plane agent after accounting and budgets |
| Security Guardian | First-class control-plane agent before cloud, tools, or 24/7 behavior |
| Backup Guardian | First-class control-plane agent before production reliance |
| Main Assistant / Orchestrator | Fabio's single interface; sub-agents stay internal |
| Future Dashboard | Should expose reports, approvals, audit, usage, and recovery status without bypassing policy |
| Future n8n | Side-effect layer only after workflow state, approvals, idempotency, and callbacks |

## Practical roadmap impact

The transcript insights do not require architecture redesign. They strengthen the
existing sequence:

1. finish model usage accounting;
2. add budget enforcement;
3. add cost/security/backup guardians as report-first control-plane agents;
4. define main assistant orchestration behavior;
5. only then expand toward live smoke tests, workflows, dashboard, and automation.

This keeps MV AI OS moving toward power without creating future damage.
