# MV AI OS Agent Specification

## 1. Purpose and authority

This document defines how specialized agents are described, selected, invoked,
permissioned, tested, and evolved. It refines the agent vision in `README.md` and uses
the system contracts in `ARCHITECTURE.md`.

Agents are focused reasoning modules. They are not autonomous processes with
unrestricted system access. The Core Brain remains responsible for orchestration,
policy, context boundaries, validation, and handoffs.

## 2. Agent design principles

Every agent must be:

- **Focused:** responsible for a clear role or knowledge domain.
- **Discoverable:** described by a validated, versioned manifest.
- **Interchangeable:** invoked through the common `AgentInvocation` contract.
- **Structured:** required to return a schema-valid `AgentResult`.
- **Least-privileged:** given only task-specific memory, tools, and workflow grants.
- **Observable:** attributable through agent, version, invocation, and trace IDs.
- **Testable:** evaluable without live side effects.
- **Replaceable:** free of direct dependencies on transport, storage, n8n, or secrets.

An agent must not expand its own scope, grant itself tools, alter policy, persist
durable memory directly, or execute an unapproved external side effect.

## 3. Agent identity and versioning

An agent has:

- a stable `agentId`, such as `content`;
- a human-readable name and description;
- a manifest `version`;
- an implementation version or build reference;
- one or more supported task types;
- a declared input and output contract;
- declared model, memory, knowledge, tool, and workflow capabilities.

Manifest versions use semantic versioning:

- patch: instructions or internal behavior change without contract changes;
- minor: backward-compatible optional capability or output addition;
- major: incompatible input, output, permission, or behavior contract change.

Stored invocations and results must retain the exact agent and manifest versions used.
The registry must reject duplicate `agentId` and version pairs.

## 4. Agent manifest

Each registered agent must have a machine-validated manifest containing:

| Field | Required | Meaning |
| --- | --- | --- |
| `agentId` | yes | Stable machine identifier |
| `name` | yes | Human-readable name |
| `version` | yes | Manifest version |
| `description` | yes | Bounded role description |
| `status` | yes | `active`, `disabled`, or `experimental` |
| `taskTypes` | yes | Supported normalized task types |
| `inputContract` | yes | Accepted structured input |
| `outputContract` | yes | Required structured output |
| `modelProfile` | yes | Named Model Gateway profile |
| `memoryAccess` | yes | Declared readable categories and write proposals |
| `knowledgeAccess` | yes | Search scopes or `none` |
| `tools` | yes | Declared direct tool capabilities; empty by default |
| `workflowProposals` | yes | Workflows the agent may propose |
| `limits` | yes | Timeout, token/cost, tool-call, and result-size limits |
| `instructionsRef` | yes | Versioned instruction source |
| `handoffTargets` | yes | Agents it may recommend to the Core Brain |
| `riskLevel` | yes | `low`, `medium`, or `high` |

Manifest declarations are maximum requested capabilities, not runtime grants.
Effective permissions are calculated for every invocation.

Agent instructions must be stored separately from user input and retrieved content.
Changing instructions must produce an identifiable implementation or manifest change.

## 5. Registry behavior

At startup, the Agent Registry must:

1. discover configured manifests;
2. validate manifest structure and referenced contracts;
3. reject invalid versions, duplicate identities, and unknown capabilities;
4. confirm that model profiles, tools, and workflows exist in configuration;
5. expose only active agents to routing;
6. fail startup when a required production agent is invalid.

Registry lookups return immutable manifest data. Runtime mutation of an agent manifest
is prohibited; configuration must be reloaded through a controlled operation.

## 6. Routing and selection

The Core Brain selects agents. Agents do not self-select.

A routing decision must consider:

- normalized task type and requested output;
- agent support declared in the registry;
- required context and capabilities;
- actor and policy permissions;
- model profile availability;
- task risk, limits, and expected cost;
- explicit user constraints;
- agent health and enabled status.

The decision must record the selected agent and version, alternatives considered where
useful, a reason code, and routing confidence. Low confidence or an unsupported task
must produce a clarification or unsupported-task result rather than silently choosing
an unrelated agent.

The initial deterministic route is:

```text
taskType = business.content -> agentId = content
```

Model-assisted routing may refine intent later, but manifest and policy validation
remain deterministic gates.

## 7. Invocation lifecycle

An agent invocation follows this lifecycle:

1. **Resolve:** load the exact active manifest and output contract.
2. **Authorize:** intersect actor, manifest, policy, task, and approval grants.
3. **Assemble:** build a bounded context from instruction, task, memory, and knowledge
   layers.
