// rite/lexicon — mini-lexicons for word-level analysis.
//
// These are *small, hand-authored* approximations of well-known published
// lexicons, sized to fit inline (~25KB total). They demonstrate the feature
// with reasonable real-corpus coverage; for a serious analysis swap in the
// full versions via scripts/fetch-lexicons.mjs (writes JSON to ./data/).
//
// On load, the page checks for ./data/{nrc,concreteness,afinn,baseline}.json
// and prefers them if present. Otherwise it falls back to these inline maps.
//
// Citations:
//   NRC Emotion Lexicon — Mohammad & Turney (2013). 14k words × 8 emotions.
//     CC-BY-NC-SA-4.0. https://saifmohammad.com/WebPages/NRC-Emotion-Lexicon.htm
//   Concreteness Ratings — Brysbaert, Warriner & Kuperman (2014). 40k words.
//     Free for research. http://crr.ugent.be/papers/Concreteness_ratings_Brysbaert_et_al_BRM.pdf
//   AFINN — Nielsen (2011). 2.5k words, sentiment scores -5..+5.
//     ODbL. https://github.com/fnielsen/afinn
//   SUBTLEX-US — Brysbaert & New (2009). Word frequencies from movie subtitles.
//     CC-BY. http://crr.ugent.be/archives/679

// ─── Stopwords ───────────────────────────────────────────────────────
// Common articles, prepositions, auxiliaries, pronouns, contractions,
// and social-media filler that would dominate any raw word frequency
// without telling you anything about the writer.
export const STOPWORDS = new Set(`
a an the and or but so if then than as that this these those there here
of to in on at by for with from into onto off over under above below up down
between among through during about against around across along after before
since until while because since though although unless whether either neither

is am are was were be been being have has had having do does did doing
will would shall should can could may might must ought
get got gets getting go goes going gone went come comes coming came
say says said saying tell tells told asking ask asks asked
let lets letting take takes took taken make makes made making
know knows knew known think thinks thought see sees saw seen
look looks looked want wants wanted use uses used find finds found
give gives gave given keep keeps kept

i you he she it we they me him her us them my your his its our their
mine yours hers ours theirs myself yourself himself herself itself
ourselves yourselves themselves who whom whose what which when where why how

dont wont cant isnt arent wasnt werent doesnt didnt havent hasnt hadnt
wouldnt shouldnt couldnt aint im youre hes shes its were theyre ive youve
weve theyve id youd hed shed wed theyd ill youll hell shell well theyll

not no yes nor only just also even still very too quite rather really
much many more most some any all both each every either every same other
own such few several another both
this that these those some any all each every

now then today tomorrow yesterday soon late later early already always
never ever sometimes often usually maybe perhaps probably actually basically
literally honestly seriously totally absolutely

lol lmao omg haha hahaha hehe idk tbh imo imho btw fwiw fyi ty ttyl gtg
yeah yea yep nah nope ok okay alright sure cool nice yo huh hmm uhh umm
hi hello hey bye gonna wanna gotta lemme kinda sorta dunno

thing things stuff something anything everything nothing someone anyone
everyone nobody somebody everybody anybody one ones way ways
post posts thread threads reply replies people person folks
`.trim().split(/\s+/).filter(Boolean));

