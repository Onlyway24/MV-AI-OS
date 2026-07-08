# MV AI OS Agent Lab — Workflow Designs

## Purpose

Multi-agent workflow designs Fabio can run later through MV AI OS. Each workflow is
structured for conversion into a `WorkflowSpecification` graph once workflow execution
runtime exists (Phase 6 in `docs/project-state/02_MASTER_ROADMAP.md`).

Until then, these flows can be executed manually as sequential Core Brain tasks with
human-orchestrated handoffs.

## Workflow conventions

| Element | Convention |
| --- | --- |
| Workflow ID | kebab-case, e.g. `social-shortform-content` |
| Steps | Map to `WorkflowStep` with exact `agentId` + version |
| Transitions | Conditional on `AgentResult.status` and review verdict |
| Side effects | Only via approved n8n workflows after Review Agent pass |
| Failure policy | Content generation success independent from delivery failure |

Common approval points:

- **A1** — Publish/post/send to external platform
- **A2** — Spend money (ads, tools, inventory)
- **A3** — Client-facing proposal delivery
- **A4** — Store durable user preference or pricing decision

---

## 1. Create TikTok/Instagram Content

**Workflow ID:** `social-shortform-content`  
**Goal:** Produce review-approved short-form scripts and captions ready for optional
scheduled publishing.

### Agents involved

`ceo` → `marketing` → `video` → `content` → `review` → *(optional)* `developer`

### Step-by-step flow

```text
1. CEO Agent
   - Normalize objective, channel, offer/campaign context
   - Output: CeoBrief with handoff to Marketing

2. Marketing Agent
   - Create campaign angle + asset brief for one short-form asset
   - Output: MarketingCampaign.assetBriefs[0]

3. Video Agent
   - Produce hook options, script, shot list, on-screen text
   - Output: VideoPlan

4. Content Agent
   - Refine captions, description, hashtags, CTA variants
   - Output: ContentOutput (contentType = social-post)

5. Review Agent
   - Brand, claims, and voice profile check
   - Output: ReviewVerdict

6. [Conditional] Developer Agent
   - Only if verdict = pass AND publish requested
   - Produce n8n publish workflow spec reference
   - Output: EngineeringSpec (no execution)

7. [Approval A1] Human approval for publish workflow proposal

8. [Future n8n] social-schedule / video-upload workflow
```

### Required inputs

| Input | Required |
| --- | --- |
| Platform (`tiktok` or `instagram-reels`) | yes |
| Objective (educate, sell, entertain) | yes |
| Offer or product reference | no |
| Duration target | no |
| Publish intent (draft vs schedule) | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| `VideoPlan` | Video Agent |
| `ContentOutput` captions/hashtags | Content Agent |
| `ReviewVerdict` | Review Agent |
| Optional publish workflow proposal | Developer + n8n |

### Approval points

- **A1** before any publish/schedule workflow
- **A4** if storing new brand preference from Fabio feedback

### Risks

- Ungrounded product claims in hooks
- Voice drift across Video and Content steps
- Premature publish without review pass
- Platform policy violations (health/income claims)

### Quality checks

- Review Agent `verdict = pass` required before delivery proposal
- All `sourceRefs` and `memoryRefs` populated when claims are factual
- Content and Video outputs share consistent CTA and offer reference
- Assumptions explicit when product facts missing

---

## 2. Find Products to Resell

**Workflow ID:** `resell-product-discovery`  
**Goal:** Identify and rank reselling opportunities with margin hypotheses and
sourcing notes.

### Agents involved

`ceo` → `research` → `finance` → `business` → `review`

### Step-by-step flow

```text
1. CEO Agent
   - Frame niche, budget, channel, and success criteria
   - Handoff to Research

2. Research Agent
   - Market demand, competitor pricing, supplier options
   - Output: ResearchReport with opportunities

3. Finance Agent
   - Margin scenarios for top 3 opportunities
   - Output: FinanceAnalysis

4. Business Agent
   - Select recommended test offer and validation plan
   - Output: BusinessOffer (test-offer variant)

5. Review Agent
   - Check for unsupported claims and missing disclaimers
   - Output: ReviewVerdict

6. [Optional handoff] Marketing / Content for launch assets (separate workflow)
```

### Required inputs

| Input | Required |
| --- | --- |
| Niche or product category | yes |
| Target market/geography | no |
| Budget band | no |
| Sourcing constraints (local vs import) | no |
| Existing supplier links | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| Ranked opportunity list | Research Agent |
| Margin scenarios | Finance Agent |
| Test offer recommendation | Business Agent |
| Quality gate | Review Agent |

### Approval points

- **A2** before ordering inventory or paid supplier tools
- **A4** before persisting chosen niche as user preference

### Risks

- Stale market data or incomplete supplier validation
- Margin analysis based on unverified shipping/fees
- Overconfidence in demand signals

### Quality checks

- Research gaps explicitly listed
- Finance assumptions labeled
- Business offer marked as hypothesis until verified
- No fabricated supplier performance claims

---

## 3. Build a Business Offer

