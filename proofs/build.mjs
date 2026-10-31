// proofs/build.mjs — bake the openai/math release into proofs/data.js and
// proofs/abstracts.json, joined with the hand-owned proofs/assessment.json.
//
//   node proofs/build.mjs --src <path to a clone of github.com/openai/math>
//   node proofs/build.mjs --src <path> --check    # exit 1 if the outputs would change
//
// The release is 2.4 GB (1.8 GB of it Lean), so it is NOT vendored: this script
// reads a clone you point it at and writes two small files. Preflight does not
// run it (it cannot: the input lives outside the repo). Re-run it when the
// release moves, and commit the outputs.
//
// The release is third-party data. This script only READS text out of it —
// overview.tex, CONTENTS.md, lean/formalization.yaml — and never executes
// anything inside the clone.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, scrubText } from '../scripts/lib/landing.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SRC = args[args.indexOf('--src') + 1];
const CHECK = args.includes('--check');
if (!SRC || !existsSync(join(SRC, 'overview.tex'))) {
  console.error('usage: node proofs/build.mjs --src <clone of openai/math> [--check]');
  process.exit(2);
}
const REPO = 'https://github.com/openai/math';

// ---------------------------------------------------------------- TeX → text --
// The overview's titles and summaries are LaTeX. The page has no math renderer
// (no external scripts on this surface), so convert the macros that actually
// occur to Unicode. Anything left over is reported, not silently dropped.
const SYM = {
  ge: '≥', le: '≤', ne: '≠', to: '→', in: '∈', notin: '∉', infty: '∞', times: '×', pm: '±', sim: '∼',
  cong: '≅', subset: '⊂', subseteq: '⊆', setminus: '∖', cap: '∩', cup: '∪', circ: '∘', otimes: '⊗',
  wedge: '∧', preceq: '⪯', nmid: '∤', downarrow: '↓', nabla: '∇', sum: '∑', int: '∫', rtimes: '⋊',
  ldots: '…', cdots: '⋯', dots: '…', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lVert: '‖', rVert: '‖',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', phi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω', ell: 'ℓ', Delta: 'Δ', Theta: 'Θ', Omega: 'Ω', Sigma: 'Σ', Re: 'Re',
  log: 'log', exp: 'exp', max: 'max', min: 'min', sup: 'sup', dim: 'dim', deg: 'deg', det: 'det',
  sin: 'sin', tanh: 'tanh', arccos: 'arccos', arcsin: 'arcsin', Pr: 'Pr',
  o: 'ø', l: 'ł', i: 'ı', textquotesingle: "'", ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', '|': '‖', '{': '\uE000', '}': '\uE001', vee: '∨', dagger: '†', dashv: '⊣', wr: '≀', triangleleft: '◁', unlhd: '⊴',
  lt: '<', gt: '>', leq: '≤', geq: '≥', ll: '≪', gg: '≫', equiv: '≡', simeq: '≃', approx: '≈', cdot: '·', oplus: '⊕', perp: '⊥',
  colon: ':', prod: '∏', longrightarrow: '⟶', hookrightarrow: '↪', rightarrow: '→', mapsto: '↦', Rightarrow: '⇒', iff: '⇔',
  Gamma: 'Γ', Pi: 'Π', Lambda: 'Λ', Phi: 'Φ', Psi: 'Ψ', theta: 'θ', varphi: 'φ', tau: 'τ', vartheta: 'θ', beth: 'ℶ', aleph: 'ℵ',
  ker: 'ker', lg: 'lg', ln: 'ln', inf: 'inf', lim: 'lim', limsup: 'limsup', liminf: 'liminf', cos: 'cos', tan: 'tan', mod: 'mod', pmod: 'mod',
  forall: '∀', exists: '∃', partial: '∂', emptyset: '∅', varnothing: '∅', mid: '|', vert: '|', Vert: '‖', ast: '*', star: '⋆', bullet: '•',
  // spacing and sizing that carry no content
  mathop: '', nolimits: '', limits: '', displaystyle: '', textstyle: '', left: '', right: '', bigl: '', bigr: '', Bigl: '', Bigr: '',
  big: '', Big: '', quad: ' ', qquad: ' ', enspace: ' ', thinspace: ' ', medspace: ' ',
};
const BB = { Q: 'ℚ', Z: 'ℤ', R: 'ℝ', C: 'ℂ', N: 'ℕ', F: '𝔽', P: 'ℙ', A: '𝔸', H: 'ℍ', E: '𝔼', T: '𝕋' };
const CAL = { O: '𝒪', L: 'ℒ', F: 'ℱ', H: 'ℋ', M: 'ℳ', C: '𝒞', A: '𝒜', B: 'ℬ', S: '𝒮', K: '𝒦', D: '𝒟', G: '𝒢', P: '𝒫', N: '𝒩', U: '𝒰', X: '𝒳' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '*': '*', "'": '′', '=': '⁼', '(': '⁽', ')': '⁾', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', n: 'ₙ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', p: 'ₚ', m: 'ₘ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', x: 'ₓ', e: 'ₑ', a: 'ₐ', o: 'ₒ', h: 'ₕ', l: 'ₗ' };
const ACC = { '"': { o: 'ö', u: 'ü', a: 'ä', e: 'ë', i: 'ï', O: 'Ö', U: 'Ü', A: 'Ä' }, "'": { e: 'é', a: 'á', o: 'ó', i: 'í', u: 'ú', c: 'ć', n: 'ń', s: 'ś', z: 'ź', E: 'É', A: 'Á', S: 'Ś' }, '`': { e: 'è', a: 'à', o: 'ò', u: 'ù', i: 'ì' }, H: { o: 'ő', u: 'ű', O: 'Ő' }, v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž' }, '~': { n: 'ñ', a: 'ã', o: 'õ' }, '^': { o: 'ô', e: 'ê', a: 'â' }, c: { c: 'ç' } };
const leftovers = new Map();

function script(body, map) {
  const all = [...body].every((ch) => map[ch] !== undefined);
  return all ? [...body].map((ch) => map[ch]).join('') : null;
}
export function tex(s) {
  if (!s) return s;
  let t = s;
  // a text-mode control word swallows the space after it: Zauner\textquotesingle s → Zauner's
  t = t.replace(/\\textquotesingle\s*/g, "'");
  // accents: \"o, \"{o}, \'{e}, \H{o}, \v{c}
  t = t.replace(/\\(["'`^~]|[Hvc](?![a-zA-Z]))\s*\{?([a-zA-Z])\}?/g, (m, a, ch) => (ACC[a] && ACC[a][ch]) || ch);
  // braces only in pairs: an optional \}? would eat the brace of an enclosing \overline{…}
  t = t.replace(/\\(?:mathbb|mathbf|bm)\s*(?:\{\s*([A-Z])\s*\}|([A-Z]))/g, (m, a, b) => BB[a || b] || a || b);
  t = t.replace(/\\mathcal\s*(?:\{\s*([A-Z])\s*\}|([A-Z]))/g, (m, a, b) => CAL[a || b] || a || b);
  // \overline{X} / \bar X → X̄ ; \widehat{X} → X̂
  t = t.replace(/\\(?:overline|bar)\s*\{([^{}]*)\}/g, (m, x) => x + '̅').replace(/\\bar\s*([A-Za-z])/g, '$1̅');
  t = t.replace(/\\widehat\s*\{([^{}]*)\}/g, (m, x) => x + '̂');
  // innermost-first, to a fixed point, so nested braces (\sqrt{\log n}) resolve.
  // A word joiner fences each result, so "\times\mathrm{CM}" cannot glue into "\timesCM".
  const WJ = '\u2060';
  for (let pass = 0; pass < 8; pass++) {
    const before = t;
    t = t.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => `${WJ}${a.length > 1 ? `(${a})` : a}/${b.length > 1 ? `(${b})` : b}${WJ}`);
    t = t.replace(/\\binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, `${WJ}C($1,$2)${WJ}`);
    t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, (m, x) => `${WJ}${x.length > 1 ? `√(${x})` : `√${x}`}${WJ}`);
    t = t.replace(/\\(?:mathrm|mathsf|mathfrak|mathbf|textnormal|operatorname|text|emph|textit|textbf|mathit|textrm|texttt)\s*\{([^{}]*)\}/g, `${WJ}$1${WJ}`);
    t = t.replace(/\\(?:overline|bar)\s*\{([^{}]*)\}/g, `${WJ}$1\u0305${WJ}`).replace(/\\(?:widetilde|tilde)\s*\{([^{}]*)\}/g, `${WJ}$1\u0303${WJ}`);
    t = t.replace(/\\(?:widehat|hat)\s*\{([^{}]*)\}/g, `${WJ}$1\u0302${WJ}`).replace(/\\dot\s*\{?([A-Za-z])\}?/g, `${WJ}$1\u0307${WJ}`);
    if (t === before) break;
  }
  t = t.replace(/\\(?:mathbb|mathcal|mathfrak)\s*([A-Za-z])/g, (m, ch) => BB[ch] || ch);
  // brace-less forms: \sqrt N, \sqrt3, \tfrac12, \mathrm M, \overline X
  t = t.replace(/\\sqrt\s*(\\[A-Za-z]+|[A-Za-z0-9])/g, `${WJ}√$1${WJ}`);
  t = t.replace(/\\(?:d|t)?frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, `${WJ}$1/$2${WJ}`);
  t = t.replace(/\\(?:mathrm|mathsf|mathbf|operatorname)\s+([A-Za-z]+)/g, `${WJ}$1${WJ}`);
  t = t.replace(/\\(?:overline|bar)\s*([A-Za-z])/g, `${WJ}$1\u0305${WJ}`).replace(/\\(?:widetilde|tilde)\s*([A-Za-z])/g, `${WJ}$1\u0303${WJ}`);
  t = t.replace(/\\(?:widehat|hat)\s*([A-Za-z])/g, `${WJ}$1\u0302${WJ}`);
  t = t.replace(/\\not\s*([=<>])/g, (m, c) => ({ '=': '≠', '<': '≮', '>': '≯' })[c]);
  t = t.replace(/\\(?:bar|tilde)\s*([A-Za-z])/g, '$1\u0305');
  t = t.replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\not\s*\\in\b/g, '∉').replace(/\\not\s*\\cong/g, '≇').replace(/\\not\s*\\simeq/g, '≄').replace(/\\not\s*\\equiv/g, '≢').replace(/\\not\s*\\subset/g, '⊄');
  // named macros to symbols FIRST, so a superscript never captures half a macro (2^\\infty)
  t = t.replace(/\\([a-zA-Z]+|[,|{} ])/g, (m, name) => {
    if (SYM[name] !== undefined) return SYM[name];
    leftovers.set(name, (leftovers.get(name) || 0) + 1);
    return name;
  });
  // superscripts / subscripts: as Unicode when every character has one, else ^(…) / _(…)
  t = t.replace(/\^\s*\{([^{}]*)\}|\^\s*([A-Za-z0-9*'+-]|[^\s\\{}_^])/g, (m, a, b) => { const x = a ?? b; const u = script(x, SUP); return u ?? `^(${x})`; });
  t = t.replace(/_\s*\{([^{}]*)\}|_\s*([A-Za-z0-9])/g, (m, a, b) => { const x = a ?? b; const u = script(x, SUB); return u ?? `_(${x})`; });
  t = t.replace(/---/g, '—').replace(/--/g, '–').replace(/``|''/g, '"').replace(/~/g, ' ');
  t = t.replace(/\$/g, '').replace(/[{}]/g, '').replace(/\u2060/g, '').replace(/\uE000/g, '{').replace(/\uE001/g, '}').replace(/\s+/g, ' ').trim();
  return t;
}

// ---------------------------------------------------------------- overview --
const ov = readFileSync(join(SRC, 'overview.tex'), 'utf8');
const body = ov.slice(ov.indexOf('\\begin{document}'));
function groups(s, i, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    while (s[i] !== '{') i++;
    let d = 0, j = i;
    for (;; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
    out.push(s.slice(i + 1, j)); i = j + 1;
  }
  return out;
}
const families = [];
let discipline = null;
const re = /\\cataloguesection\{([^}]*)\}|\\resultentry(?=\{)/g;
for (let m; (m = re.exec(body)); ) {
  if (m[1] !== undefined) { discipline = m[1]; continue; }
  const [id, title, desc, links] = groups(body, m.index + m[0].length, 4);
  const papers = [...links.matchAll(/preprints\/([^/}]+)\/([^}]+?\.pdf)/g)].map((x) => ({ dir: x[1], pdf: x[2] }));
  families.push({ id, title, desc, discipline, papers });
}

// --------------------------------------------------- manuscript map (abstracts) --
const md = readFileSync(join(SRC, 'CONTENTS.md'), 'utf8');
const paperInfo = new Map();
const unhtml = (s) => s
  .replace(/<sup>(.*?)<\/sup>/g, (m, x) => { x = x.replace(/<[^>]+>/g, ''); return script(x, SUP) ?? `^(${x})`; })
  .replace(/<sub>(.*?)<\/sub>/g, (m, x) => { x = x.replace(/<[^>]+>/g, ''); return script(x, SUB) ?? `_(${x})`; })
  .replace(/<[^>]+>/g, '').replace(/&emsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
for (const m of md.matchAll(/&emsp;\[([^\]\n]*?)\]\(preprints\/([^/)]+)\/[^)]*\)\s*\n\s*\n([\s\S]*?)\n\s*\n<\/td>/g)) {
  // CONTENTS.md writes inline math as $`…`$
  const abs = unhtml(m[3]).replace(/\$`([^`]*)`\$/g, (x, inner) => tex(inner)).replace(/\s+/g, ' ').trim();
  paperInfo.set(m[2], { title: unhtml(m[1]).replace(/\$`([^`]*)`\$/g, (x, inner) => tex(inner)), abstract: abs });
}

