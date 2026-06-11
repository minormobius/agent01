//! phylofiction — the simulation core, in Rust → WASM.
//!
//! A bit-for-bit port of `phylofiction/js/{prng,genome,evolve}.js`. The whole
//! point of the port is that seed `n` yields the *same* tree of life on the
//! Rust/WASM backend and on the JS fallback, so a permalink `/?n=5` is stable
//! regardless of which engine ran. Parity is achieved by (1) reproducing the
//! mulberry32 + xmur3 PRNG with identical 32-bit integer semantics, (2) using a
//! transcendental-free Gaussian (Irwin–Hall, no libm), and (3) mirroring the
//! exact order of every random draw and every floating-point operation.
//!
//! Zero dependencies, no wasm-bindgen: the public ABI is three C functions that
//! marshal a JSON string through linear memory (see the bottom of the file).

// ── PRNG: mulberry32 + xmur3, ported with u32 wrapping arithmetic ────────────
// JS `|0`/`>>>`/`Math.imul` all operate on the 32-bit pattern, which u32
// wrapping ops reproduce exactly. `>>` on u32 is logical (matches `>>>`).
struct Rng {
    a: u32,
}
impl Rng {
    fn new(seed_str: &str) -> Rng {
        // xmur3 over the bytes, finalized once → the mulberry32 seed state.
        let bytes = seed_str.as_bytes();
        let mut h: u32 = 1779033703u32 ^ (bytes.len() as u32);
        for &b in bytes {
            h = (h ^ (b as u32)).wrapping_mul(3432918353u32);
            h = (h << 13) | (h >> 19);
        }
        h = (h ^ (h >> 16)).wrapping_mul(2246822507u32);
        h = (h ^ (h >> 13)).wrapping_mul(3266489909u32);
        h ^= h >> 16;
        Rng { a: h }
    }
    fn f(&mut self) -> f64 {
        self.a = self.a.wrapping_add(0x6D2B79F5u32);
        let mut t = (self.a ^ (self.a >> 15)).wrapping_mul(1 | self.a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
    fn chance(&mut self, p: f64) -> bool {
        self.f() < p
    }
    // Irwin–Hall(12): mean 6, variance 1 → ≈ N(0,1). Matches js/prng.js randn.
    fn randn(&mut self) -> f64 {
        let mut s = 0.0;
        for _ in 0..12 {
            s += self.f();
        }
        s - 6.0
    }
    // pick one element from a slice of cap ids: arr[floor(f()*len)]
    fn pick(&mut self, arr: &[u8]) -> u8 {
        let idx = (self.f() * arr.len() as f64).floor() as usize;
        arr[idx]
    }
}

// ── capabilities ─────────────────────────────────────────────────────────────
// Order MUST match js CAP_IDS = Object.keys(CAPS).
const CHEMO: u8 = 0;
const PHOTO_ANOX: u8 = 1;
const PHOTO_OXY: u8 = 2;
const RESPIRE_OX: u8 = 3;
const METHANOGEN: u8 = 4;
const FIX_N: u8 = 5;
const THERMOPHILE: u8 = 6;
const CAP_IDS: [u8; 7] = [CHEMO, PHOTO_ANOX, PHOTO_OXY, RESPIRE_OX, METHANOGEN, FIX_N, THERMOPHILE];
// dominant priority: js CAP_PRIORITY
const CAP_PRIORITY: [u8; 7] = [RESPIRE_OX, PHOTO_OXY, PHOTO_ANOX, METHANOGEN, THERMOPHILE, FIX_N, CHEMO];

fn cap_name(id: u8) -> &'static str {
    match id {
        CHEMO => "chemo",
        PHOTO_ANOX => "photoAnox",
        PHOTO_OXY => "photoOxy",
        RESPIRE_OX => "respireOx",
        METHANOGEN => "methanogen",
        FIX_N => "fixN",
        THERMOPHILE => "thermophile",
        _ => "chemo",
    }
}
fn cap_label(id: u8) -> &'static str {
    match id {
        CHEMO => "Chemotrophy",
        PHOTO_ANOX => "Anoxygenic phototrophy",
        PHOTO_OXY => "Oxygenic phototrophy",
        RESPIRE_OX => "Oxidant respiration",
        METHANOGEN => "Methanogenesis",
        FIX_N => "Nitrogen fixation",
        THERMOPHILE => "Thermophily",
        _ => "Chemotrophy",
    }
}

fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}

// ── genome ───────────────────────────────────────────────────────────────────
#[derive(Clone)]
struct Genome {
    caps: Vec<u8>, // insertion order, mirrors JS Set iteration order
    growth_rate: f64,
    oxidant_tolerance: f64,
    thermal_optimum: f64,
}
impl Genome {
    fn has(&self, id: u8) -> bool {
        self.caps.contains(&id)
    }
}

// PARAMS bounds [lo, hi, sigma] in JS order growthRate, oxidantTolerance, thermalOptimum
const GROWTH: (f64, f64, f64) = (0.2, 1.3, 0.12);
const OXTOL: (f64, f64, f64) = (0.0, 1.0, 0.08);
const THERM: (f64, f64, f64) = (0.0, 1.0, 0.08);

fn root_genome(rng: &mut Rng) -> Genome {
    // for k of PARAM_IDS: lo + (hi-lo)*(0.3 + 0.4*f())  — draws 1..3
    let growth_rate = GROWTH.0 + (GROWTH.1 - GROWTH.0) * (0.3 + 0.4 * rng.f());
    let _ox = OXTOL.0 + (OXTOL.1 - OXTOL.0) * (0.3 + 0.4 * rng.f()); // overwritten, but the draw happens
    let thermal_optimum = THERM.0 + (THERM.1 - THERM.0) * (0.3 + 0.4 * rng.f());
    let oxidant_tolerance = 0.05 + 0.1 * rng.f(); // draw 4
    Genome {
        caps: vec![CHEMO],
        growth_rate,
        oxidant_tolerance,
        thermal_optimum,
    }
}

// weight for capability acquisition (mirrors js mutate pickWeighted)
fn gain_weight(cid: u8, g: &Genome) -> f64 {
    if cid == RESPIRE_OX {
        let w = if g.has(PHOTO_OXY) || g.has(PHOTO_ANOX) { 4.0 } else { 0.5 };
        return w * (1.0 + 2.0 * g.oxidant_tolerance);
    }
    if cid == PHOTO_OXY {
        return if g.has(PHOTO_ANOX) { 3.0 } else { 1.1 };
    }
    if cid == PHOTO_ANOX {
        return 1.6;
    }
    1.0
}

// returns (child genome, gained capability if any). Draw order mirrors JS exactly.
fn mutate(g: &Genome, rng: &mut Rng) -> (Genome, Option<u8>) {
    let mut c = g.clone();
    // continuous params, in order, each gated by chance(0.7); randn() only when gated
    if rng.chance(0.7) {
        c.growth_rate = clamp(c.growth_rate + rng.randn() * GROWTH.2, GROWTH.0, GROWTH.1);
    }
    if rng.chance(0.7) {
        c.oxidant_tolerance = clamp(c.oxidant_tolerance + rng.randn() * OXTOL.2, OXTOL.0, OXTOL.1);
    }
    if rng.chance(0.7) {
        c.thermal_optimum = clamp(c.thermal_optimum + rng.randn() * THERM.2, THERM.0, THERM.1);
    }
    let mut gained: Option<u8> = None;
    // gain a capability (weighted)
    if rng.chance(0.22) {
        let candidates: Vec<u8> = CAP_IDS.iter().cloned().filter(|id| !c.has(*id)).collect();
        if !candidates.is_empty() {
            // pickWeighted: compute weights, then a single draw (or a pick if total<=0)
            let mut ws: Vec<f64> = Vec::with_capacity(candidates.len());
            let mut total = 0.0;
            for &cid in &candidates {
                let x = gain_weight(cid, &c).max(0.0);
                ws.push(x);
                total += x;
            }
            let id = if total <= 0.0 {
                rng.pick(&candidates)
            } else {
                let mut r = rng.f() * total;
                let mut sel = candidates[candidates.len() - 1];
                for i in 0..candidates.len() {
                    r -= ws[i];
                    if r <= 0.0 {
                        sel = candidates[i];
                        break;
                    }
                }
                sel
            };
            c.caps.push(id);
            gained = Some(id);
            if id == RESPIRE_OX {
                c.oxidant_tolerance = clamp(c.oxidant_tolerance + 0.4, 0.4, 1.0);
            }
        }
    }
    // lose a capability (never the last)
    if rng.chance(0.06) && c.caps.len() > 1 {
        let id = rng.pick(&c.caps);
        if let Some(pos) = c.caps.iter().position(|&x| x == id) {
            c.caps.remove(pos);
        }
    }
    (c, gained)
}

