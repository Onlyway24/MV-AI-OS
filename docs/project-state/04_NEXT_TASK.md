# Next Task

## Milestone name

Core V1 Operator and Recovery Guide

## Goal

Create one concise durable guide that lets Fabio operate, stop, restart, recover, and
verify Core V1 safely through the existing CLI.

## Why it matters

The integrated local product path is now proven. Fabio needs one truthful manual with
copyable bounded examples and recovery guidance before release review.

## Required scope

- Explain what Core V1 can and cannot do and how to configure and start it.
- Document Mission, Workflow, control, deterministic Agent, outcome, lifecycle,
  timeout, report, audit, shutdown, restart, and recovery commands.
- Include safe bounded fixtures and structured-error troubleshooting.
- Explain how to verify Git state, tests, build, and persisted recovery.
- Keep all examples preparation-only and free of credentials or private data.

## Forbidden scope

- Multiple redundant manuals or a marketing-only document.
- Real credentials, private data, unsupported model/tool instructions, claims of
  autonomy, cloud deployment, or external action capability.

## Acceptance criteria

- Fabio can follow the guide without editing TypeScript or SQLite.
- Commands match the actual allowlisted operation contracts and current CLI syntax.
- Recovery instructions use a genuinely persistent SQLite path and safe shutdown.
- Unsupported capabilities are stated explicitly.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

One accurate Operator and Recovery Guide is tracked and validated against the local
product boundary.
