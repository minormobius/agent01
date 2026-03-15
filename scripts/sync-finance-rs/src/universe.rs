//! Universe loader — reads finance/universe.json and flattens into symbol list.

use std::path::Path;

use anyhow::{Context, Result};
use serde_json::Value;

#[derive(Debug, Clone, Default)]
pub struct SymbolMeta {
    pub name: String,
    pub series_type: String,
    pub source: String,
    pub exchange: Option<String>,
    pub currency: Option<String>,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub tags: Option<Vec<String>>,
    pub adjusted: Option<bool>,
}

pub fn load_universe(path: &Path) -> Result<Vec<(String, SymbolMeta)>> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    let universe: Value = serde_json::from_str(&text)?;
    let mut symbols = Vec::new();

    // Rates (FRED)
    if let Some(rates) = universe.get("rates").and_then(|v| v.as_object()) {
        for (group_name, group) in rates {
            if group_name.starts_with('_') {
                continue;
            }
            let group_obj = match group.as_object() {
                Some(o) => o,
                None => continue,
            };
            let series_type = if group_name == "spreads" {
                "spread"
            } else {
                "rate"
            };
            for (sym, info) in group_obj {
                let name = info["name"].as_str().unwrap_or(sym).to_string();
                symbols.push((
                    sym.clone(),
                    SymbolMeta {
                        name,
                        series_type: series_type.into(),
                        source: "fred".into(),
                        exchange: Some("FRED".into()),
                        currency: Some("USD".into()),
                        tags: Some(vec!["rates".into(), group_name.clone()]),
                        ..Default::default()
                    },
                ));
            }
        }
    }

    // Commodities
    if let Some(comms) = universe.get("commodities").and_then(|v| v.as_object()) {
        for (group_name, group) in comms {
            let group_obj = match group.as_object() {
                Some(o) => o,
                None => continue,
            };
            for (sym, info) in group_obj {
                let source = info
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("yfinance");
                symbols.push((
                    sym.clone(),
                    SymbolMeta {
                        name: info["name"].as_str().unwrap_or(sym).to_string(),
                        series_type: "commodity".into(),
                        source: source.into(),
                        exchange: info.get("exchange").and_then(|v| v.as_str()).map(String::from),
                        currency: Some("USD".into()),
                        tags: Some(vec!["commodity".into(), group_name.clone()]),
                        ..Default::default()
                    },
                ));
            }
        }
    }

    // Indices
    if let Some(indices) = universe.get("indices").and_then(|v| v.as_object()) {
        for (sym, info) in indices {
            let source = info
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("yfinance");
            symbols.push((
                sym.clone(),
                SymbolMeta {
                    name: info["name"].as_str().unwrap_or(sym).to_string(),
                    series_type: "index".into(),
                    source: source.into(),
                    currency: Some("USD".into()),
                    tags: Some(vec!["index".into()]),
                    ..Default::default()
                },
            ));
        }
    }

    // Sector ETFs
    if let Some(etfs) = universe.get("sector_etfs").and_then(|v| v.as_object()) {
        for (sym, info) in etfs {
            let source = info
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("tiingo");
            symbols.push((
                sym.clone(),
                SymbolMeta {
                    name: info["name"].as_str().unwrap_or(sym).to_string(),
                    series_type: "etf".into(),
                    source: source.into(),
                    currency: Some("USD".into()),
                    tags: Some(vec!["etf".into(), "sector".into()]),
                    ..Default::default()
                },
            ));
        }
    }

    // Biotech extended equities
    if let Some(equities) = universe.get("equities").and_then(|v| v.as_object()) {
        if let Some(biotech) = equities.get("biotech_extended").and_then(|v| v.as_array()) {
            for ticker_val in biotech {
                if let Some(sym) = ticker_val.as_str() {
                    symbols.push((
                        sym.to_string(),
                        SymbolMeta {
                            name: sym.to_string(), // enriched from Tiingo meta later
                            series_type: "equity".into(),
                            source: "tiingo".into(),
                            currency: Some("USD".into()),
                            tags: Some(vec!["equity".into(), "biotech".into()]),
                            ..Default::default()
                        },
                    ));
                }
            }
        }
    }

    Ok(symbols)
}

pub fn load_sp500_tickers(repo_root: &Path) -> Result<Vec<String>> {
    let cache_path = repo_root.join("finance").join("sp500-constituents.csv");

    // Try fetching from GitHub
    let url = "https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes(08-01-2024).csv";
    if let Ok(resp) = reqwest::blocking::get(url) {
        if resp.status().is_success() {
            if let Ok(text) = resp.text() {
                let _ = std::fs::create_dir_all(cache_path.parent().unwrap());
                let _ = std::fs::write(&cache_path, &text);
            }
        }
    }

    if !cache_path.exists() {
        println!("  Warning: No S&P 500 constituent data available");
        return Ok(vec![]);
    }

    let text = std::fs::read_to_string(&cache_path)?;
    let lines: Vec<&str> = text.trim().lines().collect();
    if lines.len() < 2 {
        return Ok(vec![]);
    }

    // Latest row: "date,ticker1,ticker2,..."
    let latest = lines.last().unwrap();
    let tickers: Vec<String> = latest
        .split(',')
        .skip(1)
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    Ok(tickers)
}
