//! A bzip2 compressor, written to the reference implementation's algorithm.
//!
//! Not "a Burrows–Wheeler compressor in the spirit of bzip2": the output is a
//! real `.bz2` stream that the reference `bzip2 -d` decompresses, and its
//! length is the length `bzip2 -9` produces. The tests check both against the
//! system binary. That matters for the page, because the claim being rebuilt
//! is about what *bzip* thinks is similar — a compressor that is merely
//! similar would be answering a different question.
//!
//! The pipeline, in the reference's own order (compress.c, bzlib.c):
//!
//!   1. RLE1    runs of 4–255 equal bytes become four bytes and a count
//!   2. BWT     sort every rotation of the block, keep the last column
//!   3. MTF     move-to-front over the symbols actually used, with runs of
//!              zeros written in bijective base 2 as RUNA/RUNB
//!   4. Huffman 2–6 tables, one chosen per 50 symbols, refined four times
//!
//! Every choice in steps 3 and 4 that changes the output length — how the
//! initial tables are partitioned, the cost tie-break, the way an over-long
//! Huffman code is flattened — follows the reference exactly. Step 2 does not
//! need to: the BWT is a function of the block, however it is sorted. Only
//! the tie order of *identical* rotations can differ (a perfectly periodic
//! block), and that moves the 24-bit origin pointer, never the length.

/// The reference's largest block (level 9), counted after RLE1.
const BLOCK_MAX: usize = 100_000 * 9 - 19;
const G_SIZE: usize = 50;
const N_ITERS: usize = 4;
const MAX_CODE_LEN: u8 = 17;
const LESSER_ICOST: u8 = 0;
const GREATER_ICOST: u8 = 15;
const RUNA: u16 = 0;
const RUNB: u16 = 1;

/// The compressed length in bytes, without keeping the bytes.
pub fn compressed_len(data: &[u8]) -> usize {
    let mut w = BitWriter::counting();
    compress_into(data, &mut w);
    w.byte_len()
}

/// A complete `.bz2` stream.
pub fn compress(data: &[u8]) -> Vec<u8> {
    let mut w = BitWriter::new();
    compress_into(data, &mut w);
    w.finish()
}

fn compress_into(data: &[u8], w: &mut BitWriter) {
    w.bits(8, b'B' as u32);
    w.bits(8, b'Z' as u32);
    w.bits(8, b'h' as u32);
    w.bits(8, b'9' as u32);

    let mut combined: u32 = 0;
    for block in rle1_blocks(data) {
        combined = combined.rotate_left(1) ^ block.crc;
        write_block(&block, w);
    }

    // end-of-stream: sqrt(pi) in BCD, then the combined CRC
    for b in [0x17u32, 0x72, 0x45, 0x38, 0x50, 0x90] {
        w.bits(8, b);
    }
    w.bits(32, combined);
    w.flush_byte();
}

// ---------------------------------------------------------------- CRC ----

