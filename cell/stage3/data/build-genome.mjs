#!/usr/bin/env node
// Builds cell/stage3/data/genome.json: every JCVI-syn3A gene with its position, function and
// measured abundance. No dependencies (xlsx is read as zipped XML). Sources are fetched once
// into a cache directory and pinned: NCBI accessions by version, the lab repo by commit.
//
//   node cell/stage3/data/build-genome.mjs            # write genome.json
//   node cell/stage3/data/build-genome.mjs --check    # fail if genome.json is stale
//
// Sources (cited on the page and in genome.json):
//   genome    NCBI CP016816.2  JCVI-syn3A complete genome (GenBank)
//   v1        NCBI CP016816.1  the first release of the same genome (then 'Syn3.0 strain 6d'),
//             whose protein IDs (AOE…) key the proteomics; joined to .2 by gene coordinates
//   proteome  Breuer et al. 2019 eLife 8:e36842, absolute copy numbers (time point 1 median),
//             as packaged in Luthey-Schulten-Lab/minimal_cell (CME_ODE/model_data/proteomics.xlsx)
//   annot     Syn3A annotation compilation (Breuer et al. 2019), same repo, FBA/
//   mrna      mean mRNA copies per gene from Thornburg et al. 2022 Cell simulations, same repo
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'genome.json');
const LAB_SHA = 'db048aca5fe85438e0129819bbf0314b037dd931';
const LAB = `https://raw.githubusercontent.com/Luthey-Schulten-Lab/minimal_cell/${LAB_SHA}/CME_ODE/model_data/`;
const NCBI = (acc) => `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${acc}&rettype=gbwithparts&retmode=text`;
const SOURCES = {
  syn3a: { url: NCBI('CP016816.2'), file: 'CP016816.2.gb' },
  v1: { url: NCBI('CP016816.1'), file: 'CP016816.1.gb' },
  proteome: { url: LAB + 'proteomics.xlsx', file: 'proteomics.xlsx' },
  annot: { url: LAB + 'FBA/Syn3A_annotation_compilation.xlsx', file: 'Syn3A_annotation_compilation.xlsx' },
  mrna: { url: LAB + 'mRNA_counts.csv', file: 'mRNA_counts.csv' },
};

const args = process.argv.slice(2);
const CACHE = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : join(tmpdir(), 'cell-stage3-sources');

