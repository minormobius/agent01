// report.js — an assembly report: one self-contained HTML page that says what
// the thing is, what it is made of, how it goes together, and links back to
// every live document it came from. No kernel, no browser, no network: the
// page, the CLI and the MCP server all build the same bytes.
//
//   import { assemblyReport } from './lib/report.js';
//   const { html } = assemblyReport({ doc, components, mates, drive, fits, partTrees, builds, angles });
//
// What is on it:
//   · the assembly drawn in three views, as assembled at time t
//   · an EXPLODED isometric view with a numbered balloon on every item
//   · a bill of materials — item, part, quantity, volume, size — where every
//     row links to that part's own sheet below and opens it in the viewer
//   · a drawing of each distinct part, with its holes called out
//   · assembly steps, in order
//
// The steps are DERIVED, not inferred: a component's placement says where it
// goes, a `@comp.face` reference says what it is located on, a mate says what
// joins it to what and with which numbers, a `fits` entry says the clearance
// the pair is designed to keep. Nothing is guessed; a step only says what the
// document already states. Order is the document's own declaration order,
// which is a build order because a reference must name a component declared
// before it.
import { drawing } from './drawing.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (x, n = 3) => (x === null || x === undefined || Number.isNaN(x) ? '–' : String(+Number(x).toFixed(n)));
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
/// base64url of UTF-8 text — the viewer's `#t=` payload, the same encoding the page and the MCP use.
export const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const treeLink = (site, tree) => `${site}/#t=${b64url(typeof tree === 'string' ? tree : JSON.stringify(tree))}`;

const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const centroidOf = (body) => {
  const { pos } = body.mesh; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) { const p = body.model ? xf(body.model, [pos[i], pos[i + 1], pos[i + 2]]) : [pos[i], pos[i + 1], pos[i + 2]]; for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; } }
  return { centre: [0, 1, 2].map((k) => (min[k] + max[k]) / 2), min, max };
};

/// Move every body away from the assembly's centre so the parts read apart.
/// Direction is the body's own offset from that centre; a part concentric
/// with it (a nut on its screw) has no offset to use, so it goes along its
/// own +z, which is the axis it was built about. Returns new bodies with
/// displaced models — the meshes are untouched.
export function explodeBodies(bodies, factor = 0.6) {
  const boxes = bodies.map(centroidOf);
  const all = boxes.reduce((a, b) => [[Math.min(a[0][0], b.min[0]), Math.min(a[0][1], b.min[1]), Math.min(a[0][2], b.min[2])], [Math.max(a[1][0], b.max[0]), Math.max(a[1][1], b.max[1]), Math.max(a[1][2], b.max[2])]], [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]);
  const C = [0, 1, 2].map((k) => (all[0][k] + all[1][k]) / 2);
  const diag = Math.hypot(all[1][0] - all[0][0], all[1][1] - all[0][1], all[1][2] - all[0][2]) || 1;
  // Direction: away from the centre, or along the body's own axis when it sits
  // on it (a nut on its screw has no radial offset to use). Quantised, so
  // bodies leaving roughly the same way are treated as one train.
  const dirs = bodies.map((b, i) => {
    const d = [0, 1, 2].map((k) => boxes[i].centre[k] - C[k]);
    const len = Math.hypot(...d);
    const m = b.model || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const raw = len > diag * 0.02 ? d.map((x) => x / len) : [m[8], m[9], m[10]];
    // snap to the nearest of 26 directions: a train of parts should leave
    // together, not fan out by a degree each
    const snapped = raw.map((x) => (Math.abs(x) < 0.45 ? 0 : Math.sign(x)));
    if (!snapped.some(Boolean)) { const k = raw.map(Math.abs).indexOf(Math.max(...raw.map(Math.abs))); snapped[k] = Math.sign(raw[k]) || 1; }
    const l = Math.hypot(...snapped) || 1;
    return snapped.map((x) => x / l);
  });
  // Bodies leaving the same way are a stack, and a stack must open UP: each
  // one goes far enough that its own extent along that direction clears the
  // one before it, with a gap. A fixed step per rank is what crowded a
  // 44-body assembly — a long rail and a washer got the same room.
  const extent = (i, d) => { // half-extent of body i along d, from its box
    const b = boxes[i]; const c = b.centre;
    return Math.abs((b.max[0] - c[0]) * d[0]) + Math.abs((b.max[1] - c[1]) * d[1]) + Math.abs((b.max[2] - c[2]) * d[2]);
  };
  const along = (i, d) => boxes[i].centre[0] * d[0] + boxes[i].centre[1] * d[1] + boxes[i].centre[2] * d[2];
  const stacks = new Map();
  dirs.forEach((d, i) => { const k = d.map((x) => x.toFixed(3)).join(','); (stacks.get(k) || stacks.set(k, []).get(k)).push(i); });
  const disp = new Array(bodies.length).fill(0);
  const gap = factor * diag * 0.16, base = factor * diag * 0.35;
  for (const idxs of stacks.values()) {
    const order = [...idxs].sort((a, b) => along(a, dirs[a]) - along(b, dirs[b]));
    let prevEnd = null;
    for (const i of order) {
      const d = dirs[i], half = extent(i, d), pos = along(i, d);
      let want = base;
      if (prevEnd !== null) want = Math.max(base, prevEnd + gap + half - pos); // clear the one before it
      disp[i] = want;
      prevEnd = pos + want + half;
    }
  }
  return bodies.map((b, i) => {
    const m = b.model || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const d = dirs[i].map((x) => x * disp[i]);
    const model = m.slice(); model[12] += d[0]; model[13] += d[1]; model[14] += d[2];
    return { ...b, model, displaced: d, centre: boxes[i].centre.map((x, k) => x + d[k]) };
  });
}

