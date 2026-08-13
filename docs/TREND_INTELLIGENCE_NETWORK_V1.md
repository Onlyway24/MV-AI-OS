# Trend Intelligence Network V1

## Scopo e invarianti

Trend Intelligence Network trasforma fonti ufficiali autorizzate in evidenze
tracciabili per ORACLE, senza trasformare MV-AI-OS in uno scraper o in un aggregatore
che simula connessioni. La rete estende `SourceRegistry`, Authorized Research, Social
Intelligence Live, Agent Company e Onlyway Station; non crea un secondo sistema di
verità.

Invarianti V1:

- boundary provider-neutral: agenti e UI non dipendono da SDK, payload o credenziali
  di uno specifico provider;
- HTTPS ufficiale, API documentata, export autorizzato o import manuale verificabile;
  scraping, automazione di login, elusione di rate limit e reverse engineering sono
  vietati;
- ogni fatto deriva da uno snapshot immutabile, con origine, timestamp, hash,
  freshness, limiti e diritti;
- catalogato non significa connesso; connesso non significa che esistano dati freschi;
- un trend è un segnale di attenzione, non prova di domanda, ricavo o idoneità
  commerciale;
- i provider a pagamento restano `PAID_PROVIDER_LOCKED`;
- retry automatici, fallback più costosi, pubblicazione e contatto esterno restano
  disabilitati;
- `publication: LOCKED` e `externalWrites: LOCKED` in ogni read model e ricevuta.

## Architettura provider-neutral

```text
Source Registry + policy
  → TrendSourceConnector
  → TrendTransport (fake o adapter ufficiale)
  → acquisizione limitata
  → snapshot immutabile + receipt
  → normalizzazione/deduplica
  → SocialTrendObservation / EvidenceRecord
  → consensus cross-source deterministico, senza score
  → Evidence Pack
  → Agent Company
  → Station / Social / Fabio
```

Il contratto eseguibile del connettore comprende:

- `sourceId` canonico derivato dal catalogo e binding esatto al Source Registry,
  territorio e categorie negli item, timeout e limiti per richiesta;
- `accessLevel`, `signalFamilies`, `providerRuntime`, `accessRequirement`,
  `licenseState`, `connectionDeclaration`, connector receipt e data state;
- `secretReference` opzionale, mai il valore del secret;
- timeout, item cap, costo massimo USD `0`, retry `0` e idempotency key;
- risultato normalizzato o errore tipizzato e redatto;
- receipt con fingerprint di richiesta e segnali, identificatori operazione e stato.

`TrendTransport` è l'unico punto che conosce il protocollo del provider. Il fake
transport deve riprodurre offline successi, risposte vuote, timeout, rate limit,
autenticazione negata, schema inatteso e identificatori provider. Normalizzatore,
consensus, operatori e UI consumano soltanto il contratto interno.

Il connector applica inoltre un timeout locale al boundary: un transport che non
settle non può bloccare indefinitamente la coda serializzata. Soltanto
`TrendTransportFailureError`, riservato al caso in cui l'adapter prova che nessun
dispatch provider è avvenuto, è definitivo. Timeout, reset di socket ed errori
ignoti dopo il dispatch restano `UNCERTAIN / RECONCILIATION_PENDING`, senza retry.

Ogni futuro adapter live di acquisizione web deve riusare il restricted HTTPS
client: solo HTTPS, host e path allowlisted dal Source Registry, DNS pubblico, MIME
e UTF-8 consentiti, redirect, dimensione e timeout limitati, nessuna credenziale in
URL. La V1 non dichiara implementati adapter live Trend.

## Livelli di accesso e stati separati

Il livello descrive il tipo di accesso, non qualità, affidabilità o importanza:

| Livello | Accesso ammesso |
| --- | --- |
| `L0` | osservazione o import manuale da pagina/report ufficiale; nessuna acquisizione automatica |
| `L1` | feed o API pubblica ufficiale, senza credenziale utente |
| `L2` | API ufficiale con API key, quota o developer registration |
| `L3` | API/account ristretto con OAuth, app review, developer token o ammissione esplicita |
| `L4` | API/dataset commerciale utilizzabile soltanto con licenza e cap contrattuale |
| `X` | accesso non verificato, vietato o incompatibile con policy; nessun connector |

Ogni fonte espone stati indipendenti:

| Asse | Stati minimi | Significato |
| --- | --- | --- |
| Source Registry | `AUTHORIZED`, `FORBIDDEN`, `NOT_REGISTERED`, `CONFLICT` | Policy applicata nel workspace e per l'actor |
| Provider runtime | `CONFIGURABLE`, `DISABLED` | Se la V1 possiede un boundary eseguibile oppure conserva soltanto il catalogo |
| Connection declaration | `NOT_CONFIGURED` nel catalogo | Dichiarazione statica, mai prova di connessione |
| Preflight | `BLOCKED` oppure `PREFLIGHT_READY`, più `executionEligible` | Risultato deterministico di registry, grants, SecretReference e transport |
| Connector/receipt | `NOT_CONFIGURED`, `READY`, `BLOCKED`, `DISABLED`, `RECONCILIATION_PENDING` | Stato derivato esclusivamente da receipt osservate |
| Data | `NOT_OBSERVED`, `FRESH`, `STALE`, `INVALID`, `RECONCILIATION_PENDING` | Stato delle osservazioni legate alla receipt |

`PREFLIGHT_READY` con `executionEligible: true` significa soltanto che una richiesta
read-only, zero-paid-call e retry `0` può essere tentata. Non è connection evidence e
non dimostra autenticazione, consumo di quota, risposta provider o acquisizione.
Non esiste un preflight `READY` e non viene esposto `connectionReady`. Soltanto una
receipt terminale `COMPLETED` o `RECONCILED`, legata ai fingerprint dei segnali, può
portare il connector a `READY` e il dato a `FRESH`; timeout o risposta senza prova
restano `RECONCILIATION_PENDING`.

La UI mostra Source Registry, provider runtime, connector/receipt e data come assi
separati. Una fonte `AUTHORIZED / CONFIGURABLE / NOT_CONFIGURED / NOT_OBSERVED` non
può apparire “connessa”; una fonte con receipt terminale ma dati scaduti non può
alimentare un Evidence Pack pronto.

## Famiglie di segnale

La famiglia dichiara che cosa il dato può ragionevolmente sostenere:

| Famiglia | Semantica ammessa | Inferenza vietata |
| --- | --- | --- |
| `ATTENTION_SIGNAL` | visibilità, conversazione, consumo o attività osservata | domanda, acquisto, ricavo o crescita commerciale |
| `SEARCH_INTENT` | interesse espresso tramite ricerca o keyword | volontà di pagare o conversione |
| `COMMERCE_INTENT` | attività pubblicitaria, marketplace o esplorazione commerciale | vendita, ROAS, marginalità o product-market fit |
| `MARKET_EVIDENCE` | evidenza attribuibile su ricerca, tecnologia, offerta o contesto di mercato | validazione cliente senza transazione o outcome interno |

La famiglia non è un punteggio di forza. Un record può avere una famiglia primaria e
una secondaria, ma il passaggio di famiglia richiede regola esplicita, provenienza e
corroborazione. Paid transaction, conversione e ricavo verificato restano evidenze
interne distinte.

## Matrice fonti 2026

La matrice elenca soltanto superfici ufficiali verificate. `Freshness` è il TTL
operativo massimo proposto, non una promessa del provider. Lo stato è espresso come
`Policy / providerRuntime / connectionDeclaration / Data`; lo stato connector e Data
effettivo deve sempre provenire da receipt e repository, non da questa matrice.

La prima onda V1 è limitata a Google Trends, GDELT, Wikimedia, arXiv e metadata
pubblici GitHub. `CONFIGURABLE` significa che il boundary provider-neutral può
superare un preflight; non significa connesso. Tutte le altre fonti, inclusa Hacker
News e inclusi gli import manuali, sono `DISABLED` e second-wave fino a verifier,
adapter, termini/licenze e test dedicati.

### Feed e API pubbliche

