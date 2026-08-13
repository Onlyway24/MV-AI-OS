# Business Mission V1

Business Mission V1 collega, nello stesso confine durevole di MV-AI-OS, una sola
vertical slice decisionale:

```text
Missione Business
→ tre Evidence Pack autorizzati
→ tre Opportunity Scorecard
→ confronto deterministico
→ una opportunità selezionata
→ offerta ed economics
→ piano di validazione e acquisizione
→ Artifact Factory locale
→ Quality / Risk / Cost Gate
→ decisione di Fabio nel Centro di Comando
```

Il flusso non è un agente con accesso libero al sistema. La creazione e la review
passano dal `LocalWorkflowCommandBoundary`, sono legate a workspace e attore e
producono ricevute idempotenti. Il browser non scrive direttamente in SQLite.

## Contratti e comportamento

La Missione dichiara obiettivo, capitale massimo, tempo, competenze, asset,
tolleranza al rischio, geografia, modello cliente, modelli di ricavo, soglie e
azioni vietate. L'input deve contenere esattamente tre candidati e tre Evidence
Pack correnti appartenenti allo stesso workspace e allo stesso operatore.

Ogni scorecard usa sette criteri fissi:

| Criterio | Peso |
| --- | ---: |
| Domanda verificata | 20% |
| Velocità di validazione | 15% |
| Efficienza del capitale | 15% |
| Margine potenziale | 15% |
| Accesso al cliente | 15% |
| Vantaggio di Fabio | 10% |
| Controllo del rischio | 10% |

Ogni valore conserva tipo del dato, evidenza, formula e confidenza. Un criterio
`MISSING` non riceve un valore sostitutivo: il confronto si blocca. Anche un
pareggio blocca la selezione e richiede una decisione esplicita, invece di
scegliere arbitrariamente.

L'Economics Engine è un servizio deterministico. Calcola ricavi, ricavi netti,
costi, margini, break-even, CAC massimo sostenibile e payback per gli scenari
prudente, base e ambizioso. Se manca un input richiesto, il risultato è
`NOT_AVAILABLE` e non contiene un valore. La fiscalità viene applicata soltanto
quando è fornita esplicitamente.

## Artifact Factory e azioni esterne

La factory genera dieci sorgenti locali, versionate e fingerprinted: report,
presentazione HTML, documento offerta, foglio economics CSV, landing copy,
sequenza email, script outreach, FAQ, piano di validazione JSON e contenuti
social di supporto. Sono artefatti sorgente pronti per review; non equivalgono a
invio, pubblicazione o avvio di una campagna.

La conversione in file binari PDF/PPTX non è simulata: richiederà un renderer
locale separato con la propria ricevuta. Fino ad allora la UI non deve chiamare
PDF un documento Markdown.

L'approvazione del dossier autorizza la decisione Business, non gli esperimenti.
Email, outreach, campagne, CRM, spesa, deploy, merge e pubblicazione restano fuori
dal flusso e richiedono Action Gateway e autorizzazioni separate.

## Persistenza, recovery e review

Il dossier completo è salvato atomicamente in SQLite con versione, Evidence
Pack, fingerprint immutabile, gate e stato. Il riavvio ricostruisce lo stesso
dossier. Fabio può approvare, rifiutare o richiedere revisione soltanto da
`PENDING_FABIO_APPROVAL`.

La conferma nel Centro di Comando include versione e fingerprint del record
corrente, ha scadenza di cinque minuti ed è monouso. Una modifica concorrente,
un replay o un fingerprint differente vengono rifiutati.

## Stato onesto della prima Missione reale

Il motore e la vertical slice sono operativi. La milestone commerciale reale non
va però dichiarata conclusa finché Fabio non fornisce o approva i vincoli della
Missione e il Research Runtime non acquisisce tre Evidence Pack reali. I fixture
automatici dimostrano contratti, calcoli, persistenza e sicurezza; non sono dati
di mercato e non devono comparire come risultato Business nel Centro di Comando.
