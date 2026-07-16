// fix.js — the FIX message parser engine. Pure, dependency-free, and shared
// verbatim by the worker-served page (fix/index.html imports it) and the node
// selftest (fix/lib/fix.selftest.mjs — run it before touching this file).
//
// A FIX message is an ordered list of `tag=value` pairs joined by the SOH
// control byte (0x01). This engine:
//   • auto-detects the field delimiter (real SOH, or the pipe / caret / newline
//     substitutes people paste),
//   • decodes each tag → field name + type, and each value → enum description,
//     from a dictionary produced by scripts/build-fix-data.mjs,
//   • classifies fields into header / body / trailer,
//   • reconstructs repeating groups as a nested tree using the dictionary's
//     per-group delimiter + member sets,
//   • validates BodyLength (tag 9) and CheckSum (tag 10) against the raw bytes.
//
// It never throws on malformed input — it degrades and reports via `warnings`.

const SOH = '\x01';

// UTF-8 byte length / byte array — FIX BodyLength and CheckSum are byte counts,
// not JS char counts, so multibyte values (in Text etc.) are measured correctly.
const ENC = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
function utf8(str) {
  if (ENC) return ENC.encode(str);
  // node without global TextEncoder (very old) — fall back to Buffer.
  return Uint8Array.from(Buffer.from(str, 'utf8'));
}
function byteLen(str) { return utf8(str).length; }
function byteSum(str) { let s = 0; for (const b of utf8(str)) s += b; return s; }

// ── Delimiter detection ──────────────────────────────────────────────────────
// Score each candidate by how many well-formed `<digits>=<value>` pairs it
// yields; the winner is the delimiter that parses cleanest.
const CANDIDATES = [
  { char: SOH, label: 'SOH (0x01)' },
  { char: '|', label: 'pipe |' },
  { char: '^', label: 'caret ^' },
  { char: '␁', label: '␁ (SYMBOL FOR SOH)' },
  { char: ';', label: 'semicolon ;' },
  { char: '\n', label: 'newline' },
];
export function detectDelimiter(raw) {
  // A literal backslash-x01 (from logs that escaped the control char) — normalize.
  let best = null;
  for (const cand of CANDIDATES) {
    if (!raw.includes(cand.char)) continue;
    const parts = raw.split(cand.char);
    let good = 0;
    for (const p of parts) {
      const s = p.trim();
      if (/^\d+=/.test(s)) good++;
    }
    const score = good;
    if (!best || score > best.score) best = { ...cand, score };
  }
  // Nothing matched (single field, or "\x01" written literally) — try the
  // literal escape, else default to SOH.
  if (!best) {
    if (raw.includes('\\x01')) return { char: '\\x01', label: 'literal \\x01', score: 0, literal: true };
    return { char: SOH, label: 'SOH (0x01)', score: 0 };
  }
  return best;
}

// ── Split raw text into ordered {tag, value} pairs ───────────────────────────
export function splitPairs(raw, delimChar) {
  const text = delimChar === '\\x01' ? raw.split('\\x01').join(SOH) : raw;
  const d = delimChar === '\\x01' ? SOH : delimChar;
  const pairs = [];
  for (const chunk of text.split(d)) {
    const s = chunk.trim();
    if (!s) continue;
    const eq = s.indexOf('=');
    if (eq < 0) { pairs.push({ raw: s, malformed: true }); continue; }
    const tagStr = s.slice(0, eq);
    const value = s.slice(eq + 1);
    if (!/^\d+$/.test(tagStr)) { pairs.push({ raw: s, malformed: true }); continue; }
    pairs.push({ tag: +tagStr, value });
  }
  return pairs;
}

// ── Decode a single pair against the dictionary ──────────────────────────────
function decode(pair, dict, headerSet, trailerSet) {
  if (pair.malformed) return { ...pair, name: null, type: null };
  const def = dict.fields[pair.tag];
  const name = def ? def.name : null;
  const type = def ? def.type : null;
  let enumDesc = null;
  if (def && def.enums) {
    if (Object.prototype.hasOwnProperty.call(def.enums, pair.value)) enumDesc = def.enums[pair.value];
    // MULTIPLEVALUESTRING / MULTIPLECHARVALUE: space-separated enum tokens.
    else if ((type === 'MULTIPLEVALUESTRING' || type === 'MULTIPLECHARVALUE' || type === 'MULTIPLESTRINGVALUE') && pair.value.includes(' ')) {
      const parts = pair.value.split(/\s+/).map((v) => def.enums[v] ? `${v}=${def.enums[v]}` : v);
      enumDesc = parts.join(', ');
    }
  }
  const section = headerSet.has(pair.tag) ? 'header' : trailerSet.has(pair.tag) ? 'trailer' : 'body';
  return { tag: pair.tag, value: pair.value, name, type, enumDesc, section, known: !!def, isGroupCount: !!dict.groups[pair.tag] };
}

// ── Reconstruct repeating groups into a nested tree ──────────────────────────
// Walks the decoded fields in order. A NUMINGROUP tag opens a group; each entry
// starts with the group's delimiter tag and runs until the delimiter recurs
// (next entry) or a non-member tag appears (group ends). Nested groups recurse.
function groupize(fields, dict) {
  let i = 0;
  function consumeGroup() {
    const countField = fields[i];
    const g = dict.groups[countField.tag];
    const count = parseInt(countField.value, 10);
    i++;
    const node = { kind: 'group', field: countField, stated: Number.isFinite(count) ? count : 0, entries: [] };
    const members = new Set(g.members);
    while (node.entries.length < node.stated && i < fields.length && fields[i].tag === g.delim) {
      node.entries.push(consumeEntry(g, members));
    }
    return node;
  }
  function consumeEntry(g, members) {
    const nodes = [{ kind: 'field', field: fields[i] }]; // the delimiter field
    i++;
    while (i < fields.length) {
      const f = fields[i];
      if (f.tag === g.delim) break;      // next entry
      if (!members.has(f.tag)) break;    // group ended
      if (dict.groups[f.tag]) nodes.push(consumeGroup());
      else { nodes.push({ kind: 'field', field: f }); i++; }
    }
    return nodes;
  }
  const out = [];
  while (i < fields.length) {
    const f = fields[i];
    if (dict.groups[f.tag] && !f.malformed) out.push(consumeGroup());
    else { out.push({ kind: 'field', field: f }); i++; }
  }
  return out;
}