// ─── NRC Emotion Lexicon (mini) ──────────────────────────────────────
// Word → array of emotion/sentiment tags.
// Emotions: anger anticipation disgust fear joy sadness surprise trust
// Sentiment: positive negative
export const NRC = {
  // Joy / positive
  love: ['joy','positive','trust'], loved: ['joy','positive'], loving: ['joy','positive','trust'],
  happy: ['joy','positive'], happiness: ['joy','positive'], delight: ['joy','positive'],
  joy: ['joy','positive'], joyful: ['joy','positive'], smile: ['joy','positive'],
  laugh: ['joy','positive'], laughter: ['joy','positive'], cheer: ['joy','positive'],
  celebrate: ['joy','positive'], celebration: ['joy','positive'], party: ['joy','positive'],
  fun: ['joy','positive'], play: ['joy','positive'], dance: ['joy','positive'],
  beautiful: ['joy','positive'], beauty: ['joy','positive'], gorgeous: ['joy','positive'],
  warm: ['joy','positive','trust'], gentle: ['joy','positive','trust'],
  kind: ['joy','positive','trust'], kindness: ['joy','positive','trust'],
  friend: ['joy','positive','trust'], friendship: ['joy','positive','trust'],
  gift: ['joy','positive','surprise'], gold: ['joy','positive'], sun: ['joy','positive'],
  light: ['joy','positive'], sweet: ['joy','positive'], sweetness: ['joy','positive'],
  music: ['joy','positive'], song: ['joy','positive'], wonderful: ['joy','positive'],
  bright: ['joy','positive'], radiant: ['joy','positive'], peace: ['joy','positive','trust'],
  calm: ['joy','positive','trust'], serene: ['joy','positive'], blissful: ['joy','positive'],
  // Sadness / negative
  sad: ['sadness','negative'], sadness: ['sadness','negative'], cry: ['sadness','negative'],
  cried: ['sadness','negative'], weep: ['sadness','negative'], wept: ['sadness','negative'],
  tears: ['sadness','negative'], mourn: ['sadness','negative'], mourning: ['sadness','negative'],
  grief: ['sadness','negative'], sorrow: ['sadness','negative'], lonely: ['sadness','negative'],
  loneliness: ['sadness','negative'], alone: ['sadness','negative'], dark: ['sadness','negative','fear'],
  darkness: ['sadness','negative','fear'], gloom: ['sadness','negative'], miss: ['sadness'],
  missed: ['sadness'], lost: ['sadness','negative'], broken: ['sadness','negative'],
  despair: ['sadness','negative'], regret: ['sadness','negative'], sigh: ['sadness'],
  empty: ['sadness','negative'], void: ['sadness','negative'], hollow: ['sadness','negative'],
  ache: ['sadness','negative'], pain: ['sadness','negative'], painful: ['sadness','negative'],
  hurt: ['sadness','negative'], wound: ['sadness','negative','anger'], depressed: ['sadness','negative'],
  depression: ['sadness','negative'], grief_stricken: ['sadness','negative'], dismay: ['sadness','negative'],
  // Anger / negative
  angry: ['anger','negative'], anger: ['anger','negative'], rage: ['anger','negative'],
  furious: ['anger','negative'], fury: ['anger','negative'], mad: ['anger','negative'],
  hate: ['anger','disgust','negative'], hated: ['anger','disgust','negative'],
  hatred: ['anger','disgust','negative'], fight: ['anger','negative','fear'],
  fought: ['anger','negative'], war: ['anger','negative','fear'], kill: ['anger','negative','fear'],
  killed: ['anger','negative','fear'], scream: ['anger','negative','fear'],
  screamed: ['anger','negative','fear'], yell: ['anger','negative'], shout: ['anger','negative'],
  blood: ['anger','negative','fear'], fierce: ['anger'], cruel: ['anger','negative','disgust'],
  cruelty: ['anger','negative','disgust'], bitter: ['anger','negative','sadness'],
  hostile: ['anger','negative'], insult: ['anger','negative'], conflict: ['anger','negative'],
  attack: ['anger','negative','fear'], attacked: ['anger','negative','fear'], betray: ['anger','negative','disgust'],
  betrayed: ['anger','negative','sadness'], offended: ['anger','negative'], outrage: ['anger','negative'],
  // Fear
  fear: ['fear','negative'], afraid: ['fear','negative'], scared: ['fear','negative'],
  terror: ['fear','negative'], terrified: ['fear','negative'], panic: ['fear','negative'],
  dread: ['fear','negative'], horror: ['fear','negative','disgust'], horrible: ['fear','negative','disgust'],
  anxiety: ['fear','negative'], anxious: ['fear','negative'], nervous: ['fear','negative'],
  worry: ['fear','sadness'], worried: ['fear','sadness'], danger: ['fear','negative'],
  dangerous: ['fear','negative'], threat: ['fear','negative','anger'], threatened: ['fear','negative'],
  ghost: ['fear','negative'], monster: ['fear','negative','disgust'], doom: ['fear','negative'],
  doomed: ['fear','negative'], nightmare: ['fear','negative'], shadow: ['fear'],
  shock: ['fear','surprise','negative'], stunned: ['surprise','fear'], tremble: ['fear','negative'],
  // Disgust
  disgust: ['disgust','negative'], disgusting: ['disgust','negative'], gross: ['disgust','negative'],
  vile: ['disgust','negative','anger'], foul: ['disgust','negative'], rot: ['disgust','negative'],
  rotten: ['disgust','negative'], dirty: ['disgust','negative'], stink: ['disgust','negative'],
  stench: ['disgust','negative'], filth: ['disgust','negative'], filthy: ['disgust','negative'],
  vomit: ['disgust','negative'], slime: ['disgust','negative'], mold: ['disgust','negative'],
  garbage: ['disgust','negative'], trash: ['disgust','negative'], reek: ['disgust','negative'],
  putrid: ['disgust','negative'], nasty: ['disgust','negative','anger'],
  // Surprise
  surprise: ['surprise'], surprised: ['surprise'], surprising: ['surprise'],
  sudden: ['surprise'], suddenly: ['surprise'], shocked: ['surprise','fear','negative'],
  amaze: ['surprise','positive'], amazed: ['surprise','positive'], amazing: ['surprise','positive','joy'],
  astonish: ['surprise'], astonished: ['surprise'], wow: ['surprise'],
  unexpected: ['surprise'], twist: ['surprise'], marvel: ['surprise','positive'],
  wonder: ['surprise','positive','anticipation'], stunning: ['surprise','positive','joy'],
  miracle: ['surprise','positive','joy'], revelation: ['surprise','anticipation'],
  // Trust
  trust: ['trust','positive'], trusted: ['trust','positive'], faith: ['trust','positive','anticipation'],
  loyal: ['trust','positive'], loyalty: ['trust','positive'], honest: ['trust','positive'],
  honesty: ['trust','positive'], true: ['trust','positive'], truth: ['trust','positive'],
  promise: ['trust','positive','anticipation'], reliable: ['trust','positive'],
  safe: ['trust','positive'], safety: ['trust','positive'], secure: ['trust','positive'],
  family: ['trust','positive','joy'], home: ['trust','positive','joy'],
  // Anticipation
  hope: ['anticipation','positive','joy'], hopeful: ['anticipation','positive'],
  expect: ['anticipation'], expected: ['anticipation'], await: ['anticipation'],
  awaited: ['anticipation'], plan: ['anticipation'], planned: ['anticipation'],
  dream: ['anticipation','joy','positive'], future: ['anticipation'], tomorrow: ['anticipation'],
  ready: ['anticipation','trust'], anticipate: ['anticipation'], eager: ['anticipation','joy'],
  excited: ['anticipation','joy','positive','surprise'], excitement: ['anticipation','joy','positive'],
  curious: ['anticipation','positive'], curiosity: ['anticipation','positive'],
  // Mixed / common emotional
  good: ['positive','joy','trust'], great: ['positive','joy'], best: ['positive','joy'],
  bad: ['negative','sadness'], worst: ['negative','sadness','anger'],
  win: ['positive','joy','anticipation'], lose: ['sadness','negative'], loss: ['sadness','negative'],
  fail: ['sadness','negative','fear'], failure: ['sadness','negative'], success: ['positive','joy','trust'],
  proud: ['positive','joy','trust'], pride: ['positive','joy','anger'],
  ashamed: ['sadness','disgust','negative'], shame: ['sadness','disgust','negative'],
  guilt: ['sadness','negative','fear'], guilty: ['sadness','negative','fear'],
};

