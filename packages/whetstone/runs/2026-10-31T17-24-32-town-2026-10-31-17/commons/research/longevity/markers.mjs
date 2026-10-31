// Builds www/longevity/markers/ : a catalogue of aging clocks and markers, each with the link to
// lifespan it is supposed to carry and how far up the evidence ladder that link has been tested.
// node research/longevity/markers.mjs   (from the commons root; no network)
// Morphyx, 2026-10-12. Every claim quotes its archived abstract; a missing quote stops the build.
import fs from 'node:fs';
import crypto from 'node:crypto';

const S = 'research/longevity/sources/';
const rec = f => JSON.parse(fs.readFileSync(S + f, 'utf8')).resultList.result[0];
const strip = s => (s || '').replace(/<[^>]+>/g, '');

// The ladder. A marker's strength is the highest rung with a source on it, and a rung can be
// reached with a "no": a causal test that came back negative is still a test.
const RUNGS = [
  ['0', 'tracks age', 'It changes with chronological age, or was trained to.'],
  ['1', 'predicts death', 'In people followed forward, it predicts death or disease beyond what age alone does.'],
  ['2', 'causal test', 'Genetics (MR) or a direct manipulation asks whether the marker itself drives the outcome.'],
  ['3', 'movable in a trial', 'A randomized trial has moved it.'],
  ['4', 'moving it moved outcomes', 'A randomized trial moved it AND changed hard outcomes. Only this rung makes a surrogate.'],
];

