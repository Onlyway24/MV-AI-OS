# Onlyway Cinematic Operating Experience

## Scopo

Questa guida traduce due cortometraggi web verticali in decisioni applicate al
Centro di Comando Onlyway. Non replica scene, identità, copy, prodotti, asset o
composizioni dei riferimenti.

I video originali e i frame di analisi sono rimasti fuori dal repository. Non
sono dipendenze del prodotto.

## Metodo verificabile

`ffmpeg` e `ffprobe` non erano disponibili nel sistema. L'analisi è stata
eseguita localmente con AVFoundation e Core Image:

- lettura di container, codec, durata, risoluzione, frame rate e bitrate;
- decodifica dei frame;
- campionamento temporale a circa 6 fps per entrambi i video;
- analisi di luminanza, contrasto, texture, variazione fra frame e audio RMS;
- estrazione temporanea di 13 frame rappresentativi per video;
- contact sheet temporanei confrontati visivamente;
- nel secondo corto, verifica aggiuntiva dei 521 frame e della ROI del monitor.

Le soglie di variazione identificano cambi percettivi. Non vengono chiamate
“hard cut” quando monitor, ambiente e camera fisica restano continui.

## Cortometraggio 1 — precisione meccanica

### Scheda

| Segnale | Valore |
| --- | --- |
| Durata | 12,580 s |
| Video | H.264 `avc1`, 480×848, 29,968 fps |
| Bitrate video stimato | 1.079.464 bit/s |
| Audio | AAC stereo, 44,1 kHz |
| Luminanza media | 0,395 |
| Contrasto medio | 0,149 |
| Variazione media fra frame | 0,0207 |
| Picco audio RMS | 7,245 s |
| Frame più luminoso | 9,108 s |
| Frame più texturizzato | 3,770 s |

### Apertura

Un piano verticale riprende monitor, tastiera e mano. La camera fisica è quasi
ferma. Nel monitor, un orologio completo è presentato come protagonista contro
un fondale blu-notte, con copy tecnico sul lato opposto e molto spazio
negativo. Il soggetto è comprensibile prima che inizi la trasformazione.

### Camera, profondità e spazio

La “camera” utile è virtuale:

1. vista completa dell'oggetto;
2. push-in verso il calibro;
3. macro sui componenti;
4. esploso verticale;
5. pull-back verso la composizione iniziale.

Ambiente, monitor e mano creano tre piani reali; il sito aggiunge macro, scala,
overlap e particelle come profondità simulata. L'inquadratura esterna non cerca
spettacolo: funziona da proscenio stabile.

### Grammatica delle transizioni

I principali cambi percettivi sono a circa 2,603 s, 5,438 s, 5,940 s, 9,443 s
e 11,445 s:

- 0,00–2,60 s — presentazione dell'insieme;
- 2,60–5,94 s — avvicinamento e lettura del meccanismo;
- 5,94–9,44 s — esploso luminoso, massima profondità;
- 9,44–11,45 s — ricomposizione e ritorno alla macro;
- 11,45–12,58 s — ritorno all'oggetto completo.

Sono match transition e trasformazioni interne alla pagina, non tagli fisici.
L'oggetto resta riconoscibile fra una fase e la successiva.

### Ritmo, luce e tensione

Il ritmo alterna lettura calma e due accelerazioni brevi. La densità cresce
quando il calibro si apre; il picco sonoro a 7,245 s sostiene l'esploso. La luce
dorata nasce dall'oggetto, si riversa sul piano reale e guida lo sguardo dal
basso verso il centro. Il climax non è un overlay: è la massima intelligibilità
del sistema interno.

La palette del file completo è calda e smorzata per effetto dell'ambiente
ripreso (RGB medio 0,411 / 0,394 / 0,356), mentre il sito combina graphite,
navy, chrome e oro tecnico.

### Tipografia e texture