fn fitness(g: &Genome, oxidant: f64, nutrient: f64, light: f64, temperature: f64) -> f64 {
    let mut f = g.growth_rate;
    if g.has(CHEMO) {
        f += 0.6 * nutrient;
    }
    if g.has(PHOTO_ANOX) {
        f += 0.7 * light;
    }
    if g.has(PHOTO_OXY) {
        f += 0.9 * light;
    }
    if g.has(RESPIRE_OX) {
        f += 1.4 * oxidant;
    }
    if g.has(FIX_N) {
        f += 0.3;
    }
    if g.has(THERMOPHILE) {
        f += 0.5 * (1.0 - (temperature - g.thermal_optimum).abs());
    }
    let excess = (oxidant - g.oxidant_tolerance).max(0.0);
    let mut poison = 1.7 * excess;
    if g.has(METHANOGEN) {
        poison += 2.6 * oxidant;
    }
    f -= poison;
    f
}

fn dominant_cap(g: &Genome) -> u8 {
    for &id in CAP_PRIORITY.iter() {
        if g.has(id) {
            return id;
        }
    }
    *g.caps.first().unwrap_or(&CHEMO)
}

// ── the simulation ───────────────────────────────────────────────────────────
const EPOCHS: u32 = 72;
const K: f64 = 100.0;
const LMAX: usize = 46;
const START_A: f64 = 6.0;
const EXTINCT_A: f64 = 0.2;
const G_POS: f64 = 0.55;
const G_NEG: f64 = 0.8;
const SPEC_BASE: f64 = 0.16;
const OXY_RATE: f64 = 0.12;
const OXY_SINK: f64 = 2.0;
const OXY_DECAY: f64 = 0.004;
const CONSUME: f64 = 0.06;
const NUTR_REGEN: f64 = 0.012;
const PULSE_FRAC: f64 = 0.2;

const DC_NONE: u8 = 0;
const DC_OXIDANT: u8 = 1;
const DC_COMPETITION: u8 = 2;

struct Lineage {
    id: u32,
    parent: i64, // -1 = root
    birth: u32,
    last: u32,
    genome: Genome,
    abundance: f64,
    peak_a: f64,
    alive: bool,
    death_cause: u8,
}

struct EnvPt {
    epoch: u32,
    oxidant: f64,
    nutrient: f64,
    living: usize,
    total_a: f64,
}

// event kinds
const EK_INNOVATION: u8 = 0;
const EK_EXTINCTION: u8 = 1;
const EK_GREAT_OXY: u8 = 2;
const EK_CONVERGENCE: u8 = 3;

struct Event {
    epoch: u32,
    kind: u8,
    cap: i32,    // -1 if n/a
    lineage: i64, // -1 if n/a
    count: i32,  // -1 if n/a
    cause: u8,   // DC_* ; DC_NONE if n/a (extinction uses oxidant/competition)
    gloss: String,
}

