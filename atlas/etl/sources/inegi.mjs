// inegi.mjs — INEGI, Censo de Población y Vivienda 2020, ITER open data.
//
// ITER ("Principales resultados por localidad") is the census published all the
// way down to individual localities, and it carries a row per municipio total
// (LOC = 0000), so no aggregation is needed and none is invented.
//
// The variables chosen here are counts, not rates — the atlas stores only
// stocks and derives every rate at the level being displayed — and they are
// chosen because they say something a per-capita income figure cannot: how many
// households have a dirt floor, how many have an internet connection, how many
// people speak an indigenous language, how many are outside the health system.
// Mexican municipios differ from each other along axes the United States does
// not have a column for, and flattening them onto BEA-shaped measures would
// have been the easy, wrong thing to do.

import { get } from '../lib/fetch-cache.mjs';
import { listZip, readEntry } from '../lib/zip.mjs';
import { records, num } from '../lib/csv.mjs';

const URL = 'https://en.www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_00_cpv2020_csv.zip';

export const SOURCE = {
  id: 'inegi-censo-2020',
  publisher: 'INEGI (Instituto Nacional de Estadística y Geografía)',
  title: 'Censo de Población y Vivienda 2020 — ITER, principales resultados por localidad',
  landing: 'https://www.inegi.org.mx/programas/ccpv/2020/',
  url: URL,
  licence: 'INEGI Términos de Libre Uso de la Información — free use with attribution to INEGI.',
  cadence: 'decennial',
  geography: 'Mexican municipios and alcaldías (the ITER file’s municipio-total rows)',
  cite: 'INEGI, Censo de Población y Vivienda 2020, ITER (Principales resultados por localidad).',
  note: 'Mexican pesos are not converted anywhere in this atlas, and no income variable is carried: the 2020 census did not collect one.',
};

// ITER column → our stock key. Counts only.
const COLS = {
  POBTOT: 'pop',
  POBFEM: 'pop_female',
  P_15YMAS: 'pop_15plus',
  PEA: 'labour_force',
  POCUPADA: 'employed',
  PDESOCUP: 'unemployed',
  PSINDER: 'no_health_affiliation',
  P3YM_HLI: 'indigenous_language_speakers',
  TVIVPARHAB: 'dwellings',
  VPH_INTER: 'dwellings_internet',
  VPH_AUTOM: 'dwellings_car',
  VPH_PISOTI: 'dwellings_dirt_floor',
};

export async function fetchMeasures() {
  const buf = await get(URL, 'INEGI Censo 2020 (ITER)');
  const entry = listZip(buf).find((e) => /conjunto_de_datos\/.*\.csv$/i.test(e.name));
  if (!entry) throw new Error('INEGI ITER: no conjunto_de_datos CSV in the archive');
  const text = readEntry(buf, entry).toString('latin1');

  const values = new Map();
  let seen = 0;
  for (const r of records(text)) {
    // LOC 0000 is the municipio total row. Anything else is a locality, and
    // summing localities would double-count against it.
    const loc = String(r.LOC || '').padStart(4, '0');
    const ent = String(r.ENTIDAD || '').padStart(2, '0');
    const mun = String(r.MUN || '').padStart(3, '0');
    if (loc !== '0000' || ent === '00' || mun === '000') continue;
    seen++;
    const m = new Map();
    for (const [col, key] of Object.entries(COLS)) {
      const v = num(r[col]);
      if (v != null) m.set(`${key}:2020`, v);
    }
    if (m.size) values.set(ent + mun, m);
  }
  process.stderr.write(`  INEGI ITER: ${values.size} municipios (${seen} municipio-total rows)\n`);
  return { values };
}
