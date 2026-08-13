# Social Intelligence Live Activation

## Capacità consegnata

Il sistema dispone ora di un piano dati durevole per quattro flussi distinti:

1. trend osservati da fonti registrate;
2. snapshot analytics dell'account Metodo Veloce;
3. competitor pubblici autorizzati e relative osservazioni;
4. verifiche di disponibilità e diritti degli audio.

I record sono append-only, fingerprinted e isolati per workspace e operatore. Ogni osservazione importata deve riferirsi a una fonte `AUTHORIZED` già presente nel Source Registry. Un competitor non può essere osservato finché il suo account pubblico non è stato autorizzato esplicitamente. Nessuna importazione abilita una pubblicazione.

## Confine operativo

Le operazioni disponibili sul Command Boundary locale sono:

- `REGISTER_SOCIAL_OFFICIAL_SOURCES`;
- `ACQUIRE_GOOGLE_TRENDS_LIVE`;
- `IMPORT_SOCIAL_ANALYTICS_CSV`;
- `AUTHORIZE_SOCIAL_COMPETITOR_SET`;
- `IMPORT_SOCIAL_COMPETITOR_OBSERVATIONS_CSV`;
- `IMPORT_SOCIAL_AUDIO_RIGHTS_CSV`;
- `IMPORT_SOCIAL_LIVE_RECORD`;
- `PREVIEW_SOCIAL_LIVE_BATCH`;
- `IMPORT_SOCIAL_LIVE_BATCH`;
- `GET_SOCIAL_LIVE_REPORT`;
- `CREATE_FIRST_SOCIAL_EXPERIMENT`.

Il Command Center legge gli stessi record SQLite tramite il repository. Non scrive direttamente nel database.

## Registro iniziale delle fonti

Il registro iniziale è limitato a quattro fonti ufficiali e a un solo confine di osservazione pubblica:

- Google Trends — Trending Now export;
- TikTok Creative Center — Trends;
- Instagram Insights — export dell'account autorizzato;
- TikTok Commercial Music Library.
- Instagram pubblico — esclusivamente per i competitor approvati da Fabio, senza login, contatto o copia.

La registrazione non crea osservazioni. Google Trends e Creative Center sono segnali relativi di attenzione, non prove autonome di domanda commerciale, e richiedono corroborazione. Una traccia della Commercial Music Library è utilizzabile soltanto se paese, account, placement e finestra temporale risultano compatibili nel momento della verifica.

## Importazione controllata

L'importazione multipla segue due passaggi separati:

1. `PREVIEW_SOCIAL_LIVE_BATCH` valida proprietà, fonti, dipendenze e fingerprint senza scrivere;
2. `IMPORT_SOCIAL_LIVE_BATCH` salva il lotto in una sola transazione oppure non salva nulla.

Un lotto già importato con gli stessi fingerprint viene restituito come `REPLAYED`. Un replay parziale o un record con identità incompatibile blocca l'intero lotto. La ricevuta del comando conserva fingerprint, conteggi, stato e conferma che non è avvenuto alcun effetto esterno.

Per gli analytics è disponibile il modello `examples/social-intelligence-live/metodo-veloce-analytics-template.csv`. Le celle metriche vuote restano assenti: non vengono trasformate in zero e non vengono stimate.

Sono disponibili anche due intake separati:

- `metodo-veloce-competitor-observations-template.csv`: richiede URL pubblico esatto, estratto verificabile, timestamp e campi editoriali; l'hash dell'estratto viene calcolato prima dell'importazione e il lotto fallisce se il competitor non è già autorizzato;
- `metodo-veloce-audio-rights-template.csv`: registra account, paese, disponibilità, compatibilità e uso commerciale. Una riga può attestare un esito negativo; `ALLOWED` viene accettato soltanto quando la traccia è disponibile e compatibile con l'account esatto.

Gli snapshot dopo la pubblicazione riutilizzano il medesimo contratto analytics: `content_id`, `published_at` e `captured_at` collegano ogni osservazione al contenuto effettivamente pubblicato. Correzioni successive restano append-only.

`ACQUIRE_GOOGLE_TRENDS_LIVE` effettua una richiesta HTTPS limitata al dominio e al percorso autorizzati, accetta soltanto XML UTF-8 entro 1 MiB, conserva hash e dimensione dello snapshot e importa il lotto atomicamente. Ogni feed successivo resta uno snapshot immutabile; il report deduplica per piattaforma, territorio e keyword mostrando l'osservazione più recente. I record entrano come `UNCLASSIFIED`: non vengono contati come compatibili finché una classificazione attestata non li collega a Metodo Veloce.

