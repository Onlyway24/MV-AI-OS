# MV AI OS Agent Lab — Knowledge Plan

## Purpose

Define the knowledge base Fabio's agent team needs for grounded research, content,
offers, campaigns, and proposals. This plan maps directly to Knowledge Service scopes
used in `AgentCapability.scopes` and knowledge record registration.

Knowledge records are **source material**, not retained system context. Memory holds
approved conclusions; knowledge holds citable sources.

## Design principles

1. Every record has provenance: source type, origin, freshness, workspace, actor visibility.
2. Scopes are explicit; agents receive only permitted scopes per invocation.
3. Retrieved text is untrusted; instructions embedded in sources cannot override policy.
4. No secrets, credentials, or raw PII in knowledge records.
5. Records remain JSON-compatible for SQLite today and vector adapters later.

## Knowledge scope catalog

| Scope ID | Description | Primary consumers |
| --- | --- | --- |
| `general` | Cross-team reference material | All agents |
| `brand` | Brand story, values, visual notes | Content, Marketing, Video, Review |
| `voice-profile` | Voice rules (see `05_VOICE_PROFILE.md`) | Content, Marketing, Video, Review |
| `products` | Product catalog, features, specs | Research, Business, Content, Sales |
| `market` | Market notes, trends, TAM/SAM memos | Research, Business, Finance, CEO |
| `competitors` | Competitor profiles, pricing snapshots | Research, Business, Marketing |
| `offers` | Active and archived offers | Business, Marketing, Sales, Content |
| `campaigns` | Campaign history and results | Marketing, Content, Video |
| `channels` | Platform playbooks (TikTok, IG, email) | Marketing, Video, Content |
| `sources` | Registered URLs, docs, transcripts | Research, Content |
| `hooks-library` | Proven hook patterns and examples | Video, Marketing |
| `pricing` | Price lists, fee structures | Finance, Sales, Business |
| `costs` | COGS, shipping, tool costs | Finance, Business |
| `clients` | Sanitized client briefs and segments | Sales, CEO |
| `case-studies` | Approved outcome stories | Sales, Marketing |
| `operations` | SOPs, checklists, weekly priorities | CEO, Developer |
| `architecture` | MV AI OS docs and integration rules | Developer |
| `integrations` | n8n and tool integration catalog | Developer |
| `n8n-catalog` | Allowlisted workflow names and contracts | Developer |
| `tools-catalog` | Future tool definitions index | Developer |
| `claims-policy` | Allowed/prohibited claim types | Review, Content, Sales |
| `legal-lite` | Non-binding compliance reminders | Review, Sales |

## Initial seed categories for Fabio

### 1. Brand and voice

| Record type | Examples | Scope |
| --- | --- | --- |
| Brand foundation | Mission, audience, positioning | `brand` |
| Voice rules | Tone, banned phrases, CTA style | `voice-profile` |
| Visual notes | Colors, fonts, on-screen text style | `brand` |

### 2. Business operations

| Record type | Examples | Scope |
| --- | --- | --- |
| Weekly priorities | Current focus areas | `operations` |
| Channel strategy | TikTok-first vs IG-first notes | `channels` |
| Working SOPs | Research checklist, publish checklist | `operations` |

### 3. Products and offers

| Record type | Examples | Scope |
| --- | --- | --- |
| Product sheets | SKU, supplier, margin notes | `products` |
| Offer one-pagers | Promise, deliverables, price | `offers` |
| Funnel maps | Lead magnet → offer → upsell | `offers` |

### 4. Market intelligence

| Record type | Examples | Scope |
| --- | --- | --- |
| Niche briefs | Audience pains, trends | `market` |
| Competitor snapshots | Pricing, hooks, weaknesses | `competitors` |
| Supplier notes | MOQ, shipping times, quality | `products`, `sources` |

### 5. Creative libraries

| Record type | Examples | Scope |
| --- | --- | --- |
| Hook library | Opening patterns by platform | `hooks-library` |
| Campaign retros | What worked / failed | `campaigns` |
| Template snippets | Email, caption, script starters | `general`, `channels` |

### 6. Sales and finance

| Record type | Examples | Scope |
| --- | --- | --- |
| Proposal templates | Section structure, tone | `clients`, `case-studies` |
| Pricing sheets | Service tiers, minimums | `pricing` |
| Cost assumptions | Ad spend, tools, fulfillment | `costs` |

