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
- punteggio di qualità, stato del rischio, versione e attestazione dell'Evidence Pack;
- Registro Fonti, record di evidenza ed Evidence Pack;
- coda durevole, retry, dead-letter e stato dei worker;
- l'unica divisione attualmente eseguibile: Content Director.

Quando un dato non esiste, l'interfaccia lo dichiara esplicitamente: non inventa metriche. Un pacchetto legacy senza Evidence Pack immutabile resta visibile, ma non è idoneo al percorso Telegram guidato dalle evidenze.

## Sicurezza

- Ascolta esclusivamente su `127.0.0.1`; non supporta listener esposti in rete.
- Richiede un token locale casuale a 256 bit prima di servire interfaccia o dati API.
- Applica validazione rigida dell'host, risposte `no-store`, CSP, nessun CORS e nessun framing.
- Espone solo endpoint `GET` e `HEAD`: nessuna mutazione dal browser, pubblicazione, spesa, CRM, deploy o approvazione.
- La pubblicazione resta soggetta ai confini esistenti di dry-run, autorizzazione esplicita, ricevuta e kill switch.

Il Centro di Comando aggiorna il modello di lettura ogni 30 secondi. Il polling non invoca il confine dei comandi di workflow: una schermata aperta non può creare ricevute di idempotenza né modificare lo stato del sistema.
