# Next Task

## Milestone name

Workflow Operator — controlled Mission-to-Workflow foundation

## Goal

Complete the first professional vertical slice from an approved Mission Plan to a
durable Workflow, then retain the private-phone Telegram acceptance as the launch gate
before any continuous operation.

## Delivered in this slice

- `/workflows` explains the bounded operator flow.
- `/workflow <riferimento-missione>` requires an `APPROVAL_READY` Mission and a
  separate one-use confirmation before it creates one durable Workflow.
- `/report <riferimento-missione>` reads the durable status, next checkpoint, risks,
  and the no-unauthorized-external-action statement.
- The Workflow starts at Fabio approval plus Quality and Operator-Safety/Risk Guardian
  checkpoints; it does not invoke an agent or any external system.

## Required next scope

- Complete the private-phone continuity test: `/mission`, `/mission quick`, then a
  repeated `/mission quick` or `/status` while the same operator remains running.
- Design the next explicit controls for Guardian evidence and Fabio approval before
  exposing any agent invocation in Telegram.
- Keep all Telegram data minimization, replay protection, durable state, private
  allowlisting, and safe diagnostics intact.

## Forbidden scope

- No H24 scheduler, worker, auto-retry loop, or automatic restart yet.
- No publication, email, CRM change, customer contact, spending, deployment, merge,
  browsing, provider/model call, tool execution, or external action.
- No Telegram personal-account observation or Developer Control Plane.
