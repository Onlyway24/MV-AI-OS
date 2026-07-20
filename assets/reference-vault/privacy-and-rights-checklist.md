# Checklist privacy e diritti

Compilare questa checklist per ogni file prima di assegnare
`APPROVED`. Una risposta `NOT_AVAILABLE`, dubbia o scaduta mantiene il record
`RIGHTS_BLOCKED` o `PENDING_FABIO_REVIEW`.

## 1. Identità e provenienza

- [ ] Ho registrato `reference_id`, versione e nome originale; nessun path locale è
      persistito nel record o nell'audit.
- [ ] Ho calcolato SHA-256 sui byte originali e l'ho confrontato dopo la copia.
- [ ] Ho registrato chi ha fornito il file e quando è stato ricevuto.
- [ ] L'eventuale source URL è HTTPS canonica e non contiene credenziali, query o
      fragment; la richiesta viene rifiutata invece di redigere a posteriori.
- [ ] So se il file è proprio, concesso in licenza, pubblico per sola osservazione
      oppure di provenienza `NOT_AVAILABLE`.
- [ ] Il file non è stato presentato come originale se è un crop, screenshot,
      derivato, export o contenuto generato.

## 2. Diritti d'uso

- [ ] `FABIO_SUPPLIED` è trattato solo come provenienza, con `allowedUse: []`; non
      viene convertito implicitamente in proprietà, consenso o licenza.
- [ ] `OWNED` e `AUTHORIZED` hanno entrambi `evidenceReference`, SHA-256
      `evidenceFingerprint`, `verifiedBy` confermato dall'authority Fabio,
      `verifiedAt` e `allowedUse` non vuoto; la lettura richiede poi la corrispondenza esatta tra
      purpose richiesto e uno degli usi documentati.
- [ ] Sono chiari uso interno, modifica, uso commerciale, distribuzione e canali
      ammessi: nessuno di questi diritti è dedotto dagli altri.
- [ ] Territorio e data di scadenza sono registrati oppure marcati
      `NOT_AVAILABLE`.
- [ ] Marchi, loghi, font, packaging, opere, fotografie e musica hanno una verifica
      separata quando presenti.
- [ ] Il materiale competitor viene copiato/conservato solo con autorizzazione
      documentata alla retention e resta sempre escluso dal final asset e dai
      campioni positivi.
- [ ] Un contenuto visibile pubblicamente non è stato trattato automaticamente come
      libero da copyright o disponibile per uso commerciale.
- [ ] Le condizioni della piattaforma o del fornitore non vietano la conservazione
      e l'uso previsto.
- [ ] L'esito runtime è uno tra `OWNED`, `FABIO_SUPPLIED`, `AUTHORIZED`,
      `PUBLIC_ANALYSIS_ONLY`, `UNKNOWN` o `BLOCKED`; soltanto `OWNED` e `AUTHORIZED`
      documentati possono superare il rights gate per purpose/piattaforma ammessi.

## 3. Persone e consenso

- [ ] Ho verificato se compaiono persone identificabili, anche in riflessi,
      fotografie sullo sfondo, schermi o documenti.
- [ ] Ho verificato età e presenza di minori; in caso di dubbio il file è bloccato.
- [ ] Modello, fotografo e soggetti hanno rilasci o consensi coerenti con l'uso
      previsto.
- [ ] Il consenso è specifico per canale, durata e finalità, oppure il limite è
      registrato.
- [ ] Non sono presenti dati sensibili, sanitari, biometrici, finanziari o relativi
      a categorie protette.
- [ ] `dataClasses` usa solo `NONE`, `PERSONAL_DATA`, `BIOMETRIC_DATA`,
      `LOCATION_DATA`, `MINOR_DATA`, `CONFIDENTIAL_BUSINESS_DATA` e non combina
      `NONE` con altre classi.
- [ ] L'esito runtime privacy è `UNKNOWN`, `REVIEW_REQUIRED`, `CLEARED` o `BLOCKED`.
      Solo `CLEARED` può proseguire; è una precondizione verificata, non una prova
      automatica di consenso.
