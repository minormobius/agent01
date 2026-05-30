//! Constraint-based flight itinerary ranking.
//!
//! The core (this file) is zero-dependency `std` so it can be `cargo test`ed
//! natively offline. The browser glue (serde + wasm-bindgen JSON in/out) lives
//! in the target-gated `wasm` module and is only compiled for wasm32.
//!
//! Model: an [`Offer`] has a price and one or more [`Itinerary`]s (one for
//! one-way, two for round-trip). Each itinerary is a chain of [`Segment`]s;
//! the gaps between consecutive segments are layovers.
//!
//! Two phases:
//!   1. **Hard constraints** filter the candidate set ([`Constraints`]).
//!   2. **Soft weights** score the survivors ([`Weights`]) — min-max normalized
//!      across the surviving set so price/duration/stops are comparable, then a
//!      weighted sum (lower = better). Preferred carriers earn a score discount.

const MINUTES_PER_DAY: i64 = 1440;

/// One flight leg. Times are absolute minutes since a common epoch (the wasm
/// layer derives these from ISO timestamps); time-of-day is `t.rem_euclid(1440)`.
#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    pub carrier: String,
    pub flight_number: String,
    pub from: String,
    pub to: String,
    pub depart_abs_min: i64,
    pub arrive_abs_min: i64,
    pub duration_min: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Itinerary {
    pub segments: Vec<Segment>,
    pub duration_min: u32,
}

impl Itinerary {
    pub fn stops(&self) -> u32 {
        (self.segments.len().max(1) - 1) as u32
    }

    /// Layover gaps (minutes) between consecutive segments.
    pub fn layovers(&self) -> Vec<i64> {
        let mut out = Vec::new();
        for w in self.segments.windows(2) {
            out.push(w[1].depart_abs_min - w[0].arrive_abs_min);
        }
        out
    }

    pub fn depart_abs_min(&self) -> Option<i64> {
        self.segments.first().map(|s| s.depart_abs_min)
    }
    pub fn arrive_abs_min(&self) -> Option<i64> {
        self.segments.last().map(|s| s.arrive_abs_min)
    }

