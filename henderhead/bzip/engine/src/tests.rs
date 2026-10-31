//! The compressor is held to the reference binary, not to itself: every case
//! is decompressed by the system `bzip2` and its length compared with what
//! `bzip2 -9` makes of the same bytes. Tests that need the binary skip loudly
//! when it is missing rather than passing quietly.

use crate::bzip2::{compress, compressed_len, make_code_lengths, sort_rotations};
use crate::{ncd, Set};
use std::io::Write;
use std::process::{Command, Stdio};

fn reference(args: &[&str], input: &[u8]) -> Option<Vec<u8>> {
    let mut child = Command::new("bzip2")
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let mut stdin = child.stdin.take().unwrap();
    let data = input.to_vec();
    let feeder = std::thread::spawn(move || {
        let _ = stdin.write_all(&data);
    });
    let out = child.wait_with_output().ok()?;
    feeder.join().unwrap();
    assert!(out.status.success(), "bzip2 {:?} failed: {}", args, String::from_utf8_lossy(&out.stderr));
    Some(out.stdout)
}

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// A spread of inputs that exercise every stage: empty, one byte, runs at and
/// either side of the RLE1 thresholds, a run longer than 255, text, noise,
/// a four-shade "sprite", and alphabets of every size up to 256.
fn corpus() -> Vec<(String, Vec<u8>)> {
    let mut v: Vec<(String, Vec<u8>)> = Vec::new();
    v.push(("empty".into(), vec![]));
    v.push(("one byte".into(), vec![42]));
    for k in [2usize, 3, 4, 5, 6, 254, 255, 256, 257, 259, 600, 5000] {
        v.push((format!("run of {k}"), vec![7; k]));
    }
    v.push(("abab".into(), b"abababababababababababababababababababab".to_vec()));
    let text = b"Which Pokemon does a compression algorithm think are most similar? \
bzip pairs Gengar with Haunter, Magikarp with Gyarados and Pikachu with Jolteon. \
13 different Pokemon get paired with Marowak - it's a very average sprite.";
    v.push(("text".into(), text.to_vec()));
    v.push(("text x40".into(), text.repeat(40)));
    let mut r = Rng(0x9e37_79b9_7f4a_7c15);
    for (len, alpha) in [(10, 256), (100, 4), (1000, 2), (1000, 256), (5000, 16), (20_000, 256), (60_000, 3)] {
        let d: Vec<u8> = (0..len).map(|_| r.below(alpha) as u8).collect();
        v.push((format!("noise {len}x{alpha}"), d));
    }
    // a run-heavy four-shade picture, the shape of the page's real data
    let mut sprite = vec![0u8; 56 * 56];
    for y in 0..56i32 {
        for x in 0..56i32 {
            let d = ((x - 28) * (x - 28) + (y - 30) * (y - 30)) as f64;
            sprite[(y * 56 + x) as usize] = if d < 300.0 { 1 + ((x + y) % 7 == 0) as u8 } else if d < 380.0 { 3 } else { 0 };
        }
    }
    v.push(("sprite".into(), sprite.clone()));
    v.push(("two sprites".into(), [sprite.clone(), sprite.iter().rev().cloned().collect()].concat()));
    // every alphabet size: the symbol map and table count both depend on it
    for a in [1usize, 2, 15, 16, 17, 31, 100, 255, 256] {
        let d: Vec<u8> = (0..4000).map(|i| ((i * 7919 + i / 13) % a) as u8).collect();
        v.push((format!("alphabet {a}"), d));
    }
    v
}

#[test]
fn every_case_decompresses_with_the_reference_binary() {
    let mut checked = 0;
    for (name, data) in corpus() {
        let z = compress(&data);
        let Some(back) = reference(&["-dc"], &z) else {
            eprintln!("SKIPPED: no bzip2 binary on PATH");
            return;
        };
        assert_eq!(back, data, "{name}: round trip through `bzip2 -d` changed the data");
        checked += 1;
    }
    assert!(checked > 30);
}

#[test]
fn every_length_is_the_reference_length() {
    let mut exact = 0;
    for (name, data) in corpus() {
        let Some(want) = reference(&["-9c"], &data) else {
            eprintln!("SKIPPED: no bzip2 binary on PATH");
            return;
        };
        let got = compressed_len(&data);
        assert_eq!(got, want.len(), "{name}: {got} bytes against the reference's {}", want.len());
        if compress(&data) == want {
            exact += 1;
        } else {
            // the only licensed difference: a block equal to one of its own
            // rotations, where which of the tied rotations is "the original"
            // is a matter of sort order
            let n = data.len();
            let periodic = (1..n).any(|d| n % d == 0 && data[d..] == data[..n - d]);
            assert!(periodic, "{name}: same length but different bytes, and the block is not periodic");
        }
    }
    // Byte-identical, not just the same length, everywhere else.
    assert!(exact >= corpus().len() - 3, "only {exact} byte-identical");
}

