# MV AI OS Agent Lab — Business Use Cases

## Purpose

Operator scenarios for Fabio using the future MV AI OS agent team locally. Each use
case links agents, workflows, knowledge scopes, success criteria, and current platform
readiness.

## Readiness legend

| Status | Meaning |
| --- | --- |
| **Now** | Supported by implemented Content Agent + local runtime |
| **Designed** | Fully specified; awaits new agents/workflow runtime |
| **Blocked** | Requires production model, n8n, or multi-agent runtime |

---

## Use case 1 — Daily content production

**Scenario:** Fabio needs one TikTok and one Instagram post per day for a reselling
offer.

| Element | Detail |
| --- | --- |
| Workflow | `social-shortform-content` |
| Agents | CEO → Marketing → Video → Content → Review |
| Knowledge | `offers`, `products`, `hooks-library`, `voice-profile` |
| Memory | `user` channel preferences; `semantic` past hooks |
| Success | 2 review-passed assets/day with publish proposals optional |
| Readiness | **Designed** (Content partial **Now**) |

**Success criteria**

- Both assets pass Review Agent voice check
- Scripts and captions share same offer reference
- Publish requires explicit approval

---

## Use case 2 — Weekly reselling product hunt

**Scenario:** Every Monday, identify 3 products worth testing in home/gadget niches.

| Element | Detail |
| --- | --- |
| Workflow | `resell-product-discovery` |
| Agents | CEO → Research → Finance → Business → Review |
| Knowledge | `market`, `products`, `competitors`, `costs` |
| Memory | `semantic` shortlisted niches |
| Success | Ranked list with margin scenarios and test recommendation |
| Readiness | **Designed** |

**Success criteria**

- Research gaps explicit for each product
- Finance labels all assumptions
- No inventory purchase proposed without A2 approval path

---

## Use case 3 — Launch a new digital offer

**Scenario:** Fabio creates a Notion template pack offer for Etsy sellers.

| Element | Detail |
| --- | --- |
| Workflow | `business-offer-builder` |
| Agents | CEO → Research → Business → Finance → Content → Review |
| Knowledge | `market`, `offers`, `brand`, `pricing` |
| Memory | `semantic` offer record after A4 approval |
| Success | Offer one-pager + landing copy + pricing scenarios |
| Readiness | **Designed** |

**Success criteria**

- Offer positioning backed by research or labeled assumption
- Copy passes claims policy
- Pricing marked non-binding until Fabio confirms

---

## Use case 4 — Market entry decision

**Scenario:** Evaluate entering the pet accessories reselling niche in Italy.

| Element | Detail |
| --- | --- |
| Workflow | `market-research` + `business-idea-analysis` |
| Agents | CEO → Research → Finance → Business → Review → CEO |
| Knowledge | `market`, `competitors`, `products`, `costs` |
| Success | pursue / test / reject recommendation with evidence |
| Readiness | **Designed** |

**Success criteria**

- Decision brief cites research and finance artifact IDs
- Unknowns listed even if recommendation is positive

---

## Use case 5 — Knowledge-to-ebook product

**Scenario:** Compile Fabio's reselling notes into a sellable ebook.

| Element | Detail |
| --- | --- |
| Workflow | `ebook-from-knowledge` |
| Agents | CEO → Research → Content (loop) → Review |
| Knowledge | `sources`, `products`, `general`, `brand` |
| Success | Structured ebook draft with citations |
| Readiness | **Designed** (single-chapter content **Now**) |

**Success criteria**

- Every chapter cites knowledge IDs
- Review confirms cross-chapter consistency
- Export via n8n only after approval

---

## Use case 6 — Campaign sprint

**Scenario:** 14-day launch for a new coaching offer on Instagram and email.

| Element | Detail |
| --- | --- |
| Workflow | `social-campaign-generator` |
| Agents | CEO → Business → Marketing → Content + Video → Review |
| Knowledge | `campaigns`, `channels`, `offers`, `brand` |
| Success | Calendar + asset pack + review pass |
| Readiness | **Designed** |

**Success criteria**

- Every asset maps to marketing brief ID
- Campaign-level review before batch scheduling approval

---

## Use case 7 — Client services proposal

**Scenario:** Fabio pitches social media management to a local restaurant.

| Element | Detail |
| --- | --- |
| Workflow | `client-proposal` |
| Agents | CEO → Business → Sales → Finance → Content → Review |
| Knowledge | `clients`, `case-studies`, `pricing`, `offers` |
| Success | Client-ready proposal package |
| Readiness | **Designed** |

**Success criteria**

- A3 approval before send workflow
- No fabricated client results
- Scope and investment aligned across agents

---

## Use case 8 — Automation design session

**Scenario:** Fabio wants approved captions auto-scheduled to Instagram via n8n.

| Element | Detail |
| --- | --- |
| Workflow | Partial — follows `social-shortform-content` + Developer |
| Agents | Developer (spec) after Review pass |
| Knowledge | `integrations`, `n8n-catalog`, `architecture` |
| Success | EngineeringSpec for allowlisted n8n workflow |
| Readiness | **Blocked** (n8n execution not implemented) |

**Success criteria**

- Spec respects n8n adapter boundary
- Idempotency and callback verification documented
- No credentials in spec output

---

## Use case 9 — End-of-week executive review

**Scenario:** Fabio reviews what the system produced and sets next week's priorities.

| Element | Detail |
| --- | --- |
| Agents | CEO (+ optional Research for metrics summary) |
| Memory | `conversation`, `semantic`, operational read if granted |
| Knowledge | `operations` |
| Success | CeoBrief with prioritized next steps |
| Readiness | **Designed** |

**Success criteria**

- References completed task correlation IDs
- Does not rewrite specialist artifacts unnecessarily

---

## Use case 10 — Single request content (current baseline)

**Scenario:** Fabio submits one `business.content` request via local CLI.

| Element | Detail |
| --- | --- |
| Agent | Content (deterministic or model-backed deterministic provider) |
| Path | CLI → LocalRuntime → CoreBrain → Content → TaskResponse |
| Knowledge/Memory | Optional governed enrichment |
| Success | Valid `ContentOutput`, audit trail, durable replay |
| Readiness | **Now** |

**Success criteria**

- Matches implemented vertical slice in project-state
- Idempotent replay on duplicate request ID

---

## Cross-use-case dependencies

```text
Voice profile + brand knowledge
  -> enables safe Content/Marketing/Video output

Products + offers knowledge
  -> enables reselling + offer workflows

Review Agent
  -> gates all external-facing publish/send paths

Workflow runtime + n8n (future)
  -> enables automation use cases

Production model provider (Phase 5)
  -> enables high-quality generation at scale
```

## Business metrics Fabio may track later

| Metric | Source |
| --- | --- |
| Assets approved vs revised | Review Agent verdicts |
| Time per workflow | Task audit timestamps |
| Knowledge citation rate | Content/Research outputs |
| Publish approval turnaround | Approval records *(future)* |
| Campaign asset count | Marketing workflow outputs |

## Non-goals for this phase

- Fully autonomous multi-agent operation without Fabio oversight
- Unapproved publishing or client sending
- Replacing professional legal, tax, or accounting advice
- Storing client PII without redaction policy
