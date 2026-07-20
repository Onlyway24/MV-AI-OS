# Onlyway Creative & Business Intelligence Vault V1

## Scopo

Il Vault è l'aggregate autorevole con cui Fabio può fornire riferimenti creativi,
decisioni e contesto commerciale alla Agent Company. Non sostituisce Memory,
Knowledge, Evidence Plane o Brand Asset Registry: conserva originali e provenance,
mentre gli altri piani continuano a gestire rispettivamente memoria operativa,
conoscenza, evidenze fattuali e asset brand ufficiali.

Il Vault non genera immagini, non acquisisce cartelle automaticamente, non chiama
provider e non pubblica. L'inserimento avviene soltanto tramite preview e comando
esplicito bounded.

## Architettura

```text
Fabio Input Pack
  → preview validata (byte, SHA-256, MIME, metadata, freshness, diritti)
  → ReferenceVaultCommandBoundary (actor + workspace + idempotenza)
  → SQLite transaction + private content-addressed storage
  → record append-only + receipt + audit redatto
  → review/versione esplicita di Fabio
  → ReferenceVaultQueryAgent (sola lettura, fail-closed)
  → Agent Company / Intelligence Creativa
```

Gli originali sono identificati dal loro SHA-256 e conservati come contenuto
immutabile durante la retention autorizzata. I record di dominio hanno inoltre un fingerprint canonico distinto, che
lega contratto, versione e metadati validati. Una revisione non modifica la versione
precedente: crea una nuova versione. Receipt, audit e transizione restano nella stessa
transazione dell'operazione.

Alla scadenza della retention i byte non vengono rimossi automaticamente. Solo
l'authority Fabio configurata può invocare `PURGE_EXPIRED_REFERENCE_CONTENT` con
versione e fingerprint esatti: la stessa transazione crea una versione `EXPIRED`,
conserva un tombstone fingerprinted e rimuove il BLOB. Un trigger SQLite vieta la
cancellazione del CAS senza tombstone; metadata e provenance restano immutabili.

## Contratti e limiti

I contratti V1 sono strict, bounded, JSON-safe, versioned e fingerprinted. I ruoli
ammessi sono quelli esportati da `REFERENCE_ROLES`; valori aggiuntivi o typo vengono
rifiutati. Un batch contiene al massimo 25 candidati; ogni originale dichiarato è
limitato a 50 MiB e la richiesta serializzata è bounded.
La quota complessiva per actor/workspace è 512 MiB e 1.000 BLOB; le immagini sono
limitate a 16.384 px per lato e 100 milioni di pixel.

L'import verifica:

- base64 canonico, byte length e SHA-256 dichiarati;
- MIME supportato e firma dei byte, senza fidarsi della sola estensione;
- filename come metadata, mai come storage path;
- URL canoniche HTTPS prive di credenziali, query e fragment; source identity,
  freshness, expiry e scope dei diritti;
- evidenza e data di verifica per ogni dichiarazione `OWNED` o `AUTHORIZED`;
- stato privacy, classi di dati, finalità, consenso/release e scadenza di
  conservazione;
- duplicati nello stesso batch e nel medesimo actor/workspace;
- forma e fingerprint dell'intero input prima di aprire la transazione.

Il set di decoder V1 è deliberatamente ristretto: sono ammessi JSON UTF-8 valido,
testo UTF-8 privo di controlli binari e PNG 8-bit non interlacciato nei color type
grayscale, RGB, grayscale-alpha o RGBA. Per il PNG il boundary verifica firma,
ordine e allowlist dei chunk, CRC, dimensioni bounded, stream IDAT zlib, lunghezza
esatta del raster e filter byte di ogni scanline; byte aggiunti dopo `IEND` sono
rifiutati. JPEG, GIF e PDF sono bloccati con
`REFERENCE_FORMAT_DECODER_UNAVAILABLE_V1` finché non esiste un decoder locale
completo e bounded. Un PNG non decodificabile usa
`REFERENCE_BINARY_VALIDATION_FAILED`. Questa limitazione è un gate di ammissione,
non una conversione automatica e non modifica gli originali nel Brand Asset
Registry.