4. **Invoke:** call the agent through the runtime and Model Gateway.
5. **Validate:** parse and validate the structured result.
6. **Govern:** evaluate evidence, memory proposals, tool activity, and workflow
   proposals.
7. **Record:** persist outcome, usage, timing, and audit events.
8. **Return:** hand control to the Core Brain for synthesis or another planned step.

Every step is deadline-aware and uses the invocation and correlation identifiers.

## 8. Prompt and context assembly

Context assembly must preserve explicit boundaries between:

1. system policies and non-overridable safety rules;
2. versioned agent instructions;
3. task objective and structured user input;
4. conversation context;
5. selected memory;
6. selected knowledge and provenance;
7. granted tool descriptions;
8. required output contract.

User input, memory, retrieved documents, websites, and tool results are untrusted data.
Instructions contained inside them must not override system policy, the agent
manifest, or the task objective.

The assembler must enforce configured size limits and record which memory and
knowledge references were included. Truncation must be deterministic where practical
and observable. Sensitive records must be excluded before prompt construction, not
merely hidden in the final response.

## 9. Permissions and tools

Agents operate with an invocation-specific permission set.

### 9.1 Default behavior

- No direct tool is available unless declared in the manifest and granted by policy.
- No memory category is readable unless declared and granted.
- No workflow may be executed by an agent.
- Workflow proposals are limited to allowlisted logical workflow names.
- Durable memory writes are proposals only.

### 9.2 Direct tools

Read-only direct tools may be used when their typed input, output, timeout, and data
scope are granted.

Direct side-effecting tools require all of:

1. the tool is classified as direct-execution eligible;
2. the manifest declares it;
3. runtime policy grants it for the task;
4. required human approval is present;
5. input validates against the tool contract;
6. the call is idempotent where applicable;
7. the call and result are audited.

If any condition is absent, the agent may only propose an n8n workflow or return that
the action is unavailable.

### 9.3 Tool results

Tool outputs are untrusted data. They must be size-limited, validated, and labeled with
the tool name and call identifier before entering agent context. Provider-specific
errors must be normalized.

## 10. Memory behavior

Agents receive `MemoryExcerpt` values selected by the Memory Service. Each excerpt
contains a memory identifier, category, excerpt content, provenance, sensitivity, and
relevance metadata.

Agents must:

- use memory only for the invocation objective;
- cite memory identifiers in `evidence` when it materially affects output;
- avoid representing unverified memory as confirmed fact;
- avoid copying sensitive memory into output unless explicitly required and allowed;
- return proposed durable writes as `memoryProposals`.

A memory proposal contains category, proposed content, provenance, confidence,
retention suggestion, and reason. The Core Brain and Memory Service validate,
deduplicate, classify, and authorize it before persistence.

The Content Agent has no authority to write operational memory or silently create user
preferences.

## 11. Knowledge behavior

Agents request knowledge through a bounded query containing the task, permitted scope,
result limit, and optional freshness requirement. Results must include source
identifiers and provenance.

Agents must distinguish:

- statements supported by retrieved knowledge;
- statements based on user-provided facts;
- statements derived from memory;
- creative or proposed content.

If required knowledge is unavailable, stale, contradictory, or insufficient, the agent
must flag the limitation or request input. It must not fabricate a source reference.

## 12. Result requirements

Every invocation returns the common `AgentResult` envelope from `ARCHITECTURE.md`.

The runtime must reject:

- output that is not structurally parseable;
- output that violates the selected output contract;
- an unknown status;
- missing evidence arrays or memory-proposal arrays;
- undeclared workflow proposals;
- result sizes above configured limits;
- identifiers that do not match the invocation.

A bounded structured-output repair may be attempted for model formatting errors. The
repair must not alter task meaning or bypass permission checks. Exhausted repair
attempts produce a normalized model/validation failure.

## 13. Handoffs and decomposition

An agent may recommend a handoff only to a target declared in its manifest. The
recommendation includes the proposed target, bounded objective, reason, required
context references, and expected output.

The Core Brain decides whether to create another invocation. It must re-run routing,
permission, context, and budget checks. Raw prompt state and unrestricted context must
not pass directly between agents.

The initial Content Agent workflow does not require an agent-to-agent handoff.

## 14. Failure, timeout, and cancellation behavior

Agents must return or be wrapped in the standard error contract.

- Invalid invocation input fails before a model call.
- Timeouts terminate the invocation and prohibit further tool calls.
- Cancellation propagates through the runtime and Model Gateway where supported.
- Permission denials are not retried.
- Transient model failures may be retried within the invocation budget.
- A failed agent must not emit executable memory or workflow proposals.
- Partial diagnostic output may be retained internally but must not masquerade as a
  successful result.