const fn crc_table() -> [u32; 256] {
    // bzip2's CRC is the MSB-first CRC-32 (poly 0x04c11db7), not zlib's
    let mut t = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = (i as u32) << 24;
        let mut k = 0;
        while k < 8 {
            c = if c & 0x8000_0000 != 0 { (c << 1) ^ 0x04c1_1db7 } else { c << 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}
static CRC: [u32; 256] = crc_table();

#[inline]
fn crc_update(crc: u32, b: u8) -> u32 {
    (crc << 8) ^ CRC[((crc >> 24) ^ b as u32) as usize]
}

// --------------------------------------------------------------- RLE1 ----

struct Block {
    /// After RLE1 — what the BWT sorts.
    data: Vec<u8>,
    in_use: [bool; 256],
    /// Over the original bytes.
    crc: u32,
}

/// The reference's `ADD_CHAR_TO_BLOCK`: a run of 1–255 equal bytes is
/// written as itself up to three bytes, and from four on as four bytes plus
/// (len − 4). A block closes once it holds `BLOCK_MAX` bytes; the check sits
/// between input bytes, so a run in flight is flushed into the block it
/// started in and the next block starts fresh.
fn rle1_blocks(data: &[u8]) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut cur = Block { data: Vec::new(), in_use: [false; 256], crc: 0xffff_ffff };
    let mut run_ch: Option<u8> = None;
    let mut run_len = 0usize;

    fn flush(b: &mut Block, ch: u8, len: usize) {
        for _ in 0..len {
            b.crc = crc_update(b.crc, ch);
        }
        b.in_use[ch as usize] = true;
        match len {
            1..=3 => b.data.extend(core::iter::repeat(ch).take(len)),
            _ => {
                b.data.extend([ch, ch, ch, ch]);
                b.data.push((len - 4) as u8);
                b.in_use[len - 4] = true;
            }
        }
    }

    for &c in data {
        if cur.data.len() >= BLOCK_MAX {
            if let Some(ch) = run_ch.take() {
                flush(&mut cur, ch, run_len);
            }
            cur.crc = !cur.crc;
            blocks.push(core::mem::replace(
                &mut cur,
                Block { data: Vec::new(), in_use: [false; 256], crc: 0xffff_ffff },
            ));
        }
        match run_ch {
            Some(ch) if ch == c && run_len < 255 => run_len += 1,
            Some(ch) => {
                flush(&mut cur, ch, run_len);
                run_ch = Some(c);
                run_len = 1;
            }
            None => {
                run_ch = Some(c);
                run_len = 1;
            }
        }
    }
    if let Some(ch) = run_ch {
        flush(&mut cur, ch, run_len);
    }
    if !cur.data.is_empty() {
        cur.crc = !cur.crc;
        blocks.push(cur);
    }
    blocks
}

// ---------------------------------------------------------------- BWT ----

/// Indices of the block's rotations in sorted order.
///
/// Prefix doubling over cyclic shifts with counting sorts: O(n log n), and
/// indifferent to the long runs that make a comparison sort of rotations
/// quadratic — which sprite data, mostly background, is full of.
pub fn sort_rotations(s: &[u8]) -> Vec<u32> {
    let n = s.len();
    let mut p = vec![0u32; n];
    let mut c = vec![0u32; n];
    if n == 0 {
        return p;
    }
    let mut cnt = vec![0u32; 256.max(n)];
    for &b in s {
        cnt[b as usize] += 1;
    }
    for i in 1..256 {
        cnt[i] += cnt[i - 1];
    }
    for i in (0..n).rev() {
        cnt[s[i] as usize] -= 1;
        p[cnt[s[i] as usize] as usize] = i as u32;
    }
    let mut classes = 1u32;
    c[p[0] as usize] = 0;
    for i in 1..n {
        if s[p[i] as usize] != s[p[i - 1] as usize] {
            classes += 1;
        }
        c[p[i] as usize] = classes - 1;
    }

    let mut pn = vec![0u32; n];
    let mut cn = vec![0u32; n];
    let mut h = 1usize;
    while h < n && (classes as usize) < n {
        for i in 0..n {
            pn[i] = ((p[i] as usize + n - h) % n) as u32;
        }
        for x in cnt[..classes as usize].iter_mut() {
            *x = 0;
        }
        for i in 0..n {
            cnt[c[pn[i] as usize] as usize] += 1;
        }
        for i in 1..classes as usize {
            cnt[i] += cnt[i - 1];
        }
        for i in (0..n).rev() {
            let k = c[pn[i] as usize] as usize;
            cnt[k] -= 1;
            p[cnt[k] as usize] = pn[i];
        }
        cn[p[0] as usize] = 0;
        classes = 1;
        for i in 1..n {
            let a = (c[p[i] as usize], c[(p[i] as usize + h) % n]);
            let b = (c[p[i - 1] as usize], c[(p[i - 1] as usize + h) % n]);
            if a != b {
                classes += 1;
            }
            cn[p[i] as usize] = classes - 1;
        }
        core::mem::swap(&mut c, &mut cn);
        h <<= 1;
    }
    p
}

// ------------------------------------------------------------ MTF/RLE2 ----

/// `generateMTFValues`: the last column, move-to-front coded over the
/// symbols in use, zero runs as RUNA/RUNB, then EOB. Returns the values, the
/// alphabet size (symbols in use + 2) and their frequencies.
fn mtf_values(block: &[u8], ptr: &[u32], in_use: &[bool; 256]) -> (Vec<u16>, usize, Vec<u32>) {
    let n = block.len();
    let mut unseq = [0u8; 256];
    let mut n_in_use = 0usize;
    for i in 0..256 {
        if in_use[i] {
            unseq[i] = n_in_use as u8;
            n_in_use += 1;
        }
    }
    let eob = n_in_use + 1;
    let alpha = n_in_use + 2;
    let mut freq = vec![0u32; alpha];
    let mut out = Vec::with_capacity(n + 1);
    let mut yy: Vec<u8> = (0..n_in_use).map(|i| i as u8).collect();
    let mut z_pend = 0u32;

    let flush = |z: &mut u32, out: &mut Vec<u16>, freq: &mut Vec<u32>| {
        if *z == 0 {
            return;
        }
        *z -= 1;
        loop {
            let sym = if *z & 1 == 1 { RUNB } else { RUNA };
            out.push(sym);
            freq[sym as usize] += 1;
            if *z < 2 {
                break;
            }
            *z = (*z - 2) / 2;
        }
        *z = 0;
    };

    for &p in ptr {
        let j = if p == 0 { n - 1 } else { p as usize - 1 };
        let ll = unseq[block[j] as usize];
        if yy[0] == ll {
            z_pend += 1;
            continue;
        }
        flush(&mut z_pend, &mut out, &mut freq);
        let pos = yy.iter().position(|&v| v == ll).unwrap();
        yy.copy_within(0..pos, 1);
        yy[0] = ll;
        out.push(pos as u16 + 1);
        freq[pos + 1] += 1;
    }
    flush(&mut z_pend, &mut out, &mut freq);
    out.push(eob as u16);
    freq[eob] += 1;
    (out, alpha, freq)
}

// ------------------------------------------------------------ Huffman ----

/// `BZ2_hbMakeCodeLengths`, including its peculiar weight packing (depth in
/// the low byte, so ties break toward shallower trees) and its answer to a
/// code that is too long: halve every frequency and start again.
pub fn make_code_lengths(freq: &[u32], max_len: u8) -> Vec<u8> {
    let alpha = freq.len();
    let mut len = vec![0u8; alpha];
    let mut heap = vec![0usize; alpha + 2];
    let mut weight = vec![0u32; alpha * 2 + 2];
    let mut parent = vec![0i32; alpha * 2 + 2];

    for i in 0..alpha {
        weight[i + 1] = (if freq[i] == 0 { 1 } else { freq[i] }) << 8;
    }

    let add = |a: u32, b: u32| ((a & 0xffff_ff00) + (b & 0xffff_ff00)) | (1 + (a & 0xff).max(b & 0xff));

    loop {
        let mut n_nodes = alpha;
        let mut n_heap = 0usize;
        heap[0] = 0;
        weight[0] = 0;
        parent[0] = -2;

        let up = |heap: &mut [usize], weight: &[u32], z: usize| {
            let mut zz = z;
            let tmp = heap[zz];
            while weight[tmp] < weight[heap[zz >> 1]] {
                heap[zz] = heap[zz >> 1];
                zz >>= 1;
            }
            heap[zz] = tmp;
        };
        let down = |heap: &mut [usize], weight: &[u32], n_heap: usize, z: usize| {
            let mut zz = z;
            let tmp = heap[zz];
            loop {
                let mut yy = zz << 1;
                if yy > n_heap {
                    break;
                }
                if yy < n_heap && weight[heap[yy + 1]] < weight[heap[yy]] {
                    yy += 1;
                }
                if weight[tmp] < weight[heap[yy]] {
                    break;
                }
                heap[zz] = heap[yy];
                zz = yy;
            }
            heap[zz] = tmp;
        };

        for i in 1..=alpha {
            parent[i] = -1;
            n_heap += 1;
            heap[n_heap] = i;
            up(&mut heap, &weight, n_heap);
        }
        while n_heap > 1 {
            let n1 = heap[1];
            heap[1] = heap[n_heap];
            n_heap -= 1;
            down(&mut heap, &weight, n_heap, 1);
            let n2 = heap[1];
            heap[1] = heap[n_heap];
            n_heap -= 1;
            down(&mut heap, &weight, n_heap, 1);
            n_nodes += 1;
            parent[n1] = n_nodes as i32;
            parent[n2] = n_nodes as i32;
            weight[n_nodes] = add(weight[n1], weight[n2]);
            parent[n_nodes] = -1;
            n_heap += 1;
            heap[n_heap] = n_nodes;
            up(&mut heap, &weight, n_heap);
        }

        let mut too_long = false;
        for i in 1..=alpha {
            let mut j = 0u8;
            let mut k = i;
            while parent[k] >= 0 {
                k = parent[k] as usize;
                j += 1;
            }
            len[i - 1] = j;
            if j > max_len {
                too_long = true;
            }
        }
        if !too_long {
            return len;
        }
        for i in 1..=alpha {
            let j = 1 + (weight[i] >> 8) / 2;
            weight[i] = j << 8;
        }
    }
}

fn assign_codes(len: &[u8]) -> Vec<u32> {
    let min = *len.iter().min().unwrap();
    let max = *len.iter().max().unwrap();
    let mut code = vec![0u32; len.len()];
    let mut v = 0u32;
    for n in min..=max {
        for (i, &l) in len.iter().enumerate() {
            if l == n {
                code[i] = v;
                v += 1;
            }
        }
        v <<= 1;
    }
    code
}

// -------------------------------------------------------------- block ----

fn write_block(block: &Block, w: &mut BitWriter) {
    let n = block.data.len();
    let ptr = sort_rotations(&block.data);
    let orig = ptr.iter().position(|&p| p == 0).unwrap() as u32;
    let (mtfv, alpha, freq) = mtf_values(&block.data, &ptr, &block.in_use);
    let n_mtf = mtfv.len();
    debug_assert!(n > 0);

    // block header: pi in BCD, the CRC, not randomised, the origin pointer
    for b in [0x31u32, 0x41, 0x59, 0x26, 0x53, 0x59] {
        w.bits(8, b);
    }
    w.bits(32, block.crc);
    w.bits(1, 0);
    w.bits(24, orig);

    let n_groups = match n_mtf {
        0..=199 => 2,
        200..=599 => 3,
        600..=1199 => 4,
        1200..=2399 => 5,
        _ => 6,
    };

    // initial tables: split the alphabet into n_groups bands of roughly
    // equal frequency, each table cheap inside its band
    let mut len = vec![vec![GREATER_ICOST; alpha]; n_groups];
    {
        let mut n_part = n_groups;
        let mut rem_f = n_mtf as i64;
        let mut gs: i64 = 0;
        while n_part > 0 {
            let t_freq = rem_f / n_part as i64;
            let mut ge = gs - 1;
            let mut a_freq: i64 = 0;
            while a_freq < t_freq && ge < alpha as i64 - 1 {
                ge += 1;
                a_freq += freq[ge as usize] as i64;
            }
            if ge > gs && n_part != n_groups && n_part != 1 && (n_groups - n_part) % 2 == 1 {
                a_freq -= freq[ge as usize] as i64;
                ge -= 1;
            }
            for v in 0..alpha as i64 {
                len[n_part - 1][v as usize] = if v >= gs && v <= ge { LESSER_ICOST } else { GREATER_ICOST };
            }
            n_part -= 1;
            gs = ge + 1;
            rem_f -= a_freq;
        }
    }

    // refine: pick the cheapest table per 50 symbols, refit every table to
    // the symbols it won, four times over
    let mut selectors: Vec<u8> = Vec::with_capacity(n_mtf / G_SIZE + 1);
    for _ in 0..N_ITERS {
        let mut rfreq = vec![vec![0u32; alpha]; n_groups];
        selectors.clear();
        let mut gs = 0;
        while gs < n_mtf {
            let ge = (gs + G_SIZE - 1).min(n_mtf - 1);
            let mut cost = [0u32; 6];
            for &v in &mtfv[gs..=ge] {
                for t in 0..n_groups {
                    cost[t] += len[t][v as usize] as u32;
                }
            }
            // the first strictly cheapest wins
            let mut bt = 0;
            for t in 1..n_groups {
                if cost[t] < cost[bt] {
                    bt = t;
                }
            }
            selectors.push(bt as u8);
            for &v in &mtfv[gs..=ge] {
                rfreq[bt][v as usize] += 1;
            }
            gs = ge + 1;
        }
        for t in 0..n_groups {
            len[t] = make_code_lengths(&rfreq[t], MAX_CODE_LEN);
        }
    }
    let codes: Vec<Vec<u32>> = len.iter().map(|l| assign_codes(l)).collect();

    // the symbol map: which 16-byte ranges are used, then which bytes
    let mut in_use16 = [false; 16];
    for i in 0..16 {
        in_use16[i] = block.in_use[i * 16..i * 16 + 16].iter().any(|&u| u);
    }
    for i in 0..16 {
        w.bits(1, in_use16[i] as u32);
    }
    for i in 0..16 {
        if in_use16[i] {
            for j in 0..16 {
                w.bits(1, block.in_use[i * 16 + j] as u32);
            }
        }
    }

    // selectors, themselves move-to-front coded and written in unary
    w.bits(3, n_groups as u32);
    w.bits(15, selectors.len() as u32);
    let mut pos: Vec<u8> = (0..n_groups as u8).collect();
    for &s in &selectors {
        let j = pos.iter().position(|&p| p == s).unwrap();
        pos.copy_within(0..j, 1);
        pos[0] = s;
        for _ in 0..j {
            w.bits(1, 1);
        }
        w.bits(1, 0);
    }

    // code lengths, delta coded
    for t in 0..n_groups {
        let mut curr = len[t][0] as i32;
        w.bits(5, curr as u32);
        for i in 0..alpha {
            let target = len[t][i] as i32;
            while curr < target {
                w.bits(2, 2);
                curr += 1;
            }
            while curr > target {
                w.bits(2, 3);
                curr -= 1;
            }
            w.bits(1, 0);
        }
    }

    // and the data
    for (g, &s) in selectors.iter().enumerate() {
        let gs = g * G_SIZE;
        let ge = (gs + G_SIZE).min(n_mtf);
        let (l, c) = (&len[s as usize], &codes[s as usize]);
        for &v in &mtfv[gs..ge] {
            w.bits(l[v as usize] as u32, c[v as usize]);
        }
    }
}

// ------------------------------------------------------------- bits ----

struct BitWriter {
    out: Option<Vec<u8>>,
    bytes: usize,
    buf: u64,
    live: u32,
}

impl BitWriter {
    fn new() -> Self {
        BitWriter { out: Some(Vec::new()), bytes: 0, buf: 0, live: 0 }
    }
    /// Counts what would be written without storing it.
    fn counting() -> Self {
        BitWriter { out: None, bytes: 0, buf: 0, live: 0 }
    }
    #[inline]
    fn bits(&mut self, n: u32, v: u32) {
        if n == 0 {
            return;
        }
        self.buf = (self.buf << n) | (v as u64 & ((1u64 << n) - 1));
        self.live += n;
        while self.live >= 8 {
            self.live -= 8;
            let b = (self.buf >> self.live) as u8;
            self.bytes += 1;
            if let Some(o) = self.out.as_mut() {
                o.push(b);
            }
        }
    }
    fn flush_byte(&mut self) {
        if self.live > 0 {
            let pad = 8 - self.live;
            self.bits(pad, 0);
        }
    }
    fn byte_len(&self) -> usize {
        self.bytes
    }
    fn finish(self) -> Vec<u8> {
        self.out.unwrap_or_default()
    }
}
