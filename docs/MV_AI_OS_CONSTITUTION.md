# MV AI OS Constitution

## 1. Authority and purpose

This constitution is the highest-level strategic, architectural, product, safety, and
execution reference for MV AI OS. It does not replace the more specific contracts in
`docs/ARCHITECTURE.md`, `docs/AGENTS.md`, `docs/ROADMAP.md`, `AI_ENGINEERING_RULES.md`,
or `docs/project-state/`. It explains why those documents exist, how they fit
together, and which shortcuts are permanently forbidden.

Future Codex sessions, ChatGPT sessions, Claude sessions, Gemini sessions,
Perplexity sessions, or any other AI implementation agent must treat the repository as
the source of truth. Chat history is useful context, never authority. Before
implementation, an agent must read this constitution, the current project-state
documents, and the relevant architecture documents, then verify the source tree
directly.

This document is intentionally strict. MV AI OS is not being built as a collection of
exciting demos. It is being built as an operating system Fabio can trust with time,
money, business assets, memory, knowledge, models, future workflows, and eventually
controlled automation.

## 2. Final vision

MV AI OS exists to become Fabio's local-first AI operating system: one controlled
environment where Fabio can turn goals into tasks, tasks into specialist work,
specialist work into validated artifacts, and validated artifacts into approved
business outcomes.

Any Telegram surface is governed by
`docs/TELEGRAM_PERSONAL_PRIVACY_BOUNDARY.md`: it is only a dedicated-bot command and
output transport and must never access Fabio's personal account, chats, contacts,
history, Saved Messages, groups, channels, social graph, media, or private activity.

The mature system should feel simple from Fabio's perspective:

```text
Fabio
  -> Only Way Assistant
  -> Control Plane
  -> Agent Company
  -> Workflow Runtime
  -> Tool Runtime
  -> Products and business outcomes
```

The simplicity must be earned internally. Behind the visible assistant there must be
clear contracts, policy checks, budgets, audit events, backups, recovery paths,
quality gates, model boundaries, knowledge provenance, memory governance, and human
approval rules.

The final vision is not "many agents doing random things." The final vision is a
disciplined AI company operating layer where Fabio remains founder, operator,
investor, and final decision maker.

## 3. Long-term mission

MV AI OS exists to help Fabio:

- save time by delegating bounded work to reliable specialist roles;
- make better business decisions through grounded research, finance, review, and
  synthesis;
- create monetizable assets such as offers, campaigns, content systems, client
  proposals, ebooks, templates, and automation designs;
- reduce operational risk by making cost, security, backups, quality, and incidents
  visible before deeper autonomy exists;
- preserve useful knowledge and memory without turning unverified conversation into
  permanent truth;
- operate one coherent assistant instead of babysitting a chaotic swarm of bots.

The system should steadily move Fabio from manual coordination to executive
direction. Fabio should spend more attention on offers, positioning, judgment,
relationships, approvals, and investment decisions, and less attention on which agent
to call, whether a backup is real, whether a token loop is burning money, or whether a
tool is about to mutate something unsafe.

## 4. Product philosophy

MV AI OS is a product and operating system before it is an automation playground. Its
product philosophy is:

1. **One visible operating surface.** Fabio should talk primarily to the Only Way
   Assistant. Internal specialists may exist, but they are departments inside the
   operating system, not separate personalities Fabio must manage manually.
2. **Capability follows control.** More power is added only after matching safety,
   cost, approval, backup, audit, and recovery controls exist.
3. **Local-first before cloud.** Local operation makes boundaries easier to inspect
   while the system matures. Cloud, VPS, public endpoints, scheduling, and 24/7 loops
   are later chapters, not shortcuts.
4. **Contracts before runtime.** Specifications for agents, workflows, tools, memory,
   knowledge, models, and policy come before broad execution.
5. **Determinism before magic.** Deterministic offline tests prove behavior before
   live providers or autonomous operation.
6. **Operator clarity before feature breadth.** Every output should help Fabio decide
   what happened, what it costs, what risk exists, what evidence supports it, and what
   action requires approval.
7. **Business value before novelty.** A feature should save Fabio time, help Fabio
   make money, reduce risk, improve quality, or reduce operational work. If it does
   none of these, it does not deserve production priority.

