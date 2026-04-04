//! sync-finance: fetch market data from Tiingo/FRED/Yahoo → ATProto PDS

mod fetchers;
mod pds;
mod universe;

use std::collections::{BTreeMap, HashSet};
use std::env;
use std::process;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use clap::Parser;

use fetchers::{fetch_fred_series, fetch_tiingo_daily, fetch_tiingo_meta, fetch_yahoo_daily};
use pds::PdsClient;
use universe::{load_universe, load_sp500_tickers, SymbolMeta};

const COLLECTION: &str = "com.minomobi.finance.dailySeries";
const META_COLLECTION: &str = "com.minomobi.finance.security";

const TIINGO_DELAY: Duration = Duration::from_millis(1500);
const FRED_DELAY: Duration = Duration::from_millis(200);
const PDS_WRITE_DELAY: Duration = Duration::from_millis(100);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

#[derive(Parser)]
#[command(about = "Sync financial data to ATProto PDS")]
struct Cli {
    /// Full historical sync (all years)
    #[arg(long)]
    full: bool,

    /// Incremental daily update (current year only)
    #[arg(long)]
    daily: bool,

    /// Comma-separated symbols to sync
    #[arg(long)]
    symbols: Option<String>,

    /// Fetch but don't write to PDS
    #[arg(long)]
    dry_run: bool,

    /// Which Bluesky account to write to
    #[arg(long, default_value = "main")]
    account: String,

    /// Include S&P 500 constituents (slow: ~500 tickers)
    #[arg(long)]
    include_sp500: bool,
}

// ---------------------------------------------------------------------------
// Bar type
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct Bar {
    pub d: String,
    /// Close price scaled by 10000 (e.g., $99.50 → 995000)
    pub c: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub o: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub h: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub l: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub v: Option<i64>,
}

/// ATProto has no float type — prices are integers scaled by PRICE_SCALE.
pub const PRICE_SCALE: f64 = 10_000.0;

// ---------------------------------------------------------------------------
// Record construction
// ---------------------------------------------------------------------------

fn make_rkey(symbol: &str, year: i32) -> String {
    let safe = symbol.replace('=', "-").replace('^', "").replace('/', "-");
    format!("{safe}:{year}")
}

fn make_series_record(
    symbol: &str,
    year: i32,
    bars: &[Bar],
    meta: &SymbolMeta,
) -> serde_json::Value {
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let mut record = serde_json::json!({
        "$type": COLLECTION,
        "symbol": symbol,
        "year": year,
        "seriesType": meta.series_type,
        "name": meta.name,
        "priceScale": 10000,
        "bars": bars,
        "source": meta.source,
        "adjusted": meta.adjusted.unwrap_or(true),
        "createdAt": now,
        "updatedAt": now,
    });
    let obj = record.as_object_mut().unwrap();
    if let Some(ref v) = meta.currency {
        obj.insert("currency".into(), v.clone().into());
    }
    if let Some(ref v) = meta.exchange {
        obj.insert("exchange".into(), v.clone().into());
    }
    if let Some(ref v) = meta.sector {
        obj.insert("sector".into(), v.clone().into());
    }
    if let Some(ref v) = meta.industry {
        obj.insert("industry".into(), v.clone().into());
    }
    record
}

fn make_security_record(
    symbol: &str,
    meta: &SymbolMeta,
    bars: &[Bar],
) -> serde_json::Value {
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let mut record = serde_json::json!({
        "$type": META_COLLECTION,
        "symbol": symbol,
        "seriesType": meta.series_type,
        "name": meta.name,
        "source": meta.source,
        "createdAt": now,
    });
    let obj = record.as_object_mut().unwrap();
    if !bars.is_empty() {
        obj.insert("startDate".into(), bars.first().unwrap().d.clone().into());
        obj.insert("endDate".into(), bars.last().unwrap().d.clone().into());
    }
    if let Some(ref v) = meta.exchange {
        obj.insert("exchange".into(), v.clone().into());
    }
    if let Some(ref v) = meta.sector {
        obj.insert("sector".into(), v.clone().into());
    }
    if let Some(ref v) = meta.industry {
        obj.insert("industry".into(), v.clone().into());
    }
    if let Some(ref v) = meta.currency {
        obj.insert("currency".into(), v.clone().into());
    }
    if let Some(ref v) = meta.tags {
        obj.insert("tags".into(), serde_json::json!(v));
    }
    record
}

