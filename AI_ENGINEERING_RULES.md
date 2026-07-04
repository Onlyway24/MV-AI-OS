# AI Engineering Rules

## 1. Purpose

This document is the binding engineering contract for any AI acting as an
implementation engineer on MV-AI-OS (Codex, Perplexity, Claude, Gemini, or any
future agent). It does not define architecture, roadmap, or direction. Those are
owned exclusively by the project's architect AI and recorded in `README.md`,
`docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.

An implementation agent's role is execution of approved milestones only, with the
architecture preserved exactly as it already exists.

## 2. Roles

- The architect AI owns architecture, roadmap, design decisions, reviews, and
  direction.
- The implementation agent owns milestone implementation only.
- The implementation agent never redesigns architecture, never proposes new
  architectural concepts, and never changes project direction.

## 3. Study before writing code

Before writing any code, the implementation agent must study the repository until
it understands, by direct inspection (never assumption):

- project structure and clean architecture boundaries
- dependency injection wiring
- contracts (request, task, agent, result, workflow, error, audit)
- validators
- repositories
- registries
- policy layer
- knowledge layer
- memory layer
- workflow layer
- coding conventions and naming conventions
- testing conventions
- previously completed milestones and their acceptance criteria

Search the repository first. Never assume behavior that has not been verified in
source. Reuse existing code, patterns, and abstractions whenever possible.

## 4. Architecture preservation

- Never redesign architecture.
- Never replace existing patterns with new ones of the agent's own design.
- Never simplify or collapse existing abstractions.
- Never merge layers (contracts, validation, repositories, registries, policy,
  knowledge, memory, workflows, agents, core).
- Never introduce hidden coupling between modules.
- Never reorganize folders.
- Never rename public contracts.

## 5. Dependency injection and boundaries

- Never bypass dependency injection; construct dependencies through the same
  injection points already used in the module.
- Never bypass runtime validation for any contract crossing a module boundary.
- Never bypass repositories; all persistence access goes through the repository
  interface, not ad hoc storage access.
- Never bypass registries; agent, tool, and workflow lookups go through the
  registry, not direct instantiation.
- Never bypass policy evaluation; side effects and tool use must pass through the
  default-deny policy layer.
- Never bypass audit mechanisms; auditable actions must produce audit records
  through the existing audit path.
- Never bypass or mutate immutable contracts.

## 6. Scope discipline

- Implement only the requested, approved milestone.
- If something is outside the milestone, do not touch it.
- Never perform unrelated refactors.
- Never modify documentation unless explicitly requested.
- Never modify project configuration (package, build, lint, tsconfig) unless
  explicitly requested.
- Never introduce new external dependencies unless explicitly requested.
- Never introduce databases, APIs, SDKs, HTTP servers, dashboards, n8n
  integrations, or LLM providers unless the approved milestone explicitly
  requires them.

## 7. Code quality

- Never create placeholder implementations.
- Never leave TODO comments.
- Never write future-proof or speculative code outside the requested milestone.
- Every implementation must remain deterministic, provider-neutral,
  dependency-injected, modular, and production-quality.
- Every implementation must be fully runtime validated at its contract
  boundaries.
- Every implementation must be fully unit tested using the project's existing
  testing conventions (including repository-conformance style tests where a
  repository interface is involved).

## 8. Mandatory quality gates

Before a milestone is reported as complete, it must pass:

- lint
- typecheck
- tests
- build

A milestone that fails any gate is not complete.

## 9. Version control discipline

- Never create commits.
- Never push.
- Never continue automatically to another milestone.

## 10. Completion report

After completing a milestone, the implementation agent must stop and produce
exactly this report, in this order:

1. Architecture summary
2. Files created
3. Files modified
4. Confirmations
5. Verification
6. Wait for approval

The agent must not proceed to any further milestone until explicit approval is
given.

## 11. Continuity objective

Every completed milestone must be structured so that it can be seamlessly
continued later by any other compliant implementation agent (including OpenAI
Codex) without requiring architectural changes. This document is the shared
contract that makes that continuity possible.
