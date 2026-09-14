# Invoices — MDB → local DB sync verification

**Source file:** `E:\updated_molina_data\Molina_Data.mdb`
`30,330,880 bytes` · modified `2026-08-05 22:39:27` · SHA-256 `0c9919a63e2515c552f121e1aff205ca815a0c8d0c2fe3c9da8ef7ed963512be`
Read through the Microsoft Access ODBC driver, table `MOLINA_INVOICES` + `MOLINA_INVOICEITEMS`.

**Target:** MySQL `demo_hr_operations` @ `127.0.0.1:3306`, table `invoices` (+ `invoice_payments`).

**Method:** every one of the 4,701 MDB invoice rows was read straight out of the .mdb and compared
field-by-field against the local row with the same invoice number. The `molina_legacy` staging
copy was independently verified row-by-row against the .mdb first — 4,701/4,701 rows, zero value
differences — so staging and the file agree completely.

Extra invoices that exist only in the local DB are ignored, as requested.

---

## Verdict

**The invoice *headers* are close to fully synced. The invoice *money-in* data is not.**

| | result |
|---|---|
| MDB invoices | 4,701 rows (4,699 distinct invoice numbers) |
| Present in local DB | **4,677 — 99.49 %** |
| Absent from local DB | **24 — $159,900.43** |
| Header fields correct | 99.5 – 100 % on amount, dates, client, placement |
| Hours / bill-rate correct | 99.6 % / 99.8 % |
| **Payment date correct** | **118 of 4,677 — 2.52 %** |
| **Payment amount correct** | 4,554 of 4,677 — 97.37 % |
| **Payment row count correct** | 4,343 of 4,677 — 92.86 % |

---

## 1. Completeness — 24 invoices never loaded

| invoice | MDB date | MDB amount | cash applied in MDB |
|---|---|---:|---:|
| 1106121 | 2023-04-14 | 26,559.80 | 26,559.80 |
| 1106521 | 2023-06-14 | 14,461.76 | 14,461.76 |
| 1112982 | 2026-07-19 | 13,200.00 | — |
| 1112981 | 2026-07-14 | 12,848.00 | — |
| 1106982 | 2023-08-07 | 12,797.80 | 12,797.80 |
| 1107004 | 2023-08-31 | 11,200.00 | 10,752.00 |
| 30023 | 2021-07-01 | 10,812.00 | 10,812.00 |
| 1112986 | 2026-07-19 | 10,752.00 | — |
| 1112988 | 2026-07-14 | 10,500.00 | — |
| 32518 | 2022-08-03 | 8,341.67 | 8,341.67 |
| 1112632 | 2026-04-21 | 7,500.00 | — |
| 30890 | 2019-07-05 | 6,600.00 | 6,600.00 |
| 32517 | 2022-08-03 | 5,033.60 | 5,033.60 |
| 1113021 | 2026-07-19 | 2,720.00 | — |
| 1113022 | 2026-07-19 | 2,360.00 | — |
| 1113002 | 2026-07-19 | 1,888.00 | — |
| 33147 | 2022-08-03 | 775.30 | 775.30 |
| 32431 | 2022-08-03 | 775.30 | 775.30 |
| 30095 | 2021-07-01 | 388.00 | 388.00 |
| 30932 | 2019-07-05 | 387.20 | 387.20 |
| 1108264 | 2024-01-04 | 0.00 | — |
| 1108381 | 2024-01-03 | 0.00 | — |
| 1108464 | 2024-01-03 | 0.00 | — |
| 1108421 | 2024-01-03 | 0.00 | — |

Split by whether they predate the import (the seed run wrote every legacy invoice on **2026-07-18**):

- **19 invoices, $128,980.43 — dated before the import. These are genuine misses.**
  15 of them were fully paid in the legacy system, so real collected cash is missing too.
- 5 invoices, $30,920.00 — dated 2026-07-19 or later, i.e. raised in the legacy system *after*
  the cutover. Not an import bug, but they still need to be brought across.

## 2. Two MDB invoices exist twice and were silently collapsed

| invoice number | MDB rows | MDB total | local DB holds | lost |
|---|---|---:|---:|---:|
| 33348 | 2 | 15,760.00 | 10,720.00 | 5,040.00 |
| 32473 | 2 | 20,264.00 | 10,184.00 | 10,080.00 |

The local `invoices.invoice_number` can only hold one row per number, so the second MDB row was
dropped. These same two invoices are also the *only* two with a wrong `client_id` and the *only*
two with a wrong `placement_id` — the surviving row took the other invoice's client and placement.
$15,120 unaccounted for.

## 3. Field-by-field accuracy across the 4,677 synced invoices

