# Agent Improvement Loop

MV-AI-OS improves from measured, attributable outcomes. It does not let an
agent change its own instructions, model, permissions, sources, budget, or
publishing authority.

## What can be measured now

The active Metodo Veloce line has durable, linked evidence for four stages:

1. **Research / Knowledge curation** — registered sources, immutable Evidence
   Records, currentness, corroboration, and Evidence Pack fingerprint.
2. **Content preparation** — an immutable Evidence Pack attestation is stored
   with the Metodo Veloce production record.
3. **Quality and risk control** — deterministic Quality Guardian and claim-risk
   status are retained in the package before Fabio can review it.
4. **Fabio review and feedback** — review outcome is durable; later feedback
   imports are accepted only after a confirmed platform receipt and remain
   append-only.

There is one currently executable workflow agent: the deterministic
`content-director@1.0.0`. The other Agent Company roles are explicitly
non-executing specifications until a separately approved executor and bounded
evaluation set exist. They must be reported as **not observable**, never given
invented quality scores.

## Evaluation rule

For every executable `agentId@version`, evaluate only a sufficiently large,
durable sample of:

- completed, failed, timed-out and explicitly reviewed invocations;
- accepted, revision-needed, rejected, blocked, and invalid outcomes;
- evidence freshness and corroboration failures for research-led content;
- Quality Guardian and claim-risk blockers;
- Fabio approval / rejection reasons;
- confirmed, imported platform feedback only — never declared or estimated
  metrics.

Below the declared minimum sample, the outcome is `INSUFFICIENT_DATA`; no
ranking, regression claim, causal claim, or automatic change is allowed.

## Controlled improvement cycle

```text
measured evidence
  -> diagnose a specific failure mode
  -> versioned improvement proposal
  -> Fabio approval
  -> isolated evaluation sample
  -> compare with the previous version
  -> promote, revise, or roll back
```

An improvement proposal may alter instructions, a deterministic rule, an
evaluation set, or a guarded adapter. It must retain provenance and test
evidence. A proposal may never broaden permissions, activate an external tool,
or publish content by itself.
