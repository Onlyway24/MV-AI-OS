# Onlyway Delivery Checklist

**Stato:** `INTERNAL_TEMPLATE`

**Delivery reale corrente:** `NOT_AVAILABLE`

Una vendita sostenibile richiede che la promessa sia erogabile, misurabile e
ripetibile. Questa checklist evita che Sales venda una cosa e Delivery ne consegni
un'altra.

## D0 — Handoff commerciale

- [ ] Agreement/proposta accettata con ID e versione verificabili.
- [ ] Scope, non-scope, prezzo, termini e acceptance criteria coincidono.
- [ ] Outcome controllabili separati dagli outcome esterni.
- [ ] Dipendenze e responsabilità del cliente sono esplicite.
- [ ] Risk/Legal review completata quando applicabile.
- [ ] Contatto operativo e decision maker sono registrati nello store autorizzato.
- [ ] Nessun dato personale è stato copiato nel repository.

Se manca evidenza di accettazione: `DELIVERY_NOT_AUTHORIZED`.

## D1 — Readiness e onboarding

| Prerequisito | Owner | Due date | Evidence | Stato |
| --- | --- | --- | --- | --- |
| Input e asset | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Diritti/licenze | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Accessi via connessione sicura | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Baseline | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Referenti/approvatori | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Calendario milestone | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |

- [ ] Chiedere soltanto gli accessi necessari e con least privilege.
- [ ] Non chiedere password o secret in chat/email/documenti.
- [ ] Definire retention e cancellazione per input cliente.
- [ ] Definire canale e tempo di risposta reali.
- [ ] Registrare blocker, non fingere readiness.

## D2 — Delivery plan

Per ogni milestone:

```text
Milestone ID: NOT_AVAILABLE
Objective: NOT_AVAILABLE
Input version/fingerprint: NOT_AVAILABLE
Deliverable: NOT_AVAILABLE
Acceptance criteria: NOT_AVAILABLE
Owner: NOT_AVAILABLE
Reviewer: NOT_AVAILABLE
Quality gate: NOT_AVAILABLE
Risk gate: NOT_AVAILABLE
Cost gate: NOT_AVAILABLE
Due date: NOT_AVAILABLE
Status: NOT_AVAILABLE
```

Stati ammessi: `NOT_STARTED`, `READY`, `IN_PROGRESS`, `BLOCKED`,
`READY_FOR_REVIEW`, `ACCEPTED`, `REJECTED`, `CANCELLED`.

## D3 — Production controls

- [ ] L'input usato è la versione autorizzata.
- [ ] Il deliverable ha provenance e fingerprint.
- [ ] Output generati da AI sono dichiarati secondo policy applicabile.
- [ ] Dati, prompt, secret e token non entrano in log o artefatti.
- [ ] Fonti e claim restano collegati.
- [ ] Costi sono preflight, misurati e riconciliati.
- [ ] Retry e fallback non superano il budget autorizzato.
- [ ] Nessun output parziale è presentato come completo.
- [ ] Backup/restore receipt esiste quando richiesto dal piano.

## D4 — Quality acceptance

| Dimensione | Criterio | Evidenza | Esito |
| --- | --- | --- | --- |
| Completezza | tutti i deliverable inclusi | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Correttezza | criteri verificati, nessun placeholder | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Coerenza | scope, brand, claim e formati allineati | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Usabilità | il destinatario può usare l'output previsto | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Sicurezza | secret/PII/permessi verificati | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Costo | ledger riconciliato | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Visual | gate visuale se applicabile | `NOT_AVAILABLE` | `NOT_AVAILABLE` |

Un voto medio non compensa un blocker. Privacy, claim, sicurezza, costo o acceptance
critici falliscono chiusi.

## D5 — Review e change request

- Fabio approva gli asset interni quando previsto.
- Il cliente accetta, rifiuta o richiede revisione sui criteri concordati.
- Una revisione crea una nuova versione; l'originale resta immutabile.
- Fuori scope → `CHANGE_REQUEST_REQUIRED` con impatto su tempo/costo/rischio.
- Un commento ambiguo → `CLARIFICATION_REQUIRED`, non una modifica indovinata.

## D6 — Handoff finale

- [ ] Deliverable finali e manifest disponibili.
- [ ] Istruzioni d'uso e limiti incluse.
- [ ] Acceptance receipt collegata alla versione esatta.
- [ ] Asset/input temporanei gestiti secondo retention.
- [ ] Accessi revocati o ridotti quando non più necessari.
- [ ] Cost ledger riconciliato.
- [ ] Open issue e owner dichiarati.
- [ ] Nessuna pubblicazione o azione account implicita nell'handoff.

## D7 — Outcome review

| Metrica | Baseline | Valore osservato | Finestra | Fonte | Attribution limit |
| --- | --- | --- | --- | --- | --- |
| `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |

Non trasformare correlazione in causalità. Se baseline, fonte o definizione non
coincidono: `OUTCOME_NOT_COMPARABLE`.

## Incidenti e blocker

Reason code minimi:

- `DELIVERY_NOT_AUTHORIZED`
- `CLIENT_INPUT_REQUIRED`
- `RIGHTS_OR_PRIVACY_BLOCKED`
- `ACCESS_BOUNDARY_BLOCKED`
- `SCOPE_MISMATCH`
- `QUALITY_GATE_FAILED`
- `RISK_GATE_FAILED`
- `COST_GATE_FAILED`
- `CHANGE_REQUEST_REQUIRED`
- `OUTCOME_NOT_COMPARABLE`
- `ACCEPTANCE_RECEIPT_REQUIRED`

Ogni blocker conserva owner, evidence, remediation e next check. Non usare errori raw
o dati personali nel reason record.
