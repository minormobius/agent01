#!/usr/bin/env python3
"""
sync-finance.py — Sync daily financial data to ATProto PDS.

Sources:
  - Tiingo: equities, ETFs (adjusted OHLCV, includes delisted)
  - FRED:   Treasury yields, fed funds, SOFR, oil, gas (public domain)
  - yfinance: commodities futures, indices, fallback equities

Usage:
  # Full historical sync (all years)
  python3 scripts/sync-finance.py --full

  # Daily incremental update (current year only)
  python3 scripts/sync-finance.py --daily

  # Sync specific symbols
  python3 scripts/sync-finance.py --symbols AAPL,MSFT,DGS10

  # Dry run (no PDS writes)
  python3 scripts/sync-finance.py --daily --dry-run

Environment:
  BLUESKY_HANDLE / BLUESKY_APP_PASSWORD  — PDS auth
  TIINGO_API_KEY                          — Tiingo API key
  FRED_API_KEY                            — FRED API key

Dependencies:
  pip install requests yfinance
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, date
from pathlib import Path
from collections import defaultdict

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
UNIVERSE_PATH = REPO_ROOT / "finance" / "universe.json"

COLLECTION = "com.minomobi.finance.dailySeries"
META_COLLECTION = "com.minomobi.finance.security"

PUBLIC_API = "https://public.api.bsky.app"
TIINGO_BASE = "https://api.tiingo.com"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

# Rate limiting
TIINGO_DELAY = 1.5   # seconds between Tiingo calls (50/hr free tier)
FRED_DELAY = 0.2     # FRED is generous
PDS_WRITE_DELAY = 0.1

# ATProto has no float type — prices are integers scaled by PRICE_SCALE
PRICE_SCALE = 10_000

def scale(v):
    """Convert a float price to a scaled integer."""
    return round(v * PRICE_SCALE)


# ---------------------------------------------------------------------------
# ATProto helpers (plain requests, no SDK)
# ---------------------------------------------------------------------------

class PDSClient:
    def __init__(self, handle, app_password):
        self.handle = handle
        self.session = None
        self._create_session(handle, app_password)

    def _create_session(self, handle, password):
        # Resolve handle -> DID
        r = requests.get(f"{PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle",
                         params={"handle": handle})
        r.raise_for_status()
        did = r.json()["did"]

        # Resolve DID -> PDS
        if did.startswith("did:plc:"):
            r = requests.get(f"https://plc.directory/{did}")
        elif did.startswith("did:web:"):
            host = did[len("did:web:"):].replace(":", "/")
            r = requests.get(f"https://{host}/.well-known/did.json")
        else:
            raise ValueError(f"Unsupported DID method: {did}")
        r.raise_for_status()
        doc = r.json()
        svc = next(s for s in doc.get("service", [])
                   if s.get("type") == "AtprotoPersonalDataServer")
        pds = svc["serviceEndpoint"]

        # Create session
        r = requests.post(f"{pds}/xrpc/com.atproto.server.createSession",
                          json={"identifier": handle, "password": password})
        r.raise_for_status()
        self.session = r.json()
        self.session["pds"] = pds
        self.did = self.session["did"]
        self.pds = pds
        print(f"  Authenticated as {handle} ({self.did})")

    def put_record(self, collection, rkey, record):
        """Create or update a record."""
        r = requests.post(
            f"{self.pds}/xrpc/com.atproto.repo.putRecord",
            headers={"Authorization": f"Bearer {self.session['accessJwt']}"},
            json={
                "repo": self.did,
                "collection": collection,
                "rkey": rkey,
                "record": record,
                "validate": False,
            }
        )
        if r.status_code == 400 and "expired" in r.text.lower():
            self._refresh()
            return self.put_record(collection, rkey, record)
        r.raise_for_status()
        return r.json()

    def list_records(self, collection, limit=100, cursor=None):
        params = {"repo": self.did, "collection": collection, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        r = requests.get(
            f"{self.pds}/xrpc/com.atproto.repo.listRecords",
            headers={"Authorization": f"Bearer {self.session['accessJwt']}"},
            params=params
        )
        r.raise_for_status()
        return r.json()

    def _refresh(self):
        r = requests.post(
            f"{self.pds}/xrpc/com.atproto.server.refreshSession",
            headers={"Authorization": f"Bearer {self.session['refreshJwt']}"}
        )
        r.raise_for_status()
        refreshed = r.json()
        self.session.update(refreshed)
        print("  Session refreshed")


# ---------------------------------------------------------------------------
# Data fetchers
# ---------------------------------------------------------------------------

def fetch_tiingo_daily(symbol, api_key, start_date="1990-01-01", end_date=None):
    """Fetch daily adjusted OHLCV from Tiingo."""
    if not end_date:
        end_date = date.today().isoformat()

    headers = {"Content-Type": "application/json",
               "Authorization": f"Token {api_key}"}
    params = {
        "startDate": start_date,
        "endDate": end_date,
        "format": "json",
        "resampleFreq": "daily",
    }

    r = requests.get(f"{TIINGO_BASE}/tiingo/daily/{symbol}/prices",
                     headers=headers, params=params)
    if r.status_code == 404:
        print(f"    Tiingo: {symbol} not found")
        return []
    r.raise_for_status()
    data = r.json()

    bars = []
    for d in data:
        bar = {
            "d": d["date"][:10],  # YYYY-MM-DD
            "o": scale(d.get("adjOpen", d.get("open", 0))),
            "h": scale(d.get("adjHigh", d.get("high", 0))),
            "l": scale(d.get("adjLow", d.get("low", 0))),
            "c": scale(d.get("adjClose", d.get("close", 0))),
        }
        vol = d.get("adjVolume", d.get("volume"))
        if vol is not None and vol > 0:
            bar["v"] = int(vol)
        bars.append(bar)
    return bars


def fetch_tiingo_meta(symbol, api_key):
    """Fetch ticker metadata from Tiingo."""
    headers = {"Content-Type": "application/json",
               "Authorization": f"Token {api_key}"}
    r = requests.get(f"{TIINGO_BASE}/tiingo/daily/{symbol}",
                     headers=headers)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def fetch_fred_series(series_id, api_key, start_date="1950-01-01"):
    """Fetch daily observations from FRED."""
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start_date,
        "sort_order": "asc",
    }
    r = requests.get(FRED_BASE, params=params)
    r.raise_for_status()
    data = r.json()

    bars = []
    for obs in data.get("observations", []):
        if obs["value"] == ".":  # FRED uses "." for missing
            continue
        bars.append({
            "d": obs["date"],
            "c": scale(float(obs["value"])),
        })
    return bars


def fetch_yfinance_daily(symbol, start_date="1990-01-01", end_date=None):
    """Fetch daily OHLCV from yfinance."""
    import yfinance as yf

    if not end_date:
        end_date = date.today().isoformat()

    ticker = yf.Ticker(symbol)
    df = ticker.history(start=start_date, end=end_date, auto_adjust=True)

    if df.empty:
        print(f"    yfinance: {symbol} returned no data")
        return []

    bars = []
    for idx, row in df.iterrows():
        bar = {
            "d": idx.strftime("%Y-%m-%d"),
            "o": scale(float(row["Open"])),
            "h": scale(float(row["High"])),
            "l": scale(float(row["Low"])),
            "c": scale(float(row["Close"])),
        }
        if row.get("Volume", 0) > 0:
            bar["v"] = int(row["Volume"])
        bars.append(bar)
    return bars


# ---------------------------------------------------------------------------
# Grouping and record construction
# ---------------------------------------------------------------------------

def bars_by_year(bars):
    """Group bars into {year: [bars]} dict."""
    groups = defaultdict(list)
    for bar in bars:
        year = int(bar["d"][:4])
        groups[year].append(bar)
    return dict(groups)


def make_rkey(symbol, year):
    """Create a PDS-safe rkey from symbol and year.
    ATProto rkeys: [a-zA-Z0-9._:~-], max 512 chars."""
    safe = symbol.replace("=", "-").replace("^", "").replace("/", "-")
    return f"{safe}:{year}"


def make_series_record(symbol, year, bars, meta):
    """Build a com.minomobi.finance.dailySeries record."""
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
    record = {
        "$type": COLLECTION,
        "symbol": symbol,
        "year": year,
        "seriesType": meta.get("seriesType", "equity"),
        "name": meta.get("name", symbol),
        "priceScale": PRICE_SCALE,
        "bars": bars,
        "source": meta.get("source", "unknown"),
        "adjusted": meta.get("adjusted", True),
        "createdAt": now,
        "updatedAt": now,
    }
    for field in ["currency", "exchange", "sector", "industry"]:
        if field in meta and meta[field]:
            record[field] = meta[field]
    return record


def make_security_record(symbol, meta, bars):
    """Build a com.minomobi.finance.security record."""
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
    record = {
        "$type": META_COLLECTION,
        "symbol": symbol,
        "seriesType": meta.get("seriesType", "equity"),
        "name": meta.get("name", symbol),
        "source": meta.get("source", "unknown"),
        "createdAt": now,
    }
    if bars:
        record["startDate"] = bars[0]["d"]
        record["endDate"] = bars[-1]["d"]
    for field in ["exchange", "sector", "industry", "currency", "tags"]:
        if field in meta and meta[field]:
            record[field] = meta[field]
    return record


# ---------------------------------------------------------------------------
# Universe loading
# ---------------------------------------------------------------------------

def load_universe():
    """Load the universe definition and flatten into a list of (symbol, meta) tuples."""
    with open(UNIVERSE_PATH) as f:
        universe = json.load(f)

    symbols = []

    # Rates (FRED)
    for group_name, group in universe.get("rates", {}).items():
        if group_name.startswith("_"):
            continue
        for sym, info in group.items():
            series_type = "spread" if group_name == "spreads" else "rate"
            symbols.append((sym, {
                "name": info["name"],
                "seriesType": series_type,
                "source": "fred",
                "exchange": "FRED",
                "currency": "USD",
                "tags": ["rates", group_name],
            }))

    # Commodities
    for group_name, group in universe.get("commodities", {}).items():
        for sym, info in group.items():
            source = info.get("source", "yfinance")
            symbols.append((sym, {
                "name": info["name"],
                "seriesType": "commodity",
                "source": source,
                "exchange": info.get("exchange", ""),
                "currency": "USD",
                "tags": ["commodity", group_name],
            }))

    # Indices
    for sym, info in universe.get("indices", {}).items():
        symbols.append((sym, {
            "name": info["name"],
            "seriesType": "index",
            "source": info.get("source", "yfinance"),
            "currency": "USD",
            "tags": ["index"],
        }))

    # Sector ETFs
    for sym, info in universe.get("sector_etfs", {}).items():
        symbols.append((sym, {
            "name": info["name"],
            "seriesType": "etf",
            "source": info.get("source", "tiingo"),
            "currency": "USD",
            "tags": ["etf", "sector"],
        }))

    # Biotech extended
    equities = universe.get("equities", {})
    for sym in equities.get("biotech_extended", []):
        symbols.append((sym, {
            "name": sym,  # will be enriched from Tiingo metadata
            "seriesType": "equity",
            "source": "tiingo",
            "currency": "USD",
            "tags": ["equity", "biotech"],
        }))

    return symbols


def load_sp500_tickers():
    """Load S&P 500 current constituents.
    In GitHub Actions this fetches from fja05680/sp500.
    Locally, falls back to the cached file."""
    cache_path = REPO_ROOT / "finance" / "sp500-constituents.csv"

    # Try fetching from GitHub
    url = "https://raw.githubusercontent.com/fja05680/sp500/master/S%26P%20500%20Historical%20Components%20%26%20Changes(08-01-2024).csv"
    try:
        r = requests.get(url, timeout=10)
        if r.ok:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(r.text)
    except Exception:
        pass

    if not cache_path.exists():
        print("  Warning: No S&P 500 constituent data available")
        return []

    # Parse: the CSV has columns like date, tickers (comma-separated in a field)
    # Actually fja05680 format: each row is a date + comma-separated ticker list
    # Let's just get the most recent row's tickers
    lines = cache_path.read_text().strip().split("\n")
    if len(lines) < 2:
        return []

    # The latest row has the current constituents
    latest = lines[-1]
    # Format: "date,ticker1,ticker2,..."
    parts = latest.split(",")
    tickers = [t.strip() for t in parts[1:] if t.strip()]
    return tickers


# ---------------------------------------------------------------------------
# Main sync logic
# ---------------------------------------------------------------------------

def sync_symbol(pds, symbol, meta, years=None, dry_run=False):
    """Fetch and sync one symbol to PDS."""
    source = meta.get("source", "tiingo")
    tiingo_key = os.environ.get("TIINGO_API_KEY", "")
    fred_key = os.environ.get("FRED_API_KEY", "")

    # Fetch bars
    print(f"  Fetching {symbol} from {source}...")
    try:
        if source == "fred":
            all_bars = fetch_fred_series(symbol, fred_key)
            time.sleep(FRED_DELAY)
        elif source == "tiingo":
            all_bars = fetch_tiingo_daily(symbol, tiingo_key)
            # Enrich name from Tiingo metadata if still placeholder
            if meta.get("name") == symbol:
                tmeta = fetch_tiingo_meta(symbol, tiingo_key)
                if tmeta and tmeta.get("name"):
                    meta["name"] = tmeta["name"]
                if tmeta and tmeta.get("exchangeCode"):
                    meta["exchange"] = tmeta["exchangeCode"]
            time.sleep(TIINGO_DELAY)
        elif source == "yfinance":
            all_bars = fetch_yfinance_daily(symbol)
        else:
            print(f"    Unknown source: {source}")
            return 0
    except Exception as e:
        print(f"    Error fetching {symbol}: {e}")
        return 0

    if not all_bars:
        print(f"    No data for {symbol}")
        return 0

    # Group by year
    yearly = bars_by_year(all_bars)
    if years:
        yearly = {y: b for y, b in yearly.items() if y in years}

    print(f"    {len(all_bars)} bars across {len(yearly)} years")

    if dry_run:
        return len(yearly)

    # Write security metadata
    sec_rkey = symbol.replace("=", "-").replace("^", "").replace("/", "-")
    sec_record = make_security_record(symbol, meta, all_bars)
    try:
        pds.put_record(META_COLLECTION, sec_rkey, sec_record)
    except Exception as e:
        print(f"    Error writing security record: {e}")

    # Write yearly series records
    written = 0
    for year, bars in sorted(yearly.items()):
        rkey = make_rkey(symbol, year)
        record = make_series_record(symbol, year, bars, meta)
        try:
            pds.put_record(COLLECTION, rkey, record)
            written += 1
            time.sleep(PDS_WRITE_DELAY)
        except Exception as e:
            print(f"    Error writing {rkey}: {e}")

    print(f"    Wrote {written} year-records for {symbol}")
    return written


def main():
    parser = argparse.ArgumentParser(description="Sync financial data to ATProto PDS")
    parser.add_argument("--full", action="store_true", help="Full historical sync")
    parser.add_argument("--daily", action="store_true", help="Incremental daily update (current year)")
    parser.add_argument("--symbols", help="Comma-separated symbols to sync")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write to PDS")
    parser.add_argument("--account", default="main",
                        choices=["main", "modulo", "morphyx"],
                        help="Which Bluesky account to write to")
    parser.add_argument("--include-sp500", action="store_true",
                        help="Include S&P 500 constituents (slow: ~500 tickers)")
    args = parser.parse_args()

    if not args.full and not args.daily and not args.symbols:
        parser.print_help()
        sys.exit(1)

    # Resolve account credentials
    if args.account == "main":
        handle = os.environ.get("BLUESKY_HANDLE")
        password = os.environ.get("BLUESKY_APP_PASSWORD")
    elif args.account == "modulo":
        handle = os.environ.get("BLUESKY_MODULO_HANDLE")
        password = os.environ.get("BLUESKY_MODULO_APP_PASSWORD")
    elif args.account == "morphyx":
        handle = os.environ.get("BLUESKY_MORPHYX_HANDLE")
        password = os.environ.get("BLUESKY_MORPHYX_APP_PASSWORD")

    # Load universe
    symbols = load_universe()

    # Optionally add S&P 500
    if args.include_sp500:
        sp500 = load_sp500_tickers()
        existing = {s for s, _ in symbols}
        for ticker in sp500:
            if ticker not in existing:
                symbols.append((ticker, {
                    "name": ticker,
                    "seriesType": "equity",
                    "source": "tiingo",
                    "currency": "USD",
                    "tags": ["equity", "sp500"],
                }))
        print(f"  Added {len(sp500)} S&P 500 tickers ({len(symbols)} total)")

    # Filter to specific symbols if requested
    if args.symbols:
        requested = set(args.symbols.split(","))
        symbols = [(s, m) for s, m in symbols if s in requested]
        if not symbols:
            print(f"None of {requested} found in universe")
            sys.exit(1)

    # Determine which years to sync
    current_year = date.today().year
    years = None
    if args.daily:
        years = {current_year}
        print(f"Daily mode: syncing {current_year} only")
    else:
        print(f"Full sync: all available history")

    # Connect to PDS
    pds = None
    if not args.dry_run:
        if not handle or not password:
            print("Error: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD required")
            sys.exit(1)
        pds = PDSClient(handle, password)

    # Sync
    total_written = 0
    for i, (symbol, meta) in enumerate(symbols):
        print(f"\n[{i+1}/{len(symbols)}] {symbol} ({meta.get('name', '')})")
        written = sync_symbol(pds, symbol, meta, years=years, dry_run=args.dry_run)
        total_written += written

    print(f"\nDone. Wrote {total_written} records for {len(symbols)} symbols.")


if __name__ == "__main__":
    main()