## 5. Fabio's role

Fabio is the founder, operator, investor, and final decision maker.

As founder, Fabio sets direction: markets, offers, positioning, business priorities,
and the level of risk worth taking.

As operator, Fabio approves sensitive actions, reviews important outputs, and decides
when a result is good enough to use.

As investor, Fabio protects time, money, focus, data, accounts, relationships, and
brand reputation. The system must treat these as scarce assets.

As final decision maker, Fabio can override recommendations, reject outputs, approve
controlled risk, or pause capability expansion. MV AI OS may analyze, propose,
summarize, warn, and prepare work. It must not silently take over Fabio's judgment.

Fabio is not the babysitter of agents. The system must not require him to watch every
internal model call, coordinate every handoff, inspect every prompt, confirm every
routine internal step, or rescue vague autonomous behavior. The point of MV AI OS is
to reduce operational drag, not convert Fabio into a dispatcher for bots.

## 6. Why Fabio talks to one assistant, not many agents

The permanent operator model is one visible assistant: the Only Way Assistant.

Many visible agents create three failure modes:

- Fabio becomes a manager of bots instead of a founder/operator.
- Context becomes fragmented across conversations, roles, and decisions.
- Accountability becomes unclear when one agent blames another or silently expands
  scope.

One visible assistant creates the opposite:

- Fabio expresses goals in one place.
- The system routes internally through Core Brain and validated specifications.
- Specialist work remains auditable and bounded.
- Fabio sees decisions, summaries, risks, blockers, approval requests, and next
  actions instead of internal noise.

Internal agents may eventually behave like departments in an AI company. Fabio should
not need to talk separately to every department unless he chooses to inspect a detail.

## 7. System order and why it matters

The system is ordered deliberately:

```text
Fabio
  -> Only Way Assistant
  -> Control Plane
  -> Agent Company
  -> Workflow Runtime
  -> Tool Runtime
  -> Product Layer
```

This order prevents unsafe power from arriving before governance.

Fabio comes first because business direction and approval belong to the human
operator.

Only Way Assistant comes next because a single operator interface prevents
over-agentification.

Control Plane comes before the Agent Company because costs, secrets, backups,
incidents, and quality must be visible before more specialists exist.

Agent Company comes before Workflow Runtime because the system must know which
specialist roles exist, why they exist, and what they are forbidden to do before it
chains them together.

Workflow Runtime comes before Tool Runtime because deterministic multi-step logic and
approval gates should control side effects.

Tool Runtime comes late because direct tool execution can spend money, mutate files,
send messages, publish content, expose data, or damage systems.

The Product Layer comes after these foundations because dashboards, APIs, and
customer-facing surfaces must not bypass the same policy, runtime, audit, and
approval boundaries.

## 8. Only Way Assistant

The Only Way Assistant is Fabio's single operating surface.

Its mission is to convert Fabio's goals into bounded tasks, present operator-readable
decisions, surface missing information, summarize specialist outputs, identify
approval requirements, and protect Fabio from having to manually supervise internal
agent machinery.

The Only Way Assistant is responsible for:

- understanding Fabio's command at the operator level;
- preserving a concise, useful conversation path;
- presenting what the system can do, cannot do, and needs before continuing;
- surfacing cost, security, backup, incident, quality, and policy warnings supplied
  by the control plane;
- recommending delegation only through approved boundaries;
- explaining next actions in practical terms;
- keeping the system aligned with Fabio's business objective.

The Only Way Assistant is not responsible for:

- bypassing Core Brain;
- granting itself permissions;
- executing tools;
- calling models outside the Model Gateway;
- running workflows;
- mutating memory, knowledge, files, backups, or external systems directly;
- hiding internal failures;
- inventing approval where Fabio has not given it.

The Only Way Assistant should evolve from specification, to deterministic runtime
boundary, to presentation protocol, to controlled operator interface. It must remain
grounded in Core Brain, policy, guardians, task records, memory, knowledge, and audit.

## 9. Control Plane

The Control Plane is the safety and operating layer that makes future autonomy
responsible. It exists before broad autonomy because the cost of discovering safety
problems after external actions are enabled is too high.

The permanent control-plane roles are:

