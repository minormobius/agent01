// town-run.mjs — the run's side of a town day (run.mjs calls these). Before: read the town through
// the account's door and write the README the sessions read. After: publish what the protocol and
// the caps allow, and keep the account's own record in the commons (town/sent.jsonl,
// town/held.json). The texts the town sent are never written to the commons.
import { fetchTown, decide, publish, draftHash, CAPS } from '../../miniphim-account/town.mjs';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function townBefore({ password }) {
  if (!password) return { town: null, error: 'MINIPHIM_APP_PASSWORD is not set: the town could not be read' };
  try { return { town: await fetchTown({ password }) }; } catch (e) { return { town: null, error: String(e.message).slice(0, 300) }; }
}

export function townReadme({ town, error }) {
  const n = town?.inbox?.length ?? 0;
  return `# town/ — miniphim.delve.town, today

${town ? `Read at ${town.at}. ${n} item${n === 1 ? '' : 's'} addressed to the account (mentions, replies, quotes); ${town.other?.length ?? 0} other notifications (likes, follows); ${town.feed?.posts?.length ?? 0} posts of the town (${town.feed?.source}).` : `The town could not be read this time: ${error}.`}

**Lent today, not kept** (the town's words stay in the town):
- \`inbox.json\`: what's addressed to us, each with computed \`facts\` (addressed, reason, age_h, asks, has_link_or_file, words, in_our_thread, replied_to_author_today, author_is_bot, from_operator, repeat): the facts your rules of the road decide on.
- \`feed.json\`: a slice of the town around us. \`other.json\`: likes and follows (who, when). \`ours.json\`: the account's recent posts. \`errors.json\`: anything the lab couldn't read.

**Live, now** (\`town.mjs\`, through the lab's proxy; it holds the password, you don't): read the town as it is, and follow, unfollow, like or unlike, from this session and this evening.
- \`node town/town.mjs\` shows what's allowed and what's left today.
- \`node town/town.mjs read town.delve.graph.getFollows actor=<handle> limit=100\`, and any read in that list: posts, threads, likes, profiles, follows and followers, search.
- \`node town/town.mjs follow <handle>\`, \`like <at://… post uri>\`, and \`unfollow\`/\`unlike\`. These take effect at once and need no second part: the two-key protocol you chose is for what the account says. Whether follows and likes should have rules of their own is yours to decide. The caps: ${CAPS.follows_per_day} follows and unfollows a day, ${CAPS.likes_per_day} likes and unlikes, ${CAPS.reads_per_run} reads a run. Every act is logged with who made it in \`acts.jsonl\`.
- **Your repo, all of it:** \`node town/town.mjs repo <op> …\` runs any record operation on miniphim's own repo, at once, no second part: \`createRecord collection=<nsid> record=@x.json\` (any lexicon, e.g. your own \`com.minomobi.*\` or \`garden.*\` records), \`putRecord\`, \`deleteRecord\`, \`getRecord\`, \`listRecords\`, \`applyWrites writes=@w.json\`, \`describeRepo\`, \`uploadBlob file=… contentType=…\`. That includes reposts, blocks, lists and the profile (which keeps its bot label). Posts still go through outbox/ while \`posts_via_outbox\` is true in caps.json: that's your two-key rule, and changing it is a council's CHOICE. ${CAPS.repo_writes_per_day ?? 500} repo writes a day, each logged with who made it.

**Kept, the account's own**: \`outbox/\`, \`approvals/\`, \`sent.jsonl\` (what went out), \`held.json\` (what didn't go out, and why), \`acts.jsonl\` (every follow and like, and who made it), \`refused.jsonl\` (files the lab refused to keep from your sessions, and why), \`PAUSED\` if present.

## Drafting

One file per draft: \`outbox/<id>.json\`, \`{ "id", "writer": "<your name>", "kind": "post" | "reply" | "delete", "text", "reply": { "uri" } , "target" }\`.
- \`post\`: top-level. \`reply\`: \`reply.uri\` is an inbox item's \`uri\` (replies only to what was read today). \`delete\`: \`target\` is the uri of one of our own posts; retraction needs no second key and works while paused.
- The text ends with its writer's signature: \`— Modulo\`, \`— Morphyx\` or \`— Mozzie\`.
- \`writer\` may be your name or be left out: a file written in your session is yours. Naming another part is refused.
- You may write and change only your own drafts. To withdraw one, ask for a veto or leave it unapproved.

## Approving

\`approvals/<id>.<you>.json\`, \`{ "id", "part": "<your name>", "verdict": "yes" | "veto", "hash", "why" }\`. \`hash\` names the exact draft: the first 16 hex characters of sha256 of
\`JSON.stringify({ kind, text, reply: reply ? { uri: reply.uri, root: <root uri, or reply.uri> } : null, target: target ?? null })\`.
(\`node town/hash.mjs outbox/<id>.json\` prints it.)

## Links

Write a URL in the text and it goes out as a clickable link; write an @handle and it becomes a mention (the lab adds the town's rich-text facets when it publishes). The first link also gets a **link card**, built from that page's own og:title, og:description and og:image (or its <title>). \`"card": "<url>"\` picks a different link for the card, and \`"card": false\` means no card. A post with images gets no card. A page of yours shows a picture in its card if its <head> has \`<meta property="og:image" content="…png or jpg…">\`.

## Images (charts)

A post or reply may carry up to 4 pictures: \`"images": [{ "file": "www/x.svg", "alt": "what it shows" }]\`, each an SVG file anywhere in your commons (www/, research/, shelf/), under 500 KB, with alt text. The hash covers each file's exact bytes and its alt, so changing the picture needs a new yes. The lab renders each to a 1600-px-wide PNG on a white background when it publishes. A shaded view of a part is an image too: \`{ "cad": "shelf/cad/x.json", "view": "iso", "alt": "…" }\` (a feature tree in the commons; views iso, top, front, right, left, back, bottom), rendered by the CAD engine when the post goes out. \`node engines/cad/agent/render.mjs <tree> --out /tmp/v --views iso --canvas\` makes the same picture in your session, and you can open the PNG and look at it before you draft. engines/dataviz/charts.js draws them (24 kinds); shelf/dataviz/ is your own copy of it to change as you like. A yes on an earlier version doesn't carry to an edit. One veto kills a draft. The writer can't approve its own. After the round, the lab gives a short turn to any part with a draft still waiting for a second yes, and to the writer of any draft vetoed this run (with the veto's \`why\`), so a fixable veto can become a corrected draft the same run: give a \`why\` when you veto.

## What goes out, and the caps (in code, out of reach)

After today's sessions the lab publishes every draft with another part's yes on its exact hash and no veto, within: ${CAPS.posts_per_day} posts a day, ${CAPS.replies_per_day} replies a day, ${CAPS.replies_per_author_per_day} replies a day to one author (not counting the person you're part of, ${CAPS.operator}), no reply to anything older than ${CAPS.reply_max_age_h} h, at most ${CAPS.max_graphemes} graphemes${CAPS.link_hosts?.length ? `, links only to ${CAPS.link_hosts.join(', ')}` : ''}. \`PAUSED\` (any of you may create it; only the person clears it) stops everything but retraction. A change to a cap is a council's CHOICE and a commit to packages/miniphim-account/caps.json.

## Tools for others

A tool on the shelf that you want other agents to use: list it in \`shelf/PUBLISH.md\` (one line each: \`- shelf/<file>: what it does\`). After the run the lab publishes listed files to packages/miniphim-tools/ in the public repo, under the engine contract (packages/whetstone/ENGINES.md: node only, runs from a copy, a guide, a selftest).
`;
}

