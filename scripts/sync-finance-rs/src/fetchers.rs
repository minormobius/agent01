//! Data fetchers: Tiingo, FRED, Yahoo Finance.

use std::sync::OnceLock;

use anyhow::{bail, Context, Result};
use chrono::Utc;
use serde_json::Value;

use crate::{Bar, PRICE_SCALE};

const TIINGO_BASE: &str = "https://api.tiingo.com";
const FRED_BASE: &str = "https://api.stlouisfed.org/fred/series/observations";

/// Convert a float price to a scaled integer (multiply by PRICE_SCALE and round).
fn scale(v: f64) -> i64 {
    (v * PRICE_SCALE).round() as i64
}

// ---------------------------------------------------------------------------
// Yahoo Finance crumb/cookie auth
// ---------------------------------------------------------------------------

static YAHOO_CRUMB: OnceLock<Option<(String, String)>> = OnceLock::new();

/// Fetch a crumb + cookie pair from Yahoo Finance.
/// Returns (crumb, cookie_header) or None if it fails.
fn fetch_yahoo_crumb(client: &reqwest::blocking::Client) -> Option<(String, String)> {
    // Step 1: hit the consent/finance page to get cookies
    let resp = client
        .get("https://fc.yahoo.com")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .ok()?;

    // Extract Set-Cookie headers
    let cookies: Vec<String> = resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| {
            let s = v.to_str().ok()?;
            Some(s.split(';').next()?.to_string())
        })
        .collect();
    let cookie_header = cookies.join("; ");

    if cookie_header.is_empty() {
        println!("    Yahoo: no cookies received");
        return None;
    }

    // Step 2: fetch the crumb using the cookies
    let crumb_resp = client
        .get("https://query2.finance.yahoo.com/v1/test/getcrumb")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .header("Cookie", &cookie_header)
        .send()
        .ok()?;

    if !crumb_resp.status().is_success() {
        println!("    Yahoo: crumb request returned {}", crumb_resp.status());
        return None;
    }

    let crumb = crumb_resp.text().ok()?;
    if crumb.is_empty() || crumb.contains("<!") {
        println!("    Yahoo: invalid crumb response");
        return None;
    }

    println!("  Yahoo Finance: crumb acquired");
    Some((crumb, cookie_header))
}

fn get_yahoo_crumb(client: &reqwest::blocking::Client) -> &'static Option<(String, String)> {
    YAHOO_CRUMB.get_or_init(|| fetch_yahoo_crumb(client))
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
                c: scale(close),
                o: open.map(scale),
                h: high.map(scale),
                l: low.map(scale),
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
                c: scale(val),
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

    // Acquire crumb + cookies (cached across calls)
    let crumb_data = get_yahoo_crumb(client);
    let (crumb, cookie) = match crumb_data {
        Some((c, k)) => (c.as_str(), k.as_str()),
        None => bail!("Yahoo Finance: could not acquire crumb/cookie — auth required"),
    };

    let url = format!(
        "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .header("Cookie", cookie)
        .query(&[
            ("period1", &start_ts.to_string()),
            ("period2", &end_ts.to_string()),
            ("interval", &"1d".to_string()),
            ("events", &"history".to_string()),
            ("crumb", &crumb.to_string()),
        ])
        .send()?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        bail!("Yahoo Finance {symbol}: HTTP {status} — {}", &text[..text.len().min(200)]);
    }

    let data: Value = resp.json()?;
    let result = &data["chart"]["result"];
    let result_arr = match result.as_array() {
        Some(a) => a,
        None => {
            let err = &data["chart"]["error"];
            if !err.is_null() {
                bail!("Yahoo Finance {symbol}: API error — {err}");
            }
            bail!("Yahoo Finance {symbol}: missing chart.result in response");
        }
    };

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
            continue;
        }

        bars.push(Bar {
            d: dt,
            c: scale(close),
            o: open.map(scale),
            h: high.map(scale),
            l: low.map(scale),
            v: vol,
        });
    }

    Ok(bars)
}