- **Cost Guardian:** evaluates model usage, limits, budgets, retry patterns, and cost
  risk without storing prompts, completions, provider payloads, or secrets.
- **Security Guardian:** evaluates secret boundaries, provider wiring, unsafe
  capability drift, live-provider posture, tool-execution posture, and cloud/VPS
  readiness from sanitized inputs.
- **Backup Guardian:** evaluates backup availability, freshness, schema identity,
  restore verification, and recovery confidence without operating backups itself.
- **Incident Guardian:** classifies sanitized operational failures and recommends
  controlled recovery paths without alerting, retrying, restoring, or remediating by
  itself.
- **Quality Guardian:** evaluates supplied quality signals, evidence posture, claim
  risk, voice risk, review posture, and publication readiness without using a model
  to judge content.
- **Operator Safety Report:** aggregates guardian outputs into a concise
  operator-facing summary without recalculating raw guardian logic.

Control-plane components analyze, warn, recommend, and summarize. They do not run in
the background, call models, send alerts, mutate external systems, spend money,
restore databases, rotate secrets, publish content, or make autonomous decisions.

Before any future autonomous capability expands, the Control Plane must answer:

- What can this capability cost?
- What can it expose?
- What can it mutate?
- What can it duplicate?
- What approval is required?
- What audit record exists?
- What recovery path exists?
- What happens if it fails repeatedly?

## 10. Agent Company

The Agent Company is the future internal specialist organization of MV AI OS. It is
not a runtime yet. It must first exist as a validated declarative map of roles,
business value, boundaries, approvals, control-plane dependencies, and future
AgentSpecification mappings.

The initial Agent Company roles are:

- **Research Agent:** gathers and synthesizes market, product, competitor, and topic
  knowledge from permitted sources. It must cite provenance and surface gaps.
- **Business Agent:** turns research and objectives into offers, positioning, business
  models, and practical validation plans.
- **Content Director:** coordinates customer-facing content direction and keeps
  outputs aligned with offer, channel, voice, and review requirements.
- **Developer Agent:** prepares technical specifications, automation designs, and
  integration plans without executing terminal, filesystem, browser, cloud, or n8n
  actions.
- **Publisher Agent:** prepares publishing plans and delivery proposals, but never
  publishes, schedules, sends, or contacts anyone without explicit future approvals
  and workflow execution boundaries.
- **Knowledge Curator:** organizes knowledge scopes, tags, provenance, freshness, and
  curation recommendations without importing arbitrary material or mutating knowledge
  automatically.
- **Sales Agent:** prepares proposals, outreach drafts, objection handling, and sales
  assets without sending communications or fabricating claims.
- **Finance / Cost Analyst:** analyzes pricing, margins, budgets, unit economics, and
  cost scenarios without moving money or inventing unsupported financial facts.
- **Legal / Risk Reviewer:** flags claim, compliance, contract, and risk issues as
  non-legal operational guidance; it must not replace a qualified professional.
- **Customer Delivery Agent:** prepares delivery plans and client-facing artifacts,
  but cannot send, fulfill, or mutate customer systems without approved workflow
  boundaries.

Every role must answer at least one business value question:

- Does it save Fabio time?
- Does it help Fabio make money?
- Does it reduce risk?
- Does it improve quality?
- Does it reduce operational work?

Roles are not permission grants. A role declaration means the system may later map
the role to exact AgentSpecifications. Each invocation still requires Core Brain
routing, policy evaluation, model limits, budget controls, memory/knowledge scope
checks, approval requirements, and audit.

## 11. Workflow Runtime

Workflow Runtime is the future deterministic multi-step execution layer. It should
consume validated WorkflowSpecifications, not invent graphs dynamically.

Workflow Runtime will eventually coordinate sequences such as:

- social short-form content creation;
- reselling product discovery;
- business offer building;
- market research;
- knowledge-to-ebook production;
- campaign generation;
- client proposal preparation;
- executive review.

Workflow Runtime must preserve these rules:

- every step references exact agent IDs and versions;
- transitions are declared and validated;
- failure policies are explicit;
- cycles are allowed only when the specification permits them;
- human approval points are declared before side effects;
- delivery failure does not erase content generation success;
- all handoffs return to Core Brain for policy, context, and budget checks.