**Workflow ID:** `business-offer-builder`  
**Goal:** Create a complete offer package ready for marketing and sales workflows.

### Agents involved

`ceo` → `research` → `business` → `finance` → `content` → `review`

### Step-by-step flow

```text
1. CEO Agent — clarify audience, problem, delivery format
2. Research Agent — validate problem, competitors, proof points
3. Business Agent — full offer architecture and funnel
4. Finance Agent — pricing scenarios and margin guardrails
5. Content Agent — offer one-pager, landing copy outline, email teaser
6. Review Agent — coherence across offer, price, and copy
```

### Required inputs

| Input | Required |
| --- | --- |
| Target audience | yes |
| Problem statement | yes |
| Delivery format (digital/physical/service) | yes |
| Desired price band | no |
| Proof assets (testimonials, data) | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| `BusinessOffer` | Business Agent |
| `FinanceAnalysis` | Finance Agent |
| `ContentOutput` (offer copy) | Content Agent |
| `ReviewVerdict` | Review Agent |

### Approval points

- **A4** before persisting offer to semantic memory
- **A3/A1** if offer copy will be published or sent to clients

### Risks

- Price/copy mismatch across agents
- Unsupported transformation claims
- Offer complexity beyond Fabio's fulfillment capacity

### Quality checks

- Finance and Business outputs use same offer identifier
- Content references Business offer fields verbatim where factual
- Review checks claim policy and voice profile

---

## 4. Research a Market

**Workflow ID:** `market-research`  
**Goal:** Deliver an evidence-backed market brief Fabio can reuse in later workflows.

### Agents involved

`ceo` → `research` → `business` → `review`

### Step-by-step flow

```text
1. CEO Agent — bound the research question and decision use
2. Research Agent — full ResearchReport
3. Business Agent — translate findings into implications and opportunities
4. Review Agent — verify evidence integrity and flag weak sources
```

### Required inputs

| Input | Required |
| --- | --- |
| Research question | yes |
| Geography | no |
| Customer segment | no |
| Known sources | no |
| Decision deadline | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| `ResearchReport` | Research Agent |
| Opportunity implications | Business Agent |
| `ReviewVerdict` | Review Agent |

### Approval points

- None for research itself
- **A4** if storing conclusions to semantic memory

### Risks

- Conflicting sources smoothed over
- Outdated competitor data
- Over-broad recommendations from thin evidence

### Quality checks

- `gaps` and `warnings` populated when evidence weak
- Business implications cite Research finding IDs
- Review blocks if unsupported market size claims appear

---

## 5. Create an Ebook from Knowledge Base

**Workflow ID:** `ebook-from-knowledge`  
**Goal:** Produce a structured ebook draft grounded in Fabio's registered knowledge.

### Agents involved

`ceo` → `research` → `content` (multi-chapter loop) → `review` → *(optional)* `developer`

### Step-by-step flow

```text
1. CEO Agent
   - Define ebook topic, audience, length, chapter outline

2. Research Agent
   - Retrieve and synthesize knowledge scope `sources` + `products`
   - Output: ResearchReport used as chapter source map

3. Content Agent (loop per chapter)
   - Input: chapter objective + allowed sourceRefs
   - Output: ContentOutput (contentType = ebook-chapter)
   - Core Brain mediates each chapter invocation

4. Content Agent (final pass)
   - Assemble intro, conclusion, and metadata chapter
   - Output: ContentOutput (contentType = ebook-draft)

5. Review Agent
   - Cross-chapter consistency, voice, citations

6. [Optional] Developer Agent
   - Export workflow spec for PDF/ePub generation via n8n

7. [Approval A1/A3] Export/delivery approval
```

### Required inputs

| Input | Required |
| --- | --- |
| Ebook topic | yes |
| Target audience | yes |
| Knowledge scopes to use | yes |
| Chapter count or word target | no |
| Export format preference | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| Chapter drafts | Content Agent |
| Complete ebook draft | Content Agent |
| Source map | Research Agent |
| `ReviewVerdict` | Review Agent |
| Export workflow proposal | Developer *(optional)* |

### Approval points

- **A1** before export/publish workflow
- **A4** before persisting ebook metadata to semantic memory

### Risks

- Knowledge scope leakage (wrong workspace/actor)
- Hallucinated citations not in knowledge base
- Inconsistent voice across chapters

### Quality checks

- Every chapter lists `sourceRefs` for factual claims
- Review checks cross-chapter terminology consistency
- No chapter proceeds if Research flags critical gaps

---

## 6. Generate a Social Media Campaign

**Workflow ID:** `social-campaign-generator`  
**Goal:** Produce a multi-asset campaign plan with ready-to-review content briefs and
initial copy.

### Agents involved

`ceo` → `business` → `marketing` → `content` + `video` (parallel) → `review`

### Step-by-step flow

```text
1. CEO Agent — campaign objective and constraints
2. Business Agent — confirm offer positioning (or create mini-offer)
3. Marketing Agent — full MarketingCampaign with calendar and assetBriefs
4. Parallel invocations (Core Brain scheduled):
   a. Content Agent — posts, emails, carousel copy per brief
   b. Video Agent — short-form scripts per brief
5. Review Agent — campaign-level coherence review
6. [Approval A1] for schedule/publish workflow batch
```

