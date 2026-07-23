# Venture Doctrine V1

La Venture Doctrine è una policy machine-readable e versionata. Le sue sezioni sono `FounderVenturePolicy`, `VentureInvestmentPolicy`, `VentureApprovalPolicy`, `VentureRiskPolicy`, `VentureCapitalPolicy`, `VentureExperimentPolicy`, `VentureKillPolicy`, `VentureScalePolicy` e `VenturePortfolioPolicy`.

## Regole non negoziabili

1. Evidenza prima del punteggio. Un segnale social non equivale a domanda o willingness to pay.
2. Formula prima della spiegazione. Score ed economics sono deterministici; un modello può solo spiegare output già calcolati.
3. Reversibilità prima della scala. Gli esperimenti devono essere piccoli, economici e arrestabili.
4. Fabio mantiene l’autorità. Ogni approvazione è identity-bound, version-bound e fingerprint-bound.
5. Nessun default materiale. Capitale, ore Fabio, margine minimo, mercati, tolleranza al rischio e condizioni di scale/kill non presenti restano `FOUNDER_INPUT_REQUIRED`.
6. Nessuna esecuzione implicita. Proposte di capitale, outreach, landing, pubblicazione, acquisto e deploy restano `PROPOSAL_ONLY` e `EXTERNAL_ACTION_LOCKED`.

## Policy data

La policy può esprimere obiettivo economico, massimo tempo al primo segnale, capitale, ore Fabio, rischio economico e reputazionale, mercati ammessi/vietati, B2B/B2C, modelli di ricavo, margine, delivery load, dipendenza da Fabio, automazione accettabile, evidenza richiesta, kill/scale criteria e approval requirements.

Ogni valore deve avere uno stato `AVAILABLE`, `NOT_AVAILABLE` o `FOUNDER_INPUT_REQUIRED`, una provenienza e, quando disponibile, un evidence reference. La Conversion Context canonica contiene solo regole permanenti già approvate; non promuove assunzioni o fixture.

## Governance

Le transizioni conservano tutte le versioni precedenti. CAS, idempotenza, receipt, audit ed event vengono committati atomicamente. Una Venture `KILLED` non può riaprirsi; una Thesis stale richiede nuova revisione; kill switch e maintenance mode prevalgono su qualsiasi job.
