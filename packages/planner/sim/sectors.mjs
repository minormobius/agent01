// The model's sector set, and how each data source maps onto it.
//
// Convention: private industries by NAICS 2-digit, plus ONE government sector holding every
// public employer (federal, state, local — including public schools, hospitals and transit),
// because that is how BEA's input-output tables book them (GFGD/GFGN/GFE/GSLG/GSLE). QCEW
// supports that split exactly (ownership codes); LODES does not (it classifies public jobs by
// NAICS), so the city's share of government jobs is approximated — see cityShare() in data.mjs.
//
// HOUSING is owner-occupied housing services (BEA "HS"): output with no jobs, driven by the
// housing stock. It is the hook between the property ledger (MPROP) and the production model.

export const SECTORS = [
  { id: 'AG', name: 'Agriculture, forestry, fishing', naics: ['11'], io: ['111CA', '113FF'], cns: ['CNS01'] },
  { id: 'MIN', name: 'Mining', naics: ['21'], io: ['211', '212', '213'], cns: ['CNS02'] },
  { id: 'UTIL', name: 'Utilities', naics: ['22'], io: ['22'], cns: ['CNS03'] },
  { id: 'CON', name: 'Construction', naics: ['23'], io: ['23'], cns: ['CNS04'] },
  { id: 'MFG', name: 'Manufacturing', naics: ['31-33'], io: ['321', '327', '331', '332', '333', '334', '335', '3361MV', '3364OT', '337', '339', '311FT', '313TT', '315AL', '322', '323', '324', '325', '326'], cns: ['CNS05'] },
  { id: 'WHOL', name: 'Wholesale trade', naics: ['42'], io: ['42'], cns: ['CNS06'] },
  { id: 'RET', name: 'Retail trade', naics: ['44-45'], io: ['441', '445', '452', '4A0'], cns: ['CNS07'] },
  { id: 'TRAN', name: 'Transportation and warehousing', naics: ['48-49'], io: ['481', '482', '483', '484', '485', '486', '487OS', '493'], cns: ['CNS08'] },
  { id: 'INFO', name: 'Information', naics: ['51'], io: ['511', '512', '513', '514'], cns: ['CNS09'] },
  { id: 'FIN', name: 'Finance and insurance', naics: ['52'], io: ['521CI', '523', '524', '525'], cns: ['CNS10'] },
  { id: 'RE', name: 'Real estate and rental (excl. owner-occupied housing)', naics: ['53'], io: ['ORE', '532RL'], cns: ['CNS11'] },
  { id: 'PROF', name: 'Professional, scientific, technical', naics: ['54'], io: ['5411', '5415', '5412OP'], cns: ['CNS12'] },
  { id: 'MGMT', name: 'Management of companies', naics: ['55'], io: ['55'], cns: ['CNS13'] },
  { id: 'ADMIN', name: 'Administrative and waste services', naics: ['56'], io: ['561', '562'], cns: ['CNS14'] },
  { id: 'EDU', name: 'Educational services (private)', naics: ['61'], io: ['61'], cns: ['CNS15'] },
  { id: 'HEALTH', name: 'Health care and social assistance (private)', naics: ['62'], io: ['621', '622', '623', '624'], cns: ['CNS16'] },
  { id: 'ARTS', name: 'Arts, entertainment, recreation', naics: ['71'], io: ['711AS', '713'], cns: ['CNS17'] },
  { id: 'ACCFD', name: 'Accommodation and food services', naics: ['72'], io: ['721', '722'], cns: ['CNS18'] },
  { id: 'OTH', name: 'Other services', naics: ['81'], io: ['81'], cns: ['CNS19'] },
  { id: 'GOV', name: 'Government (all public employers)', naics: null, io: ['GFGD', 'GFGN', 'GFE', 'GSLG', 'GSLE'], cns: ['CNS20'] },
  { id: 'HOUSING', name: 'Owner-occupied housing services', naics: null, io: ['HS'], cns: [], noJobs: true },
];
export const IDS = SECTORS.map(s => s.id);
export const N = SECTORS.length;
export const IDX = Object.fromEntries(IDS.map((id, i) => [id, i]));

const ioMap = new Map(SECTORS.flatMap((s, i) => s.io.map(c => [c, i])));
export const ioSector = code => ioMap.get(code);           // undefined for Used/Other/noncomparable
const naicsMap = new Map(SECTORS.flatMap((s, i) => (s.naics || []).map(c => [c, i])));
export const naicsSector = code => naicsMap.get(code);

// BEA final-use columns grouped into the demand blocks the model drives separately.
export const FINAL = {
  F010: 'pce',
  F02S: 'inv', F02E: 'inv', F02N: 'inv', F02R: 'invRes', F030: 'inv',
  F040: 'exports', F050: 'imports',
  F06C: 'gov', F06S: 'gov', F06E: 'gov', F06N: 'gov', F07C: 'gov', F07S: 'gov', F07E: 'gov', F07N: 'gov',
  F10C: 'gov', F10S: 'gov', F10E: 'gov', F10N: 'gov',
};