struct World {
    n: u32,
    lineages: Vec<Lineage>,
    env: Vec<EnvPt>,
    events: Vec<Event>,
    // summary / score
    survivors: usize,
    max_oxidant: f64,
    oxygenated: bool,
    disparity: usize,
    convergence: usize,
    reversal: f64,
    innovation: usize,
    extinction_pulses: usize,
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn simulate(n: u32) -> World {
    let base = format!("phylofiction::{}", n);
    let mut rng = Rng::new(&base);

    // environment — anoxic, nutrient-rich young ocean. temperature draw is FIRST.
    let mut oxidant = 0.0;
    let mut nutrient = 1.0;
    let light = 0.95;
    let temperature = 0.45 + 0.25 * rng.f();
    let mut sink_remaining = OXY_SINK;

    let mut lineages: Vec<Lineage> = Vec::new();
    let mut next_id: u32 = 0;
    let root = root_genome(&mut rng);
    lineages.push(Lineage {
        id: next_id,
        parent: -1,
        birth: 0,
        last: 0,
        genome: root,
        abundance: START_A,
        peak_a: START_A,
        alive: true,
        death_cause: DC_NONE,
    });
    next_id += 1;

    let mut env: Vec<EnvPt> = Vec::new();
    let mut events: Vec<Event> = Vec::new();
    let mut cap_first_seen: [i64; 7] = [-1; 7];
    cap_first_seen[CHEMO as usize] = 0;
    let mut cap_origins: [i32; 7] = [0; 7];
    let mut cap_origin_order: Vec<u8> = Vec::new(); // order capabilities first appeared (>=2 → convergence)

    for e in 1..=EPOCHS {
        // snapshot of lineages alive at the start of the epoch (indices)
        let living_idx: Vec<usize> = (0..lineages.len()).filter(|&i| lineages[i].alive).collect();
        let living_count_start = living_idx.len();
        let total_a: f64 = living_idx.iter().map(|&i| lineages[i].abundance).sum();
        let crowd = total_a / K;

        // 1 ── growth / shrinkage
        let mut deaths = 0usize;
        let mut dead_anaerobes = 0usize;
        for &i in &living_idx {
            let fit = fitness(&lineages[i].genome, oxidant, nutrient, light, temperature);
            let r = if fit >= 0.0 {
                G_POS * fit * (1.0 - crowd)
            } else {
                G_NEG * fit
            };
            lineages[i].abundance *= (1.0 + r).max(0.0);
            if lineages[i].abundance < 0.0 {
                lineages[i].abundance = 0.0;
            }
            lineages[i].last = e;
            if lineages[i].abundance > lineages[i].peak_a {
                lineages[i].peak_a = lineages[i].abundance;
            }
            if lineages[i].abundance < EXTINCT_A {
                lineages[i].alive = false;
                let poisoned = oxidant > lineages[i].genome.oxidant_tolerance + 0.02;
                lineages[i].death_cause = if poisoned { DC_OXIDANT } else { DC_COMPETITION };
                if poisoned {
                    dead_anaerobes += 1;
                }
                deaths += 1;
            }
        }

        // 2 ── speciation (budding), capped at LMAX live lineages
        let still: Vec<usize> = (0..lineages.len()).filter(|&i| lineages[i].alive).collect();
        let live_count = still.len();
        let room = if LMAX > live_count { LMAX - live_count } else { 0 };
        if room > 0 {
            let t_now: f64 = {
                let s: f64 = still.iter().map(|&i| lineages[i].abundance).sum();
                if s == 0.0 {
                    1.0
                } else {
                    s
                }
            };
            let mut budded = 0usize;
            for &i in &still {
                if budded >= room {
                    break;
                }
                let fit = fitness(&lineages[i].genome, oxidant, nutrient, light, temperature).max(0.0);
                let p = SPEC_BASE * fit * (lineages[i].abundance / t_now) * 3.0;
                if rng.chance(p.min(0.9)) {
                    let mut mr = Rng::new(&format!("{}::mut::{}::{}", base, e, lineages[i].id));
                    let (genome, gained) = mutate(&lineages[i].genome, &mut mr);
                    let share = lineages[i].abundance * 0.32;
                    lineages[i].abundance -= share;
                    let child_id = next_id;
                    next_id += 1;
                    lineages.push(Lineage {
                        id: child_id,
                        parent: lineages[i].id as i64,
                        birth: e,
                        last: e,
                        genome,
                        abundance: share,
                        peak_a: share,
                        alive: true,
                        death_cause: DC_NONE,
                    });
                    budded += 1;
                    if let Some(gc) = gained {
                        let gi = gc as usize;
                        if cap_origins[gi] == 0 {
                            cap_origin_order.push(gc);
                        }
                        cap_origins[gi] += 1;
                        if cap_first_seen[gi] == -1 {
                            cap_first_seen[gi] = e as i64;
                            events.push(Event {
                                epoch: e,
                                kind: EK_INNOVATION,
                                cap: gc as i32,
                                lineage: child_id as i64,
                                count: -1,
                                cause: DC_NONE,
                                gloss: format!("{} first appears", cap_label(gc)),
                            });
                        }
                    }
                }
            }
        }

        // 3 ── environmental feedback: life edits the world
        let oxy_abundance: f64 = lineages
            .iter()
            .filter(|l| l.alive && l.genome.has(PHOTO_OXY))
            .map(|l| l.abundance)
            .sum();
        let production = OXY_RATE * (oxy_abundance / K) * 6.0;
        let absorbed = production.min(sink_remaining);
        sink_remaining -= absorbed;
        let net_o2 = production - absorbed;
        let ox_before = oxidant;
        oxidant = (oxidant + net_o2 - OXY_DECAY).min(1.0).max(0.0);
        let alive_total: f64 = lineages.iter().filter(|l| l.alive).map(|l| l.abundance).sum();
        let consumed = CONSUME * (alive_total / K);
        nutrient = (nutrient - consumed + NUTR_REGEN).min(1.0).max(0.05);

        // 4 ── event detection
        let threshold = ((living_count_start as f64 * PULSE_FRAC).ceil() as usize).max(3);
        if deaths >= threshold {
            let by_oxidant = (dead_anaerobes as f64) >= (deaths as f64) * 0.5;
            events.push(Event {
                epoch: e,
                kind: EK_EXTINCTION,
                cap: -1,
                lineage: -1,
                count: deaths as i32,
                cause: if by_oxidant { DC_OXIDANT } else { DC_COMPETITION },
                gloss: if by_oxidant {
                    format!(
                        "Mass dying — {} anaerobic lineages poisoned by the rising oxidant",
                        deaths
                    )
                } else {
                    format!("Turnover — {} lineages lost to competition", deaths)
                },
            });
        }
        let already_goe = events.iter().any(|v| v.kind == EK_GREAT_OXY);
        if ox_before < 0.5 && oxidant >= 0.5 && !already_goe {
            events.push(Event {
                epoch: e,
                kind: EK_GREAT_OXY,
                cap: -1,
                lineage: -1,
                count: -1,
                cause: DC_NONE,
                gloss: "The Great Oxygenation — the oxidant overwhelms its sinks and floods the world"
                    .to_string(),
            });
        }

        let living_now = lineages.iter().filter(|l| l.alive).count();
        env.push(EnvPt {
            epoch: e,
            oxidant,
            nutrient,
            living: living_now,
            total_a: alive_total,
        });
    }

    // close out survivors
    for l in lineages.iter_mut() {
        if l.alive {
            l.last = EPOCHS;
        }
    }

    // convergence events: ≥2 independent origins (in first-seen order)
    for &cap in &cap_origin_order {
        let ci = cap as usize;
        if cap_origins[ci] >= 2 {
            events.push(Event {
                epoch: cap_first_seen[ci] as u32,
                kind: EK_CONVERGENCE,
                cap: cap as i32,
                lineage: -1,
                count: cap_origins[ci],
                cause: DC_NONE,
                gloss: format!(
                    "{} evolved independently {}×",
                    cap_label(cap),
                    cap_origins[ci]
                ),
            });
        }
    }
    // stable sort: epoch asc, then innovation(rank 0) before others(rank 1)
    events.sort_by(|a, b| {
        let r = a.epoch.cmp(&b.epoch);
        if r != core::cmp::Ordering::Equal {
            return r;
        }
        let ra = if a.kind == EK_INNOVATION { 0 } else { 1 };
        let rb = if b.kind == EK_INNOVATION { 0 } else { 1 };
        ra.cmp(&rb)
    });

    // ── summary + score ──
    let survivors = lineages.iter().filter(|l| !l.alive).count();
    let survivors = lineages.len() - survivors; // count alive
    let max_oxidant = env.iter().fold(0.0_f64, |m, s| if s.oxidant > m { s.oxidant } else { m });
    let oxygenated = events.iter().any(|v| v.kind == EK_GREAT_OXY);

    // disparity: distinct caps across all nodes
    let mut seen_cap = [false; 7];
    for l in &lineages {
        for &c in &l.genome.caps {
            seen_cap[c as usize] = true;
        }
    }
    let disparity = seen_cap.iter().filter(|&&b| b).count();
    let innovation = events.iter().filter(|e| e.kind == EK_INNOVATION).count();
    let convergence = events.iter().filter(|e| e.kind == EK_CONVERGENCE).count();
    let extinction_pulses = events.iter().filter(|e| e.kind == EK_EXTINCTION).count();

    // survivorship reversal
    let early: Vec<&Lineage> = lineages.iter().filter(|l| l.birth <= 6).collect();
    let surv: Vec<&Lineage> = lineages.iter().filter(|l| l.alive).collect();
    let frac = |arr: &Vec<&Lineage>, want: u8| -> f64 {
        if arr.is_empty() {
            0.0
        } else {
            arr.iter().filter(|l| l.genome.has(want)).count() as f64 / arr.len() as f64
        }
    };
    let early_aer = frac(&early, RESPIRE_OX);
    let surv_aer = frac(&surv, RESPIRE_OX);
    let reversal = round2((surv_aer - early_aer).abs());

    World {
        n,
        lineages,
        env,
        events,
        survivors,
        max_oxidant: round2(max_oxidant),
        oxygenated,
        disparity,
        convergence,
        reversal,
        innovation,
        extinction_pulses,
    }
}

// ── JSON serialization (hand-rolled — keys mirror js/evolve.js output) ────────
fn json_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for ch in s.chars() {
        match ch {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            _ => o.push(ch),
        }
    }
    o.push('"');
    o
}
fn num(x: f64) -> String {
    // f64 Display is shortest round-trippable; good enough and parses back exactly.
    format!("{}", x)
}

