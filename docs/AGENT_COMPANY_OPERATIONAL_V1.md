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
→ AWAITING_FABIO
```

Ogni work item passa da `QUEUED` a `RUNNING`, quindi a `COMPLETED` o `BLOCKED`. Dopo
ogni transizione vengono persistiti tentativi, durata misurata, costo misurato, output
strutturato, fingerprint e tre Gate. La giornata conserva versione ottimistica e
fingerprint dell'input. Un nuovo processo riapre SQLite, salta i task già completati e
riprende dal primo task non terminale.

I comandi di lettura sono:

- `INSPECT_AGENT_COMPANY_WORKDAY`;
- `LIST_AGENT_COMPANY_WORKDAYS`;
- `GET_AGENT_COMPANY_CATALOG`;
- `GET_AGENT_COMPANY_METRICS`.

Il Centro di Comando proietta lo stesso stato: catalogo, executor, capacità, task
completati e bloccati, durata, costo, giornate, Gate, blocker e fingerprint. In
assenza di giornate eseguite mostra un empty state e metriche a zero; non crea
telemetria sintetica.

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
ripresa; non dichiara un backup o un restore se non sono avvenuti.

## Evidenza di collaudo

Il test end-to-end crea tre evidenze autorizzate esplicitamente marcate come fixture,
esegue una giornata completa, verifica 17 task e 51 Gate, chiude SQLite, riapre un
nuovo runtime, ispeziona e ripete idempotentemente il comando, quindi verifica
metriche e proiezione del Centro di Comando.

Questa prova dimostra composizione, persistenza e recovery. Non è una ricerca di
mercato reale e non deve essere presentata come il primo risultato commerciale di
Onlyway. Una giornata aziendale reale richiede tre Evidence Pack acquisiti da fonti
autorizzate e vincoli di Missione approvati da Fabio.

## Limiti dichiarati della V1

- Il comando esegue la coda durevole della giornata nello stesso processo; la
  supervisione H24 con lease e worker separato resta un passaggio successivo.
- Il Developer Agent non modifica ancora il repository attraverso un tool gateway.
- Il Research Agent non acquisisce ancora URL reali; compila record già acquisiti.
- Non esiste ancora un comando di approvazione dell'intera giornata: il record si
  arresta in `AWAITING_FABIO` e i dossier/pacchetti mantengono i rispettivi confini di
  review già esistenti.

Questi limiti impediscono di chiamare la V1 una compagnia autonoma H24 completa, ma
non riducono i reparti implementati a manifesti: ciascuno completa un task locale
utile, durevole e misurato attraverso il runtime.
