// srd5.selftest — run before trusting anything generated from the SRD PDF:
//   node table/srd5/srd5.selftest.mjs
//
// A PDF PARSE FAILS IN PROSE. Cairn's SRD is HTML with real table markup, so a
// broken parse there tends to throw. This one recovers rules out of two
// justified columns, and its failures come back looking like English: a
// creature quietly missing a CR, a damage die read off the wrong side of a
// column break, a swarm welded onto the creature above it. Every one of those
// still renders on a page and still simulates. So the tests below are built to
// make the failure loud, and they fall into three kinds:
//
//   RECONCILIATION. Count the same thing two ways and require the counts to
//   agree — 330 stat blocks against 330 AC lines is what caught the swarms.
//
//   EXTERNAL GRADING. Check the parse against knowledge that is NOT in our
//   parse. The CR-to-XP table is the important one: CR and XP are read from
//   the same line by the same regex, and the mapping between them comes from
//   outside, so if either capture slips the relation breaks.
//
//   ARTEFACT SWEEPS. The specific damage typesetting does — hyphens at line
//   breaks, split digits, page furniture — searched for across the whole
//   corpus rather than spot-checked.
//
// This work includes material from the System Reference Document 5.2.1
// ("SRD 5.2.1") by Wizards of the Coast LLC, available at
// https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
// Commons Attribution 4.0 International License, available at
// https://creativecommons.org/licenses/by/4.0/legalcode.

import { BESTIARY } from './monsters.js';
import { XP_BUDGET, FEATS, CLASSES } from './data.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// ---------------------------------------------------------------------------
// 1. the corpus is all there
// ---------------------------------------------------------------------------
{
  ok(BESTIARY.length === 330, `330 stat blocks parsed (got ${BESTIARY.length})`);
  ok(new Set(BESTIARY.map((m) => m.name)).size === BESTIARY.length,
    'every creature name is unique — a duplicate means one block swallowed another');

  const missing = (k) => BESTIARY.filter((m) => m[k] === undefined).map((m) => m.name);
  for (const key of ['size', 'type', 'alignment', 'ac', 'hp', 'speed', 'cr', 'xp', 'abilities']) {
    const gone = missing(key);
    ok(gone.length === 0, `every creature has ${key} (${gone.length} missing: ${gone.slice(0, 4)})`);
  }
  const sixAbilities = BESTIARY.filter((m) => Object.keys(m.abilities || {}).length !== 6);
  ok(sixAbilities.length === 0,
    `every creature has all six abilities (${sixAbilities.map((m) => m.name).slice(0, 4)})`);

  // The swarms are the regression: their type line reads "Large Swarm of Tiny
  // Beasts", and a type pattern of one capitalised word merged all seven into
  // the creature above.
  const swarms = BESTIARY.filter((m) => m.name.startsWith('Swarm of'));
  ok(swarms.length === 7, `all seven swarms are their own creature (got ${swarms.length})`);
  ok(swarms.every((m) => /Swarm of/.test(m.type)), 'and their type survived intact');
}