La tipografia nel sito è editoriale-tecnica: uppercase, numeri grandi,
micro-label, allineamento asimmetrico e linee sottili. La grana utile è quella
del materiale e della luce. Moiré del monitor, compressione social e overlay
“Claude Opus 4.8” appartengono alla registrazione e non al linguaggio da
trasferire.

### Chiusura

Il ritorno alla vista completa crea una struttura circolare: il sistema è
diventato comprensibile, ma il soggetto finale è lo stesso. La chiusura riduce
movimento e densità.

## Cortometraggio 2 — selezione e trasformazione

### Scheda

| Segnale | Valore |
| --- | --- |
| Durata | 14,886 s |
| Video | HEVC `hvc1`, 1080×1920, 35 fps |
| Frame decodificati | 521 |
| Bitrate video stimato | 828.683 bit/s |
| Audio | AAC stereo, circa 96.901 bit/s |
| RMS audio | −22,83 dBFS |
| Contrasto medio | 0,293 |
| Variazione media fra frame | 0,0252 |
| Climax emotivo | 7,7–9,1 s |
| Climax cinetico | 10,8–11,5 s |

### Apertura

Un unico piano fisico mostra parete, monitor e mano. Nel sito, una costellazione
di prodotti forma un arco prospettico. Un elemento viene selezionato e avanza:
la gerarchia nasce dalla relazione tra insieme e protagonista, non da una
griglia di card.

### Progressione

| Intervallo | Funzione |
| --- | --- |
| 0,00–1,80 s | lineup pearl/cool e selezione orbitale |
| 1,80–7,57 s | protagonista pinned, rotazione lenta e copy a capitoli |
| 7,57–9,23 s | bloom arancio e headline di climax |
| 9,14–9,23 s | light wash verso pearl/graphite |
| 9,23–10,80 s | reset freddo e fan-out |
| 10,80–12,60 s | editorial rush e scroll accelerato |
| 12,60–14,29 s | pausa monumentale sul protagonista |
| 14,29–14,43 s | ritorno laterale del lineup |

Il massimo cambiamento misurato è 0,0931 fra 10,886 e 10,943 s. La lunga fase
2,0–7,5 s resta intenzionalmente calma; il burst più denso dura meno di un
secondo.

### Palette e luce

La palette cambia per capitolo:

- opening cool: RGB 0,388 / 0,387 / 0,442;
- esposizione arancio: 0,589 / 0,304 / 0,172;
- climax: 0,672 / 0,448 / 0,275;
- reset cool: 0,418 / 0,415 / 0,474;
- rush editoriale: saturazione ridotta a 0,190.

La luce è sempre centro-guidata. La differenza fra centro e bordi cresce da
+0,127 nell'apertura a +0,249 durante il rush. Il cambio temperatura separa i
capitoli senza perdere il protagonista.

### Movimento, testo e suono

Carousel orbitale, pinning, rotazione, match-object, fan-out, flare e wash sono
le transizioni principali. Il testo è piccolo durante la lettura e diventa
enorme una sola volta, al climax. Gli attacchi audio ricorrono circa ogni
0,5–0,6 s, con energia crescente fra 7,8 e 11 s. Non esiste silenzio
intenzionale: il contrasto viene dalla densità.

### Chiusura

Dopo il rush, il sito lascia spazio negativo e un solo oggetto. Il rientro del
lineup ricostruisce l'apertura e rende il corto circolare.

## Principi comparati applicati

### 1. Protagonista persistente

Ogni route Onlyway ha un anchor reale:

- Oggi: prossima decisione;
- ORACLE: missione e proposta;
- Revenue: prossimo input economico;
- Venture: opportunità e decisione Founder;
- Creative Intelligence: riferimento e fingerprint;
- Tower: specialista o missione selezionata;
- Approval: asset e versione;
- Sistema: job, lease o incidente.

Il protagonista non viene sostituito da progresso o telemetria simulati.

### 2. Macro → sistema → ricomposizione

Il dettaglio si apre per mostrare dipendenze e Gate, poi ritorna a una vista
operativa. In ORACLE la trasformazione è:

`NEXUS → ORACLE → VECTOR → PRISM → FORGE`

In Sistema:

`Scheduler → Queue → Worker/Lease → Receipt/Incident → Kill switch`

### 3. Temperatura semantica

- Obsidian/cool: stato, osservazione, runtime;
- gold/warm: decisione, conseguenza, azione controllata;
- violet/chrome: intelligenza, memoria, coordinamento.

Il colore ambientale non modifica mai lo stato rappresentato.

### 4. Ritmo disciplinato

La maggior parte della sessione resta calma e leggibile. I burst sono limitati
all'ingresso di una scena o a un evento SSE reale, redatto e deduplicato.
Nessun loop continuo suggerisce lavoro inesistente.

### 5. Una sola intensità display

Ogni route possiede un solo momento tipografico dominante. Metadata, tabelle,
form e controlli mantengono una gerarchia operativa stabile.

### 6. Scroll come regia, non come stato

Lo scroll aggiorna soltanto:

- luce ambientale;
- profondità dei layer decorativi;
- focus del capitolo;
- indicatore di posizione `aria-hidden`;
- entrata bounded delle scene.

Non aggiorna costi, percentuali, agent state, readiness o pubblicazione.

## Cosa non viene trasferito

- oggetti, packaging, orologio, componenti, slogan e copy dei riferimenti;
- overlay social, emoji, mano, monitor, moiré o compressione;
- palette arancio dominante o font distressed copiato;
- autoplay, audio obbligatorio e timeline imposta all'operatore;
- falso 3D che suggerisca un dato o un processo reale;
- motion trail, particelle o pulsazioni prive di funzione;
- pinning di form, tabelle, dialog o controlli critici;
- valori mancanti sostituiti da demo data.

## Implementazione

### Architettura

- HTML, CSS e JavaScript vanilla restano l'architettura del Centro di Comando.
- `motion` è l'unico engine di animazione.
- Il boundary Motion mantiene massimo otto controlli concorrenti.
- Scene e observer vengono ribindati dopo route change e render SSE, con
  cleanup idempotente.
- reduced motion, tab nascosta, errori driver e kill switch fermano il layer
  cinematografico in modalità fail-closed.
- Il controller scroll usa `.cc-main` su desktop e `window` su mobile.
- CSP, autenticazione owner-only, SSE, SQLite e action boundary non cambiano.

### Design system

I token canonici restano nel layer premium:

- canvas e superfici: `--ow-canvas`, `--ow-surface-*`;
- luce: `--ow-gold*`, `--ow-cobalt`, `--ow-violet`;
- profondità: `--ow-glow*`, `--ow-blur`, layer `--ow-z-*`;
- spazio: scala `--ow-space-*`;
- tipografia: `--ow-type-*`, `--ow-leading-*`;
- movimento: `--ow-motion-*`, `--ow-ease`;
- focus: `--ow-focus`;
- regia runtime: `--ow-cinema-*`.

Le variabili `--ow-cinema-*` sono decorative e vengono calcolate localmente
dalla posizione del viewport.

### Regole di manutenzione

1. Aggiungere una scena solo a un contenitore semantico esistente con
   `data-cinematic-scene`, label e tone.
2. Non mettere dati di dominio negli attributi del layer cinematografico.
3. Non aggiungere un secondo motore di animazione.
4. Non trasformare contenitori che ospitano focus trap, form o tabelle.
5. Su mobile usare flusso verticale naturale; niente pinning.
6. Ogni nuova motion deve avere cleanup, reduced-motion e test.
7. Asset remoti, animazioni infinite e fake state restano vietati.

## Limiti reali

I video sono riprese social di siti mostrati su monitor: parte di grana,
riflesso e movimento appartiene alla registrazione, non alla pagina originale.
L'implementazione usa quindi soltanto principi confermati sia dai frame sia
dalle metriche, mantenendo Onlyway riconoscibile e operativo.
