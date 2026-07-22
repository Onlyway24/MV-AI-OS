# Onlyway Pricing & Unit Economics Template

**Contract:** `ONLYWAY_UNIT_ECONOMICS_V1`

**Stato:** `DRAFT_INTERNAL`

**Valori economici correnti:** `NOT_AVAILABLE`

Questo modello serve a rendere visibili input, formule e sensibilità. Non fornisce
consulenza fiscale o finanziaria e non sceglie il prezzo per Fabio.

## Regola di calcolo

Un output numerico esiste soltanto quando tutti gli input della sua formula sono:

1. disponibili;
2. nella stessa valuta e finestra temporale;
3. attribuiti a una fonte o decisione;
4. approvati per lo scenario.

Altrimenti l'output è `NOT_AVAILABLE`, non zero.

## Input per unità/cliente

| Codice | Input | Unità | Valore | Fonte/decisione | Data |
| --- | --- | --- | --- | --- | --- |
| `P` | Prezzo incassato al netto di imposte pass-through | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `D` | Sconti medi effettivi | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `R` | Rimborsi/chargeback attribuiti | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `F_pct` | Fee pagamento percentuale | percentuale | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `F_fix` | Fee pagamento fissa | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `C_goods` | Costo beni/licenze per unità | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `H_delivery` | Ore delivery variabili | ore | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `C_hour` | Costo pieno per ora | valuta/ora | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `C_tools` | Tool/API variabili attribuiti | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `C_support` | Supporto variabile | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `CAC` | Costo acquisizione misurato | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `Fixed` | Costi fissi nella finestra | valuta | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `Capacity` | Unità/clienti erogabili nella finestra | numero | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| `Target_CM2` | Contribuzione minima desiderata dopo CAC | valuta | `NOT_AVAILABLE` | Fabio | `NOT_AVAILABLE` |

Imposte, contributi e IVA entrano solo secondo indicazioni professionali o dati
forniti da Fabio. Non dedurli dal paese o dal tipo di offerta.

## Formule canoniche

```text
PaymentFee = (P × F_pct) + F_fix
NetRevenue = P - D - R
VariableDelivery = C_goods + (H_delivery × C_hour) + C_tools + C_support
CM1 = NetRevenue - PaymentFee - VariableDelivery
CM1_Percent = CM1 / NetRevenue
CM2 = CM1 - CAC
CM2_Percent = CM2 / NetRevenue
MaxSustainableCAC = CM1 - Target_CM2
BreakEvenUnits = ceil(Fixed / CM1)             solo se CM1 > 0
CapacityRevenue = Capacity × NetRevenue
CapacityContributionBeforeCAC = Capacity × CM1
```

Non calcolare percentuali con denominatore nullo. Con `CM1 <= 0`, il break-even è
`BLOCKED_NEGATIVE_UNIT_CONTRIBUTION`, non infinito e non zero.

Per ricavi ricorrenti, aggiungere soltanto con dati osservati:

```text
MonthlyContributionPerCustomer = MonthlyNetRevenue - MonthlyVariableCost
CACPaybackMonths = CAC / MonthlyContributionPerCustomer
ObservedLTV = somma della contribuzione realmente osservata per coorte
```

Non usare `ARPU / churn` come LTV “reale” senza esplicitare che è un modello e senza
una coorte sufficientemente osservata.

## Scenari

Compilare il CSV `assets/revenue-os/pricing-unit-economics-template.csv`.

| Scenario | Scopo | Input |
| --- | --- | --- |
| Prudente | Stressare prezzo, domanda, refund e carico delivery | `NOT_AVAILABLE` |
| Base | Ipotesi più supportata dalle evidenze correnti | `NOT_AVAILABLE` |
| Ambizioso | Esplorare upside senza chiamarlo forecast | `NOT_AVAILABLE` |

Uno scenario non è una previsione. Ogni cella deve conservare origine e confidence.

## Capacità e prezzo minimo operativo

Prima di approvare il prezzo, verificare:

- ore reali di onboarding, delivery, revisione e supporto;
- limite clienti simultanei senza abbassare gli acceptance criteria;
- costo opportunità del tempo di Fabio;
- costi fissi attribuibili e tool/API;
- ritardi, refund e rework osservati;
- margine minimo deciso da Fabio;
- eventuale buffer, dichiarato come decisione e non come fatto.

Il prezzo minimo operativo può essere calcolato solo dopo questi input. Finché manca
un valore obbligatorio: `MINIMUM_OPERATING_PRICE = NOT_AVAILABLE`.

## Sensitivity test

Cambiare una variabile per volta e registrare:

| Variabile | Valore corrente | Variazione testata | CM1 | CM2 | Decisione |
| --- | --- | --- | --- | --- | --- |
| `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |

Ordine minimo: prezzo, ore delivery, costo orario, refund, fee, CAC, capacità. Un
risultato senza input completo resta `NOT_AVAILABLE`.

## Reconciliation

Ogni periodo chiuso confronta:

| Voce | Stimato | Riservato | Effettivo | Da riconciliare | Fonte |
| --- | --- | --- | --- | --- | --- |
| Ricavi | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Fee | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Delivery | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Tool/API | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |
| Acquisizione | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | `NOT_AVAILABLE` |

`stimato`, `riservato`, `effettivo` e `da riconciliare` non sono intercambiabili.

## Reason code

- `ECONOMICS_INPUT_REQUIRED`
- `ECONOMICS_SOURCE_STALE`
- `ECONOMICS_UNIT_MISMATCH`
- `ECONOMICS_CURRENCY_MISMATCH`
- `NEGATIVE_UNIT_CONTRIBUTION`
- `CAPACITY_NOT_VALIDATED`
- `TAX_TREATMENT_NOT_AVAILABLE`
- `FABIO_PRICING_DECISION_REQUIRED`

## G2 approval checklist

- [ ] Input completi e source-linked per scenario.
- [ ] Valuta, unità e finestra temporale coerenti.
- [ ] Costi di lavoro e rework inclusi.
- [ ] Tool/API classificati come stimati, riservati o effettivi.
- [ ] Capacità coerente con lo scope.
- [ ] CM1 e CM2 disponibili e positivi per il caso approvato.
- [ ] Sensitivity test completato.
- [ ] Trattamento fiscale esplicitamente fornito oppure marcato `NOT_AVAILABLE`.
- [ ] Finance Agent verifica formule; non decide il prezzo.
- [ ] Fabio approva prezzo e scenario esatti.

Senza tutte le voci obbligatorie: `G2 = BLOCKED`.