Workflow Runtime is not n8n. n8n may later perform external integrations, but MV AI
OS must own the workflow contracts, state, idempotency, approval gates, and audit.

## 12. Tool Runtime

Tool Runtime is the future controlled execution layer for typed tools. It is
intentionally later than policies, specifications, workflows, approvals, audit,
budget controls, and security review.

Direct tools are dangerous because they can read private data, mutate files, run
commands, use the browser, contact services, publish, send, delete, buy, or leak
secrets. Therefore:

- no tool is available by default;
- every tool must have a validated definition;
- every invocation must validate input and output;
- every side-effecting tool requires explicit permission and approval;
- idempotency must exist where repeated execution can duplicate impact;
- tool results are untrusted data;
- tool failures are normalized;
- tool activity is audited;
- Fabio must understand what the tool can do before approving it.

The current Tool Gateway foundation is non-executing by design. That is a safety
feature, not an incompleteness bug.

## 13. Local Web Console

The future Local Web Console is an operator surface, not a privileged bypass.

Its role should be to expose:

- task submission and replay;
- task, request, and audit history;
- memory and knowledge inspection within policy;
- model usage, limits, budgets, and cost posture;
- guardian reports and operator safety summaries;
- approvals and pending decisions;
- backup and restore status;
- agent, workflow, tool, and provider configuration views.

The console must use the same application contracts and runtime boundaries as the CLI
and any future API. It must not access repositories, secrets, models, tools, or
workflows directly. Dashboard mutation paths require the same policy and audit
behavior as every other transport.

## 14. VPS and 24/7 future role

VPS or 24/7 operation is a future deployment chapter, not a near-term shortcut.

Always-on systems amplify every mistake:

- token loops burn money while nobody watches;
- public surfaces increase attack risk;
- scheduled jobs can duplicate side effects;
- stale memory or knowledge can steer repeated bad decisions;
- weak backup practice becomes real data-loss risk;
- incident handling becomes mandatory.

Before cloud or 24/7 operation, MV AI OS must have mature cost visibility, budget
enforcement, secret handling, backup verification, incident classification,
operator-approval rules, audit, and shutdown/recovery behavior.

Cloud does not make the system more professional by itself. Professionalism comes
from controlled boundaries, repeatable deployment, recovery confidence, and clear
operator responsibility.

## 15. Product layer and monetizable strategy

MV AI OS should become useful to Fabio first, then productizable. The path to
monetization should emerge from real operator value rather than speculative platform
features.

Potential monetizable product directions include:

- an AI operating system for solopreneurs who need one assistant plus governed
  specialist departments;
- a local-first business content and offer engine with knowledge, review, and
  approval gates;
- a controlled AI workflow console for agencies and creators;
- a safety-first agent operating layer for cost, secrets, backups, and quality;
- reusable agent company templates for vertical markets such as reselling, content,
  client proposals, and digital product launches.

The product strategy must preserve the architecture:

- no customer-facing feature bypasses Core Brain;
- no dashboard bypasses policy;
- no provider lock-in leaks into agents;
- no external workflow runs without approval and idempotency;
- no monetization feature stores secrets, prompts, or customer data casually;
- no "AI employee" positioning promises unrestricted autonomy.

MV AI OS should sell reliability, control, and leverage, not fantasy autonomy.

## 16. Safety principles

The permanent safety principles are:

- default-deny capability access;
- fail-closed validation;
- explicit human approval for sensitive actions;
- no hidden model calls;
- no hidden tool calls;
- no hidden network calls;
- no hidden memory mutation;
- no hidden provider fallback;
- no unbounded retries;
- no background autonomy without cost, security, backup, incident, and approval
  controls;
- every public boundary runtime validated;
- every sensitive report redaction-safe.

The system treats model output, retrieved knowledge, stored memory, transcripts,
websites, tool results, prior agent outputs, and user-provided files as untrusted
until validated and scoped.

## 17. Cost governance principles

Cost governance is core infrastructure.

Every model and future tool capability must be understandable in terms of:

- what operation is requested;
- which provider or profile may be used;
- what limit applies;
- what usage was reported;
- how estimated cost was calculated;
- what budget gate applied;
- what happened when usage or price information was missing.