// -------------------------------------------------------------------- Lean --
const yaml = readFileSync(join(SRC, 'lean', 'formalization.yaml'), 'utf8');
const sources = yaml.slice(yaml.indexOf('\nsources:'), yaml.indexOf('\nrelated_formalizations:'));
const leanDirs = new Set([...sources.matchAll(/preprints\/([^/\s"]+)\//g)].map((x) => x[1]));
// lean/docs/NNN.md: the release's scope note for a family's Lean development. It exists for
// every catalogued family and for about a hundred more whose formalized statement is
// narrower than the paper's main result (or simply uncatalogued, like 005). Only the
// file names are read here; the page for a family quotes the scope when it matters.
const leanDocs = new Set(readdirSync(join(SRC, 'lean', 'docs')).filter((n) => /^\d{3}\.md$/.test(n)).map((n) => n.slice(0, 3)));

// ------------------------------------------------------------------- join ---
const A = JSON.parse(readFileSync(join(HERE, 'assessment.json'), 'utf8')).families;
let commit = 'unknown';
try { commit = execFileSync('git', ['-C', SRC, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}

const disciplines = [...new Set(families.map((f) => f.discipline))];
const abstracts = {};
const out = families.map((f) => {
  const a = A[f.id];
  if (!a) throw new Error(`family ${f.id} has no assessment entry`);
  const papers = f.papers.map((p) => {
    const info = paperInfo.get(p.dir);
    if (info) abstracts[p.dir] = scrubText(info.abstract);
    return { t: scrubText(info ? info.title : p.dir.replace(/-/g, ' ')), dir: p.dir, pdf: p.pdf, lean: leanDirs.has(p.dir) };
  });
  return {
    id: f.id, t: scrubText(tex(f.title)), d: scrubText(tex(f.desc)), disc: disciplines.indexOf(f.discipline),
    tier: a.tier, effort: a.effort, widget: scrubText(tex(a.widget)), related: a.related, conj: a.conjectures, page: a.page,
    lean: papers.filter((p) => p.lean).length, leanDoc: leanDocs.has(f.id), papers,
  };
});
for (const id of Object.keys(A)) if (!out.some((f) => f.id === id)) throw new Error(`assessment has ${id}, the release does not`);

const meta = {
  source: REPO, commit, families: out.length, papers: out.reduce((s, f) => s + f.papers.length, 0),
  leanFamilies: out.filter((f) => f.lean).length, leanDocFamilies: out.filter((f) => !f.lean && f.leanDoc).length, leanPapers: out.reduce((s, f) => s + f.lean, 0),
  tiers: Object.fromEntries(['A', 'B', 'C'].map((t) => [t, out.filter((f) => f.tier === t).length])),
  built: out.filter((f) => f.page).length,
};
const js = `// GENERATED by proofs/build.mjs from ${REPO} @ ${commit} and proofs/assessment.json — do not edit.\n` +
  `window.PROOFS = ${JSON.stringify({ meta, disciplines, families: out })};\n`;
const absJson = JSON.stringify(abstracts) + '\n';

const r1 = emit(join(HERE, 'data.js'), js, { write: !CHECK });
const r2 = emit(join(HERE, 'abstracts.json'), absJson, { write: !CHECK });
console.log(`${meta.families} families · ${meta.papers} papers · ${meta.leanPapers} formalized papers in ${meta.leanFamilies} families (+${meta.leanDocFamilies} with an uncatalogued Lean development) · tiers ${JSON.stringify(meta.tiers)} · built ${meta.built}`);
console.log(`data.js ${(js.length / 1024).toFixed(0)} kB · abstracts.json ${(absJson.length / 1024).toFixed(0)} kB · ${Object.keys(abstracts).length} abstracts`);
if (leftovers.size) console.log('unconverted TeX macros (shown as their names):', [...leftovers].map(([k, v]) => `${k}×${v}`).join(' '));
if (CHECK && !(r1.same && r2.same)) { console.error('proofs data is stale — rerun without --check'); process.exit(1); }
