# Telegram expansion program

## Phase 1 — Controlled Telegram Operator Console

Dedicated Bot API transport, exact private user/chat authorization, bounded polling,
data minimization, replay protection, local Runtime reuse, and operator-only commands.
Phase 1A durable sessions are complete: a single exact user/chat binding has a
versioned, restart-safe, expiring session with explicit cancellation and no Mission or
Workflow mutation. Phase 1B.1A-1 is complete: the storage- and transport-neutral,
privacy-safe Telegram Mission Draft contract and strict structural validator exist.
The Mission Draft state engine, FounderMissionBrief conversion/readiness, SQLite
persistence, Telegram UX, and `/mission` activation have not started. No Mission,
Workflow, or external action is executed by this contract. Phase 1C Core V1 Workflow
Flow has not started.

## Phase 2 — Developer Control Plane

Not started. It requires a separate approved milestone and cannot make Telegram an
unrestricted terminal, credential viewer, file browser, or account-management surface.

## Later phases

Continuous Improvement, H24 operation, serious Workflow execution, n8n/Tool Runtime,
and a Web Console remain separate future decisions. Telegram input never becomes
observation or improvement data without Fabio's explicit, reviewed confirmation.