// ---------------------------------------------------------------------------
// 2. graded against the official CR-to-XP table
// ---------------------------------------------------------------------------
//
// This table is NOT parsed from the PDF — it is the published mapping, written
// out here by hand. That is the whole point: cr and xp are captured off one
// line by one regex, so grading their relationship against outside knowledge
// tests both captures at once. A regex that drifted onto a neighbouring number
// would still produce plausible integers, and this is what would notice.
{
  const CR_XP = {
    '0': [0, 10], '1/8': [25], '1/4': [50], '1/2': [100],
    '1': [200], '2': [450], '3': [700], '4': [1100], '5': [1800],
    '6': [2300], '7': [2900], '8': [3900], '9': [5000], '10': [5900],
    '11': [7200], '12': [8400], '13': [10000], '14': [11500], '15': [13000],
    '16': [15000], '17': [18000], '18': [20000], '19': [22000], '20': [25000],
    '21': [33000], '22': [41000], '23': [50000], '24': [62000], '25': [75000],
    '26': [90000], '27': [105000], '28': [120000], '29': [135000], '30': [155000],
  };
  const unknown = BESTIARY.filter((m) => !CR_XP[m.cr]);
  ok(unknown.length === 0,
    `every CR is a real CR (${unknown.map((m) => `${m.name}=${m.cr}`).slice(0, 4)})`);

  // ONE creature disagrees, and it is the document that is wrong, not us.
  // SRD 5.2.1 prints "Archmage ... CR 12 (XP 8,000; PB +4)"; CR 12 is worth
  // 8,400, and the Erinyes — also CR 12, four pages away — prints 8,400. So
  // this is an erratum in the source and the parse is faithful to it. The data
  // keeps what the document says; correcting it silently would make this
  // corpus disagree with the book someone is reading at the table.
  const ERRATA = { Archmage: 8000 };
  const wrong = BESTIARY.filter((m) => CR_XP[m.cr] && !CR_XP[m.cr].includes(m.xp));
  const unexpected = wrong.filter((m) => ERRATA[m.name] !== m.xp);
  ok(unexpected.length === 0,
    `every creature's XP matches its CR, bar the known erratum ` +
    `(${unexpected.slice(0, 4).map((m) => `${m.name} CR${m.cr}=${m.xp}xp`)})`);
  // And the erratum is still there and still alone — if a later revision fixes
  // it, or adds another, this is what says so rather than the list rotting.
  ok(wrong.length === 1 && wrong[0].name === 'Archmage',
    `the Archmage's XP is still the only one the SRD gets wrong (${wrong.map((m) => m.name)})`);
  const erinyes = BESTIARY.find((m) => m.name === 'Erinyes');
  ok(erinyes && erinyes.cr === '12' && erinyes.xp === 8400,
    'and the other CR 12 creature prints 8,400, which is what makes it an erratum and not our bug');

  // and the check is not vacuous — it has to be grading a wide spread
  const spread = new Set(BESTIARY.map((m) => m.cr));
  ok(spread.size >= 20, `graded across ${spread.size} distinct CRs`);

  // The four dragons whose CR line is written "CR 3 (700 XP)" rather than
  // "CR 3 (XP 700)". Missing that variant silently cost them CR *and* XP.
  for (const name of ['Gold Dragon Wyrmling', 'Silver Dragon Wyrmling',
    'White Dragon Wyrmling', 'Young White Dragon']) {
    const m = BESTIARY.find((x) => x.name === name);
    ok(m && m.cr && m.xp > 0, `${name} kept its CR and XP despite the odd CR line`);
  }
}

// ---------------------------------------------------------------------------
// 3. the numbers are sane in their own right
// ---------------------------------------------------------------------------
{
  const bad = (f) => BESTIARY.filter(f).map((m) => m.name);
  ok(bad((m) => m.ac < 5 || m.ac > 25).length === 0,
    `AC is in a believable range (${bad((m) => m.ac < 5 || m.ac > 25)})`);
  ok(bad((m) => m.hp < 1 || m.hp > 700).length === 0,
    `HP is in a believable range (${bad((m) => m.hp < 1 || m.hp > 700)})`);
  ok(bad((m) => Object.values(m.abilities).some((a) => a.score < 1 || a.score > 30)).length === 0,
    'no ability score outside 1..30');

  // The modifier is a function of the score, so it grades the score's parse.
  const mismatched = BESTIARY.flatMap((m) => Object.entries(m.abilities)
    .filter(([, a]) => a.mod !== Math.floor((a.score - 10) / 2))
    .map(([k, a]) => `${m.name}.${k} ${a.score}->${a.mod}`));
  ok(mismatched.length === 0,
    `every ability modifier follows from its score (${mismatched.slice(0, 5)})`);

  // Bigger CR should mean more hit points, on average, or something is badly
  // crossed. Not a rule of the game — a sanity check on the whole corpus.
  const at = (cr) => {
    const xs = BESTIARY.filter((m) => m.cr === cr).map((m) => m.hp);
    return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  };
  ok(at('1') < at('5') && at('5') < at('10'),
    `mean HP climbs with CR (${at('1').toFixed(0)} < ${at('5').toFixed(0)} < ${at('10').toFixed(0)})`);
}