| Fonte ufficiale | Livello · famiglia | Stato iniziale | Uso, diritti e freshness |
| --- | --- | --- | --- |
| [Google Trends](https://developers.google.com/search/apis/trends) | `L1` per il feed pubblico esistente; `L3` per API Alpha · `ATTENTION_SIGNAL`, `SEARCH_INTENT` | RSS `NOT_REGISTERED / CONFIGURABLE / NOT_CONFIGURED / NOT_OBSERVED`; Alpha resta fuori dalla V1 finché l'accesso non è verificato | Indicatore relativo e campionato; non prova volume assoluto, domanda o acquisto. TTL 1 giorno |
| [GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) | `L1` · `ATTENTION_SIGNAL`, `MARKET_EVIDENCE` | `NOT_REGISTERED / CONFIGURABLE / NOT_CONFIGURED / NOT_OBSERVED` | Attenzione mediatica e contesto attribuibile; non domanda di mercato. Snapshot con query, finestra e limiti. TTL 1 giorno |
| [Wikimedia Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/) | `L1` · `ATTENTION_SIGNAL` | `NOT_REGISTERED / CONFIGURABLE / NOT_CONFIGURED / NOT_OBSERVED` | Pageview e attività aggregata secondo termini Wikimedia; non profilo utente o intento commerciale. TTL 1 giorno |
| [arXiv API](https://info.arxiv.org/help/api/index.html) | `L1` · `MARKET_EVIDENCE` | `NOT_REGISTERED / CONFIGURABLE / NOT_CONFIGURED / NOT_OBSERVED` | Metadati di ricerca e pubblicazioni; citare autori/origine, non trattare ricerca come adozione commerciale. TTL 7 giorni |
| [GitHub REST API](https://docs.github.com/en/rest) | `L1` per metadati pubblici · `ATTENTION_SIGNAL`, `MARKET_EVIDENCE` | `NOT_REGISTERED / CONFIGURABLE / NOT_CONFIGURED / NOT_OBSERVED`; autenticazione opzionale non appartiene alla prima onda | Solo metadati pubblici consentiti; stars, fork e activity non equivalgono a utenti, ricavi o qualità. TTL 1 giorno |
| [Hacker News API](https://github.com/HackerNews/API) | `L1` · `ATTENTION_SIGNAL`, `MARKET_EVIDENCE` | `NOT_REGISTERED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino a verifier termini e adapter dedicato. Item e ranking non provano domanda commerciale. TTL 1 giorno se abilitato |

### API con chiave, account o review

| Fonte ufficiale | Livello · famiglia | Stato iniziale | Uso, diritti e freshness |
| --- | --- | --- | --- |
| [YouTube Data API — videos.list](https://developers.google.com/youtube/v3/docs/videos/list) | `L2` · `ATTENTION_SIGNAL` | `AUTHORIZED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino ad adapter, quota verifier e `SecretReference`; metadati consentiti, mai download media. TTL 1 giorno |
| [Meta Ad Library API](https://www.facebook.com/ads/library/api/) | `L3` · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino ad app/access verifier; attività pubblicitaria non prova impression, ROAS o vendite. TTL 1 giorno |
| [Pinterest Trends API](https://developers.pinterest.com/docs/analytics-and-reports/trends/) | `L3` · `ATTENTION_SIGNAL`, `SEARCH_INTENT`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino ad access, retention e adapter verificati. Nessuna copia di Pin o asset. TTL 1 giorno |
| [TikTok Commercial Content API](https://developers.tiktok.com/doc/commercial-content-api-getting-started/) | `L3` · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino a eligibility, scope, terms verifier e adapter; non prova performance o diritti asset. TTL 1 giorno |
| [Google Ads — Generate Keyword Ideas](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas) | `L3` · `SEARCH_INTENT`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino ad account, token, OAuth, quota verifier e adapter. Le stime non equivalgono a conversione. TTL 7 giorni |
| [Product Hunt API v2](https://api.producthunt.com/v2/docs) | `L2` · `COMMERCE_INTENT`, `MARKET_EVIDENCE` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino a permesso, terms verifier e adapter; ranking e vote non sono domanda pagante. TTL 1 giorno |
| [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms) | `L3` · `ATTENTION_SIGNAL` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Nessun connector finché accesso, uso consentito, retention, deletion, quota, verifier e adapter non sono attestati; zero scraping. TTL 1 giorno se autorizzato |

### Osservazione o import ufficiale

| Fonte ufficiale | Livello · famiglia | Stato iniziale | Uso, diritti e freshness |
| --- | --- | --- | --- |
| [TikTok Creative Center](https://ads.tiktok.com/help/article/creative-center?lang=en) | `L0` · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `NOT_REGISTERED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino a import verifier e contratto dedicato; zero scraping. Non copiare video, identità o audio. TTL 1 giorno |
| [Pinterest Predicts 2026](https://business.pinterest.com/blog/pinterest-predicts-2026-turn-trends-into-unlimited-possibilities/) | `L0` · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `NOT_REGISTERED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino a import verifier. Report annuale, non telemetria real-time; nessuna copia asset |
| [Etsy Marketplace Insights](https://help.etsy.com/hc/en-us/articles/1404564905677) | `L3` manuale/account-scoped · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave fino a diritto account, import verifier e adapter; query marketplace non significa transazione. TTL 7 giorni |

### Provider commerciali

| Fonte ufficiale | Livello · famiglia | Stato iniziale | Condizione di sblocco |
| --- | --- | --- | --- |
| [WGSN Intelligence API](https://www.wgsn.com/en/what-we-do/intelligence-api) | `L4` · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave: licenza, dataset rights, retention, attribution, adapter e cap verificati |
| [Exploding Topics API](https://explodingtopics.com/feature/et-api) | `L4` · `SEARCH_INTENT`, `ATTENTION_SIGNAL` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave: piano API, storage, redistribuzione, quota, adapter e cap verificati |
| [Similarweb API](https://docs.similarweb.com/api-v5/integrations) | `L4` · `ATTENTION_SIGNAL`, `COMMERCE_INTENT` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave: licenza, metriche/territori, attribution, retention, adapter e hard cap verificati |
| Trendalytics | `L4` · `COMMERCE_INTENT`, `ATTENTION_SIGNAL` | `REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` | Second-wave: nessun connector finché documentazione ufficiale, licenza, API, diritti e prezzo non sono verificati |

### Fonti di guardrail e outcome

[TikTok Commercial Music Library](https://ads.tiktok.com/help/article/how-to-use-the-commercial-music-library)
resta una verifica diritti, non un trend: autorizzazione valida soltanto per regione,
account, placement e finestra osservata; `UNKNOWN` blocca produzione e distribuzione.
[Instagram Insights](https://www.facebook.com/help/684550305010470/) resta outcome
di account posseduto/autorizzato, non fonte di trend esterno: solo metriche esportate
o acquisite con scope verificati.

Fonti ulteriori non entrano nel catalogo operativo finché URL ufficiale, contratto di
accesso, licenza, quota, retention e costo non sono verificati. Restano
`REVIEW_REQUIRED / DISABLED / NOT_CONFIGURED / NOT_OBSERVED` o livello `X`.

## `TrendTransportItem`, `TrendSignal` e consensus

Il transport restituisce item provider-neutral, non payload raw. Ogni
`TrendTransportItem` contiene:

- identità e contesto: `externalId`, `topic`, `summary`, `tags`, `territory`,
  `observedAt` e gli opzionali `publishedAt` e `providerUpdatedAt`;
- semantica: `signalFamily`, `evidenceKind`, `rightsClass` e
  `attributionRequired`;
- `providerReference` obbligatoria, che identifica la risorsa ufficiale del
  provider;
- `evidenceReference` opzionale e separata. In V1 deve essere un URL HTTPS
  persistibile, senza credenziali, query o fragment, verso uno snapshot immutabile o
  Evidence Record approvato; non è un ID interno opaco. Non può essere inventata,
  derivata automaticamente dalla `providerReference` o usata per sovrascriverla;
- `metric` opzionale e strutturata con `name`, `value`, `unit`, `window` e
  `normalization` opzionale. Una metrica assente resta assente: non diventa zero e
  non viene stimata;
- `retentionExpiresAt` opzionale. Oltre tale istante il record non può alimentare
  nuovi pack o brief e deve seguire la retention policy applicabile.

`providerUpdatedAt` è il timestamp dichiarato dal provider, non `observedAt` e non
l'orario della receipt. `rightsClass` è uno fra `AGGREGATE`, `METADATA_ONLY`,
`LINK_ONLY` e `LICENSED`. La V1 conserva `attributionRequired` come obbligo e
valida soltanto la forma di `rightsClass`: non contiene ancora un verifier capace
di dimostrare licenza o adempimento dell'attribuzione. Un pack downstream con
`attributionRequired: true` deve quindi restare bloccato fino al Gate diritti
separato.

Il normalizzatore conserva questi campi nel `TrendSignal` e aggiunge `signalId`,
`signalFingerprint`, `sourceId` e `sourceKey`. Receipt e consensus lavorano sui
fingerprint; raw payload e secret non sono persistiti.

Il read model ammette nel consensus soltanto segnali il cui fingerprint compare
integralmente nell'ultima receipt terminale coerente della stessa fonte, actor,
workspace, request e transport. Osservazioni social legacy senza receipt restano
fuori dalla pipeline Trend; una receipt parziale o una fonte con runtime
`DISABLED` non può alimentare candidati.

Il consensus riverifica autonomamente il boundary canonico del Source Registry
contro il catalogo e rifiuta ogni fonte con provider runtime `DISABLED`. Le
osservazioni legacy propagano `expiresAt` in `retentionExpiresAt`: un dato scaduto
può restare visibile come `STALE`, ma non entra nei candidati.

Il consensus è deterministico e non produce uno score sintetico. Un topic è
`CORROBORATED` soltanto quando sono contemporaneamente presenti:

1. almeno **3 `sourceId` distinti**, tutti registrati e `AUTHORIZED` nel Source
   Registry, con categoria diversa da `FORBIDDEN`;
2. almeno **3 `signalFamily` distinte** tra `ATTENTION_SIGNAL`, `SEARCH_INTENT`,
   `COMMERCE_INTENT` e `MARKET_EVIDENCE`;
3. provenance, boundary URL, freshness e retention validi per ogni segnale
   considerato.

Il consensus non certifica diritti o attribuzione: trasporta `rightsClass` e
`attributionRequired` per la successiva review, che resta un Gate separato.

Tre record della stessa fonte valgono come un solo `sourceId`; più famiglie della
stessa fonte non sostituiscono il requisito sulle tre fonti. Se manca una
registrazione autorizzata, il consensus rifiuta il segnale con reason code preciso
e non crea il candidato; se una delle due cardinalità è sotto tre, lo stato è
`INSUFFICIENT_CORROBORATION`. L'ordinamento dei candidati è soltanto deterministico
e leggibile, mai presentato come probabilità, domanda o opportunity score.

## Celle operatori: APEX 17

I 17 agenti esistenti restano moduli a privilegi minimi. Non effettuano login, non
leggono secret raw e non si auto-assegnano connettori.

| Cella | Agente | Responsabilità Trend Intelligence |
| --- | --- | --- |
| Founder Command | NEXUS — `onlyway-assistant` | Compone missione, budget, dipendenze, Gate e decisioni Fabio |
| Signal Acquisition | ORACLE — `research-agent` | Acquisizione autorizzata, snapshot, corroborazione ed Evidence Pack |
| Signal Acquisition | ARCHIVE — `knowledge-curator` | Indice durevole, deduplica, provenance e storia delle decisioni |
| Signal Acquisition | CIPHER — `security-guardian` | Secret isolation, URL policy, redazione e assenza di effetti esterni |
| Opportunity Intelligence | VECTOR — `business-agent` | Converte segnali corroborati in ipotesi e confronti, non in certezze |
| Opportunity Intelligence | PULSE — `sales-agent` | Mappa pain, audience e obiezioni in bozze locali evidence-led |
| Opportunity Intelligence | LEDGER — `finance-cost-analyst` | Economics, quota, costo osservato e sostenibilità dell'esperimento |
| Creative Translation | PRISM — `content-director` | Direzione editoriale con fonti, diritti e limiti espliciti |
| Creative Translation | FORGE — `content-producer` | Pacchetto locale e varianti; provider media sotto gate separato |
| Experiment Delivery | BRIDGE — `customer-delivery-agent` | Piano di consegna, criteri di successo e feedback verificabile |
| Experiment Delivery | TITAN — `developer-agent` | Adapter, fake transport, contratti e change plan isolato |
| Experiment Delivery | LAUNCH — `publisher-agent` | Calendario e dry-run idempotente; nessuna pubblicazione |
| Guardian Ring | PRIME — `quality-guardian` | Completezza, leggibilità, evidenze e validità degli output |
| Guardian Ring | SENTINEL — `risk-guardian` | Blocca claim, extrapolazioni e azioni non controllate |
| Guardian Ring | SCALE — `cost-guardian` | Preflight, cap, hard stop e blocco dei fallback costosi |
| Guardian Ring | AEGIS — `legal-risk-reviewer` | Diritti, licenze, attribuzione, retention e assunzioni |
| Guardian Ring | VAULT — `backup-guardian` | Recuperabilità di snapshot, receipt, fingerprint e stato durevole |

## Workflow governato

1. **Evidence** — ORACLE acquisisce o importa da fonte autorizzata; ARCHIVE persiste
   snapshot immutabile, fingerprint, freshness, diritti e limitazioni.
2. **Signal** — osservazioni normalizzate vengono deduplicate e corroborate. Il
   classificatore conserva dati insufficienti, contraddizioni e `NOT_AVAILABLE`.
3. **Opportunity** — VECTOR confronta rilevanza, evidenze, saturation risk,
   economics e reversibilità. PULSE non può trasformare attenzione in domanda senza
   prova.
4. **Brief** — PRISM lega ogni claim a Evidence Pack e rights state; FORGE prepara
   soltanto artefatti locali.
5. **Experiment** — BRIDGE e TITAN definiscono ipotesi, una variabile primaria,
   metriche, cap, kill criteria e rollback. LAUNCH produce soltanto dry-run.
6. **Fabio** — il Centro Approvazioni mostra evidenze, costi, rischi e blocker.
   Solo Fabio può decidere; la decisione non implica pubblicazione.

Ogni passaggio può concludersi `READY`, `BLOCKED`, `PARTIAL` o
`AWAITING_FABIO`. Nessun agente colma input mancanti con dati simulati.

## Receipt, reconciliation, cost e redazione

Ogni tentativo di acquisizione, incluso quello bloccato prima del transport, produce
una receipt con:

- `actorId`, `workspaceId`, `clientRequestId`, idempotency key fingerprint,
  source, source key e transport ID;
- timestamp, retry count `0`, item count e fingerprint dei segnali;
- `operationId` locale e `providerRequestId`/`providerOperationId` soltanto quando
  restituiti dal provider, mai inventati;
- stato `BLOCKED`, `COMPLETED`, `FAILED`, `UNCERTAIN`, `RECONCILED` o `REPLAYED`;
- costo `NO_PAID_CALL` con USD `0` dopo esito definitivo, oppure
  `RECONCILIATION_PENDING` quando l'esito non è provato;
- reason code e stage normalizzati, fingerprint dei segnali e
  `externalEffectOccurred: false`, `externalWrites: LOCKED` e
  `publication: LOCKED`.

Una receipt `REPLAYED` vale come prova di esecuzione soltanto quando è legata a una
receipt `COMPLETED` o `RECONCILED` coerente. Il replay di un risultato vuoto può
mantenere il connector receipt-backed, ma non crea dati e lascia `Data:
NOT_OBSERVED`.

Un timeout o una risposta incompleta resta `UNCERTAIN /
RECONCILIATION_PENDING` finché una ricevuta provider verificabile non prova esito e
costo. Non si dichiara costo zero o fallimento definitivo per assenza di risposta.
Se manca un `providerOperationId`, la reconciliation non inventa un lookup possibile:
restituisce la stessa receipt pending. Un tentativo di reconciliation già pending è
idempotente e non può produrre una seconda chiamata automatica. Anche un errore
definitivamente pre-dispatch della sola reconciliation lascia pending l'operazione
originaria.

Log, errori e receipt escludono secret, token, cookie, authorization header,
credenziali in query, payload personali non necessari e contenuto raw non
indispensabile. Identificatori sensibili possono essere fingerprintati. Errori
provider sono mappati agli stage implementati: preflight, idempotency, transport,
validazione locale e reconciliation. Autenticazione, autorizzazione, richiesta non
valida, rate limit e indisponibilità provider hanno reason code distinti.
Il read model accetta soltanto la matrice coerente fra reason code, status, stage,
status code e link di replay/reconciliation; receipt impossibili o
cronologicamente anteriori al parent sono rifiutate.

La V1 non contiene un transport a pagamento: `maxCostUsd` deve essere esattamente
zero, il preflight dichiara paid calls disabilitate e ogni receipt terminale usa
`NO_PAID_CALL`. Catalogo prezzi, reservation ledger e cap di una futura fonte a
pagamento dovranno essere aggiunti e testati prima di abilitarla; fino ad allora
nessuna chiamata è ammessa.

La persistenza durevole dei `TrendConnectorReceipt` e dei `TrendSignal` non è
ancora implementata. Per questo il Command Center passa oggi `receipts: []`: i
quattro percorsi configurabili GDELT, Wikimedia, arXiv e GitHub restano contratti
e fake transport verificati, non adapter live né dati `FRESH`.

## Unico checkpoint Fabio

Il lavoro offline deve arrivare completo al checkpoint. La richiesta a Fabio è una
sola checklist, senza password o valori segreti:

1. approvare Source Registry, territori, lingue, categorie, frequenza e retention per
   Google Trends, GDELT, Wikimedia, arXiv e metadata pubblici GitHub;
2. confermare termini pubblici, attribuzione e diritto dell'organizzazione a usare e
   conservare gli snapshot della prima onda;
3. approvare query scope, timeout, item cap, cadence e zero-paid-call hard stop per
   ciascuna delle cinque capacità configurabili; il transport ufficiale resta da
   collegare e verificare separatamente dove non è già presente;
4. confermare actor/workspace attesi per il binding delle receipt.

La V1 non richiede a Fabio chiavi YouTube, OAuth social, export manuali o licenze
enterprise: tali fonti restano `DISABLED` e nessuna azione Fabio è richiesta per la
second wave in questo checkpoint. Fino a una receipt terminale ogni connector resta
`NOT_CONFIGURED`; questo unico checkpoint non autorizza pubblicazione, generazione
media, outreach o spesa.

## Proiezione nel Command Center

**Onlyway Station / Signal Observatory** mostra una flight deck con pipeline, sei
celle operative, massimo tre candidati e stato aggregato di policy, capability,
connector, data e publication. Capacità agente e lavoro osservato restano separati:
un agente catalogato non viene presentato come attivo.

**Social** mostra il catalogo dettagliato delle venti fonti con accesso, capability,
policy, connector, data, ultima receipt redatta e limitazione d'uso. Continua inoltre
a mostrare i record Social Intelligence già persistiti; il catalogo non avvia
acquisizioni live o produzione.

**Centro Approvazioni** non riceve ancora un pacchetto Trend Intelligence: manca una
repository durevole per receipt/segnali e la materializzazione Evidence Pack. Fino a
quel collegamento lo snapshot server passa intenzionalmente `receipts: []`, perciò
nessuna registrazione o osservazione legacy può apparire `RECEIPT_BACKED` o `FRESH`.
SSE reconnect, reload o cambio route non duplicano record né inventano progresso.

## Test e criteri di accettazione

La V1 è accettabile quando test offline dimostrano:

- catalogo deterministico con esattamente cinque runtime `CONFIGURABLE`; tutte le
  fonti auth, manuali, enterprise e Hacker News restano `DISABLED`;
- source ID/URL univoci, Source Registry binding e conflitti fail-closed;
- Source Registry, provider runtime, preflight, connector/receipt e data indipendenti
  in dominio, query e UI;
- `PREFLIGHT_READY`/`executionEligible` senza alcun claim di connessione o receipt e
  senza proprietà `connectionReady`;
- fake transport per success, empty, malformed, auth/permission, rate limit, timeout
  e risposta incerta, con timeout locale realmente imposto, coda rilasciata e retry
  automatici pari a zero;
- restricted HTTPS contro host/path non autorizzati, DNS privato, redirect, secret in
  URL, MIME, charset, byte cap e timeout;
- validazione completa di `TrendTransportItem` e `TrendSignal`, incluse family,
  rights, attribution, reference separate, metrica opzionale e retention;
- normalizzazione, deduplica, idempotenza, replay e fingerprint stabili;
- consensus solo con almeno tre `sourceId` autorizzati e tre `signalFamily`, senza
  score sintetico, con runtime catalogo abilitato e doppio boundary
  catalogo/Source Registry;
- freshness/expiry/retention e metrica assente distinta da zero nel contratto;
- receipt complete e reconciliation `UNCERTAIN` fail-closed;
- redazione di secret, token, cookie, header, payload e errori;
- nessuna SDK/provider type oltre il transport adapter;
- UI senza stato fittizio, duplicati SSE, overflow mobile o perdita di focus;
- publication ed external writes bloccati in core, query e UI;
- provider calls pagate `0`, external effects `0`, social posts `0` e
  `publication: LOCKED`.

Test live e browser authorization non fanno parte della suite automatica. Il
checkpoint non li autorizza implicitamente: richiedono una successiva istruzione
esplicita, cap dichiarato, sessione monouso e receipt riconciliabile.
