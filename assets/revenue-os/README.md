# Onlyway Revenue OS — Template CSV

Questi file sono schemi locali, non database operativi e non dataset di esempio.

| File | Scopo | Righe reali incluse |
| --- | --- | ---: |
| `offer-registry-template.csv` | Registro versioni offerta e Gate | 0 |
| `funnel-crm-template.csv` | Contratto import/export pipeline redatto | 0 |
| `pricing-unit-economics-template.csv` | Tre scenari da compilare | 0; solo righe scenario `NOT_AVAILABLE` |
| `experiment-backlog-template.csv` | Registro esperimenti e decisioni | 0 |
| `revenue-mission-input.template.json` | Contratto completo validabile dal motore Revenue OS | 0; tutti gli input business sono `NOT_AVAILABLE` |

## Regole d'uso

- Conservare i dati operativi in uno store privato autorizzato, non nel repository.
- Nel CSV CRM usare un `private_contact_reference`, non nome, email o telefono.
- `NOT_AVAILABLE` indica dato assente; una cella vuota non deve essere trasformata in
  zero o `false`.
- Validare contract version, tipo, lunghezza, enum, workspace e ownership prima
  dell'import.
- Trattare tutte le celle come dati non fidati. Non eseguire formule importate:
  validare i campi numerici con un parser stretto e neutralizzare prefissi formula
  (`=`, `+`, `-`, `@`) nei campi testuali prima di aprire l'export in un foglio.
- Evidence reference e fingerprint sono identificatori, non contenuto raw.
- Non inserire prompt, password, secret, token, cookie, dati sensibili o note libere
  contenenti informazioni personali.
- Un export non autorizza contatto, invio, pagamento, spesa o pubblicazione.

Il template JSON è intenzionalmente bloccato. Dopo aver copiato il file in un'area
privata, compilare soltanto input verificati e validarlo con:

```text
npm run build
npm run revenue-os -- --input <percorso-privato>/revenue-mission.json
```

Il comando restituisce esclusivamente scorecard, formule, blocker e readiness; non
esegue contatti, invii, pagamenti o altre azioni esterne.

## Stato

```text
OPERATIONAL_DATA = NOT_AVAILABLE
EXTERNAL_ACTIONS = LOCKED
FAKE_PROOF = FORBIDDEN
FABIO_APPROVAL = REQUIRED
```
