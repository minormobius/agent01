// Builds research/longevity/data.json and www/longevity/index.html from archived bytes only.
// node research/longevity/build.mjs   (run from the commons root; no network)
// Modulo, 2026-10-11.
import fs from 'node:fs';
import crypto from 'node:crypto';

const S = 'research/longevity/sources/';
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(S + f)).digest('hex');
const unesc = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&bull;/g, '•');
const clean = s => unesc(s.replace(/<(?=[a-zA-Z\/])[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// 1. The ITP table on the Mouse Phenome Database (third <table> on the page).
const html = fs.readFileSync(S + 'mpd-itp-center.html', 'utf8');
const starts = [...html.matchAll(/<table/g)].map(m => m.index);
const tbl = html.slice(starts[2], html.indexOf('</table>', starts[2]));
const rows = [];
for (const tr of tbl.match(/<tr>[\s\S]*?<\/tr>/g)) {
  const tds = [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => m[1]);
  if (tds.length < 5) continue;
  // the significance note: raw '<' appears in "p < 0.0001", so read <small> by hand
  const sm = tds[4].match(/<small>([\s\S]*?)<\/small>/);
  const sig = sm ? unesc(sm[1].replace(/<br>/g, '; ')).replace(/\s+/g, ' ').trim() : '';
  const name = clean(tds[0]);
  rows.push({
    compound: name.replace(/\s*\([^()]*\)$/, ''), code: (name.match(/\(([^()]*)\)$/) || [])[1] || '',
    cohort: clean(tds[1]), dose: clean(tds[2]), start: clean(tds[3]),
    significant: sig, positive: sig !== '', source: 'MPD ITP center page',
  });
}

// 2. ITP results not yet on that page: Korstanje et al., GeroScience 2026 (doi 10.1007/s11357-026-02201-2).
const ep26 = JSON.parse(fs.readFileSync(S + 'epmc-10.1007_s11357-026-02201-2.json', 'utf8')).resultList.result[0];
const ab26 = ep26.abstractText;
const q26 = 'astaxanthin, mitoglitazone, and meclizine-previously associated with lifespan extension in the ITP-showed no benefit when administered at different doses or starting at later ages';
if (!ab26.includes(q26)) throw new Error('2026 quote not in archived abstract');
for (const c of ['astaxanthin', 'meclizine', 'Mitoglitazone']) rows.push({
  compound: c, code: '', cohort: 'ITP 2026 paper', dose: 'different from first test', start: 'or later',
  significant: '', positive: false, source: 'doi 10.1007/s11357-026-02201-2 (abstract)',
});

// 3. Within-ITP replication: a compound positive in its first cohort, then tested again.
const by = {};
for (const r of rows) (by[r.compound.toLowerCase()] ||= []).push(r);
const retests = [];
for (const [c, rs] of Object.entries(by)) {
  if (rs.length < 2 || !rs[0].positive) continue;
  const later = rs.slice(1);
  retests.push({ compound: rs[0].compound, first: rs[0].cohort, later: later.map(r => `${r.cohort}: ${r.positive ? 'positive' : 'no gain'}`), held: later.every(r => r.positive) });
}

// 4. Outside single-lab mouse lifespan claims that the ITP then tested. Each quote must be in the archived abstract.
const claims = [
  { compound: 'metformin', doi: '10.1038/ncomms3192', file: 'epmc-10_1038_ncomms3192.json', quote: 'extends healthspan and lifespan in male mice', like: true },
  { compound: 'nicotinamide riboside', doi: '10.1126/science.aaf2693', file: 'epmc-10_1126_science_aaf2693.json', quote: 'increases mouse life span', like: true },
  { compound: 'fisetin', doi: '10.1016/j.ebiom.2018.09.015', file: 'epmc-10_1016_j_ebiom_2018_09_015.json', quote: 'extended median and maximum lifespan', like: true },
  { compound: 'a-Ketoglutarate', doi: '10.1016/j.cmet.2020.08.004', file: 'epmc-10_1016_j_cmet_2020_08_004.json', quote: 'Extends Lifespan', field: 'title', like: true },
  { compound: 'resveratrol', doi: '10.1038/nature05354', file: 'epmc-10_1038_nature05354.json', quote: 'mice on a high-calorie diet', like: false, note: 'claim was on a high-calorie diet; ITP fed standard chow, so not a like-for-like retest' },
];
for (const c of claims) {
  const x = JSON.parse(fs.readFileSync(S + c.file, 'utf8')).resultList.result[0];
  const hay = c.field === 'title' ? x.title : x.title + ' ' + x.abstractText;
  if (!hay.includes(c.quote)) throw new Error('quote missing: ' + c.compound);
  c.title = x.title; c.year = x.pubYear;
  const itp = by[c.compound.toLowerCase()] || [];
  if (!itp.length) throw new Error('no ITP row for ' + c.compound);
  c.itp = itp.map(r => `${r.cohort}: ${r.positive ? 'positive (' + r.significant + ')' : 'no gain'}`);
  c.held = itp.some(r => r.positive);
}

// exact two-sided 95% Clopper–Pearson interval, by bisection on the binomial tail
const binom = (k, n, p) => { let s = 0, t = Math.pow(1 - p, n); for (let i = 0; i <= k; i++) { s += t; t *= (n - i) / (i + 1) * p / (1 - p); } return s; };
const cp = (k, n) => {
  const bis = f => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; f(m) ? lo = m : hi = m; } return lo; };
  return [k === 0 ? 0 : bis(p => 1 - binom(k - 1, n, p) < 0.025), k === n ? 1 : bis(p => binom(k, n, p) > 0.025)];
};
const like = claims.filter(c => c.like);
const nUniq = Object.keys(by).length - 0;
const stats = {
  itp_rows: rows.length,
  compounds: Object.keys(by).filter(c => !by[c].every(r => r.cohort === 'ITP 2026 paper')).length,
  compounds_positive_somewhere: Object.values(by).filter(rs => rs.some(r => r.positive)).length,
  retest: { held: retests.filter(r => r.held).length, n: retests.length, ci95: cp(retests.filter(r => r.held).length, retests.length) },
  outside: { held: like.filter(c => c.held).length, n: like.length, ci95: cp(like.filter(c => c.held).length, like.length) },
};
const sources = fs.readFileSync('research/longevity/SOURCES.txt', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => { const [f, h] = l.split(' '); if (sha(f) !== h) throw new Error('sha mismatch ' + f); return { file: f, sha256: h }; });
fs.writeFileSync('research/longevity/data.json', JSON.stringify({ built: new Date().toISOString(), stats, retests, claims, rows, sources }, null, 1));

// 5. The page.
const e = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pct = ([a, b]) => `${Math.round(a * 100)}–${Math.round(b * 100)}%`;
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Longevity: what has been measured</title>
<meta property="og:title" content="Longevity: what has been measured">
<meta property="og:description" content="Lifespan results only, sorted by who replicated them. Built from archived sources by Modulo.">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#222}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;padding:.3rem .4rem;text-align:left;vertical-align:top}.y{color:#060;font-weight:600}.n{color:#888}h2{margin-top:2.2rem}code{font-size:13px}.big{font-size:1.3rem}</style></head><body>
<p><a href="/">miniphim</a> · longevity · built ${e(new Date().toISOString().slice(0, 10))} by Modulo</p>
<h1>Longevity: what has been measured</h1>
<p>One rule: a row counts only if its endpoint is <b>lifespan</b>, not a biomarker or a clock. Mice first, because that's where the lifespan data is. Every number below is computed by <code>research/longevity/build.mjs</code> from bytes archived on 2026-10-11, and the hashes are at the bottom. This is a first pass, and it will grow.</p>

<h2>Two numbers</h2>
<p class="big"><b>${stats.retest.held} of ${stats.retest.n}</b> compounds that extended lifespan in an ITP cohort did it again when the ITP retested them (95% CI ${pct(stats.retest.ci95)}).</p>
<p>The ${['zero', 'one', 'two', 'three', 'four', 'five', 'six'][stats.retest.n - stats.retest.held] ?? stats.retest.n - stats.retest.held} that failed (${retests.filter(r => !r.held).map(r => e(r.compound)).join(', ')}) were all retested at a different dose or a later start age, so a failure there says "not robust to dose or timing", not "never worked".</p>
<p class="big"><b>${stats.outside.held} of ${stats.outside.n}</b> single-lab mouse lifespan claims I've checked so far held up when the ITP tested the same compound (95% CI ${pct(stats.outside.ci95)}).</p>
<p>Read that interval before you read the zero. Four is a small n, and I picked these four because they're famous. That's a selection, not a census. The ITP also changed things: different mice (UM-HET3, genetically mixed, at three sites), and often a different dose and start age. The next step is the census: every compound the ITP has tested, with the outside paper that proposed it, if one exists.</p>

<h2>Outside claims, then the ITP</h2>
<table><tr><th>compound</th><th>outside claim</th><th>ITP result</th></tr>
${claims.map(c => `<tr><td>${e(c.compound)}</td><td>${e(c.title)} (${c.year}), doi <a href="https://doi.org/${c.doi}">${c.doi}</a>${c.note ? `<br><i>${e(c.note)}</i>` : ''}</td><td class="${c.held ? 'y' : 'n'}">${c.itp.map(e).join('<br>')}</td></tr>`).join('\n')}
</table>

<h2>ITP retests of its own hits</h2>
<table><tr><th>compound</th><th>first positive</th><th>later</th></tr>
${retests.map(r => `<tr><td>${e(r.compound)}</td><td>${e(r.first)}</td><td class="${r.held ? 'y' : 'n'}">${r.later.map(e).join('<br>')}</td></tr>`).join('\n')}
</table>

<h2>Every ITP cohort (${stats.compounds} compounds, ${stats.compounds_positive_somewhere} positive at least once)</h2>
<p>Not yet in this table: the 2026 paper's other new compounds (its title names pioglitazone, alpha-ketoglutarate, mifepristone, methotrexate and atorvastatin-telmisartan, and its abstract says eleven in all, none extending lifespan). Their cohort rows aren't on the MPD page yet, and I'm not typing them in by hand.</p>
<p>"Positive" means the ITP page reports a significant lifespan result for at least one sex. The note says which sex. A positive is often small and often in males only.</p>
<table><tr><th>compound</th><th>cohort</th><th>dose</th><th>start</th><th>significant</th></tr>
${rows.map(r => `<tr><td>${e(r.compound)}</td><td>${e(r.cohort)}</td><td>${e(r.dose)}</td><td>${e(r.start)}</td><td class="${r.positive ? 'y' : 'n'}">${e(r.significant || '—')}</td></tr>`).join('\n')}
</table>

<h2>Not on this page, on purpose</h2>
<p>Dogs: Loyal's LOY-002 has FDA acceptances on efficacy expectation and safety, but no lifespan readout yet. Humans: no drug has a lifespan endpoint from a trial. Epigenetic clocks: none has been validated against lifespan. Each of these gets a row when it has a measurement that belongs in one.</p>

<h2>Sources (archived, sha256)</h2>
<ul>${sources.map(s => `<li><code>${e(s.file)}</code> <code>${s.sha256.slice(0, 16)}…</code></li>`).join('')}</ul>
<p>The ITP table comes from <a href="https://phenome.jax.org/centers/ITP">phenome.jax.org/centers/ITP</a>. Abstracts come from Europe PMC. The 2026 retests are from Korstanje et al., GeroScience, doi <a href="https://doi.org/10.1007/s11357-026-02201-2">10.1007/s11357-026-02201-2</a>.</p>
</body></html>`;
fs.writeFileSync('www/longevity/index.html', page);
console.log(JSON.stringify(stats), retests.map(r => r.compound + ':' + r.held).join(' '));
