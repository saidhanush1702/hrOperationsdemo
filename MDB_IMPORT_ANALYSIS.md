# Molina_Data.mdb → `demo_hr_operations` — Full Import Analysis

**Source:** `E:\updated_molina_data\Molina_Data.mdb` (30.3 MB, 36 tables, modified 2026-08-05)
**Target:** MySQL `demo_hr_operations` @ 127.0.0.1:3306 (38 tables)
**Staging:** MySQL `molina_legacy` (8 raw MDB tables + mapping helpers)
**Analysis date:** 2026-08-07

---

## 1. How the import actually works

```
Molina_Data.mdb  ──►  molina_legacy (raw staging)  ──►  backend/db/seeds/*.js  ──►  demo_hr_operations
                          8 tables only                  hand-written JS literals
```

The seeds are **not** a generic ETL. They are hand-generated JavaScript files containing
hard-coded row literals (`008_timesheets_seed.js` is 9,577 lines; `010_invoices_seed.js` is
4,827 lines). They were produced from an MDB snapshot at some earlier point and then
committed. Two consequences run through everything below:

- The seeds are a **point-in-time copy**, not a repeatable sync. Re-running them will not pick up MDB changes.
- The MDB now on disk is **newer than the import** (it contains records through 2026-07-19; the seed run wrote all legacy rows on **2026-07-18**). Some gaps are legacy-system activity after the cutover, not import bugs. Everything below is split accordingly.

### Staging fidelity: clean

`molina_legacy` is a faithful copy of the 8 tables it holds. Every aggregate matches the MDB exactly:

| Table | MDB rows | staging rows | MDB checksum | staging checksum |
|---|---|---|---|---|
| MOLINA_TIMESHEETSDAILY | 50,217 | 50,217 | Σhours 401,343.76 | 401,343.76 |
| MOLINA_TIMESHEETS | 9,527 | 9,527 | — | — |
| MOLINA_INVOICES | 4,701 | 4,701 | Σamt 26,533,819.87 | 26,533,819.87 |
| MOLINA_INVOICEITEMS | 4,733 | 4,733 | Σamt 26,533,819.87 | 26,533,819.87 |
| MOLINA_RECIEVEDPAYMENTS | 5,007 | 5,007 | Σamt 26,721,523.38 | 26,721,523.38 |
| MOLINA_INVOICEITEMPAYMENTS | 4,980 | 4,980 | Σamt 25,927,375.75 | 25,927,375.75 |
| MOLINA_PLACEMENTS | 211 | 211 | Σbill 38,914.6615 | 38,914.6615 |
| MOLINA_EMPLOYEE | 137 | 137 | — | — |

**All data loss happens in the seed layer, not in the MDB extract.**

---

## 2. Table coverage — 36 MDB tables

### Imported (8)

| MDB table | rows | erp destination | verdict |
|---|---|---|---|
| MOLINA_CLIENT | 154 | `clients` | complete |
| MOLINA_CLIENTCONTACT | 167 | `client_contacts` | 164 of 167 |
| MOLINA_PLACEMENTS | 211 | `placements` | 210 mapped 1:1 |
| MOLINA_EMPLOYEE | 137 | `employees` | 117 of 137 |
| MOLINA_USER | 161 | `users` | 119, 55 emails absent |
| MOLINA_TIMESHEETS | 9,527 | `timesheets` | 9,257 matched |
| MOLINA_TIMESHEETSDAILY | 50,217 | `timesheet_entries` | see §4 |
| MOLINA_INVOICES | 4,701 | `invoices` | 4,677 matched |

### Partially transformed / synthesized (2)

| MDB table | rows | erp destination | verdict |
|---|---|---|---|
| MOLINA_INVOICEITEMS | 4,733 | *(none)* | flattened into `invoices`; line detail lost |
| MOLINA_RECIEVEDPAYMENTS + MOLINA_INVOICEITEMPAYMENTS | 5,007 + 4,980 | `invoice_payments` | **fabricated, not imported** — see §5 |

### Never imported — 21 tables, 13,372 rows

