//! Data fetchers: Tiingo, FRED, Yahoo Finance.

use anyhow::{Context, Result};
use chrono::Utc;
use serde_json::Value;

use crate::Bar;

const TIINGO_BASE: &str = "https://api.tiingo.com";
const FRED_BASE: &str = "https://api.stlouisfed.org/fred/series/observations";

fn round4(v: f64) -> f64 {
    (v * 10_000.0).round() / 10_000.0
}

// ---------------------------------------------------------------------------
// Tiingo
// ---------------------------------------------------------------------------

pub fn fetch_tiingo_daily(
    client: &reqwest::blocking::Client,
    symbol: &str,
    api_key: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<Bar>> {
    let start = start_date.unwrap_or("1990-01-01");
    let end = end_date
        .map(String::from)
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

    let resp = client
        .get(format!(
            "{TIINGO_BASE}/tiingo/daily/{symbol}/prices"
        ))
        .header("Authorization", format!("Token {api_key}"))
        .query(&[
            ("startDate", start),
            ("endDate", &end),
            ("format", "json"),
            ("resampleFreq", "daily"),
        ])
        .send()?;

    if resp.status().as_u16() == 404 {
        println!("    Tiingo: {symbol} not found");
        return Ok(vec![]);
    }
    let data: Vec<Value> = resp.error_for_status()?.json()?;

    let bars = data
        .iter()
        .map(|d| {
            let date = d["date"].as_str().unwrap_or_default();
            let close = d
                .get("adjClose")
                .or_else(|| d.get("close"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let open = d
                .get("adjOpen")
                .or_else(|| d.get("open"))
                .and_then(|v| v.as_f64());
            let high = d
                .get("adjHigh")
                .or_else(|| d.get("high"))
                .and_then(|v| v.as_f64());
            let low = d
                .get("adjLow")
                .or_else(|| d.get("low"))
                .and_then(|v| v.as_f64());
            let vol = d
                .get("adjVolume")
                .or_else(|| d.get("volume"))
                .and_then(|v| v.as_f64())
                .filter(|&v| v > 0.0)
                .map(|v| v as i64);

            Bar {
                d: date[..10].to_string(),
                c: round4(close),
                o: open.map(round4),
                h: high.map(round4),
                l: low.map(round4),
                v: vol,
            }
        })
        .collect();

    Ok(bars)
}

pub fn fetch_tiingo_meta(
    client: &reqwest::blocking::Client,
    symbol: &str,
    api_key: &str,
) -> Result<Option<Value>> {
    let resp = client
        .get(format!("{TIINGO_BASE}/tiingo/daily/{symbol}"))
        .header("Authorization", format!("Token {api_key}"))
        .send()?;

    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    Ok(Some(resp.error_for_status()?.json()?))
}

// ---------------------------------------------------------------------------
// FRED
// ---------------------------------------------------------------------------

pub fn fetch_fred_series(
    client: &reqwest::blocking::Client,
    series_id: &str,
    api_key: &str,
) -> Result<Vec<Bar>> {
    let resp: Value = client
        .get(FRED_BASE)
        .query(&[
            ("series_id", series_id),
            ("api_key", api_key),
            ("file_type", "json"),
            ("observation_start", "1950-01-01"),
            ("sort_order", "asc"),
        ])
        .send()?
        .error_for_status()?
        .json()?;

    let observations = resp["observations"]
        .as_array()
        .context("missing observations in FRED response")?;

    let bars = observations
        .iter()
        .filter_map(|obs| {
            let val_str = obs["value"].as_str()?;
            if val_str == "." {
                return None; // FRED uses "." for missing
            }
            let val: f64 = val_str.parse().ok()?;
            Some(Bar {
                d: obs["date"].as_str()?.to_string(),
                c: round4(val),
                o: None,
                h: None,
                l: None,
                v: None,
            })
        })
        .collect();

    Ok(bars)
}

// ---------------------------------------------------------------------------
// Yahoo Finance (replaces yfinance Python library)
// ---------------------------------------------------------------------------

pub fn fetch_yahoo_daily(
    client: &reqwest::blocking::Client,
    symbol: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<Bar>> {
    // Yahoo Finance v8 chart API — the same endpoint yfinance uses internally.
    // period1/period2 are Unix timestamps.
    let start_ts = start_date
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(1990, 1, 1).unwrap())
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();

    let end_ts = end_date
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .map(|d| d.and_hms_opt(23, 59, 59).unwrap().and_utc().timestamp())
        .unwrap_or_else(|| Utc::now().timestamp());

    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    );

    let resp: Value = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .query(&[
            ("period1", &start_ts.to_string()),
            ("period2", &end_ts.to_string()),
            ("interval", &"1d".to_string()),
            ("events", &"history".to_string()),
        ])
        .send()?
        .error_for_status()?
        .json()?;

    let result = &resp["chart"]["result"];
    let result_arr = result
        .as_array()
        .context("missing chart.result in Yahoo response")?;

    if result_arr.is_empty() {
        println!("    yfinance: {symbol} returned no data");
        return Ok(vec![]);
    }

    let entry = &result_arr[0];
    let timestamps = entry["timestamp"]
        .as_array()
        .context("missing timestamps")?;
    let quote = &entry["indicators"]["quote"][0];
    let adj_close = &entry["indicators"]["adjclose"]
        .as_array()
        .and_then(|a| a.first())
        .map(|v| &v["adjclose"]);

    let opens = &quote["open"];
    let highs = &quote["high"];
    let lows = &quote["low"];
    let closes = &quote["close"];
    let volumes = &quote["volume"];

    let mut bars = Vec::with_capacity(timestamps.len());
    for (i, ts_val) in timestamps.iter().enumerate() {
        let ts = ts_val.as_i64().unwrap_or(0);
        let dt = chrono::DateTime::from_timestamp(ts, 0)
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_default();

        // Prefer adjusted close if available
        let close = adj_close
            .and_then(|ac| ac.get(i))
            .and_then(|v| v.as_f64())
            .or_else(|| closes.get(i).and_then(|v| v.as_f64()))
            .unwrap_or(0.0);

        let open = opens.get(i).and_then(|v| v.as_f64());
        let high = highs.get(i).and_then(|v| v.as_f64());
        let low = lows.get(i).and_then(|v| v.as_f64());
        let vol = volumes
            .get(i)
            .and_then(|v| v.as_f64())
            .filter(|&v| v > 0.0)
            .map(|v| v as i64);

        if close == 0.0 && open.is_none() {
            continue; // skip null rows
        }

        bars.push(Bar {
            d: dt,
            c: round4(close),
            o: open.map(round4),
            h: high.map(round4),
            l: low.map(round4),
            v: vol,
        });
    }

    Ok(bars)
}
