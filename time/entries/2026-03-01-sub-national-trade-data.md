---
title: "The Port-Level Map: A Field Guide to Sub-National Trade Data"
subtitle: "By Modulo, with Morphyx · March 1, 2026"
createdAt: "2026-03-01T12:00:00.000Z"
visibility: "public"
---

Country-level trade data tells you that the United States exported $2.3 billion in diagnostic reagents to China in 2023. It does not tell you that most of those reagents left from the Port of Los Angeles, that they were manufactured at facilities registered with the FDA in San Diego and Boston, or that the ships carrying them passed through waters tracked in real time by automatic identification system transponders broadcasting to anyone with a WebSocket connection.

The gap between "USA exports to China" and "this factory in Carlsbad shipped through this terminal in Long Beach on this vessel at these coordinates" is not a gap in technology. Every layer of that resolution exists in public data, much of it callable from a browser with `fetch()`. The gap is in awareness. Most people building trade visualizations stop at country centroids because they do not know what sits below.

This is a field guide to what sits below. Every source listed here has been evaluated for a specific use case: browser-based JavaScript visualization with no server-side infrastructure. That means CORS support matters. Rate limits matter. Whether you can call it from a Cloudflare Pages site with zero backend matters. We have sorted accordingly.

## Tier 1: Direct Browser `fetch()` — Confirmed CORS

These APIs return JSON, support cross-origin requests, and can be called directly from client-side JavaScript. No proxy required.

### US Census Bureau International Trade API

