#!/usr/bin/env node
// build-fix-data.mjs — compile the QuickFIX machine-readable spec XMLs into the
// compact JSON dictionaries the fix parser serves (fix/data/<version>.json).
//
// Source of truth is fix/data/spec/FIX*.xml — pinned copies of the canonical
// QuickFIX data dictionaries (https://github.com/quickfix/quickfix/tree/master/spec).
// Re-download them with, e.g.
//   curl -fsSL https://raw.githubusercontent.com/quickfix/quickfix/master/spec/FIX44.xml \
//        -o fix/data/spec/FIX44.xml
// then re-run this script. Output is committed so the site is fully static and
// self-contained — no build step at deploy time (same contract as moji/uni).
//
// For each version we emit:
//   fields:   { "<tag>": { name, type, enums?: { <enum>: description } } }
//   messages: { "<msgtype>": { name, cat, layout: [...] } }   // components expanded
//   header:   [tag, …]   body-vs-header-vs-trailer classification for the parser
//   trailer:  [tag, …]
//   groups:   { "<numInGroupTag>": { name, delim: <firstMemberTag> } }
//
// plus fix/data/index.json listing the versions. Usage: node scripts/build-fix-data.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_DIR = join(ROOT, 'fix', 'data', 'spec');
const OUT_DIR = join(ROOT, 'fix', 'data');