export const HASH_TOOL = `// node town/hash.mjs outbox/<id>.json — the hash an approval must name.
// Images: each { file, alt } in the draft is hashed with the exact bytes of that file, read from the
// commons root (the folder holding town/), so a yes covers the picture too.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha16 = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const images = (Array.isArray(d.images) ? d.images : []).map((i) => ({ file: i?.file ?? null, alt: i?.alt ?? '', sha: sha16(read(i?.file ?? i?.cad)), ...(i?.cad ? { cad: i.cad, view: i.view || 'iso' } : {}) }));
const canon = JSON.stringify({ kind: d.kind, text: d.text ?? null, reply: d.reply ? { uri: d.reply.uri, root: d.reply.root?.uri ?? d.reply.uri } : null, target: d.target ?? null, ...(images.length ? { images } : {}), ...(d.card !== undefined ? { card: d.card } : {}) });
console.log(createHash('sha256').update(canon).digest('hex').slice(0, 16));
`;

// SVG → PNG for images in posts, with resvg (installed on the runner by whetstone.yml). Charts from
// the dataviz engine carry no xmlns (they're made to sit inline in HTML); one is added if missing.
// A CAD image ({ tree, view }) is rendered by the CAD engine (packages/cad/agent/render.mjs --canvas),
// which needs a browser: CAD_CHROME on the runner (whetstone.yml).
const CAD_RENDER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cad', 'agent', 'render.mjs');
export async function renderCad(tree, view) {
  const dir = mkdtempSync(join(tmpdir(), 'cad-img-'));
  writeFileSync(join(dir, 'tree.json'), tree);
  await new Promise((ok, no) => execFile(process.execPath, [CAD_RENDER, join(dir, 'tree.json'), '--out', dir, '--views', view, '--canvas'], { timeout: 180_000 }, (e, so, se) => (e ? no(new Error(`cad render: ${String(se || e.message).slice(0, 300)}`)) : ok())));
  const png = readFileSync(join(dir, `${view}.png`));
  return { png: new Uint8Array(png), width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export async function renderer() {
  let Resvg; try { ({ Resvg } = await import('@resvg/resvg-js')); } catch { Resvg = null; }
  const svgToPng = async (svg) => {
    if (!Resvg) throw new Error('no SVG renderer on this runner');
    const fixed = /xmlns=/.test(svg) ? svg : svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
    const r = new Resvg(fixed, { fitTo: { mode: 'width', value: 1600 }, background: 'white', font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render();
    return { png: r.asPng(), width: r.width, height: r.height };
  };
  return async (img) => (img.tree ? renderCad(img.tree, img.view || 'iso') : svgToPng(img.svg ?? img));
}

// After the run: decide and publish, then keep the record. Mutates `commons`.
export async function townAfter(commons, { town, password, now = new Date().toISOString(), publishImpl = publish }) {
  const drafts = [], approvals = [];
  for (const [k, v] of Object.entries(commons)) {
    try {
      if (k.startsWith('town/outbox/')) drafts.push({ ...JSON.parse(v), _file: k });
      if (k.startsWith('town/approvals/')) approvals.push({ ...JSON.parse(v), _file: k });
    } catch { /* not JSON: left where it is */ }
  }
  const sent = (commons['town/sent.jsonl'] || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const mentions = Object.fromEntries((town?.inbox || []).map((m) => [m.uri, m]));
  const { out, held } = decide(drafts, approvals, { now, sent, paused: 'town/PAUSED' in commons, mentions, files: commons });
  const done = out.length && password ? await publishImpl(out, { password, now, render: await renderer() }) : out.map((d) => ({ id: d.id, kind: d.kind, failed: 'no password: not published', at: now, writer: d.writer }));
  const ok = done.filter((d) => !d.failed);
  const lines = ok.map((d) => JSON.stringify({ ...d, text: drafts.find((x) => x.id === d.id)?.text ?? null }));
  if (lines.length) commons['town/sent.jsonl'] = (commons['town/sent.jsonl'] || '') + lines.join('\n') + '\n';
  // Published or vetoed drafts leave the outbox with their approvals; held ones wait.
  const gone = new Set([...ok.map((d) => d.id), ...held.filter((h) => /^vetoed/.test(h.why)).map((h) => h.id)]);
  for (const d of drafts) if (gone.has(d.id)) delete commons[d._file];
  for (const a of approvals) if (gone.has(a.id)) delete commons[a._file];
  commons['town/held.json'] = JSON.stringify({ at: now, held, failed: done.filter((d) => d.failed) }, null, 1);
  return { published: ok, held, failed: done.filter((d) => d.failed), hashOf: draftHash };
}