The system must not invent pricing. Estimated costs require explicit pricing
configuration or must be reported as unavailable. Cost reports must not store prompts,
completions, provider payloads, secret references, resolved secrets, or raw
diagnostics.

The sequence is permanent:

```text
operation limits
  -> usage accounting
  -> budget enforcement
  -> cost guardian reporting
  -> broader model autonomy
```

## 18. Secret safety principles

Secrets are infrastructure values. They are not memory, knowledge, prompts, audit
payloads, task data, model inputs, public errors, or content.

Secret handling must follow these rules:

- configuration stores inert secret references, not secret values;
- resolution is explicit and ephemeral;
- adapters receive resolved values only at the infrastructure boundary;
- agents and Core Brain never depend on provider-specific secret types;
- public errors and reports must not expose secret references or resolved secrets;
- no implicit environment discovery becomes a hidden credential path;
- future dashboards must never display resolved secret material.

Secret convenience is less important than secret containment.

## 19. Backup and recovery principles

A backup is not real until restore has been verified.

Backup and restore principles:

- SQLite is currently the local source of truth for task lifecycle, requests, audit,
  memory, and knowledge.
- Backup and restore are controlled local operations outside Core Brain.
- Restore must target inactive destinations.
- No partial restore.
- No overwrite without explicit intent.
- Schema identity and application identity must match.
- Backup reports should distinguish backup existence from restore confidence.
- Backup guardians analyze readiness; they do not operate backups autonomously.

Future cloud backup or scheduled backup must wait for security, approval, retention,
and incident controls.

## 20. Human approval principles

Human approval is required before actions that can affect money, reputation, data,
secrets, permissions, external systems, or customer relationships.

Approval categories include:

- spending money;
- publishing or sending external content;
- contacting customers, leads, suppliers, or platforms;
- changing permissions;
- exposing or rotating secrets;
- deleting, restoring, or overwriting data;
- enabling live provider usage beyond configured limits;
- running side-effecting tools;
- executing n8n workflows;
- deploying to cloud or VPS;
- enabling background or scheduled autonomy.

Approval must be explicit, scoped, attributable, auditable, and tied to the exact
operation. A general conversation preference is not approval for a future side effect.

## 21. Auditability principles

Audit is not decorative logging. Audit is how Fabio and future maintainers understand
what happened.

Auditable records should identify:

- workspace;
- actor;
- request;
- task;
- correlation;
- selected agent or provider boundary where applicable;
- policy decisions;
- state transitions;
- important validation failures;
- usage, budget, guardian, and approval decisions where applicable.

Audit must remain redaction-safe. It must not become a dump of prompts, completions,
secrets, provider payloads, raw transcripts, raw knowledge, raw memory, stack traces,
or private paths.

## 22. Memory and knowledge principles

Memory and knowledge are different.

Memory is retained system context: approved preferences, operational facts, task
context, and durable conclusions that affect future behavior.

Knowledge is source material: citable records with provenance, scope, freshness, tags,
and permissions.

Rules:

- memory writes are governed proposals, not silent side effects;
- knowledge retrieval is permission-scoped and source-aware;
- records must validate on write and read;
- freshness matters for market, price, legal, competitor, and product facts;
- untrusted source instructions cannot override system policy;
- voice profile and brand materials belong in knowledge unless Fabio approves a
  stable preference as memory;
- secrets, raw PII, and unsupported claims do not belong in knowledge or memory;
- deletion, expiry, and visibility must remain enforceable.

Future embeddings and vector search may improve retrieval, but they must preserve the
same policy, scope, freshness, and provenance semantics.

## 23. Model and provider neutrality principles

Agents and Core Brain must never depend directly on OpenAI, Anthropic, Gemini, or any
other provider SDK.

The Model Gateway is the normal model access path. Providers are adapters behind
provider-neutral contracts. Agents request model profiles and capabilities, not SDKs,
API keys, transport internals, or vendor-specific retry behavior.

Provider neutrality exists to protect:

- architecture;
- cost control;
- testability;
- failure normalization;
- future provider switching;
- Fabio's negotiating and operating freedom.

OpenAI support is valid as an adapter. OpenAI lock-in is not.

## 24. Agent design principles

Every future agent must be:

- focused on a bounded mission;
- versioned;
- discoverable through validated specifications;
- invoked through common contracts;
- least-privileged;
- policy-governed;
- model-provider-neutral;
- evidence-aware;
- auditable;
- testable offline;
- unable to call other agents directly;
- unable to grant itself permissions;
- unable to execute side effects without approved runtime boundaries.

Agent names are not authority. Exact AgentSpecifications, policy grants, task grants,
approval grants, operation limits, budget checks, and runtime validation define what
an agent can do.

## 25. Delegation principles

Delegation is not execution.

A delegation policy may recommend which internal role should handle a bounded
objective. It must not invoke that role unless a separate runtime boundary is
approved and implemented.

Delegation must preserve:

- one visible assistant;
- Core Brain-mediated routing;
- exact role/specification identity;
- policy checks per invocation;
- budget and model limits;
- memory and knowledge scope isolation;
- guardian consultation where required;
- operator approval for sensitive paths.

Fabio should receive useful delegation summaries without becoming a scheduler for
agents.

## 26. Workflow principles

Workflow specifications must precede workflow execution.

Workflow execution may only use declared steps, transitions, conditions, inputs,
outputs, failure policies, approval points, and exact referenced agent versions.

Workflows must not:

- invent agents dynamically;
- skip review gates;
- duplicate side effects;
- hide delivery failures;
- mutate durable state outside repository boundaries;
- bypass Core Brain;
- bypass policy;
- bypass audit.

Workflow Runtime should make multi-step work safer and clearer, not more mysterious.

## 27. Tool execution principles

Tool execution is one of the highest-risk future capabilities.

Before any real tool execution exists, MV AI OS must have:

- validated tool definitions;
- policy-derived permission checks;
- explicit approval rules;
- idempotency requirements;
- result validation;
- timeout and retry controls;
- audit events;
- security review;
- redaction-safe errors;
- a clear distinction between read-only and side-effecting tools.

Browser automation, terminal execution, filesystem mutation, email sending, payment,
publishing, and computer control are critical-risk capabilities. They must not be
implemented casually or hidden inside "convenience" features.

## 28. Dashboard and product-layer principles

The dashboard is a future product surface. It is not a privileged architecture layer.

The dashboard may display and operate:

- requests;
- task results;
- audit history;
- memory and knowledge records;
- guardian reports;
- cost and budget posture;
- approvals;
- backup/recovery status;
- agent/workflow/tool/provider configuration.

But it must call the same runtime and service boundaries as the CLI or future API.
Direct database writes, direct secret reads, direct provider calls, direct workflow
execution, and direct tool execution from the dashboard are forbidden.

## 29. Architecture rules

These architecture rules are permanent:

- Core Brain depends on interfaces, not storage implementations, transport adapters,
  provider SDKs, dashboards, n8n, or external tools.
- Agents depend on contracts and gateways, not provider SDKs or storage internals.
- Repositories own persistence boundaries.
- Registries own immutable specification lookup.
- Services own governed domain behavior.
- Gateways own provider-neutral access to models and tools.
- Validators protect every public and cross-module boundary.
- Configuration is validated before runtime creation.
- Dependency injection remains explicit.
- Failures fail closed.
- Public errors are redaction-safe.
- Contracts are versioned and immutable unless intentionally revised.
- Storage remains replaceable behind interfaces.
- Provider adapters remain infrastructure.
- UI and CLI remain thin transports.
- No layer may bypass policy, validation, audit, or approval because it is "local."

## 30. Coding rules

Implementation work must follow the repository's existing conventions.

Rules:

- implement exactly the approved milestone;
- inspect existing code before editing;
- reuse existing contracts and patterns;
- do not redesign completed milestones;
- do not add speculative abstractions;
- do not add placeholders;
- do not add TODO comments;
- do not add dependencies unless explicitly necessary and approved;
- do not change project configuration unless the milestone requires it;
- do not modify documentation unless the milestone requires it;
- keep changes small and cohesive;
- keep public exports intentional;
- keep tests deterministic and offline;
- protect user changes in the working tree;
- update project-state documents after completed milestones.

## 31. Testing philosophy

Testing is the proof that architecture is real.

MV AI OS tests must prove:

