#!/usr/bin/env node
// fix.selftest.mjs — node-run sanity check for the FIX parser engine (fix.js)
// and the generated dictionaries (fix/data/*.json). Run before touching either:
//   node fix/lib/fix.selftest.mjs
// Exits non-zero on any failure.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFix, detectDelimiter, splitPairs, pickVersion } from './fix.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const load = (slug) => JSON.parse(readFileSync(join(DATA, slug + '.json'), 'utf8'));
const fix44 = load('fix44');
const index = JSON.parse(readFileSync(join(DATA, 'index.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

// A valid NewOrderSingle (FIX.4.4) with a 2-entry NoPartyIDs repeating group.
// BodyLength + CheckSum are correct (pinned) so validation must pass.
const PIPE = '8=FIX.4.4|9=191|35=D|49=BUYSIDE|56=SELLSIDE|34=2|52=20240115-12:30:00.000|11=ORD10001|453=2|448=trader1|447=D|452=11|448=fundABC|447=D|452=13|55=AAPL|54=1|60=20240115-12:30:00.000|38=100|40=2|44=185.50|59=0|10=161|';
const SOHMSG = PIPE.split('|').join('\x01');

// ── delimiter detection ──────────────────────────────────────────────────────
eq(detectDelimiter(PIPE).char, '|', 'detects pipe delimiter');
eq(detectDelimiter(SOHMSG).char, '\x01', 'detects SOH delimiter');
eq(detectDelimiter(PIPE.split('|').join('^')).char, '^', 'detects caret delimiter');
eq(splitPairs(PIPE, '|').length, 23, 'splits into 23 pairs');

// ── header / body / trailer classification ───────────────────────────────────
const r = parseFix(PIPE, fix44);
eq(r.beginString, 'FIX.4.4', 'beginString');
eq(r.msgType.code, 'D', 'msgType code');
eq(r.msgType.name, 'NewOrderSingle', 'msgType name');
eq(r.fields.find((f) => f.tag === 8).section, 'header', 'tag 8 is header');
eq(r.fields.find((f) => f.tag === 10).section, 'trailer', 'tag 10 is trailer');
eq(r.fields.find((f) => f.tag === 55).section, 'body', 'tag 55 is body');

// ── enum decoding ────────────────────────────────────────────────────────────
eq(r.fields.find((f) => f.tag === 54).enumDesc, 'BUY', 'Side=1 decodes to BUY');
eq(r.fields.find((f) => f.tag === 40).enumDesc, 'LIMIT', 'OrdType=2 decodes to LIMIT');
eq(r.fields.find((f) => f.tag === 59).enumDesc, 'DAY', 'TimeInForce=0 decodes to DAY');
eq(r.fields.find((f) => f.tag === 44).name, 'Price', 'tag 44 is Price');
eq(r.fields.find((f) => f.tag === 44).enumDesc, null, 'Price has no enum');

// ── BodyLength + CheckSum validation ─────────────────────────────────────────
ok(r.bodyLength.present && r.bodyLength.ok, 'BodyLength validates');
eq(r.bodyLength.computed, 191, 'BodyLength computed = 191');
ok(r.checksum.present && r.checksum.ok, 'CheckSum validates');
eq(r.checksum.computed, '161', 'CheckSum computed = 161');
eq(r.warnings.length, 0, 'no warnings on a clean message');

// SOH form parses identically.
const rs = parseFix(SOHMSG, fix44);
ok(rs.bodyLength.ok && rs.checksum.ok, 'SOH form validates too');

// ── repeating group reconstruction ───────────────────────────────────────────
const grp = r.tree.find((n) => n.kind === 'group' && n.field.tag === 453);
ok(grp, 'NoPartyIDs (453) recognised as a group');
eq(grp.stated, 2, 'group states 2 entries');
eq(grp.entries.length, 2, 'group parsed 2 entries');
eq(grp.entries[0][0].field.tag, 448, 'entry starts with delimiter PartyID (448)');
eq(grp.entries[0].length, 3, 'entry 1 has 3 fields (448,447,452)');
eq(grp.entries[1][0].field.value, 'fundABC', 'entry 2 PartyID value');
// The field AFTER the group (55=AAPL) must be back at top level, not swallowed.
ok(r.tree.some((n) => n.kind === 'field' && n.field.tag === 55), '55 stays top-level after group');

// ── tampered checksum is caught ──────────────────────────────────────────────
const bad = parseFix(PIPE.replace('10=161', '10=099'), fix44);
ok(bad.checksum.present && !bad.checksum.ok, 'wrong CheckSum flagged');
ok(bad.warnings.some((w) => /CheckSum/.test(w)), 'CheckSum warning emitted');

// ── malformed input never throws ─────────────────────────────────────────────
ok(parseFix('', fix44).fieldCount === 0, 'empty input handled');
ok(parseFix('garbage without equals', fix44).warnings.length > 0, 'garbage warned, no throw');
ok(parseFix('8=FIX.4.4|35=ZZ|10=000', fix44).warnings.some((w) => /Unknown MsgType/.test(w)), 'unknown msgtype warned');

// ── version auto-pick ────────────────────────────────────────────────────────
eq(pickVersion('FIX.4.4', index.versions), 'fix44', 'FIX.4.4 → fix44');
eq(pickVersion('FIX.4.2', index.versions), 'fix42', 'FIX.4.2 → fix42');
eq(pickVersion('FIX.9.9', index.versions), null, 'unknown version → null');

// ── every version's dictionary is structurally sound ─────────────────────────
for (const v of index.versions) {
  const d = load(v.slug);
  ok(Object.keys(d.fields).length === v.fieldCount, `${v.slug}: field count matches index`);
  ok(d.messages['0'] && d.messages['0'].name === 'Heartbeat', `${v.slug}: MsgType 0 = Heartbeat`);
  ok(Array.isArray(d.header) && d.header.includes(8) && d.header.includes(35), `${v.slug}: header has 8 and 35`);
  ok(Array.isArray(d.trailer) && d.trailer.includes(10), `${v.slug}: trailer has 10`);
  for (const [numTag, g] of Object.entries(d.groups)) {
    ok(g.delim != null && Array.isArray(g.members) && g.members.length > 0, `${v.slug}: group ${numTag} well-formed`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
