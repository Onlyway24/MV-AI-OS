# Fabio Setup Checkpoint — Onlyway Revenue OS V1

**Scopo:** raccogliere una volta sola le decisioni che gli agenti non possono inventare.

**Azione esterna durante il setup:** `0`

Compilare con valori reali o `NOT_AVAILABLE`. Non inserire password, API key, token,
client secret, documenti personali o dati cliente nel repository.

## A. Direzione founder

- [ ] Obiettivo business dei prossimi 90 giorni: `NOT_AVAILABLE`
- [ ] Perché è prioritario: `NOT_AVAILABLE`
- [ ] Tempo settimanale disponibile: `NOT_AVAILABLE`
- [ ] Budget massimo totale: `NOT_AVAILABLE`
- [ ] Budget massimo per esperimento: `NOT_AVAILABLE`
- [ ] Tolleranza al rischio: `NOT_AVAILABLE`
- [ ] Geografia/lingua: `NOT_AVAILABLE`
- [ ] Attività vietate: `NOT_AVAILABLE`
- [ ] WIP limit: `NOT_AVAILABLE`
- [ ] Data di inizio reale: `NOT_AVAILABLE`

## B. Una offerta prioritaria

- [ ] Nome interno: `NOT_AVAILABLE`
- [ ] Segmento primario: `NOT_AVAILABLE`
- [ ] Problema specifico: `NOT_AVAILABLE`
- [ ] Outcome controllabile: `NOT_AVAILABLE`
- [ ] Core deliverable: `NOT_AVAILABLE`
- [ ] Non-scope: `NOT_AVAILABLE`
- [ ] Delivery window: `NOT_AVAILABLE`
- [ ] Numero revisioni/supporto: `NOT_AVAILABLE`
- [ ] Capacità clienti/unità: `NOT_AVAILABLE`
- [ ] Modello di ricavo: `NOT_AVAILABLE`

Non compilare più offerte nello stesso primo checkpoint. Le alternative restano nel
backlog per evitare dispersione.

## C. Economics reali

- [ ] Prezzo o intervallo da valutare: `NOT_AVAILABLE`
- [ ] Valuta: `NOT_AVAILABLE`
- [ ] Fee pagamento: `NOT_AVAILABLE`
- [ ] Ore delivery/onboarding/supporto: `NOT_AVAILABLE`
- [ ] Costo pieno orario: `NOT_AVAILABLE`
- [ ] Costi variabili tool/API/materiali: `NOT_AVAILABLE`
- [ ] Costi fissi attribuibili: `NOT_AVAILABLE`
- [ ] Refund/chargeback osservati: `NOT_AVAILABLE`
- [ ] CAC osservato: `NOT_AVAILABLE`
- [ ] Margine/contribuzione minima desiderata: `NOT_AVAILABLE`
- [ ] Trattamento fiscale da fonte competente: `NOT_AVAILABLE`

Una stima personale va marcata `FOUNDER_ESTIMATE`, con data e confidence; non diventa
un costo effettivo.

## D. Evidence e proof

Per ogni prova indicare ID, fonte, data, diritti, consenso, definizione metrica e uso
consentito.

- [ ] Interviste/problem evidence: `NOT_AVAILABLE`
- [ ] Analytics reali: `NOT_AVAILABLE`
- [ ] Case study reali: `NOT_AVAILABLE`
- [ ] Testimonial con consenso: `NOT_AVAILABLE`
- [ ] Portfolio/lavori propri autorizzati: `NOT_AVAILABLE`
- [ ] Claim ammessi: `NOT_AVAILABLE`
- [ ] Claim vietati: garanzie di guadagno, falsa urgenza, superiorità non provata.

Se una categoria non esiste, mantenere `NOT_AVAILABLE`; non è un errore da nascondere.

## E. Customer journey e Sales

- [ ] Fonte autorizzata dei lead: `NOT_AVAILABLE`
- [ ] Canale primario candidato: `NOT_AVAILABLE`
- [ ] CTA/risorsa realmente disponibile: `NOT_AVAILABLE`
- [ ] Criteri `FIT_CONFIRMED`: `NOT_AVAILABLE`
- [ ] Criteri `NOT_A_FIT`: `NOT_AVAILABLE`
- [ ] Processo decisionale cliente atteso: `NOT_AVAILABLE`
- [ ] Follow-up consentito: `NOT_AVAILABLE`
- [ ] Retention/do-not-contact policy: `NOT_AVAILABLE`
- [ ] Store CRM privato autorizzato: `NOT_AVAILABLE`

Il CSV nel repository è solo schema; non inserirvi contatti reali.

## F. Delivery

- [ ] Owner operativo: `NOT_AVAILABLE`
- [ ] Acceptance criteria per deliverable: `NOT_AVAILABLE`
- [ ] Input richiesti al cliente: `NOT_AVAILABLE`
- [ ] Metodo sicuro per accessi: `NOT_AVAILABLE`
- [ ] Backup/restore requirement: `NOT_AVAILABLE`
- [ ] Canale di review: `NOT_AVAILABLE`
- [ ] Escalation path: `NOT_AVAILABLE`
- [ ] Chiusura accessi e retention: `NOT_AVAILABLE`

## G. Metriche

Scegliere una primary metric per fase, usando `08_METRIC_DICTIONARY.md`:

- [ ] Evidence/problem metric: `NOT_AVAILABLE`
- [ ] Sales metric: `NOT_AVAILABLE`
- [ ] Economics metric: `NOT_AVAILABLE`
- [ ] Delivery metric: `NOT_AVAILABLE`
- [ ] Quality/risk metric: `NOT_AVAILABLE`
- [ ] Baseline e finestra per ciascuna: `NOT_AVAILABLE`

## H. Approval matrix

| Decisione | Prepara | Verifica | Approva | Azione esterna separata |
| --- | --- | --- | --- | --- |
| Offer Canvas | Business Agent | Quality/Risk/Finance | Fabio | sì |
| Prezzo | Finance Agent | Business/Delivery | Fabio | sì |
| Esperimento | Business/Research | Quality/Risk/Cost | Fabio | sì |
| Proposal | Sales Agent | Business/Finance/Risk | Fabio | sì |
| Asset commerciale | Content team | Quality/Risk/Visual | Fabio | sì |
| Delivery change | Delivery Agent | Business/Cost/Risk | Fabio | sì |

Gli agenti non approvano per conto di Fabio.

## I. Decisione di attivazione interna

Prima di aprire il primo esperimento:

- [ ] G0 Founder Input PASS.
- [ ] G1 Evidence PASS oppure blocker accettato esplicitamente senza claim esterno.
- [ ] G2 Economics PASS.
- [ ] G3 Offer Integrity PASS.
- [ ] G4 Quality/Risk/Cost PASS.
- [ ] Versione e fingerprint disponibili.
- [ ] Fabio sceglie `APPROVE_INTERNAL`, `REQUEST_REVISION`, `HOLD` o `REJECT`.

Anche con `APPROVE_INTERNAL`:

```text
OUTREACH = LOCKED
PUBLISHING = LOCKED
AD_SPEND = LOCKED
PAYMENT_ACTIVATION = LOCKED
CONTRACT_SEND = LOCKED
DEPLOY = LOCKED
```

Ogni futura azione richiede un checkpoint separato, con account/destinazione, cap,
scope, scadenza, idempotenza e receipt.
