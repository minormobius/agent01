#![no_std]
// Procedural melody, 8 bars of 4/4 in C major, treble staff.
// Output: pairs (degree, eighths). degree 0 = C4, 7 = C5 (diatonic steps).
static mut BUF: [u8; 256] = [0; 256];
static mut S: u32 = 1;
fn rnd() -> u32 { unsafe { S ^= S << 13; S ^= S >> 17; S ^= S << 5; S } }
fn pick(n: u32) -> u32 { rnd() % n }

#[no_mangle] pub extern "C" fn buf() -> *const u8 { core::ptr::addr_of!(BUF) as *const u8 }

#[no_mangle] pub extern "C" fn generate(seed: u32) -> u32 {
    unsafe { S = if seed == 0 { 0x9E3779B9 } else { seed }; }
    for _ in 0..8 { rnd(); }
    // rhythm cells, in eighths, each sums to 8 (one bar)
    const CELLS: [[u8; 6]; 6] = [
        [2,2,2,2,0,0],[2,1,1,2,2,0],[4,2,2,0,0,0],[2,2,4,0,0,0],[1,1,2,2,2,0],[3,1,2,2,0,0]];
    let mut n = 0usize;
    let mut deg: i32 = 4; // start on G4
    let mut last_leap: i32 = 0;
    for bar in 0..8u32 {
        let cell = if bar == 7 { [8,0,0,0,0,0] } else if bar == 3 { [4,4,0,0,0,0] } else { CELLS[pick(6) as usize] };
        let mut i = 0;
        while i < 6 && cell[i] != 0 {
            let last_note_of_piece = bar == 7;
            let half_cadence = bar == 3 && i == 1;
            if last_note_of_piece { deg = 0; }
            else if half_cadence { deg = 4; }
            else if n > 0 {
                let mv: i32 = if last_leap.abs() >= 3 { -last_leap.signum() } // leap resolves by step, opposite way
                    else { match pick(10) { 0..=2 => 1, 3..=5 => -1, 6 => 2, 7 => -2, 8 => 0, _ => if pick(2)==0 {4} else {-3} } };
                let mut d = deg + mv;
                if d < -2 { d = deg + 1; } if d > 9 { d = deg - 1; }
                // pull toward the tonic area in bars 5-6
                if bar >= 5 && d > 6 { d = deg - 1; }
                // bar 7 walks by step toward D4 and turns around it, so the last leap is a third at most
                if bar == 6 { d = if deg > 1 { deg - 1 } else if deg < 1 { deg + 1 } else if pick(2) == 0 { 2 } else { -1 }; }
                last_leap = d - deg; deg = d;
            }
            unsafe { BUF[2*n] = (deg + 2) as u8; BUF[2*n+1] = cell[i]; }
            n += 1; i += 1;
        }
    }
    n as u32
}
#[panic_handler] fn panic(_: &core::panic::PanicInfo) -> ! { loop {} }
