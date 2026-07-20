# Reference Vault Metodo Veloce

Il Reference Vault raccoglie materiali che Fabio può usare per spiegare una direzione
creativa, un contesto commerciale o un criterio di qualità. È un archivio di
riferimenti, non una libreria di asset finali e non è un sistema di pubblicazione.

Le cartelle `incoming/` sono intenzionalmente vuote. Un file entra nel Vault solo
dopo registrazione dei metadati, calcolo SHA-256 e controllo fail-closed di diritti,
privacy, consenso e retention. La presenza di un file in queste cartelle non
equivale ad approvazione, proprietà o autorizzazione d'uso.

## Cartelle

| Cartella | Contenuto ammesso | Limite principale |
| --- | --- | --- |
| `incoming/own-approved/` | Materiali propri approvati come riferimento da Fabio | L'approvazione vale come riferimento, non come asset finale |
| `incoming/own-rejected/` | Materiali propri rifiutati, utili per descrivere cosa evitare | Non riutilizzare elementi rifiutati nel risultato finale |
| `incoming/competitor-covers/` | Cover competitor con analisi e conservazione documentate | Senza autorizzazione alla retention lo slot resta vuoto; mai output o prova di performance |
| `incoming/competitor-carousels/` | Caroselli competitor con analisi e conservazione documentate | Senza autorizzazione alla retention non copiare il binario; mai riuso in output |
| `incoming/photography/` | Riferimenti fotografici con provenienza e diritti chiari | Volti, luoghi e metadati richiedono verifica privacy |
| `incoming/typography/` | Esempi di gerarchia tipografica | Il file non concede licenze sui font mostrati |
| `incoming/products/` | Prodotti propri o riferimenti prodotto autorizzati | Nessuna disponibilità, prezzo o autenticità è implicita |
| `incoming/offers/` | Offerte proprie o strutture autorizzate | Prezzi, risultati e condizioni devono avere evidenza separata |
| `incoming/analytics/` | Export o schermate redatte e autorizzate | Vietati token, ID privati, email e dati personali grezzi |
| `incoming/audience-language/` | Linguaggio anonimizzato del pubblico | Vietati DM, nomi, handle e citazioni identificabili senza consenso |

## Flusso minimo di importazione

1. Copia temporaneamente l'originale nella cartella corretta soltanto dopo avere
   verificato che la policy ne autorizzi la conservazione. Per competitor privi di
   autorizzazione documentata alla retention non copiare il file e lascia lo slot
   vuoto. Il contenuto di `incoming/` è ignorato da Git per impostazione predefinita.
2. Compila una riga di `metadata-template.csv`; gli array usano valori separati da
   `|`, le celle non note restano `NOT_AVAILABLE` e non vengono sostituite da stime.
3. Calcola il fingerprint dei byte originali con `shasum -a 256 <file>`.
4. Completa `privacy-and-rights-checklist.md`, inclusi consenso/release e
   `retentionExpiresAt`.
5. Registra fonte, business context, purpose, piattaforma e ruolo del riferimento.
6. La commit atomica registra byte e metadata in private CAS con stato `IMPORTED` e
   approval `PENDING`; soltanto una successiva decisione di Fabio crea `APPROVED`,
   `REJECTED`, `PENDING_FABIO_REVIEW` oppure `RIGHTS_BLOCKED`.
7. Se cambiano i byte, registra una nuova versione e un nuovo SHA-256. Non
   sovrascrivere silenziosamente il record precedente.

`import-example.json` mostra la forma di `ReferenceImportRequest` usando il derivato
tecnico PNG fedele del logo già presente nel repository. L'originale JPEG resta nel
Brand Asset Registry e non viene dichiarato importabile dal Vault V1 finché manca un
decoder JPEG locale completo e bounded. L'esempio è intenzionalmente non eseguibile: contiene
marcatori espliciti e diritti `FABIO_SUPPLIED` con `allowedUse: []`. Il local adapter
deve sostituire meccanicamente ogni marcatore con dati verificati e una nuova versione
può diventare eleggibile solo con diritti `OWNED` o `AUTHORIZED` documentati. Un
marcatore `REPLACE_*` o `NOT_AVAILABLE` non è mai un reference reale e deve far
fallire la validazione, non essere conservato come valore.

Il boundary V1 ammette soltanto PNG decodificati e verificati localmente, JSON UTF-8
valido e testo UTF-8 privo di controlli binari. JPEG, GIF e PDF falliscono chiusi con
`REFERENCE_FORMAT_DECODER_UNAVAILABLE_V1`; un PNG malformato o non decodificabile
fallisce con `REFERENCE_BINARY_VALIDATION_FAILED`. Non convertire automaticamente
gli originali e non cambiare formato per aggirare il gate.

L'adapter reale è esposto dal runtime locale come
`executeReferenceVaultCommand(...)`: applica lo stesso boundary validato,
idempotente e actor/workspace-bound usato dai test di accettazione. Non passare il
contenuto base64 nella command line o nei log; un adapter owner-only deve leggere il
file localmente, costruire il comando in memoria e conservare soltanto la receipt
redatta.

## Reference asset e final asset