    fn carriers(&self) -> impl Iterator<Item = &str> {
        self.segments.iter().map(|s| s.carrier.as_str())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Offer {
    pub id: String,
    pub price: f64,
    pub itineraries: Vec<Itinerary>,
}

impl Offer {
    pub fn total_stops(&self) -> u32 {
        self.itineraries.iter().map(|i| i.stops()).sum()
    }
    pub fn total_duration_min(&self) -> u32 {
        self.itineraries.iter().map(|i| i.duration_min).sum()
    }
    pub fn max_layover_min(&self) -> i64 {
        self.itineraries
            .iter()
            .flat_map(|i| i.layovers())
            .max()
            .unwrap_or(0)
    }
    pub fn min_layover_min(&self) -> Option<i64> {
        self.itineraries.iter().flat_map(|i| i.layovers()).min()
    }
    fn all_carriers(&self) -> Vec<String> {
        let mut v: Vec<String> = self
            .itineraries
            .iter()
            .flat_map(|i| i.carriers().map(|c| c.to_string()))
            .collect();
        v.sort();
        v.dedup();
        v
    }
}

/// Hard filters. `None` means "no limit". Carrier lists are uppercase IATA codes.
#[derive(Clone, Debug, Default)]
pub struct Constraints {
    pub max_stops: Option<u32>,
    pub max_total_duration_min: Option<u32>,
    pub max_layover_min: Option<i64>,
    pub min_layover_min: Option<i64>,
    pub max_price: Option<f64>,
    pub avoided_carriers: Vec<String>,
    /// If non-empty, every segment must be flown by one of these carriers.
    pub required_carriers: Vec<String>,
    /// Time-of-day window (minutes since midnight) for the first departure.
    pub earliest_depart_min: Option<i64>,
    pub latest_depart_min: Option<i64>,
    /// Time-of-day window for the final arrival.
    pub earliest_arrive_min: Option<i64>,
    pub latest_arrive_min: Option<i64>,
}

/// Soft ranking weights. Each of price/duration/stops is min-max normalized to
/// [0,1] across survivors before weighting, so the weights are unit-free
/// relative priorities. `preferred_bonus` is subtracted from the score when the
/// offer uses only preferred carriers (a discount; lower score = better).
#[derive(Clone, Debug)]
pub struct Weights {
    pub price: f64,
    pub duration: f64,
    pub stops: f64,
    pub preferred_carriers: Vec<String>,
    pub preferred_bonus: f64,
}

impl Default for Weights {
    fn default() -> Self {
        Weights {
            price: 1.0,
            duration: 0.5,
            stops: 0.3,
            preferred_carriers: Vec::new(),
            preferred_bonus: 0.0,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scored {
    pub offer_id: String,
    pub score: f64,
    pub price: f64,
    pub total_duration_min: u32,
    pub total_stops: u32,
    pub max_layover_min: i64,
    pub reasons: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SolveResult {
    /// Survivors, ascending by score (best first).
    pub ranked: Vec<Scored>,
    pub considered: usize,
    pub kept: usize,
    /// Histogram of why offers were filtered, e.g. "too many stops" -> 3.
    pub filtered_reasons: Vec<(String, usize)>,
}

fn time_of_day(abs_min: i64) -> i64 {
    abs_min.rem_euclid(MINUTES_PER_DAY)
}

/// Check one offer against the hard constraints. Returns the list of violations
/// (empty = passes). Each string is a short reason usable as a histogram key.
pub fn violations(offer: &Offer, c: &Constraints) -> Vec<String> {
    let mut v = Vec::new();

    if let Some(mx) = c.max_stops {
        if offer.itineraries.iter().any(|it| it.stops() > mx) {
            v.push("too many stops".to_string());
        }
    }
    if let Some(mx) = c.max_total_duration_min {
        if offer.total_duration_min() > mx {
            v.push("too long".to_string());
        }
    }
    if let Some(mx) = c.max_layover_min {
        if offer.max_layover_min() > mx {
            v.push("layover too long".to_string());
        }
    }
    if let Some(mn) = c.min_layover_min {
        if let Some(actual) = offer.min_layover_min() {
            if actual < mn {
                v.push("layover too tight".to_string());
            }
        }
    }
    if let Some(mx) = c.max_price {
        if offer.price > mx {
            v.push("over budget".to_string());
        }
    }
    if !c.avoided_carriers.is_empty() {
        let carriers = offer.all_carriers();
        if carriers.iter().any(|c2| c.avoided_carriers.contains(c2)) {
            v.push("uses avoided carrier".to_string());
        }
    }
    if !c.required_carriers.is_empty() {
        let ok = offer
            .itineraries
            .iter()
            .all(|it| it.carriers().all(|cc| c.required_carriers.iter().any(|r| r == cc)));
        if !ok {
            v.push("not on required carrier".to_string());
        }
    }
    // Departure time-of-day window (first itinerary's first segment)
    if let Some(dep) = offer.itineraries.first().and_then(|i| i.depart_abs_min()) {
        let tod = time_of_day(dep);
        if let Some(e) = c.earliest_depart_min {
            if tod < e {
                v.push("departs too early".to_string());
            }
        }
        if let Some(l) = c.latest_depart_min {
            if tod > l {
                v.push("departs too late".to_string());
            }
        }
    }
    // Arrival time-of-day window (first itinerary's last segment)
    if let Some(arr) = offer.itineraries.first().and_then(|i| i.arrive_abs_min()) {
        let tod = time_of_day(arr);
        if let Some(e) = c.earliest_arrive_min {
            if tod < e {
                v.push("arrives too early".to_string());
            }
        }
        if let Some(l) = c.latest_arrive_min {
            if tod > l {
                v.push("arrives too late".to_string());
            }
        }
    }

    v
}

fn min_max(values: &[f64]) -> (f64, f64) {
    let mut lo = f64::INFINITY;
    let mut hi = f64::NEG_INFINITY;
    for &x in values {
        if x < lo {
            lo = x;
        }
        if x > hi {
            hi = x;
        }
    }
    if !lo.is_finite() {
        (0.0, 0.0)
    } else {
        (lo, hi)
    }
}

/// Normalize to [0,1]; when all values are equal, everything maps to 0
/// (no penalty differentiation on that axis).
fn norm(x: f64, lo: f64, hi: f64) -> f64 {
    if hi <= lo {
        0.0
    } else {
        (x - lo) / (hi - lo)
    }
}

/// Filter by hard constraints, then score and rank survivors.
pub fn solve(offers: &[Offer], c: &Constraints, w: &Weights) -> SolveResult {
    let considered = offers.len();

    // Partition
    let mut survivors: Vec<&Offer> = Vec::new();
    let mut filtered_hist: Vec<(String, usize)> = Vec::new();
    for offer in offers {
        let vs = violations(offer, c);
        if vs.is_empty() {
            survivors.push(offer);
        } else {
            // Count each violation reason (an offer can fail multiple ways)
            for reason in vs {
                if let Some(entry) = filtered_hist.iter_mut().find(|(k, _)| *k == reason) {
                    entry.1 += 1;
                } else {
                    filtered_hist.push((reason, 1));
                }
            }
        }
    }
    filtered_hist.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    // Normalization bases across survivors
    let prices: Vec<f64> = survivors.iter().map(|o| o.price).collect();
    let durations: Vec<f64> = survivors.iter().map(|o| o.total_duration_min() as f64).collect();
    let stops: Vec<f64> = survivors.iter().map(|o| o.total_stops() as f64).collect();
    let (plo, phi) = min_max(&prices);
    let (dlo, dhi) = min_max(&durations);
    let (slo, shi) = min_max(&stops);

    let pref_set: Vec<&str> = w.preferred_carriers.iter().map(|s| s.as_str()).collect();

    let mut ranked: Vec<Scored> = survivors
        .iter()
        .map(|o| {
            let np = norm(o.price, plo, phi);
            let nd = norm(o.total_duration_min() as f64, dlo, dhi);
            let ns = norm(o.total_stops() as f64, slo, shi);
            let mut score = w.price * np + w.duration * nd + w.stops * ns;

            let mut reasons = vec![
                format!("price {:.0} (norm {:.2} x w{:.2})", o.price, np, w.price),
                format!("{}h{:02}m (norm {:.2} x w{:.2})", o.total_duration_min() / 60, o.total_duration_min() % 60, nd, w.duration),
                format!("{} stop(s) (norm {:.2} x w{:.2})", o.total_stops(), ns, w.stops),
            ];

            // Preferred-carrier discount: applies only if EVERY segment is preferred.
            if !pref_set.is_empty() && w.preferred_bonus != 0.0 {
                let all_pref = o
                    .itineraries
                    .iter()
                    .all(|it| it.carriers().all(|cc| pref_set.contains(&cc)));
                if all_pref {
                    score -= w.preferred_bonus;
                    reasons.push(format!("preferred-carrier discount -{:.2}", w.preferred_bonus));
                }
            }

            Scored {
                offer_id: o.id.clone(),
                score,
                price: o.price,
                total_duration_min: o.total_duration_min(),
                total_stops: o.total_stops(),
                max_layover_min: o.max_layover_min(),
                reasons,
            }
        })
        .collect();

    ranked.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));

    let kept = ranked.len();
    SolveResult {
        ranked,
        considered,
        kept,
        filtered_reasons: filtered_hist,
    }
}

// ────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn seg(carrier: &str, from: &str, to: &str, dep: i64, arr: i64) -> Segment {
        Segment {
            carrier: carrier.to_string(),
            flight_number: "100".to_string(),
            from: from.to_string(),
            to: to.to_string(),
            depart_abs_min: dep,
            arrive_abs_min: arr,
            duration_min: (arr - dep) as u32,
        }
    }
    fn itin(segs: Vec<Segment>) -> Itinerary {
        let dur = segs.last().unwrap().arrive_abs_min - segs.first().unwrap().depart_abs_min;
        Itinerary { segments: segs, duration_min: dur as u32 }
    }
    fn offer(id: &str, price: f64, its: Vec<Itinerary>) -> Offer {
        Offer { id: id.to_string(), price, itineraries: its }
    }

    #[test]
    fn stops_and_layovers() {
        // JFK->BOS (60-120), 90m layover, BOS->LHR (210-600)
        let it = itin(vec![seg("B6", "JFK", "BOS", 60, 120), seg("B6", "BOS", "LHR", 210, 600)]);
        assert_eq!(it.stops(), 1);
        assert_eq!(it.layovers(), vec![90]);
        let nonstop = itin(vec![seg("BA", "JFK", "LHR", 0, 420)]);
        assert_eq!(nonstop.stops(), 0);
        assert!(nonstop.layovers().is_empty());
    }

    #[test]
    fn max_stops_filters() {
        let one_stop = offer("a", 500.0, vec![itin(vec![
            seg("B6", "JFK", "BOS", 60, 120),
            seg("B6", "BOS", "LHR", 210, 600),
        ])]);
        let nonstop = offer("b", 700.0, vec![itin(vec![seg("BA", "JFK", "LHR", 0, 420)])]);
        let c = Constraints { max_stops: Some(0), ..Default::default() };
        let r = solve(&[one_stop, nonstop], &c, &Weights::default());
        assert_eq!(r.kept, 1);
        assert_eq!(r.ranked[0].offer_id, "b");
        assert_eq!(r.filtered_reasons, vec![("too many stops".to_string(), 1)]);
    }

    #[test]
    fn layover_window_filters() {
        // 30m layover — too tight if min is 45
        let tight = offer("t", 400.0, vec![itin(vec![
            seg("AA", "JFK", "ORD", 60, 180),
            seg("AA", "ORD", "LAX", 210, 480),
        ])]);
        let c = Constraints { min_layover_min: Some(45), ..Default::default() };
        let r = solve(std::slice::from_ref(&tight), &c, &Weights::default());
        assert_eq!(r.kept, 0);
        assert_eq!(r.filtered_reasons[0].0, "layover too tight");

        // long layover — too long if max is 120
        let longl = offer("l", 400.0, vec![itin(vec![
            seg("AA", "JFK", "ORD", 60, 180),
            seg("AA", "ORD", "LAX", 600, 900),
        ])]);
        let c2 = Constraints { max_layover_min: Some(120), ..Default::default() };
        let r2 = solve(std::slice::from_ref(&longl), &c2, &Weights::default());
        assert_eq!(r2.kept, 0);
        assert_eq!(r2.filtered_reasons[0].0, "layover too long");
    }

    #[test]
    fn avoided_and_required_carriers() {
        let spirit = offer("s", 200.0, vec![itin(vec![seg("NK", "JFK", "MCO", 0, 180)])]);
        let delta = offer("d", 350.0, vec![itin(vec![seg("DL", "JFK", "MCO", 0, 180)])]);

        let avoid_nk = Constraints { avoided_carriers: vec!["NK".into()], ..Default::default() };
        let r = solve(&[spirit.clone(), delta.clone()], &avoid_nk, &Weights::default());
        assert_eq!(r.kept, 1);
        assert_eq!(r.ranked[0].offer_id, "d");

        let only_dl = Constraints { required_carriers: vec!["DL".into()], ..Default::default() };
        let r2 = solve(&[spirit, delta], &only_dl, &Weights::default());
        assert_eq!(r2.kept, 1);
        assert_eq!(r2.ranked[0].offer_id, "d");
    }

    #[test]
    fn time_window_filters() {
        // departs at 06:00 (360) — too early if earliest is 08:00 (480)
        let early = offer("e", 300.0, vec![itin(vec![seg("UA", "SFO", "JFK", 360, 720)])]);
        let c = Constraints { earliest_depart_min: Some(480), ..Default::default() };
        let r = solve(std::slice::from_ref(&early), &c, &Weights::default());
        assert_eq!(r.kept, 0);
        assert_eq!(r.filtered_reasons[0].0, "departs too early");
    }

    #[test]
    fn ranking_prefers_cheaper_when_price_weighted() {
        let cheap_slow = offer("cs", 300.0, vec![itin(vec![
            seg("B6", "JFK", "BOS", 0, 60),
            seg("B6", "BOS", "LAX", 120, 540),
        ])]); // 1 stop, 9h
        let pricey_fast = offer("pf", 600.0, vec![itin(vec![seg("AA", "JFK", "LAX", 0, 360)])]); // nonstop, 6h

        // Heavy price weight -> cheap_slow wins
        let w_price = Weights { price: 1.0, duration: 0.1, stops: 0.1, ..Default::default() };
        let r = solve(&[cheap_slow.clone(), pricey_fast.clone()], &Constraints::default(), &w_price);
        assert_eq!(r.ranked[0].offer_id, "cs");

        // Heavy duration+stops weight -> pricey_fast wins
        let w_fast = Weights { price: 0.1, duration: 1.0, stops: 1.0, ..Default::default() };
        let r2 = solve(&[cheap_slow, pricey_fast], &Constraints::default(), &w_fast);
        assert_eq!(r2.ranked[0].offer_id, "pf");
    }

    #[test]
    fn preferred_carrier_discount_breaks_ties() {
        // identical price/duration/stops; one is on the preferred carrier
        let a = offer("a", 400.0, vec![itin(vec![seg("DL", "JFK", "LAX", 0, 360)])]);
        let b = offer("b", 400.0, vec![itin(vec![seg("AA", "JFK", "LAX", 0, 360)])]);
        let w = Weights {
            price: 1.0,
            duration: 1.0,
            stops: 1.0,
            preferred_carriers: vec!["DL".into()],
            preferred_bonus: 0.5,
        };
        let r = solve(&[a, b], &Constraints::default(), &w);
        assert_eq!(r.ranked[0].offer_id, "a");
        assert!(r.ranked[0].score < r.ranked[1].score);
    }

    #[test]
    fn empty_and_all_filtered() {
        let r = solve(&[], &Constraints::default(), &Weights::default());
        assert_eq!(r.kept, 0);
        assert_eq!(r.considered, 0);

        let pricey = offer("p", 9999.0, vec![itin(vec![seg("AA", "JFK", "LAX", 0, 360)])]);
        let c = Constraints { max_price: Some(500.0), ..Default::default() };
        let r2 = solve(std::slice::from_ref(&pricey), &c, &Weights::default());
        assert_eq!(r2.kept, 0);
        assert_eq!(r2.considered, 1);
    }
}
