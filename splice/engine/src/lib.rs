//! Deterministic molecular-biology engine for splice.mino.mobi — Phase 2.
//!
//! A from-scratch Rust subset of the deterministic parts of a cloning
//! workbench: reverse-complement, translation, ORF finding, restriction
//! mapping, digestion (→ gel fragment sizes), and in-silico PCR. No C
//! dependencies → compiles cleanly to `wasm32-unknown-unknown`.
//!
//! ABI for the browser: every public op takes a single UTF-8 string argument
//! (passed as ptr+len into linear memory) with `|`-delimited fields, and
//! returns a packed `u64` = `(out_ptr as u32) << 32 | (out_len as u32)`
//! pointing at a UTF-8 result (JSON, except `revcomp`/`translate` which return
//! a bare string). JS reads it, then calls `wfree(ptr, len)`. Inputs are
//! allocated by JS via `walloc` and freed by JS after the call.

use std::alloc::{alloc, dealloc, Layout};

// ---------------------------------------------------------------------------
// memory ABI
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn walloc(len: usize) -> *mut u8 {
    unsafe { alloc(Layout::from_size_align(len.max(1), 1).unwrap()) }
}

#[no_mangle]
pub extern "C" fn wfree(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        unsafe { dealloc(ptr, Layout::from_size_align(len.max(1), 1).unwrap()) }
    }
}

/// Copy a result string into a freshly allocated buffer and pack ptr/len.
fn out(s: String) -> u64 {
    let bytes = s.into_bytes();
    let len = bytes.len();
    let ptr = walloc(len);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
    }
    ((ptr as u64) << 32) | (len as u64)
}

/// Read a JS-provided (ptr,len) as a &str without taking ownership.
unsafe fn input(ptr: *const u8, len: usize) -> String {
    let slice = std::slice::from_raw_parts(ptr, len);
    String::from_utf8_lossy(slice).into_owned()
}

// ---------------------------------------------------------------------------
// core sequence ops (pure, host-testable)
// ---------------------------------------------------------------------------

fn complement(b: u8) -> u8 {
    match b {
        b'A' | b'a' => b'T',
        b'T' | b't' => b'A',
        b'G' | b'g' => b'C',
        b'C' | b'c' => b'G',
        b'N' | b'n' => b'N',
        _ => b'N',
    }
}

pub fn revcomp(seq: &str) -> String {
    seq.bytes().rev().map(|b| complement(b) as char).collect()
}

/// Normalize to uppercase A/C/G/T/N, dropping whitespace and digits.
fn clean(seq: &str) -> Vec<u8> {
    seq.bytes()
        .filter(|b| b.is_ascii_alphabetic())
        .map(|b| b.to_ascii_uppercase())
        .map(|b| match b {
            b'A' | b'C' | b'G' | b'T' | b'N' => b,
            b'U' => b'T',
            _ => b'N',
        })
        .collect()
}

fn codon_to_aa(c: &[u8]) -> char {
    // Standard genetic code.
    let key = [c[0], c[1], c[2]];
    match &key {
        b"TTT" | b"TTC" => 'F',
        b"TTA" | b"TTG" | b"CTT" | b"CTC" | b"CTA" | b"CTG" => 'L',
        b"ATT" | b"ATC" | b"ATA" => 'I',
        b"ATG" => 'M',
        b"GTT" | b"GTC" | b"GTA" | b"GTG" => 'V',
        b"TCT" | b"TCC" | b"TCA" | b"TCG" | b"AGT" | b"AGC" => 'S',
        b"CCT" | b"CCC" | b"CCA" | b"CCG" => 'P',
        b"ACT" | b"ACC" | b"ACA" | b"ACG" => 'T',
        b"GCT" | b"GCC" | b"GCA" | b"GCG" => 'A',
        b"TAT" | b"TAC" => 'Y',
        b"TAA" | b"TAG" | b"TGA" => '*',
        b"CAT" | b"CAC" => 'H',
        b"CAA" | b"CAG" => 'Q',
        b"AAT" | b"AAC" => 'N',
        b"AAA" | b"AAG" => 'K',
        b"GAT" | b"GAC" => 'D',
        b"GAA" | b"GAG" => 'E',
        b"TGT" | b"TGC" => 'C',
        b"TGG" => 'W',
        b"CGT" | b"CGC" | b"CGA" | b"CGG" | b"AGA" | b"AGG" => 'R',
        b"GGT" | b"GGC" | b"GGA" | b"GGG" => 'G',
        _ => 'X',
    }
}

/// Translate a forward nucleotide slice starting at offset `off` (0..=2).
pub fn translate_frame(seq: &[u8], off: usize) -> String {
    let mut p = String::new();
    let mut i = off;
    while i + 3 <= seq.len() {
        p.push(codon_to_aa(&seq[i..i + 3]));
        i += 3;
    }
    p
}

/// frame in {1,2,3,-1,-2,-3}. Negative frames translate the reverse strand.
pub fn translate(seq: &str, frame: i32) -> String {
    let s = clean(seq);
    if frame > 0 {
        translate_frame(&s, (frame - 1) as usize)
    } else {
        let rc: Vec<u8> = s.iter().rev().map(|&b| complement(b)).collect();
        translate_frame(&rc, (-frame - 1) as usize)
    }
}

// ---------------------------------------------------------------------------
// melting temperature (Tm) — clean-room SantaLucia nearest-neighbor
// ---------------------------------------------------------------------------
//
// Independent reimplementation of the published SantaLucia (1998) unified
// nearest-neighbor method with the SantaLucia salt correction, the same
// method primer3 selects for `santalucia_auto` + `santalucia`. The ΔH/ΔS
// constants are scientific measurements from the paper [SantaLucia JR (1998),
// PNAS 95:1460–65] — facts, not code — so this engine carries no GPL text and
// stays MIT. Validated to match primer3's oligotm to <0.01 °C in tests.
//
// Tables are indexed [first base][second base] with A,C,G,T = 0..3.
// dH units: -100 cal/mol.   dS units: -0.1 cal/(K·mol).

const SL98_DH: [[i32; 4]; 4] = [
    [79, 84, 78, 72], // AA AC AG AT
    [85, 80, 106, 78], // CA CC CG CT
    [82, 98, 80, 84], // GA GC GG GT
    [72, 82, 85, 79], // TA TC TG TT
];
const SL98_DS: [[i32; 4]; 4] = [
    [222, 224, 210, 204],
    [227, 199, 272, 210],
    [222, 244, 199, 224],
    [213, 222, 227, 222],
];

fn base_idx(b: u8) -> Option<usize> {
    match b {
        b'A' => Some(0),
        b'C' => Some(1),
        b'G' => Some(2),
        b'T' => Some(3),
        _ => None,
    }
}

/// Is the duplex self-complementary (palindromic)? Adds a symmetry correction.
fn is_symmetric(s: &[u8]) -> bool {
    let n = s.len();
    if n == 0 || n % 2 == 1 {
        return false;
    }
    for i in 0..n / 2 {
        if complement(s[i]) != s[n - 1 - i] {
            return false;
        }
    }
    true
}

/// Melting temperature (°C) by SantaLucia 1998 NN + SantaLucia salt correction.
/// `dna_nm` = strand concentration (nM), `na_mm` = monovalent salt (mM).
/// Returns None for sequences with non-ACGT bases or length < 2.
pub fn tm_santalucia(seq: &str, dna_nm: f64, na_mm: f64) -> Option<f64> {
    let s = clean(seq);
    let n = s.len();
    if n < 2 {
        return None;
    }
    // integer accumulators in the same fixed-point units primer3 uses
    let mut dh: i32 = 0; // -100 cal/mol
    let mut ds: i32 = 0; // -0.1 cal/(K·mol)
    let mut gc = 0usize;

    let sym = is_symmetric(&s);
    if sym {
        ds += 14;
    }
    // 5' terminal penalty
    match s[0] {
        b'A' | b'T' => {
            ds += -41;
            dh += -23;
        }
        b'C' | b'G' => {
            ds += 28;
            dh += -1;
        }
        _ => return None,
    }
    // nearest-neighbor stack sum
    for w in s.windows(2) {
        let a = base_idx(w[0])?;
        let b = base_idx(w[1])?;
        ds += SL98_DS[a][b];
        dh += SL98_DH[a][b];
    }
    // 3' terminal penalty
    match s[n - 1] {
        b'A' | b'T' => {
            ds += -41;
            dh += -23;
        }
        b'C' | b'G' => {
            ds += 28;
            dh += -1;
        }
        _ => return None,
    }
    for &b in &s {
        if b == b'C' || b == b'G' {
            gc += 1;
        }
    }

    let delta_h = dh as f64 * -100.0; // cal/mol
    let mut delta_s = ds as f64 * -0.1; // cal/(K·mol)
    const R: f64 = 1.987; // cal/(K·mol)
    const T_KELVIN: f64 = 273.15;

    // SantaLucia salt correction folds into ΔS
    delta_s += 0.368 * (n as f64 - 1.0) * (na_mm / 1000.0).ln();

    // symmetric duplexes use total strand conc; asymmetric divide by 4
    let denom_div = if sym { 1.0e9 } else { 4.0e9 };
    let tm = delta_h / (delta_s + R * (dna_nm / denom_div).ln()) - T_KELVIN;
    let _ = gc; // reserved for future formamide/DMSO terms
    Some(tm)
}