// ─── Brysbaert Concreteness (mini) ──────────────────────────────────
// Word → 1.0 (most abstract) … 5.0 (most concrete).
export const CONCRETENESS = {
  // 5.0 — physical objects
  apple: 5.0, table: 5.0, chair: 5.0, dog: 5.0, cat: 5.0, tree: 5.0,
  rock: 5.0, water: 5.0, sun: 5.0, moon: 5.0, star: 4.9, hand: 5.0,
  foot: 5.0, eye: 5.0, ear: 5.0, mouth: 5.0, nose: 5.0, hair: 5.0,
  book: 5.0, pen: 5.0, paper: 5.0, car: 5.0, house: 5.0, door: 5.0,
  window: 5.0, road: 4.9, river: 5.0, mountain: 5.0, ocean: 5.0,
  flower: 5.0, grass: 5.0, sand: 5.0, dirt: 5.0, bread: 5.0, milk: 5.0,
  coffee: 5.0, tea: 5.0, glass: 4.9, bottle: 5.0, knife: 5.0, fork: 5.0,
  bed: 5.0, kitchen: 4.9, garden: 4.9, beach: 4.9, forest: 4.9,
  // 4.0 — actions / specific scenes
  run: 4.5, jump: 4.7, walk: 4.6, eat: 4.7, sleep: 4.5, talk: 4.3,
  drive: 4.5, write: 4.4, read: 4.2, cook: 4.6, sing: 4.5, build: 4.3,
  rain: 4.7, snow: 4.8, fire: 4.7, wind: 4.5, smoke: 4.7, ice: 4.8,
  child: 4.5, baby: 4.7, mother: 4.4, father: 4.4, animal: 4.3,
  city: 4.4, town: 4.4, school: 4.5, hospital: 4.6, store: 4.5,
  doctor: 4.4, teacher: 4.3, soldier: 4.5,
  // 3.0 — borderline
  music: 3.5, song: 3.8, story: 3.0, work: 3.0, play: 3.4, game: 3.7,
  dream: 2.5, voice: 3.7, face: 4.5, mind: 2.0, day: 3.0, night: 3.7,
  word: 3.4, name: 3.4, color: 3.6, shape: 3.5, sound: 3.6,
  speech: 3.0, language: 2.7, system: 2.5, change: 2.5, thing: 2.8,
  problem: 2.4, question: 2.6, answer: 2.7, reason: 2.0,
  // 2.0 — abstract concepts
  love: 2.0, fear: 2.4, joy: 2.0, sadness: 1.9, friendship: 2.0,
  virtue: 1.6, justice: 1.8, freedom: 1.8, hope: 1.7, wisdom: 1.6,
  beauty: 2.1, peace: 2.0, war: 3.0, life: 2.4, death: 3.0,
  power: 2.1, control: 2.1, idea: 1.7, thought: 2.0, theory: 1.8,
  belief: 1.6, opinion: 1.9, doubt: 1.9, faith: 1.8, hope: 1.7,
  trust: 1.9, loyalty: 1.6, honor: 1.8, pride: 1.9,
  // 1.0 — most abstract
  truth: 1.5, ethics: 1.4, morality: 1.4, philosophy: 1.4,
  divinity: 1.3, infinity: 1.5, existence: 1.4, consciousness: 1.4,
  ontology: 1.2, epistemology: 1.2, metaphysics: 1.2, awareness: 1.5,
  essence: 1.4, paradigm: 1.4, semiotics: 1.3, hermeneutics: 1.2,
  thesis: 1.5, hypothesis: 1.5, paradox: 1.5,
};