// ---------------------------------------------------------------------------
// 4. the action grammar — this is what makes a map possible
// ---------------------------------------------------------------------------
{
  const every = BESTIARY.flatMap((m) => [...(m.actions || []), ...(m.bonusActions || []),
    ...(m.reactions || []), ...(m.legendaryActions || [])].map((a) => ({ m: m.name, ...a })));
  const attacks = every.filter((a) => a.attack);

  // RECONCILIATION, not a threshold. Counting the entries whose prose SAYS
  // "Attack Roll:" and requiring every one of them to have produced numbers is
  // the check that matters; a bare "more than 250 parsed" passed happily while
  // 80 attacks were being dropped, because 343 is also more than 250.
  const claimed = every.filter((a) => /Attack Roll:/.test(a.text));
  const dropped = claimed.filter((a) => !a.attack);
  ok(dropped.length === 0,
    `all ${claimed.length} entries that say "Attack Roll:" parsed into numbers ` +
    `(${dropped.length} dropped: ${dropped.slice(0, 3).map((a) => `${a.m}/${a.name}`)})`);
  ok(claimed.length > 400, `and there are ${claimed.length} of them to check`);

  // The same reconciliation for the other half of the grammar.
  const saveClaims = every.filter((a) => /Saving Throw:/.test(a.text));
  const saveDropped = saveClaims.filter((a) => !a.save);
  ok(saveDropped.length === 0,
    `all ${saveClaims.length} entries that force a save parsed one ` +
    `(${saveDropped.slice(0, 3).map((a) => `${a.m}/${a.name}`)})`);

  // A phantom action named for a damage type is the fingerprint of the entry
  // splitter breaking a wrapped line, which is how those 80 went missing.
  const phantom = every.filter((a) => /^(Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder)( damage)?$/.test(a.name));
  ok(phantom.length === 0,
    `no action is named after a damage type (${phantom.slice(0, 4).map((a) => `${a.m}/${a.name}`)})`);

  ok(attacks.every((a) => a.attack.dice === null || /^\d+d\d+([+-]\d+)?$/.test(a.attack.dice)),
    `every attack's damage is a dice expression or a flat number (${attacks
      .filter((a) => a.attack.dice !== null && !/^\d+d\d+([+-]\d+)?$/.test(a.attack.dice))
      .slice(0, 4).map((a) => `${a.m}:${a.attack.dice}`)})`);
  ok(attacks.filter((a) => a.attack.dice === null && a.attack.avg !== null).length > 0,
    'and the flat-damage attacks really exist — the SRD does print "Hit: 1 Slashing damage"');
  // The Roper's tentacle hits, grapples, poisons, and deals no damage. Its
  // bonus and reach still matter to a map, so it is kept as a damageless
  // attack rather than discarded for not fitting the shape.
  const damageless = attacks.filter((a) => a.attack.avg === null);
  ok(damageless.length >= 1 && damageless.every((a) => a.attack.bonus !== undefined),
    `attacks that deal no damage keep their bonus and reach (${damageless.map((a) => `${a.m}/${a.name}`)})`);
  const jackal = BESTIARY.find((m) => m.name === 'Jackal');
  ok(jackal && (jackal.actions || []).some((a) => a.attack && a.attack.dice === '1d4-1'),
    "the Jackal's 1d4–1 survived its en dash");

  // The average printed in the stat block is a function of the dice, so it
  // grades the dice parse the same way the modifier grades the score.
  const avgOf = (d) => {
    const [, n, faces, bonus] = /^(\d+)d(\d+)([+-]\d+)?$/.exec(d);
    return Math.floor(Number(n) * (Number(faces) + 1) / 2) + Number(bonus || 0);
  };
  const off = attacks.filter((a) => a.attack.dice
    && Math.abs(avgOf(a.attack.dice) - a.attack.avg) > 1);
  ok(off.length === 0,
    `every printed average matches its dice (${off.slice(0, 5)
      .map((a) => `${a.m} ${a.attack.dice}=${a.attack.avg}`)})`);

  const TYPES = new Set(['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning',
    'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']);
  const oddType = attacks.filter((a) => a.attack.damageType && !TYPES.has(a.attack.damageType));
  ok(oddType.length === 0,
    `every damage type is one of the game's thirteen (${oddType.slice(0, 5)
      .map((a) => `${a.m}:${a.attack.damageType}`)})`);

  // Distances are the map layer's whole foundation, so they must be real and
  // must be multiples of five feet — a grid square.
  const reaches = attacks.filter((a) => a.attack.reach !== undefined);
  const ranges = attacks.filter((a) => a.attack.range !== undefined);
  ok(reaches.length > 200, `${reaches.length} melee attacks carry a reach`);
  ok(ranges.length > 20, `${ranges.length} attacks carry a range`);
  ok([...reaches, ...ranges].every((a) => (a.attack.reach || a.attack.range) % 5 === 0),
    'every distance is a whole number of five-foot squares');
  // 60 ft. is the Roper, whose tentacles really do reach across a cavern.
  ok(reaches.every((a) => a.attack.reach >= 5 && a.attack.reach <= 60),
    `reach is between 5 and 60 feet (${reaches.filter((a) => a.attack.reach > 60).map((a) => `${a.m}:${a.attack.reach}`)})`);

  const saves = BESTIARY.flatMap((m) => (m.actions || []).filter((a) => a.save));
  ok(saves.length > 100, `${saves.length} actions force a saving throw`);
  ok(saves.every((a) => a.save.dc >= 8 && a.save.dc <= 30), 'every save DC is in 8..30');
  ok(saves.every((a) => ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].includes(a.save.ability)),
    'every save names a real ability');
}