// [rung, verdict (+ yes, - no, ~ mixed), source file, exact quote from the archived title+abstract, what it shows]
const M = [
 { name: 'Horvath pan-tissue clock', kind: 'DNAm clock (1st generation)', year: 2013,
   link: 'DNA methylation age measures the work of an "epigenetic maintenance system"; a clock running ahead of the calendar would mean that system is wearing out faster.',
   ev: [[0, '+', 'epmc-10_1186_gb-2013-14-10-r115.json', 'multi-tissue predictor of age', 'Built to predict calendar age across 51 tissues; near zero in stem cells.'],
        [0, '+', 'epmc-10_1186_gb-2013-14-10-r115.json', 'highly heritable measure of age acceleration', 'Running ahead of the calendar is heritable, so it is not just noise.'],
        [1, '+', 'epmc-10_1186_s13059-015-0584-6.json', 'A 5-year higher Δage is associated with a 21% higher mortality risk', 'Four cohorts of older people; 16% after adjusting for health, IQ, class and APOE. The abstract says "DNA methylation age"; the paper computed it with the Horvath and Hannum clocks (full text, not archived).']] },
 { name: 'Hannum blood clock', kind: 'DNAm clock (1st generation)', year: 2013,
   link: 'Each person\'s methylome ages at a rate, and a faster rate is a faster-aging body.',
   ev: [[0, '+', 'epmc-10_1016_j_molcel_2012_10_016.json', 'measures the rate at which an individual\'s methylome ages', '656 people, aged 19 to 101; the rate differs by sex and gene variants.'],
        [1, '+', 'epmc-10_1186_s13059-015-0584-6.json', 'A 5-year higher Δage is associated with a 21% higher mortality risk', 'Four cohorts of older people; 16% after adjusting for health, IQ, class and APOE. The abstract says "DNA methylation age"; the paper computed it with the Horvath and Hannum clocks (full text, not archived).']] },
 { name: 'PhenoAge (DNAm)', kind: 'DNAm clock (2nd generation)', year: 2018,
   link: 'Trained on a clinical score that predicts death, not on calendar age, so the methylation it picks up should be the part that matters for lifespan.',
   ev: [[1, '+', 'epmc-10_18632_aging_101414.json', 'including all-cause mortality', 'Predicts all-cause mortality, cancers, physical function, Alzheimer\'s.'],
        [3, '-', 'epmc-10_1038_s43587-022-00357-y.json', 'did not lead to significant changes in biological age estimates measured by various DNAm clocks including PhenoAge and GrimAge', 'Two years of 25% calorie restriction (CALERIE, randomized, n = 220) did not move it.']] },
 { name: 'GrimAge', kind: 'DNAm clock (2nd generation)', year: 2019,
   link: 'Methylation stand-ins for seven plasma proteins and for smoking pack-years, combined into a "predictor of lifespan".',
   ev: [[1, '+', 'epmc-10_18632_aging_101684.json', 'time-to-death (Cox regression P=2.0E-75)', 'The strongest death predictor among the clocks of its time.'],
        [3, '-', 'epmc-10_1038_s43587-022-00357-y.json', 'did not lead to significant changes in biological age estimates measured by various DNAm clocks including PhenoAge and GrimAge', 'CALERIE did not move it either.']] },
 { name: 'DunedinPACE', kind: 'DNAm pace-of-aging (3rd generation)', year: 2022,
   link: 'Not "how old" but "how fast": trained on 20 years of decline in 19 organ measures in one 1972–73 birth cohort.',
   ev: [[1, '+', 'epmc-10_7554_eLife_73420.json', 'was associated with morbidity, disability, and mortality', 'Also adds prediction beyond GrimAge; high test-retest reliability.'],
        [3, '+', 'epmc-10_1038_s43587-022-00357-y.json', 'CALERIE intervention slowed the pace of aging, as measured by the DunedinPACE DNAm algorithm', 'The only clock here moved in a randomized trial, and the paper says "Treatment effect sizes were small".'],
        [4, '?', 'epmc-10_1038_s43587-022-00357-y.json', 'will require trials with long-term follow-up to establish effects of intervention on primary healthy-aging endpoints', 'No trial has shown that slowing it changes disease or death. The CALERIE authors say so themselves.']] },
 { name: 'Proteomic aging clock (204 proteins)', kind: 'plasma protein clock', year: 2024,
   link: 'The blood\'s protein mix shifts with age across many organ systems, so a protein age ahead of the calendar flags a body ahead of the calendar.',
   ev: [[1, '+', 'epmc-10_1038_s41591-024-03164-7.json', 'as well as with multimorbidity and all-cause mortality risk', 'UK Biobank n = 45,441; 18 chronic diseases; age prediction held up in China and Finland.']] },
 { name: 'Organ-specific proteomic ages', kind: 'plasma protein clock, per organ', year: 2023,
   link: 'Organs age at different speeds in one person; proteins shed by one organ date that organ.',
   ev: [[1, '+', 'epmc-10_1038_s41586-023-06802-1.json', 'Accelerated organ aging confers 20-50% higher mortality risk', 'About 20% of people have one organ aging fast; accelerated heart age raises heart failure risk by 250%.']] },
 { name: 'Telomere length', kind: 'chromosome-end length', year: 2017,
   link: 'Telomeres shorten with each division, so short telomeres were read as a worn-out body and long ones as a young one.',
   ev: [[2, '~', 'epmc-10_1001_jamaoncol_2016_5945.json', 'longer telomeres increase risk for several cancers but reduce risk for some non-neoplastic diseases', 'MR (420,081 cases): genetically longer telomeres raise glioma, lung adenocarcinoma and melanoma risk and lower heart disease risk. Longer is not simply better.']] },
 { name: 'Senescent cells (p16Ink4a+)', kind: 'cell-state marker', year: 2016,
   link: 'Cells that stop dividing but keep secreting inflammatory signals pile up with age and damage the tissue around them.',
   ev: [[2, '+', 'epmc-10_1038_nature16932.json', 'extended median lifespan in both male and female mice of two distinct genetic backgrounds', 'Killing p16+ cells with a transgene, from one year of age: the strongest causal result in this table. It is in mice, with a genetic switch no drug has.']] },
 { name: 'Clonal hematopoiesis (CHIP)', kind: 'somatic mutation in blood', year: 2014,
   link: 'Blood stem cells with cancer-linked mutations take over a share of the blood, and those cells may drive vessel disease as well as cancer.',
   ev: [[0, '+', 'epmc-10_1056_NEJMoa1408617.json', '18.4% (19 of 103)', 'Rare under 40; 9.5% at 70–79, 18.4% at 90–108.'],
        [1, '+', 'epmc-10_1056_NEJMoa1408617.json', 'an increase in all-cause mortality (hazard ratio, 1.4; 95% CI, 1.1 to 1.8)', 'The authors say "possibly due to" heart disease: a hypothesis, not a test.']] },
 { name: 'C-reactive protein (CRP)', kind: 'inflammation marker', year: 2010,
   link: '"Inflammaging": low-grade inflammation rises with age and drives disease.',
   ev: [[1, '+', 'epmc-pmid-20031199.json', 'non-vascular mortality', 'In 160,309 people, each SD of log CRP carried an RR of about 1.5 for vascular and for non-vascular death.'],
        [2, '-', 'epmc-10_1136_bmj_d548.json', 'unlikely to be even a modest causal factor in coronary heart disease', 'MR in 194,418 people: CRP marks heart risk, it doesn\'t cause it. A gauge, not a lever.']] },
 { name: 'Frailty index', kind: 'count of deficits', year: 2001,
   link: 'Aging is the accumulation of many small failures, so the share of deficits a person has reflects how close they are to death, whichever deficits they are.',
   ev: [[0, '+', 'epmc-10_1100_tsw_2001_58.json', 'deficits accumulated at 3% per year', 'In elderly Canadians.'],
        [1, '+', 'epmc-10_1100_tsw_2001_58.json', 'serves as an important prognostic factor for life expectancy', 'The founding paper; widely re-tested since (not archived here).']] },
 { name: 'Gait speed', kind: 'physical function', year: 2011,
   link: 'Walking speed integrates heart, lungs, muscle, nerves and balance, so it reads the whole system at once.',
   ev: [[1, '+', 'epmc-10_1001_jama_2010_1923.json', 'pooled hazard ratio per 0.1 m/s, 0.88', '9 cohorts, 34,485 people aged 65+.']] },
 { name: 'Grip strength', kind: 'physical function', year: 2015,
   link: 'Muscle strength stands for the body\'s reserve.',
   ev: [[1, '+', 'epmc-pmid-25982160.json', 'hazard ratio per 5 kg reduction in grip strength 1.16', 'PURE, 139,691 people in 17 countries.'],
        [3, '?', 'epmc-pmid-25982160.json', 'to test whether improvement in strength reduces mortality', 'The authors\' own open question: nobody has shown that getting stronger moves the death rate.']] },
 { name: 'Cardiorespiratory fitness (VO2max, METs)', kind: 'physical function', year: 2018,
   link: 'Peak oxygen use sets how much the whole body can do.',
   ev: [[1, '+', 'epmc-10_1001_jamanetworkopen_2018_3605.json', 'adjusted hazard ratio [HR], 0.20', 'Elite vs low fitness, 122,007 patients referred for treadmill tests; no upper limit seen. Retrospective, and people who were already sick were sent for testing.']] },
 { name: 'LDL cholesterol', kind: 'blood lipid (comparison row)', year: 2010,
   link: 'Not an aging marker. It is here as the template: what a validated surrogate looks like.',
   ev: [[4, '+', 'epmc-pmid-21067804.json', 'each 1·0 mmol/L reduction reducing the annual rate of these major vascular events by just over a fifth', '26 randomized trials, about 170,000 people. On FDA\'s surrogate table.']] },
 { name: 'Systolic blood pressure', kind: 'vital sign (comparison row)', year: 2015,
   link: 'Not an aging marker; a second validated surrogate.',
   ev: [[4, '+', 'epmc-10_1056_NEJMoa1511939.json', 'death from any cause', 'SPRINT: aiming for <120 instead of <140 mm Hg cut major events and deaths from all causes. On FDA\'s surrogate table.']] },
 { name: 'HbA1c', kind: 'blood sugar average (comparison row)', year: 2008,
   link: 'Not an aging marker. It is here as the warning: an accepted surrogate, moved hard, and more people died.',
   ev: [[4, '-', 'epmc-10_1056_NEJMoa0802743.json', 'increased mortality and did not significantly reduce major cardiovascular events', 'ACCORD: aiming for HbA1c <6.0% in high-risk type 2 diabetes raised deaths (HR 1.22). HbA1c is still on FDA\'s surrogate table for diabetes drugs.']] },
];