async function source(key) {
  const { url, file } = SOURCES[key], path = join(CACHE, file);
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${key}: HTTP ${r.status} for ${url}`);
    writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  }
  return readFileSync(path);
}

// ---------- zip + xlsx ----------
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
    const lnl = buf.readUInt16LE(local + 26), lxl = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lnl + lxl, local + 30 + lnl + lxl + csize);
    files[name] = () => (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    p += 46 + nl + xl + cl;
  }
  return files;
}
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function readSheet(buf, wantName) {
  const z = unzip(buf);
  const shared = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))) : [];
  const wb = z['xl/workbook.xml'](), rels = z['xl/_rels/workbook.xml.rels']();
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  const hit = sheets.find((s) => s[1] === wantName) || sheets[0];
  const target = new RegExp(`Id="${hit[2]}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${hit[2]}"`).exec(rels);
  const path = 'xl/' + (target[1] || target[2]).replace(/^\/?xl\//, '');
  const rows = [];
  for (const rm of z[path]().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = [...cm[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = /t="(\w+)"/.exec(cm[2])?.[1], inner = cm[3] || '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val = null;
      if (type === 's') val = shared[+v];
      else if (type === 'inlineStr') val = unxml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if (type === 'str') val = v == null ? null : unxml(v);
      else if (v != null) val = Number(v);
      row[col] = val;
    }
    rows.push(row);
  }
  return rows;
}

// ---------- GenBank ----------
function genbank(text) {
  const length = +/^LOCUS\s+\S+\s+(\d+) bp/m.exec(text)[1];
  const body = text.slice(text.indexOf('\nFEATURES'), text.indexOf('\nORIGIN'));
  const feats = [];
  let cur = null, q = null;
  for (const line of body.split('\n').slice(2)) {
    if (/^ {5}\S/.test(line)) {
      cur = { type: line.slice(5, 21).trim(), loc: line.slice(21).trim(), q: {} }; feats.push(cur); q = null;
    } else if (cur && /^ {21}\//.test(line)) {
      const m = /^ {21}\/([^=]+)(?:=(.*))?$/.exec(line); q = m[1]; cur.q[q] = (m[2] ?? 'true');
    } else if (cur && q) cur.q[q] += (q === 'translation' ? '' : ' ') + line.trim();
    else if (cur) cur.loc += line.trim();
  }
  for (const f of feats) {
    for (const k in f.q) f.q[k] = f.q[k].replace(/^"|"$/g, '');
    const nums = [...f.loc.matchAll(/\d+/g)].map((m) => +m[0]);
    f.start = Math.min(...nums); f.end = Math.max(...nums); f.strand = f.loc.includes('complement') ? -1 : 1;
  }
  return { length, feats };
}

// ---------- build ----------
async function build() {
  const g3 = genbank((await source('syn3a')).toString('utf8'));
  const g1 = genbank((await source('v1')).toString('utf8'));
  if (g1.length !== g3.length) throw new Error('CP016816.1 and .2 differ in length; the coordinate join is unsafe');
  const prot = readSheet(await source('proteome'), 'Proteomics');
  const ann = readSheet(await source('annot'), 'Syn3A_annotation_compilation_condensed');
  const mrnaRows = (await source('mrna')).toString('utf8').trim().split('\n').slice(1).map((l) => l.split(','));

  // proteomics: AOE protein id -> copy number. Header is two rows; col 21 is
  // "Absolute abundance (copy number)", time point 1 median.
  const head = prot[0].map((v) => String(v ?? ''));
  if (!/Absolute abundance/i.test(head[21] || '')) throw new Error('proteomics column 21 is no longer absolute abundance');
  const copies = new Map();
  for (const r of prot.slice(2)) if (r[0] && typeof r[21] === 'number') copies.set(r[0], r[21]);
  // same gene in the first release of this genome -> its AOE protein id
  const at = (f) => `${f.start}:${f.end}:${f.strand}`;
  const v1aoe = new Map();
  for (const f of g1.feats) if (f.type === 'CDS' && f.q.protein_id) v1aoe.set(at(f), f.q.protein_id);
  // annotation: MMSYN1_xxxx -> { annotation, class, category, syn2 locus }
  const annot = new Map();
  for (const r of ann.slice(1)) {
    if (!r[5] || !String(r[5]).startsWith('MMSYN1_')) continue;
    annot.set(String(r[5]).trim(), { ann: String(r[8] ?? '').trim(), cls: String(r[9] ?? '').trim(), cat: String(r[10] ?? '').trim(), syn2: String(r[13] ?? '').trim() });
  }
  const mrna = new Map(mrnaRows.map(([, tag, c]) => [tag, +c]));

  const KINDS = { CDS: 'protein', rRNA: 'rRNA', tRNA: 'tRNA', tmRNA: 'tmRNA', ncRNA: 'ncRNA' };
  const genes = [];
  for (const f of g3.feats) {
    if (!KINDS[f.type] || !f.q.locus_tag) continue;
    const tag = f.q.locus_tag, num = tag.split('_')[1], a = annot.get('MMSYN1_' + num) || {};
    const pseudo = f.type === 'CDS' && (f.q.pseudo === 'true' || !f.q.protein_id);
    const aoe = v1aoe.get(at(f));
    const ptn = f.type === 'CDS' && !pseudo && aoe && copies.has(aoe) ? Math.round(copies.get(aoe)) : null;
    genes.push({
      tag, kind: pseudo ? 'pseudo' : KINDS[f.type],
      start: f.start, end: f.end, strand: f.strand, nt: f.end - f.start + 1,
      name: f.q.gene || '', product: f.q.product || '',
      ann: a.ann || '', cat: a.cat || '', cls: a.cls || '',
      aa: f.q.translation ? f.q.translation.length : 0,
      ptn, mrna: mrna.has(tag) ? Math.round(mrna.get(tag) * 1000) / 1000 : null,
    });
  }
  genes.sort((x, y) => x.start - y.start);
  return {
    meta: {
      organism: 'JCVI-syn3A', genomeLength: g3.length,
      built: 'scripts: cell/stage3/data/build-genome.mjs',
      sources: [
        { key: 'genome', cite: 'NCBI GenBank CP016816.2, Synthetic bacterium JCVI-Syn3A, complete genome', url: 'https://www.ncbi.nlm.nih.gov/nuccore/CP016816.2' },
        { key: 'ptn', cite: 'Breuer M. et al. (2019) Essential metabolism for a minimal cell. eLife 8:e36842. Absolute protein copy numbers, time point 1 median.', url: 'https://elifesciences.org/articles/36842' },
        { key: 'annotation', cite: 'Syn3A annotation compilation (Breuer et al. 2019), via Luthey-Schulten-Lab/minimal_cell @ ' + LAB_SHA.slice(0, 7), url: 'https://github.com/Luthey-Schulten-Lab/minimal_cell' },
        { key: 'mrna', cite: 'Mean mRNA copies per gene from whole-cell simulations, Thornburg Z.R. et al. (2022) Fundamental behaviors emerge from simulations of a living minimal cell. Cell 185:345.', url: 'https://doi.org/10.1016/j.cell.2021.12.025' },
        { key: 'idmap', cite: 'NCBI GenBank CP016816.1, the first release of the same genome, whose protein IDs key the proteomics (joined by gene coordinates)', url: 'https://www.ncbi.nlm.nih.gov/nuccore/CP016816.1' },
      ],
    },
    genes,
  };
}

const data = await build();
const json = JSON.stringify(data) + '\n';
if (args.includes('--check')) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (have !== json) { console.error('genome.json is stale: run node cell/stage3/data/build-genome.mjs'); process.exit(1); }
  console.log('genome.json is current');
} else {
  writeFileSync(OUT, json);
  const g = data.genes, by = (k) => g.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
  console.log(`wrote ${OUT}: ${g.length} genes`, by('kind'));
  console.log('quantified proteins:', g.filter((x) => x.ptn != null).length, '· total copies:', g.reduce((s, x) => s + (x.ptn || 0), 0));
  console.log('categories:', by('cat'));
  console.log('classes:', by('cls'));
}
