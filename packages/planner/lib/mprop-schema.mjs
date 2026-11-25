// One canonical parcel record across fifty years of MPROP.
//
// The assessor's file changed layout at least ten times between 1975 and 2025: renamed
// columns (CURLNDAS -> CALAND -> C_A_LAND -> TotalLandValue), shapefile-truncated names
// (C_A_EXM_TY, OwnerBilli), dropped fields, a wholesale ArcGIS re-platforming in 2022.
// Each canonical field lists every spelling seen, in preference order; the first one a
// year's header contains wins. `harmonize.mjs` reports, per year, which spelling each
// field resolved to and which fields are absent — read that report before trusting a
// series, because an absent field is a hole, not a zero.
//
// Codebooks: sources.json -> mprop.docs (1975-2009 reference, 2009-now, Fall 2024).

export const FIELDS = {
  taxkey:     ['TAXKEY', 'Taxkey', 'FK_Tax'],
  subacct:    ['SUBACCT', 'SUB_ACCT'],
  // assessment class: 1 RES, 2 MER, 3 MFG, 4 special MER, 5 condo, 7 MER apartments (4+ units), 9 exempt
  cls:        ['CURCLSCD', 'CACLASS', 'C_A_CLASS', 'LandUse'], // 2022+: "LandUse" IS the class; land use is FK_LandUse
  land:       ['CURLNDAS', 'CALAND', 'C_A_LAND', 'TotalLandValue', 'TotalLandV'],
  impr:       ['CURIMPAS', 'CAIMPRV', 'C_A_IMPRV'],             // 2022+: derived as total - land
  total:      ['CURTOTAS', 'CATOTAL', 'C_A_TOTAL', 'TotalAssessedValue', 'AssessValu'],
  exmType:    ['CUREXTYP', 'CAEXMTYPE', 'C_A_EXM_TYPE', 'C_A_EXM_TY', 'CurrentYearExemptionType', 'CurrentYea'],
  exmTotal:   ['CUREXTOT', 'CAEXMTOTAL', 'C_A_EXM_TOTAL', 'C_A_EXM_TO', 'TotalAssessedExemptValue', 'AssessExem'],
  landUse:    ['LANDUSE', 'LAND_USE', 'FK_LandUse'],
  luGroup:    ['LUGROUP', 'LANDUSEGP', 'LAND_USE_GP', 'LAND_USE_G'],
  units:      ['NUMUNITS', 'NRUNITS', 'NR_UNITS', 'ResidentialUnits', 'Residentia'],
  commUnits:  ['CommercialUnits', 'Commercial'],
  bldgType:   ['BUILDTYP', 'BLDGTYPE', 'BLDG_TYPE', 'BuildingType', 'BuildingTy'],
  bldgArea:   ['BLDGAREA', 'BLDG_AREA'],
  stories:    ['NSTORIES', 'NRSTORIES', 'NR_STORIES'],
  yrBuilt:    ['YRBUILT', 'YR_BUILT', 'YearBuilt'],
  lotArea:    ['LOTAREA', 'LOT_AREA', 'CalculatedTotalSF', 'Calculat_1'],
  ownerOcc:   ['OWNEROCC', 'OWNOCPD', 'OWN_OCPD', 'IsOwnerOccupied', 'IsOwnerOcc'],
  ownerName:  ['OWNRNAM1', 'OWNERNAME1', 'Owner1'],
  ownerAddr:  ['OWNRADDR', 'OWNERADDR', 'OWNER_MAIL_ADDR', 'OWNER_MAIL', 'OwnerBillingAddress', 'OwnerBilli'],
  ownerCity:  ['OWNRCITY', 'OWNERCITY', 'OWNER_CITY_STATE', 'OWNER_CITY', 'OwnerCity'],
  ownerZip:   ['OWNRZIP', 'OWNERZIP', 'OWNER_ZIP', 'OwnerZipCode', 'OwnerZipCo'],
  conveyDate: ['CONVDATE', 'CONVEYDATE', 'CONVEY_DATE', 'CONVEY_DAT'], // 2022+ SaleDate is mangled ("00:00.0") in the published CSVs
  conveyType: ['CONVTYPE', 'CONVEYTYPE', 'CONVEY_TYPE', 'CONVEY_TYP', 'Deed'],
  conveyFee:  ['CONVFEE', 'CONVEYFEE', 'CONVEY_FEE'],
  tract:      ['CENTRACT', 'GEOTRACT', 'GEO_TRACT'],
  zoning:     ['ZONING', 'FK_Zoning'],
  taxDelq:    ['TAXDELQ', 'TAX_DELQ'],
  x:          ['X'],
  y:          ['Y'],
};