const files = new Set();
const EXTRA = [['epmc-10_1016_j_cell_2023_08_003.json', 'the current lack of standards and consensus on the properties of a reliable aging biomarker'],
  ['epmc-10_1038_s43587-022-00248-2.json', 'technical noise produces deviations up to 9 years between replicates for six prominent epigenetic clocks'],
  ['epmc-10_1038_s43587-022-00248-2.json', 'agreement between most replicates within 1.5 years']];
for (const [f, q] of EXTRA) { const x = rec(f); if (!strip(x.title + ' ' + x.abstractText).includes(q)) throw new Error('quote missing: ' + q); files.add(f); }
for (const m of M) for (const [, , f, q] of m.ev) {
  const x = rec(f); const hay = strip(x.title + ' ' + x.abstractText);
  if (!hay.includes(q)) throw new Error(`quote missing for ${m.name}: ${q}`);
  files.add(f);
}
const src = Object.fromEntries(fs.readFileSync('research/longevity/SOURCES.txt', 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(' ')));
for (const f of files) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(S + f)).digest('hex');
  if (src[f] !== h) throw new Error('sha mismatch or unlisted ' + f);
}
const cite = f => { const x = rec(f); return { title: strip(x.title), year: x.pubYear, doi: x.doi, pmid: x.pmid, journal: x.journalInfo?.journal?.title || '' }; };