The Core Brain owns retry and fallback decisions. An agent must not recursively retry
itself.

## 15. Content Agent specification

### 15.1 Identity and responsibility

| Property | Initial value |
| --- | --- |
| `agentId` | `content` |
| Supported task type | `business.content` |
| Role | Produce structured business/content material from a user objective and approved context |
| Default model profile | `content-quality` |
| Risk level | `low` for generation; policy-dependent for delivery/export |

The Content Agent may plan and generate content. It does not deliver, publish, email,
upload, or export content directly.

### 15.2 Accepted input

The normalized input supports:

- objective;
- content type;
- audience;
- desired tone and style;
- channel or intended destination;
- required facts and source material;
- length and formatting constraints;
- language;
- call to action;
- deadline or freshness requirements;
- optional delivery/export request.

Only the objective and content type are always required after clarification. Missing
information may be inferred only when the inference is low-risk and recorded in
`assumptions`; otherwise the agent returns `needs_input`.

### 15.3 Initial permissions

The Content Agent may request:

- conversation, semantic, and user memory reads;
- knowledge search;
- the `content-quality` model profile;
- proposals for configured delivery/export workflows.

It has no direct side-effecting tool grant by default. Working-memory access is
provided through the invocation context. Persistent writes are limited to memory
proposals.

### 15.4 ContentOutput contract

A successful Content Agent `output` contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `contentType` | yes | Normalized output type |
| `title` | no | Title or subject where applicable |
| `summary` | yes | Concise description of the result |
| `body` | yes | Main structured content |
| `audience` | yes | Intended audience |
| `tone` | yes | Applied tone/style |
| `language` | yes | Output language |
| `callToAction` | no | Requested call to action |
| `assumptions` | yes | Explicit assumptions; empty when none |
| `warnings` | yes | Limitations or unresolved concerns; empty when none |
| `sourceRefs` | yes | Knowledge references; empty when none |
| `memoryRefs` | yes | Material memory references; empty when none |
| `delivery` | no | Proposed logical workflow and destination data |
| `metadata` | yes | Channel, length, and format information |

`body` may contain nested JSON-compatible sections appropriate to the content type.
Its expected shape must be constrained by the requested output contract.

### 15.5 Workflow proposal

When the user requests delivery or export, the Content Agent may return a proposal
containing:

- configured logical workflow name;
- operation (`deliver` or `export`);
- intended destination;
- content result reference;
- requested format;
- non-secret delivery metadata;
- reason the operation is requested.

The proposal is not proof of permission and is not an execution result. The Core Brain
must validate it and n8n performs the side effect.

### 15.6 Content Agent acceptance criteria

The agent is implementation-ready when automated tests prove that it:

1. accepts the normalized business/content input;
2. returns `needs_input` for materially underspecified tasks;
3. uses only memory and knowledge supplied in its invocation;
4. produces valid `ContentOutput` for supported content types;
5. records assumptions, warnings, and evidence;
6. never fabricates source identifiers;
7. cannot invoke ungranted tools;
8. proposes only configured workflows;
9. does not persist memory directly;
10. represents generation success independently from workflow execution.

## 16. Agent testing and evaluation

Each agent requires:

- manifest validation tests;
- input and output contract tests;
- permission-denial and tool-isolation tests;
- deterministic tests with a fake Model Gateway;
- model-backed evaluation cases for quality and instruction following;
- prompt-injection and untrusted-context tests;
- timeout, cancellation, malformed-output, and retry tests;
- memory provenance and leakage tests;
- workflow-proposal tests with no live side effects.

Evaluation datasets must include normal cases, ambiguous requests, conflicting context,
unsupported tasks, sensitive data, and adversarial retrieved text. Fixtures must not
contain production secrets or unnecessary personal data.

Agent changes cannot be considered complete solely because they produce plausible
free-form text; contract validity, permissions, evidence behavior, and regression
evaluations are required.

## 17. Adding an agent

Adding a future agent requires:

1. a bounded role and supported task types;
2. versioned input and output contracts;
3. a validated manifest and instruction source;
4. explicit model, memory, knowledge, tool, and workflow declarations;
5. routing examples and unsupported cases;
6. unit, contract, permission, and model-backed evaluations;
7. registry registration;
8. documentation of human-approval and risk behavior.

New agents must not require changes to existing agent contracts or bypass the Core
Brain. If a proposed agent cannot operate through these boundaries, the architecture
must be reviewed before implementation.
