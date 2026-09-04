// geography.mjs — the boundary sources, with their provenance.
//
// Every entry here is a PRIMARY source: the statistical agency that draws the
// boundary publishes the file we read. Nothing is taken from a republication,
// because a republication is a second place for the vintage to be wrong.
//
// `licence` is quoted from the publisher's own terms. `vintage` is the boundary
// year, which is not the same as the data year — a 2023 boundary file carries
// Connecticut's 2022 planning-region conversion, and a 2020 file does not.

export const GEO_SOURCES = [
  {
    id: 'us-county',
    publisher: 'U.S. Census Bureau',
    title: 'Cartographic Boundary Files — Counties and County Equivalents, 1:500,000',
    url: 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip',
    landing: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
    vintage: 2023,
    crs: 'NAD83 geographic',
    licence: 'U.S. Government work — public domain (17 U.S.C. §105).',
    note: 'Includes the nine Connecticut planning regions that replaced its counties for statistical purposes in 2022, and Alaska’s 2023 Wrangell/Petersburg changes.',
  },
  {
    id: 'us-state',
    publisher: 'U.S. Census Bureau',
    title: 'Cartographic Boundary Files — States, 1:500,000',
    url: 'https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip',
    landing: 'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
    vintage: 2023,
    crs: 'NAD83 geographic',
    licence: 'U.S. Government work — public domain (17 U.S.C. §105).',
  },
  {
    id: 'ca-cd',
    publisher: 'Statistics Canada',
    title: '2021 Census — Census Divisions Cartographic Boundary File (lcd_000a21a_e)',
    url: 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000a21a_e.zip',
    landing: 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm',
    vintage: 2021,
    crs: 'NAD83 Statistics Canada Lambert (EPSG:3347)',
    licence: 'Statistics Canada Open Licence — free reuse with attribution; Statistics Canada does not endorse this product.',
    note: 'Census divisions are Canada’s county-equivalent: counties, regional county municipalities, regional districts, census divisions.',
  },
  {
    id: 'ca-pr',
    publisher: 'Statistics Canada',
    title: '2021 Census — Provinces and Territories Cartographic Boundary File (lpr_000a21a_e)',
    url: 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000a21a_e.zip',
    landing: 'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm',
    vintage: 2021,
    crs: 'NAD83 Statistics Canada Lambert (EPSG:3347)',
    licence: 'Statistics Canada Open Licence — free reuse with attribution.',
  },
  {
    id: 'mx-mun',
    publisher: 'CONABIO, from INEGI’s Marco Geoestadístico',
    title: 'División política municipal — municipios de México',
    url: 'http://www.conabio.gob.mx/informacion/gis/maps/geo/muni_2018gw.zip',
    landing: 'http://www.conabio.gob.mx/informacion/gis/',
    vintage: 2018,
    crs: 'declared in the bundled .prj',
    licence: 'CONABIO open geographic information — free use with attribution to CONABIO and to INEGI as the originator.',
    note: 'Municipios are Mexico’s county equivalent: about 2,470 of them, plus the 16 alcaldías of Mexico City. THIS IS THE ONE DERIVED SOURCE IN THE ATLAS, and it is here for a practical reason worth stating: INEGI’s own Marco Geoestadístico is published only as a 3.3 GB national archive containing localities and city blocks, which is not a reasonable thing to fetch to draw 2,470 outlines. CONABIO — a Mexican federal commission — redistributes the same INEGI municipal geometry at 40 MB. If INEGI ever publishes a municipal-only extract, this entry should point at it instead.',
  },
  {
    id: 'ne-admin1',
    publisher: 'Natural Earth (North American Cartographic Information Society)',
    title: 'Natural Earth 10m Admin 1 — States, Provinces',
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip',
    landing: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/',
    vintage: 2024,
    crs: 'WGS84 geographic',
    licence: 'Public domain.',
    note: 'Used ONLY for the Caribbean, where no single agency publishes a second-level boundary set: parishes of Jamaica, provincias of Cuba and the Dominican Republic, départements of Haiti, and the small-island territories.',
  },
  {
    id: 'ne-admin0',
    publisher: 'Natural Earth (North American Cartographic Information Society)',
    title: 'Natural Earth 50m Admin 0 — Countries',
    url: 'https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip',
    landing: 'https://www.naturalearthdata.com/downloads/50m-cultural-vectors/',
    vintage: 2024,
    crs: 'WGS84 geographic',
    licence: 'Public domain.',
    note: 'Context outlines only — Central America and the surrounding coastline, so the continental frame is not a hole.',
  },
];

export const byId = Object.fromEntries(GEO_SOURCES.map((s) => [s.id, s]));

// The Caribbean, as Natural Earth's three-letter admin-0 codes. Sovereign
// states and dependent territories both; Puerto Rico and the U.S. Virgin
// Islands are excluded here because the Census file already carries them at
// municipio/district level, which is finer than Natural Earth's.
export const CARIBBEAN_ADM0 = new Set([
  'ATG', 'BHS', 'BRB', 'CUB', 'DMA', 'DOM', 'GRD', 'HTI', 'JAM', 'KNA', 'LCA',
  'VCT', 'TTO', 'AIA', 'ABW', 'VGB', 'CYM', 'CUW', 'GLP', 'MTQ', 'MSR', 'BLM',
  'MAF', 'SXM', 'TCA', 'BES', 'CYN',
]);
