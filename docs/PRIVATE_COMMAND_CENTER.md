# Centro di Comando Privato Onlyway

Il Centro di Comando Onlyway è un'applicazione web locale raggiungibile esclusivamente
da loopback. Il read plane visualizza lo stesso stato durevole usato da MV-AI-OS; il
Control Action Layer espone soltanto proposte allowlisted con conferma monouso.

Non è un secondo motore di workflow e non concede al browser accesso diretto a SQLite. I percorsi sono:

```text
Interfaccia web → API privata locale → query/event boundary → SQLite
Interfaccia web → proposta + conferma → command/action boundary → SQLite
```

## Avvio locale

Compila l'applicazione e usa lo stesso file di configurazione CLI locale già usato da `mv-ai-os`:

```bash
npm run build
npm run command-center -- --config /percorso/della-configurazione-cli-locale.json
```

Il processo stampa soltanto host, porta e stato `READY`: il token non viene scritto
su stdout/stderr né nei log del supervisor. L'URL locale autenticato è disponibile
nel file bootstrap affiancato al database:

```text
<percorso-sqlite>.command-center-bootstrap.json
```

Il bootstrap è creato atomicamente con permessi owner-only `0600`, contiene il solo
URL di accesso necessario all'avvio locale e viene rimosso dal processo proprietario
durante l'arresto. Leggi `accessUrl` localmente, senza copiarlo nei log, e aprilo sulla
stessa macchina. Il token casuale viene scambiato con una sessione locale `HttpOnly`,
`SameSite=Strict` ed eliminato dall'URL del browser. Il lock sibling
`<percorso-sqlite>.command-center.lock` impedisce una seconda istanza API sullo stesso
database e consente il recupero verificato di un PID non più attivo.

## Ambito attuale

Il Centro di Comando mostra esclusivamente stato realmente persistito:

- coda di produzione Metodo Veloce e asset reali del pacchetto selezionato: carosello o contenuto breve;
- report Social Intelligence con Opportunity Score a 12 criteri, expiry, domanda,
  competitor autorizzati, tre set hashtag, SEO, audio rights, finestre dinamiche o
  sperimentali, fatigue, distintività, conversion intent e snapshot metrici in attesa
  di import reale;
- stato Social Intelligence Live con registro ufficiale, readiness di acquisizione,
  baseline costruita esclusivamente da snapshot importati ed esperimento orario
  controllato; assenza di dati reali mostrata come input mancante, mai come zero
  prestazionale;
- punteggio di qualità, stato del rischio, versione e attestazione dell'Evidence Pack;
- Registro Fonti, record di evidenza ed Evidence Pack;
- Missioni Business con tre Opportunity Scorecard, selezione deterministica,
  offerta, economics, validazione, artefatti e Quality / Risk / Cost Gate;
- coda durevole, retry, dead-letter e stato dei worker;
- catalogo operativo dei 17 reparti Onlyway con executor, task supportati e confini;
- giornate Agent Company persistite con task, output fingerprinted, Gate, blocker,
  durata e costo realmente misurati;
- runtime supervisionato con controllo, lease scheduler/worker, code, retry,
  dead-letter, incidenti e operational event redatti;
- Founder Workday #001 e Daily Operating Brief durevoli, inclusi blocker,
  provenance, copertura `UNAVAILABLE` e publication lock;
- checkpoint ufficiale Instagram/TikTok e stato connessione verificato localmente,
  senza token raw e senza capacità di pubblicazione.

Per ciascun social il Centro di Comando espone un solo link non mutante, `Apri
checkpoint locale`. Connessione, verifica, riconnessione e revoca sono form `POST`
distinti del runtime con CSRF: il link non simula né esegue nessuna di queste azioni.

Il catalogo distingue una capacità eseguibile dalla sua telemetria. Un reparto può
essere `READY` perché possiede un task locale reale, ma task completati, costi e tempi
restano a zero finché una giornata non viene effettivamente eseguita. Il Developer è
limitato al change plan e il Research alla compilazione di evidenze già autorizzate;
la UI mostra questi confini senza estenderli nominalmente.

La finestra operativa è bounded: al massimo 25 produzioni, 25 Business Mission e 25
giornate Agent Company alimentano totali e Decision Inbox; soltanto le tre giornate a
priorità più alta sono espanse integralmente, mentre Social Intelligence osserva al
massimo 500 record. Quando una query raggiunge il cap, la UI espone
`LIMIT_REACHED`, valori `≥` e copertura parziale; non trasforma la finestra in un
totale globale né un empty state in uno zero globale. Costi ed effetti esterni restano
`UNAVAILABLE` finché non esiste un ledger globale con copertura attestata.

## Onlyway Tower e Squadra Apex

La vista Agenti presenta i 17 reparti operativi come una squadra coordinata, divisa
in sei unità visive: Command, Intelligence, Studio, Growth, Build e Guardians. I call
sign e gli emblemi sono alias originali di presentazione: non introducono nuovi agent
ID, executor, permessi o capacità runtime. Ruolo, task supportati, stato, durata, costo
e output continuano a provenire esclusivamente dal catalogo e dalle giornate Agent
Company persistite.

