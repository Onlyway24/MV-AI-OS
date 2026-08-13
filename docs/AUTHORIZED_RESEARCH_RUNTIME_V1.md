# Authorized Research Runtime V1

## Capacità consegnata

Il runtime collega una Research Mission al Source Registry e produce Evidence Pack durevoli senza consentire navigazione web libera:

```text
Research Mission
→ selezione di fonti già autorizzate
→ HTTPS limitato e DNS pubblico verificato
→ redirect nuovamente autorizzato a ogni passaggio
→ snapshot immutabile e fingerprint SHA-256
→ estrazione di fatti e tabelle
→ attribuzione, freshness e affidabilità
→ corroborazione e claim mapping
→ Evidence Pack durevole
→ Giornata Onlyway / produzione Metodo Veloce
```

## Confini di sicurezza

L'acquisizione blocca:

- protocolli diversi da HTTPS, credenziali e parametri URL che possono contenere segreti;
- domini, porte o percorsi esterni al confine canonico del Source Registry;
- redirect non autorizzati e redirect oltre il limite della Missione;
- destinazioni DNS private, locali, riservate o miste pubblico/private;
- MIME non ammessi, charset non UTF-8 e contenuti oltre il limite configurato;
- pagine editoriali o secondarie senza autore o editore attribuibile;
- contenuti scaduti, claim contestati e claim senza il numero di fonti richiesto.

Il client invia soltanto richieste `GET`, non usa cookie o credenziali e collega la connessione all'indirizzo IP pubblico già verificato. I redirect non vengono seguiti automaticamente.

## Stato durevole e ripresa

Le tabelle SQLite `authorized_research_missions` e `research_acquisition_snapshots` conservano Missione, input fingerprint, stato, blocker, snapshot, estratti, tabelle, claim e riferimenti agli Evidence Pack. Il replay con lo stesso input restituisce lo stato già concluso; un input differente con lo stesso ID viene rifiutato.

Operazioni disponibili attraverso il Local Workflow Boundary:

- `RUN_AUTHORIZED_RESEARCH_MISSION`;
- `INSPECT_AUTHORIZED_RESEARCH_MISSION`;
- `LIST_AUTHORIZED_RESEARCH_MISSIONS`.

La Giornata Onlyway può indicare `researchMissionId`. In quel caso il Research Agent accetta soltanto una Missione `READY`, dello stesso workspace e attore, con gli stessi tre Evidence Pack dichiarati dalla giornata.

## Centro di Comando

Il Centro Evidenze mostra le Research Mission, i claim verificati o irrisolti, gli snapshot e gli Evidence Pack. La Compagnia Agenti mostra risultati accettati al primo tentativo, qualità media misurata, revisioni, errori di validazione, durata e costo. Ogni task della giornata espone executor, dipendenze, tentativi, Gate, output e fingerprint.

## Stato operativo onesto

Il motore e il collaudo end-to-end sono disponibili. Nessuna fonte di mercato è stata importata nel database operativo e la Giornata Onlyway reale non è stata avviata: il test automatico usa esclusivamente fixture dichiarate. Per avviare `Giornata Onlyway #001` servono tre gruppi di URL reali già ammessi nel Source Registry e claim di ricerca formulati in modo verificabile. Il sistema può bloccare o rifiutare tutte e tre le opportunità.

Nessuna pubblicazione, email, contatto, spesa, merge, push o deploy viene eseguito da questo runtime.
