# Next Task

## Milestone name

Core V1 Adversarial Release Review

## Goal

Perform one focused final release review of the complete Core V1 path, fix every P0/P1
and material P2 issue, and leave auditable findings for closeout.

## Why it matters

The local product, restart scenario, and Operator Guide now exist. Release closeout
requires an independent evidence-based challenge of authorization, durability,
redaction, command usability, reporting accuracy, and documentation truth.

## Required scope

- Review Mission through report and restart recovery across the real boundaries.
- Challenge approval and Guardian bypass, stale versions/candidates, duplicate
  transitions/invocations/outcomes, retry ceilings, stopped Workflow invocation,
  timeout correctness, partial persistence, command injection, output bounds,
  redaction, next-action accuracy, and documentation claims.
- Classify P0–P3 findings and fix all P0/P1 plus material P2 findings.
- Avoid unrelated cleanup or speculative redesign.

## Forbidden scope

- A whole-repository speculative audit or new architecture foundation.
- Models, providers, tools, network/browser behavior, Web Console, deployment, or
  external actions.

## Acceptance criteria

- No unresolved P0/P1 finding remains.
- Material P2 correctness, privacy, durability, usability, and maintainability issues
  are fixed.
- Findings and fixes are source-backed and the focused/full verification gates pass.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

Core V1 has one truthful release-review record and is ready for final release closeout.