La lettura degli stati resta rigorosa: `READY` indica che l'executor locale è
disponibile, non che un processo sia in esecuzione; `ACTIVE` compare soltanto quando
esiste lavoro corrente reale. Il dossier selezionabile espone i confini dell'agente e
la telemetria disponibile, mentre i filtri cambiano solo la visualizzazione. Nessuna
azione del roster autorizza spesa, pubblicazione o mutazioni del workflow.

Il Control Action Layer permette di approvare o rifiutare un pacchetto Metodo
Veloce e di approvare, rifiutare o richiedere revisione per un dossier Business
in attesa di Fabio. Ogni azione mostra prima versione, gate, Evidence Pack e
fingerprint del pacchetto; richiede poi una conferma esplicita. L'azione delega
al `LocalWorkflowCommandBoundary` già esistente, che effettua il controllo di
versione, applica centralmente il Visual Gate per ogni decisione `APPROVED` e registra
la ricevuta idempotente durevole. La verifica centrale impedisce a qualunque adapter
locale alternativo di aggirare il gate.

Un'approvazione contenuto dal Centro di Comando è consentita solo a pacchetti con
Evidence Pack immutabile e Visual Gate esatto. Il manifest deve essere
`READY_FOR_HUMAN_DECISION` e legare workspace, production ID/version, content package,
Social Publishing Pack, Master Content Pack e asset set tramite SHA-256. Il gate
ricontrolla fingerprint del manifest, byte e dimensioni reali degli asset, root/path e
assenza di symlink escape sia in proposta sia in conferma. Lo stesso gate protegge
l'approvazione Telegram; una modifica tra preview e callback blocca e invalida la
conferma. Una review valida persiste sul record di produzione il suo
`visualApprovalBindingFingerprint` esatto.

Le review legacy prive del fingerprint restano leggibili per ispezione e archiviazione,
ma non sono schedulabili, non possono creare un publication dry-run e non possono
essere autorizzate. Il logo originale ufficiale è presente e registrato con SHA-256
`9a622429e00fdef35e3dfd7472cf945b3a74834018bfd5a57a7c8a3aab97f121`;
il reason `BLOCKED_ORIGINAL_LOGO_MISSING` incorporato nel vecchio manifest è metadata
stale. Il blocker operativo corrente è l'assenza di un `approvalBinding` esatto e di un
manifest `READY_FOR_HUMAN_DECISION` corrispondente alla produzione e agli asset reali.
Una ricevuta visuale valida, insieme alla decisione di Fabio, rende il record idoneo
soltanto a un successivo comando separato di scheduling interno: non schedula e non
pubblica da sola.

L'approvazione Business non autorizza esperimenti, contatti, spesa o pubblicazione. I
controlli operativi implementati—revisione,
pausa/ripresa/cancellazione produzione, retry di un job fallito, requeue esplicito
di un dead-letter e acknowledgement di un incidente—usano la stessa
proposta/conferma con target, versione e fingerprint. Non esiste alcuna azione di
pubblicazione.

Quando un dato non esiste, l'interfaccia lo dichiara esplicitamente: non inventa
metriche. Un pacchetto legacy senza Evidence Pack immutabile o senza ricevuta Visual
Gate resta visibile, ma non è idoneo ad approvazione, scheduling o publication dry-run.

Le immagini di riferimento Metodo Veloce guidano soltanto la direzione creativa. La
dashboard non le presenta come prova di trend, domanda, licenza musicale o risultato.

## Sicurezza

- Ascolta esclusivamente su `127.0.0.1`; non supporta listener esposti in rete.
- Richiede un token locale casuale a 256 bit prima di servire interfaccia o dati API.
- Applica validazione rigida dell'host, risposte `no-store`, CSP, nessun CORS e nessun framing.
- Espone `GET`/`HEAD`, lo stream autenticato `/api/events` e due coppie `POST`:
  `/api/actions/{propose,confirm}` per le review esistenti e
  `/api/control-actions/{propose,confirm}` per i controlli operativi allowlisted.
  Richiedono sessione locale, Origin loopback esatto, token CSRF e conferma monouso
  con scadenza.
- Il browser non riceve accesso a SQLite e non può pubblicare, spendere, modificare un CRM o fare deploy.
- La ricevuta Visual Gate consente al massimo l'idoneità allo scheduling interno;
  pubblicazione dry-run, autorizzazione esplicita, ricevuta esterna e kill switch
  restano confini separati.

Il Centro di Comando carica uno snapshot autorevole e applica eventi durevoli tramite
SSE con cursor replay, heartbeat e reset bounded. Una schermata aperta non invoca il
confine dei comandi e non può creare ricevute o mutazioni senza la sequenza esplicita
proposta/conferma. Il runbook operativo unico è
`docs/SUPERVISED_H24_RUNTIME_V1.md`.

L'interfaccia è verificata a 1280 px e 390 px senza overflow orizzontale. Sidebar,
menu mobile e roster sono azionabili da tastiera; Escape chiude il drawer e ripristina
il focus. Durante una conferma lo sfondo è `inert`, le scorciatoie globali sono
disabilitate e il focus resta nel dialogo. `prefers-reduced-motion` neutralizza
animazioni, transizioni, parallax e smooth scroll; l'attività del nucleo operativo è
mostrata solo per job realmente `RUNNING`, non per una semplice coda.
