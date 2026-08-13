# Onlyway Metric Dictionary V1

**Stato:** `INTERNAL_SCHEMA`

**Valori correnti:** `NOT_AVAILABLE`

Una metrica è utilizzabile solo se nome, formula, evento, finestra, fonte e owner sono
stabili. “Più lead” o “buona conversione” non sono definizioni.

## Regole comuni

- Un valore assente è `NOT_AVAILABLE`, mai `0`.
- Separare conteggio eventi, persone/account unici e valore economico.
- Conservare timezone, finestra e regola di deduplicazione.
- Distinguere `booked`, `invoiced`, `collected`, `refunded` e `recognized`.
- Una percentuale espone numeratore e denominatore.
- Un dato parziale è `INCOMPLETE_COVERAGE`, non un totale.
- Una metrica di piattaforma conserva la definizione della piattaforma e la data.
- Nessuna dashboard trasforma correlazione in causalità.

## Funnel e Sales

| Metric ID | Definizione | Formula | Fonte minima | Limite |
| --- | --- | --- | --- | --- |
| `LEAD_UNIQUE` | persona/account unico con segnale e source verificati | distinct lead ID nella finestra | CRM privato | non equivale a interesse qualificato |
| `MQL_UNIQUE` | lead che supera criteri marketing approvati | distinct lead con `MQL` receipt | criteria version + CRM | criteria devono essere versionati |
| `SQL_UNIQUE` | lead con qualification sales completata | distinct opportunity `FIT_CONFIRMED` | discovery receipt | non equivale a proposta |
| `DISCOVERY_COMPLETED` | discovery chiusa con outcome | count event | calendar/CRM receipt | no-show esclusi |
| `PROPOSAL_SENT` | proposta esatta inviata con receipt | count send receipt | Action Gateway/CRM | draft non contato |
| `OPPORTUNITY_WON` | accettazione commerciale verificata | count accepted opportunity | agreement/payment source | non equivale a incasso |
| `OPPORTUNITY_LOST` | decisione negativa verificata | count lost outcome | CRM | richiede reason code |
| `LEAD_TO_SQL_RATE` | quota lead diventati SQL | SQL / lead eligible | stesse coorti e finestra | denominatore esplicito |
| `PROPOSAL_WIN_RATE` | proposte con outcome won | won / proposals decided | CRM | open proposal escluse |
| `SALES_CYCLE_DAYS` | tempo da start definito a decisione | median(decision-start) | timestamp CRM | start event versionato |

## Revenue ed economics

| Metric ID | Definizione | Formula | Fonte minima | Limite |
| --- | --- | --- | --- | --- |
| `BOOKED_REVENUE` | valore di accordi accettati nella finestra | somma valore contrattuale | agreement source | non è cassa |
| `INVOICED_REVENUE` | valore fatturato nella finestra | somma fatture emesse | sistema contabile | trattamento fiscale professionale |
| `COLLECTED_REVENUE` | cassa ricevuta e riconciliata | somma pagamenti settled | provider/banca/contabilità | al netto o lordo va dichiarato |
| `REFUNDED_AMOUNT` | cassa restituita | somma refund settled | provider/contabilità | finestra/coorte esplicita |
| `NET_REVENUE` | ricavo secondo contratto economics | P - sconti - refund | ledger riconciliato | imposte pass-through separate |
| `CM1` | contribuzione prima di acquisizione | net revenue - fee - delivery variabile | economics ledger | costo lavoro incluso |
| `CM2` | contribuzione dopo acquisizione | CM1 - CAC | economics + acquisition ledger | attribution CAC esplicita |
| `CAC` | costo acquisizione per clienti della coorte | costo attribuito / nuovi clienti attribuiti | ad/ops/CRM ledger | modello attribuzione dichiarato |
| `CAC_PAYBACK` | mesi per recuperare CAC dalla contribuzione | CAC / contribuzione mensile | coorte ricorrente | solo contribuzione positiva |
| `REVENUE_PER_CAPACITY_UNIT` | ricavo per unità di capacità | net revenue / unità erogata | ledger + delivery | unità definita |

## Delivery e Customer

