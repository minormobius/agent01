# Megaproject Dashboard — Design

## Overview

A global infrastructure tracker showing major construction megaprojects on an interactive map. Click any project for deep context: cost, timeline, status, key engineering facts, and reference links. Filter by project type.

**Target domain**: `mega.minomobi.com`

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Browser (single HTML file)              │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ MapLibre GL  │  │   Deck.gl    │  │  Vanilla  │ │
│  │ (basemap)    │  │  (markers,   │  │  JS UI    │ │
│  │              │  │   labels)    │  │           │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                │        │
│         └─────────────────┴────────┬───────┘        │
│                                    │                │
│  ┌─────────────────────────────────┴──────────────┐ │
│  │            Embedded PROJECTS[] array            │ │
│  │  • ~35 curated megaprojects                     │ │
│  │  • Deep context: description, key facts, links  │ │
│  │  • Coordinates, cost, timeline, status          │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

No backend. No build step. All data embedded in the HTML file. Deployed as a static asset on Cloudflare Pages.

## Stack

- **MapLibre GL** v4.7.1 — open-source WebGL basemap (Carto dark tiles)
- **Deck.gl** v9.1.7 — GPU-accelerated ScatterplotLayer + TextLayer
- **Vanilla JS** — state management, filtering, DOM manipulation
- **Cloudflare Pages** — static hosting, auto-deploy from `main`

Same architecture as `flows/` (Commodity Flow Maps).

## Data Model

Each project in the `PROJECTS[]` array:

```javascript
{
  id: 'fehmarn',                    // Unique slug
  name: 'Fehmarn Belt Fixed Link',  // Display name
  type: 'transport',                // Category key
  country: 'Denmark / Germany',     // Location label
  lat: 54.55, lon: 11.25,          // Map coordinates
  cost: 8.7e9,                     // Estimated cost (numeric)
  currency: 'EUR',                 // Cost currency
  status: 'construction',          // construction | planned | completed | partial
  start: 2021,                     // Construction start year
  completion: '2029',              // Target completion (string for flexibility)
  description: '...',              // 2-3 sentence overview
  keyFacts: ['...', '...'],        // 6 bullet points of deep context
  links: [{ label, url }],         // Reference links (official site, Wikipedia)
}
```

## Project Types

| Key | Name | Color | Hex |
|-----|------|-------|-----|
| `transport` | Transport | Orange | `#ff8c00` |
| `energy` | Energy | Green | `#44cc88` |
| `urban` | Urban | Cyan | `#00c8ff` |
| `industrial` | Industrial | Purple | `#8c64ff` |
| `water` | Water | Blue | `#00a0ff` |
| `aerospace` | Aerospace | Red | `#ff4466` |
| `digital` | Digital | Gold | `#c8a000` |

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: Title + Filter Chips (All | Transport | ...)   │
├─────────────────────────────────┬───────────────────────┤
│                                 │  Sidebar              │
│     Map (MapLibre + Deck.gl)    │  (project list,       │
│     • Sized markers by cost     │   sorted by cost,     │
│     • Colored by type           │   aggregate stats)    │
│     • Tooltip on hover          │                       │
│     • Fly-to + detail on click  │                       │
│                                 │                       │
│         ┌─────────────┐         │                       │
│         │Detail Panel │ ←slides │                       │
│         │(deep context)│  open  │                       │
│         └─────────────┘         │                       │
├─────────────────────────────────┴───────────────────────┤
│  Status Bar: project count · active filter              │
└─────────────────────────────────────────────────────────┘
```

## Detail Panel Sections

1. **Header** — project name, country, type badge
2. **Stats Grid** — cost, status, start year, completion target
3. **Overview** — narrative description (2-3 sentences)
4. **Key Facts** — 6 bullet points of deep engineering/financial context
5. **References** — external links (official site, Wikipedia)

## Data Sources

The curated dataset draws from:

- [Wikipedia: List of megaprojects](https://en.wikipedia.org/wiki/List_of_megaprojects)
- News reporting (STAT, FierceBiotech, Reuters, BBC)
- Official project sites and government filings
- [Statista megaproject charts](https://www.statista.com/chart/29653/megaprojects/)

## Future Directions

- **Wikidata SPARQL integration** — auto-populate project data from structured Wikidata queries
- **Webcam embeds** — embed EarthCam or official livestreams in detail panel
- **Satellite timelapse** — Sentinel Hub imagery showing construction progress over time
- **Community curation** — allow submissions of new projects or updates via ATProto records
- **Progress tracking** — percentage complete bars, milestone timelines per project
- **Cost overrun visualization** — original vs. current budget comparison
- **Search** — full-text search across project names and descriptions