| local column | MDB source | wrong | correct | accuracy |
|---|---|---:|---:|---:|
| `total_amount` | `INVOICEAMOUNT` | 8 | 4,669 | 99.83 % |
| `issue_date` | `INVOICESENTDATE` | 3 | 4,674 | 99.94 % |
| `due_date` | `DUEDATE` | 2 | 4,675 | 99.96 % |
| `period_start` | `STARTDATE` | 2 | 4,675 | 99.96 % |
| `period_end` | `ENDDATE` | 2 | 4,675 | 99.96 % |
| `client_id` | `CLIENTID` | 2 | 4,675 | 99.96 % |
| `placement_id` | `PLACEMENTID` | 2 | 4,675 | 99.96 % |
| `total_hours` | `INVOICEITEMS.HOURS` | 20 | 4,657 | 99.57 % |
| `bill_rate` | `INVOICEITEMS.BILLRATE` | 11 | 4,666 | 99.76 % |
| **`paid_date`** | real received-payment date | **4,559** | **118** | **2.52 %** |
| **collected amount** | `INVOICEITEMPAYMENTS` | **123** | 4,554 | 97.37 % |
| **payment row count** | `INVOICEITEMPAYMENTS` | **334** | 4,343 | 92.86 % |

### 3a. `total_amount` — 8 wrong

| invoice | MDB | local | difference |
|---|---:|---:|---:|
| 1112924 | 10,944.00 | **60.00** | −10,884.00 |
| 33348 | 5,040.00 | 10,720.00 | +5,680.00 (duplicate collapse) |
| 1112754 | 12,672.00 | 10,560.00 | −2,112.00 |
| 1106035 | 10,383.12 | 10,120.00 | −263.12 |
| 30238 | 2,600.00 | 2,720.00 | +120.00 |
| 32473 | 10,080.00 | 10,184.00 | +104.00 (duplicate collapse) |
| 30005 | 1,680.00 | 1,632.00 | −48.00 |
| 30004 | 560.00 | 544.00 | −16.00 |

### 3b. `issue_date` is taken from `INVOICESENTDATE`, not `INVOICEDATE`

Against `INVOICESENTDATE` it is 99.94 % correct. Against `INVOICEDATE` only 91.77 % — **385
invoices carry a different date in the two MDB columns**, and the local DB shows the *sent* date.
This is a deliberate mapping choice in the seed, not corruption, but it drives ageing and needs a
ruling. Three invoices match neither column: `33348`, `32473` (the duplicates) and `1110972`
(where `INVOICESENTDATE` is null and the local DB used `INVOICEDATE`).

### 3c. Dates / client / placement — 2 wrong each

All of them are `33348` and `32473`. Everything else is exact.

### 3d. `total_hours` and `bill_rate` — root cause found

The defect is confined almost entirely to **multi-line invoices**:

| MDB line items | invoices | wrong hours | wrong rate |
|---:|---:|---:|---:|
| 1 | 4,656 | 2 | 2 |
| 2 | 18 | **17** | 8 |
| 3 | 1 | 0 | 0 |
| 5 | 1 | 0 | 0 |
| 6 | 1 | **1** | 1 |

There is no invoice-line table in the local schema, so a multi-line invoice must be flattened
into one `total_hours` / `bill_rate` / `total_amount` triple — and the seed picked **one arbitrary
line instead of aggregating**. Worked examples:

**1106035** — MDB has 2 lines:
`184 h @ $55.00 = $10,120.00` ("Swetha Maheswaram: 03/01–03/31/2023") and
`1 h @ $263.12 = $263.12` ("Discount not deducted").
Local DB stored `hours = 1`, `bill_rate = 263.12`, `total_amount = 10,120.00` — hours and rate
from the second line, amount from the first.

**1112924** — MDB has 2 lines:
`152 h @ $60.00 = $9,120.00` and `Administrative Fee $1,824.00` (null hours).
Local DB stored `hours = 1`, `bill_rate = 1,824.00`, **`total_amount = 60.00`** — the amount field
picked up line 1's *bill rate*. The invoice is worth $10,944 and the system thinks it is $60.

**1106918** — MDB has 6 weekly lines totalling `160 h = $12,800.00`.
Local DB stored `hours = 0`, `bill_rate = 0`, `total_amount = 12,800.00` — it took the first line,
which happens to be the zero-hour 07/01–07/02 stub.

**28 local invoices now fail the basic check `total_hours × bill_rate = total_amount`.**

### 3e. Voided invoices

11 invoices carry `VOIDINVOICE = 1` in the MDB (`1108917`, `1109158`, `1109377`, `1109678`,
`1109779`, `1109919`, `1110059`, `1110200`, `1110814`, `1110972`, `1111351` — $125,700 total).
All 11 land as `status_id = 1` = **"Not Ready"**. `lkp_invoice_statuses` has no void state, so a
voided invoice is indistinguishable from an unfinished draft.

---

## 4. Payment / collection data — the real failure

`backend/db/seeds/012_invoice_payments_seed.js` never reads the MDB payment tables. For every
invoice it finds with `status_id = 6` it inserts exactly one synthetic row:

```js
amount       = invoice.total_amount    // not what was actually received
payment_date = invoice.paid_date       // which was itself set from INVOICESENTDATE
payment_type = 1                       // 'Cash', hard-coded
```

Checked against the real chain `MOLINA_INVOICEITEMPAYMENTS → MOLINA_RECIEVEDPAYMENTS`:

| check | result |
|---|---|
| `paid_date` equals the real received date | **118 of 4,677 (2.52 %)** |
| average error on the rest | **57 days** (worst 1,793 days) |
| invoices paid in instalments in the MDB | **303** (2–6 payments), all collapsed to one row |
| invoices where the recorded amount ≠ cash actually applied | **123** |
| cheque numbers dropped | 1,160 |
| cheque dates dropped | 5,003 |
| payment descriptions dropped | 306 |
| received payments never applied to any invoice | 98, **$677,874.99** — absent entirely |

## 5. Invoice header fields with no column in the local schema

| MDB column | populated rows | meaning |
|---|---:|---|
| `NETTERMS` | 4,701 | payment terms |
| `MANUALINVOIE` | 4,701 | manual-invoice flag |
| `INVOICED` | 4,701 | invoiced flag |
| `APPROVEDON` | 4,701 | approval date |
| `BILLINGCLIENTNAME` | 4,696 | billing client |
| `BILLINGCONTACTNAME` | 4,696 | billing contact |
| `BILLINGEMAIL` | 4,696 | billing email |
| `BILLTO` | 4,672 | bill-to name |
| `BILLINGADDRESS` | most | billing address |
| `NOTES` | 1 | invoice note |

`PONUMBER`, `CLIENTPO`, `REASONFORVOID` and `EXPENSEID` are empty in this MDB, so nothing is lost there.

Also fully dropped: all **4,733 `MOLINA_INVOICEITEMS` rows** — every line description
(`"Swetha Maheswaram: 03/01/2023 - 03/31/2023"`, `"Administrative Fee"`, `"Discount not deducted"`)
and the per-line breakdown.

---

## 6. Money reconciliation — invoices only

| | MDB | local DB | difference |
|---|---:|---:|---:|
| Total invoiced (all MDB invoices) | 26,533,819.87 | 26,366,500.32 | **−167,319.55** |
| — value of invoices never loaded | — | — | 159,900.43 |
| — value lost to duplicate collapse | — | — | 15,120.00 |
| — net of individual amount errors | — | — | +7,700.88 |
| Cash applied to these invoices | 25,874,875.25 | 25,584,487.80 | **−290,387.45** |
| Unapplied receipts | 677,874.99 | 0.00 | **−677,874.99** |

---

## 7. What to fix, in order

1. **Load the 19 missing pre-cutover invoices** ($128,980.43) and their payments; then decide on
   the 5 post-cutover ones ($30,920.00).
2. **Rebuild `invoice_payments` from the MDB payment chain** — real amount, real received date,
   one row per actual payment, real payment type, cheque number and description retained. Then
   recompute `invoices.paid_date` from it. This is the single biggest correctness win: 97 % of
   payment dates are wrong today, so ageing, DSO and cash-flow reports are all unreliable.
3. **Load the 98 unapplied receipts** ($677,874.99).
4. **Fix the 21 multi-line invoices** — aggregate hours and derive a weighted bill rate instead of
   taking one arbitrary line. `1112924` is urgent: it shows $60 instead of $10,944.
5. **Resolve the two duplicate invoice numbers** (`33348`, `32473`) — $15,120 and the only wrong
   client/placement/period values in the whole table.
6. **Add a void status** so the 11 voided invoices stop looking like drafts.
7. **Decide `issue_date`**: `INVOICESENTDATE` (current) or `INVOICEDATE` — 385 invoices differ.
8. **Add an invoice line-items table** if the per-line detail matters; otherwise accept the loss
   of 4,733 descriptions.
9. Add columns for `NETTERMS`, `BILLTO`, billing contact/email, and `APPROVEDON` if the business
   needs them on the invoice.

---

## Correction to the earlier whole-database report

`MDB_IMPORT_ANALYSIS.md` reported **66 invoices with a wrong `placement_id`**. That was my error,
not the import's. The placement map I built from `molina_legacy.placement_map` keys on
employee + start-date only, and three employees each have two placements starting on the same day
(Dayakar Reddy Rajreddy, Mallika Aalla, Abinav Reddy Mareddy). The map paired all six backwards.

Rebuilt on employee + start + end + bill-rate, the real figure is **2 invoices**, both being the
duplicate-number pair above. The import assigns placements correctly.

The same bad map also inflated the "265 missing timesheets" figure in that report — those misses
were concentrated in exactly the six mis-paired placements. **That timesheet number needs redoing
before it is relied on.** Everything in the present invoice document uses the corrected map.
