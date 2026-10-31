//! bzncd — the engine behind henderhead.mino.mobi/bzip/.
//!
//! After Matt Henderson's "Which Pokémon does a compression algorithm think
//! are most similar?" (2026-10-19). Two things live here:
//!
//!   * `bzip2` — a compressor written to the reference algorithm, so that
//!     "bzip thinks" means what it says. The tests decompress its output with
//!     the system `bzip2` and compare its lengths with `bzip2 -9`'s.
//!   * the normalized compression distance (Cilibrasi & Vitányi) over a set
//!     of byte strings, computed a slice at a time so the page can draw while
//!     it fills in:
//!
//! ```text
//!     NCD(x, y) = (C(xy) − min(C(x), C(y))) / max(C(x), C(y))
//! ```
//!
//!     C is the compressed length in bytes. C(xy) is not C(yx) — the
//!     concatenation has an order — and the engine can compute either one
//!     order or both and keep the smaller, which is the usual symmetrisation.
//!
//! Same build as the other engines on this site: a plain cdylib for
//! wasm32-unknown-unknown, no wasm-bindgen, no imports. Every pointer returned
//! is invalidated by the next call that can grow a buffer; read before you
//! call again.

pub mod bzip2;

#[cfg(test)]
mod tests;

pub struct Set {
    pub items: Vec<Vec<u8>>,
    pub single: Vec<u32>,
    /// N×N, row-major. NaN until computed; the diagonal stays NaN.
    pub ncd: Vec<f32>,
    /// Concatenation lengths, N×N: `cat[i*n+j]` is C(x_i x_j).
    pub cat: Vec<u32>,
    both: bool,
    /// The next unordered pair (i < j) to compute.
    next_i: usize,
    next_j: usize,
    done_pairs: usize,
    scratch: Vec<u8>,
}

impl Set {
    pub fn new(items: Vec<Vec<u8>>, both_orders: bool) -> Set {
        let n = items.len();
        let single = items.iter().map(|x| bzip2::compressed_len(x) as u32).collect();
        Set {
            items,
            single,
            ncd: vec![f32::NAN; n * n],
            cat: vec![0; n * n],
            both: both_orders,
            next_i: 0,
            next_j: 1,
            done_pairs: 0,
            scratch: Vec::new(),
        }
    }

    pub fn n(&self) -> usize {
        self.items.len()
    }

    pub fn total_pairs(&self) -> usize {
        let n = self.n();
        n * n.saturating_sub(1) / 2
    }

    pub fn done_pairs(&self) -> usize {
        self.done_pairs
    }

    fn cat_len(&mut self, i: usize, j: usize) -> u32 {
        self.scratch.clear();
        self.scratch.extend_from_slice(&self.items[i]);
        self.scratch.extend_from_slice(&self.items[j]);
        bzip2::compressed_len(&self.scratch) as u32
    }

    /// Compute up to `budget` more unordered pairs. Returns how many pairs
    /// are now done in total.
    pub fn step(&mut self, budget: usize) -> usize {
        let n = self.n();
        let mut left = budget;
        while left > 0 && self.next_i + 1 < n {
            let (i, j) = (self.next_i, self.next_j);
            let ij = self.cat_len(i, j);
            self.cat[i * n + j] = ij;
            let c = if self.both {
                let ji = self.cat_len(j, i);
                self.cat[j * n + i] = ji;
                ij.min(ji)
            } else {
                self.cat[j * n + i] = ij;
                ij
            };
            let d = ncd(self.single[i], self.single[j], c);
            self.ncd[i * n + j] = d;
            self.ncd[j * n + i] = d;
            self.done_pairs += 1;
            left -= 1;
            self.next_j += 1;
            if self.next_j >= n {
                self.next_i += 1;
                self.next_j = self.next_i + 1;
            }
        }
        self.done_pairs
    }

    /// NCD of an outside string against every item, without adding it.
    pub fn query(&mut self, probe: &[u8], both: bool) -> Vec<f32> {
        let cp = bzip2::compressed_len(probe) as u32;
        (0..self.n())
            .map(|i| {
                self.scratch.clear();
                self.scratch.extend_from_slice(probe);
                self.scratch.extend_from_slice(&self.items[i]);
                let mut c = bzip2::compressed_len(&self.scratch) as u32;
                if both {
                    self.scratch.clear();
                    self.scratch.extend_from_slice(&self.items[i]);
                    self.scratch.extend_from_slice(probe);
                    c = c.min(bzip2::compressed_len(&self.scratch) as u32);
                }
                ncd(cp, self.single[i], c)
            })
            .collect()
    }
}

pub fn ncd(cx: u32, cy: u32, cxy: u32) -> f32 {
    let (lo, hi) = (cx.min(cy) as f32, cx.max(cy) as f32);
    (cxy as f32 - lo) / hi
}

// ---------------------------------------------------------------- C ABI ----

static mut STAGE: Vec<u8> = Vec::new();
static mut PENDING: Vec<Vec<u8>> = Vec::new();
static mut SET: Option<Set> = None;
static mut OUT: Vec<u8> = Vec::new();
static mut QUERY: Vec<f32> = Vec::new();

#[allow(static_mut_refs)]
fn stage() -> &'static mut Vec<u8> {
    unsafe { &mut STAGE }
}
#[allow(static_mut_refs)]
fn set() -> &'static mut Set {
    unsafe { SET.as_mut().expect("set_build first") }
}

/// A staging buffer of `len` bytes for the page to write into.
#[no_mangle]
pub extern "C" fn stage_ptr(len: usize) -> *mut u8 {
    let s = stage();
    s.clear();
    s.resize(len, 0);
    s.as_mut_ptr()
}

/// Append the staged bytes as the next item of the set being assembled.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn item_push() {
    unsafe { PENDING.push(STAGE.clone()) }
}

/// Close the set being assembled and compress every item alone. `both`
/// non-zero computes C(xy) and C(yx) and keeps the smaller.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn set_build(both: u32) -> usize {
    unsafe {
        let items = core::mem::take(&mut PENDING);
        SET = Some(Set::new(items, both != 0));
    }
    set().n()
}

#[no_mangle]
pub extern "C" fn set_step(budget: usize) -> usize {
    set().step(budget)
}
#[no_mangle]
pub extern "C" fn set_total_pairs() -> usize {
    set().total_pairs()
}
#[no_mangle]
pub extern "C" fn ncd_ptr() -> *const f32 {
    set().ncd.as_ptr()
}
#[no_mangle]
pub extern "C" fn single_ptr() -> *const u32 {
    set().single.as_ptr()
}
#[no_mangle]
pub extern "C" fn cat_ptr() -> *const u32 {
    set().cat.as_ptr()
}

/// NCD of the staged bytes against every item. Read with `query_ptr`.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn set_query(both: u32) -> *const f32 {
    let st = stage().clone();
    unsafe {
        QUERY = set().query(&st, both != 0);
        QUERY.as_ptr()
    }
}

/// bzip2 length of the staged bytes.
#[no_mangle]
pub extern "C" fn bz_len() -> usize {
    bzip2::compressed_len(stage())
}

/// Compress the staged bytes to a full .bz2 stream; returns its length,
/// read it from `out_ptr`.
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn bz_compress() -> usize {
    unsafe {
        OUT = bzip2::compress(&STAGE);
        OUT.len()
    }
}
#[no_mangle]
#[allow(static_mut_refs)]
pub extern "C" fn out_ptr() -> *const u8 {
    unsafe { OUT.as_ptr() }
}
