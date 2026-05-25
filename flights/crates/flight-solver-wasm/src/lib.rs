//! Browser glue for `flight-solver`. Exposes a single `solve_json` entry point
//! that takes a JSON request and returns a JSON response, so the frontend
//! doesn't touch wasm memory directly.
//!
//! Times are absolute minutes since any common epoch — the frontend converts
//! Amadeus ISO timestamps to minutes in JS (trivial with Date), keeping this
//! crate free of a date-parsing dependency.
//!
//! Request shape (camelCase):
//! {
//!   "offers": [
//!     { "id": "1", "price": 523.4,
//!       "itineraries": [
//!         { "durationMin": 540,
//!           "segments": [
//!             { "carrier":"B6","flightNumber":"123","from":"JFK","to":"BOS",
//!               "departAbsMin":100,"arriveAbsMin":160,"durationMin":60 }
//!           ] } ] } ],
//!   "constraints": { "maxStops": 1, "maxLayoverMin": 240, ... },
//!   "weights": { "price": 1.0, "duration": 0.5, "stops": 0.3,
//!                "preferredCarriers": ["DL"], "preferredBonus": 0.4 }
//! }

use flight_solver as core;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SegmentDto {
    carrier: String,
    #[serde(default)]
    flight_number: String,
    from: String,
    to: String,
    depart_abs_min: i64,
    arrive_abs_min: i64,
    #[serde(default)]
    duration_min: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItineraryDto {
    #[serde(default)]
    duration_min: u32,
    segments: Vec<SegmentDto>,
}

#[derive(Deserialize)]
struct OfferDto {
    id: String,
    price: f64,
    itineraries: Vec<ItineraryDto>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ConstraintsDto {
    max_stops: Option<u32>,
    max_total_duration_min: Option<u32>,
    max_layover_min: Option<i64>,
    min_layover_min: Option<i64>,
    max_price: Option<f64>,
    avoided_carriers: Vec<String>,
    required_carriers: Vec<String>,
    earliest_depart_min: Option<i64>,
    latest_depart_min: Option<i64>,
    earliest_arrive_min: Option<i64>,
    latest_arrive_min: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct WeightsDto {
    price: f64,
    duration: f64,
    stops: f64,
    preferred_carriers: Vec<String>,
    preferred_bonus: f64,
}

impl Default for WeightsDto {
    fn default() -> Self {
        WeightsDto {
            price: 1.0,
            duration: 0.5,
            stops: 0.3,
            preferred_carriers: Vec::new(),
            preferred_bonus: 0.0,
        }
    }
}

#[derive(Deserialize)]
struct Request {
    offers: Vec<OfferDto>,
    #[serde(default)]
    constraints: ConstraintsDto,
    #[serde(default)]
    weights: WeightsDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScoredDto {
    offer_id: String,
    score: f64,
    price: f64,
    total_duration_min: u32,
    total_stops: u32,
    max_layover_min: i64,
    reasons: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultDto {
    ranked: Vec<ScoredDto>,
    considered: usize,
    kept: usize,
    filtered_reasons: Vec<FilterReasonDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilterReasonDto {
    reason: String,
    count: usize,
}

#[derive(Serialize)]
struct ErrorDto {
    error: String,
}

fn seg_from(d: SegmentDto) -> core::Segment {
    let duration = if d.duration_min > 0 {
        d.duration_min
    } else {
        (d.arrive_abs_min - d.depart_abs_min).max(0) as u32
    };
    core::Segment {
        carrier: d.carrier,
        flight_number: d.flight_number,
        from: d.from,
        to: d.to,
        depart_abs_min: d.depart_abs_min,
        arrive_abs_min: d.arrive_abs_min,
        duration_min: duration,
    }
}

fn itin_from(d: ItineraryDto) -> core::Itinerary {
    let segments: Vec<core::Segment> = d.segments.into_iter().map(seg_from).collect();
    let duration = if d.duration_min > 0 {
        d.duration_min
    } else if let (Some(first), Some(last)) = (segments.first(), segments.last()) {
        (last.arrive_abs_min - first.depart_abs_min).max(0) as u32
    } else {
        0
    };
    core::Itinerary { segments, duration_min: duration }
}

fn offer_from(d: OfferDto) -> core::Offer {
    core::Offer {
        id: d.id,
        price: d.price,
        itineraries: d.itineraries.into_iter().map(itin_from).collect(),
    }
}

/// Parse a JSON request, run the solver, return a JSON response.
/// On parse error, returns `{"error": "..."}`.
#[wasm_bindgen]
pub fn solve_json(input: &str) -> String {
    let req: Request = match serde_json::from_str(input) {
        Ok(r) => r,
        Err(e) => {
            return serde_json::to_string(&ErrorDto { error: format!("bad request: {e}") })
                .unwrap_or_else(|_| "{\"error\":\"serialize failed\"}".to_string());
        }
    };

    let offers: Vec<core::Offer> = req.offers.into_iter().map(offer_from).collect();
    let constraints = core::Constraints {
        max_stops: req.constraints.max_stops,
        max_total_duration_min: req.constraints.max_total_duration_min,
        max_layover_min: req.constraints.max_layover_min,
        min_layover_min: req.constraints.min_layover_min,
        max_price: req.constraints.max_price,
        avoided_carriers: req.constraints.avoided_carriers,
        required_carriers: req.constraints.required_carriers,
        earliest_depart_min: req.constraints.earliest_depart_min,
        latest_depart_min: req.constraints.latest_depart_min,
        earliest_arrive_min: req.constraints.earliest_arrive_min,
        latest_arrive_min: req.constraints.latest_arrive_min,
    };
    let weights = core::Weights {
        price: req.weights.price,
        duration: req.weights.duration,
        stops: req.weights.stops,
        preferred_carriers: req.weights.preferred_carriers,
        preferred_bonus: req.weights.preferred_bonus,
    };

    let result = core::solve(&offers, &constraints, &weights);
    let out = ResultDto {
        ranked: result
            .ranked
            .into_iter()
            .map(|s| ScoredDto {
                offer_id: s.offer_id,
                score: s.score,
                price: s.price,
                total_duration_min: s.total_duration_min,
                total_stops: s.total_stops,
                max_layover_min: s.max_layover_min,
                reasons: s.reasons,
            })
            .collect(),
        considered: result.considered,
        kept: result.kept,
        filtered_reasons: result
            .filtered_reasons
            .into_iter()
            .map(|(reason, count)| FilterReasonDto { reason, count })
            .collect(),
    };
    serde_json::to_string(&out).unwrap_or_else(|_| "{\"error\":\"serialize failed\"}".to_string())
}