- [ ] Con `dataClasses: ["NONE"]`, `consentEvidence` e `releaseEvidence` sono
      `NOT_APPLICABLE` con reason code `SAFE_NON_PERSONAL_ASSET`, attestation
      fingerprint e data di verifica.
- [ ] Con qualsiasi classe dati, consenso e release sono entrambi `PROVIDED` con
      evidence reference, evidence fingerprint e data di verifica.

## 4. Dati personali e sicurezza

- [ ] Nomi, email, telefoni, indirizzi, targhe, documenti, codici QR, coordinate,
      handle e ID account sono assenti o redatti in modo irreversibile.
- [ ] Screenshot analytics non contengono token, cookie, account ID numerici,
      segmenti identificabili o dati di singole persone.
- [ ] Estratti di DM e linguaggio audience sono anonimizzati e non ricostruibili.
- [ ] EXIF, geolocalizzazione, nome dispositivo e miniature incorporate sono stati
      verificati; l'esito è registrato senza fingere che la rimozione equivalga a
      consenso.
- [ ] Il file non contiene secret, password, chiavi API, prompt privati, database o
      configurazioni locali.

## 5. Purpose e retention

- [ ] Il purpose è un singolo valore esatto di `ReferenceAllowedUse`, è presente in
      `allowedUse` ed è compatibile con ruolo e piattaforma richiesti; non è testo
      libero né una formula generica come «qualsiasi uso».
- [ ] `privacy.verifiedAt` e il fingerprint della policy sono registrati.
- [ ] `retentionExpiresAt` è futuro e deriva da policy/evidenza documentata; non è
      inventato per superare il gate.
- [ ] Alla scadenza, o se purpose/consenso/release cambiano, approval e lettura
      falliscono chiusi finché una nuova versione non è verificata.
- [ ] Se i byte devono essere eliminati dopo la scadenza, Fabio usa esclusivamente
      `PURGE_EXPIRED_REFERENCE_CONTENT` con versione e fingerprint esatti; verifica
      receipt, tombstone e assenza del BLOB. Nessun purge è automatico.
- [ ] Per competitor, la retention del binario è esplicitamente autorizzata; se non
      lo è, lo slot resta vuoto e non si conserva una copia locale.

## 6. Uso come riferimento

- [ ] Ho assegnato almeno un ruolo preciso del contratto: `BRAND_REFERENCE`,
      `COMPOSITION_REFERENCE`, `PHOTOGRAPHY_REFERENCE`, `TYPOGRAPHY_REFERENCE`,
      `VISUAL_STYLE`, `OFFER_REFERENCE`, `CUSTOMER_LANGUAGE`,
      `ANALYTICS_EVIDENCE` o `NEGATIVE_REFERENCE`.
- [ ] Ho descritto il business context senza attribuire risultati, domanda,
      conversioni, trend, margini o diritti non provati.
- [ ] Ho annotato cosa può essere osservato e cosa non può essere copiato.
- [ ] Il record ha un `ReferenceRole` compatibile e resta separato dal final asset;
      nessuno stato del Vault equivale ad autorizzazione di pubblicazione.
- [ ] So che l'approvazione del riferimento non approva un nuovo asset, un claim,
      un'offerta o una pubblicazione.

## 7. Decisione

- [ ] Fabio o il reviewer autorizzato ha scelto uno stato esplicito.
- [ ] `APPROVED` viene usato solo se diritti `OWNED`/`AUTHORIZED` documentati,
      privacy `CLEARED`, consenso/release, retention, purpose, piattaforma e ruolo
      sono sufficienti per l'uso dichiarato.
- [ ] `REJECTED` conserva la ragione e consente solo uso come
      anti-pattern, quando privacy e conservazione lo permettono.
- [ ] `RIGHTS_BLOCKED` viene usato per diritti, privacy, autenticità o sicurezza non
      risolti.
- [ ] Nessun file è stato generato, pubblicato, caricato o inviato durante la review.

**Decisione:** `PENDING_FABIO_REVIEW / APPROVED / REJECTED / RIGHTS_BLOCKED`

**Reason code:** `________________________________________`

**Reviewer e data:** `____________________________________`