// ---------------------------------------------------------------------------
// 5. typesetting artefacts, swept for across the whole corpus
// ---------------------------------------------------------------------------
{
  const all = JSON.stringify(BESTIARY);

  // The running head and folio, which land mid-block when one spans a page.
  ok(!all.includes('System Reference Document'),
    'no page header leaked into a creature');

  // "7 ,200" and "10 –11": digits the justifier split.
  const splitNums = all.match(/\d\s+,\d|\d\s+[–—]\s*\d/g) || [];
  ok(splitNums.length === 0, `no digits split by the justifier (${splitNums.slice(0, 4)})`);

  // A hyphen still sitting at what used to be a line break shows up as one
  // inside a word with no partner: "suc- ceed".
  const dangling = all.match(/[a-z]-\s+[a-z]/g) || [];
  ok(dangling.length === 0, `no hyphens left over from line breaks (${dangling.slice(0, 6)})`);

  // U+2212. Fine in prose, but a number carrying one will not parse as a number.
  ok(!all.includes('−'), 'no Unicode minus signs left in the data');

  // Names should be names, not a sentence that ran into the block.
  const longNames = BESTIARY.filter((m) => m.name.length > 34 || m.name.includes('.'));
  ok(longNames.length === 0, `no creature name is a runaway sentence (${longNames.map((m) => m.name)})`);
  ok(BESTIARY.every((m) => m.name && m.name[0] === m.name[0].toUpperCase()),
    'every creature name starts with a capital');
}

// ---------------------------------------------------------------------------
// 6. the official encounter maths — the thing this build exists to grade
// ---------------------------------------------------------------------------
{
  const levels = Object.keys(XP_BUDGET).map(Number).sort((a, b) => a - b);
  ok(levels.length === 20 && levels[0] === 1 && levels[19] === 20,
    `the XP budget table covers levels 1..20 (got ${levels.length})`);

  const rows = levels.map((l) => XP_BUDGET[String(l)]);
  ok(rows.every((r) => r && r.low > 0 && r.moderate > 0 && r.high > 0),
    'every row has all three difficulties');
  ok(rows.every((r) => r.low < r.moderate && r.moderate < r.high),
    'low < moderate < high on every row — a mis-sliced table would cross these');
  ok(rows.every((r, i) => i === 0 || r.moderate >= rows[i - 1].moderate),
    'the budget never decreases as level rises');

  // Two rows written out by hand from the published table, as an anchor: if
  // the slicer drifts by a column these are what say so.
  ok(XP_BUDGET['1'].low === 50 && XP_BUDGET['1'].moderate === 75 && XP_BUDGET['1'].high === 100,
    `level 1 reads 50/75/100 (got ${JSON.stringify(XP_BUDGET['1'])})`);
  ok(XP_BUDGET['5'].low === 500 && XP_BUDGET['5'].moderate === 750 && XP_BUDGET['5'].high === 1100,
    `level 5 reads 500/750/1,100 (got ${JSON.stringify(XP_BUDGET['5'])})`);
}

// ---------------------------------------------------------------------------
// 7. classes and feats — the tree layer's raw material
// ---------------------------------------------------------------------------
{
  const NAMES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
    'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
  ok(Object.keys(CLASSES).length === 12, `all twelve classes parsed (${Object.keys(CLASSES).length})`);
  ok(NAMES.every((n) => CLASSES[n]), 'and they are the twelve the SRD publishes');
  ok(NAMES.every((n) => [6, 8, 10, 12].includes(CLASSES[n].hitDie)),
    `every class has a real hit die (${NAMES.map((n) => `${n}:d${CLASSES[n].hitDie}`).filter((s) => !/d(6|8|10|12)$/.test(s))})`);
  ok(NAMES.every((n) => Object.keys(CLASSES[n].features).length >= 10),
    'every class has features across at least ten of its levels');
  ok(NAMES.every((n) => CLASSES[n].features['1']),
    'every class has something at level 1');

  ok(FEATS.length === 17, `17 feats parsed (got ${FEATS.length})`);
  const cats = new Set(FEATS.map((f) => f.category));
  ok(cats.size === 4, `feats fall into four categories (${[...cats]})`);
  ok(FEATS.filter((f) => f.prerequisite).length >= 1, 'at least one feat is gated');
  ok(FEATS.every((f) => f.text && f.text.length > 40), 'every feat kept its rules text');

  // Being honest in the tests about how thin this is. If a later SRD revision
  // adds feats or subclasses these numbers change and the test says so, which
  // is the point — the page claims "the tree is thin" and this is the evidence.
  ok(FEATS.length < 60 && Object.keys(CLASSES).length === 12,
    'the SRD tree really is small — the page must not imply otherwise');
}

console.log(`srd5.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
