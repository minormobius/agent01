/**
 * Rule feeds — a feed generator that runs in the reader's own tab.
 *
 * A third-party feed generator is a server that watches the firehose, keeps an
 * index, and hands out `at://` URIs. For a feed defined by a SOCIAL GRAPH that
 * is unavoidable: nobody's browser can hold the follow graph of the network.
 * But for a feed defined by CONTENT — "posts about preprints" — the server is
 * doing something a browser can do for itself, because the input is just the
 * posts and Jetstream gives those to anyone.
 *
 * That is the whole idea here. `collections=['app.bsky.feed.post']` with NO
 * `dids` filter is the unfiltered post firehose, unauthenticated and unmetered;
 * the rule runs locally on each event. Nothing is uploaded, nothing is indexed
 * anywhere else, and the feed cannot go down while the network is up — which is
 * the failure that produced this module.
 *
 * The cost, and it is real: without a `dids` filter the socket carries EVERY
 * post on the network, and the matched fraction is small. So a rule feed
 * reports what it is spending — posts scanned, matched, KB/s — rather than
 * quietly eating someone's mobile data. `RuleRunner` also pauses on
 * `visibilitychange`, because a firehose in a backgrounded tab is nobody's
 * intent.
 *
 * Two sources, deliberately:
 *   ARCHIVE — scan what this browser already holds. Instant, free, offline,
 *             and it reaches back as far as the local store goes.
 *   LIVE    — the firehose, matched as it arrives.
 */

const LS_KEY = 'bsky:rulefeeds';

// ─── the rule model ──────────────────────────────────────────────

/**
 * @typedef {object} Rule
 * @property {string}   id
 * @property {string}   label
 * @property {string[]} [any]     strong terms; a "quoted string" is an exact phrase
 * @property {string[]} [weak]    soft terms — only count if the post also has a link
 * @property {string[]} [all]     terms that must ALL appear
 * @property {string[]} [none]    terms that veto a post
 * @property {string[]} [noneDomains] link hosts that veto a post
 * @property {string[]} [domains] link hosts, matched on facets and embeds too
 * @property {string[]} [tags]    hashtags, without the #
 * @property {boolean}  [doi]     match a DOI (10.xxxx/…) anywhere
 * @property {string[]} [langs]   restrict to these post languages
 * @property {number}   [minChars]
 */

/**
 * Reconstructed from the dead generator's own record — its rkey
 * (`chase-the-preprint`) and its description, which is the only part of a
 * feed generator that survives the service going away:
 *
 *   "Discovery engine for niche knowledge across the full spectrum — academic
 *    papers, deep technical dives, research rabbit holes, and fascinating
 *    domain expertise…"
 *
 * That is prose, not an algorithm — an `app.bsky.feed.generator` record holds
 * displayName, description, the service DID and an avatar, and nothing else.
 * So this is a reading of the intent, not a recovery of the original ranking.
 * It is meant to be edited.
 */
