// Thin client for the worker backend (/api/*). Every call is best-effort: the
// store falls back to localStorage for runs and surfaces errors for data loads,
// so the playground keeps working if the backend is unavailable.

import type { RunRecord } from "../harness/types";

export interface BtcCandle {
  t: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PmSnapshot {
  ts: string;
  market: string;
  asset_price: number | null;
  strike: number | null;
  implied_prob: number | null;
  close_time: string | null;
}

export async function fetchBtcCandles(): Promise<BtcCandle[]> {
  const r = await fetch("/api/btc/candles");
  if (!r.ok) throw new Error(`btc candles ${r.status}`);
  const data = await r.json();
  return (data.candles || []) as BtcCandle[];
}

export async function fetchPmSnapshots(market?: string): Promise<PmSnapshot[]> {
  const q = market ? `?market=${encodeURIComponent(market)}` : "";
  const r = await fetch(`/api/pm/snapshots${q}`);
  if (!r.ok) throw new Error(`pm snapshots ${r.status}`);
  const data = await r.json();
  return (data.snapshots || []) as PmSnapshot[];
}

export async function apiListRuns(): Promise<RunRecord[] | null> {
  try {
    const r = await fetch("/api/runs?limit=50");
    if (!r.ok) return null;
    const data = await r.json();
    return (data.runs || []) as RunRecord[];
  } catch {
    return null;
  }
}

export async function apiSaveRun(rec: RunRecord): Promise<boolean> {
  try {
    const r = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rec),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function apiDeleteRun(id: string): Promise<void> {
  try {
    await fetch(`/api/runs/${id}`, { method: "DELETE" });
  } catch {
    /* best-effort */
  }
}
