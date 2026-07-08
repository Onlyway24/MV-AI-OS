# MV AI OS Agent Lab — Agent Team Overview

## Purpose

This document defines the future multi-agent team Fabio will operate through MV AI OS.
It is a design artifact for later conversion into `AgentSpecification` records,
`AgentManifest` entries, workflow graphs, knowledge scopes, and policy grants.

It does not change runtime code. All agents remain Core Brain–mediated reasoning
modules with no direct side effects, no self-routing, and no bypass of policy.

## Design authority

- Product vision and boundaries: `docs/ARCHITECTURE.md`, `docs/AGENTS.md`
- Current executable baseline: `docs/project-state/01_CURRENT_STATE.md`
- Specification contracts: `AgentSpecification`, `WorkflowSpecification`
- Permission model: default-deny intersection of actor, manifest/spec, policy, task,
  and approval grants

## Team objective

Give Fabio a coordinated local AI operating team that can:

- turn business goals into researched, validated plans;
- produce on-brand content and campaigns;
- support product research, offers, proposals, and financial reasoning;
- prepare media and review artifacts;
- hand off external delivery only through approved n8n workflows later;
- preserve provenance, memory, and audit across sessions.

## Team composition

| Agent ID | Name | Primary domain | Initial task types |
| --- | --- | --- | --- |
| `ceo` | CEO Agent | Prioritization, delegation, synthesis | `strategy.priority`, `strategy.review` |
| `research` | Research Agent | Market, competitor, and source synthesis | `research.market`, `research.product`, `research.topic` |
| `business` | Business Agent | Offers, positioning, business models | `business.offer`, `business.model`, `business.analysis` |
| `content` | Content Agent | Structured copy and content assets | `business.content` *(implemented)* |
| `marketing` | Marketing Agent | Campaigns, channels, messaging plans | `marketing.campaign`, `marketing.calendar` |
| `sales` | Sales Agent | Proposals, outreach, objection handling | `sales.proposal`, `sales.outreach` |
| `video` | Video Agent | Scripts, hooks, shot lists, captions | `media.video`, `media.shortform` |
| `review` | Review Agent | Quality, compliance, consistency checks | `quality.review`, `quality.brand` |
| `developer` | Developer Agent | Technical specs, automation design | `engineering.spec`, `engineering.automation` |
| `finance` | Finance Agent | Unit economics, pricing, scenario analysis | `finance.analysis`, `finance.pricing` |

## Control model

```text
Fabio (local actor)
  -> Request Intake / CLI / future dashboard
  -> Core Brain
  -> task classification and routing
  -> one or more AgentSpecifications (exact version)
  -> optional WorkflowSpecification graph
  -> optional n8n side effects (future, approved only)
  -> validated TaskResponse + audit trace
```

Rules that apply to every agent in this team:

1. Agents never call one another directly; handoffs are Core Brain decisions.
2. Agents propose memory writes and workflows; they do not persist or execute them.
3. Effective permissions are computed per invocation, not inherited from role names.
4. Retrieved knowledge and memory are untrusted input, never executable policy.
5. Side-effecting work defaults to n8n workflows, not direct tools.
6. Every successful output must validate against the agent's declared output schema.
7. Evidence arrays must cite only supplied memory or knowledge identifiers.

## Team hierarchy (logical, not permission hierarchy)

The CEO Agent is not a superuser. It coordinates objectives and recommends handoffs,
but policy and Core Brain routing remain authoritative.

```text
                    CEO Agent
           (prioritize, delegate, synthesize)
                         |
     +---------+---------+---------+---------+
     |         |         |         |         |
 Research  Business  Marketing   Sales    Finance
     |         |         |         |         |
     +----+----+----+----+----+----+----+----+
          |              |              |
      Content        Video          Review
          |              |              |
          +------ Developer ----------+
                 (when automation/code needed)
```

Typical pattern:

- **CEO Agent** frames the objective and recommends the next specialist.
- **Research / Business / Finance** produce grounded analysis and decisions inputs.
- **Content / Marketing / Video / Sales** produce customer-facing artifacts.
- **Review Agent** validates quality, brand, and factual consistency before delivery.
- **Developer Agent** translates approved automation or integration needs into specs.

## Shared conventions for all future specifications

When these designs become `AgentSpecification` records, each agent must declare:

| Field | Team convention |
| --- | --- |
| `agentId` | Stable lowercase identifier from the table above |
| `version` | Semantic version starting at `1.0.0` |
| `status` | `experimental` until evaluation suite passes |
| `riskLevel` | `low` for generation; `medium` when proposing delivery/export |
| `taskTypes` | Namespaced strings, e.g. `research.market` |
| `capabilities` | Explicit `memory.read`, `knowledge.search`, `model.invoke`, `workflow.propose` entries |
| `handoffTargets` | Only declared downstream agents from this document |
| `limits` | Timeout, token/cost, result size, and tool-call ceilings |
| `policyRequirements` | Minimum actor/task grants documented in `02_AGENT_ROLES.md` |

## Relationship to the implemented Content Agent

The Content Agent is the first production-grade specialist. Future agents reuse its
patterns:

- exact Agent Specification lookup before model access;
- governed memory and knowledge context decorators;
- structured output with assumptions, warnings, evidence, and optional workflow
  proposals;
- no direct delivery or publishing.

Other agents must not weaken Content Agent contracts or bypass its boundaries.

## Phased introduction plan

| Phase | Agents | Prerequisite |
| --- | --- | --- |
| Now | `content` | Implemented |
| Next design-ready | `research`, `business`, `review` | Knowledge plan + voice profile |
| Then | `marketing`, `sales`, `video` | Campaign workflows + brand review |
| Later | `ceo`, `finance`, `developer` | Multi-step workflow runtime + approvals |

Agents should not enter production until:

- manifest and specification validate;
- permission denial tests exist;
- deterministic fake-model tests pass;
- model-backed evaluation thresholds are recorded;
- handoff examples are documented in `03_WORKFLOWS.md`.

## Document map

| File | Contents |
| --- | --- |
| `02_AGENT_ROLES.md` | Full role definitions for every agent |
| `03_WORKFLOWS.md` | Multi-agent workflow designs for Fabio |
| `04_KNOWLEDGE_PLAN.md` | Knowledge scopes and source plan |
| `05_VOICE_PROFILE.md` | Brand voice constraints for customer-facing agents |
| `06_BUSINESS_USE_CASES.md` | Operator scenarios and success criteria |
| `07_PROMPT_LIBRARY.md` | Instruction and prompt patterns per agent |
| `08_BACKUP_RESTORE_DESIGN.md` | Next engineering milestone design |

## Success criteria for this design pack

This agent team design is ready for implementation planning when:

1. Every agent has a complete role definition convertible to `AgentSpecification`.
2. Every workflow maps to explicit steps, agents, approvals, and outputs.
3. Knowledge scopes and voice rules are sufficient for grounded generation.
4. No design element requires Core Brain, repository, or policy contract changes.
5. External side effects remain proposals routed to future n8n workflows only.