| Metric ID | Definizione | Formula | Fonte minima | Limite |
| --- | --- | --- | --- | --- |
| `TIME_TO_FIRST_VALUE` | tempo da onboarding-ready al primo acceptance event | timestamp delta | delivery receipts | first value definito per offerta |
| `ON_TIME_MILESTONE_RATE` | milestone accettate entro scadenza valida | on-time / due milestone | delivery store | cambi scope separati |
| `FIRST_PASS_ACCEPTANCE` | deliverable accettati senza revisione | first-pass accepted / reviewed | review receipts | non misura outcome commerciale |
| `REWORK_HOURS` | ore dovute a revisione/correzione | somma ore classificate | time ledger | distinguere scope change |
| `ACTIVE_CUSTOMER` | cliente con condizione attiva versionata | distinct customer | agreement/delivery | definizione varia per offerta |
| `RETENTION_RATE` | quota coorte che soddisfa evento di retention | retained / eligible cohort | product/billing/delivery | evento e coorte espliciti |
| `CHURN_RATE` | quota coorte che termina secondo regola | churned / eligible cohort | billing/agreement | involontario/volontario separati |
| `REFERRAL_CONSENT_RATE` | clienti che autorizzano un referral/testimonial | consented / asked | consent store | consenso revocabile, no incentivo occulto |

## Content e acquisition

| Metric ID | Definizione | Formula | Fonte minima | Limite |
| --- | --- | --- | --- | --- |
| `ASSET_PUBLISHED` | asset realmente pubblicato con receipt | count publish receipt | connector | draft/approved esclusi |
| `QUALIFIED_VISIT` | visita che soddisfa evento approvato | distinct session/account | analytics consented | bot filtering richiesto |
| `CTA_COMPLETION` | completamento della CTA reale | completions / eligible views | analytics + destination | CTA deve esistere |
| `CONTENT_TO_LEAD_RATE` | lead attribuiti a contenuto | attributed leads / eligible audience | analytics + CRM | attribution model esplicito |
| `SAVE_RATE` | salvataggi su impression secondo piattaforma | saves / impressions | platform insight | definizione/date piattaforma |
| `COMPLETION_RATE` | completamenti su avvii validi | completions / starts | platform insight | soglia completamento esplicita |

## Governance e qualità

| Metric ID | Definizione | Formula | Fonte minima | Limite |
| --- | --- | --- | --- | --- |
| `PROOF_COVERAGE` | claim approvati con evidence valida | supported claims / claims reviewed | claim matrix | claim bloccati restano nel denominatore |
| `APPROVAL_LEAD_TIME` | tempo da review-ready a decisione | decision-ready timestamp | approval store | pause esplicite |
| `QUALITY_FIRST_PASS` | asset che passano tutti i gate al primo ciclo | pass / reviewed | gate receipts | nessuna media nasconde blocker |
| `COST_RECONCILIATION_RATE` | operazioni con costo effettivo riconciliato | reconciled / cost-bearing operations | cost ledger | uncertain non è zero |
| `EXTERNAL_EFFECT_COUNT` | azioni esterne con receipt | count external receipts | Action Gateway | preparazione locale esclusa |
| `BLOCKER_AGE` | tempo di un blocker ancora aperto | now - openedAt | operational store | timezone e pause definite |

## Metric contract

```text
Metric ID/version: NOT_AVAILABLE
Business question: NOT_AVAILABLE
Definition: NOT_AVAILABLE
Numerator: NOT_AVAILABLE
Denominator: NOT_AVAILABLE
Unit: NOT_AVAILABLE
Event/source: NOT_AVAILABLE
Deduplication key: NOT_AVAILABLE
Attribution model: NOT_AVAILABLE
Timezone/window: NOT_AVAILABLE
Freshness SLA: NOT_AVAILABLE
Owner: NOT_AVAILABLE
Privacy class: NOT_AVAILABLE
Known limitations: NOT_AVAILABLE
Approval: NOT_AVAILABLE
```

## Data quality states

- `VERIFIED`: formula, coverage e source sono verificati.
- `PROVISIONAL`: utilizzabile solo con limitation visibile.
- `INCOMPLETE_COVERAGE`: osservazione parziale, non totale.
- `STALE`: oltre la freshness approvata.
- `CONFLICTING`: fonti/definizioni non concordano.
- `NOT_AVAILABLE`: valore non disponibile.
- `BLOCKED_PRIVACY`: raccolta/uso non autorizzato.

Solo `VERIFIED` può sostenere un claim non qualificato.
