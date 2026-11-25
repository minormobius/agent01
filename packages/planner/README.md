# planner — a research harness for centrally planning Milwaukee

The question: if one planner (an AI, specifically) held every parcel and enterprise in a
mid-sized American city, could it run that city's economy better than what actually
happened? This only has an answer if the planner is judged against a **replay of the
real city**. So the harness is built in this order, and only the first stage exists yet:

1. **Data.** A reproducible, validated record of Milwaukee 1975–2025: every parcel, every
   year; county jobs and wages by industry; output, income and population; how industries
   buy from each other. ← *this package, today*
2. **Simulator.** A city-as-ledger model calibrated on that record, which must reproduce
   the real 2000–2024 under the real history before it is trusted with anything else.
3. **Planner.** It takes over from a chosen year, publishes every decision to a ledger, and
   is scored against both the real Milwaukee and a do-nothing baseline.
4. **Adversary.** Agents that misreport to the planner. The planner can't be paid off, but
   it can be lied to, and that is how central planning has actually failed.

Why Milwaukee: half a million people; an open parcel file for every year since 1975;
an economy that moved a lot (county manufacturing went from 155k to 48k jobs), so the
history has real shocks to test against. And from 1910 to 1960 it was governed by the Sewer
Socialists, the closest American precedent for a municipally owned, meticulously audited
city.

## Run it

```bash
node fetch.mjs          # ~3 GB into data/raw/ (gitignored, never served); pins hashes in data/sources.lock.json
node build/all.mjs      # every derived table, then build/validate.mjs
node build/validate.mjs # the checks alone; reads only committed files, so it runs without data/raw/
```

No npm dependencies. Node 22. `build/io.py` needs Python with `openpyxl`, only because
BEA publishes the input-output tables as `.xlsx`. `fetch.mjs --verify` re-hashes the raw
cache against the lock, and a publisher's silent revision shows up as `DRIFT`.

## What is here

Every input is listed in [`sources.json`](sources.json). Nothing in `data/derived/` comes
from anywhere else, except four decennial population counts typed into
[`data/manual/decennial-city.json`](data/manual/decennial-city.json).

| Derived file | Geography | Years | What it is |
|---|---|---|---|
| `mprop-annual.json` | city | 1975–2025 (no 1981) | The city's property ledger per year: parcels and assessed land/improvement value by assessment class, and every tax-exempt holder (city, Housing Authority, redevelopment authority, city tax-deed foreclosures, MPS, county, state, federal, churches, hospitals…) with parcel counts, exempt value and acreage. Also housing units, single-family owner-occupancy, median single-family assessment, new construction, and sales implied by the 0.3% transfer fee. Carries a `quality` block: **read it first** |
| `mprop-tract.csv` | city × census tract | 1975–2025 | The same ledger per tract (tract boundaries change with each census vintage) |
| `mprop-profile.json` | city | 1975–2025 | Per year: which raw column every canonical field came from, fill rates, and value distributions. The evidence behind each normalisation |
| `mprop-exempt-crosswalk.json` | — | 1975–83, 2004 | The inferred map for exemption codes no codebook explains (method below) |
| `qcew-county.csv` | county | SIC 1975–2000, NAICS 1990–2024 | Establishments, employment and wages by ownership (federal / state / local / private) and industry, down to 3-digit. The 1990–2000 overlap is the bridge between the two industry codings |
| `lodes.csv` | city **and** county | 2002–2023 | Jobs located in, and held by residents of, each geography, by NAICS sector and earnings band. **The bridge between the city and the county.** The city has ~57% of county jobs |
| `bea-county.json` | county | 1969–2024 | BEA personal income, the economic profile (transfers, dividends/interest/rent, wages), earnings by industry (SIC to 2000, NAICS after), employment, GDP by industry 2001+ |
| `population.json` | city and county | city 1960–2024, county 1969–2024 | Population. Overlapping estimate vintages are kept and their disagreement recorded |
| `io-{use,make}-{summary,sector}.json` | US | 1997–2023 | BEA national Use and Make tables, after redefinitions, producers' prices. These are the production recipes, still to be regionalised to Milwaukee |

`data/work/mprop/<year>.ndjson.gz` (not committed; `build/mprop.mjs` rebuilds it) is the
canonical **parcel panel**, one harmonised record per parcel per year. That is what the
simulator will read.

## Fifty years of MPROP, and what it took to read them

The assessor's file changed layout about ten times. [`lib/mprop-schema.mjs`](lib/mprop-schema.mjs)
lists every spelling of every field (`CURLNDAS` → `CALAND` → `C_A_LAND` → `TotalLandValue`,
plus shapefile-truncated forms like `C_A_EXM_TY`). Things the data does that you would
not guess:

- **Exemption codes come in three encodings.** 1984–2003 stores them divided by ten (`48`
  = 480 municipal), which is detected per year and rescaled. 1975–1983 uses letters (`P6`,
  `M2`, `A1`…) for which no codebook survives. They are decoded by following each parcel
  forward to its 1984 code. Most letters decode at over 90% purity (`P6` → city tax-deed, `A1` →
  religious, `W` → schools, `P3` → Housing Authority). 2004 uses a numbering found in no
  other year, so it is resolved per parcel wherever 2003 and 2005 agree on the holder.
- **Exempt parcels carry no value before 1984**, and the published 2022 file has lost most
  exempt values.
- **Sale dates** are YYMM until 2000 (leading zero dropped after 2000), then mostly
  destroyed by a spreadsheet export from 2007 (`00:00.0`), and gone from 2021. Sales
  counts exist for 1978–2006 and 2014–2020.
- **Housing units are polluted** in 1975–80 (incomplete) and 2019–21 (hotel rooms and beds
  booked as units in commercial classes). The headline counts classes 1/5/7 only.

Each of these is flagged in `mprop-annual.json → quality`. None of them is silently patched.

## What the data already says

- The city already owns a lot of itself. Public bodies hold ~3,200 parcels in 1975 and
  ~6,300 in 2025. The largest single holding is **city tax-deed property**, homes the city
  took for unpaid taxes: ~900 in 1975, a peak of ~4,300 in 2021, ~3,400 now. Any central
  planner starts with an inventory the city already holds and has not been able to place.
- Single-family owner-occupancy fell from ~79.6k homes (1985) to ~66.6k (2020), as the
  single-family stock stayed flat at ~88k. The houses stayed; owners became landlords.
- Residential new construction collapsed to ~30 units in 2015 and recovered to ~1,700 in 2025.
- County manufacturing fell from 155k jobs (1975) to 48k (2023), while total county
  employment barely moved (453k → 467k). The economy changed what it made, not how many it employed.

## Not done yet (honest list)

- **ACS** (tract income, rent, tenure, commuting) needs a Census API key, and the
  sandbox proxy can only inject header credentials, while Census takes the key as a query parameter.
- **City budget and finance** (Census of Governments individual-unit files, the city's
  budget books) are not fetched yet. That is the public-sector ledger the planner inherits.
- **Prices**: nothing is deflated yet. A CPI/PCE series is the next source to add.
- The input-output tables are national. Regionalising them (location quotients from
  `qcew-county.csv`, then the city share from `lodes.csv`) is the first simulator step.
- Assessed value is not market value in every year. The city revalues on its own cycle, so
  some jumps are revaluations. Sales prices implied by the transfer fee are the check on that.