export const PRESETS = [
  {
    id: 'preprint',
    label: '🔬 knowledge chase',
    note: 'Broad academic net, narrowed by what it excludes. Edit it.',

    // BROAD on purpose. The feed is a knowledge chase across the whole
    // spectrum — sciences, humanities, social science, maths — so the additive
    // half casts wide and the SUBTRACTIVE half below does the real work.
    // STRONG — these fire on their own, because in the measured sample the
    // only terms that were right on their own were venue names.
    any: [
      'preprint', 'pre-print', 'arxiv', 'biorxiv', 'medrxiv', 'chemrxiv',
      'psyarxiv', 'socarxiv', 'engrxiv', 'ssrn', 'zenodo', 'osf.io',
      'peer review', 'peer-reviewed', 'preregist*', 'replication study',
      'meta-analysis', 'literature review', 'systematic review',
      'monograph', 'dissertation', 'festschrift',
      // NOT 'habilitation': ordinary French, and it matched a Disney-park post
      // in a real archive replay.
      'historiograph*', 'philolog*', 'palaeograph*', 'epigraph*',
      '"scientific paper"', '"working paper"', '"research paper"',
      '"open access"',
      // NOT '"et al"' or 'conjecture' as strong terms — a live run matched
      // "#JDVance et al think this will pay them handsome political dividends"
      // and a post musing that people only "know" things about cats by
      // conjecture. Both are ordinary English; they moved to weak.
    ],

    /**
     * WEAK — only count when the post also carries a link. These are the words
     * people use when sharing scholarship AND when talking about anything at
     * all, so on their own they are noise; paired with a link they are good.
     * See the note in compile(): 0-for-6 without this gate.
     */
    weak: [
      '"new paper"', '"our paper"', '"our new paper"', '"just published"',
      '"now out in"', '"out now in"', '"paper is out"', '"accepted at"',
      '"accepted in"', '"published in"', '"appears in"', '"in press"',
      '"our study"', '"this study"', '"we find that"',
      '"we show that"', '"first author"', '"co-author"', '"lead author"',
      'methodolog*', 'reproducib*', 'replicat*', 'dataset', 'ablation',
      'archaeolog*', 'ethnograph*', 'palaeo*', 'paleo*', 'fieldwork',
      'theorem', 'bibliograph*', 'corpus', 'manuscript', 'thesis',
      '"et al"', 'conjecture',
    ],
    domains: [
      // preprint servers and indexes
      'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'chemrxiv.org',
      'psyarxiv.com', 'osf.io', 'ssrn.com', 'zenodo.org', 'doi.org',
      'semanticscholar.org', 'openalex.org', 'europepmc.org', 'hal.science',
      'philpapers.org', 'researchsquare.com', 'authorea.com',
      // publishers and journals, across disciplines
      'nature.com', 'science.org', 'pnas.org', 'cell.com', 'plos.org',
      'elifesciences.org', 'springer.com', 'link.springer.com', 'wiley.com',
      'onlinelibrary.wiley.com', 'tandfonline.com', 'sciencedirect.com',
      'academic.oup.com', 'cambridge.org', 'jstor.org', 'degruyter.com',
      'sagepub.com', 'journals.uchicago.edu', 'mitpressjournals.org',
      'frontiersin.org', 'mdpi.com', 'iopscience.iop.org', 'aps.org',
      'ams.org', 'siam.org', 'acm.org', 'dl.acm.org', 'ieee.org',
      'annualreviews.org', 'royalsocietypublishing.org', 'aeaweb.org',
      'nber.org', 'brookings.edu',
      // repositories and archives
      // NOT archive.org: it hosts everything, and caught a 1983 music magazine.
      'hathitrust.org', 'gutenberg.org', 'perseus.tufts.edu',
      'openlibrary.org', 'dspace.mit.edu', 'escholarship.org',
    ],
    tags: [
      'preprint', 'openaccess', 'openscience', 'academicsky', 'sciencesky',
      'histsky', 'philsky', 'mathsky', 'econsky', 'archaeology', 'linguistics',
      'phdlife', 'academicchatter',
    ],
    doi: true,

    /**
     * The subtractive half, and the point of the whole rule.
     *
     * Two topics dominate academic posting on this network to the point of
     * crowding out everything else, so they come out — not because they are
     * unimportant, but because a discovery feed that is 80% one subject has
     * stopped discovering. Vetoes beat every match, and they now also fire on
     * a post's LINKS, so an outlet gives a post away even when its wording
     * does not.
     *
     * Known collateral, listed rather than hidden: `israel` also removes
     * Israeli institutions; `vaccin*` removes legitimate immunology;
     * `epidemiolog*` removes methods work that happens to be epidemiological;
     * `climate` is NOT excluded, on the judgement that it reads as science
     * here more often than as politics. Trim to taste — this is one line in
     * the editor.
     */
    none: [
      // politics
      'trump', 'biden', 'harris', 'obama', 'vance', 'musk', 'maga',
      'republican*', 'democrat*', 'gop', 'senat*', 'congress*', 'election*',
      'ballot', 'voter*', 'filibuster', 'scotus', '"supreme court"',
      'impeach*', 'tariff*', 'fascis*', 'authoritarian*', 'autocra*',
      'jdvance', 'oligarch*', 'nazi*', 'genocide', 'apartheid', 'zionis*', 'palestin*',
      'israel*', 'gaza', 'hamas', 'hezbollah', 'idf', 'ukrain*', 'putin',
      'kremlin', 'immigration', 'deportation', '"executive order"',
      'parliament*', 'brexit', '"far right"', '"far-right"', '"culture war"',
      'partisan', 'lawmaker*', 'legislat*', 'campaign trail', 'primaries',
      // global health
      'covid*', 'sars-cov-2', 'coronavirus', 'pandemic*', 'epidemic*',
      '"public health"', 'vaccin*', 'antivax', '"anti-vax"', 'measles',
      'polio', 'mpox', 'monkeypox', '"bird flu"', 'h5n1', 'influenza',
      '"long covid"', 'masking', '"herd immunity"', 'rfk', 'cdc',
      '"world health organization"', 'outbreak*', 'quarantine', 'lockdown*',
      'epidemiolog*', 'antimicrobial resistance', 'biosecurity',
    ],
    /** An outlet gives a post away when the wording does not. */
    noneDomains: [
      'politico.com', 'thehill.com', 'axios.com', 'nytimes.com',
      'washingtonpost.com', 'cnn.com', 'foxnews.com', 'msnbc.com',
      'theguardian.com', 'bbc.co.uk', 'bbc.com', 'reuters.com', 'apnews.com',
      'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'newsweek.com',
      'thedailybeast.com', 'huffpost.com', 'breitbart.com', 'dailywire.com',
      'motherjones.com', 'jacobin.com', 'nationalreview.com', 'vox.com',
      'cdc.gov', 'who.int', 'nih.gov', 'fda.gov',
    ],
    minChars: 24,
  },
];