// ---------------------------------------------------------------------------
// primer design — pick fwd/rev primers to amplify a target region
// ---------------------------------------------------------------------------

fn gc_percent(s: &[u8]) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let gc = s.iter().filter(|&&b| b == b'G' || b == b'C').count();
    100.0 * gc as f64 / s.len() as f64
}

/// Longest run of a single base (4+ is a synthesis/specificity smell).
fn max_run(s: &[u8]) -> usize {
    let mut best = 0;
    let mut cur = 0;
    let mut prev = 0u8;
    for &b in s {
        if b == prev {
            cur += 1;
        } else {
            cur = 1;
            prev = b;
        }
        best = best.max(cur);
    }
    best
}

/// Count complementary base pairs in the 3' tail of a primer against its own
/// reverse complement (a crude self-dimer / 3'-hairpin proxy). Higher = worse.
fn three_prime_self_comp(s: &[u8]) -> usize {
    let n = s.len();
    if n < 4 {
        return 0;
    }
    let tail = &s[n.saturating_sub(5)..]; // last 5 bases
    let rc: Vec<u8> = s.iter().rev().map(|&b| complement(b)).collect();
    // best contiguous match of the 3' tail anywhere in the revcomp
    let mut best = 0;
    if rc.len() >= tail.len() {
        for w in rc.windows(tail.len()) {
            let m = w.iter().zip(tail).filter(|(a, b)| a == b).count();
            best = best.max(m);
        }
    }
    best
}

/// One primer's metrics. `score` in [0,100], higher is better.
struct Primer {
    seq: String,
    tm: f64,
    gc: f64,
    len: usize,
    gc_clamp: bool,
    score: f64,
    warn: Vec<&'static str>,
}

fn score_primer(seq: &[u8], target_tm: f64, na_mm: f64, dna_nm: f64) -> Option<Primer> {
    let tm = tm_santalucia(&String::from_utf8_lossy(seq), dna_nm, na_mm)?;
    let gc = gc_percent(seq);
    let n = seq.len();
    let last = *seq.last()?;
    let gc_clamp = last == b'G' || last == b'C';
    let run = max_run(seq);
    let dimer = three_prime_self_comp(seq);

    let mut warn = Vec::new();
    let mut score = 100.0;
    // Tm deviation: 4 pts per °C off target
    score -= (tm - target_tm).abs() * 4.0;
    // GC% ideally 40–60
    if gc < 40.0 {
        score -= (40.0 - gc) * 1.5;
        warn.push("low GC");
    } else if gc > 60.0 {
        score -= (gc - 60.0) * 1.5;
        warn.push("high GC");
    }
    // 3' GC clamp is desirable
    if !gc_clamp {
        score -= 6.0;
        warn.push("no 3' GC clamp");
    }
    // homopolymer runs
    if run >= 4 {
        score -= (run as f64 - 3.0) * 5.0;
        warn.push("homopolymer run");
    }
    // length sweet spot 18–25
    if n < 18 {
        score -= (18 - n) as f64 * 3.0;
    } else if n > 25 {
        score -= (n - 25) as f64 * 2.0;
    }
    // 3' self-complementarity (dimer risk)
    if dimer >= 4 {
        score -= (dimer as f64 - 3.0) * 6.0;
        warn.push("3' self-dimer");
    }
    if score < 0.0 {
        score = 0.0;
    }
    Some(Primer {
        seq: String::from_utf8_lossy(seq).into_owned(),
        tm,
        gc,
        len: n,
        gc_clamp,
        score,
        warn,
    })
}

fn primer_json(p: &Primer) -> String {
    let warns = p
        .warn
        .iter()
        .map(|w| jstr(w))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"seq\":{},\"tm\":{:.1},\"gc\":{:.1},\"len\":{},\"gcClamp\":{},\"score\":{:.0},\"warn\":[{}]}}",
        jstr(&p.seq),
        p.tm,
        p.gc,
        p.len,
        p.gc_clamp,
        p.score,
        warns
    )
}

/// Design a forward + reverse primer pair to amplify template[start..end].
/// For each side we sweep primer length [min_len..=max_len] and keep the
/// highest-scoring candidate; the reverse primer is the reverse-complement of
/// the template's 3' end of the amplicon.
pub fn op_design(
    template: &str,
    start: usize,
    end: usize,
    target_tm: f64,
    na_mm: f64,
    dna_nm: f64,
    min_len: usize,
    max_len: usize,
) -> String {
    let t = clean(template);
    let n = t.len();
    if start >= end || end > n || end - start < min_len {
        return "{\"error\":\"invalid region\"}".to_string();
    }
    let lo = min_len.max(8);
    let hi = max_len.min(36).min(end - start);

    // forward: top strand starting at `start`, extending right
    let mut best_fwd: Option<Primer> = None;
    for l in lo..=hi {
        if start + l > n {
            break;
        }
        if let Some(p) = score_primer(&t[start..start + l], target_tm, na_mm, dna_nm) {
            if best_fwd.as_ref().map_or(true, |b| p.score > b.score) {
                best_fwd = Some(p);
            }
        }
    }
    // reverse: revcomp of the top strand ending at `end`
    let mut best_rev: Option<Primer> = None;
    for l in lo..=hi {
        if end < l {
            break;
        }
        let region = &t[end - l..end];
        let rc: Vec<u8> = region.iter().rev().map(|&b| complement(b)).collect();
        if let Some(p) = score_primer(&rc, target_tm, na_mm, dna_nm) {
            if best_rev.as_ref().map_or(true, |b| p.score > b.score) {
                best_rev = Some(p);
            }
        }
    }

    match (best_fwd, best_rev) {
        (Some(f), Some(r)) => {
            let dtm = (f.tm - r.tm).abs();
            let pair_score = ((f.score + r.score) / 2.0 - dtm * 3.0).max(0.0);
            format!(
                "{{\"region\":{{\"start\":{},\"end\":{},\"len\":{}}},\"targetTm\":{:.1},\
                 \"fwd\":{},\"rev\":{},\"deltaTm\":{:.1},\"pairScore\":{:.0}}}",
                start,
                end,
                end - start,
                target_tm,
                primer_json(&f),
                primer_json(&r),
                dtm,
                pair_score
            )
        }
        _ => "{\"error\":\"no valid primers\"}".to_string(),
    }
}

// ---------------------------------------------------------------------------
// directed evolution — mutate real DNA toward an objective fitness target
// ---------------------------------------------------------------------------
//
// The "Fluoddity bridge": a genome is a real coding sequence; fitness is an
// objective function over its DNA (GC%, Tm, codon optimality, absence of a
// restriction site). Mutations are SYNONYMOUS by default — they swap a codon
// for another encoding the same amino acid — so the protein is preserved while
// the DNA is tuned. This is the engine half; breeding/selection/phylogeny live
// in the browser, but every fitness number is computed here.

/// Synonymous codon families: each amino acid -> its codons. Used to mutate DNA
/// without changing the protein. (Standard genetic code.)
fn synonymous_codons(aa: char) -> &'static [&'static [u8; 3]] {
    match aa {
        'F' => &[b"TTT", b"TTC"],
        'L' => &[b"TTA", b"TTG", b"CTT", b"CTC", b"CTA", b"CTG"],
        'I' => &[b"ATT", b"ATC", b"ATA"],
        'M' => &[b"ATG"],
        'V' => &[b"GTT", b"GTC", b"GTA", b"GTG"],
        'S' => &[b"TCT", b"TCC", b"TCA", b"TCG", b"AGT", b"AGC"],
        'P' => &[b"CCT", b"CCC", b"CCA", b"CCG"],
        'T' => &[b"ACT", b"ACC", b"ACA", b"ACG"],
        'A' => &[b"GCT", b"GCC", b"GCA", b"GCG"],
        'Y' => &[b"TAT", b"TAC"],
        '*' => &[b"TAA", b"TAG", b"TGA"],
        'H' => &[b"CAT", b"CAC"],
        'Q' => &[b"CAA", b"CAG"],
        'N' => &[b"AAT", b"AAC"],
        'K' => &[b"AAA", b"AAG"],
        'D' => &[b"GAT", b"GAC"],
        'E' => &[b"GAA", b"GAG"],
        'C' => &[b"TGT", b"TGC"],
        'W' => &[b"TGG"],
        'R' => &[b"CGT", b"CGC", b"CGA", b"CGG", b"AGA", b"AGG"],
        'G' => &[b"GGT", b"GGC", b"GGA", b"GGG"],
        _ => &[],
    }
}

