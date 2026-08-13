# Metodo Veloce Social Intelligence V1

Questa vertical slice trasforma un brief evidence-led in un `SocialPublishingPack`
durevole e verificabile. Non naviga liberamente, non legge account social, non usa le
immagini di riferimento come prova e non autorizza la pubblicazione.

## Flusso operativo

```text
Evidence Pack autorizzato
→ brief Metodo Veloce
→ segnali social dichiarati con provenienza
→ Opportunity Score a 12 criteri
→ expiry, fatigue, brand e cultural-risk gate
→ carosello da 6 slide
→ hashtag / SEO / audio rights / timing
→ piano di snapshot metrici reali
→ Social Publishing Pack fingerprinted
→ approvazione Fabio
```

Il comando locale è:

```text
PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK
```

Richiede `brief`, `evidencePackId` e `socialIntelligence`. Il confine verifica che
l'Evidence Pack esista, sia valido per i claim del brief e non sia scaduto; poi salva
il pacchetto nella stessa coda di produzione Metodo Veloce. Non esegue azioni esterne.

## Decisione deterministica

I 12 criteri sono domanda, velocità del trend, coerenza brand, valore pratico,
potenziale conversione, forza delle evidenze, gap competitor, distintività,
fattibilità produttiva, freshness, sicurezza dei claim e resilienza alla fatigue.

Ogni valore dichiara `MEASURED`, `EVIDENCE`, `ASSUMPTION` o `MISSING`, data di
osservazione e riferimento alla fonte o evidenza quando richiesto. I pesi sommano a
100. Le assunzioni ricevono confidenza ridotta; un dato mancante non riceve un valore.
Se un criterio manca, lo score totale resta assente e la decisione è
`RICHIEDE_RICERCA`.

Le decisioni possibili sono:

- `PRODURRE_ORA`;
- `ENTRO_24_ORE`;
- `CALENDARIO`;
- `RICHIEDE_RICERCA`;
- `SCARTARE`.

Un trend scaduto, un rischio culturale alto, fatigue critica o uno score insufficiente
bloccano il pacchetto. Un pacchetto bloccato conserva il draft da ispezionare, ma non
diventa idoneo all'approvazione.

## Regole contro dati inventati

- Gli hashtag vengono selezionati solo dai candidati dichiarati, filtrando expiry,
  pertinenza e saturazione.
- Un audio è selezionabile solo con diritti commerciali dichiarati, disponibilità
  sull'account esatto e validità temporale. Altrimenti compare
  `AUDIO_NON_AUTORIZZATO` o nessun audio selezionato.
- Una finestra è `DYNAMIC` solo con almeno 10 post storici, campione pubblico
  sufficiente e finestre interamente `MEASURED`. In caso contrario è
  `EXPERIMENTAL / DATI_INSUFFICIENTI`; nessun orario viene creato dal motore.
- Gli snapshot 30 minuti, 2 ore, 24 ore, 72 ore e 7 giorni nascono in
  `AWAITING_REAL_IMPORT`. Visualizzazioni, watch time, completamento, salvataggi,
  condivisioni, commenti, visite profilo, click, lead e conversioni devono arrivare da
  import reali. Le conversioni sono usabili solo quando attribuibili.
- Il test A/B modifica una sola variabile e dichiara la metrica primaria.

## Direzione creativa Metodo Veloce

Il carosello usa esattamente 6 slide, canvas 1080×1350, formato 4:5, palette nero
`#050505`, giallo `#FFD400`, bianco `#F7F7F4`, fotografia ultrarealistica
cinematografica, logo e fulmine stabili, headline condensate e CTA operativa finale.
I riferimenti visivi forniti da Fabio definiscono questo pattern, non trend, domanda,
competitor, diritti musicali o performance.

## Centro di Comando

La pagina `Intelligence Social` mostra il report giornaliero con pacchetti pronti,
in ricerca, bloccati e in scadenza; per ogni pacchetto espone score o dato non
disponibile, decisione, trend, domanda, competitor, hashtag, audio, timing, brand,
fatigue e stato di importazione delle metriche. Il carosello resta visibile anche
quando il gate Social blocca l'approvazione.