fn world_to_json(w: &World) -> String {
    let mut s = String::with_capacity(8192);
    s.push('{');
    s.push_str(&format!("\"n\":{},", w.n));
    s.push_str(&format!("\"seed\":\"phylofiction::{}\",", w.n));
    s.push_str(&format!("\"epochs\":{},", EPOCHS));

    // tree.nodes
    s.push_str("\"tree\":{\"nodes\":[");
    for (i, l) in w.lineages.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('{');
        s.push_str(&format!("\"id\":{},", l.id));
        if l.parent < 0 {
            s.push_str("\"parentId\":null,");
        } else {
            s.push_str(&format!("\"parentId\":{},", l.parent));
        }
        s.push_str(&format!("\"birth\":{},", l.birth));
        s.push_str(&format!("\"last\":{},", l.last));
        s.push_str(&format!("\"extinct\":{},", !l.alive));
        match l.death_cause {
            DC_OXIDANT => s.push_str("\"deathCause\":\"oxidant\","),
            DC_COMPETITION => s.push_str("\"deathCause\":\"competition\","),
            _ => s.push_str("\"deathCause\":null,"),
        }
        s.push_str("\"caps\":[");
        for (j, c) in l.genome.caps.iter().enumerate() {
            if j > 0 {
                s.push(',');
            }
            s.push_str(&json_str(cap_name(*c)));
        }
        s.push_str("],");
        s.push_str(&format!("\"dominant\":{},", json_str(cap_name(dominant_cap(&l.genome)))));
        s.push_str(&format!(
            "\"genome\":{{\"growthRate\":{},\"oxidantTolerance\":{},\"thermalOptimum\":{}}},",
            num(l.genome.growth_rate),
            num(l.genome.oxidant_tolerance),
            num(l.genome.thermal_optimum)
        ));
        s.push_str(&format!("\"peakA\":{}", num(round2(l.peak_a))));
        s.push('}');
    }
    s.push_str("]},");

    // env
    s.push_str("\"env\":[");
    for (i, p) in w.env.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            "{{\"epoch\":{},\"oxidant\":{},\"nutrient\":{},\"living\":{},\"totalA\":{}}}",
            p.epoch,
            num(p.oxidant),
            num(p.nutrient),
            p.living,
            num(p.total_a)
        ));
    }
    s.push_str("],");

    // events
    s.push_str("\"events\":[");
    for (i, e) in w.events.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('{');
        s.push_str(&format!("\"epoch\":{},", e.epoch));
        let kind = match e.kind {
            EK_INNOVATION => "innovation",
            EK_EXTINCTION => "extinction",
            EK_GREAT_OXY => "great-oxygenation",
            _ => "convergence",
        };
        s.push_str(&format!("\"kind\":{}", json_str(kind)));
        if e.cap >= 0 {
            s.push_str(&format!(",\"cap\":{}", json_str(cap_name(e.cap as u8))));
        }
        if e.lineage >= 0 {
            s.push_str(&format!(",\"lineage\":{}", e.lineage));
        }
        if e.count >= 0 {
            s.push_str(&format!(",\"count\":{}", e.count));
        }
        if e.cause == DC_OXIDANT {
            s.push_str(",\"cause\":\"oxidant\"");
        } else if e.cause == DC_COMPETITION {
            s.push_str(",\"cause\":\"competition\"");
        }
        s.push_str(&format!(",\"gloss\":{}", json_str(&e.gloss)));
        s.push('}');
    }
    s.push_str("],");

    // summary
    s.push_str(&format!(
        "\"summary\":{{\"lineages\":{},\"survivors\":{},\"maxOxidant\":{},\"oxygenated\":{}}},",
        w.lineages.len(),
        w.survivors,
        num(w.max_oxidant),
        w.oxygenated
    ));

    // score
    s.push_str(&format!(
        "\"score\":{{\"disparity\":{},\"convergence\":{},\"reversal\":{},\"innovation\":{},\"extinctionPulses\":{},\"oxygenated\":{}}}",
        w.disparity,
        w.convergence,
        num(w.reversal),
        w.innovation,
        w.extinction_pulses,
        if w.oxygenated { 1 } else { 0 }
    ));

    s.push('}');
    s
}