// ── BodyLength (9) and CheckSum (10) validation ──────────────────────────────
function validate(pairs) {
  // Canonical byte stream: fields joined by SOH, each terminated by SOH.
  let offset = 0;
  const starts = []; // byte offset where each field begins
  let canonical = '';
  for (const p of pairs) {
    starts.push(offset);
    const s = p.malformed ? p.raw + SOH : `${p.tag}=${p.value}${SOH}`;
    canonical += s;
    offset += byteLen(s);
  }
  const idx9 = pairs.findIndex((p) => p.tag === 9);
  const idx10 = pairs.findIndex((p) => p.tag === 10);

  const result = { bodyLength: null, checksum: null };

  if (idx10 >= 0) {
    const stated = pairs[idx10].value;
    // CheckSum = (sum of all bytes up to, but not including, the CheckSum field) mod 256.
    const upto = canonical.slice(0, canonical.length ? charIndexAt(canonical, starts[idx10]) : 0);
    const computed = String(byteSum(upto) % 256).padStart(3, '0');
    result.checksum = { present: true, stated, computed, ok: stated === computed };
  } else {
    result.checksum = { present: false };
  }

  if (idx9 >= 0 && idx10 >= 0 && idx9 + 1 < pairs.length) {
    const stated = parseInt(pairs[idx9].value, 10);
    // BodyLength = bytes from the char after BodyLength's SOH up to and including
    // the SOH before CheckSum. That's [start of field idx9+1, start of field idx10).
    const computed = starts[idx10] - starts[idx9 + 1];
    result.bodyLength = { present: true, stated, computed, ok: stated === computed };
  } else {
    result.bodyLength = { present: idx9 >= 0 };
  }
  return result;
}
// canonical is a JS string of single-byte + multibyte chars; `starts` are BYTE
// offsets. Convert a byte offset to a JS char index by walking encoded lengths.
function charIndexAt(str, byteOffset) {
  if (byteOffset <= 0) return 0;
  let b = 0;
  for (let c = 0; c < str.length; c++) {
    if (b >= byteOffset) return c;
    b += byteLen(str[c]);
  }
  return str.length;
}

// ── Top-level parse ──────────────────────────────────────────────────────────
export function parseFix(raw, dict) {
  const input = (raw || '').trim();
  const delimiter = detectDelimiter(input);
  const pairs = splitPairs(input, delimiter.char);

  const headerSet = new Set(dict.header || []);
  const trailerSet = new Set(dict.trailer || []);
  const decoded = pairs.map((p) => decode(p, dict, headerSet, trailerSet));

  const tree = groupize(decoded, dict);
  const validation = validate(pairs);

  // Summary fields.
  const beginStringField = decoded.find((f) => f.tag === 8);
  const msgTypeField = decoded.find((f) => f.tag === 35);
  const msgDef = msgTypeField ? dict.messages[msgTypeField.value] : null;

  const warnings = [];
  if (!pairs.length) warnings.push('No FIX fields found.');
  if (pairs.length && decoded[0].tag !== 8) warnings.push('First field is not BeginString (tag 8).');
  if (msgTypeField && !msgDef) warnings.push(`Unknown MsgType "${msgTypeField.value}" for ${dict.label}.`);
  const unknown = decoded.filter((f) => !f.malformed && !f.known).map((f) => f.tag);
  if (unknown.length) warnings.push(`Unknown tag(s) for ${dict.label}: ${[...new Set(unknown)].join(', ')}.`);
  const malformed = decoded.filter((f) => f.malformed);
  if (malformed.length) warnings.push(`${malformed.length} chunk(s) were not \`tag=value\`.`);
  if (validation.checksum && validation.checksum.present && !validation.checksum.ok)
    warnings.push(`CheckSum mismatch: stated ${validation.checksum.stated}, computed ${validation.checksum.computed}.`);
  if (validation.bodyLength && validation.bodyLength.present && !validation.bodyLength.ok)
    warnings.push(`BodyLength mismatch: stated ${validation.bodyLength.stated}, computed ${validation.bodyLength.computed}.`);

  return {
    delimiter,
    fieldCount: decoded.filter((f) => !f.malformed).length,
    beginString: beginStringField ? beginStringField.value : null,
    msgType: msgTypeField
      ? { code: msgTypeField.value, name: msgDef ? msgDef.name : null, cat: msgDef ? msgDef.cat : null }
      : null,
    fields: decoded,
    tree,
    checksum: validation.checksum,
    bodyLength: validation.bodyLength,
    warnings,
  };
}

// Resolve a version to a wire BeginString (for auto-selecting a dictionary from
// tag 8). Static helper the page uses; kept here so it's covered by the selftest.
export function pickVersion(beginString, versions) {
  if (!beginString) return null;
  const hit = versions.find((v) => v.version === beginString);
  return hit ? hit.slug : null;
}

export default { parseFix, detectDelimiter, splitPairs, pickVersion };