// ── A tiny XML parser (the QuickFIX dictionaries are simple, regular, no
// namespaces or CDATA). Returns a tree of { tag, attrs, children }. ───────────
function parseXML(src) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tagRe = /<(\/)?([A-Za-z][\w.-]*)((?:\s+[\w.-]+\s*=\s*'[^']*')*)\s*(\/)?>/g;
  const attrRe = /([\w.-]+)\s*=\s*'([^']*)'/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const [, closing, name, attrStr, selfClose] = m;
    if (closing) { stack.pop(); continue; }
    const attrs = {};
    let a;
    while ((a = attrRe.exec(attrStr))) attrs[a[1]] = a[2];
    const node = { tag: name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

const kids = (node, tag) => node.children.filter((c) => c.tag === tag);
const kid = (node, tag) => node.children.find((c) => c.tag === tag);

function build(xmlPath) {
  const doc = parseXML(readFileSync(xmlPath, 'utf8'));
  const fix = kid(doc, 'fix');
  const major = fix.attrs.major, minor = fix.attrs.minor, sp = fix.attrs.servicepack || '0';
  const isFixt = (fix.attrs.type || 'FIX') === 'FIXT';
  // BeginString on the wire: FIXT.1.1 for the FIX5 transport, FIX.x.y otherwise.
  const beginString = `${isFixt ? 'FIXT' : 'FIX'}.${major}.${minor}`;
  const label = `${isFixt ? 'FIXT' : 'FIX'} ${major}.${minor}${sp !== '0' ? ' SP' + sp : ''}`;

  // fields ───────────────────────────────────────────────────────────────────
  const fieldsByNum = {};   // "<num>" -> { name, type, enums? }
  const numByName = {};     // name -> num (int)
  for (const f of kids(kid(fix, 'fields'), 'field')) {
    const num = f.attrs.number;
    const entry = { name: f.attrs.name, type: f.attrs.type };
    const values = kids(f, 'value');
    if (values.length) {
      entry.enums = {};
      for (const v of values) entry.enums[v.attrs.enum] = v.attrs.description;
    }
    fieldsByNum[num] = entry;
    numByName[f.attrs.name] = +num;
  }

  // components: name -> node (its children are the member list) ─────────────────
  const componentsEl = kid(fix, 'components');
  const components = {};
  if (componentsEl) for (const c of kids(componentsEl, 'component')) components[c.attrs.name] = c;

  // groups: NUMINGROUP tag -> { name, delim }. Collected from every <group> in
  // the header, components and messages. The delimiter is the first *field* that
  // appears inside the group (expanding any leading component to its first field).
  const groups = {};
  function firstFieldTag(node) {
    for (const ch of node.children) {
      if (ch.tag === 'field') return numByName[ch.attrs.name];
      if (ch.tag === 'group') return numByName[ch.attrs.name]; // the NoXxx count itself
      if (ch.tag === 'component' && components[ch.attrs.name]) {
        const t = firstFieldTag(components[ch.attrs.name]);
        if (t) return t;
      }
    }
    return null;
  }
  // Direct member tags of a group, one level deep: fields become their tag,
  // nested <group>s contribute only their NUMINGROUP count tag (recursion at
  // parse time descends into them), and components are expanded to their own
  // direct members. `seen` guards self-referential components (NestedParties).
  function directMemberTags(groupNode) {
    const tags = [];
    const walk = (node, seen) => {
      for (const ch of node.children) {
        if (ch.tag === 'field') { const t = numByName[ch.attrs.name]; if (t != null) tags.push(t); }
        else if (ch.tag === 'group') { const t = numByName[ch.attrs.name]; if (t != null) tags.push(t); }
        else if (ch.tag === 'component' && components[ch.attrs.name] && !seen.has(ch.attrs.name)) {
          const n = new Set(seen); n.add(ch.attrs.name); walk(components[ch.attrs.name], n);
        }
      }
    };
    walk(groupNode, new Set());
    return tags;
  }
  function harvestGroups(node) {
    for (const ch of node.children) {
      if (ch.tag === 'group') {
        const numTag = numByName[ch.attrs.name];
        if (numTag != null && !groups[numTag]) {
          groups[numTag] = { name: ch.attrs.name, delim: firstFieldTag(ch), members: directMemberTags(ch) };
        }
        harvestGroups(ch);
      }
      if (ch.children && ch.children.length && ch.tag !== 'component') harvestGroups(ch);
    }
  }
  for (const c of Object.values(components)) harvestGroups(c);
  const headerEl = kid(fix, 'header');
  const trailerEl = kid(fix, 'trailer');
  const messagesEl = kid(fix, 'messages');
  if (headerEl) harvestGroups(headerEl);
  // FIX 4.0–4.2 define repeating groups inline inside messages (no <components>
  // factoring), so harvest there too.
  if (messagesEl) harvestGroups(messagesEl);

  // A member list (fields / component refs / groups), WITHOUT expanding
  // components — component references stay as { comp } so each component is
  // stored once (in the `components` map below) and the client resolves them.
  // This keeps the layouts file small (the spec factors components precisely to
  // avoid this repetition — e.g. FIX 5.0 fully-expanded is ~15× larger).
  function members(node) {
    const out = [];
    for (const ch of node.children) {
      if (ch.tag === 'field') {
        const tag = numByName[ch.attrs.name];
        if (tag != null) out.push({ tag, req: ch.attrs.required === 'Y' });
      } else if (ch.tag === 'group') {
        const tag = numByName[ch.attrs.name];
        if (tag != null) out.push({ group: tag, req: ch.attrs.required === 'Y', members: members(ch) });
      } else if (ch.tag === 'component') {
        if (components[ch.attrs.name]) out.push({ comp: ch.attrs.name, req: ch.attrs.required === 'Y' });
      }
    }
    return out;
  }

  // Flat set of field tags reachable in header / trailer (for classification).
  function flatTags(node, seen, acc) {
    for (const ch of node.children) {
      if (ch.tag === 'field') { const t = numByName[ch.attrs.name]; if (t != null) acc.add(t); }
      else if (ch.tag === 'group') { const t = numByName[ch.attrs.name]; if (t != null) acc.add(t); flatTags(ch, seen, acc); }
      else if (ch.tag === 'component') {
        const comp = components[ch.attrs.name];
        if (comp && !seen.has(ch.attrs.name)) { const n = new Set(seen); n.add(ch.attrs.name); flatTags(comp, n, acc); }
      }
    }
    return acc;
  }
  const header = headerEl ? [...flatTags(headerEl, new Set(), new Set())] : [];
  const trailer = trailerEl ? [...flatTags(trailerEl, new Set(), new Set())] : [];

  // messages ───────────────────────────────────────────────────────────────────
  // The main dict carries only {name, cat} per message (what tag 35 decoding and
  // the message list need). The full per-message field layout is bulky and only
  // the /m/<type> reference page wants it, so it goes in a separate layouts file
  // loaded on demand (same split rationale as uni's per-block files).
  const messages = {};
  const msgLayouts = {};
  for (const msg of kids(messagesEl, 'message')) {
    messages[msg.attrs.msgtype] = { name: msg.attrs.name, cat: msg.attrs.msgcat };
    msgLayouts[msg.attrs.msgtype] = members(msg);
  }
  // Component definitions, stored once and resolved client-side.
  const compLayouts = {};
  for (const [name, node] of Object.entries(components)) compLayouts[name] = members(node);

  return {
    main: {
      version: beginString,
      label,
      major: +major, minor: +minor, sp: +sp,
      fixt: isFixt,
      fieldCount: Object.keys(fieldsByNum).length,
      msgCount: Object.keys(messages).length,
      fields: fieldsByNum,
      messages,
      header,
      trailer,
      groups,
    },
    layouts: { messages: msgLayouts, components: compLayouts },
  };
}

// FIX 5.0 splits the session/transport layer (header, trailer, session messages
// like Logon/Heartbeat, and their fields) into a separate FIXT.1.1 spec, so an
// app spec like FIX50SP2 has an EMPTY header/trailer on its own. Merge the FIXT
// transport into any such app spec so the dictionary parses a real FIX-5.0 wire
// message (which carries 8=FIXT.1.1) end to end — header, session + app messages.
function mergeTransport(app, transport) {
  const m = app.main, t = transport.main;
  const merged = {
    version: t.version,            // wire BeginString is FIXT.1.1 for FIX 5.0
    label: m.label,               // but present it as the app version (FIX 5.0 SP2)
    major: m.major, minor: m.minor, sp: m.sp,
    fixt: false,
    fields: { ...t.fields, ...m.fields },
    messages: { ...t.messages, ...m.messages },
    header: t.header,
    trailer: t.trailer,
    groups: { ...t.groups, ...m.groups },
  };
  merged.fieldCount = Object.keys(merged.fields).length;
  merged.msgCount = Object.keys(merged.messages).length;
  const layouts = {
    messages: { ...transport.layouts.messages, ...app.layouts.messages },
    components: { ...transport.layouts.components, ...app.layouts.components },
  };
  return { main: merged, layouts };
}

// ── Drive over every FIX*.xml in the spec dir ────────────────────────────────
const files = readdirSync(SPEC_DIR).filter((f) => /^FIX.*\.xml$/i.test(f)).sort();
const built = files.map((file) => ({ file, slug: file.replace(/\.xml$/i, '').toLowerCase(), ...build(join(SPEC_DIR, file)) }));
const transport = built.find((b) => b.main.fixt); // FIXT11 — folded in, not emitted standalone

const index = [];
for (const b of built) {
  if (b.main.fixt) continue; // transport-only spec: merged into app specs, never emitted alone
  let { main, layouts, slug } = b;
  if (transport && (!main.header || main.header.length === 0)) ({ main, layouts } = mergeTransport(b, transport));
  writeFileSync(join(OUT_DIR, slug + '.json'), JSON.stringify(main));
  writeFileSync(join(OUT_DIR, slug + '.layouts.json'), JSON.stringify(layouts));
  index.push({
    slug,
    version: main.version,
    label: main.label,
    fixt: main.fixt,
    fieldCount: main.fieldCount,
    msgCount: main.msgCount,
    sort: main.major * 1000 + main.minor * 100 + main.sp,
  });
  console.log(`✓ ${b.file} → ${slug}.json  (${main.fieldCount} fields, ${main.msgCount} messages, ${Object.keys(main.groups).length} groups)`);
}
index.sort((a, b) => a.sort - b.sort);
// Default the parser to the most widely-deployed dictionary (FIX 4.4) if present.
const preferred = index.find((v) => v.slug === 'fix44') || index[index.length - 1];
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ versions: index, default: preferred.slug }, null, 2));
console.log(`✓ index.json  (${index.length} versions, default ${preferred.slug})`);
