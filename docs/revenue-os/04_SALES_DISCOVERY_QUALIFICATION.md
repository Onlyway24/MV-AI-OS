# Onlyway Sales Discovery & Qualification

**Stato:** `DRAFT_INTERNAL`

**Chiamate, email, DM e follow-up:** `LOCKED`

Questo script aiuta a capire se esiste un fit reale. Non serve a forzare una vendita,
estrarre dati non necessari o creare urgenza artificiale.

## Prerequisiti

- Offer Canvas con stato almeno `READY_FOR_FABIO_REVIEW`.
- Segmento e problema con Evidence Pack oppure limitation esplicita.
- Calendario, risorsa o canale realmente disponibile prima di usare una CTA.
- Base legittima/consenso applicabile e do-not-contact rispettato.
- Fabio approva canale, audience, copy e volume prima di qualsiasi contatto.

Se manca uno di questi elementi: `SALES_OUTREACH_BLOCKED`.

## Apertura trasparente

> “Grazie per il tempo. Vorrei capire la situazione, il risultato che stai cercando e
> se Onlyway può essere adatta. Se non c'è fit, te lo dico chiaramente. Ti va se parto
> da come gestisci oggi **`NOT_AVAILABLE`**?”

Sostituire il marcatore soltanto con il tema accettato dal prospect. Non registrare la
conversazione senza consenso esplicito e conforme.

## Discovery: domande essenziali

### 1. Contesto e problema

- “Che cosa sta succedendo oggi, in concreto?”
- “Quando si presenta il problema e con quale frequenza?”
- “Come lo gestisci adesso?”
- “Quale parte funziona già e non vuoi perdere?”
- “Che cosa hai provato e cosa hai osservato?”

### 2. Outcome e baseline

- “Quale cambiamento utile vorresti vedere?”
- “Come lo misuri oggi?”
- “Esiste una baseline confrontabile?”
- “Quale risultato dipende da te, dal mercato o da terzi?”
- “Che cosa renderebbe il progetto non riuscito?”

Se il prospect non ha una metrica, non suggerire un numero come se fosse già
condiviso. Registrare `BASELINE_NOT_AVAILABLE`.

### 3. Urgenza reale

- “Perché stai valutando questa priorità adesso?”
- “Esiste una data reale o è una preferenza?”
- “Cosa accade se decidi di non procedere?”
- “Quali altre priorità competono per tempo e budget?”

Una deadline commerciale creata da Onlyway deve essere reale, verificabile e
approvata. In assenza: `DEADLINE_NOT_AVAILABLE`.

### 4. Decisione e stakeholder

- “Chi userà il risultato?”
- “Chi deve valutarlo o approvarlo?”
- “Quali criteri userete per decidere?”
- “Ci sono requisiti legali, procurement, sicurezza o privacy?”
- “Qual è il processo dopo questa conversazione?”

### 5. Risorse e investimento

- “Quali input e tempo potete rendere disponibili?”
- “Avete già definito un intervallo d'investimento?”
- “Se non è definito, preferisci chiarire prima scope o ordine di grandezza?”
- “Quali costi o vincoli non possiamo ignorare?”

Il budget è facoltativo se il prospect non vuole condividerlo. Non usare vergogna,
pressione o finta scarsità. Registrare `BUDGET_NOT_AVAILABLE`.

### 6. Fit di delivery

- “Quali sistemi, accessi o asset sono necessari?”
- “Chi è owner degli input?”
- “Quale livello di supporto o revisione serve?”
- “Ci sono dati sensibili o diritti di terzi?”
- “Quale handoff sarebbe realmente utile?”

## Qualification decision

Non usare un punteggio numerico arbitrario. Valutare ogni criterio:

| Criterio | `CONFIRMED` | `UNCERTAIN` | `NOT_FIT` | Evidenza |
| --- | --- | --- | --- | --- |
| Problema reale e compreso |  |  |  | `NOT_AVAILABLE` |
| Outcome compatibile con lo scope |  |  |  | `NOT_AVAILABLE` |
| Baseline/metrica definibile |  |  |  | `NOT_AVAILABLE` |
| Timing reale |  |  |  | `NOT_AVAILABLE` |
| Stakeholder/processo decisionale |  |  |  | `NOT_AVAILABLE` |
| Risorse del cliente |  |  |  | `NOT_AVAILABLE` |
| Economics compatibili |  |  |  | `NOT_AVAILABLE` |
| Capacità Onlyway disponibile |  |  |  | `NOT_AVAILABLE` |
| Privacy, diritti e rischio gestibili |  |  |  | `NOT_AVAILABLE` |

Decisione deterministica:

- almeno un criterio critico `NOT_FIT` → `NOT_A_FIT`;
- nessun `NOT_FIT`, ma almeno un obbligatorio `UNCERTAIN` → `FIT_UNCERTAIN`;
- tutti gli obbligatori `CONFIRMED` → `FIT_CONFIRMED`;
- impossibilità privacy/consenso → `PRIVACY_BLOCKED`.

## Chiusura della discovery

### Fit incerto

> “Vedo un possibile fit, ma manca **`NOT_AVAILABLE`**. Non sarebbe corretto proporti
> uno scope finale prima di chiarirlo. Preparo un riepilogo interno e il prossimo
> passo resta da concordare.”

### Non-fit

> “Per quello che hai descritto, oggi non vedo un fit corretto perché
> **`NOT_AVAILABLE`**. Preferisco dirtelo invece di promettere un risultato che non
> controlliamo.”

### Fit confermato

> “Il fit sembra concreto sui punti che abbiamo verificato. Il passo successivo è un
> brief con outcome, scope, condizioni e dati ancora mancanti. Non è un impegno finché
> non viene approvato da entrambe le parti.”

Queste frasi sono template. Non inviarle automaticamente.

## Obiezioni senza manipolazione

| Obiezione | Risposta corretta |
| --- | --- |
| “Costa troppo” | Chiarire outcome, scope e alternative; non inventare ROI. |
| “Devo pensarci” | Chiedere quale informazione manca e rispettare il timing. |
| “Garantite il risultato?” | Distinguere deliverable controllabili da outcome esterni. |
| “Un concorrente promette di più” | Confrontare scope e prova; non denigrare. |
| “Mandami qualcosa” | Inviare solo dopo approvazione e solo una risorsa realmente esistente. |
| “Non contattarmi” | Registrare `DO_NOT_CONTACT` e interrompere il follow-up. |

## Discovery summary interno

```text
Opportunity ID: NOT_AVAILABLE
Data e fonte: NOT_AVAILABLE
Segmento: NOT_AVAILABLE
Problema nelle parole del prospect: NOT_AVAILABLE
Outcome richiesto: NOT_AVAILABLE
Baseline/metrica: NOT_AVAILABLE
Timing: NOT_AVAILABLE
Decision maker/stakeholder: NOT_AVAILABLE
Budget: NOT_AVAILABLE
Vincoli e rischi: NOT_AVAILABLE
Proof richiesta: NOT_AVAILABLE
Qualification: FIT_UNCERTAIN
Reason code: NOT_AVAILABLE
Next step proposto: NOT_AVAILABLE
Approval state: DRAFT_INTERNAL
External follow-up: LOCKED
```

Parafrasare con accuratezza; una citazione letterale richiede consenso e contesto.
Non archiviare dati personali nel repository.

## Gate Sales

- [ ] Fonte e consenso del contatto sono validi.
- [ ] Do-not-contact verificato.
- [ ] Script coerente con Offer Canvas corrente.
- [ ] Nessun claim o risultato inventato.
- [ ] Qualification ha evidence e reason code.
- [ ] Il CRM operativo, se futuro, è privato e con retention.
- [ ] Fabio ha approvato il singolo next step esterno.

Senza ultimo punto: `EXTERNAL_ACTION_LOCKED`.
