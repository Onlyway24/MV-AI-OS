# Portfolio and Capital V1

Il Portfolio conserva Opportunity, Thesis, Venture, Experiments, rischi, dipendenze, sinergie, asset, artefatti e decisioni. Le viste aggregate mostrano capitale proposto/approvato, tempo Fabio, delivery capacity e concentrazione senza convertire valori mancanti in zero.

Il Capital Board confronta impatto, costo, rischio, velocità, reversibilità, strategic fit, evidence confidence e opportunity cost. Il solo output economico è `CAPITAL_ALLOCATION_PROPOSAL` con `spendAuthorized: false`.

Decisioni Fabio disponibili:

- `APPROVE_THESIS`, `REJECT_THESIS`, `REQUEST_MORE_RESEARCH`
- `APPROVE_EXPERIMENT`, `REJECT_EXPERIMENT`
- `PAUSE_VENTURE`, `RESUME_VENTURE`
- `REQUEST_SCALE_REVIEW`, `REQUEST_KILL_REVIEW`, `ARCHIVE_VENTURE`

La decisione deve riferire esattamente entity ID, versione e fingerprint correnti. Binding stale, actor differente o workspace differente falliscono chiusi.
