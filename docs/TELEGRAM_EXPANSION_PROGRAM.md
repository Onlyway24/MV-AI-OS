# Telegram expansion program

## Phase 1 — Controlled Telegram Operator Console

Dedicated Bot API transport, exact private user/chat authorization, bounded polling,
data minimization, replay protection, local Runtime reuse, and operator-only commands.
Phase 1A durable sessions are complete: a single exact user/chat binding has a
versioned, restart-safe, expiring session with explicit cancellation and no Mission or
Workflow mutation. Phase 1B.1A-1 is complete: the storage- and transport-neutral,
privacy-safe Telegram Mission Draft contract and strict structural validator exist.
Phase 1B.1A-2 is complete: a deterministic, in-memory Draft state engine validates
bounded operations, identity/version binding, and legal transitions without reading a
clock, writing storage, or activating Telegram. Checkpoints A, B, and C are complete:
conversion context is exact and review-bound, SQLite draft operations are durable and
replay-safe, and one authorized session is atomically coordinated with one exact
draft and one-use callbacks. Checkpoint D delivers Phase 1B.2: `/mission` is the
guided private Telegram Mission Planning Console. The Professional Experience Pack
adds the Mission home, explicit immutable versioned quick-start templates, contextual
help, progress cues, a durable reopened result summary, local Markdown/JSON report
export, sanitized doctor output and an offline release check. Templates are explicit
accelerators, never hidden defaults. The console requires separate data and planning
confirmations and invokes only the existing deterministic Mission validation, planner,
and Quality Gate boundaries. It creates no Workflow and performs no external action.
Live Telegram acceptance remains pending local secret configuration. Phase 1C Core V1
Workflow Flow has not started.

## Phase 2 — Developer Control Plane

Not started. It requires a separate approved milestone and cannot make Telegram an
unrestricted terminal, credential viewer, file browser, or account-management surface.

## Later phases

Continuous Improvement, H24 operation, serious Workflow execution, n8n/Tool Runtime,
and a Web Console remain separate future decisions. Telegram input never becomes
observation or improvement data without Fabio's explicit, reviewed confirmation.
