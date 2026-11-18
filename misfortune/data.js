// misfortune/data.js — the wedges.
//
// THREE KINDS, and the card says which:
//   real    — happened. Dated and sourced; the joke is only ever in the framing,
//             never in the facts. Re-check before adding one: the 2026-11-18 pass
//             found two "cyberattacks" in the news were plain software faults.
//   fiction — not a forecast, not a target list. Absurd OUTCOMES at famous or
//             generic institutions, with nothing a reader could act on. Do not
//             add small, specific, real facilities or anything about how.
//   special — the game-show furniture (lose a turn, spin again, the ransom).
//
// label: what fits on the wedge (\n splits lines, keep each ≤ 11 chars).
// title: the card's headline. line: the announcer. stamp: the card's stamp.

export const WEDGES = [
  {
    id: 'fridges', kind: 'real', label: 'EURO\nFREEZERS',
    title: 'THE GREAT DEFROST: EUROPEAN TOUR',
    line: 'France got it first in October. On November 2nd the encore played Sweden, Belgium, Luxembourg, Ireland, Italy and Estonia. The ice cream did not survive the tour.',
    stamp: 'ALREADY HAPPENED', date: '2 Nov 2026',
    source: 'AP via ABC News', url: 'https://abcnews.com/Technology/wireStory/european-supermarket-fridges-hacked-137816012',
  },
  {
    id: 'butcher', kind: 'real', label: 'A FRIDGE\nAT 150°C',
    title: 'YOUR FRIDGE IS NOW AN OVEN',
    line: 'An Athens butcher says hackers set his fridge to 150°C. Two hours to get it back. He says the meat was fine. We believe him. We have to believe in something.',
    stamp: 'ALREADY HAPPENED', date: '3 Nov 2026',
    source: 'AP via ABC News', url: 'https://abcnews.com/Technology/wireStory/european-supermarket-fridges-hacked-137816012',
  },
  {
    id: 'faa', kind: 'real', label: 'NOT EVEN\nA HACK',
    title: 'EVERY PLANE IN AMERICA, GROUNDED BY A CABLE',
    line: 'A nationwide ground stop, four hours. Cause: a copper-to-fibre upgrade at one node in Arkansas. No hackers required. That is somehow worse.',
    stamp: 'ALREADY HAPPENED', date: '13 Nov 2026',
    source: 'Fortune', url: 'https://fortune.com/2026/11/15/pentagon-doomsday-prepping-black-october-cyberattacks-stock-crash-nvidia-china-spy-scandal-microsoft-outage-faa-air-traffic/',
  },
  {
    id: 'office', kind: 'real', label: 'THE OFFICE\nSUITE',
    title: 'THE CLOUD HAD A CLOUDY DAY',
    line: 'Microsoft 365 went down worldwide. Not an attack, they say: "an issue during an earlier network capacity upgrade". The emails you did not send are still not sent.',
    stamp: 'ALREADY HAPPENED', date: '12 Nov 2026',
    source: 'Fortune', url: 'https://fortune.com/2026/11/15/pentagon-doomsday-prepping-black-october-cyberattacks-stock-crash-nvidia-china-spy-scandal-microsoft-outage-faa-air-traffic/',
  },
  {
    id: 'october', kind: 'real', label: 'BLACK\nOCTOBER',
    title: 'A WHOLE MONTH, BRANDED',
    line: '"A month of cyberattacks that hit hundreds of companies and institutions." It has a name now. Next year it gets a sequel and a merch line.',
    stamp: 'ALREADY HAPPENED', date: 'Oct 2026',
    source: 'Fortune', url: 'https://fortune.com/2026/11/15/pentagon-doomsday-prepping-black-october-cyberattacks-stock-crash-nvidia-china-spy-scandal-microsoft-outage-faa-air-traffic/',
  },
  {
    id: 'water', kind: 'real', label: 'WATER,\n12 STATES',
    title: 'THE TAP IS ON A GROUP CHAT',
    line: 'Intrusions at water systems in at least a dozen states, by summer. No widespread disruption, officials said. The phrase "so far" did a lot of work.',
    stamp: 'ALREADY HAPPENED', date: 'since Jul 2026',
    source: 'ABC News', url: 'https://abcnews.com/US/12-states-face-cyberattacks-water-systems-sources/story?id=135348482',
  },

  // ── fiction: outcomes, not targets ──────────────────────────────────────────
  {
    id: 'tmi', kind: 'fiction', label: 'THREE MILE\nISLAND II',
    title: 'THREE MILE ISLAND 2: FOUR MILE ISLAND',
    line: 'The sequel nobody asked for. Bigger. Louder. The island is now one mile larger and nobody can explain where the mile came from.',
  },
  {
    id: 'poughkeepsie', kind: 'fiction', label: 'POUGH-\nKEEPSIE H₂O',
    title: 'POUGHKEEPSIE WATER: NOW CARBONATED',
    line: 'Every tap in Poughkeepsie dispenses sparkling. Residents report it is honestly an improvement. The mayor has been asked to stop calling it "a lifestyle brand".',
  },
  {
    id: 'google', kind: 'fiction', label: 'GOOGLE\nFORGETS',
    title: 'GOOGLE FORGETS EVERYTHING',
    line: 'Every search returns one result: "Did you mean: yourself?" Humanity rediscovers the library. The library has also forgotten everything.',
  },
  {
    id: 'gps', kind: 'fiction', label: 'GPS:\nMAKE A WISH',
    title: 'GPS SATELLITES BECOME SHOOTING STARS',
    line: 'The whole constellation, falling gently, beautifully. Make a wish! Every car in America recalculates to Poughkeepsie.',
  },
  {
    id: 'lights', kind: 'fiction', label: 'ALL LIGHTS\nGREEN',
    title: 'EVERY TRAFFIC LIGHT: GREEN. FOREVER.',
    line: 'Optimism, municipally enforced. Intersections become a trust exercise. Trust is lost.',
  },
  {
    id: 'thermostats', kind: 'fiction', label: 'SMART\nSAUNA',
    title: 'EVERY SMART THERMOSTAT SET TO "SAUNA"',
    line: 'Forty million homes, one setting. The app says "Great job saving energy!" It is 31°C in the nursery.',
  },
  {
    id: 'boards', kind: 'fiction', label: 'DELAYED\n(EMOTION.)',
    title: 'ALL FLIGHTS: DELAYED (EMOTIONALLY)',
    line: 'Every departure board in the world shows one status. Nobody can tell whether it is a hack or the airline being honest for once.',
  },
  {
    id: 'decaf', kind: 'fiction', label: 'DECAF\nEVERYWHERE',
    title: 'THE GLOBAL COFFEE SUPPLY GOES DECAF',
    line: 'Nobody notices for three days. Then everybody notices at once. Productivity unchanged; morale catastrophic.',
  },
  {
    id: 'chatbots', kind: 'fiction', label: 'PER MY\nLAST EMAIL',
    title: 'EVERY CHATBOT ON EARTH NOW ONLY SAYS "PER MY LAST EMAIL"',
    line: 'Customer service, coding assistants, the car. Passive-aggressive at planetary scale. Some users report it is more helpful than before.',
  },
  {
    id: 'elevators', kind: 'fiction', label: 'ONE SONG\nELEVATOR',
    title: 'EVERY ELEVATOR PLAYS THE SAME SONG',
    line: 'It is not a song you know. It has always been playing. You are humming it now.',
  },
  {
    id: 'cloud', kind: 'fiction', label: 'THE CLOUD\nRAINS',
    title: 'THE CLOUD STARTS RAINING',
    line: 'Every photo you ever backed up, falling softly on the city. Somewhere, your 2014 haircut lands on a stranger.',
  },
  {
    id: 'clocks', kind: 'fiction', label: 'IT IS\n3 AM',
    title: 'ALL CLOCKS: 3 AM FOR A WEEK',
    line: 'Daylight saving, permanently. Markets open at 3 AM. School starts at 3 AM. You are already awake at 3 AM anyway, so.',
  },
  {
    id: 'pizza', kind: 'fiction', label: 'PENTAGON\nPIZZA',
    title: '400 PIZZAS TO THE PENTAGON',
    line: 'Every pizza shop in Arlington, all at once. Analysts read the pizza index and declare war on several countries. It was pineapple. It was always pineapple.',
  },
  {
    id: 'satellite', kind: 'fiction', label: 'ALL TV:\nYULE LOG',
    title: 'EVERY CHANNEL IS THE YULE LOG',
    line: 'News, sports, prestige drama. Just the log. Ratings have never been higher. Nobody wants it back.',
  },

  // ── the furniture ───────────────────────────────────────────────────────────
  {
    id: 'ransom', kind: 'special', label: 'RANSOM\n40 BTC',
    title: 'RANSOM! PAY 40 BITCOIN TO CONTINUE',
    line: 'Your wheel has been encrypted. Your progress, your dreams, the little glittery letters. Do not pay. They will only ask again.',
  },
  {
    id: 'loseturn', kind: 'special', label: 'LOSE\nA TURN',
    title: 'LOSE A TURN (AND YOUR DATA)',
    line: 'A third party you have never heard of had your date of birth. Credit monitoring for twelve months is your consolation prize.',
  },
  {
    id: 'again', kind: 'special', label: 'SPIN\nAGAIN',
    title: 'SPIN AGAIN (CHANGE YOUR PASSWORD FIRST)',
    line: 'Not "password1". Not the date. Not the date backwards. The fridges tried that.',
  },
  {
    id: 'patch', kind: 'special', label: 'FREE\nPATCH',
    title: 'YOU WIN: A FREE PATCH TUESDAY',
    line: 'It is a Thursday. The patch requires a restart. The restart requires a patch.',
  },
];

// Wedge order on the wheel: real, fiction and furniture interleaved so no two
// neighbours are the same kind more than twice in a row.
export const ORDER = [
  'fridges', 'tmi', 'lights', 'ransom', 'faa', 'google', 'elevators', 'again',
  'butcher', 'gps', 'thermostats', 'loseturn', 'office', 'poughkeepsie', 'decaf', 'patch',
  'october', 'chatbots', 'cloud', 'clocks', 'water', 'pizza', 'boards', 'satellite',
];

// A run of colours from the stage, by kind. Real wedges never share a colour
// with fiction, so the wheel itself shows which ones already happened.
export const COLORS = {
  real: ['#d7263d', '#c81d4e'],
  fiction: ['#f4b400', '#1e88e5', '#43a047', '#8e24aa', '#fb8c00', '#00acc1', '#e91e63', '#7cb342'],
  special: { ransom: '#111111', loseturn: '#f5f5f5', again: '#c0c6cc', patch: '#c0c6cc' },
};