Un **reference asset** serve a descrivere una caratteristica: palette, gerarchia,
inquadratura, densità, ritmo, tono, struttura dell'offerta o anti-pattern. Non può
essere pubblicato, consegnato o incorporato automaticamente.

Un **final asset** è un output distinto, con propria provenance, propri diritti,
proprio SHA-256, Gate tecnici e review umana. Deve essere creato fuori da
`assets/reference-vault/incoming/`. L'approvazione di un riferimento non approva il
risultato finale; un riferimento rifiutato resta utilizzabile soltanto come
anti-pattern documentato.

## Fingerprint e immutabilità

- Lo SHA-256 dei byte identifica l'originale; il fingerprint canonico del record
  identifica invece contratto e metadati validati.
- Nome file, data e anteprima non sostituiscono l'hash.
- Un cambio di byte produce una nuova versione, anche se l'immagine sembra uguale.
- Il record deve conservare `reference_id`, `asset_id`, SHA-256, source/rights ID,
  stato di review e data;
  il percorso locale non entra nel record né negli eventi.
- Un hash non prova proprietà, licenza, consenso, autenticità o qualità: prova solo
  l'identità dei byte registrati.

## Business context e ruolo reference

Ogni record dichiara perché è utile usando i ruoli del contratto, per esempio
`BRAND_REFERENCE`, `COMPOSITION_REFERENCE`, `PHOTOGRAPHY_REFERENCE`,
`TYPOGRAPHY_REFERENCE`, `VISUAL_STYLE`, `OFFER_REFERENCE`, `CUSTOMER_LANGUAGE`,
`ANALYTICS_EVIDENCE` o `NEGATIVE_REFERENCE`.
Il campo `business_context` deve collegare il materiale a un obiettivo concreto,
senza inventare domanda, risultati, margini, trend o conversioni.

I riferimenti competitor non dimostrano che una struttura funzioni. Le analytics
non diventano benchmark globali. Il linguaggio del pubblico non diventa una
citazione pubblicabile senza consenso e contesto.

## Diritti, privacy, retention e limiti

- `FABIO_SUPPLIED` registra solo chi ha fornito il file: `allowedUse` resta vuoto e
  lo stato non autorizza approval, lettura agente, overlay, derivati o output.
- `OWNED` e `AUTHORIZED` richiedono entrambi `evidenceReference`, SHA-256
  `evidenceFingerprint`, `verifiedBy` confermato dall'authority Fabio, `verifiedAt`
  e `allowedUse` non vuoto. La query passa solo se `allowedUse` contiene esattamente
  il purpose richiesto ed è compatibile con la piattaforma richiesta.
- Diritti `UNKNOWN`, `BLOCKED`, `PUBLIC_ANALYSIS_ONLY`, privacy non `CLEARED`,
  consenso/release non verificati o scadenze invalide bloccano approval e lettura.
- Il record privacy dichiara classi dati, purpose, verifica, policy fingerprint e
  `retentionExpiresAt`. Alla scadenza il riferimento diventa ineleggibile; una
  retention non disponibile non viene stimata.
- I byte scaduti non vengono cancellati da un processo automatico. Fabio può usare
  `PURGE_EXPIRED_REFERENCE_CONTENT` solo dopo la scadenza e con versione/fingerprint
  esatti: il sistema conserva metadata e tombstone immutabili, poi elimina il BLOB
  nella stessa transazione. SQLite rifiuta una delete senza tombstone.
- `privacy.purpose` è un valore esatto di `ReferenceAllowedUse`, non testo libero;
  deve essere presente in `rights.allowedUse` per la lettura richiesta.
- Con `dataClasses: ["NONE"]`, consenso e release sono `NOT_APPLICABLE` solo con
  attestazione fingerprinted e verificata. Con dati personali, entrambi sono
  `PROVIDED` con evidenza fingerprinted e verificata.
- Una licenza per osservare un contenuto non implica diritto di riproduzione,
  modifica, addestramento, distribuzione o uso commerciale.
- `PUBLIC_ANALYSIS_ONLY` e una URL pubblica non autorizzano a copiare o conservare
  un file competitor. Nessun competitor può entrare in output o nei campioni
  positivi, anche quando la retention interna è documentata.
- Le source URL ammesse sono HTTPS canoniche senza credenziali, query o fragment;
  token e identificatori sensibili non devono mai essere normalizzati o redatti a
  posteriori: la richiesta viene rifiutata.
- Rimuovere EXIF non sostituisce consenso e verifica dei soggetti.
- Materiali con minori, dati sensibili, documenti, indirizzi, targhe, schermi,
  account o identificatori privati restano fuori dal repository finché non sono
  redatti e autorizzati.
- Non archiviare secret, token, cookie, password, database, prompt privati o ID
  account numerici.
- Nessun file del Vault autorizza generazione AI, chiamate API, acquisti, upload,
  pubblicazione, scheduling, messaggi o deploy.

## Stato iniziale

Il Vault contiene soltanto struttura, template e documentazione. Nessun nuovo
riferimento visuale è stato importato in questa milestone. Il blueprint V1 usa
esclusivamente fonti autorevoli già tracciate nel repository e marca come
`NOT_AVAILABLE` ogni trend, dato audience o performance non attestato.