// ─── AFINN-111 (mini) ───────────────────────────────────────────────
// Word → integer sentiment, -5 (very negative) … +5 (very positive).
export const AFINN = {
  // +5
  breathtaking: 5, fantastic: 5, brilliant: 5, outstanding: 5, superb: 5,
  // +4
  amazing: 4, awesome: 4, wonderful: 4, beautiful: 4, excellent: 4,
  loved: 4, perfect: 4, magnificent: 4, splendid: 4, fabulous: 4,
  // +3
  great: 3, lovely: 3, delightful: 3, glorious: 3, charming: 3,
  good: 3, happy: 3, kind: 3, smart: 3, generous: 3, joyful: 3,
  proud: 3, gorgeous: 3, beloved: 3, honest: 3, brave: 3, friendly: 3,
  // +2
  like: 2, fine: 2, decent: 2, gentle: 2, calm: 2, peaceful: 2,
  hope: 2, hopeful: 2, useful: 2, helpful: 2, healthy: 2, fair: 2,
  free: 2, fresh: 2, clean: 2, easy: 2, safe: 2, fun: 2, smile: 2,
  thank: 2, thanks: 2, support: 2, save: 2, share: 2, win: 2,
  // +1
  ok: 1, okay: 1, alright: 1, yes: 1, work: 1, working: 1,
  // -1
  doubt: -1, slow: -1, wait: -1, confuse: -1, bored: -1, tired: -1,
  // -2
  dislike: -2, sad: -2, lonely: -2, miss: -2, lose: -2, lost: -2,
  problem: -2, confused: -2, weak: -2, strange: -2, weird: -2,
  // -3
  bad: -3, hate: -3, ugly: -3, sick: -3, hurt: -3, sorry: -3,
  fail: -3, broken: -3, scared: -3, suffer: -3, suffering: -3,
  cry: -3, lost: -3, alone: -3, dark: -3, lie: -3, dead: -3,
  // -4
  terrible: -4, horrible: -4, awful: -4, disgusting: -4, dreadful: -4,
  cruel: -4, brutal: -4, evil: -4, hateful: -4, sickening: -4,
  // -5
  tragedy: -5, horror: -5, atrocity: -5, monstrous: -5, abomination: -5,
  catastrophe: -5, hellish: -5,
};