### Required inputs

| Input | Required |
| --- | --- |
| Campaign goal | yes |
| Primary channels | yes |
| Duration (days) | yes |
| Offer reference | no |
| Budget band | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| `MarketingCampaign` | Marketing Agent |
| Multiple `ContentOutput` | Content Agent |
| Multiple `VideoPlan` | Video Agent |
| `ReviewVerdict` | Review Agent |

### Approval points

- **A1** before batch scheduling
- **A2** if campaign includes paid ads workflow

### Risks

- Asset volume exceeds review capacity
- Inconsistent messaging between video and static copy
- Calendar proposes unrealistic production load

### Quality checks

- Every asset traces to a Marketing `assetBrief` ID
- Review uses campaign-level checklist
- Workflow refuses publish if any asset `revise` or `block`

---

## 7. Analyze a Business Idea

**Workflow ID:** `business-idea-analysis`  
**Goal:** Decide whether a business idea is worth testing with structured analysis.

### Agents involved

`ceo` → `research` → `finance` → `business` → `review` → `ceo`

### Step-by-step flow

```text
1. CEO Agent — capture idea, constraints, decision criteria
2. Research Agent — market/competitor/product scan
3. Finance Agent — scenario economics and break-even bands
4. Business Agent — verdict: pursue, test, or reject with test plan
5. Review Agent — sanity-check claims and assumptions
6. CEO Agent — final decision brief for Fabio
```

### Required inputs

| Input | Required |
| --- | --- |
| Business idea description | yes |
| Target customer | no |
| Available time/budget | no |
| Risk tolerance | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| `ResearchReport` | Research Agent |
| `FinanceAnalysis` | Finance Agent |
| Recommendation + test plan | Business Agent |
| Final `CeoBrief` | CEO Agent |

### Approval points

- **A2** before spending on validation experiments
- **A4** before storing "approved strategy" memory

### Risks

- Confirmation bias in synthesis
- Finance model with hidden assumptions
- False precision on TAM/SAM numbers

### Quality checks

- Explicit `reject/test/pursue` recommendation with reasons
- Unknowns listed even when recommendation is positive
- CEO final brief cites prior step artifact IDs

---

## 8. Prepare a Client Proposal

**Workflow ID:** `client-proposal`  
**Goal:** Create a client-ready proposal package with review and optional export.

### Agents involved

`ceo` → `business` → `sales` → `finance` → `content` → `review` → *(optional)* `developer`

### Step-by-step flow

```text
1. CEO Agent — clarify client context, deal goal, constraints
2. Business Agent — align offer components to client problem
3. Sales Agent — draft SalesProposal + outreach variants
4. Finance Agent — validate investment section assumptions
5. Content Agent — polish executive summary and cover letter
6. Review Agent — client-safe language and claims check
7. [Approval A3] Fabio approves client send
8. [Optional Developer] proposal-export workflow spec
9. [Future n8n] export to PDF / CRM
```

### Required inputs

| Input | Required |
| --- | --- |
| Client name and context | yes |
| Service/offer being proposed | yes |
| Scope boundaries | yes |
| Price range or budget | no |
| Client materials (notes, RFP) | no |

### Expected outputs

| Output | Producer |
| --- | --- |
| `SalesProposal` | Sales Agent |
| `FinanceAnalysis` (pricing validation) | Finance Agent |
| Polished proposal copy | Content Agent |
| `ReviewVerdict` | Review Agent |

### Approval points

- **A3** mandatory before any client send workflow
- **A4** if persisting client-specific preferences

### Risks

- Overpromising deliverables or timelines
- Client confidential data in wrong memory scope
- Unverified ROI claims

### Quality checks

- Review blocks unsupported guarantees
- Finance verifies all numeric investment fields
- Sales proposal scope matches Business offer components
- Send workflow requires recorded approval ID

---

## Workflow index

| # | Workflow ID | Primary outcome |
| --- | --- | --- |
| 1 | `social-shortform-content` | TikTok/Reels script + captions |
| 2 | `resell-product-discovery` | Ranked resell opportunities |
| 3 | `business-offer-builder` | Complete offer package |
| 4 | `market-research` | Market brief |
| 5 | `ebook-from-knowledge` | Ebook draft from knowledge base |
| 6 | `social-campaign-generator` | Multi-asset campaign |
| 7 | `business-idea-analysis` | Pursue/test/reject decision |
| 8 | `client-proposal` | Client-ready proposal |

## Future WorkflowSpecification mapping notes

When converting to graphs:

- Each step needs exact `agentId`, manifest/spec version, and output schema reference.
- Parallel Content + Video steps require Core Brain fan-out/fan-in semantics.
- Review failure transitions return to the producing agent with bounded revision count.
- Delivery transitions require `approval.state = approved` condition nodes.
- Cycles allowed only for revise loops with explicit max attempts in `failurePolicy`.