fn bars_by_year(bars: &[Bar]) -> BTreeMap<i32, Vec<Bar>> {
    let mut groups: BTreeMap<i32, Vec<Bar>> = BTreeMap::new();
    for bar in bars {
        let year: i32 = bar.d[..4].parse().unwrap_or(0);
        groups.entry(year).or_default().push(bar.clone());
    }
    groups
}

// ---------------------------------------------------------------------------
// Sync one symbol
// ---------------------------------------------------------------------------

fn sync_symbol(
    client: &reqwest::blocking::Client,
    pds: Option<&PdsClient>,
    symbol: &str,
    meta: &mut SymbolMeta,
    years: Option<&HashSet<i32>>,
    dry_run: bool,
) -> Result<usize> {
    let tiingo_key = env::var("TIINGO_API_KEY").unwrap_or_default();
    let fred_key = env::var("FRED_API_KEY").unwrap_or_default();

    println!("  Fetching {symbol} from {}...", meta.source);

    let all_bars = match meta.source.as_str() {
        "fred" => {
            let bars = fetch_fred_series(client, symbol, &fred_key)?;
            thread::sleep(FRED_DELAY);
            bars
        }
        "tiingo" => {
            let bars = fetch_tiingo_daily(client, symbol, &tiingo_key, None, None)?;
            if meta.name == symbol {
                if let Ok(Some(tmeta)) = fetch_tiingo_meta(client, symbol, &tiingo_key) {
                    if let Some(name) = tmeta.get("name").and_then(|v| v.as_str()) {
                        if !name.is_empty() {
                            meta.name = name.to_string();
                        }
                    }
                    if let Some(exc) = tmeta.get("exchangeCode").and_then(|v| v.as_str()) {
                        meta.exchange = Some(exc.to_string());
                    }
                }
            }
            thread::sleep(TIINGO_DELAY);
            bars
        }
        "yfinance" => fetch_yahoo_daily(client, symbol, None, None)?,
        other => {
            println!("    Unknown source: {other}");
            return Ok(0);
        }
    };

    if all_bars.is_empty() {
        println!("    No data for {symbol}");
        return Ok(0);
    }

    let mut yearly = bars_by_year(&all_bars);
    if let Some(filter_years) = years {
        yearly.retain(|y, _| filter_years.contains(y));
    }

    println!("    {} bars across {} years", all_bars.len(), yearly.len());

    if dry_run {
        return Ok(yearly.len());
    }

    let pds = pds.context("PDS client required for non-dry-run")?;

    // Write security metadata
    let sec_rkey = symbol.replace('=', "-").replace('^', "").replace('/', "-");
    let sec_record = make_security_record(symbol, meta, &all_bars);
    if let Err(e) = pds.put_record(client, META_COLLECTION, &sec_rkey, &sec_record) {
        eprintln!("    Error writing security record: {e}");
    }

    // Write yearly series records
    let mut written = 0;
    for (year, bars) in &yearly {
        let rkey = make_rkey(symbol, *year);
        let record = make_series_record(symbol, *year, bars, meta);
        match pds.put_record(client, COLLECTION, &rkey, &record) {
            Ok(()) => {
                written += 1;
                thread::sleep(PDS_WRITE_DELAY);
            }
            Err(e) => eprintln!("    Error writing {rkey}: {e}"),
        }
    }

    println!("    Wrote {written} year-records for {symbol}");
    Ok(written)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() -> Result<()> {
    let cli = Cli::parse();

    if !cli.full && !cli.daily && cli.symbols.is_none() {
        eprintln!("Error: specify --full, --daily, or --symbols");
        process::exit(1);
    }

    // ── Diagnostics: print env var status ──
    println!("=== sync-finance startup diagnostics ===");
    let check_env = |name: &str| {
        match env::var(name) {
            Ok(v) if !v.is_empty() => println!("  {name}: set ({} chars)", v.len()),
            _ => println!("  {name}: NOT SET"),
        }
    };
    check_env("BLUESKY_HANDLE");
    check_env("BLUESKY_APP_PASSWORD");
    check_env("TIINGO_API_KEY");
    check_env("FRED_API_KEY");
    println!("  mode: {}", if cli.full { "full" } else { "daily" });
    println!("  dry_run: {}", cli.dry_run);
    println!("  account: {}", cli.account);
    println!("=========================================");

    // Resolve account credentials
    let (handle, password) = match cli.account.as_str() {
        "main" => (
            env::var("BLUESKY_HANDLE").ok(),
            env::var("BLUESKY_APP_PASSWORD").ok(),
        ),
        "modulo" => (
            env::var("BLUESKY_MODULO_HANDLE").ok(),
            env::var("BLUESKY_MODULO_APP_PASSWORD").ok(),
        ),
        "morphyx" => (
            env::var("BLUESKY_MORPHYX_HANDLE").ok(),
            env::var("BLUESKY_MORPHYX_APP_PASSWORD").ok(),
        ),
        other => {
            eprintln!("Unknown account: {other}");
            process::exit(1);
        }
    };

    // Fail fast if API keys are missing
    if !cli.dry_run {
        if handle.as_ref().map_or(true, |h| h.is_empty()) {
            eprintln!("Error: Bluesky handle not set for account '{}'", cli.account);
            process::exit(1);
        }
        if password.as_ref().map_or(true, |p| p.is_empty()) {
            eprintln!("Error: Bluesky app password not set for account '{}'", cli.account);
            process::exit(1);
        }
    }
    let tiingo_key = env::var("TIINGO_API_KEY").unwrap_or_default();
    let fred_key = env::var("FRED_API_KEY").unwrap_or_default();
    if tiingo_key.is_empty() {
        eprintln!("Warning: TIINGO_API_KEY not set — Tiingo symbols will fail");
    }
    if fred_key.is_empty() {
        eprintln!("Warning: FRED_API_KEY not set — FRED symbols will fail");
    }

    // Find repo root relative to the binary's source location.
    // At build time CARGO_MANIFEST_DIR is scripts/sync-finance-rs/,
    // so repo root is two levels up.  At runtime we fall back to CWD.
    let repo_root = option_env!("CARGO_MANIFEST_DIR")
        .map(|d| {
            std::path::PathBuf::from(d)
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .to_path_buf()
        })
        .unwrap_or_else(|| std::env::current_dir().unwrap());
    let universe_path = repo_root.join("finance").join("universe.json");

    // Load universe
    let mut symbols = load_universe(&universe_path)?;

    // Optionally add S&P 500
    if cli.include_sp500 {
        let sp500 = load_sp500_tickers(&repo_root)?;
        let existing: HashSet<String> = symbols.iter().map(|(s, _)| s.clone()).collect();
        let mut added = 0;
        for ticker in &sp500 {
            if !existing.contains(ticker) {
                symbols.push((
                    ticker.clone(),
                    SymbolMeta {
                        name: ticker.clone(),
                        series_type: "equity".into(),
                        source: "tiingo".into(),
                        currency: Some("USD".into()),
                        tags: Some(vec!["equity".into(), "sp500".into()]),
                        ..Default::default()
                    },
                ));
                added += 1;
            }
        }
        println!("  Added {added} S&P 500 tickers ({} total)", symbols.len());
    }

    // Filter to specific symbols if requested
    if let Some(ref sym_str) = cli.symbols {
        let requested: HashSet<&str> = sym_str.split(',').collect();
        symbols.retain(|(s, _)| requested.contains(s.as_str()));
        if symbols.is_empty() {
            eprintln!("None of the requested symbols found in universe");
            process::exit(1);
        }
    }

    // Determine which years to sync
    let current_year = Utc::now().format("%Y").to_string().parse::<i32>().unwrap();
    let years: Option<HashSet<i32>> = if cli.daily {
        println!("Daily mode: syncing {current_year} only");
        Some([current_year].into())
    } else {
        println!("Full sync: all available history");
        None
    };

    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    // Connect to PDS
    let pds = if !cli.dry_run {
        let h = handle.context("BLUESKY_HANDLE required")?;
        let p = password.context("BLUESKY_APP_PASSWORD required")?;
        Some(PdsClient::new(&http, &h, &p)?)
    } else {
        None
    };

    // Sync
    let total = symbols.len();
    let mut total_written = 0;
    for (i, (symbol, mut meta)) in symbols.into_iter().enumerate() {
        println!("\n[{}/{}] {} ({})", i + 1, total, symbol, meta.name);
        match sync_symbol(&http, pds.as_ref(), &symbol, &mut meta, years.as_ref(), cli.dry_run) {
            Ok(written) => total_written += written,
            Err(e) => eprintln!("    Error syncing {symbol}: {e}"),
        }
    }

    println!("\nDone. Wrote {total_written} records for {total} symbols.");

    if total_written == 0 && !cli.dry_run {
        eprintln!("Error: wrote 0 records — all data sources likely failed. Check API keys and network.");
        process::exit(1);
    }

    Ok(())
}
