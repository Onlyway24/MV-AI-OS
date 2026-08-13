# Revenue OS — contratto tecnico e Centro di Comando

## Architettura

Revenue OS non crea una memoria o un database parallelo. Usa:

- `BusinessContext` del Reference Vault per target e vincoli dichiarati da Fabio;
- `BusinessMissionDossier` per offerta, acquisition, economics, esperimenti e gate;
- Evidence Pack per la provenienza;
- Content Production per i pacchetti osservati;
- Agent Company Workday per gli handoff coordinati;
- una proiezione read-only nel Centro di Comando.

Lead, opportunità, vendite vinte, ricavi riconosciuti e delivery run non sono ancora
aggregate durevoli del sistema autorevole. Restano quindi `NOT_AVAILABLE`: i template
CSV non diventano automaticamente dati operativi.

## Target mostrabile nel Revenue Pulse

Il campo `BusinessContext.revenueTargets.value` viene mostrato soltanto con questa
forma esatta:

```json
{
  "contractVersion": "1",
  "currency": "EUR",
  "monthlyTargetCents": 0,
  "sourceRef": "riferimento-approvato-da-fabio"
}
```

`monthlyTargetCents: 0` qui illustra il tipo intero in centesimi, non un valore da
usare. Nel record reale Fabio deve dichiarare il proprio target. Chiavi aggiuntive,
valuta diversa, numero negativo, decimali o `sourceRef` mancante producono
`BUSINESS_CONTEXT_REQUIRED`.

## Dati economici

`Piano base` e `Margine contribuzione` provengono esclusivamente dallo scenario
`BASE` del `BusinessMissionDossier` e sono etichettati `CALCULATED_PLAN`. Non sono
fatturato o margine effettivo.

`Pipeline verificata` rimane `NOT_AVAILABLE` con
`PIPELINE_AGGREGATE_NOT_AVAILABLE` finché esiste un aggregate autorevole con
completezza, valore, probabilità e provenance. Un CSV vuoto non vale zero.

## Validazione locale del Revenue Input Pack

1. Copiare `assets/revenue-os/revenue-mission-input.template.json` fuori dal
   repository, in un'area privata.
2. Sostituire `NOT_AVAILABLE` soltanto con input verificati.
3. Aggiungere offerte, economics, capacità, esperimenti e opportunità usando gli ID
   referenziati in modo coerente.
4. Eseguire:

```text
npm run build
npm run revenue-os -- --input <percorso-privato>/revenue-mission.json
```

Il validatore rifiuta chiavi sconosciute, riferimenti spezzati, valori non finiti,
currency incoerente, offer attiva senza approvazione Fabio, capacità impossibile e
qualsiasi indicazione di effetto esterno.

## Integrità aritmetica

- Importi, conteggi e basis point usano intermedi `BigInt`: nessuna
  moltiplicazione floating-point precede l'arrotondamento.
- Ore e score decimali vengono convertiti in rapporti esatti dalla loro forma JSON;
  `0.3 / 0.1` produce quindi `3`, non `2` per errore binario.
- Un risultato fuori da `Number.MAX_SAFE_INTEGER` diventa `NOT_AVAILABLE` con
  `INVALID_INPUT`; non viene saturato o approssimato.
- Il validatore ricontrolla formule, unità, relazioni tra metriche, reason code e
  input mancanti canonici. Una scorecard numericamente o semanticamente alterata
  viene rifiutata.
- Se la coverage non è rappresentabile in sicurezza, lo stato è `BLOCKED` con
  `PIPELINE_COVERAGE_NOT_AVAILABLE`.

## Stati del Centro di Comando

- `SETUP_REQUIRED`: manca una Business Mission.
- `REVIEW_REQUIRED`: il dossier esatto attende Fabio.
- `BLOCKED`: missione o economics non superano i prerequisiti.
- `VALIDATION_PLANNED`: offerta approvata ed esperimenti preparati, non eseguiti.
- `READY`: il read-model è completo per la decisione interna corrente.

In tutti gli stati `externalActions = LOCKED`.
