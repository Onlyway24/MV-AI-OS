# Checklist dei primi 60 riferimenti

Questi sono slot di intake, non asset esistenti e non una quota da riempire a ogni
costo. Uno slot resta vuoto quando fonte, diritti, privacy o business context sono
`NOT_AVAILABLE`. Nessun elemento di questa lista autorizza generazione o
pubblicazione.

## Criteri comuni di uscita per ogni slot

- [ ] File originale nella cartella corretta, senza sovrascritture.
- [ ] Riga metadata completa e categoria coerente.
- [ ] SHA-256 verificato dopo la copia.
- [ ] Checklist privacy e diritti conclusa con stato esplicito.
- [ ] `FABIO_SUPPLIED` usato soltanto come provenienza, con `allowedUse` vuoto;
      eventuali `OWNED`/`AUTHORIZED` hanno evidenza e data di verifica.
- [ ] Privacy `CLEARED`, purpose esplicito, consenso/release coerenti con le classi
      dati e retention futura verificata; altrimenti lo slot resta vuoto.
- [ ] Ruolo reference e business context specifici.
- [ ] ReferenceRole runtime preciso; nessun riferimento è trattato come final asset.
- [ ] Nessun secret, dato personale grezzo o identificatore privato.
- [ ] Decisione Fabio/reviewer registrata; assenza di dati marcata
      `NOT_AVAILABLE`.
- [ ] Nessuna URL contiene credenziali, query o fragment; nessun placeholder del
      template viene registrato come dato reale.

I sedici slot competitor sono solo una capacità di intake. Restano vuoti finché
analisi e conservazione del materiale non sono entrambe autorizzate con evidenza
verificata. `PUBLIC_ANALYSIS_ONLY`, visibilità pubblica o una semplice URL non
autorizzano copia/retention del binario; un competitor non è mai utilizzabile in
output o come campione positivo.

## Piano di intake

| Slot | Cartella | Scopo della selezione | Stato |
| --- | --- | --- | --- |
| RV-001 | `own-approved` | Cover propria approvata: gerarchia | [ ] |
| RV-002 | `own-approved` | Cover propria approvata: composizione | [ ] |
| RV-003 | `own-approved` | Carosello proprio approvato: ritmo | [ ] |
| RV-004 | `own-approved` | Carosello proprio approvato: apertura | [ ] |
| RV-005 | `own-approved` | Carosello proprio approvato: sviluppo | [ ] |
| RV-006 | `own-approved` | Carosello proprio approvato: CTA | [ ] |
| RV-007 | `own-approved` | Visual proprio approvato: prodotto | [ ] |
| RV-008 | `own-approved` | Visual proprio approvato: offerta | [ ] |
| RV-009 | `own-approved` | Visual proprio approvato: fotografia | [ ] |
| RV-010 | `own-approved` | Visual proprio approvato: typography | [ ] |
| RV-011 | `own-rejected` | Anti-pattern proprio: hook | [ ] |
| RV-012 | `own-rejected` | Anti-pattern proprio: densità | [ ] |
| RV-013 | `own-rejected` | Anti-pattern proprio: contrasto | [ ] |
| RV-014 | `own-rejected` | Anti-pattern proprio: composizione | [ ] |
| RV-015 | `own-rejected` | Anti-pattern proprio: CTA | [ ] |
| RV-016 | `own-rejected` | Anti-pattern proprio: claim | [ ] |
| RV-017 | `competitor-covers` | Pattern cover autorizzato: hook | [ ] |
| RV-018 | `competitor-covers` | Pattern cover autorizzato: gerarchia | [ ] |
| RV-019 | `competitor-covers` | Pattern cover autorizzato: contrasto | [ ] |
| RV-020 | `competitor-covers` | Pattern cover autorizzato: soggetto | [ ] |
| RV-021 | `competitor-covers` | Pattern cover autorizzato: spazio negativo | [ ] |
| RV-022 | `competitor-covers` | Pattern cover autorizzato: brand cue | [ ] |
| RV-023 | `competitor-covers` | Pattern cover autorizzato: formato | [ ] |
| RV-024 | `competitor-covers` | Anti-pattern cover autorizzato | [ ] |
| RV-025 | `competitor-carousels` | Pattern carosello autorizzato: slide 1 | [ ] |
| RV-026 | `competitor-carousels` | Pattern carosello autorizzato: problema | [ ] |
| RV-027 | `competitor-carousels` | Pattern carosello autorizzato: errori | [ ] |
| RV-028 | `competitor-carousels` | Pattern carosello autorizzato: metodo | [ ] |
| RV-029 | `competitor-carousels` | Pattern carosello autorizzato: caso | [ ] |
| RV-030 | `competitor-carousels` | Pattern carosello autorizzato: checklist | [ ] |
| RV-031 | `competitor-carousels` | Pattern carosello autorizzato: CTA | [ ] |
| RV-032 | `competitor-carousels` | Anti-pattern carosello autorizzato | [ ] |
| RV-033 | `photography` | Luce dark-luxury con diritti | [ ] |
| RV-034 | `photography` | Still life prodotto con diritti | [ ] |
| RV-035 | `photography` | Texture e materiali con diritti | [ ] |
| RV-036 | `photography` | Inquadratura verticale con diritti | [ ] |
| RV-037 | `photography` | Spazio headline con diritti | [ ] |
| RV-038 | `photography` | Anti-pattern fotografico | [ ] |
| RV-039 | `typography` | Gerarchia headline/subhead | [ ] |
| RV-040 | `typography` | Titolo condensato | [ ] |
| RV-041 | `typography` | Numerazione e progressione | [ ] |
| RV-042 | `typography` | Contrasto nero/giallo/bianco | [ ] |
| RV-043 | `typography` | Densità mobile leggibile | [ ] |
| RV-044 | `typography` | Anti-pattern tipografico | [ ] |
| RV-045 | `products` | Elettronica: presentazione verificabile | [ ] |
| RV-046 | `products` | Sneakers/streetwear: dettagli reali | [ ] |
| RV-047 | `products` | Orologi/accessori: provenienza | [ ] |
| RV-048 | `products` | Corredo/profumi: stato e confezione | [ ] |
| RV-049 | `offers` | Struttura offerta: problema | [ ] |
| RV-050 | `offers` | Struttura offerta: meccanismo | [ ] |
| RV-051 | `offers` | Struttura offerta: limiti | [ ] |
| RV-052 | `offers` | Struttura offerta: CTA coerente | [ ] |
| RV-053 | `analytics` | Pattern performance redatto: reach | [ ] |
| RV-054 | `analytics` | Pattern performance redatto: saves | [ ] |
| RV-055 | `analytics` | Pattern performance redatto: retention | [ ] |
| RV-056 | `analytics` | Pattern performance redatto: conversione attribuita | [ ] |
| RV-057 | `audience-language` | Linguaggio anonimizzato: problema | [ ] |
| RV-058 | `audience-language` | Linguaggio anonimizzato: apprendimento | [ ] |
| RV-059 | `audience-language` | Linguaggio anonimizzato: confronto | [ ] |
| RV-060 | `audience-language` | Linguaggio anonimizzato: acquisto | [ ] |

## Bilancio previsto, non obbligatorio

| Categoria | Slot |
| --- | ---: |
| own-approved | 10 |
| own-rejected | 6 |
| competitor-covers | 8 |
| competitor-carousels | 8 |
| photography | 6 |
| typography | 6 |
| products | 4 |
| offers | 4 |
| analytics | 4 |
| audience-language | 4 |
| **Totale** | **60** |