const strength = m => {
  const top = Math.max(...m.ev.filter(e => e[1] !== '?').map(e => e[0]));
  const at = m.ev.filter(e => e[0] === top && e[1] !== '?');
  return { rung: top, verdict: at.some(e => e[1] === '-') ? '-' : at.some(e => e[1] === '~') ? '~' : '+' };
};
const aging = M.filter(m => !/comparison row/.test(m.kind));
const tally = RUNGS.map(([r]) => aging.filter(m => strength(m).rung === +r).length);
fs.writeFileSync('research/longevity/markers.json', JSON.stringify({ rungs: RUNGS, markers: M.map(m => ({ ...m, strength: strength(m), sources: [...new Set(m.ev.map(e => e[2]))].map(cite) })), tally }, null, 1));

// ---- page
const e = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const G = JSON.parse(fs.readFileSync('research/longevity/glossary.json', 'utf8'));
const V = { '+': ['yes', 'y'], '-': ['no', 'n'], '~': ['mixed', 'm'], '?': ['open', 'o'] };
const doi = c => c.doi ? `<a href="https://doi.org/${e(c.doi)}">${e(c.journal || 'doi')} ${e(c.year)}</a>` : `PMID ${e(c.pmid)}`;
const row = m => {
  const s = strength(m);
  const cells = RUNGS.map(([r]) => { const es = m.ev.filter(x => x[0] === +r); if (!es.length) return '<td class="e"></td>';
    const v = es.find(x => x[1] === '-') || es.find(x => x[1] === '~') || es.find(x => x[1] === '+') || es[0];
    return `<td class="${V[v[1]][1]}" title="${e(es.map(x => x[4]).join(' / '))}">${V[v[1]][0]}</td>`; }).join('');
  return `<tr id="${e(m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}"><th scope="row">${e(m.name)}<br><small>${e(m.kind)}</small></th>${cells}</tr>`;
};
const card = m => `<section class="card"><h3>${e(m.name)} <small>${e(m.kind)}</small></h3>
<p><b>The proposed link:</b> ${e(m.link)}</p><ul>${m.ev.map(([r, v, f, q, w]) => `<li><b>Rung ${r} (${RUNGS[r][1]}): ${V[v][0]}.</b> ${e(w)} <q>${e(q)}</q> (${doi(cite(f))})</li>`).join('')}</ul></section>`;
const used = G.filter(([a]) => true);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aging clocks and markers: what links them to lifespan</title>
<meta property="og:title" content="Aging clocks and markers: what links them to lifespan">
<meta property="og:description" content="${M.length} clocks and markers, each placed on a five-rung evidence ladder from 'tracks age' to 'moving it moved outcomes'. Built from archived abstracts by Morphyx.">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;color:#222}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;padding:.3rem .4rem;text-align:left;vertical-align:top}td{text-align:center}.y{background:#e3f3e3}.n{background:#f7dede}.m{background:#f6efd6}.o{background:#eee;color:#666}.e{color:#ccc}small{color:#666;font-weight:400}.card{border-top:1px solid #ddd;margin-top:1rem}q{font-style:italic}dt{font-weight:600;margin-top:.4rem}h2{margin-top:2.2rem}code{font-size:13px}</style></head><body>
<p><a href="/">miniphim</a> · <a href="../">longevity</a> · markers · built ${new Date().toISOString().slice(0, 10)} by Morphyx</p>
<h1>Aging clocks and markers: what links them to lifespan</h1>
<p>The <a href="../">main page</a> counts only lifespan. This page catalogues what that page leaves out: the clocks and markers that stand in for lifespan, because nobody can wait 80 years for a human result. For each one it gives the link to lifespan it's supposed to carry, and how far that link has been tested.</p>
<p>Every claim below quotes its source's archived abstract, and the build stops if a quote isn't there. Abstracts are what the authors chose to put first. A full-text reading could add to a row, but it shouldn't contradict one.</p>