// ─── compiling a rule into a matcher ─────────────────────────────

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Terms are matched on WORD BOUNDARIES, which matters more than it sounds:
 * a plain substring test for "osf" matches "crossfade", and a feed that fires
 * on "arxiv" inside a URL but not "arXiv" in prose is worse than no feed.
 * A "quoted string" is an exact phrase, still bounded at its edges.
 */
function termRegex(term) {
  const t = String(term).trim();
  const phrase = /^".*"$/.test(t);
  let body = phrase ? t.slice(1, -1) : t;
  if (!body) return null;

  // A trailing `*` is a PREFIX match, and it is not a convenience — without it
  // a term list is quietly wrong. `vaccine` carries a word boundary, so it does
  // NOT match `vaccines`; `epidemiolog` does not match `epidemiology`. An
  // exclusion list written the obvious way therefore leaks most of what it was
  // meant to remove. `vaccin*` and `epidemiolog*` say what was meant.
  const prefix = !phrase && body.endsWith('*');
  if (prefix) body = body.slice(0, -1);
  if (!body) return null;

  // \b only works next to a word character; a term like "10." or "#tag" would
  // otherwise never match. Apply the boundary only where it can mean something.
  const lead = /^\w/.test(body) ? '\\b' : '';
  const tail = prefix ? '' : (/\w$/.test(body) ? '\\b' : '');
  return new RegExp(lead + esc(body).replace(/\s+/g, '\\s+') + tail, 'i');
}

const DOI = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