- valid contracts are accepted;
- invalid contracts fail closed;
- permission denial prevents adapter access;
- deterministic ordering is stable;
- duplicate requests replay safely;
- conflicts are normalized;
- persistence survives restart when persistence is in scope;
- corrupt stored records are rejected;
- reports are redaction-safe;
- providers are tested through deterministic transports;
- guardians do not perform side effects;
- Core Brain behavior remains stable when unrelated foundations are added.

Live provider tests, cloud tests, n8n tests, browser tests, or dashboard tests may be
added later only as explicit, separated suites. They must never replace deterministic
offline coverage.

## 32. Commit and project-state rules

Every completed milestone must update project-state documents before final reporting.

`docs/project-state/01_CURRENT_STATE.md` records verified current state.
`docs/project-state/02_MASTER_ROADMAP.md` records the phase roadmap.
`docs/project-state/03_ARCHITECTURE_PRINCIPLES.md` records permanent architecture
principles.
`docs/project-state/04_NEXT_TASK.md` records exactly one next milestone.
`docs/project-state/05_DECISIONS.md` records cumulative architecture decisions.

Commits should be professional, scoped, and traceable to one milestone. Project-state
documents are part of the milestone, not optional commentary.

If the repository is dirty, classify changes before editing. Do not delete unrelated
files without approval. Stage only milestone files.

## 33. Roadmap chapters

The long-term roadmap should be understood as architecture chapters:

1. **Architecture and engineering baseline:** documents, rules, TypeScript, quality
   gates, and project memory.
2. **Orchestration kernel:** Core Brain, task lifecycle, repositories, audit,
   idempotency, routing, policy, and deterministic content baseline.
3. **Governed capability foundations:** knowledge, model gateway, agent
   specifications, workflow specifications, tool gateway.
4. **Durable local runtime:** SQLite lifecycle, memory, knowledge, runtime
   composition, CLI, backup/restore, configuration, and secret resolution.
5. **Production model capability:** controlled provider adapter, OpenAI wiring,
   operation limits, usage accounting, budget enforcement.
6. **Control plane safety:** Cost, Security, Backup, Incident, Quality Guardians and
   Operator Safety Report.
7. **Main Assistant layer:** specification, runtime boundary, guardian consultation,
   decision engine, delegation policy, and operator protocol.
8. **Agent Company:** declarative internal company map, then exact core agent
   specifications.
9. **Mission planning:** dry-run plans before executing multi-agent workflows.
10. **Workflow Runtime:** deterministic multi-step execution with approvals and audit.
11. **Tool Runtime:** approved tool execution under policy and audit.
12. **Local Web Console:** user-facing local operator surface.
13. **n8n integration:** approved external workflow execution.
14. **Cloud/VPS and 24/7:** hardened deployment only after control gates.
15. **Productization:** packaged operator experience, templates, documentation,
   customer-safe configuration, and monetizable offerings.

The roadmap may evolve, but the safety ordering must not be inverted.

## 34. What exists today

At the time this constitution is introduced, MV AI OS already has:

- strict TypeScript/ESM project foundation;
- Core Brain orchestration foundation;
- deterministic Content Agent baseline;
- repository-backed, idempotent, audited task lifecycle;
- SQLite-backed task, request, audit, memory, and knowledge persistence;
- governed Memory Service;
- governed Knowledge Service;
- provider-neutral LLM Gateway;
- deterministic local provider and controlled OpenAI provider adapter;
- controlled local OpenAI provider wiring;
- model operation limits;
- model usage accounting;
- model budget enforcement;
- default-deny Policy/Governance foundation;
- Agent Specification System;
- Workflow Specification System;
- non-executing Tool Gateway foundation;
- validated local runtime composition;
- controlled local CLI entrypoint;
- controlled local SQLite backup and restore;
- controlled configuration and secret references;
- explicit local secret resolution;
- Cost Guardian, Security Guardian, Backup Guardian, Incident Guardian, and Quality
  Guardian foundations;
- Operator Safety Report;
- Main Assistant / Orchestrator specification foundation;
- Main Assistant runtime boundary;
- Guardian Consultation Boundary;
- Operator Decision Engine Foundation;
- Main Assistant Delegation Policy Foundation;
- Main Assistant Operator Protocol;
- project-state memory documents;
- agent-lab doctrine, roles, workflows, knowledge plan, voice profile, risk register,
  and playbooks.