Il Vault non scandisce `assets/reference-vault/incoming/`: quelle cartelle sono un
Input Pack umano, non una fonte automatica. Path traversal, symlink e file speciali
non entrano nel protocollo di importazione perché il command boundary riceve byte e
metadata, non un percorso controllato dall'utente.

## Diritti, privacy e competitor

`UNKNOWN`, `BLOCKED`, scadenze invalide e metadata contraddittori falliscono chiusi.
`FABIO_SUPPLIED` è soltanto provenienza: richiede `allowedUse: []`, non dimostra
copyright, licenza, consenso o proprietà e non può essere approvato, letto dagli
agenti o usato in output. Per rendere eleggibile una versione servono diritti
`OWNED` oppure `AUTHORIZED`, entrambi con `evidenceReference`, SHA-256
`evidenceFingerprint`, `verifiedBy` riconciliato con l'authority Fabio, `verifiedAt`,
`allowedUse` non vuoto e contenente esattamente il purpose richiesto, oltre a uno
scope coerente con la piattaforma richiesta.

`PUBLIC_ANALYSIS_ONLY` non autorizza la copia o la conservazione del binario
competitor. Materiale competitor entra nel private CAS soltanto con autorizzazione
documentata alla conservazione e resta sempre escluso da output e campioni positivi
del Creative Fingerprint. Una URL pubblica è provenance, non una licenza; URL con
credenziali, query o fragment sono rifiutate.

Ogni asset dichiara una policy privacy fail-closed: stato, classi dati, purpose,
consenso, release, verifica e `retentionExpiresAt`. `CLEARED` senza dati personali
richiede attestazioni `NOT_APPLICABLE` fingerprinted per consenso e release;
`CLEARED` con dati richiede entrambe le evidenze `PROVIDED`. `NOT_VERIFIED`,
`REVIEW_REQUIRED`, retention scaduta o purpose incompatibile impediscono approval e
lettura. Dopo la scadenza, l'authority Fabio può eliminare i soli byte tramite il
comando di purge controllato; non esiste garbage collection automatica. Gli elementi con persone, dati personali o identificatori devono essere
redatti e autorizzati prima dell'importazione. Audit e receipt conservano soltanto
ID, reason code e fingerprint allowlisted: mai contenuto raw, base64, path locale,
prompt, token o secret.

Le operazioni di import persistente, review, approval, rifiuto, Decision Memory,
Creative Fingerprint e purge sono consentite soltanto con una
`referenceVaultApprovalAuthority` locale ed
esplicita: `authorityId`, workspace, contract version, scope dedicato e
`confirmedByFabio: true`. Il runtime non la deriva mai dall'actor corrente; se la
capability manca o non coincide, queste operazioni falliscono chiuse. Il runtime
locale espone l'adapter validato senza aggiungere controlli mutanti al browser.

## Creative Fingerprint e Decision Memory

Il Visual Fingerprint espone dodici dimensioni: realism, lighting, contrast, depth,
object density, focal hierarchy, luxury level, text density, color usage,
composition, negative space e forbidden elements. Il Writing Fingerprint espone
title length, sentence length, vocabulary, directness, urgency, practical density,
guru risk, CTA style, evidence language e forbidden expressions.

Il fingerprint si aggiorna soltanto da decisioni esplicite di Fabio e da reference
version esatte. La confidence è deterministica: `NONE` senza campioni, `LOW` con
1–2, `MEDIUM` con 3–5 e `HIGH` da 6 campioni. Questo valore descrive la quantità di
decisioni compatibili, non certifica che il sistema rappresenti perfettamente il
gusto di Fabio.

Decision Memory conserva asset e package con versione/fingerprint esatti, decisione,
motivazione strutturata, elemento interessato, regola riutilizzabile, confidence,
scope, scadenza, revisione risultante, obiettivo, audience e collegamenti. Include
anche `REQUEST_REVISION`: il lavoro originale resta immutabile e revisioni/outcome
vengono collegati senza riscrivere la storia.

