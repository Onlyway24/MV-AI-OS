# Centro di Comando Privato Onlyway

Il Centro di Comando Onlyway è un'applicazione web locale, in sola lettura e raggiungibile esclusivamente da loopback. Visualizza lo stesso stato durevole del control plane usato da MV-AI-OS.

Non è un secondo motore di workflow e non concede al browser accesso diretto a SQLite. Il percorso è:

```text
Interfaccia web → API privata locale → confine dei repository → SQLite
```

## Avvio locale

Compila l'applicazione e usa lo stesso file di configurazione CLI locale già usato da `mv-ai-os`:

```bash
npm run build
npm run command-center -- --config /percorso/della-configurazione-cli-locale.json
```

Il processo stampa un URL locale monouso che contiene un token di accesso casuale. Aprilo sulla stessa macchina. Il token è scambiato con una sessione locale `HttpOnly`, `SameSite=Strict` e viene eliminato dall'URL del browser.

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
  durata e costo realmente misurati.

Il catalogo distingue una capacità eseguibile dalla sua telemetria. Un reparto può
essere `READY` perché possiede un task locale reale, ma task completati, costi e tempi
restano a zero finché una giornata non viene effettivamente eseguita. Il Developer è
limitato al change plan e il Research alla compilazione di evidenze già autorizzate;
la UI mostra questi confini senza estenderli nominalmente.

Il Control Action Layer permette di approvare o rifiutare un pacchetto Metodo
Veloce e di approvare, rifiutare o richiedere revisione per un dossier Business
in attesa di Fabio. Ogni azione mostra prima versione, gate, Evidence Pack e
fingerprint del pacchetto; richiede poi una conferma esplicita. L'azione delega
al `LocalWorkflowCommandBoundary` già esistente, che effettua il controllo di
versione e registra la ricevuta idempotente durevole.

Un'approvazione dal Centro di Comando è consentita solo a pacchetti con Evidence
Pack immutabile. L'approvazione Business non autorizza esperimenti, contatti,
spesa o pubblicazione. Non esistono pulsanti fittizi per retry, dead-letter,
pause/ripresa o pubblicazione: saranno collegati solo quando il relativo comando
durevole è disponibile.

Quando un dato non esiste, l'interfaccia lo dichiara esplicitamente: non inventa metriche. Un pacchetto legacy senza Evidence Pack immutabile resta visibile, ma non è idoneo al percorso Telegram guidato dalle evidenze.

Le immagini di riferimento Metodo Veloce guidano soltanto la direzione creativa. La
dashboard non le presenta come prova di trend, domanda, licenza musicale o risultato.

## Sicurezza

- Ascolta esclusivamente su `127.0.0.1`; non supporta listener esposti in rete.
- Richiede un token locale casuale a 256 bit prima di servire interfaccia o dati API.
- Applica validazione rigida dell'host, risposte `no-store`, CSP, nessun CORS e nessun framing.
- Espone `GET` e `HEAD`, più due soli endpoint `POST` per proposta e conferma
  delle review contenuto e Business. Richiedono sessione locale, Origin loopback
  esatto, token CSRF e conferma monouso con scadenza a cinque minuti.
- Il browser non riceve accesso a SQLite e non può pubblicare, spendere, modificare un CRM o fare deploy.
- La pubblicazione resta soggetta ai confini esistenti di dry-run, autorizzazione esplicita, ricevuta e kill switch.

Il Centro di Comando aggiorna il modello di lettura ogni 30 secondi. Il polling non invoca il confine dei comandi di workflow: una schermata aperta non può creare ricevute di idempotenza né modificare lo stato del sistema.
