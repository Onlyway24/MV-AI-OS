# Onlyway Customer Journey V1

**Stato:** `DRAFT_INTERNAL`

**Dati cliente reali nel repository:** `0`

**Messaggi e pubblicazione:** `LOCKED`

Il journey collega ciò che il cliente deve comprendere con ciò che Onlyway deve
dimostrare ed erogare. Non autorizza contatti e non assume che un canale funzioni.

## Journey canonico

| Stage | Domanda del cliente | Input/segno reale | Output Onlyway | Exit criteria | Owner |
| --- | --- | --- | --- | --- | --- |
| 1. Problema | “È davvero un problema per me?” | Evidence Pack | Contenuto educativo/diagnostico in draft | problema riconosciuto senza claim falso | Research + Content |
| 2. Interesse | “Vale la pena approfondire?” | Segnale tracciato e consensuale | Risorsa o invito realmente disponibile | consenso e next step espliciti | Marketing + Risk |
| 3. Qualificazione | “È adatto alla mia situazione?” | Discovery autorizzata | Fit / no-fit / input mancante | qualification reason code | Sales |
| 4. Valutazione | “Cosa ricevo, a quali condizioni?” | Offer Canvas approvato | Proposal brief coerente | scope, prezzo e rischio compresi | Business + Finance |
| 5. Decisione | “Procedo oppure no?” | Decisione reale del prospect | Accept / decline / hold | scelta registrata senza pressione | Sales |
| 6. Onboarding | “Cosa serve per iniziare?” | Accordo e prerequisiti verificati | Piano onboarding | accessi, input e owner disponibili | Delivery + Risk |
| 7. Delivery | “Il lavoro sta rispettando lo scope?” | milestone e acceptance evidence | Deliverable versionati | criteria verificati | Delivery + Quality |
| 8. Outcome review | “Cosa è cambiato davvero?” | baseline e misura comparabile | report con limiti | outcome observed o `NOT_AVAILABLE` | Delivery + Finance |
| 9. Continuazione | “Qual è il prossimo valore?” | feedback e fit verificati | rinnovo/espansione in draft | nuova decisione separata | Business + Sales |
| 10. Advocacy | “Posso raccontarlo?” | consenso e diritti espliciti | case study/testimonial draft | Fabio + cliente approvano testo esatto | Risk + Content |

## Service blueprint

Per ogni stage compilare:

- trigger osservabile;
- canale e owner;
- input del cliente minimizzato;
- proof necessaria;
- artefatto prodotto;
- tempo/SLA approvato;
- failure path;
- evento metrico e definizione;
- stato approval;
- next best action in draft.

Se un elemento manca, non inventare il touchpoint: `NOT_AVAILABLE`.

## Entry/exit contract

Ogni transizione richiede un evento reale. Esempi:

- `PROBLEM_SIGNAL_RECORDED`
- `CONSENT_RECORDED`
- `DISCOVERY_COMPLETED`
- `QUALIFICATION_DECIDED`
- `PROPOSAL_READY_FOR_REVIEW`
- `PROSPECT_DECISION_RECORDED`
- `ONBOARDING_PREREQUISITES_MET`
- `DELIVERABLE_ACCEPTED`
- `OUTCOME_MEASURED`
- `ADVOCACY_CONSENT_VERIFIED`

Un'apertura email, un like o una visita non dimostrano intenzione d'acquisto senza
una definizione e una fonte approvate.

## Qualification outcomes

- `FIT_CONFIRMED`: problema, outcome, scope, capacità e condizioni sono compatibili.
- `FIT_UNCERTAIN`: manca un input preciso; nessuna proposta finale.
- `NOT_A_FIT`: almeno un criterio non è compatibile; spiegare senza pressione.
- `DEFERRED`: interesse possibile, timing non confermato.
- `PRIVACY_BLOCKED`: dati o consenso non permettono di procedere.

## Touchpoint card

```text
Touchpoint ID: NOT_AVAILABLE
Journey stage: NOT_AVAILABLE
Audience/segment: NOT_AVAILABLE
Customer question: NOT_AVAILABLE
Single objective: NOT_AVAILABLE
Claim(s): NOT_AVAILABLE
Evidence ID(s): NOT_AVAILABLE
CTA/resource: NOT_AVAILABLE
Channel: NOT_AVAILABLE
Metric event: NOT_AVAILABLE
Owner: NOT_AVAILABLE
Approval state: DRAFT_INTERNAL
External action: LOCKED
```

## Privacy minima per CRM

Il template CSV non deve diventare un database operativo nel repository. In un futuro
store privato e autorizzato, raccogliere soltanto dati necessari a relazione,
consenso, qualificazione e follow-up richiesto. Non inserire password, documenti,
token, dati sensibili, conversazioni integrali o note denigratorie.

Ogni record reale deve dichiarare:

- fonte del contatto;
- base/consenso applicabile, se richiesto;
- scopo;
- owner;
- data di retention/review;
- richiesta di opt-out o do-not-contact;
- ultimo evento verificato;
- next step approvato.

`DO_NOT_CONTACT` prevale su qualunque suggerimento dell'agente.

## Journey review

- [ ] Ogni stage ha input ed exit criteria osservabili.
- [ ] CTA e risorse esistono realmente.
- [ ] Il passaggio Sales → Delivery conserva scope e promessa esatti.
- [ ] Baseline e outcome hanno la stessa definizione metrica.
- [ ] Nessun evento debole viene presentato come acquisto intent.
- [ ] Privacy, consenso e retention sono espliciti.
- [ ] I fallimenti hanno una via onesta di no-fit/hold.
- [ ] Ogni azione esterna resta `LOCKED` senza autorizzazione separata.

Senza review Fabio sulla versione esatta: `READY_FOR_EXTERNAL_USE = false`.