| MDB table | rows | business meaning |
|---|---|---|
| MOLINA_ATTACHMENTS | 10,089 | document/file registry for every entity |
| MOLINA_VENDORINVOICES | 886 | accounts payable |
| MOLINA_NOTES | 857 | free-text notes on records |
| MOLINA_STATUS | 660 | status / workflow history |
| MOLINA_PHON | 294 | phone numbers per entity |
| MOLINA_VENDORINVOICEPAYMENTS | 167 | AP payments |
| MOLINA_BILL_PAY | 109 | bill payment records |
| MOLINA_COSTS | 109 | cost / margin per placement |
| MOLINA_MAILINGLIST | 47 | mailing lists |
| MOLINA_VENDORCONTACT | 36 | vendor contacts |
| MOLINA_VENDOR | 35 | vendor master |
| MOLINA_STATUSREPORTITEMS | 21 | status report lines |
| MOLINA_ADDRESS | 18 | address book |
| MOLINA_CANDIDATE | 13 | recruiting candidates |
| MOLINA_EXPENSEITEMS | 11 | expense lines |
| MOLINA_OB_DOCS | 7 | onboarding documents |
| MOLINA_IMMIG_PETITION | 6 | immigration petitions (H1B etc.) |
| MOLINA_OB_REQUESTS | 3 | onboarding requests |
| MOLINA_EXPENSES | 2 | expense headers |
| MOLINA_REQUIREMENT | 1 | job requirements |
| MOLINA_STATUSREPORTS | 1 | status reports |

The **entire accounts-payable side of the business** (vendors, vendor invoices, vendor
payments, bill-pay, costs — 1,342 rows) has no representation in the new system.

---

## 3. Master data

### Clients — clean
154 of 154 imported. One extra in erp (`Saferent Solutions LLC`) added after cutover.
Dropped columns: `PHONE` (105 populated), `FEDERALID` (3), `COSTCENTER`, `OWNERUSERID`,
`ACCOUNTMANAGERID`, `STATUSID`, `SUBSTATUSID`, `AGREEMENTFILE`. `FAX` carried correctly (87/87).

### Client contacts — 3 missing
164 of 167. Two are near-duplicates of the same person (`SaiRam Attla` / `SAiram Attla`);
one is a real loss: **Accounts Payable — accounts@asciigroup.com**.

### Employees — 20 missing + a systematic date bug

20 MDB employees absent, all internal/admin accounts (`HR Molina`, `Accounts Manager`,
`Conrep Admin`, and 13 `... (Conrep) null` staff records). Plausibly intentional, but confirm.

**🔴 `joining_date`: 53 of 114 employees have day and month swapped.** Verified exhaustively —
every single mismatch is exactly a `DD/MM` ↔ `MM/DD` transposition, zero other explanations.
The MDB stores `MM/DD/YYYY`; the seed generator parsed it as `DD/MM/YYYY`.

| employee_code | MDB (correct) | erp (wrong) |
|---|---|---|
| 1002 Manikumar Katiki Reddy | 2022-01-07 | 2022-07-01 |
| 1003 Keyur Rao Beeravally | 2022-01-03 | 2022-03-01 |
| 1022 Sairam Attla | 2017-06-05 | 2017-05-06 |
| 1025 Vishal Reddy Yerrabelly | 2017-09-04 | 2017-04-09 |
| 1026 Sai Kiran Alli | 2017-09-01 | 2017-01-09 |

Only rows where **both** day and month are ≤ 12 could be silently corrupted — which is exactly
why 53 of 114 are wrong and the rest happen to be right. This is not random.