/// E. coli high-expression relative codon usage (fraction within each aa's
/// family). Just enough to give "codon optimization" an objective gradient;
/// values are the well-known CAI-style relative adaptiveness for E. coli.
fn codon_weight(codon: &[u8]) -> f64 {
    match codon {
        b"TTT" => 0.58, b"TTC" => 1.00,
        b"TTA" => 0.14, b"TTG" => 0.13, b"CTT" => 0.12, b"CTC" => 0.10, b"CTA" => 0.04, b"CTG" => 1.00,
        b"ATT" => 0.51, b"ATC" => 1.00, b"ATA" => 0.07,
        b"ATG" => 1.00,
        b"GTT" => 0.65, b"GTC" => 0.40, b"GTA" => 0.30, b"GTG" => 1.00,
        b"TCT" => 0.47, b"TCC" => 0.46, b"TCA" => 0.20, b"TCG" => 0.18, b"AGT" => 0.22, b"AGC" => 1.00,
        b"CCT" => 0.29, b"CCC" => 0.17, b"CCA" => 0.34, b"CCG" => 1.00,
        b"ACT" => 0.40, b"ACC" => 1.00, b"ACA" => 0.23, b"ACG" => 0.35,
        b"GCT" => 0.46, b"GCC" => 0.47, b"GCA" => 0.36, b"GCG" => 1.00,
        b"TAT" => 0.65, b"TAC" => 1.00,
        b"TAA" => 1.00, b"TAG" => 0.10, b"TGA" => 0.39,
        b"CAT" => 0.66, b"CAC" => 1.00,
        b"CAA" => 0.51, b"CAG" => 1.00,
        b"AAT" => 0.65, b"AAC" => 1.00,
        b"AAA" => 1.00, b"AAG" => 0.40,
        b"GAT" => 0.81, b"GAC" => 1.00,
        b"GAA" => 1.00, b"GAG" => 0.55,
        b"TGT" => 0.69, b"TGC" => 1.00,
        b"TGG" => 1.00,
        b"CGT" => 1.00, b"CGC" => 0.83, b"CGA" => 0.13, b"CGG" => 0.15, b"AGA" => 0.10, b"AGG" => 0.05,
        b"GGT" => 0.59, b"GGC" => 1.00, b"GGA" => 0.18, b"GGG" => 0.22,
        _ => 0.5,
    }
}

/// Mean codon adaptation weight (0..1) over a coding sequence — the "codon
/// optimization" axis. Higher = better adapted to E. coli high expression.
fn codon_adaptation(s: &[u8]) -> f64 {
    let mut sum = 0.0;
    let mut n = 0;
    let mut i = 0;
    while i + 3 <= s.len() {
        sum += codon_weight(&s[i..i + 3]);
        n += 1;
        i += 3;
    }
    if n == 0 {
        0.0
    } else {
        sum / n as f64
    }
}

/// Count occurrences of a recognition site (both strands collapse since the
/// puzzle sites are palindromic; we still scan plainly).
fn count_site(s: &[u8], site: &[u8]) -> usize {
    find_all(s, site, false).len()
}

/// A fitness goal. Each contributes a term in [0,1] (1 = perfectly satisfied).
pub enum Goal {
    TargetGc(f64),       // aim GC% at this value
    TargetTm(f64),       // aim whole-seq Tm at this value (long-seq NN proxy)
    CodonOptimize,       // maximize E. coli codon adaptation
    NoSite(Vec<u8>),     // eliminate occurrences of a recognition site
}

fn goal_term(g: &Goal, s: &[u8]) -> f64 {
    match g {
        Goal::TargetGc(t) => {
            let d = (gc_percent(s) - t).abs();
            (1.0 - d / 50.0).max(0.0) // within 50% spread -> linear falloff
        }
        Goal::TargetTm(t) => {
            // use the SantaLucia NN Tm (valid for our short evolved seqs)
            match tm_santalucia(&String::from_utf8_lossy(s), 50.0, 50.0) {
                Some(tm) => (1.0 - (tm - t).abs() / 30.0).max(0.0),
                None => 0.0,
            }
        }
        Goal::CodonOptimize => codon_adaptation(s),
        Goal::NoSite(site) => {
            if count_site(s, site) == 0 {
                1.0
            } else {
                // partial credit shrinking with hit count
                1.0 / (1.0 + count_site(s, site) as f64)
            }
        }
    }
}

/// Overall fitness in [0,1]: mean of the goal terms.
pub fn fitness(s: &[u8], goals: &[Goal]) -> f64 {
    if goals.is_empty() {
        return 0.0;
    }
    goals.iter().map(|g| goal_term(g, s)).sum::<f64>() / goals.len() as f64
}

/// Apply `n` synonymous point-mutations: pick a random codon, swap it for a
/// different synonymous codon. Preserves the protein. `rng` is a simple LCG
/// state passed by the caller for determinism.
fn mutate_synonymous(s: &[u8], n: usize, rng: &mut u64) -> Vec<u8> {
    let mut out = s.to_vec();
    let ncod = out.len() / 3;
    if ncod == 0 {
        return out;
    }
    for _ in 0..n {
        *rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let ci = ((*rng >> 33) as usize) % ncod;
        let pos = ci * 3;
        let aa = codon_to_aa(&out[pos..pos + 3]);
        let fam = synonymous_codons(aa);
        if fam.len() <= 1 {
            continue;
        }
        *rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let pick = fam[((*rng >> 33) as usize) % fam.len()];
        out[pos] = pick[0];
        out[pos + 1] = pick[1];
        out[pos + 2] = pick[2];
    }
    out
}

/// Parse a `goals` spec string like "gc:55,tm:65,codon,nosite:GAATTC".
fn parse_goals(spec: &str) -> Vec<Goal> {
    let mut goals = Vec::new();
    for tok in spec.split(',') {
        let tok = tok.trim();
        if tok.is_empty() {
            continue;
        }
        if let Some(v) = tok.strip_prefix("gc:") {
            if let Ok(x) = v.parse() {
                goals.push(Goal::TargetGc(x));
            }
        } else if let Some(v) = tok.strip_prefix("tm:") {
            if let Ok(x) = v.parse() {
                goals.push(Goal::TargetTm(x));
            }
        } else if tok == "codon" {
            goals.push(Goal::CodonOptimize);
        } else if let Some(v) = tok.strip_prefix("nosite:") {
            goals.push(Goal::NoSite(clean(v)));
        }
    }
    goals
}

