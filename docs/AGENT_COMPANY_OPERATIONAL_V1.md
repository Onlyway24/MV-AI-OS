# Onlyway Agent Company Operational V1

La fonte autorevole della compagnia operativa è il catalogo TypeScript
`OPERATIONAL_AGENT_COMPANY_CATALOG`, non un elenco narrativo. Un reparto compare nel
catalogo operativo soltanto se possiede almeno un task eseguibile, un executor
versionato, contratti di input/output, permessi, divieti e Quality / Risk / Cost Gate.

## Vertical slice eseguibile

Il comando locale `RUN_AGENT_COMPANY_WORKDAY` riceve una Missione aziendale comune e
coordina 17 reparti:

```text
Onlyway Assistant
→ Research Agent
→ Business Agent
→ Content Director / Content Producer
→ Sales / Customer Delivery / Knowledge / Developer / Finance / Legal-Risk
→ Publisher dry-run
→ Quality / Risk / Cost / Security / Backup Guardians
→ BLOCKED: BACKUP_RESTORE_RECEIPT_REQUIRED (acceptance attuale)
```

Ogni work item passa da `QUEUED` a `RUNNING`, quindi a `COMPLETED` o `BLOCKED`. Dopo
ogni transizione vengono persistiti tentativi, durata misurata, costo misurato, output
strutturato, fingerprint e tre Gate. La giornata conserva versione ottimistica e
fingerprint dell'input. Un nuovo processo riapre SQLite, salta i task già completati e
riprende dal primo task non terminale.

Gli output non sono blob arbitrari: un output terminale `COMPLETED` è JSON
serializzabile, validato e limitato a 65.536 byte; l'intera giornata è limitata a
1.048.576 byte. Output sovradimensionati, ciclici o non verificabili non vengono
persistiti come successi. Un task `BLOCKED` conserva invece un blocker strutturato e
bounded con `reasonCode`, owner, evidenza, input mancante, remediation e prossima
azione; non usa il testo raw dell'eccezione come stato operativo.

I comandi di lettura sono:

- `INSPECT_AGENT_COMPANY_WORKDAY`;
- `LIST_AGENT_COMPANY_WORKDAYS`;
- `GET_AGENT_COMPANY_CATALOG`;
- `GET_AGENT_COMPANY_METRICS`.

Il Centro di Comando proietta lo stesso stato: catalogo, executor, capacità, task
completati e bloccati, durata, costo, giornate, Gate, blocker e fingerprint. In
assenza di giornate eseguite mostra un empty state e metriche a zero; non crea
telemetria sintetica.

Il distinto `FounderWorkdayService` prepara Workday #001 come piano dipendenze dei
medesimi 17 reparti. Non finge l'esecuzione dei task: senza Business Mission, tre
Evidence Pack freschi o copertura repository completa produce blocker strutturati e
resta `BLOCKED`; senza receipt downstream resta `RUNNING`. Snapshot, insert ed evento
`FOUNDER_WORKDAY_CREATED` condividono una sola transazione SQLite. Questo record non
sostituisce né duplica l'aggregate eseguibile `AgentCompanyWorkday`.

## Confini non negoziabili

La giornata V1 non esegue email, contatti, CRM, spesa, pubblicazione, merge o deploy.
Il Publisher produce esclusivamente un dry-run con versione, istante, fingerprint e
chiave di idempotenza. Il Developer esegue attualmente soltanto
`engineering.prepare-change-plan`: produce un piano verificabile per un branch
isolato e dichiara esplicitamente `implementationExecuted: false` e
`mergeExecuted: false`.

Il Research Agent compila Evidence Pack soltanto da evidenze già acquisite, verificate
e appartenenti al Source Registry autorizzato. Non possiede accesso web libero e non
dichiara di avere acquisito fonti che il runtime non ha realmente importato.

Il Backup Guardian attesta la presenza dei riferimenti durevoli necessari alla
ripresa; non dichiara un backup o un restore se non sono avvenuti. Nell'acceptance
attuale resta quindi `BLOCKED` con reason code
`BACKUP_RESTORE_RECEIPT_REQUIRED`: soltanto una receipt esplicita di backup/restore
verificato può far avanzare quel task.

## Evidenza di collaudo

Il test end-to-end crea tre evidenze autorizzate esplicitamente marcate come fixture,
esegue i 17 work item e verifica l'esito reale: 16 `COMPLETED` e Backup Guardian
`BLOCKED` con `BACKUP_RESTORE_RECEIPT_REQUIRED`. Verifica inoltre i Gate terminali,
chiude SQLite, riapre un nuovo runtime, ispeziona e ripete idempotentemente il
comando, quindi controlla metriche e proiezione del Centro di Comando. Non esiste una
acceptance `17/17 COMPLETED` in questo stato del repository.

Questa prova dimostra composizione, persistenza e recovery. Non è una ricerca di
mercato reale e non deve essere presentata come il primo risultato commerciale di
Onlyway. Una giornata aziendale reale richiede tre Evidence Pack acquisiti da fonti
autorizzate e vincoli di Missione approvati da Fabio.

## Limiti dichiarati della V1

- Il comando interattivo può ancora eseguire la giornata nello stesso processo. Il
  runtime H24 supervisionato con scheduler/worker, lease e fencing è ora implementato
  e compone la callback locale Workday, ma resta disattivato finché Fabio non avvia o
  installa esplicitamente i processi locali.
- Il Developer Agent non modifica ancora il repository attraverso un tool gateway.
- Il Research Agent non acquisisce ancora URL reali; compila record già acquisiti.
- Non esiste ancora un comando di approvazione dell'intera giornata. Il contratto
  conserva `AWAITING_FABIO` come stato possibile dopo tutti i task completati, ma
  l'executor Backup Guardian corrente blocca onestamente la giornata finché non esiste
  una receipt verificata. Dossier e pacchetti mantengono i rispettivi confini di review.

Questi limiti impediscono di chiamare la V1 una compagnia autonoma o una prova di
business H24: la supervisione è reale e bounded, mentre i reparti restano task locali
durevoli, misurati e privi di effetti esterni. Il runbook autorevole è
`docs/SUPERVISED_H24_RUNTIME_V1.md`.
