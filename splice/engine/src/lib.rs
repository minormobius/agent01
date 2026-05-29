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
// restriction enzymes (classic palindromic Type-II set)
// ---------------------------------------------------------------------------

/// (name, recognition site, top-strand cut offset from site start, blunt?)
/// All sites here are palindromic, so searching the forward strand suffices.
const ENZYMES: &[(&str, &str, usize, bool)] = &[
    ("EcoRI", "GAATTC", 1, false),
    ("BamHI", "GGATCC", 1, false),
    ("HindIII", "AAGCTT", 1, false),
    ("NotI", "GCGGCCGC", 2, false),
    ("XhoI", "CTCGAG", 1, false),
    ("SalI", "GTCGAC", 1, false),
    ("PstI", "CTGCAG", 5, false),
    ("SmaI", "CCCGGG", 3, true),
    ("KpnI", "GGTACC", 5, false),
    ("SacI", "GAGCTC", 5, false),
    ("XbaI", "TCTAGA", 1, false),
    ("SpeI", "ACTAGT", 1, false),
    ("NcoI", "CCATGG", 1, false),
    ("NdeI", "CATATG", 2, false),
    ("EcoRV", "GATATC", 3, true),
    ("HpaI", "GTTAAC", 3, true),
    ("NheI", "GCTAGC", 1, false),
    ("BglII", "AGATCT", 1, false),
    ("ClaI", "ATCGAT", 2, false),
    ("AvrII", "CCTAGG", 1, false),
    ("AflII", "CTTAAG", 1, false),
    ("BspEI", "TCCGGA", 1, false),
    ("AgeI", "ACCGGT", 1, false),
    ("MluI", "ACGCGT", 1, false),
    ("SphI", "GCATGC", 5, false),
    ("ApaI", "GGGCCC", 5, false),
    ("DraI", "TTTAAA", 3, true),
    ("ScaI", "AGTACT", 3, true),
    ("StuI", "AGGCCT", 3, true),
    ("PvuII", "CAGCTG", 3, true),
];

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
    start: usize,
    cut: usize,
    blunt: bool,
}

fn scan(seq: &[u8], circular: bool) -> Vec<Site> {
    let n = seq.len();
    let mut sites = Vec::new();
    for &(name, site, off, blunt) in ENZYMES {
        for start in find_all(seq, site.as_bytes(), circular) {
            sites.push(Site {
                enzyme: name,
                start,
                cut: (start + off) % n.max(1),
                blunt,
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
    for &(name, site, _off, blunt) in ENZYMES {
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
        out.push_str("{\"name\":");
        out.push_str(&jstr(name));
        out.push_str(",\"site\":");
        out.push_str(&jstr(site));
        out.push_str(",\"blunt\":");
        out.push_str(if blunt { "true" } else { "false" });
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
}