const RATIO = (a, b) => (b ? +(a / b).toFixed(4) : null);
/// Assembly steps from what the document states — see the header. One entry
/// per component in declaration order, each with the sentences that apply.
export function assemblySteps({ components, mates = [], drive = null, fits = [] }) {
  const live = components.filter((c) => !c.reference);
  const order = live.map((c) => c.id);
  const rank = new Map(order.map((id, i) => [id, i]));
  const fitFor = (a, b) => fits.find((f) => {
    const pat = (id) => (id.includes('*') ? new RegExp('^' + id.replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\[\*\]/g, '\\[\\d+\\]').replace(/\*/g, '.*') + '$') : null);
    const ra = pat(f.a), rb = pat(f.b);
    const hit = (x, y) => (ra ? ra.test(x) : f.a === x) && (rb ? rb.test(y) : f.b === y);
    return hit(a, b) || hit(b, a);
  });
  const mateWords = (m, self) => {
    const other = m.a === self ? m.b : m.a;
    const first = m.a === self;
    switch (m.kind) {
      case 'gear': { const [zs, zo] = first ? [m.za, m.zb] : [m.zb, m.za]; return `meshes with \`${other}\` — ${zs} teeth to ${zo}, so it turns ${fmt(RATIO(zo, zs), 3)}× per turn of \`${other}\`, the other way`; }
      case 'belt': { const [rs, ro] = first ? [m.ra ?? m.za, m.rb ?? m.zb] : [m.rb ?? m.zb, m.ra ?? m.za]; return `runs a belt to \`${other}\` — ${fmt(ro)} to ${fmt(rs)}, so it turns ${fmt(RATIO(ro, rs), 3)}× per turn of \`${other}\`, the same way`; }
      case 'fixed': return `is fixed to \`${other}\` — it turns and travels with it`;
      case 'screw': return first ? `drives \`${other}\` as a screw — ${fmt(m.lead)} mm of travel per turn` : `rides \`${other}\` as a nut — ${fmt(m.lead)} mm of travel per turn of \`${other}\``;
      case 'rack': { const r = m.r ?? ((m.m ?? 1) * (m.z ?? 1)) / 2; return first ? `drives \`${other}\` as a pinion on a rack — pitch radius ${fmt(r)} mm` : `is the rack \`${other}\` runs on — pitch radius ${fmt(r)} mm`; }
      case 'slider': return `slides with \`${other}\`${m.ratio && m.ratio !== 1 ? ` at ${fmt(m.ratio)}× its travel` : ''}`;
      default: return `is mated to \`${other}\` (${m.kind})`;
    }
  };
  // a repeat is one step, not four: consecutive instances of one part placed the same way
  const groups = [];
  live.forEach((c, i) => {
    const base = /^(.*)\[(\d+)\]$/.exec(c.id);
    const g = groups[groups.length - 1];
    const like = g && base && g.base === base[1] && g.members[0].partKey === c.partKey && g.members[0].placedBy?.on === c.placedBy?.on && !!g.members[0].placedBy === !!c.placedBy && rank.get(g.members[g.members.length - 1].id) === i - 1;
    if (like) g.members.push(c);
    else groups.push({ base: base ? base[1] : null, members: [c], first: i });
  });
  const steps = [];
  groups.forEach((g) => {
    const c = g.members[0], i = g.first, many = g.members.length > 1;
    const lines = [];
    if (i === 0) lines.push('is the base: everything else is placed against it');
    const faceList = many ? g.members.map((m) => m.placedBy?.face).filter(Boolean) : null;
    if (c.placedBy) lines.push(`${many ? 'each sits on' : 'sits on'} \`${c.placedBy.on}\`'s \`${many ? faceList.join('`, `') : c.placedBy.face}\`${c.placedBy.aligned ? ', turned onto that face\'s axis' : ''}${c.placedBy.offset ? `, offset ${JSON.stringify(c.placedBy.offset)}` : ''} — ${many ? 'they follow' : 'it follows'} \`${c.placedBy.on}\` through the motion, with no mate of ${many ? 'their' : 'its'} own`);
    else if (i > 0) { const p = c.place; lines.push(`is placed at [${fmt(p[12])}, ${fmt(p[13])}, ${fmt(p[14])}]${c.dynamic ? ' at rest — its placement is an expression, so it moves with t' : ''}`); }
    for (const m of mates) {
      const other = m.a === c.id ? m.b : m.b === c.id ? m.a : null;
      if (!other || !rank.has(other)) continue;
      if (rank.get(other) > i) continue; // described on the later component's step
      if (c.anchoredTo === other) { lines.push(`is already carried by \`${other}\` (placed on its face), so the ${m.kind} mate between them adds nothing`); continue; }
      lines.push(mateWords(m, c.id));
    }
    for (const o of order.slice(0, i)) { if (g.members.some((m) => m.id === o)) continue; const f = fitFor(c.id, o); if (f) lines.push(f.contact ? `${many ? 'each is' : 'is'} designed to touch \`${o}\`` : `${many ? 'each keeps' : 'keeps'} a designed clearance of ${fmt(f.min)}–${fmt(f.max)} mm to \`${o}\``); }
    if (drive?.component === c.id) lines.push(drive.kind === 'rpm' || drive.rpm ? `is the driven component — ${fmt(drive.rpm)} rpm` : 'is the driven component');
    if (drive?.kind === 'escapement') {
      const e = drive;
      if (c.id === e.wheel) lines.push(`is the escape wheel — ${e.teeth} teeth, one step of half a tooth per beat of ${fmt(e.beat)} s, which is what drives the train`);
      else if (c.id === e.pallet) lines.push(`is the pallet fork — it rocks ±${fmt(e.lift)}° as the wheel steps, locking and releasing it`);
      else if (c.id === e.balance) lines.push(`is the balance — it swings ±${fmt(e.swing)}° at the beat and sets the rate; nothing mates it, the escapement does`);
    }
    steps.push({ n: steps.length + 1, id: many ? `${g.base}[0…${g.members.length - 1}]` : c.id, ids: g.members.map((m) => m.id), qty: g.members.length, part: c.part, lines });
  });
  return steps;
}