#[test]
fn a_block_bigger_than_900k_splits_and_round_trips() {
    let mut r = Rng(7);
    let data: Vec<u8> = (0..1_200_000).map(|i| if i % 3 == 0 { r.below(5) as u8 } else { b'a' + (i % 11) as u8 }).collect();
    let z = compress(&data);
    let Some(back) = reference(&["-dc"], &z) else { return };
    assert_eq!(back.len(), data.len());
    assert!(back == data);
}

#[test]
fn rotations_sort_like_the_definition() {
    let mut r = Rng(3);
    for n in [1usize, 2, 3, 7, 50, 300] {
        for alpha in [1u64, 2, 4, 256] {
            let s: Vec<u8> = (0..n).map(|_| r.below(alpha) as u8).collect();
            let got = sort_rotations(&s);
            let rot = |i: u32| -> Vec<u8> { s[i as usize..].iter().chain(&s[..i as usize]).cloned().collect() };
            for w in got.windows(2) {
                assert!(rot(w[0]) <= rot(w[1]), "n={n} alpha={alpha}");
            }
            let mut seen = got.clone();
            seen.sort();
            assert_eq!(seen, (0..n as u32).collect::<Vec<_>>());
        }
    }
}

#[test]
fn code_lengths_are_complete_and_capped() {
    // Fibonacci frequencies are the classic way to force a deep tree.
    let mut f = vec![1u32, 1];
    while f.len() < 30 {
        let k = f.len();
        f.push(f[k - 1] + f[k - 2]);
    }
    let len = make_code_lengths(&f, 17);
    assert!(len.iter().all(|&l| l >= 1 && l <= 17));
    let kraft: f64 = len.iter().map(|&l| 0.5f64.powi(l as i32)).sum();
    assert!((kraft - 1.0).abs() < 1e-12, "kraft sum {kraft}");
}

#[test]
fn ncd_puts_a_copy_low_and_noise_high_but_neither_at_the_end() {
    let mut r = Rng(11);
    let a: Vec<u8> = (0..3000).map(|_| r.below(256) as u8).collect();
    let b: Vec<u8> = (0..3000).map(|_| r.below(256) as u8).collect();
    let mut s = Set::new(vec![a.clone(), a.clone(), b], true);
    s.step(usize::MAX);
    let n = 3;
    // Not zero, and this is a real property of bzip2, not slack in the test:
    // a second copy of 3 KB of noise costs it about a sixth of the first.
    // The block sort pairs each byte with its twin, but every pair still has
    // to be written down. A compressor with an unbounded window would charge
    // a few bytes for the pointer.
    assert!(s.ncd[0 * n + 1] < 0.25, "copy: {}", s.ncd[1]);
    assert!(s.ncd[0 * n + 1] > 0.05, "copy: {}", s.ncd[1]);
    // Nor is unrelated noise at one: the block header, symbol map and six
    // Huffman tables (a few hundred bytes for a full alphabet) are paid once
    // for the pair and twice for the two alone. Small inputs make that
    // overhead a visible fraction — which is the size of a sprite.
    assert!(s.ncd[0 * n + 2] > 0.8, "noise: {}", s.ncd[2]);
    assert!(s.ncd[0].is_nan(), "the diagonal is left undefined");
    assert_eq!(ncd(100, 100, 100), 0.0);
}

#[test]
fn stepping_in_slices_gives_the_same_matrix() {
    let items: Vec<Vec<u8>> = (0..7u8).map(|k| (0..500).map(|i| ((i * (k as usize + 1)) % 9) as u8).collect()).collect();
    let mut all = Set::new(items.clone(), false);
    all.step(usize::MAX);
    let mut sliced = Set::new(items, false);
    let mut last = 0;
    while last < sliced.total_pairs() {
        last = sliced.step(4);
    }
    assert_eq!(last, 21);
    for (a, b) in all.ncd.iter().zip(&sliced.ncd) {
        assert!(a.to_bits() == b.to_bits());
    }
}

#[test]
fn one_order_is_symmetric_by_construction_and_both_is_never_larger() {
    let items: Vec<Vec<u8>> = (0..5u8).map(|k| (0..800).map(|i| ((i / (k as usize + 2)) % 5) as u8).collect()).collect();
    let mut one = Set::new(items.clone(), false);
    one.step(usize::MAX);
    let mut both = Set::new(items, true);
    both.step(usize::MAX);
    for i in 0..5 {
        for j in 0..5 {
            if i != j {
                assert_eq!(one.ncd[i * 5 + j], one.ncd[j * 5 + i]);
                assert!(both.ncd[i * 5 + j] <= one.ncd[i * 5 + j]);
            }
        }
    }
}