These are real foundations and local execution capabilities. They are not the final
autonomous product.

## 35. What does not exist yet

MV AI OS does not yet have:

- a production Agent Company runtime;
- validated Agent Company role map in source;
- production Research, Business, Developer, Publisher, Sales, Finance, Legal/Risk, or
  Customer Delivery agents;
- multi-agent execution;
- Mission Planning runtime;
- Workflow Runtime execution;
- real Tool Runtime execution;
- n8n integration;
- dashboard or local web console;
- HTTP/REST/MCP server;
- background scheduler;
- Telegram, email, Slack, browser, terminal, or filesystem tools;
- vector search or embeddings;
- autonomous publishing, outreach, spending, purchasing, restoring, deployment, or
  self-improvement;
- cloud/VPS deployment;
- 24/7 operation;
- durable approval ledger beyond current foundations where not yet implemented;
- product packaging for external customers.

These absences are intentional. They protect the project from premature autonomy and
architecture drift.

## 36. Forbidden shortcuts and anti-patterns

The following are permanently forbidden unless a future milestone explicitly designs,
tests, and approves the capability through the correct boundaries:

- agent chaos: many visible agents Fabio must manually manage;
- autonomous loops without cost, approval, and shutdown controls;
- provider lock-in inside agents or Core Brain;
- direct OpenAI, Anthropic, Gemini, or provider SDK imports in agent logic;
- hidden model calls;
- hidden tool calls;
- hidden network calls;
- hidden provider fallback;
- hidden memory mutation;
- direct repository access from UI, agents, or transports;
- direct database writes outside repositories;
- direct tool execution without policy and approval;
- direct workflow execution without idempotency and audit;
- prompt-injection content treated as instructions;
- raw transcript dumps in repository memory;
- secrets in prompts, memory, knowledge, logs, audit, reports, or errors;
- dashboards that bypass policy;
- cloud/VPS exposure before security, cost, backup, and incident controls;
- backups claimed safe without restore verification;
- tests that require live providers for normal acceptance;
- speculative abstractions not tied to the current milestone;
- TODO placeholders standing in for architecture.

## 37. Definition of production ready

MV AI OS can be called production ready only when the following are true:

- Fabio can operate it through a stable local or deployed surface without bypassing
  Core Brain.
- Model use is bounded by operation limits, usage accounting, budgets, and
  redaction-safe reporting.
- Secrets are resolved explicitly and never leak into domain data or public errors.
- Backups are routine and restore verification is proven.
- Memory and knowledge governance work under real operator use.
- Agent specifications are complete for production agents.
- Workflows execute only from validated specifications with durable state,
  idempotency, approvals, and audit.
- Tool execution, if enabled, is policy-governed, approval-gated, validated,
  idempotent where needed, and audited.
- Guardian reports surface cost, security, backup, incident, and quality risk in
  operator-readable form.
- Dashboard or API surfaces, if present, are thin transports over existing runtime
  boundaries.
- Cloud/VPS deployment, if present, has threat model, backup, recovery, monitoring,
  incident, and cost controls.
- Deterministic tests, typecheck, lint, build, and relevant integration checks pass.
- Project-state documents accurately describe the current repository.

Production ready means reliable, recoverable, observable, bounded, and operator-safe.
It does not mean "the AI can do everything by itself."

## 38. How future Codex prompts should use this document

Future implementation prompts can be shorter because this constitution records the
permanent doctrine. A compliant Codex session should:

1. Read this constitution.
2. Read `AI_ENGINEERING_RULES.md`.
3. Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and relevant roadmap documents.
4. Read every file in `docs/project-state/`.
5. Inspect source and tests until repository reality matches the documents.
6. Stop and report inconsistencies before implementation.
7. Implement only the milestone in `docs/project-state/04_NEXT_TASK.md`.
8. Preserve existing architecture and public contracts unless the milestone
   explicitly changes them.
9. Run the required quality gates.
10. Update project-state documents.
11. Stage only milestone files.
12. Commit with the requested message when the environment permits.
13. Report the commit, verification, next milestone, and exact next action.

This is how MV AI OS remains deterministic across sessions, models, tools, and time.