export function resolve(header) {
  const idx = new Map(header.map((h, i) => [h.trim(), i]));
  const map = {}, used = {}, missing = [];
  for (const [f, aliases] of Object.entries(FIELDS)) {
    const a = aliases.find(n => idx.has(n));
    if (a === undefined) missing.push(f); else { map[f] = idx.get(a); used[f] = a; }
  }
  return { map, used, missing };
}

const num = s => { if (s == null) return null; s = s.trim(); if (s === '' || s === 'NULL') return null; const v = Number(s); return Number.isFinite(v) ? v : null; };
const str = s => { if (s == null) return null; s = s.trim(); return s === '' || s === 'NULL' ? null : s; };

// Exemption codes (Appendix B, 2008 codebook) grouped by WHO holds the parcel. This is the
// planner's question: how much of the city is already held by some public body?
export function exemptHolder(code) {
  if (code == null) return null;
  const c = Number(code);
  if (!Number.isFinite(c)) return 'other';          // pre-1984 alphanumeric codes (X1, X2, ...): see report
  if (c === 0) return null;
  if (c >= 480 && c <= 571 || c === 660 || c === 720 || c === 750) return c === 750 ? 'schools' : c === 500 ? 'housing-authority' : c === 490 ? 'redevelopment' : c === 530 ? 'city-tax-deed' : 'city';
  if (c >= 390 && c <= 440) return 'county';
  if (c >= 330 && c <= 360) return 'state';
  if (c >= 310 && c <= 321) return 'federal';
  if (c >= 10 && c <= 80) return 'religious';
  if (c >= 90 && c <= 113 || c === 550) return 'education';
  if (c >= 200 && c <= 202) return 'hospital';
  if (c >= 780 && c <= 860) return 'rail-utility';
  if (c === 900) return 'streets';
  return 'nonprofit';
}

export function record(row, map, year) {
  const g = f => (map[f] === undefined ? undefined : row[map[f]]);
  let tk = str(g('taxkey'));
  if (tk) tk = tk.replace(/\D/g, '').padStart(10, '0');
  const land = num(g('land')), total = num(g('total'));
  let impr = num(g('impr'));
  if (impr == null && map.impr === undefined && land != null && total != null) impr = total - land;
  let cls = num(g('cls'));
  const exmType = str(g('exmType'));
  const oo = str(g('ownerOcc'));
  return {
    year, taxkey: tk, subacct: num(g('subacct')) ?? 0, cls,
    land, impr, total: total ?? (land != null && impr != null ? land + impr : null),
    exmType, exmTotal: num(g('exmTotal')), holder: exemptHolder(exmType),
    landUse: num(g('landUse')), luGroup: num(g('luGroup')),
    units: num(g('units')), commUnits: num(g('commUnits')),
    bldgType: str(g('bldgType')), bldgArea: num(g('bldgArea')), stories: num(g('stories')),
    yrBuilt: num(g('yrBuilt')), lotArea: num(g('lotArea')),
    ownerOcc: oo == null ? null : /^(1|Y|O|T)/i.test(oo),
    ownerName: str(g('ownerName')), ownerAddr: str(g('ownerAddr')), ownerCity: str(g('ownerCity')), ownerZip: str(g('ownerZip')),
    conveyDate: str(g('conveyDate')), conveyType: str(g('conveyType')), conveyFee: num(g('conveyFee')),
    tract: str(g('tract')), zoning: str(g('zoning')), taxDelq: num(g('taxDelq')),
  };
}
