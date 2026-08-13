# Onlyway 90-Day Experiment Backlog Framework

**Stato:** `NON_EXECUTING_FRAMEWORK`

**Esperimenti approvati:** `0`

**Spesa e azioni esterne:** `LOCKED`

Il programma di 90 giorni serve a ridurre incertezza in ordine: problema, offerta,
economics, acquisizione e delivery. Non è una previsione di ricavi e non assegna
attività senza input e review di Fabio.

## Principio di portafoglio

Ogni esperimento deve rispondere a una sola domanda decisionale. Se un test cambia
contemporaneamente audience, offerta, prezzo, messaggio e canale, il learning non è
attribuibile e il test va ridotto.

Ordine di rischio:

```text
desirability: problema e outcome
→ viability: prezzo, costo, capacità
→ feasibility: delivery e qualità
→ acquisition: canale e conversione
→ repeatability: coorti, retention e operations
```

Non “scalare” prima che i gate precedenti abbiano evidenza sufficiente.

## Fasi

| Finestra | Obiettivo | Output minimo | Gate di uscita |
| --- | --- | --- | --- |
| Giorni 1–30 | Ridurre incertezza su problema, segmento e promessa | Evidence Pack + Offer Canvas revisionato | G1/G3 + Fabio |
| Giorni 31–60 | Verificare economics e percorso di vendita/delivery | Economics + journey + dry-run delivery | G2/G4 + Fabio |
| Giorni 61–90 | Verificare ripetibilità su un canale e una offerta | coorte definita + reconciliation + decision brief | Quality/Risk/Cost + Fabio |

Le date effettive partono solo dopo `PROGRAM_START_APPROVED`. Se il setup richiede
più tempo, non retrodatare attività o risultati.

## Experiment card

```text
Experiment ID/version: NOT_AVAILABLE
Decision question: NOT_AVAILABLE
Hypothesis: NOT_AVAILABLE
Evidence that motivated it: NOT_AVAILABLE
Segment: NOT_AVAILABLE
Offer/version: NOT_AVAILABLE
Single variable: NOT_AVAILABLE
Method: NOT_AVAILABLE
Primary metric/event: NOT_AVAILABLE
Baseline: NOT_AVAILABLE
Pass threshold: NOT_AVAILABLE
Fail/stop threshold: NOT_AVAILABLE
Observation window: NOT_AVAILABLE
Minimum evidence requirement: NOT_AVAILABLE
Budget preflight/cap: NOT_AVAILABLE
External action required: NOT_AVAILABLE
Risk/privacy/rights: NOT_AVAILABLE
Owner/reviewer: NOT_AVAILABLE
Status: BACKLOG
Approval receipt: NOT_AVAILABLE
Observed result: NOT_AVAILABLE
Decision: NOT_AVAILABLE
Learning/evidence refs: NOT_AVAILABLE
```

Una threshold è una decisione prima del test. Non sceglierla dopo aver visto i dati.

## Stati

- `BACKLOG`: idea non ancora pronta.
- `READY_FOR_FABIO_REVIEW`: contratto completo, non autorizzato.
- `APPROVED`: Fabio ha approvato versione, cap e perimetro esatti.
- `RUNNING`: esecuzione reale con receipt.
- `PAUSED`: sospeso con motivo e stato conservato.
- `COMPLETED`: finestra chiusa, dati riconciliati.
- `INVALIDATED`: protocollo o dati non consentono una decisione.
- `CANCELLED`: terminato senza presentarlo come fallimento di mercato.
- `BLOCKED`: manca un prerequisito preciso.

## Prioritizzazione fail-closed

Prima di attribuire un punteggio, verificare:

1. decisione che il test abilita;
2. evidence corrente;
3. metrica osservabile;
4. costo/cap;
5. capacità operativa;
6. rischio e autorizzazioni.

Se uno è `NOT_AVAILABLE`, la priorità numerica è `NOT_AVAILABLE`. Quando tutti sono
disponibili, Fabio può approvare una formula e scala versionate. Non usare un ICE/RICE
arbitrario come verità.

## Candidate patterns

Queste sono tipologie, non esperimenti approvati o risultati:

| Pattern | Domanda | Prova consentita in preparazione locale | Possibile azione esterna |
| --- | --- | --- | --- |
| Problem interview | il problema è specifico e ricorrente? | script + criteria | conversazione approvata |
| Message comprehension | la promessa viene capita senza spiegazioni? | varianti in draft + rubric | test autorizzato |
| Price discovery | condizioni e investimento sono compatibili? | scenari economics | discovery autorizzata |
| Delivery dry-run | possiamo erogare lo scope con qualità e capacità? | simulazione interna, fixture dichiarate | nessuna |
| Proposal clarity | scope e acceptance riducono ambiguità? | review interna | invio approvato |
| Channel pilot | il canale produce segnali definiti? | piano e tracking spec | pubblicazione/spesa separata |
| Onboarding test | gli input arrivano completi e sicuri? | checklist e rehearsal | cliente reale approvato |
| Outcome measurement | baseline e post sono confrontabili? | metric contract | raccolta dati autorizzata |

Le fixture di dry-run dimostrano il processo, non domanda o conversione.

## Stop rules

Fermare o bloccare quando:

- il cap costo/tempo è raggiunto;
- la metrica o il tracking non sono affidabili;
- cambia l'offerta o il segmento durante la finestra;
- emerge rischio privacy, diritti, compliance o reputazione;
- i deliverable non rispettano acceptance criteria;
- il sample è insufficiente rispetto alla regola approvata;
- il dato è corrotto, duplicato o non riconciliabile;
- Fabio revoca l'autorizzazione.

Uno stop conserva quanto osservato, ma l'esito decisionale può restare
`INCONCLUSIVE`.

## Weekly decision review

Per ogni esperimento:

| Campo | Valore |
| --- | --- |
| Stato e fingerprint | `NOT_AVAILABLE` |
| Spesa/tempo stimato | `NOT_AVAILABLE` |
| Spesa/tempo effettivo | `NOT_AVAILABLE` |
| Copertura evidence | `NOT_AVAILABLE` |
| Risultato primario | `NOT_AVAILABLE` |
| Limitazioni | `NOT_AVAILABLE` |
| Decisione proposta | `NOT_AVAILABLE` |
| Decisione Fabio | `NOT_AVAILABLE` |

Decisioni ammesse: `CONTINUE`, `ITERATE_ONE_VARIABLE`, `PAUSE`, `STOP`,
`PROMOTE_TO_NEXT_GATE`, `INCONCLUSIVE`.

## Backlog health

- [ ] Ogni item abilita una decisione reale.
- [ ] Nessun item duplica un esperimento già aperto.
- [ ] WIP limit deciso da Fabio: `NOT_AVAILABLE`.
- [ ] Budget e tempo totale disponibili: `NOT_AVAILABLE`.
- [ ] Dipendenze e sequenza sono esplicite.
- [ ] Le azioni esterne hanno gate separati.
- [ ] Risultati e failure non vengono riscritti per sostenere una narrativa.

Il CSV operativo vuoto è in
`assets/revenue-os/experiment-backlog-template.csv`.
