#![no_std]
// The wander (Morphyx, 2026-10-13): /score/'s tune-writer, cut open so it never ends.
//
// /score/ writes a closed sentence: start on G4, G stamped in bar 4, land on C in bar 8, stop.
// Every seed starts from nothing and goes home. Here the same walker keeps its state between
// phrases: the last note, the last leap, the key and a 64-bit random stream. A phrase still has
// 8 bars and a resting note at the end, but the resting place moves (C, E, G or A of the key),
// and one phrase in four turns the key a fifth up or down around the note it rests on, so the
// melody never jumps at the seam. The stream is xorshift64 (period 2^64 - 1) and is part of the
// state, so the walk cannot fall into a loop before 2^64 - 1 draws.
//
// phrase() writes: BUF[0] = key in semitones + 64, BUF[1..9] = bass degree per bar + 16,
// then pairs (degree + 16, eighths). Degrees are diatonic steps in the current key, 0 = tonic 4.
static mut BUF: [u8; 256] = [0; 256];
static mut S: u64 = 1;
static mut DEG: i32 = 4;
static mut LAST: i32 = 0;
static mut KEY: i32 = 0;      // semitones above C
static mut STARTED: bool = false;
fn rnd() -> u64 { unsafe { S ^= S << 13; S ^= S >> 7; S ^= S << 17; S } }
fn pick(n: u32) -> u32 { (rnd() % n as u64) as u32 }

#[no_mangle] pub extern "C" fn buf() -> *const u8 { core::ptr::addr_of!(BUF) as *const u8 }
#[no_mangle] pub extern "C" fn start(seed: u32) {
    unsafe { S = 0x9E3779B97F4A7C15 ^ (seed as u64).wrapping_mul(0xD1B54A32D192ED03); if S == 0 { S = 1; }
             DEG = 4; LAST = 0; KEY = 0; STARTED = false; }
    for _ in 0..8 { rnd(); }
}
/// A draw from the same stream, for the page's choices (instrument drift), so a seed fixes everything.
#[no_mangle] pub extern "C" fn draw(n: u32) -> u32 { if n == 0 { 0 } else { pick(n) } }
#[no_mangle] pub extern "C" fn state_lo() -> u32 { unsafe { S as u32 } }
#[no_mangle] pub extern "C" fn state_hi() -> u32 { unsafe { (S >> 32) as u32 } }

#[no_mangle] pub extern "C" fn phrase() -> u32 {
    const CELLS: [[u8; 6]; 6] = [
        [2,2,2,2,0,0],[2,1,1,2,2,0],[4,2,2,0,0,0],[2,2,4,0,0,0],[1,1,2,2,2,0],[3,1,2,2,0,0]];
    const RESTS: [i32; 4] = [0, 2, 4, 5];          // where this phrase comes to rest: C E G A of the key
    unsafe {
        let r = RESTS[pick(4) as usize]; let mut rest = r;
        let mid = if pick(3) == 0 { 3 } else { 4 };  // bar 4 leans on F or G of the key
        // bass, one note a bar: I I I (IV|V) I IV V (rest's chord)
        let mut bass = [0, 0, 0, if mid == 3 { 3 } else { 4 }, 0, 3, 4, 0];
        BUF[0] = (KEY + 64) as u8;
        for b in 0..8 { BUF[1 + b] = (bass[b] + 16) as u8; }
        let mut n = 0usize; let o = 9usize;
        for bar in 0..8u32 {
            let cell = if bar == 7 { [8,0,0,0,0,0] } else if bar == 3 { [4,4,0,0,0,0] } else { CELLS[pick(6) as usize] };
            // the resting note is drawn first, but its octave is set when bar 7 begins: the one nearer the melody
            if bar == 6 { rest = if (r + 7 - DEG).abs() < (r - DEG).abs() && r + 7 <= 9 { r + 7 } else { r };
                          bass[7] = match r { 5 => 5, 4 => 4, _ => 0 }; BUF[8] = (bass[7] + 16) as u8; }
            let mut i = 0;
            while i < 6 && cell[i] != 0 {
                if bar == 7 { LAST = rest - DEG; DEG = rest; }
                else if bar == 3 && i == 1 { LAST = mid - DEG; DEG = mid; }
                else if STARTED {
                    let mv: i32 = if LAST.abs() >= 3 { -LAST.signum() }
                        else { match pick(10) { 0..=2 => 1, 3..=5 => -1, 6 => 2, 7 => -2, 8 => 0, _ => if pick(2) == 0 { 4 } else { -3 } } };
                    let mut d = DEG + mv;
                    if d < -2 { d = DEG + 1; } if d > 9 { d = DEG - 1; }
                    // bar 7 walks by step toward the note above the resting place
                    if bar == 6 { let t = if rest + 1 <= 9 { rest + 1 } else { rest - 1 }; d = if DEG > t { DEG - 1 } else if DEG < t { DEG + 1 } else if pick(2) == 0 && t + 1 <= 9 { t + 1 } else { t - 1 }; }
                    LAST = d - DEG; DEG = d;
                }
                STARTED = true;
                BUF[o + 2*n] = (DEG + 16) as u8; BUF[o + 2*n + 1] = cell[i];
                n += 1; i += 1;
            }
        }
        // one phrase in four turns the key a fifth around the resting note: same pitch, new name.
        // The resting note is C, E, G or A, which the keys a fifth up and down also hold.
        // Degree d in key K sounds at 60 + K + 12*floor(d/7) + scale(d mod 7), so (K+7, d-4),
        // (K-7, d+4) and (K±12, d∓7) all keep the pitch; of the spellings with d in -2..=9,
        // take the one with K nearest 0. If none is within 7 of C, there is no turn, so the register stays put.
        if pick(4) == 0 {
            // the turn leans home: up when the key is flat of C, down when sharp, either way at C
            let up = if KEY < 0 { true } else if KEY > 0 { false } else { pick(2) == 0 };
            let (k, d) = if up { (KEY + 7, DEG - 4) } else { (KEY - 7, DEG + 4) };
            let mut best = (k, d); let mut score = i32::MAX;
            for s in [-1i32, 0, 1] {
                let (k2, d2) = (k + 12 * s, d - 7 * s);
                let sc = k2.abs() + if d2 < -2 || d2 > 9 { 1000 } else { 0 };
                if sc < score { score = sc; best = (k2, d2); }
            }
            // the garden has walls: a turn whose only spelling lands more than a fifth from C is skipped
            if score <= 7 { KEY = best.0; DEG = best.1; }
        }
        LAST = 0;
        n as u32
    }
}
#[panic_handler] fn panic(_: &core::panic::PanicInfo) -> ! { loop {} }