/** Every link a post carries: rich-text facets, external embeds, and raw text. */
export function linksOf(record) {
  const out = [];
  for (const f of record?.facets || []) {
    for (const feat of f.features || []) {
      if (feat.uri) out.push(feat.uri);
    }
  }
  const e = record?.embed;
  if (e?.external?.uri) out.push(e.external.uri);
  if (e?.media?.external?.uri) out.push(e.media.external.uri);
  // Facets are generated by the posting client; a post written by a script may
  // have none, so the raw text is scanned too rather than trusted to have them.
  for (const m of String(record?.text || '').matchAll(/https?:\/\/[^\s<>"')]+/gi)) out.push(m[0]);
  return out;
}

/** Hashtags, from both the `tags` field and `#tag` facets. */
export function tagsOf(record) {
  const out = [...(record?.tags || [])];
  for (const f of record?.facets || []) {
    for (const feat of f.features || []) {
      if (feat.tag) out.push(feat.tag);
    }
  }
  return out.map((t) => String(t).replace(/^#/, '').toLowerCase());
}

/** Host of a URL, lowercased, `www.` stripped. Returns '' for anything unparseable. */
function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/**
 * Compile a rule once, then test many posts against it.
 * @param {Rule} rule
 * @returns {{test: (record: object) => boolean, why: (record: object) => string[]}}
 */
export function compile(rule) {
  const any = (rule.any || []).map(termRegex).filter(Boolean);
  const all = (rule.all || []).map(termRegex).filter(Boolean);
  const weak = (rule.weak || []).map(termRegex).filter(Boolean);
  const none = (rule.none || []).map(termRegex).filter(Boolean);
  const noneDomains = (rule.noneDomains || []).map((d) => String(d).toLowerCase().replace(/^www\./, ''));
  const domains = (rule.domains || []).map((d) => String(d).toLowerCase().replace(/^www\./, ''));
  const tags = (rule.tags || []).map((t) => String(t).replace(/^#/, '').toLowerCase());
  const langs = rule.langs?.length ? rule.langs.map((l) => l.toLowerCase()) : null;
  const minChars = rule.minChars || 0;

  /**
   * Hashtags defeat a word-boundary veto, and this is not theoretical: a live
   * run matched "#JDVance et al think this will pay them handsome political
   * dividends" as scholarship. The veto list has `vance`, but `\bvance\b`
   * cannot see inside `#JDVance` — there is no boundary between `JD` and
   * `Vance`. Substring matching would be the obvious fix and is much worse:
   * `vance` inside `advance`/`advanced` would gut an academic feed.
   *
   * So hashtags are split on their own camelCase and digit boundaries and
   * appended for the veto pass only. `#JDVance` -> `JD Vance`,
   * `#Election2026` -> `Election 2026`.
   */
  const splitTags = (record) => (String(record?.text || '').match(/#[\w]+/g) || [])
    .map((t) => t.slice(1)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)/g, '$1 $2'))
    .join(' ');

  function why(record) {
    const text = String(record?.text || '');
    const hits = [];

    // Vetoes first — cheapest way to reject, and a veto beats every match.
    const vetoText = `${text} ${splitTags(record)}`;
    for (const re of none) if (re.test(vetoText)) return [];

    // A veto also has to see LINKS. On a subtractive feed the giveaway is
    // usually the outlet, not the wording: a post whose text is "important new
    // findings" linking to a politics site is exactly what the exclusion is
    // for, and no term list catches it.
    if (noneDomains.length) {
      for (const url of linksOf(record)) {
        const h = hostOf(url);
        if (h && noneDomains.some((d) => h === d || h.endsWith(`.${d}`))) return [];
      }
    }

    if (langs) {
      const has = (record?.langs || []).some((l) => langs.includes(String(l).toLowerCase().split('-')[0]));
      // No langs field at all is not evidence of the wrong language, so it passes.
      if ((record?.langs || []).length && !has) return [];
    }
    if (text.length < minChars && !(record?.embed)) return [];

    // `all` is a gate, not a hit: every one must appear or the post is out.
    for (const re of all) if (!re.test(text)) return [];
    if (all.length) hits.push('all terms');

    const naked = (re) => `term ${re.source.replace(/\\b|\\s\+/g, ' ').trim()}`;
    for (const re of any) if (re.test(text)) { hits.push(naked(re)); break; }


    if (domains.length) {
      for (const url of linksOf(record)) {
        const h = hostOf(url);
        if (!h) continue;
        // Suffix match so `arxiv.org` also catches `export.arxiv.org`, but
        // bounded on a dot so it never catches `notarxiv.org`.
        const hit = domains.find((d) => h === d || h.endsWith(`.${d}`));
        if (hit) { hits.push(`link ${hit}`); break; }
      }
    }

    if (tags.length) {
      const got = tagsOf(record).find((t) => tags.includes(t));
      if (got) hits.push(`#${got}`);
    }

    // Before the weak pass: a DOI is a scholarly signal and must be able to
    // corroborate one.
    if (rule.doi && (DOI.test(text) || linksOf(record).some((u) => DOI.test(u)))) hits.push('doi');

    /**
     * Weak terms need SCHOLARLY corroboration — a link to one of the rule's own
     * domains, or a DOI. Not merely any link. This is the single biggest
     * precision lever in the rule and it took two live measurements to get
     * right.
     *
     * Run 1 (no gate): bare phrases were right 0 times out of 6 — "#Caturday is
     * for … reading the paper", "a faux-archaeological dig", an adult account's
     * "I just published…".
     *
     * Run 2 (gated on ANY link): 3 of 6. The survivors were all the same
     * mistake — a news story ABOUT research rather than research. "T-Mobile
     * Park has the cheapest hot dogs in the MLB, a new study says" carried a
     * link; so did "the new PyPi download count methodology update".
     *
     * Journalism and shop-talk link to journalism and shop-talk. Scholarship
     * links to a publisher, a preprint server or a DOI. So the corroboration
     * has to be that, and the cost is a real paper announced with only a lab
     * website — a trade worth making for a discovery feed, where one bad post
     * is expensive and one missed post is not.
     */
    const scholarly = hits.some((h) => h.startsWith('link ') || h === 'doi');
    if (weak.length && scholarly) {
      for (const re of weak) if (re.test(text)) { hits.push(`${naked(re)} +scholarly link`); break; }
    }

    return hits;
  }

  return { why, test: (record) => why(record).length > 0 };
}

// ─── stored rules ────────────────────────────────────────────────

/** @returns {Rule[]} the reader's rules, seeded from PRESETS on first run. */
export function rules() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const got = JSON.parse(raw);
      if (Array.isArray(got) && got.length) return got;
    }
  } catch { /* private mode: fall through to the presets */ }
  return PRESETS.map((p) => ({ ...p }));
}

export function getRule(id) { return rules().find((r) => r.id === id) || null; }

export function saveRule(rule) {
  const all = rules();
  const i = all.findIndex((r) => r.id === rule.id);
  if (i >= 0) all[i] = rule; else all.push(rule);
  try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch { /* not fatal */ }
  return all;
}

export function resetRules() {
  try { localStorage.removeItem(LS_KEY); } catch { /* fine */ }
  return rules();
}

/**
 * The editable form of a rule: one directive per line, so someone can tune a
 * feed without a JSON editor and without this module growing a parser for a
 * language nobody asked for.
 *
 *   preprint              a term
 *   "new paper"           a phrase
 *   @arxiv.org            a link domain
 *   #openscience          a hashtag
 *   -crypto               a veto
 *   doi                   the DOI pattern (bare keyword)
 */
export function toText(rule) {
  const lines = [];
  for (const t of rule.any || []) lines.push(t);
  for (const t of rule.weak || []) lines.push(`?${t}`);
  for (const d of rule.domains || []) lines.push(`@${d}`);
  for (const t of rule.tags || []) lines.push(`#${t}`);
  for (const n of rule.none || []) lines.push(`-${n}`);
  for (const d of rule.noneDomains || []) lines.push(`-@${d}`);
  if (rule.doi) lines.push('doi');
  return lines.join('\n');
}

export function fromText(text, base = {}) {
  const out = { ...base, any: [], weak: [], domains: [], tags: [], none: [], noneDomains: [], doi: false };
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line === 'doi') { out.doi = true; continue; }
    if (line.startsWith('?')) { out.weak.push(line.slice(1)); continue; }
    if (line.startsWith('@')) { out.domains.push(line.slice(1).toLowerCase()); continue; }
    if (line.startsWith('#')) { out.tags.push(line.slice(1).toLowerCase()); continue; }
    if (line.startsWith('-@')) { out.noneDomains.push(line.slice(2).toLowerCase()); continue; }
    if (line.startsWith('-')) { out.none.push(line.slice(1)); continue; }
    out.any.push(line);
  }
  return out;
}

// ─── running one against the firehose ────────────────────────────

/**
 * Wraps a JetstreamClient with the matcher and a meter.
 *
 * The meter is not decoration. This socket carries every post on the network,
 * and this sandbox cannot measure that rate (its proxy refuses the WebSocket
 * upgrade), so the honest thing is to measure it on the reader's device and
 * show them. `stats()` is what the status line renders.
 */
export class RuleRunner {
  /**
   * @param {object} opts
   * @param {Rule} opts.rule
   * @param {(post: object, hits: string[]) => void} opts.onMatch
   * @param {(stats: object) => void} [opts.onStats]
   * @param {(msg: string, live: boolean) => void} [opts.onStatus]
   * @param {Function} opts.Client   JetstreamClient (injected so this module
   *                                 stays testable in node without a socket)
   * @param {object} opts.KIND
   */
  constructor({ rule, onMatch, onStats, onStatus, Client, KIND }) {
    this.rule = rule;
    this.matcher = compile(rule);
    this.onMatch = onMatch;
    this.onStats = onStats || (() => {});
    this.onStatus = onStatus || (() => {});
    this.Client = Client;
    this.KIND = KIND;
    this.client = null;
    this.scanned = 0;
    this.matched = 0;
    this.bytes = 0;
    this.startedAt = 0;
    this._timer = null;
    this._onVis = null;
  }

  stats() {
    const secs = Math.max(1, (Date.now() - this.startedAt) / 1000);
    return {
      scanned: this.scanned,
      matched: this.matched,
      perSec: this.scanned / secs,
      kbPerSec: this.bytes / secs / 1024,
      mb: this.bytes / 1048576,
    };
  }

  start() {
    this.startedAt = Date.now();
    this._connect();
    // A firehose in a backgrounded tab is nobody's intent — and on a phone it
    // is somebody's data plan.
    this._onVis = () => { if (document.hidden) this._disconnect(); else this._connect(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._timer = setInterval(() => this.onStats(this.stats()), 1000);
  }

  _connect() {
    if (this.client) return;
    this.client = new this.Client({
      collections: ['app.bsky.feed.post'],
      kinds: [this.KIND.commit ?? this.KIND.COMMIT],
      onEvent: (payload) => this._event(payload),
      onConnect: () => this.onStatus(`${this.rule.label} · reading the firehose`, true),
      onDisconnect: () => this.onStatus('reconnecting…', false),
    });
    this.client.connect();
  }

  _disconnect() {
    this.client?.close();
    this.client = null;
  }

  _event(payload) {
    if (payload.collection !== 'app.bsky.feed.post') return;
    if (payload.operation && payload.operation !== 'create') return;
    const rec = payload.record;
    if (!rec) return;
    this.scanned++;
    this.bytes += 220 + (rec.text || '').length * 2;   // rough, and labelled as such
    const hits = this.matcher.why(rec);
    if (!hits.length) return;
    this.matched++;
    this.onMatch(payload, hits);
  }

  close() {
    this._disconnect();
    if (this._timer) clearInterval(this._timer);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    this._timer = this._onVis = null;
  }
}

/**
 * Run a rule over posts this browser already holds. Free, instant, offline, and
 * it reaches back as far as the local store — which for a reader who has had
 * the app a while is further than Jetstream will ever replay.
 */
export function scanArchive(posts, rule) {
  const m = compile(rule);
  const out = [];
  for (const p of posts) {
    const hits = m.why(p.record);
    if (hits.length) out.push({ ...p, hits });
  }
  return out;
}