// ── public WASM ABI ──────────────────────────────────────────────────────────
// No wasm-bindgen: evolve(n) writes the world's JSON into a module-owned buffer
// and returns a pointer; result_len() gives its byte length; JS reads the bytes
// out of linear memory. find_seed scans for an interesting seed entirely in Rust.
static mut RESULT: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn evolve(n: u32) -> *const u8 {
    let json = world_to_json(&simulate(n));
    let bytes = json.into_bytes();
    unsafe {
        RESULT = bytes;
        RESULT.as_ptr()
    }
}

#[no_mangle]
pub extern "C" fn result_len() -> usize {
    unsafe { RESULT.len() }
}

/// First seed in [start, start+limit) that tells the full oxygenation story
/// (oxygenated AND survivorship reversal > 0.2). Returns -1 if none. This is the
/// "find a Great Oxidation" interestingness filter, run entirely in Rust.
#[no_mangle]
pub extern "C" fn find_seed(start: u32, limit: u32) -> i32 {
    let mut n = start;
    let end = start.saturating_add(limit);
    while n < end {
        let w = simulate(n);
        if w.oxygenated && w.reversal > 0.2 {
            return n as i32;
        }
        n += 1;
    }
    -1
}

#[no_mangle]
pub extern "C" fn engine_version() -> u32 {
    1
}