/**
 * The report. Everything it needs is already in hand from `flatten` plus one
 * exact build per distinct part:
 *   doc          the assembly document (for the viewer link)
 *   components, mates, drive, fits, partTrees   from flatten()
 *   builds       Map partKey → { mesh, faces, invariants }
 *   angles       from solveAngles(...) at time t
 * Options: site, title, t, at (an AT URI, if it came from a repo), explode,
 * hidden (hidden lines), maxParts (part sheets), width.
 */
export function assemblyReport({ doc, components, mates = [], drive = null, fits = [], partTrees, builds, angles, modelOf, t = 0, site = 'https://cad.mino.mobi', title = 'assembly', at = null, explode = 0.6, hidden = true, maxParts = 20, width = 900, unbuilt = [] }) {
  const t0 = Date.now();
  const live = components.filter((c) => !c.reference && builds.get(c.partKey)?.mesh);
  if (!live.length) throw new Error('nothing to report: no component has an exact build');
  const bodies = live.map((c) => ({ id: c.id, comp: c, mesh: builds.get(c.partKey).mesh, faces: builds.get(c.partKey).faces, model: modelOf(c, angles) }));

  // bill of materials: one row per distinct part, in first-appearance order
  const bom = []; const itemOf = new Map();
  for (const c of live) {
    let row = itemOf.get(c.partKey);
    if (!row) { const inv = builds.get(c.partKey).invariants || {}; row = { item: bom.length + 1, partKey: c.partKey, part: c.part, ids: [], qty: 0, volume: inv.volume, bbox: inv.bbox, faces: (builds.get(c.partKey).faces || []).length, tree: partTrees.get(c.partKey) }; bom.push(row); itemOf.set(c.partKey, row); }
    row.ids.push(c.id); row.qty++;
  }

  // a part this kernel cannot build (a boolean only OCCT does) is named, not
  // hidden: it is missing from every drawing on the page and the page says so
  const missing = unbuilt.map((u, i) => ({ ...u, item: bom.length + i + 1, qty: components.filter((c) => c.partKey === u.partKey && !c.reference).length, ids: components.filter((c) => c.partKey === u.partKey && !c.reference).map((c) => c.id) }));
  const assembled = drawing(bodies, { views: ['front', 'top', 'right'], hidden, title, width, note: `assembled, t = ${fmt(t)} s` });
  const blown = explodeBodies(bodies, explode);
  const seenItem = new Set();
  const balloons = blown.filter((b) => { const k = b.comp.partKey; if (seenItem.has(k)) return false; seenItem.add(k); return true; }).map((b) => ({ point: b.centre, text: String(itemOf.get(b.comp.partKey).item) }));
  // the exploded figure gets a wider sheet: the balloons and their leaders are
  // a fixed size in pixels, so more room for the drawing makes the PARTS bigger
  // relative to them once the page scales the whole thing to fit
  const exploded = drawing(blown, { views: ['iso'], hidden: false, title: `${title} — exploded`, width: Math.round(width * 1.8), note: `exploded ${Math.round(explode * 100)} %`, callouts: false, balloons, internals: false, dimensions: false });
  const steps = assemblySteps({ components, mates, drive, fits });

  // one sheet per distinct part, the part alone at its own origin
  const sheets = [];
  for (const row of bom.slice(0, maxParts)) {
    const b = builds.get(row.partKey);
    const d = drawing([{ id: row.part, mesh: b.mesh, faces: b.faces }], { views: ['front', 'top', 'right'], hidden, title: row.part, width: Math.round(width * 0.8) });
    sheets.push({ row, d });
  }
  const truncated = bom.length - sheets.length;

  const totalVolume = bom.reduce((a, r) => a + (r.volume || 0) * r.qty, 0);
  const asmLink = at ? `${site}/?at=${encodeURIComponent(at)}` : treeLink(site, doc);
  const holeLine = (d) => { const g = new Map(); for (const h of d.holes) { const k = `${fmt(h.diameter)}|${fmt(h.depth)}`; g.set(k, (g.get(k) || 0) + 1); } return [...g].map(([k, n]) => { const [dia, dep] = k.split('|'); return `${n > 1 ? n + '× ' : ''}⌀${dia} ↧${dep}`; }).join(' · ') || 'none'; };

  const css = `:root{color-scheme:light}body{margin:0;background:#f4f4f2;color:#111;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}
main{max-width:1100px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;letter-spacing:.1em;text-transform:uppercase;margin:38px 0 10px;color:#444;border-bottom:1px solid #ccc;padding-bottom:6px}
h3{font-size:16px;margin:26px 0 6px}
a{color:#1a5cff}.sub{color:#555;margin:0 0 14px}
.sheet{background:#fff;border:1px solid #ddd;overflow-x:auto}.sheet svg{display:block;max-width:100%;height:auto}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff;border:1px solid #ddd}
th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #eee;vertical-align:top}th{background:#fafafa;font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
ol.steps{padding-left:22px}ol.steps li{margin:10px 0}ol.steps b{font-weight:600}ol.steps ul{margin:4px 0;padding-left:18px;color:#333}
code{background:#eeeeec;padding:0 3px;border-radius:3px}
.facts{color:#444;font-size:13px;margin:4px 0 8px}
.note{color:#666;font-size:12px;margin-top:6px}
footer{margin-top:50px;color:#666;font-size:12px;border-top:1px solid #ccc;padding-top:10px}
@media print{body{background:#fff}.sheet{border:0}h3{break-before:page}}`;

  const rows = bom.map((r) => `<tr><td class="n">${r.item}</td><td><a href="#item-${r.item}">${esc(r.part)}</a></td><td class="n">${r.qty}</td><td>${r.ids.map((i) => `<code>${esc(i)}</code>`).join(' ')}</td><td class="n">${fmt(r.volume, 3)}</td><td class="n">${r.bbox ? [0, 1, 2].map((k) => fmt(r.bbox[1][k] - r.bbox[0][k], 2)).join(' × ') : '–'}</td><td><a href="${esc(treeLink(site, r.tree))}">open</a></td></tr>`).join('\n')
    + missing.map((m) => `<tr><td class="n">${m.item}</td><td>${esc(m.part)}</td><td class="n">${m.qty}</td><td>${m.ids.map((i) => `<code>${esc(i)}</code>`).join(' ')}</td><td colspan="2">not built by the exact kernel here — ${esc(m.error || 'build failed')}</td><td>${m.tree ? `<a href="${esc(treeLink(site, m.tree))}">open</a>` : '–'}</td></tr>`).join('\n');
  const missingNote = missing.length ? `<p class="note"><b>${missing.length} part${missing.length === 1 ? ' is' : 's are'} missing from every drawing on this page</b> — ${missing.map((m) => `<code>${esc(m.part)}</code> (${esc(m.error || 'build failed')})`).join(', ')}. The viewer builds those with OCCT; this page is drawn from the exact kernel that runs headless.</p>` : '';

  const stepList = steps.map((s) => `<li><b>${esc(s.id)}</b> <span class="facts">(${esc(s.part)}${s.qty > 1 ? ` × ${s.qty}` : ''})</span><ul>${s.lines.map((l) => `<li>${esc(l).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`).join('')}</ul></li>`).join('\n');

  const partSheets = sheets.map(({ row, d }) => `<h3 id="item-${row.item}">${row.item}. ${esc(row.part)}${row.qty > 1 ? ` <span class="facts">× ${row.qty}</span>` : ''}</h3>
<p class="facts">volume ${fmt(row.volume, 3)} mm³ · ${d.overall.map((x) => fmt(x, 2)).join(' × ')} mm · ${row.faces} faces · holes: ${esc(holeLine(d))} · <a href="${esc(treeLink(site, row.tree))}">open this part in the viewer</a> · <a href="#bom">back to the parts list</a></p>
<div class="sheet">${d.svg}</div>`).join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — assembly report</title><style>${css}</style></head>
<body><main>
<h1>${esc(title)} — assembly report</h1>
<p class="sub">${live.length} component${live.length === 1 ? '' : 's'} drawn${missing.length ? ` (${missing.length} part${missing.length === 1 ? '' : 's'} this kernel cannot build, listed below)` : ''} · ${bom.length} distinct part${bom.length === 1 ? '' : 's'} · ${assembled.overall.map((x) => fmt(x, 2)).join(' × ')} mm · ${fmt(totalVolume, 2)} mm³ of material · posed at t = ${fmt(t)} s${drive ? ` · driven: <code>${esc(drive.component || drive.escapement?.wheel || '')}</code>${drive.rpm ? ` at ${fmt(drive.rpm)} rpm` : ''}` : ''}<br>
<a href="${esc(asmLink)}">open the assembly in the viewer</a>${at ? ` · <code>${esc(at)}</code>` : ''} · <a href="#exploded">exploded view</a> · <a href="#bom">parts list</a> · <a href="#steps">assembly steps</a></p>

<h2 id="views">Assembly, as built</h2>
<div class="sheet">${assembled.svg}</div>
<p class="note">Third angle. Hidden lines dashed${hidden ? '' : ' (off for this sheet)'}. Every distance is measured from the exact meshes, not typed in.</p>
${missingNote}

<h2 id="exploded">Exploded</h2>
<div class="sheet">${exploded.svg}</div>
<p class="note">Each part moved out from the assembly's centre by ${Math.round(explode * 100)} % of its size — along its own axis where it is concentric with the middle. Balloons are the item numbers below.</p>

<h2 id="bom">Parts list</h2>
<table><thead><tr><th class="n">item</th><th>part</th><th class="n">qty</th><th>components</th><th class="n">volume mm³</th><th class="n">size mm</th><th>link</th></tr></thead>
<tbody>${rows}</tbody></table>

<h2 id="steps">Assembly steps</h2>
<p class="note">Read off the document: where each component is placed, what it is located on, what mates it and with which numbers, and the clearances the design declares. Nothing here is inferred — order is the document's own, which is a build order because a reference must name a component declared before it.</p>
<ol class="steps">${stepList}</ol>

<h2 id="parts">Part drawings</h2>
${partSheets}
${truncated > 0 ? `<p class="note">${truncated} more part${truncated === 1 ? '' : 's'} not drawn here (the sheet limit is ${maxParts}).</p>` : ''}

<footer>Generated by <a href="${esc(site)}">cad.mino.mobi</a> from the feature trees themselves — <a href="${esc(site)}/SKILL.md">how to make one</a>. Drawings are deterministic: the same document gives the same bytes.</footer>
</main></body></html>`;

  return { html, bytes: html.length, bom, steps, sheets: sheets.length, truncated, missing, overall: assembled.overall, volume: totalVolume, components: live.length, ms: Date.now() - t0 };
}
