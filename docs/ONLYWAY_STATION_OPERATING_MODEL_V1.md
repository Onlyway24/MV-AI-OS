# Onlyway Station Operating Model V1

**Stato:** `DESIGN_CONTRACT`
**Autorità operativa:** Fabio
**Effetti esterni:** `LOCKED`
**Fonte di verità:** contratti, read model e receipt del repository; mai il transcript

## Scopo

Il transcript propone una metafora spaziale efficace: un sistema di agenti diventa
comprensibile quando ricerca, produzione, costi, distribuzione, memoria e recovery
sono rappresentati come ambienti con uno scopo preciso.

Onlyway trasferisce questa grammatica, non il modello etico o commerciale descritto.
Le “stanze” sono proiezioni narrative dei sistemi reali già esistenti: non introducono
un secondo runtime, non duplicano SQLite, non concedono permessi e non attestano
attività, ricavi o account connessi.

## Principi trasferibili

1. Un solo comando visibile, con specialisti organizzati come reparti.
2. Ricerca prima della produzione e produzione prima della distribuzione.
3. Portfolio di opportunità comparabili, non una singola idea non verificata.
4. Costi, blocker, dipendenze e decisioni visibili nello stesso spazio.
5. Pubblicazione separata dalla creazione.
6. Recovery e pivot basati su osservazioni reali e criteri predefiniti.
7. Memoria con provenance e outcome, non contesto disperso.
8. Una metafora visiva memorabile che resta leggibile, accessibile e operativa.

## Comportamenti rifiutati

Onlyway non adotta né rappresenta:

- coercizione, schiavitù, minion, minacce o lavoro infinito degli agenti;
- nomi, personaggi, ambienti, scene o identità di terzi, incluso `Ultron`;
- copia di design, prodotti o asset concorrenti con variazioni cosmetiche;
- offerte fondate sull'ignoranza del cliente o comunicazione ingannevole;
- affiliate “shilling”, claim economici o risultati non dimostrati;
- ricavi, profitti, store, clienti, messaggi o attività simulati;
- accesso generale a email, social, marketplace o account personali;
- pubblicazione, invio, acquisto, spesa, deploy o pivot automatici;
- memoria illimitata di conversazioni raw o dati privati;
- animazioni che sembrano telemetria operativa senza eventi durevoli.

I competitor possono fornire evidenza di categoria, pattern e gap. Restano obbligatori
`whatToLearn`, `whatNotToCopy`, provenance, diritti, privacy e
`competitorOutputPolicy: BLOCKED`.

## Le nove stanze

Le route indicate sono quelle esistenti del Centro di Comando. Una stanza deve
riutilizzarle tramite focus e deep link; non giustifica una nuova pagina.

| Stanza | Scopo operativo | Sistemi e responsabili | Route esistenti | Verità e Gate principali |
| --- | --- | --- | --- | --- |
| **Founder Bridge** | Convertire l'obiettivo di Fabio in missione, dipendenze e prossima decisione | Onlyway Assistant / NEXUS, Daily Brief, Founder Workday, Agent Company, Guardian summary | `#today`, `#agents` | Solo task, decisioni ed eventi durevoli; Founder Input, Mission Quality e Fabio Gate |
| **Signal Observatory** | Acquisire e corroborare evidenze autorizzate; identificare problemi e gap originali | Research Agent / ORACLE, Knowledge Curator / ARCHIVE, Authorized Research, Evidence Plane, Social Intelligence | `#evidence`, `#social` | Source Registry, freshness, corroborazione, rights/privacy; un segnale non prova domanda |
| **Venture Foundry** | Trasformare evidenze in Opportunity, Thesis, economics ed esperimenti reversibili | Business / VECTOR, Finance / LEDGER, Legal-Risk / AEGIS, Sales / PULSE, Delivery / BRIDGE, Venture OS, Revenue OS | `#venture`, `#business` | Score deterministici, input economici espliciti, Real Observation e Fabio Gate |
| **Media Forge** | Produrre pacchetti originali e versionati coerenti con evidenze e brand | Content Director / PRISM, Content Producer / FORGE, ORACLE Composer, Reference Vault, Media Factory | `#production`, `#vault` | Evidence, rights, Quality, Risk, Cost, Visual e Fabio Gate; nessun asset competitor in output |
| **Relationship Desk** | Preparare comunicazioni e handoff cliente senza inviarli | Sales / PULSE, Delivery / BRIDGE, Onlyway Assistant, Telegram operator boundary, futuri connector provider-neutral | `#business`, `#social` | Account esatto, scope minimo, privacy e approvazione umana; oggi non esiste un inbox email/marketplace operativo |
| **Capital Chamber** | Rendere leggibili budget, economics, capitale e riconciliazione | Finance / LEDGER, Cost Guardian / SCALE, cost ledger, Revenue economics, Capital Board | `#business`, `#system` | Estimated, reserved, measured e reconciled restano distinti; valori mancanti non diventano zero |
| **Distribution Airlock** | Preparare una consegna esterna esatta e controllabile | Publisher / LAUNCH, Content Governance, Official Social Connectors, Approval Center | `#approvals`, `#production`, `#social` | Versione, fingerprint, account, idempotenza, Visual Gate, Fabio, kill switch ed External Action Gate |
| **Experiment & Recovery Room** | Esaminare blocker, incidenti ed esperimenti e proporre continue/pivot/kill/scale | Incident, Quality / PRIME, Risk / SENTINEL, Business / VECTOR, Finance / LEDGER, H24 Runtime | `#venture`, `#system` | Soglie definite prima del test, osservazioni reali e decisione Fabio; nessun pivot autonomo |
| **Intelligence Vault** | Conservare riferimenti, decisioni e apprendimento con provenance e retention | Knowledge Curator / ARCHIVE, Creative & Business Intelligence Vault, Decision Memory, Business Context | `#vault` | Rights, privacy, purpose, freshness, retention, actor/workspace e autorità Fabio |