### 7. Governance

| Record type | Examples | Scope |
| --- | --- | --- |
| Claims policy | Income/health/result claim rules | `claims-policy` |
| Review checklist | Brand and compliance gates | `claims-policy`, `legal-lite` |

## Knowledge record requirements

Each registered record should include:

| Field | Requirement |
| --- | --- |
| `knowledgeId` | Stable opaque identifier |
| `workspaceId` | Fabio's local workspace |
| `visibility` | `workspace` or restricted actor scope |
| `scopes` | One or more scope IDs from catalog |
| `source` | Type: `manual`, `import`, `url`, `transcript`, `sheet` |
| `title` | Human-readable label |
| `content` | Searchable text or structured JSON body |
| `tags` | e.g. `tiktok`, `reselling`, `q2-2026` |
| `freshness` | `snapshotDate` or expiry where relevant |
| `permissionTags` | Optional sensitivity markers |

## Registration workflow (operator)

Until dashboard exists, Fabio registers knowledge through a future local import path
or manual repository seeding in development:

1. Prepare sanitized source document (no secrets).
2. Assign scopes and tags.
3. Register source provenance.
4. Verify retrieval with Research or Content agent in deterministic test mode.
5. Store only citable facts; push decisions to memory after approval.

## Agent-to-scope access matrix

| Agent | Required scopes |
| --- | --- |
| `ceo` | `operations`, `strategy`*, `brand` |
| `research` | `market`, `products`, `competitors`, `sources` |
| `business` | `offers`, `brand`, `market`, `products` |
| `content` | `general`, `brand`, `products`, `campaigns` |
| `marketing` | `brand`, `campaigns`, `channels`, `offers`, `products` |
| `sales` | `offers`, `brand`, `case-studies`, `pricing`, `clients` |
| `video` | `brand`, `campaigns`, `products`, `hooks-library` |
| `review` | `brand`, `claims-policy`, `voice-profile`, `legal-lite` |
| `developer` | `architecture`, `integrations`, `n8n-catalog`, `tools-catalog` |
| `finance` | `pricing`, `costs`, `offers`, `operations` |

*Strategy notes live under `operations` until a dedicated scope is added through
contract review.

## Freshness and expiry rules

| Scope type | Default freshness policy |
| --- | --- |
| `market`, `competitors` | Refresh every 30–90 days; warn when stale |
| `pricing`, `costs` | Expire on date change; high sensitivity |
| `brand`, `voice-profile` | Long-lived; version when updated |
| `hooks-library`, `campaigns` | Annotate with performance period |
| `architecture`, `claims-policy` | Versioned; never silently overwrite |

## Search behavior expectations

- Knowledge Service returns deterministic ordered results (current implementation).
- Agents must cite `sourceRefs` for factual claims tied to knowledge.
- If required scope returns insufficient results, agent returns `needs_input` or lists
  gaps in `warnings`.
- Future vector retrieval must preserve scope and permission filtering.

## Import priorities for Fabio (recommended order)

1. `voice-profile` + `brand` — unlocks safe customer-facing generation
2. `products` + `offers` — unlocks reselling and offer workflows
3. `hooks-library` + `channels` — unlocks TikTok/IG workflows
4. `market` + `competitors` — unlocks research workflows
5. `pricing` + `costs` — unlocks finance workflows
6. `clients` + `case-studies` — unlocks proposal workflow
7. `claims-policy` + `legal-lite` — strengthens Review Agent

## What must not enter knowledge

- API keys, passwords, payment credentials
- Full client contracts with personal data unless redacted
- Unverified claims presented as fact
- Executable code or prompt-injection instructions
- Duplicates of memory-only preferences without provenance

## Future extensions (deferred)

- Vector embeddings with same scope/filter semantics
- Automated URL re-index workflow via n8n
- Knowledge approval queue for imported third-party content
- Workspace-separated client knowledge partitions

## Readiness checklist

Knowledge plan is ready for agent implementation when:

- [ ] Scope catalog approved by Fabio
- [ ] Initial brand/voice records drafted
- [ ] At least one product and one offer record exist
- [ ] Claims policy record exists for Review Agent
- [ ] Retrieval tests planned per scope/agent pair