// ── host-side tests (cargo test) — determinism + the oxygenation PoC ──────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic() {
        let a = world_to_json(&simulate(7));
        let b = world_to_json(&simulate(7));
        assert_eq!(a, b);
    }

    #[test]
    fn variety() {
        let mut set = std::collections::HashSet::new();
        for n in 0..25 {
            set.insert(world_to_json(&simulate(n)));
        }
        assert!(set.len() >= 20, "expected variety, got {}", set.len());
    }

    #[test]
    fn sane_tree() {
        let w = simulate(3);
        assert_eq!(w.lineages.iter().filter(|l| l.parent < 0).count(), 1);
        assert!(w.lineages.len() >= 3 && w.lineages.len() < 2000);
        for p in &w.env {
            assert!(p.oxidant >= 0.0 && p.oxidant <= 1.0);
        }
    }

    #[test]
    fn oxygenation_emerges() {
        let s = find_seed(0, 300);
        assert!(s >= 0, "no seed in 0..300 told the full oxygenation story");
        let w = simulate(s as u32);
        let poisoned = w
            .lineages
            .iter()
            .filter(|l| !l.alive && l.death_cause == DC_OXIDANT)
            .count();
        assert!(poisoned > 0, "scar is cosmetic — no anaerobes poisoned");
        let surv_aer = w
            .lineages
            .iter()
            .filter(|l| l.alive && l.genome.has(RESPIRE_OX))
            .count();
        assert!(surv_aer > 0, "no aerobe inherited the oxygenated world");
    }

    #[test]
    fn find_seed_is_deterministic() {
        assert_eq!(find_seed(0, 300), find_seed(0, 300));
    }
}