L'autorizzazione competitor richiede la frase esatta `AUTORIZZO_ESATTAMENTE_QUESTI_6_PROFILI` e registra soltanto il set 2+2+1+1 definito nel dossier candidati. L'autorizzazione permette osservazioni pubbliche attribuibili; non permette login, outreach, scraping non autorizzato o imitazione dei contenuti.

## Baseline analytics

La baseline usa solo snapshot importati. Le correzioni non sovrascrivono il record precedente: creano un nuovo snapshot con `correctionOfRecordId`. Il report esclude il record corretto dal calcolo corrente, mantenendolo nell'audit.

I rapporti disponibili sono calcolati soltanto quando esistono sia il numeratore sia una reach maggiore di zero:

- salvataggi / reach;
- condivisioni / reach;
- visite profilo / reach.

Con meno di dieci contenuti distinti la baseline resta `INSUFFICIENT_DATA` e la conclusione sull'orario resta `EXPERIMENT_REQUIRED`. Non viene dichiarato un “orario migliore”.

## Primo esperimento Metodo Veloce

Tema: `5 oggetti in casa che puoi vendere subito — angolo aggiornato evidence-led`.

Variabile primaria: sola finestra di pubblicazione.

- braccio A: fascia serale;
- braccio B: fascia pranzo in un giorno differente;
- invarianti: format, stile, CTA e qualità;
- metriche: salvataggi/reach, condivisioni/reach, visite profilo/reach e completamento carosello.

Se le due date esatte non sono fornite, l'esperimento resta `AWAITING_FABIO_PARAMETERS`. Non viene inventato alcun timestamp. La programmazione è interna; la pubblicazione resta manuale e separatamente autorizzata.

## Gate del primo ciclo reale

Il report espone `cycleReadiness`. Lo stato resta `BLOCKED` finché non esistono tutti questi elementi:

- almeno uno snapshot Insights autentico;
- almeno un'acquisizione trend reale;
- almeno un trend ancora fresco classificato compatibile e corroborabile;
- esattamente il registro iniziale di sei competitor autorizzati;
- almeno un'osservazione attribuibile per ciascuno dei sei competitor;
- almeno una verifica della Commercial Music Library, anche quando il risultato corretto è `AUDIO_NON_AUTORIZZATO`.

La presenza di un feed trend non sblocca da sola la produzione. Anche quando il gate è completo, un trend deve essere classificato e corroborato prima di sostenere claim di domanda.

Il Centro di Comando mostra anche `firstPackageReadiness` per il candidato “5 oggetti in casa che puoi vendere subito”. Ogni ingresso è visibile come presente o mancante e la pubblicazione resta sempre `LOCKED`; il gate abilita soltanto la costruzione dell'Evidence Pack, non un'azione esterna.

## Attivazione locale del 15 luglio 2026

Il primo feed ufficiale Google Trends Italia è stato acquisito e importato:

- risposta HTTPS 200, MIME `text/xml`;
- 20.158 byte;
- SHA-256 `177bee225335d5b3228dc0cfd059f201a6b988739e8bff7aacd9169013cfcdb6`;
- 10 trend osservati;
- 10 `UNCLASSIFIED`;
- 0 dichiarati compatibili con Metodo Veloce;
- nessuna azione esterna di pubblicazione.

Il gate resta correttamente bloccato per Insights, competitor autorizzati e osservati, e verifica Commercial Music Library.

## Stato iniziale onesto

Il codice non include competitor presunti, dati analytics di esempio, trend fittizi o audio dichiarati utilizzabili senza attestazione. Finché non vengono importati export reali e registrate le fonti, il Centro di Comando mostra gli input mancanti.

Per attivare il primo ciclo reale servono:

1. export o snapshot attribuibile dell'account `mr.metodo.veloce_official`;
2. elenco esplicito degli account competitor che Fabio autorizza;
3. classificazione e corroborazione dei trend reali già acquisiti;
4. verifica audio per paese, account e uso commerciale;
5. due finestre esatte scelte da Fabio per l'esperimento.

Le credenziali non devono essere salvate nei record o nel repository.