/// One round of "breeding": from a parent, generate `offspring` synonymous
/// mutants (each with `mut_rate` mutations), score all, return the best
/// candidate plus the population, as JSON. Selection/forking is the caller's.
pub fn op_breed(seq: &str, goals_spec: &str, offspring: usize, mut_rate: usize, seed: u64) -> String {
    let parent = clean(seq);
    let goals = parse_goals(goals_spec);
    if parent.len() < 3 || goals.is_empty() {
        return "{\"error\":\"need a coding seq (>=1 codon) and >=1 goal\"}".to_string();
    }
    let prot = translate_frame(&parent, 0);
    let mut rng = seed ^ 0x9E3779B97F4A7C15;
    let parent_fit = fitness(&parent, &goals);

    let mut pop: Vec<(Vec<u8>, f64)> = Vec::with_capacity(offspring);
    for _ in 0..offspring.max(1) {
        let m = mutate_synonymous(&parent, mut_rate.max(1), &mut rng);
        let f = fitness(&m, &goals);
        pop.push((m, f));
    }
    // best first
    pop.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    // per-goal breakdown for the best, so the UI can show what improved
    let best = &pop[0];
    let breakdown = goals
        .iter()
        .map(|g| format!("{:.3}", goal_term(g, &best.0)))
        .collect::<Vec<_>>()
        .join(",");
    let parent_breakdown = goals
        .iter()
        .map(|g| format!("{:.3}", goal_term(g, &parent)))
        .collect::<Vec<_>>()
        .join(",");

    let pop_json = pop
        .iter()
        .map(|(m, f)| {
            format!(
                "{{\"seq\":{},\"fitness\":{:.4},\"gc\":{:.1}}}",
                jstr(&String::from_utf8_lossy(m)),
                f,
                gc_percent(m)
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    format!(
        "{{\"parentFitness\":{:.4},\"parentBreakdown\":[{}],\"protein\":{},\"proteinPreserved\":{},\
         \"bestFitness\":{:.4},\"bestBreakdown\":[{}],\"population\":[{}]}}",
        parent_fit,
        parent_breakdown,
        jstr(&prot),
        translate_frame(&best.0, 0) == prot,
        best.1,
        breakdown,
        pop_json
    )
}

/// Score a single genome against goals (for displaying any sequence's fitness).
pub fn op_fitness(seq: &str, goals_spec: &str) -> String {
    let s = clean(seq);
    let goals = parse_goals(goals_spec);
    if goals.is_empty() {
        return "{\"error\":\"no goals\"}".to_string();
    }
    let breakdown = goals
        .iter()
        .map(|g| format!("{:.3}", goal_term(g, &s)))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"fitness\":{:.4},\"breakdown\":[{}],\"gc\":{:.1},\"protein\":{}}}",
        fitness(&s, &goals),
        breakdown,
        gc_percent(&s),
        jstr(&translate_frame(&s, 0))
    )
}

// ---------------------------------------------------------------------------
// gel electrophoresis physics — migration of DNA through agarose
// ---------------------------------------------------------------------------
//
// Goal: positions a bench scientist would actually see. The model:
//   * relative mobility m(L) is a sigmoid in log-size — fast small fragments,
//     slow large ones, with a characteristic resolving size Lc set by % agarose
//     (more agarose -> smaller Lc -> resolves smaller fragments, compresses big).
//   * distance = m * (field) * time, field = V / electrode_gap.
//   * DNA TOPOLOGY shifts apparent mobility: a supercoiled plasmid is compact and
//     runs AHEAD of its linear length; a nicked/relaxed circle runs BEHIND. This
//     is why an uncut miniprep shows 2-3 bands and a clean cut shows the true
//     linear sizes — the heart of "did my cloning work?".
//
// Calibrated so a 1% gel at ~100 V for ~45 min puts a 1 kb band mid-lane, a
// 10 kb band near the well, and the dye front near the bottom.

const GEL_ELECTRODE_GAP_CM: f64 = 15.0;
const GEL_K: f64 = 0.0213; // distance calibration constant (1kb -> ~mid-lane @100V/45min)

/// Characteristic half-mobility size (bp) for a given agarose %.
fn gel_lc(agarose_pct: f64) -> f64 {
    10f64.powf(4.02 - 0.62 * agarose_pct)
}

/// Topology -> effective-size multiplier for the mobility lookup.
/// supercoiled compact (runs faster => smaller effective size); nicked slower.
fn topo_factor(topo: &str) -> f64 {
    match topo {
        "sc" => 0.62,   // supercoiled
        "nick" => 1.45, // nicked / open-circular / relaxed
        _ => 1.0,       // linear
    }
}

/// Fraction of the lane a fragment has migrated (0 = well, 1 = bottom).
/// Values > 1 mean it ran off the gel.
fn gel_fraction(bp: f64, topo: &str, agarose_pct: f64, voltage: f64, minutes: f64, gel_len_cm: f64) -> f64 {
    if bp <= 0.0 {
        return 0.0;
    }
    let eff = bp * topo_factor(topo);
    let lc = gel_lc(agarose_pct);
    let mut m = 1.0 / (1.0 + (eff / lc).powf(1.2));
    if m < 0.03 {
        m = 0.03; // huge fragments still creep (reptation orientation limit)
    }
    let field = voltage / GEL_ELECTRODE_GAP_CM;
    let dist_cm = m * GEL_K * field * minutes;
    dist_cm / gel_len_cm
}

/// Parse a fragment token: "1500" or "3000:sc" -> (bp, topo).
fn parse_frag(tok: &str) -> Option<(f64, String)> {
    let tok = tok.trim();
    if tok.is_empty() {
        return None;
    }
    let (size, topo) = match tok.split_once(':') {
        Some((s, t)) => (s, t),
        None => (tok, "lin"),
    };
    size.trim().parse::<f64>().ok().map(|bp| (bp, topo.to_string()))
}

/// Run a virtual gel: given run conditions and a CSV of fragment tokens, return
/// each band's migration fraction (+ ran-off flag). The renderer turns these
/// into a picture.
pub fn op_gel(voltage: f64, agarose_pct: f64, minutes: f64, gel_len_cm: f64, frags_csv: &str) -> String {
    let glen = if gel_len_cm <= 0.0 { 8.0 } else { gel_len_cm };
    // dye front: bromophenol blue ~ migrates like a tiny (~50 bp) fragment
    let front = gel_fraction(50.0, "lin", agarose_pct, voltage, minutes, glen);
    let bands = frags_csv
        .split(',')
        .filter_map(parse_frag)
        .map(|(bp, topo)| {
            let f = gel_fraction(bp, &topo, agarose_pct, voltage, minutes, glen);
            format!(
                "{{\"bp\":{},\"topo\":{},\"frac\":{:.4},\"ranOff\":{}}}",
                bp as u64,
                jstr(&topo),
                f.min(1.05),
                f > 1.0
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"voltage\":{},\"agarose\":{:.1},\"minutes\":{},\"dyeFront\":{:.4},\"bands\":[{}]}}",
        voltage as u64,
        agarose_pct,
        minutes as u64,
        front.min(1.05),
        bands
    )
}

// ---------------------------------------------------------------------------
// restriction enzymes (classic palindromic Type-II set)
// ---------------------------------------------------------------------------

/// (name, recognition site, top-strand cut offset, bottom-strand cut offset).
/// Offsets are measured from the site start in top-strand coordinates. The
/// overhang spans `[min(cut5,cut3) .. max]`: a 5' overhang when cut5<cut3, a
/// 3' overhang when cut5>cut3, blunt when equal. All sites here are
/// palindromic, so searching the forward strand suffices and every overhang
/// is its own reverse-complement (which makes ligation matching exact).
const ENZYMES: &[(&str, &str, usize, usize)] = &[
    ("EcoRI", "GAATTC", 1, 5),
    ("BamHI", "GGATCC", 1, 5),
    ("HindIII", "AAGCTT", 1, 5),
    ("NotI", "GCGGCCGC", 2, 6),
    ("XhoI", "CTCGAG", 1, 5),
    ("SalI", "GTCGAC", 1, 5),
    ("PstI", "CTGCAG", 5, 1),
    ("SmaI", "CCCGGG", 3, 3),
    ("KpnI", "GGTACC", 5, 1),
    ("SacI", "GAGCTC", 5, 1),
    ("XbaI", "TCTAGA", 1, 5),
    ("SpeI", "ACTAGT", 1, 5),
    ("NcoI", "CCATGG", 1, 5),
    ("NdeI", "CATATG", 2, 4),
    ("EcoRV", "GATATC", 3, 3),
    ("HpaI", "GTTAAC", 3, 3),
    ("NheI", "GCTAGC", 1, 5),
    ("BglII", "AGATCT", 1, 5),
    ("ClaI", "ATCGAT", 2, 4),
    ("AvrII", "CCTAGG", 1, 5),
    ("AflII", "CTTAAG", 1, 5),
    ("BspEI", "TCCGGA", 1, 5),
    ("AgeI", "ACCGGT", 1, 5),
    ("MluI", "ACGCGT", 1, 5),
    ("SphI", "GCATGC", 5, 1),
    ("ApaI", "GGGCCC", 5, 1),
    ("DraI", "TTTAAA", 3, 3),
    ("ScaI", "AGTACT", 3, 3),
    ("StuI", "AGGCCT", 3, 3),
    ("PvuII", "CAGCTG", 3, 3),
];

/// Overhang produced by an enzyme: ("5'" | "3'" | "blunt", overhang sequence).
fn overhang(site: &str, cut5: usize, cut3: usize) -> (&'static str, String) {
    let (lo, hi) = (cut5.min(cut3), cut5.max(cut3));
    let seq = site[lo..hi].to_string();
    let t = if cut5 < cut3 {
        "5'"
    } else if cut5 > cut3 {
        "3'"
    } else {
        "blunt"
    };
    (t, seq)
}

/// All occurrences of `pat` in `hay` (0-based), optionally wrapping for circular.
fn find_all(hay: &[u8], pat: &[u8], circular: bool) -> Vec<usize> {
    let n = hay.len();
    let m = pat.len();
    if m == 0 || m > n {
        return Vec::new();
    }
    let extended: Vec<u8> = if circular {
        let mut v = hay.to_vec();
        v.extend_from_slice(&hay[..m - 1]);
        v
    } else {
        hay.to_vec()
    };
    let mut hits = Vec::new();
    let limit = extended.len().saturating_sub(m) + 1;
    for i in 0..limit {
        if &extended[i..i + m] == pat {
            hits.push(i % n);
        }
    }
    hits.sort_unstable();
    hits.dedup();
    hits
}

/// One match of an enzyme: recognition start and top-strand cut position.
struct Site {
    enzyme: &'static str,
    idx: usize,
    start: usize,
    cut: usize,
}

fn scan(seq: &[u8], circular: bool) -> Vec<Site> {
    let n = seq.len();
    let mut sites = Vec::new();
    for (idx, &(name, site, cut5, _cut3)) in ENZYMES.iter().enumerate() {
        for start in find_all(seq, site.as_bytes(), circular) {
            sites.push(Site {
                enzyme: name,
                idx,
                start,
                cut: (start + cut5) % n.max(1),
            });
        }
    }
    sites
}

// ---------------------------------------------------------------------------
// JSON helpers (sequences are ASCII; no escaping needed beyond quotes)
// ---------------------------------------------------------------------------

fn jstr(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

// ---------------------------------------------------------------------------
// op implementations (pure -> String)
// ---------------------------------------------------------------------------

pub fn op_restriction(seq: &str, circular: bool) -> String {
    let s = clean(seq);
    let sites = scan(&s, circular);
    // group by enzyme: name -> sorted cut positions
    let mut out = String::from("{\"length\":");
    out.push_str(&s.len().to_string());
    out.push_str(",\"circular\":");
    out.push_str(if circular { "true" } else { "false" });
    out.push_str(",\"enzymes\":[");
    let mut first = true;
    for &(name, site, cut5, cut3) in ENZYMES {
        let mut cuts: Vec<usize> = sites
            .iter()
            .filter(|x| x.enzyme == name)
            .map(|x| x.cut)
            .collect();
        cuts.sort_unstable();
        if !first {
            out.push(',');
        }
        first = false;
        let (otype, ov) = overhang(site, cut5, cut3);
        out.push_str("{\"name\":");
        out.push_str(&jstr(name));
        out.push_str(",\"site\":");
        out.push_str(&jstr(site));
        out.push_str(",\"blunt\":");
        out.push_str(if otype == "blunt" { "true" } else { "false" });
        out.push_str(",\"overhangType\":");
        out.push_str(&jstr(otype));
        out.push_str(",\"overhang\":");
        out.push_str(&jstr(&ov));
        out.push_str(",\"count\":");
        out.push_str(&cuts.len().to_string());
        out.push_str(",\"cuts\":[");
        out.push_str(
            &cuts
                .iter()
                .map(|c| c.to_string())
                .collect::<Vec<_>>()
                .join(","),
        );
        out.push_str("]}");
    }
    out.push_str("]}");
    out
}

pub fn op_digest(seq: &str, enzymes_csv: &str, circular: bool) -> String {
    let s = clean(seq);
    let n = s.len();
    let wanted: Vec<&str> = enzymes_csv
        .split(',')
        .map(|x| x.trim())
        .filter(|x| !x.is_empty())
        .collect();
    let mut cuts: Vec<usize> = scan(&s, circular)
        .into_iter()
        .filter(|x| wanted.iter().any(|w| w.eq_ignore_ascii_case(x.enzyme)))
        .map(|x| x.cut)
        .collect();
    cuts.sort_unstable();
    cuts.dedup();

    let mut frags: Vec<usize> = Vec::new();
    if cuts.is_empty() {
        if n > 0 {
            frags.push(n); // uncut
        }
    } else if circular {
        for w in cuts.windows(2) {
            frags.push(w[1] - w[0]);
        }
        frags.push(n - cuts[cuts.len() - 1] + cuts[0]); // wrap fragment
    } else {
        frags.push(cuts[0]);
        for w in cuts.windows(2) {
            frags.push(w[1] - w[0]);
        }
        frags.push(n - cuts[cuts.len() - 1]);
    }
    frags.retain(|&f| f > 0);
    frags.sort_unstable_by(|a, b| b.cmp(a)); // largest first (gel order)

    format!(
        "{{\"length\":{},\"circular\":{},\"cuts\":{},\"fragments\":[{}]}}",
        n,
        circular,
        cuts.len(),
        frags
            .iter()
            .map(|f| f.to_string())
            .collect::<Vec<_>>()
            .join(",")
    )
}

pub fn op_pcr(seq: &str, fwd: &str, rev: &str, circular: bool) -> String {
    let s = clean(seq);
    let n = s.len();
    let fwd_c = clean(fwd);
    let rev_c = clean(rev);
    let rev_rc = revcomp(&String::from_utf8_lossy(&rev_c));

    // forward primer binds top strand directly; reverse primer's revcomp
    // appears on the top strand and marks the amplicon's 3' end.
    let f_starts = find_all(&s, &fwd_c, circular);
    let r_rc_starts = find_all(&s, rev_rc.as_bytes(), circular);
    let r_ends: Vec<usize> = r_rc_starts.iter().map(|&p| p + rev_c.len()).collect();

    let mut amps: Vec<(usize, usize, usize)> = Vec::new(); // (start, end, length)
    for &fs in &f_starts {
        // nearest reverse end strictly downstream (linear); allow wrap if circular
        let mut best: Option<usize> = None;
        for &re in &r_ends {
            if re > fs {
                best = Some(best.map_or(re, |b| b.min(re)));
            }
        }
        if best.is_none() && circular && !r_ends.is_empty() {
            // wrap-around amplicon
            let re = *r_ends.iter().min().unwrap();
            let len = (n - fs) + re;
            amps.push((fs, re % n, len));
            continue;
        }
        if let Some(re) = best {
            amps.push((fs, re, re - fs));
        }
    }
    amps.sort_unstable_by_key(|a| a.0);

    let body = amps
        .iter()
        .map(|(st, en, len)| format!("{{\"start\":{},\"end\":{},\"length\":{}}}", st, en, len))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"fwdSites\":{},\"revSites\":{},\"products\":[{}]}}",
        f_starts.len(),
        r_ends.len(),
        body
    )
}

pub fn op_orfs(seq: &str, min_aa: usize) -> String {
    let s = clean(seq);
    let n = s.len();
    let rc: Vec<u8> = s.iter().rev().map(|&b| complement(b)).collect();

    let mut orfs: Vec<(i32, usize, usize, usize)> = Vec::new(); // frame, start(top), end(top), aa_len
    for (strand, data) in [(1i32, &s), (-1i32, &rc)] {
        for off in 0..3usize {
            let mut i = off;
            while i + 3 <= data.len() {
                if &data[i..i + 3] == b"ATG" {
                    // find next in-frame stop
                    let mut j = i;
                    let mut found_stop = false;
                    while j + 3 <= data.len() {
                        if matches!(&data[j..j + 3], b"TAA" | b"TAG" | b"TGA") {
                            found_stop = true;
                            break;
                        }
                        j += 3;
                    }
                    let aa = (j - i) / 3;
                    if found_stop && aa >= min_aa {
                        let frame = strand * (off as i32 + 1);
                        let (gstart, gend) = if strand == 1 {
                            (i, j + 3)
                        } else {
                            (n - (j + 3), n - i) // map revcomp coords back to top strand
                        };
                        orfs.push((frame, gstart, gend, aa));
                        i = j + 3; // continue after this ORF
                        continue;
                    }
                }
                i += 3;
            }
        }
    }
    orfs.sort_unstable_by(|a, b| b.3.cmp(&a.3)); // longest first
    let body = orfs
        .iter()
        .map(|(fr, st, en, aa)| {
            format!(
                "{{\"frame\":{},\"start\":{},\"end\":{},\"aa\":{}}}",
                fr, st, en, aa
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!("{{\"length\":{},\"orfs\":[{}]}}", n, body)
}

// ---------------------------------------------------------------------------
// cloning: cut into fragments with typed ends, then ligate compatible ends
// ---------------------------------------------------------------------------

/// A double-stranded fragment with its two ends described by the enzyme that
/// produced them. `left`/`right` are (overhang-type, overhang-seq); a fresh
/// blunt molecule end (a linear input's own termini) is ("blunt","").
#[derive(Clone)]
struct Fragment {
    seq: String,
    left: (String, String),
    right: (String, String),
}

/// Two ends are ligation-compatible when both are blunt, or both are the same
/// protrusion type with an identical overhang. (Overhangs here are palindromic,
/// so equal overhang ⇒ they anneal — this also unifies isocaudomers like
/// BamHI/BglII, both 5'-GATC.)
fn compatible(a: &(String, String), b: &(String, String)) -> bool {
    if a.0 == "blunt" && b.0 == "blunt" {
        return true;
    }
    a.0 != "blunt" && a.0 == b.0 && a.1 == b.1
}

/// Cut a molecule into fragments, each carrying typed ends.
fn fragmentize(s: &[u8], enz_idxs: &[usize], circular: bool) -> Vec<Fragment> {
    let n = s.len();
    let blunt = || ("blunt".to_string(), String::new());
    // Collect cuts as (top-strand cut position, enzyme index), deduped per pos.
    let mut cuts: Vec<(usize, usize)> = scan(s, circular)
        .into_iter()
        .filter(|x| enz_idxs.contains(&x.idx))
        .map(|x| (x.cut, x.idx))
        .collect();
    cuts.sort_by_key(|c| c.0);
    cuts.dedup_by_key(|c| c.0);

    let end_of = |idx: usize| -> (String, String) {
        let (_, site, c5, c3) = ENZYMES[idx];
        let (t, ov) = overhang(site, c5, c3);
        (t.to_string(), ov)
    };
    let sub = |a: usize, b: usize| -> String {
        // top-strand substring a..b, wrapping for circular
        if a <= b {
            String::from_utf8_lossy(&s[a..b]).into_owned()
        } else {
            let mut v = s[a..].to_vec();
            v.extend_from_slice(&s[..b]);
            String::from_utf8_lossy(&v).into_owned()
        }
    };

    let mut frags = Vec::new();
    if cuts.is_empty() {
        frags.push(Fragment {
            seq: String::from_utf8_lossy(s).into_owned(),
            left: blunt(),
            right: blunt(),
        });
        return frags;
    }
    if circular {
        if cuts.len() == 1 {
            // a single cut linearizes the circle into one full-length fragment
            let (p, i) = cuts[0];
            let mut v = s[p..].to_vec();
            v.extend_from_slice(&s[..p]);
            frags.push(Fragment {
                seq: String::from_utf8_lossy(&v).into_owned(),
                left: end_of(i),
                right: end_of(i),
            });
        } else {
            for w in 0..cuts.len() {
                let (pa, ia) = cuts[w];
                let (pb, ib) = cuts[(w + 1) % cuts.len()];
                frags.push(Fragment {
                    seq: sub(pa, pb),
                    left: end_of(ia),
                    right: end_of(ib),
                });
            }
        }
    } else {
        // leading blunt piece
        frags.push(Fragment {
            seq: sub(0, cuts[0].0),
            left: blunt(),
            right: end_of(cuts[0].1),
        });
        for w in cuts.windows(2) {
            frags.push(Fragment {
                seq: sub(w[0].0, w[1].0),
                left: end_of(w[0].1),
                right: end_of(w[1].1),
            });
        }
        // trailing blunt piece
        let last = cuts[cuts.len() - 1];
        frags.push(Fragment {
            seq: sub(last.0, n),
            left: end_of(last.1),
            right: blunt(),
        });
    }
    frags
}

fn rev_frag(f: &Fragment) -> Fragment {
    // Reverse-complementing a fragment swaps and flips its ends. Overhang type
    // is preserved (5' stays 5'); palindromic overhangs are their own revcomp.
    Fragment {
        seq: revcomp(&f.seq),
        left: f.right.clone(),
        right: f.left.clone(),
    }
}

fn end_json(e: &(String, String)) -> String {
    format!("{{\"type\":{},\"overhang\":{}}}", jstr(&e.0), jstr(&e.1))
}

/// Simulate a directional/standard clone: cut a vector and an insert with the
/// same enzyme set, pick the backbone and the insert fragment, and report the
/// recombinant circle(s) formed by ligating compatible ends.
pub fn op_clone(
    vector: &str,
    insert: &str,
    enzymes_csv: &str,
    vector_circular: bool,
    insert_circular: bool,
) -> String {
    let vs = clean(vector);
    let is = clean(insert);
    let enz_idxs: Vec<usize> = enzymes_csv
        .split(',')
        .map(|x| x.trim())
        .filter(|x| !x.is_empty())
        .filter_map(|name| ENZYMES.iter().position(|e| e.0.eq_ignore_ascii_case(name)))
        .collect();

    let vfrags = fragmentize(&vs, &enz_idxs, vector_circular);
    let ifrags = fragmentize(&is, &enz_idxs, insert_circular);

    // Backbone = largest vector fragment with at least one cut (non-blunt) end.
    let backbone = vfrags
        .iter()
        .filter(|f| f.left.0 != "blunt" || f.right.0 != "blunt")
        .max_by_key(|f| f.seq.len())
        .or_else(|| vfrags.iter().max_by_key(|f| f.seq.len()));
    // Insert = largest fragment whose BOTH ends are sticky (a clonable cassette),
    // else the largest fragment.
    let ins = ifrags
        .iter()
        .filter(|f| f.left.0 != "blunt" && f.right.0 != "blunt")
        .max_by_key(|f| f.seq.len())
        .or_else(|| ifrags.iter().max_by_key(|f| f.seq.len()));

    let (bb, ins) = match (backbone, ins) {
        (Some(b), Some(i)) => (b, i),
        _ => return "{\"error\":\"could not isolate backbone/insert\"}".to_string(),
    };

    // Try both insert orientations; a circle forms when both junctions ligate:
    //   backbone.right -- insert.left   AND   insert.right -- backbone.left
    let mut products: Vec<(String, usize, bool, String)> = Vec::new(); // (orientation, len, sticky, seq)
    for (label, cand) in [("forward", ins.clone()), ("reverse", rev_frag(ins))] {
        let j1 = compatible(&bb.right, &cand.left);
        let j2 = compatible(&cand.right, &bb.left);
        if j1 && j2 {
            let seq = format!("{}{}", bb.seq, cand.seq); // circular: starts at backbone
            let sticky = bb.right.0 != "blunt" && bb.left.0 != "blunt";
            products.push((label.to_string(), seq.len(), sticky, seq));
        }
    }
    // de-dup identical-length blunt symmetric products
    if products.len() == 2 && products[0].1 == products[1].1 && !products[0].2 {
        products.truncate(1);
    }

    let prod_json = products
        .iter()
        .map(|(o, l, s, seq)| {
            format!(
                "{{\"orientation\":{},\"length\":{},\"directional\":{},\"seq\":{}}}",
                jstr(o),
                l,
                s,
                jstr(seq)
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    format!(
        "{{\"vectorLen\":{},\"insertLen\":{},\"backboneLen\":{},\"backboneEnds\":[{},{}],\
         \"cassetteLen\":{},\"cassetteEnds\":[{},{}],\"products\":[{}]}}",
        vs.len(),
        is.len(),
        bb.seq.len(),
        end_json(&bb.left),
        end_json(&bb.right),
        ins.seq.len(),
        end_json(&ins.left),
        end_json(&ins.right),
        prod_json
    )
}

// ---------------------------------------------------------------------------
// wasm entry points (single `|`-delimited string arg each)
// ---------------------------------------------------------------------------

macro_rules! read {
    ($ptr:ident, $len:ident) => {
        unsafe { input($ptr, $len) }
    };
}

#[no_mangle]
pub extern "C" fn revcomp_w(ptr: *const u8, len: usize) -> u64 {
    let s = read!(ptr, len);
    out(revcomp(&String::from_utf8_lossy(&clean(&s))))
}

#[no_mangle]
pub extern "C" fn translate_w(ptr: *const u8, len: usize) -> u64 {
    // "FRAME|SEQ"
    let s = read!(ptr, len);
    let (frame, seq) = s.split_once('|').unwrap_or(("1", s.as_str()));
    out(translate(seq, frame.trim().parse().unwrap_or(1)))
}

#[no_mangle]
pub extern "C" fn restriction_w(ptr: *const u8, len: usize) -> u64 {
    // "CIRC|SEQ"
    let s = read!(ptr, len);
    let (c, seq) = s.split_once('|').unwrap_or(("0", s.as_str()));
    out(op_restriction(seq, c.trim() == "1"))
}

#[no_mangle]
pub extern "C" fn digest_w(ptr: *const u8, len: usize) -> u64 {
    // "CIRC|ENZ1,ENZ2|SEQ"
    let s = read!(ptr, len);
    let mut it = s.splitn(3, '|');
    let c = it.next().unwrap_or("0");
    let enz = it.next().unwrap_or("");
    let seq = it.next().unwrap_or("");
    out(op_digest(seq, enz, c.trim() == "1"))
}

#[no_mangle]
pub extern "C" fn pcr_w(ptr: *const u8, len: usize) -> u64 {
    // "CIRC|FWD|REV|SEQ"
    let s = read!(ptr, len);
    let mut it = s.splitn(4, '|');
    let c = it.next().unwrap_or("0");
    let fwd = it.next().unwrap_or("");
    let rev = it.next().unwrap_or("");
    let seq = it.next().unwrap_or("");
    out(op_pcr(seq, fwd, rev, c.trim() == "1"))
}

#[no_mangle]
pub extern "C" fn orfs_w(ptr: *const u8, len: usize) -> u64 {
    // "MINAA|SEQ"
    let s = read!(ptr, len);
    let (m, seq) = s.split_once('|').unwrap_or(("30", s.as_str()));
    out(op_orfs(seq, m.trim().parse().unwrap_or(30)))
}

#[no_mangle]
pub extern "C" fn clone_w(ptr: *const u8, len: usize) -> u64 {
    // "VCIRC|ICIRC|ENZ1,ENZ2|VECTOR|INSERT"
    let s = read!(ptr, len);
    let mut it = s.splitn(5, '|');
    let vc = it.next().unwrap_or("1");
    let ic = it.next().unwrap_or("0");
    let enz = it.next().unwrap_or("");
    let vector = it.next().unwrap_or("");
    let insert = it.next().unwrap_or("");
    out(op_clone(vector, insert, enz, vc.trim() == "1", ic.trim() == "1"))
}

#[no_mangle]
pub extern "C" fn tm_w(ptr: *const u8, len: usize) -> u64 {
    // "DNA_nM|NA_mM|SEQ"
    let s = read!(ptr, len);
    let mut it = s.splitn(3, '|');
    let dna = it.next().unwrap_or("50").trim().parse().unwrap_or(50.0);
    let na = it.next().unwrap_or("50").trim().parse().unwrap_or(50.0);
    let seq = it.next().unwrap_or("");
    let tm = tm_santalucia(seq, dna, na);
    // JSON so JS gets a clean null for invalid input
    out(match tm {
        Some(t) => format!("{{\"tm\":{:.4},\"len\":{}}}", t, clean(seq).len()),
        None => "{\"tm\":null}".to_string(),
    })
}

#[no_mangle]
pub extern "C" fn design_w(ptr: *const u8, len: usize) -> u64 {
    // "START|END|TARGET_TM|NA_mM|DNA_nM|MIN_LEN|MAX_LEN|TEMPLATE"
    let s = read!(ptr, len);
    let mut it = s.splitn(8, '|');
    let start = it.next().unwrap_or("0").trim().parse().unwrap_or(0);
    let end = it.next().unwrap_or("0").trim().parse().unwrap_or(0);
    let ttm = it.next().unwrap_or("60").trim().parse().unwrap_or(60.0);
    let na = it.next().unwrap_or("50").trim().parse().unwrap_or(50.0);
    let dna = it.next().unwrap_or("50").trim().parse().unwrap_or(50.0);
    let minl = it.next().unwrap_or("18").trim().parse().unwrap_or(18);
    let maxl = it.next().unwrap_or("28").trim().parse().unwrap_or(28);
    let template = it.next().unwrap_or("");
    out(op_design(template, start, end, ttm, na, dna, minl, maxl))
}

#[no_mangle]
pub extern "C" fn score_w(ptr: *const u8, len: usize) -> u64 {
    // "TARGET_TM|NA_mM|DNA_nM|SEQ" -> the same primer metrics op_design uses
    let s = read!(ptr, len);
    let mut it = s.splitn(4, '|');
    let ttm = it.next().unwrap_or("60").trim().parse().unwrap_or(60.0);
    let na = it.next().unwrap_or("50").trim().parse().unwrap_or(50.0);
    let dna = it.next().unwrap_or("50").trim().parse().unwrap_or(50.0);
    let seq = clean(it.next().unwrap_or(""));
    out(match score_primer(&seq, ttm, na, dna) {
        Some(p) => primer_json(&p),
        None => "{\"error\":\"invalid\"}".to_string(),
    })
}

#[no_mangle]
pub extern "C" fn breed_w(ptr: *const u8, len: usize) -> u64 {
    // "GOALS|OFFSPRING|MUTRATE|SEED|SEQ"
    let s = read!(ptr, len);
    let mut it = s.splitn(5, '|');
    let goals = it.next().unwrap_or("");
    let off = it.next().unwrap_or("12").trim().parse().unwrap_or(12);
    let rate = it.next().unwrap_or("2").trim().parse().unwrap_or(2);
    let seed = it.next().unwrap_or("1").trim().parse().unwrap_or(1u64);
    let seq = it.next().unwrap_or("");
    out(op_breed(seq, goals, off, rate, seed))
}

#[no_mangle]
pub extern "C" fn fitness_w(ptr: *const u8, len: usize) -> u64 {
    // "GOALS|SEQ"
    let s = read!(ptr, len);
    let (goals, seq) = s.split_once('|').unwrap_or(("", s.as_str()));
    out(op_fitness(seq, goals))
}

#[no_mangle]
pub extern "C" fn gel_w(ptr: *const u8, len: usize) -> u64 {
    // "VOLTAGE|AGAROSE_PCT|MINUTES|GEL_LEN_CM|FRAGS_CSV"
    let s = read!(ptr, len);
    let mut it = s.splitn(5, '|');
    let v = it.next().unwrap_or("100").trim().parse().unwrap_or(100.0);
    let a = it.next().unwrap_or("1.0").trim().parse().unwrap_or(1.0);
    let m = it.next().unwrap_or("45").trim().parse().unwrap_or(45.0);
    let gl = it.next().unwrap_or("8").trim().parse().unwrap_or(8.0);
    let frags = it.next().unwrap_or("");
    out(op_gel(v, a, m, gl, frags))
}

// ---------------------------------------------------------------------------
// host-side tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revcomp_basic() {
        assert_eq!(revcomp("ATGC"), "GCAT");
        assert_eq!(revcomp("AAATTTGGGCCC"), "GGGCCCAAATTT");
    }

    #[test]
    fn translate_basic() {
        // ATG AAA TAA -> M K *
        assert_eq!(translate("ATGAAATAA", 1), "MK*");
        // reverse frame of TTA TTT CAT (revcomp = ATG AAA TAA) -> M K *
        assert_eq!(translate("TTATTTCAT", -1), "MK*");
    }

    #[test]
    fn restriction_finds_ecori() {
        // single EcoRI site GAATTC at index 3
        let r = op_restriction("AAAGAATTCAAA", false);
        assert!(r.contains("\"name\":\"EcoRI\""));
        assert!(r.contains("\"count\":1"));
        // cut after G -> position 4
        assert!(r.contains("\"cuts\":[4]"));
    }

    #[test]
    fn digest_linear_two_fragments() {
        // one EcoRI cut in a 12 bp linear molecule -> fragments 4 and 8
        let d = op_digest("AAAGAATTCAAA", "EcoRI", false);
        assert!(d.contains("\"cuts\":1"));
        assert!(d.contains("\"fragments\":[8,4]"));
    }

    #[test]
    fn digest_circular_one_cut_linearizes() {
        // single cut on a circle -> one full-length fragment
        let d = op_digest("AAAGAATTCAAA", "EcoRI", true);
        assert!(d.contains("\"cuts\":1"));
        assert!(d.contains("\"fragments\":[12]"));
    }

    #[test]
    fn pcr_amplifies_region() {
        //  template:   [FWD........]            revcomp(REV) near end
        //  fwd binds at 0, rev (revcomp) ends at 20 -> 20 bp product
        let tmpl = "ATGCGTACGTTAGCTAGCTAGGGGGGCCCCCC";
        let fwd = "ATGCGTACG"; // top strand, starts at 0
        // revcomp(rev) = "GCTAGCTAG" occurs at index 12 (len 9) -> ends at 21
        let rev = revcomp("GCTAGCTAG");
        let p = op_pcr(tmpl, fwd, &rev, false);
        assert!(p.contains("\"products\":[{"), "got {p}");
        assert!(p.contains("\"start\":0"));
        assert!(p.contains("\"length\":21"), "got {p}");
    }

    #[test]
    fn orfs_finds_one() {
        // ATG ... TAA, 4 codons incl stop -> aa=3
        let o = op_orfs("CCCATGAAAGGGTAACCC", 1);
        assert!(o.contains("\"orfs\":[{"));
        assert!(o.contains("\"aa\":3"));
    }

    #[test]
    fn tm_matches_primer3_oligotm() {
        // Reference values from primer3's oligotm() (santalucia_auto +
        // santalucia salt), Na+=50 mM, DNA=50 nM, divalent=0, dNTP=0.
        // Our clean-room implementation must match to <0.01 °C.
        let cases = [
            ("GTAAAACGACGGCCAGT", 49.1681), // M13-F
            ("CAGGAAACAGCTATGAC", 43.6040), // M13-R
            ("ATGCGTACGTTAGCTAGCTAG", 51.7666),
            ("GGGGCCCCGGGGCCCC", 65.7962),
            ("GAATTC", -20.4360), // symmetric (palindrome)
            ("AAAAAAAAAAAAAAAA", 28.5759),
            ("ATGCGTACG", 21.6558),
        ];
        for (seq, expect) in cases {
            let got = tm_santalucia(seq, 50.0, 50.0).unwrap();
            assert!(
                (got - expect).abs() < 0.01,
                "{seq}: got {got:.4}, expected {expect:.4}"
            );
        }
    }

    #[test]
    fn tm_rejects_bad_input() {
        assert!(tm_santalucia("A", 50.0, 50.0).is_none()); // too short
        assert!(tm_santalucia("ATGCN", 50.0, 50.0).is_none()); // non-ACGT
    }

    #[test]
    fn design_primers_amplify_region() {
        // a GC-balanced template; design to amplify [40..160], target Tm 60
        let mut t = String::new();
        let units = ["ATGCGTACGT", "GCTAGCATGC", "TTGGCCAATG", "ACGTACGTGC"];
        for i in 0..30 {
            t.push_str(units[i % units.len()]);
        }
        let r = op_design(&t, 40, 160, 60.0, 50.0, 50.0, 18, 28);
        assert!(r.contains("\"fwd\""), "got {r}");
        assert!(!r.contains("\"error\""), "got {r}");
        // extract the two primer seqs and confirm they amplify via op_pcr
        let fwd = extract_seq(&r, "\"fwd\":{\"seq\":\"");
        let rev = extract_seq(&r, "\"rev\":{\"seq\":\"");
        assert!(fwd.len() >= 18 && rev.len() >= 18);
        let pcr = op_pcr(&t, &fwd, &rev, false);
        assert!(pcr.contains("\"products\":[{"), "primers must amplify: {pcr}");
    }

    // tiny helper: pull the string after a marker up to the next quote
    fn extract_seq(json: &str, marker: &str) -> String {
        let i = json.find(marker).unwrap() + marker.len();
        let rest = &json[i..];
        let j = rest.find('"').unwrap();
        rest[..j].to_string()
    }

    #[test]
    fn overhangs_are_correct() {
        // EcoRI GAATTC -> 5' AATT ; PstI CTGCAG -> 3' TGCA ; SmaI -> blunt
        assert_eq!(overhang("GAATTC", 1, 5), ("5'", "AATT".to_string()));
        assert_eq!(overhang("CTGCAG", 5, 1), ("3'", "TGCA".to_string()));
        assert_eq!(overhang("CCCGGG", 3, 3), ("blunt", "".to_string()));
    }

    #[test]
    fn clone_directional_single_product() {
        // vector (circular) with one EcoRI + one HindIII; insert (linear) with
        // an EcoRI...HindIII cassette. Distinct enzymes -> one directional product.
        let vector = "TTTTGAATTCTTTTTTTTTTTTAAGCTTTTTT"; // GAATTC@4, AAGCTT@22
        let insert = "CCGAATTCGGGGGGGGGGAAGCTTGG"; // GAATTC@2, AAGCTT@18
        let r = op_clone(vector, insert, "EcoRI,HindIII", true, false);
        // backbone(18) + cassette(16) = 34, exactly one product, directional
        assert!(r.contains("\"products\":[{"), "got {r}");
        assert_eq!(r.matches("\"orientation\"").count(), 1, "got {r}");
        assert!(r.contains("\"length\":34"), "got {r}");
        assert!(r.contains("\"directional\":true"), "got {r}");
    }

    #[test]
    fn clone_single_enzyme_two_orientations() {
        // single enzyme on both ends -> insert can ligate in two orientations
        let vector = "TTTTGAATTCTTTTTTTTTT"; // one EcoRI, circular -> linearized backbone
        let insert = "CCGAATTCGGGGGGAATTCGG"; // EcoRI...EcoRI cassette
        let r = op_clone(vector, insert, "EcoRI", true, false);
        assert_eq!(r.matches("\"orientation\"").count(), 2, "got {r}");
    }

    #[test]
    fn evolution_preserves_protein() {
        // synonymous mutations must never change the translated protein
        let seq = "ATGGCTAGCAAAGGGCTGGTTACCGAACGTGAT"; // arbitrary ORF
        let prot0 = translate_frame(&clean(seq), 0);
        let mut rng = 12345u64;
        let mutant = mutate_synonymous(&clean(seq), 30, &mut rng);
        assert_eq!(translate_frame(&mutant, 0), prot0, "protein changed!");
        // and at least some bases differed
        assert_ne!(mutant, clean(seq));
    }

    #[test]
    fn evolution_improves_fitness() {
        // breeding toward a GC target should raise the best fitness vs parent
        // over a few rounds (greedy: keep the best each round).
        let mut seq = "ATGGCTAGCAAAGGGCTGGTTACCGAACGTGATAAACCGTTT".to_string();
        let goals = "gc:65,codon";
        let parsed = parse_goals(goals);
        let f0 = fitness(&clean(&seq), &parsed);
        let mut seed = 7u64;
        for _ in 0..8 {
            let r = op_breed(&seq, goals, 20, 3, seed);
            // pull the best sequence out of the population JSON
            let best = extract_seq(&r, "\"population\":[{\"seq\":\"");
            seq = best;
            seed = seed.wrapping_add(101);
        }
        let f1 = fitness(&clean(&seq), &parsed);
        assert!(f1 > f0, "fitness did not improve: {f0} -> {f1}");
    }

    #[test]
    fn evolution_nosite_goal() {
        // a sequence containing EcoRI; the NoSite term should be < 1
        let withsite = "ATGGAATTCAAA"; // GAATTC present
        let g = parse_goals("nosite:GAATTC");
        assert!(goal_term(&g[0], &clean(withsite)) < 1.0);
        let clean_seq = "ATGAAACCCGGG"; // no GAATTC
        assert_eq!(goal_term(&g[0], &clean(clean_seq)), 1.0);
    }

    #[test]
    fn gel_larger_runs_slower() {
        let small = gel_fraction(500.0, "lin", 1.0, 100.0, 45.0, 8.0);
        let big = gel_fraction(5000.0, "lin", 1.0, 100.0, 45.0, 8.0);
        assert!(small > big, "500bp ({small}) should outrun 5000bp ({big})");
    }

    #[test]
    fn gel_topology_order() {
        // same plasmid size: supercoiled ahead of linear ahead of nicked
        let sc = gel_fraction(3000.0, "sc", 1.0, 100.0, 45.0, 8.0);
        let lin = gel_fraction(3000.0, "lin", 1.0, 100.0, 45.0, 8.0);
        let nick = gel_fraction(3000.0, "nick", 1.0, 100.0, 45.0, 8.0);
        assert!(sc > lin && lin > nick, "expected sc>lin>nick, got {sc}/{lin}/{nick}");
    }

    #[test]
    fn gel_voltage_and_runoff() {
        let lo = gel_fraction(1000.0, "lin", 1.0, 80.0, 45.0, 8.0);
        let hi = gel_fraction(1000.0, "lin", 1.0, 160.0, 45.0, 8.0);
        assert!(hi > lo);
        let r = op_gel(300.0, 1.0, 90.0, 8.0, "100");
        assert!(r.contains("\"ranOff\":true"), "tiny band should run off: {r}");
    }

    #[test]
    fn gel_calibration_sane() {
        let f1k = gel_fraction(1000.0, "lin", 1.0, 100.0, 45.0, 8.0);
        let f10k = gel_fraction(10000.0, "lin", 1.0, 100.0, 45.0, 8.0);
        assert!(f1k > 0.45 && f1k < 0.80, "1kb at {f1k}");
        assert!(f10k < 0.25, "10kb at {f10k}");
    }
}