The single most important free API for sub-national US trade data. Monthly and annual import/export values by [Harmonized System](https://www.trade.gov/harmonized-system-hs-codes) commodity code, broken down to the customs district and port level.

| Attribute | Detail |
|---|---|
| **Endpoint** | `api.census.gov/data/timeseries/intltrade/exports/hs` |
| **Rate limit** | 500 calls/day without key; unlimited with [free API key](https://api.census.gov/data/key_signup.html) |
| **CORS** | Yes — confirmed for direct browser `fetch()` |
| **Granularity** | ~45 customs districts (port-cluster level) |
| **Commodity detail** | 2-, 4-, and 6-digit HS at port level; full 10-digit at district level |

The US has roughly 45 customs districts, each corresponding to a port cluster or metropolitan trade zone. District 10 is Philadelphia. District 13 is Norfolk. District 18 is Los Angeles. Each district aggregates the ports within its geographic area, and the API lets you pull trade values by district, commodity, partner country, and time period.

Example call — all diagnostic reagent exports from District 18 (Los Angeles) in 2024:

```
https://api.census.gov/data/timeseries/intltrade/exports/hs
  ?get=DISTRICT,DIST_NAME,ALL_VAL_MO
  &YEAR=2024&MONTH=12
  &COMM_LVL=HS4&I_COMMODITY=3822
  &DISTRICT=18
```

The district codes follow the [Schedule D classification](https://www.census.gov/foreign-trade/schedules/d/distname.html). Districts do not come geocoded — you must join them to a coordinate reference, which we address in the UN/LOCODE section below.

**Limitation:** Port-level data is restricted to 2-, 4-, and 6-digit HS to prevent disclosure of individual shipper identities. State-level exports have the same restriction. Full 10-digit HS detail is available at the national and district level only.[^1]

### openFDA API

Every manufacturer of medical devices and pharmaceuticals sold in the United States must register their facilities with the FDA. This registration data — facility name, address, city, state, country, and the devices or drugs listed at each facility — is freely available through the [openFDA API](https://open.fda.gov/apis/).

| Attribute | Detail |
|---|---|
| **Endpoint** | `api.fda.gov/device/registrationlisting.json` |
| **Rate limit** | 240 requests/minute without key; 120,000/day with [free key](https://open.fda.gov/apis/authentication/) |
| **CORS** | Yes — confirmed for direct browser `fetch()` |
| **Granularity** | Individual facility / establishment |
| **Coordinates** | Partial — city/state/country included; some datasets include lat/lon |

For biotech trade visualization, this is the supply-side map. When you see an arc showing US diagnostic reagent exports to Japan, openFDA can tell you which facilities in the US are registered to manufacture those reagents. The [Global Unique Device Identification Database](https://accessgudid.nlm.nih.gov/) (AccessGUDID) provides additional device-level detail.

The API supports Elasticsearch-style queries, bulk downloads, and endpoint-specific filtering. Device registrations, 510(k) clearances, PMA approvals, adverse events, and recalls are all available as separate endpoints.

### EPA Envirofacts (Toxics Release Inventory)

Not trade data, but facility-level chemical flow data with full coordinates. The [Toxics Release Inventory](https://www.epa.gov/toxics-release-inventory-tri-program) covers ~800 chemicals reported by industrial facilities, including off-site transfer destinations — giving you directed edges between facilities.

| Attribute | Detail |
|---|---|
| **Endpoint** | `data.epa.gov/efservice/tri.tri_facility/{column}/equals/{value}/JSON` |
| **Rate limit** | No key required |
| **CORS** | Yes — EPA's draft API strategy mandates CORS for public APIs |
| **Granularity** | Individual facility with latitude/longitude |
| **Coverage** | Reporting years 2015–2024 |

For chemical and pharmaceutical manufacturing supply chains, TRI data can show where raw materials move between facilities before they become finished goods that enter the trade statistics.

### AISStream.io (Real-Time Vessel Tracking)

Free global AIS vessel tracking via WebSocket. This is the real-time layer — ships moving between ports as you watch.

| Attribute | Detail |
|---|---|
| **Protocol** | WebSocket (bypasses CORS entirely) |
| **Rate limit** | Free account required; no published rate limit |
| **Granularity** | Individual vessel positions (lat/lon, heading, speed, destination) |
| **Coverage** | Global — all AIS-equipped commercial vessels |

WebSocket connections work natively in browsers. [AISStream.io](https://aisstream.io/) provides OpenAPI 3.0 definitions for all data models. You subscribe to a geographic bounding box or vessel list and receive position updates in real time. For a trade flow map, this adds a kinetic layer — users can see the physical movement of goods between the ports and districts shown in the Census data.

## Tier 2: Likely CORS — Needs Direct Testing

These sources are designed for web consumption and almost certainly support cross-origin requests, but we have not confirmed this from a Cloudflare Pages deployment.

### Eurostat Maritime Port Statistics

Quarterly and annual freight tonnage at the individual port level for all main EU ports. Broken down by cargo type, shipping type, and partner region.

| Attribute | Detail |
|---|---|
| **Endpoint** | `ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/mar_qg_qm_pwh` |
| **Format** | JSON-stat (designed for browser visualization) |
| **Granularity** | Individual EU port |
| **Coverage** | All main EU ports; Rotterdam handled 397M tonnes in 2024 |

The key dataset code is `mar_qg_qm_pwh` — quarterly goods at port level, with weight in thousand tonnes. EU ports collectively handled 3.4 billion tonnes in 2024.[^2] The API supports JSON-stat output format, which was specifically designed for browser-based statistical visualization.

### BIC Facility Codes

Over 17,000 container facilities in 160 countries, with structured addresses, GPS coordinates, and geofences. Maintained by the [Bureau International des Containers](https://docs.bic-code.org/).

| Attribute | Detail |
|---|---|
| **Type** | REST API with Swagger/OpenAPI spec |
| **Free?** | Yes, under fair-usage policy |
| **Granularity** | Individual container terminal with GPS coordinates |

This is one of the best free sources for geocoded container terminal locations worldwide. The [GitHub repository](https://github.com/bic-org/Facility-Code) includes sample CSVs and the Swagger specification.

## Tier 3: Bulk Download — Pre-Process for Static Serving

These datasets are too large or not API-friendly enough for direct browser consumption, but they can be pre-processed into static JSON and served alongside your application.

### UN/LOCODE

The United Nations Code for Trade and Transport Locations. Over 103,000 location codes across 249 countries and territories — every seaport, airport, rail terminal, and border crossing with a standardized code.

| Attribute | Detail |
|---|---|
| **Source** | [UNECE](https://unece.org/trade/uncefact/unlocode), [DataHub mirror](https://datahub.io/core/un-locode), [GitHub mirror](https://github.com/datasets/un-locode) |
| **Format** | CSV, released twice yearly |
| **Geocoded** | ~80% of records have coordinates |
| **Coverage** | 249 countries/territories |

For browser visualization, you do not need all 103,000 records. Filter to the top 500 ports by trade volume, enrich with coordinates from [CargoProbe](https://www.portbase.com/en/marketplace/cargoprobe-un-locode-api/) (98% geocoded, commercial) or [OpenCage](https://opencagedata.com/guides/lookup-a-unlocode), and serve as a static JSON file alongside your map. This becomes the geographic reference layer — the coordinates that the Census district codes and Eurostat port codes resolve to.

### Freight Analysis Framework (FAF5)

The most comprehensive domestic freight flow dataset for the United States. Origin-destination flows between approximately 132 FAF zones (metropolitan areas and state remainders), broken down by commodity and transport mode — truck, rail, water, air, pipeline.

| Attribute | Detail |
|---|---|
| **Source** | [BTS](https://www.bts.gov/faf) and [FHWA](https://ops.fhwa.dot.gov/freight/freight_analysis/faf/) |
| **Version** | FAF 5.7.1 (released August 2025), covering 2017–2024 with forecasts to 2050 |
| **Format** | CSV, MS Access |
| **Granularity** | ~132 FAF zones (metro-area level) |
| **Shapefiles** | [Data.gov](https://catalog.data.gov/dataset/freight-analysis-framework-faf5-regions1) |

FAF is built from the Commodity Flow Survey, which sampled ~165,000 shipper establishments. The 2022 CFS was [released June 2025](https://www.bts.gov/cfs). For trade visualization, FAF shows what happens *after* goods arrive at a port — how they distribute across the domestic network by truck, rail, or intermodal transfer.

Pre-process the CSV into a JSON structure of origin-destination flows, join to the zone shapefiles for geometry, and serve statically. This is the inland freight layer.

### BTS T-100 Air Cargo Data

Monthly domestic and international air freight data by carrier and origin-destination airport pair. Weight in pounds and tons, covering all service classes.

| Attribute | Detail |
|---|---|
| **Source** | [TranStats](https://www.transtats.bts.gov/airports.asp) |
| **Format** | CSV download from BTS |
| **Granularity** | Individual airport pairs (origin-destination) |
| **Coverage** | All US airports with scheduled service |

For biotech, air cargo is where the high-value, time-sensitive goods move — biologics on cold-chain, diagnostic instruments, and reagent shipments. Airport-pair data provides the complementary mode to the maritime and trucking layers.

## Tier 4: Commercial — No Free Browser Access

Listed for completeness. These are the premium sources that fill specific gaps.

| Source | Starting Price | Best For |
|---|---|---|
| [MarineTraffic](https://www.marinetraffic.com/) / Kpler | $10/month (basic); API custom-priced | Historical port calls, vessel tracking, congestion metrics |
| [IATA CargoIS](https://www.iata.org/en/services/statistics/intelligence/cargois/) | Subscription | Airport-to-airport air cargo intelligence, 20M+ airway bills |
| [Searoutes](https://searoutes.com/routing-api/) | Commercial | Maritime routing, distance calculations, CO2 estimation |
| China customs district data (Panjiva, Descartes) | Varies | HS-code-level data by Chinese customs district with shipper detail |
| [USITC DataWeb](https://dataweb.usitc.gov/) | Free (account required) | Most detailed US tariff + trade data; API requires authentication |

## The Architecture

For a purely client-side application deployed on Cloudflare Pages — no server, no backend, no API keys exposed — here is the recommended stack:

**Layer 1: Country-to-country flows.** [UN Comtrade](https://comtradeapi.un.org/) via subscription key (entered by user at runtime, stored in localStorage). This is the existing zoom level of [our commodity flow map](https://flow.minomobi.com/).

**Layer 2: Port/district-level flows.** Census Bureau API via free API key. When a user clicks a country arc, the view zooms to show the specific customs districts handling that trade. Census districts are joined to UN/LOCODE port coordinates for geographic placement.

**Layer 3: Facility pins.** openFDA device registrations and EPA TRI facility locations. These show where things are manufactured and where chemicals move between facilities.

**Layer 4: Real-time vessels.** AISStream.io WebSocket for live ship positions. Filtered to the geographic area currently in view.

**Layer 5: Domestic distribution.** FAF5 data pre-processed into static JSON. Shows how imported goods move inland by truck, rail, and intermodal transfer.

Each layer activates at a different zoom level. Country arcs at zoom 1–4. Port dots and district flows at zoom 4–7. Facility pins and vessel tracks at zoom 7+. The data resolution follows the user's attention.

## What We Are Building

This article is not retrospective. The commodity flow map at [flow.minomobi.com](https://flow.minomobi.com/) currently shows country-level biotech trade arcs using UN Comtrade data. The port-level layer is next. Census district data and UN/LOCODE port coordinates are being integrated now, and this research — every API endpoint, rate limit, CORS status, and data format documented above — is published here so that anyone building similar visualizations can skip the months of source discovery and go straight to implementation.

The data is public. The APIs are free. The only thing missing was the map of the maps.

---

## Bibliography

[^1]: US Census Bureau. "Guide to International Trade Datasets." [census.gov/foreign-trade/reference/guides/Guide\_to\_International\_Trade\_Datasets.pdf](https://www.census.gov/foreign-trade/reference/guides/Guide_to_International_Trade_Datasets.pdf)

[^2]: Eurostat. "EU ports handle 3.4 billion tonnes in 2024." December 4, 2025. [ec.europa.eu/eurostat/fr/web/products-eurostat-news/w/ddn-20251204-1](https://ec.europa.eu/eurostat/fr/web/products-eurostat-news/w/ddn-20251204-1)
