# Onlyway Revenue Operating System V1

**Stato:** `INTERNAL_PREPARATION_ONLY`

**Decision maker:** Fabio

**Dati economici reali disponibili:** `NOT_AVAILABLE`

**Azioni esterne autorizzate:** `0`

**Pubblicazione, invio, acquisti e attivazione pagamenti:** `LOCKED`

## Scopo

Questo pacchetto trasforma un'idea commerciale in un percorso verificabile: problema,
offerta, economics, acquisizione, vendita, delivery, misurazione e decisione. È una
base operativa locale per Onlyway; non è prova di domanda, fatturato o redditività e
non promette guadagni.

Quando un dato non è supportato da una fonte approvata, il valore corretto è
`NOT_AVAILABLE`. Nessun agente può sostituirlo con una stima silenziosa.

## Flusso operativo

```text
Fabio imposta vincoli e obiettivo
→ Offer Canvas
→ Evidence Gate
→ Pricing & Unit Economics
→ Customer Journey
→ Experiment Backlog
→ draft commerciali locali
→ Quality / Risk / Cost Gate
→ review Fabio
→ eventuale autorizzazione esterna separata
```

## Pacchetto

| Documento | Uso | Output consentito |
| --- | --- | --- |
| `01_OFFER_CANVAS.md` | Definire una sola offerta e i suoi unknown | Dossier interno |
| `02_PRICING_UNIT_ECONOMICS.md` | Calcolare scenari soltanto da input reali | Modello interno |
| `03_CUSTOMER_JOURNEY.md` | Collegare segnali, vendita e delivery | Journey approvabile |
| `04_SALES_DISCOVERY_QUALIFICATION.md` | Preparare discovery e qualificazione | Script/draft locale |
| `05_PROPOSAL_BRIEF.md` | Preparare una proposta coerente | Brief non inviato |
| `06_DELIVERY_CHECKLIST.md` | Rendere l'erogazione ripetibile | Checklist interna |
| `07_90_DAY_EXPERIMENT_BACKLOG.md` | Ordinare test e apprendimento | Backlog non esecutivo |
| `08_METRIC_DICTIONARY.md` | Definire KPI senza ambiguità | Dizionario metrico |
| `09_FABIO_SETUP_CHECKLIST.md` | Raccogliere il minimo input reale | Checkpoint unico |
| `10_TECHNICAL_CONTRACT_AND_COMMAND_CENTER.md` | Validare input e leggere la Revenue View | Scorecard locale redatta |

Gli asset CSV in `assets/revenue-os/` sono template vuoti. Non contengono lead,
prezzi, risultati o prove reali.

## Stati canonici

- `NOT_AVAILABLE`: il dato richiesto non è disponibile o non è verificato.
- `DRAFT_INTERNAL`: artefatto locale, modificabile e non approvato.
- `READY_FOR_FABIO_REVIEW`: completo per una decisione umana, non per uso esterno.
- `APPROVED_INTERNAL`: Fabio ha approvato il contenuto interno esatto.
- `BLOCKED`: manca un prerequisito obbligatorio, con reason code preciso.
- `LOCKED`: l'azione esterna non è autorizzata.

L'approvazione interna non autorizza invio, pubblicazione, contatto, spesa, firma,
pagamento, deploy o accesso a un account.

## Gate

| Gate | Passa soltanto se | Failure state |
| --- | --- | --- |
| G0 — Founder Input | obiettivo, vincoli, owner e scadenza sono espliciti | `FOUNDER_INPUT_REQUIRED` |
| G1 — Evidence | problema, audience e claim usati hanno provenance | `EVIDENCE_INSUFFICIENT` |
| G2 — Economics | ogni input economico obbligatorio è disponibile | `ECONOMICS_INPUT_REQUIRED` |
| G3 — Offer Integrity | promessa, scope, CTA e delivery sono coerenti | `OFFER_INTEGRITY_FAILED` |
| G4 — Quality/Risk/Cost | nessun claim falso, rischio irrisolto o costo non autorizzato | blocker specifico |
| G5 — Fabio Review | Fabio decide sull'esatta versione/fingerprint | `FABIO_REVIEW_REQUIRED` |
| G6 — External Action | esiste un'autorizzazione separata, bounded e corrente | `EXTERNAL_ACTION_LOCKED` |

## Squadra Onlyway

La squadra opera come reparti coordinati, non come agenti autonomi con potere libero:

- Onlyway Assistant: traduce l'obiettivo di Fabio in missione e checkpoint.
- Business Agent: struttura problema, offerta, alternative e ipotesi.
- Research Agent: produce Evidence Pack o dichiara `NOT_AVAILABLE`.
- Finance Agent: calcola economics deterministici senza inventare input.
- Sales Agent: prepara discovery, qualificazione e proposta; non contatta nessuno.
- Content Director e Producer: preparano asset coerenti con offerta e claim approvati.
- Customer Delivery Agent: prepara scope, acceptance e handoff.
- Quality, Risk e Cost Guardian: bloccano incoerenze, claim e spesa non autorizzata.

Fabio resta owner di prezzo, promessa, rischio, proof, uso esterno e decisione finale.

## Cadenza minima

- Ogni giorno operativo: un obiettivo, un collo di bottiglia, una decisione richiesta.
- Ogni settimana: review di esperimenti, pipeline, delivery, economics e dati mancanti.
- Ogni ciclo di offerta: una versione alla volta; gli esperimenti non approvati restano
  nel backlog.
- Ogni risultato: baseline, finestra temporale, fonte e definizione metrica; altrimenti
  `NOT_AVAILABLE`.

## Regole non negoziabili

- Nessun testimonial, case study, logo cliente, fatturato, conversione o risultato
  viene creato per riempire un vuoto.
- Nessun prezzo è “consigliato” senza costi, capacità, obiettivo e scenario approvati.
- Nessuna CTA promette una risorsa inesistente.
- Nessun lead reale o dato personale entra nei template del repository.
- Nessun agente invia messaggi, pubblica, compra, firma o attiva un account.
- La riuscita commerciale resta un'ipotesi da validare; non esistono garanzie di
  guadagno.