**`termination_date`:** 43 correct, **14 swapped**, **25 overwritten with `2026-07-15`** (a bulk
termination that erased the real dates — e.g. Ganta Harsha's real 2025-03-31, Saiteja Gunda's
2023-01-13, Saikrishna B's 2022-12-31).

**`birth_date`:** 64 employees have a birth date in erp, but `MOLINA_EMPLOYEE.BIRTHDATE` is
**empty for all 137 rows** in the MDB. These values came from somewhere else — not from this file.

### Users — 55 of 161 absent
119 users in erp. 55 MDB user emails have no `users` row, including operational accounts
(`accounts@molinatek.com`, `timesheeets@molinatek.com`, `sravya@molinatek.com`,
`self@molinatek.com`) and client-side logins (`srikanth.s@svksystems.com`,
`contracts@stellaritgroup.com`). Anyone in that list loses access and history attribution.

### Placements — good
210 of 211 mapped 1:1. **7 bill-rate mismatches** and **11 end-date mismatches** against the MDB.
Dropped: `OVERTIMERATE`, `DOUBLETIMERATE`, `DISCOUNTPERCENT`/`DISCOUNTAMOUNT`, `VENDORNAME`,
`RECRUITERID`/`RECRUITINGLEAD`/`SALESREP`/`HRMANAGER`, `CITY`/`STATE`/`COUNTRY`,
`ENDCLIENTNAME`, `CLIENTREFTYPE1..2`/`CLIENTREFNUMBER1..2`.

---

## 4. Timesheets

| | MDB | erp |
|---|---|---|
| Timesheets | 9,527 | 9,931 |
| Matched (placement + start + end) | 9,257 | 9,257 |
| **MDB timesheets missing from erp** | **265** (9,950 hrs) | — |
| MDB timesheets unmappable (placement not mapped) | 5 | — |
| erp timesheets with no MDB source | — | 675 |

**All 265 missing timesheets predate the import** — none are post-cutover activity. They are
concentrated in a handful of placements, which suggests specific placements were skipped rather
than random row loss:

| placement | employee | missing | period | hours lost |
|---|---|---|---|---|
| 1033 | Dayakar Reddy Rajreddy | 142 | 2021-04-12 → 2023-12-31 | 5,368 |
| 1117 | Mallika Aalla | 41 | 2021-06-27 → 2022-04-09 | 1,480 |
| 1132 | Mallika Aalla | 41 | 2021-06-28 → 2022-04-10 | 1,416 |
| 1148 | Abinav Reddy Mareddy | 27 | 2021-09-27 → 2022-04-03 | 928 |
| 1134 | Tirumala Anjali | 6 | 2021-09-20 → 2021-10-29 | 170 |
| 1151 | Abhishek Reddy Vemula | 3 | 2021-07-01 → 2021-09-30 | 436 |
| 5 others | — | 5 | 2018 → 2021 | 152 |

Of the 675 erp timesheets with no MDB source, **593 were written by the import itself** on
2026-07-18 (phantom rows with no legacy counterpart) and only 59 were created after cutover.

**Hours on matched timesheets:** 46 mismatches, net **+215 hours** in erp (399 over, 184 under).

### Timesheet entries

| | MDB | erp |
|---|---|---|
| Rows | 50,217 | 57,481 |
| Non-zero-hour rows | 50,217 | 50,602 |
| Zero-hour skeleton rows | 0 | 6,879 |
| Σ hours | 401,343.76 | **404,844.76** (+3,501) |

The 6,879 zero-hour rows are deliberate — seed 009 fabricates a calendar skeleton for
timesheets with no MDB daily data (328 such timesheets). That is benign.

The **+3,501 extra hours** and **385 extra non-zero entries** are not. Also:
- **758** matched timesheets have a different number of day-rows than the MDB
- **115** matched timesheets have different entry hours
- **74** timesheets where `total_hours` ≠ `SUM(entries.hours)` — internally inconsistent

Nothing was lost from `HOURSCODE` (all 50,217 rows are `Regular`) or `NOTES` (all empty in MDB).

---

## 5. Invoices and payments — the serious problems

### Invoices

| | count | value |
|---|---|---|
| MDB invoices | 4,701 | 26,533,819.87 |
| Matched to erp | 4,677 | 26,373,919.44 |
| **MDB invoices missing from erp** | **24** | 159,900.43 |
| — of which dated before the import (real loss) | 19 | **128,980.43** |
| — of which dated after the import (legacy activity) | 5 | 30,920.00 |
| erp invoices with no MDB source | 146 | 1,949,508.60 |
| — app-generated `INV-*` (real post-cutover work) | 51 | 1,947,108.60 |
| — **legacy-numbered phantoms written by the import** | **95** | 2,400.00 |

The 95 phantom invoices carry legacy-style numbers (`1104737`, `1108134`, …) and were created
on 2026-07-18, but **no such invoice exists in the MDB**. They are near-all $0.00. This is the
clearest evidence the seeds were generated from a different MDB snapshot than the one on disk.

Largest genuinely-missed invoices: `1106121` $26,559.80, `1106521` $14,461.76,
`1106982` $12,797.80, `1107004` $11,200.00, `30023` $10,812.00.

**Value mismatches on matched invoices:** 7 invoices, $8,343.12 absolute. Two of them
(`33348`, `32473`) are MDB duplicate invoice codes that were silently collapsed — the MDB holds
$15,760 and $20,264 across two rows each; erp holds $10,720 and $10,184.

**🟡 `issue_date` is mapped from `INVOICESENTDATE`, not `INVOICEDATE`.** 4,674 of 4,677 match
`INVOICESENTDATE`; only 4,292 match `INVOICEDATE`. So **385 invoices show the sent date where
the accounting date differs**. This is a mapping decision, not corruption — but it needs a
ruling, because `issue_date` drives aging.

**Voided invoices:** the MDB's 11 `VOIDINVOICE=1` rows land as status `Not Ready` (id 1).
There is no void status in `lkp_invoice_statuses`, so voids are indistinguishable from drafts.

### Invoice line items — dropped entirely

`MOLINA_INVOICEITEMS` (4,733 rows) has **no destination table**. `invoices` carries a single
`bill_rate`/`total_hours`/`total_amount` triple. Consequences:
- 24 multi-line invoices flattened to one line
- All 4,733 line descriptions lost
- 11 invoices have a `bill_rate` that disagrees with the MDB line item; 20 disagree on hours

### 🔴 Payments — synthesized, not imported

`backend/db/seeds/012_invoice_payments_seed.js` does not read payment data at all. For every
invoice with `status_id = 6`, it inserts **one** payment row with:

```js
amount        = invoice.total_amount     // not the actual amount paid
payment_date  = invoice.paid_date        // which itself came from INVOICESENTDATE
payment_type  = 1                        // 'Cash', hard-coded
comment       = NULL
```

Measured against the real MDB payment chain (`MOLINA_INVOICEITEMPAYMENTS` → `MOLINA_RECIEVEDPAYMENTS`):

| check | result |
|---|---|
| erp payment rows | 4,593 vs 4,980 real applications + 5,007 receipts |
| **payment dates that are correct** | **59 of 4,592 (1.3 %)** |
| average date error | **57 days** (max 1,793 days) |
| direction of error | 3,908 too early, 366 too late |
| invoices with 2–6 partial payments in MDB | **303**, all collapsed to a single row |
| invoices where erp amount ≠ MDB applied | **101**, net **+$24,099.73** overstated |
| erp "Paid" invoices with no MDB payment at all | 6 |
| check numbers dropped | 1,160 |
| check dates dropped | 5,003 |
| payment descriptions dropped | 306 |
| payment type | 4,582 forced to `Cash`; 1,160 of those were cheques |
| **unapplied receipts absent from erp** | **98 payments, $677,874.99** |

Worst single cases: invoice `1110526` erp records $10,400 against $31,200 actually applied;
`1106602` records $13,944 against $2,656; `32694` records $11,050 paid with **zero** MDB payments.

Anything that reads `invoice_payments` — AR aging, DSO, cash-flow, collections, revenue
recognition by period — is producing wrong numbers today.

---

## 6. Attachments — no destination table

`MOLINA_ATTACHMENTS` has 10,089 rows. `demo_hr_operations` has no attachments table. The schema
allows exactly one file per timesheet (`timesheets.attachment_url`) and one per invoice
(`invoices.invoice_file_path`).

| category | MDB attachments | distinct records | erp holds | unreachable |
|---|---|---|---|---|
| Timesheet | 7,203 | 3,607 | 3,558 URLs | **3,645** |
| Invoices | 1,797 | 1,609 | 1,430 paths | **367** |
| 22 other categories | 1,089 | — | 0 | **1,089** |

The other categories include Vendor Invoices (225), Placement (77), Client (32), Onboarding
Documents (20), Candidates (13), Employee (7) and **LCA (6)** — LCA documents are an
immigration-compliance record.

### Broken links in what *was* imported

| | rows with a path | file present on disk | **missing** |
|---|---|---|---|
| `timesheets.attachment_url` | 3,558 | 3,112 | **446** |
| `invoices.invoice_file_path` | 1,430 | 941 | **489** |

935 links point at files that do not exist under `backend/blob` or `backend/uploads`. Two
distinct causes are visible: `?` characters in filenames from macOS screenshots
(`Screenshot_2025_12_17_at_1_37_38?PM.png`) and dated paths (`2022/11/23/...`) whose directory
tree was never copied across.

---

## 7. Financial reconciliation

| Metric | MDB | erp | Δ |
|---|---:|---:|---:|
| Invoiced $ — all rows | 26,533,819.87 | 28,305,988.92 | +1,772,169.05 |
| Invoiced $ — matched rows only | 26,373,919.44 | 26,377,384.32 | **+3,464.88** |
| Cash received $ | 26,721,523.38 | 25,571,743.80 | **−1,149,779.58** |
| Cash applied to invoices $ | 25,927,375.75 | 25,571,743.80 | **−355,631.95** |
| Timesheet hours | 401,343.76 | 404,844.76 | **+3,501.00** |
| Billed hours on invoices | 399,437.36 | 401,944.36 | +2,507.00 |

The +$1.77M on total invoiced is legitimate post-cutover business ($1.95M of `INV-*` invoices,
less the missing legacy ones). The other five deltas are import defects.

---

## 8. Priority list

**P0 — wrong money, fix before anyone trusts a financial report**
1. Rebuild `invoice_payments` from `MOLINA_INVOICEITEMPAYMENTS` + `MOLINA_RECIEVEDPAYMENTS`:
   real amounts, real received dates, one row per actual payment, real payment type,
   check number and description preserved.
2. Recompute `invoices.paid_date` from the actual payment chain instead of `INVOICESENTDATE`.
3. Load the 98 unapplied receipts ($677,874.99) — decide whether they become credits or
   unapplied cash.
4. Reconcile the 101 invoices whose collected amount disagrees with the MDB.

**P1 — wrong master data**
5. Fix the 53 swapped `joining_date` values and 14 swapped `termination_date` values
   (deterministic: re-parse `MM/DD/YYYY` from `molina_legacy.MOLINA_EMPLOYEE`).
6. Restore the 25 termination dates overwritten with `2026-07-15`.
7. Establish where the 64 `birth_date` values came from — they are not in this MDB.
8. Import the 265 missing timesheets (9,950 hours) and the 19 missing pre-cutover invoices
   ($128,980.43).
9. Investigate and remove the 593 phantom timesheets and 95 phantom invoices the import created.

**P2 — structural gaps**
10. Add an attachments table; 5,101 files currently have nowhere to live.
11. Repair the 935 broken file links (URL-encode `?`, restore the dated directory tree).
12. Decide on the AP module (vendors, vendor invoices, vendor payments, bill-pay, costs — 1,342 rows).
13. Add an invoice line-items table, or accept the loss of 4,733 descriptions and 24 multi-line invoices.
14. Add a void status so the 11 voided invoices are not shown as drafts.
15. Rule on `issue_date` = `INVOICESENTDATE` vs `INVOICEDATE` (385 invoices affected).
16. Reconcile the 55 missing user accounts and 20 missing employee records.
17. Fix the 74 timesheets where `total_hours` ≠ `SUM(entries.hours)`.

**Process**
18. Replace the hand-generated seed literals with a repeatable ETL driven off `molina_legacy`,
    with row-count and checksum assertions per table. The current seeds cannot be re-run against
    an updated MDB, which is why the file on disk has already drifted from what was imported.
