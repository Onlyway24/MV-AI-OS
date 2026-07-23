# Experiment Engine V1

Un esperimento contiene hypothesis, target, method, asset, duration, budget massimo, sample, metriche, soglie, stop condition, evidence richiesta, azioni esterne proposte, owner e next decision.

Tipi supportati: customer interview, landing waitlist, manual outreach draft, pilot offer, price test, preorder proposal, content signal test, delivery prototype e internal tech prototype.

In questa release tutti gli asset vengono preparati internamente. Nessun outreach, landing pubblica, campagna, spesa o preordine viene eseguito. Le simulazioni verificano il design dell’esperimento, non il mercato. Solo una `REAL_OBSERVATION` con evidence reference ammessa può produrre segnale positivo o negativo; altrimenti lo stato è `AWAITING_REAL_OBSERVATION`.

Il Launch Pack produce soltanto sorgenti deterministiche Markdown, HTML, CSV e JSON. Ogni artefatto porta venture ID, versione, fingerprint, evidence refs, authoring agent, review state e allowed use `INTERNAL_PACKAGE_ONLY` o `PROPOSAL_ONLY`.