// ─── Baseline frequency (per million) ───────────────────────────────
// Top common English content words, used to compute TF-IDF distinctiveness.
// Words not in this list (and not stopwords) are rare-overall, so a high
// frequency in the user's corpus suggests author-distinctive vocabulary.
// SUBTLEX-US-derived; rounded for size.
export const BASELINE_FREQ = {
  time: 1900, year: 1500, day: 1400, way: 1200, life: 1100, world: 1100,
  man: 1500, woman: 700, people: 1900, child: 700, friend: 700,
  house: 600, family: 600, home: 800, place: 700, work: 1100, school: 600,
  business: 400, money: 700, problem: 500, story: 500, thing: 2200,
  good: 2000, great: 700, big: 600, small: 400, new: 1300, old: 700,
  young: 400, beautiful: 200, hard: 600, easy: 300, true: 500, right: 1500,
  wrong: 500, bad: 700, important: 400, real: 600, different: 500,
  best: 600, only: 1100, last: 800, first: 800, next: 600,
  long: 600, high: 400, low: 200, large: 200, full: 300, late: 300, early: 200,
  see: 1900, look: 1300, know: 2700, think: 1700, want: 2000, give: 800,
  use: 700, find: 800, tell: 900, ask: 700, work: 1100, seem: 500,
  feel: 1000, try: 1100, leave: 600, call: 900, keep: 700, need: 1300,
  start: 600, show: 500, hear: 500, play: 700, run: 600, move: 500,
  live: 700, believe: 600, hold: 400, bring: 500, happen: 700, write: 400,
  sit: 400, stand: 400, lose: 400, pay: 600, meet: 400, include: 200,
  continue: 200, learn: 400, change: 500, lead: 200, understand: 600,
  watch: 500, follow: 300, stop: 500, create: 200, speak: 300, read: 400,
  allow: 200, add: 300, spend: 300, grow: 300, open: 400, walk: 400,
  win: 400, offer: 200, remember: 600, love: 800, consider: 200,
  appear: 200, buy: 400, wait: 500, serve: 200, die: 600, send: 400,
  expect: 300, build: 200, stay: 500, fall: 400, cut: 300, reach: 200,
  kill: 600, remain: 200, suggest: 200, raise: 200, pass: 400, sell: 300,
  require: 100, report: 100, decide: 300, pull: 300, return: 300,
  // names / words common everywhere
  name: 600, girl: 500, boy: 400, hand: 700, eye: 600, mouth: 400,
  light: 500, water: 600, food: 500, song: 300, music: 300, book: 400,
  word: 600, language: 200, mind: 500, heart: 700, head: 800, body: 500,
  // common modifiers
  little: 800, less: 400, more: 1500, many: 600, much: 1200, few: 300,
  long: 600, several: 100, important: 400, real: 600, simple: 200,
  difficult: 200, possible: 300, probable: 100, sure: 1000, certain: 200,
};