## Business Context

Il contesto commerciale contiene sedici dimensioni: vincoli del founder, obiettivi
di ricavo, budget, tempo disponibile, tolleranza al rischio, audience, offerte,
pricing, capacità di delivery, canali, asset correnti, esclusioni commerciali,
metriche di successo, unit economics, customer journey ed esperimenti attivi.

Ogni dimensione è indipendentemente `AVAILABLE` con reference evidence oppure
`NOT_AVAILABLE`. Nessun valore economico viene stimato per riempire un campo vuoto.

## Agent Company

Onlyway Assistant, Research Agent, Business Agent, Content Director, Content
Producer, Sales Agent, Knowledge Curator, Customer Delivery Agent, Quality Guardian
e Risk Guardian hanno un reader di sola lettura con role allowlist distinta. Il
reader restituisce solo la versione corrente, `APPROVED`, nello stesso actor/workspace,
non scaduta, privacy-cleared e con diritti, purpose e piattaforma validi. Ogni
workday consulta un brief distinto per ciascuna piattaforma richiesta; nel contesto
condiviso entra soltanto l'intersezione identica e idonea a tutte le piattaforme,
così un riferimento solo Instagram non può guidare un output anche TikTok. Ogni
output reference-aware include `referenceIdsUsed`, gli `assetId/version/fingerprint`
immutabili disponibili e usati, e il fingerprint del brief consultato; quando non esistono
riferimenti idonei espone una lista vuota e `NOT_AVAILABLE`.

Gli agenti non possono modificare diritti, ownership, review o fingerprint. Il loro
output non è una prova di licenza.

## Centro di Comando

`Studio → Intelligence Creativa` proietta un read model redatto: gallery metadata,
versioni, confronto approvato/rifiutato, sequenze carosello ordinate, review, rights
blocker, Visual/Writing Fingerprint, Business Context, Decision Memory, Outcome Link
e input mancanti. Nessun byte o path privato viene servito. Filtri, selezione e
disclosure sono non mutanti; non esistono pulsanti di import o approvazione senza
operazione durevole.

## Fabio Input Pack

La guida operativa, le dieci cartelle, il template CSV, l'esempio JSON, la checklist
privacy/diritti/retention e la checklist dei primi 60 slot sono in
`assets/reference-vault/`. Gli slot non rappresentano asset esistenti e restano
vuoti quando fonte, diritti, privacy o obiettivo non sono disponibili.

Le categorie richieste a Fabio sono:

- lavori propri approvati e rifiutati, con ragione;
- cover e caroselli competitor solo quando analisi e conservazione sono entrambe
  autorizzate e documentate; in caso contrario lo slot resta vuoto;
- fotografia e typography con origine verificabile;
- prodotti, offerte e pricing realmente disponibili;
- analytics redatte, con periodo e definizione della metrica;
- linguaggio audience anonimizzato e non ricostruibile.

## Limiti V1

- runtime locale single-user; i permessi filesystem proteggono SQLite, ma non
  equivalgono a cifratura at-rest;
- nessun preview binario o asset serving dal browser;
- il duplicate gate autorevole è SHA-256; un perceptual duplicate marker resta
  `NOT_AVAILABLE` finché non esiste un decoder locale bounded e verificato;
- JPEG, GIF e PDF restano non importabili in V1; il riconoscimento della firma non
  viene presentato come validazione del payload;
- nessuna ingestione di URL o scraping: una URL è provenance, non autorizzazione;
- nessun placeholder dei template è un riferimento reale o può superare la
  validazione: deve essere sostituito con evidenza verificata prima del comando;
- nessuna generazione, paid API, pubblicazione, scheduling, upload o deploy;
- il Content Blueprint V1 è non esecutivo e richiede evidenze, gate e decisione Fabio
  prima di qualunque produzione.