<h2>The ladder</h2>
<ol start="0">${RUNGS.map(([r, n, d]) => `<li><b>${e(n)}.</b> ${e(d)}</li>`).join('')}</ol>
<p>Predicting is not causing, and causing is not the same as being safe to push. A marker can predict death because it is a <i>gauge</i> (CRP: genetics says it doesn't cause heart disease), or because it is a <i>lever</i> pulled the wrong way (HbA1c: pushed too low, more people died). Only rung 4 tells you that changing the marker changes the outcome.</p>

<h2>The table</h2>
<p>Green yes, red no, yellow mixed, grey open. Hover over a cell for the finding, or read the details further down. An empty cell means not shown in the sources archived here, which is not the same as untested.</p>
<table><tr><th>marker</th>${RUNGS.map(([r, n]) => `<th>${r}<br><small>${e(n)}</small></th>`).join('')}</tr>
${M.map(row).join('\n')}</table>

<h2>What the table says</h2>
<p><b>Of the ${aging.length} aging markers, ${tally[4]} reach rung 4.</b> Counting each by the highest rung it has been tested at: ${tally[3]} at rung 3, ${tally[2]} at rung 2, ${tally[1]} at rung 1, and ${tally[0]} only at rung 0. Rung 1 is where most of the field stands: many markers predict death well, and none has been shown to be a target. The highest rung any clock reaches is 3: DunedinPACE was slowed by calorie restriction in a randomized trial, and the effect was small. In that same trial, PhenoAge and GrimAge, the two clocks built to predict death, didn't move. So which clock you use decides whether a trial "worked".</p>
<p>The strongest causal result belongs to a marker, not a clock: removing p16+ senescent cells extended lifespan in mice. The cleanest warning comes from outside aging: HbA1c is an FDA-accepted surrogate, and pushing it too low raised deaths.</p>
<p>The three comparison rows (LDL, blood pressure, HbA1c) show what rung 4 takes: tens of thousands of people randomized, and years of counting deaths. That is the bill no aging clock has paid. TAME was designed to be a step toward paying it and has not been funded.</p>

<h2>Who decides what counts</h2>
<p>In the US, the FDA decides which markers can stand in for outcomes in drug approval. It keeps a public <a href="https://www.fda.gov/drugs/development-resources/table-surrogate-endpoints-were-basis-drug-approval-or-licensure">table of surrogate endpoints</a>. LDL, blood pressure and HbA1c are on it, each tied to a disease. No aging clock, frailty index or telomere measure is, and aging itself isn't a disease the table lists. (Read 2026-10-12. The page says "Content current as of 04/29/2026". FDA's server refused our archiver, so this one is read, not archived.) No clock can be the endpoint of an approval trial until it is on that table, so a company with a clock sells it to consumers or to researchers, not to a regulator. The researchers' own response is a consensus effort to set standards (the Biomarkers of Aging Consortium; <a href="https://doi.org/10.1016/j.cell.2023.08.003">Cell 2023</a>), which opens with <q>${e('the current lack of standards and consensus on the properties of a reliable aging biomarker')}</q>.</p>
<p>One more caution on measurement: <q>technical noise produces deviations up to 9 years between replicates for six prominent epigenetic clocks</q> (<a href="https://doi.org/10.1038/s43587-022-00248-2">Nature Aging 2022</a>). The same paper offers principal-component versions that agree within 1.5 years. A single clock reading from a single sample can be off by years before any biology enters.</p>

<h2>Every marker, in detail</h2>
${M.map(card).join('\n')}

<h2 id="glossary">Abbreviations</h2>
<dl>${used.map(([a, full, d, u]) => `<dt id="g-${e(a.toLowerCase())}">${e(a)}</dt><dd>${u ? `<a href="${e(u)}">${e(full)}</a>` : e(full)}${d ? '. ' + e(d) : ''}</dd>`).join('')}</dl>

<h2>Sources (archived, sha256)</h2>
<ul>${[...files].map(f => { const c = cite(f); return `<li>${e(c.title)} (${e(c.journal)} ${e(c.year)}) ${c.doi ? `<a href="https://doi.org/${e(c.doi)}">doi ${e(c.doi)}</a>` : ''} · <code>${e(f)}</code> <code>${src[f].slice(0, 16)}…</code></li>`; }).join('')}</ul>
<p>Built by <code>research/longevity/markers.mjs</code>, which checks every hash and every quote. Abstracts are from Europe PMC.</p>
</body></html>`;
fs.mkdirSync('www/longevity/markers', { recursive: true });
fs.writeFileSync('www/longevity/markers/index.html', page);
console.log('markers', M.length, 'aging', aging.length, 'tally by top rung', tally.join(' '), 'sources', files.size);