Quality, Risk, Cost, Security e Backup costituiscono il **Guardian Ring**
trasversale. Il Centro Approvazioni resta la camera decisionale di Fabio, non una
stanza autonoma che concede autorità agli agenti.

## Opportunity lanes

Le lane sono template di Venture candidate. Sono sempre `PROPOSAL_ONLY`,
`INTERNAL_PACKAGE_ONLY` ed `EXTERNAL_ACTION_LOCKED` finché non superano l'intero
percorso di evidenza e autorizzazione.

1. **Original Commerce** — prodotti fisici o print-on-demand basati esclusivamente su
   asset originali o autorizzati; fee, produzione, resi e delivery devono essere reali.
2. **Transparent Creative Services** — thumbnail, content pack e design venduti per
   direzione, qualità, tempi, revisioni, licenza e accountability dichiarate.
3. **Licensed Digital Assets** — template, game asset e kit visuali con provenance,
   manifest di licenza, allowed use e controllo IP.
4. **Evidence-led Editorial & Affiliate** — contenuti con disclosure della
   commissione, fonti verificabili e separazione tra opinione, prova e claim.
5. **Software Experiments** — prototipi interni dopo customer discovery e acceptance
   criteria; nessun deploy o accesso cliente implicito.
6. **Rights-cleared Media** — immagini, video, audio e musica con origine, licenza,
   provider terms, fingerprint e compatibilità di canale verificate.

Etsy, Fiverr e altri marketplace sono possibili canali da valutare, non store attivi.
Servono connettore dedicato, policy della piattaforma, account binding,
SecretReference, fake transport, idempotenza, receipt e autorizzazione separata.

## Truth e coverage rules

- `NOT_AVAILABLE` significa dato assente o non verificato; non significa `0`.
- Fixture, demo e test non sono clienti, domanda, vendite o risultati commerciali.
- Un agente è `RUNNING` o `COMPLETED` soltanto con stato e receipt durevoli.
- Un'azione esterna esiste soltanto con receipt del relativo Action Gateway.
- `LIMIT_REACHED` o `INCOMPLETE_COVERAGE` non possono essere mostrati come totale.
- Revenue deve distinguere almeno booked, invoiced, collected, refunded e recognized.
- Costi stimati, riservati, effettivi e da riconciliare non sono intercambiabili.
- Un'osservazione competitor non trasferisce copyright, licenza o prova di domanda.
- Un'approvazione interna non autorizza pubblicazione, invio, spesa o deploy.
- Animazione atmosferica è ammessa; progresso, traffico, lavoro e ricavo decorativi no.

## Gate chain

```text
G0 Founder Input
→ G1 Evidence, Rights & Privacy
→ G2 Economics & Delivery Capacity
→ G3 Offer Integrity & Customer Honesty
→ G4 Quality, Risk, Cost, Security & Backup
→ G5 Fabio Review su versione e fingerprint esatti
→ G6 External Action separata, bounded e corrente
```

Un fallimento produce `BLOCKED` con reason code, owner, evidenza, input mancante,
remediation e prossima azione. Non viene sostituito da copy motivazionale o da uno
stato positivo generico.

## Blocker reali della baseline

- Nessuna fonte di mercato reale è stata importata nel database operativo.
- Una Giornata Onlyway reale richiede tre Evidence Pack distinti, freschi e
  sostanziali e una Business Mission valida.
- Venture #001 resta `AWAITING_FABIO` / `EVIDENCE_INSUFFICIENT`.
- I valori economici reali del Revenue OS restano `NOT_AVAILABLE`.
- L'acceptance Agent Company con fixture non è un risultato commerciale; il Backup
  Guardian resta `BLOCKED` con `BACKUP_RESTORE_RECEIPT_REQUIRED`.
- Il runtime H24 è implementato ma non viene installato o avviato implicitamente.
- I social connector V1 verificano connessione e stato; messaggi, scheduling e
  pubblicazione restano indisponibili.
- Non esistono connector operativi per email, Etsy, Fiverr o altri marketplace.
- `PUBLICATION_LOCKED` ed `EXTERNAL_ACTION_LOCKED` restano invarianti globali.

## Maintenance contract

1. Il catalogo TypeScript operativo resta la fonte autorevole per agenti, task,
   permessi e Gate; questo documento non crea capacità.
2. Ogni stanza deve dichiarare owner, read model, comandi allowlisted, coverage,
   empty state, Gate, blocker ed external-effect policy.
3. Una nuova route è ammessa solo quando le route esistenti non possono ospitare il
   flusso senza perdita di chiarezza.
4. Ogni valore UI deve conservare stato, fonte, freshness e coverage del read model.
5. Motion e SSE devono avere cleanup, reconnect idempotente, reduced-motion e
   kill-switch fail-closed.
6. Ogni nuova opportunity lane richiede test offline, policy IP/privacy, economics,
   delivery e assenza di effetti esterni.
7. Ogni connettore richiede boundary provider-neutral, fake transport, SecretReference,
   scope minimo, redazione, idempotenza, reconciliation e autorizzazione Fabio.
8. I test devono impedire fake revenue, fake agent activity, plagio, account access
   e auto-publishing.
9. Questo contratto va aggiornato soltanto quando cambiano realmente route, read
   model, agent catalog, Gate o capacità esterne.
