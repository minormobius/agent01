// feed.mjs — the Hyperliquid one-second tick.
//
// Three public subscriptions, no key and no account:
//   activeAssetCtx  fires at 1 Hz and carries mid, mark, oracle, funding,
//                   premium and open interest. It is the heartbeat.
//   l2Book          top of book, for the spread we charge and the resting
//                   size imbalance.
//   trades          actual prints with an aggressor side, for taker skew.
//
// The two faster channels are accumulated into mutable "latest" state and
// sampled by the heartbeat, so one tick is emitted per second no matter how
// the channels interleave. Trade volume ACCUMULATES between heartbeats and
// resets on each — a tick's buyVol/sellVol is the last second's flow, not a
// running total, which is what the metric layer assumes.

export const WS_URL = 'wss://api.hyperliquid.xyz/ws';
export const COIN = 'BTC';

/** Pure: fold one websocket message into the running state. Exported for test. */
export function fold(state, msg) {
  if (!msg || !msg.channel) return state;
  if (msg.channel === 'l2Book') {
    const [bids, asks] = msg.data?.levels || [];
    const bid = Number(bids?.[0]?.px), ask = Number(asks?.[0]?.px);
    if (bid > 0 && ask > 0 && ask >= bid) {
      state.bid = bid; state.ask = ask;
      state.spreadBps = (ask - bid) / ((ask + bid) / 2) * 1e4;
      // Resting size across the top five levels each side.
      const sum = (ls) => (ls || []).slice(0, 5).reduce((s, l) => s + Number(l.sz || 0), 0);
      const b = sum(bids), a = sum(asks);
      state.bookImbalance = a > 0 ? b / a : 1;
    }
  } else if (msg.channel === 'trades') {
    for (const tr of msg.data || []) {
      const sz = Number(tr.sz) || 0;
      // Hyperliquid marks the aggressor: B is a buy lifting the offer.
      if (tr.side === 'B') state.buyVol += sz; else state.sellVol += sz;
    }
  } else if (msg.channel === 'activeAssetCtx') {
    const c = msg.data?.ctx;
    if (c) {
      state.mid = Number(c.midPx); state.mark = Number(c.markPx);
      state.oracle = Number(c.oraclePx); state.funding = Number(c.funding);
      state.premium = Number(c.premium); state.openInterest = Number(c.openInterest);
      state.beat = true;
    }
  }
  return state;
}

export function newState() {
  return { mid: 0, mark: 0, oracle: 0, funding: 0, premium: 0, openInterest: 0,
    bid: 0, ask: 0, spreadBps: 0, bookImbalance: 1, buyVol: 0, sellVol: 0, beat: false };
}

/** Pure: take the emitted tick and reset the per-second accumulators. */
export function drain(state, t = Date.now()) {
  const tick = {
    t, mid: state.mid, mark: state.mark, oracle: state.oracle,
    funding: state.funding, premium: state.premium, openInterest: state.openInterest,
    spreadBps: state.spreadBps, bookImbalance: state.bookImbalance,
    buyVol: state.buyVol, sellVol: state.sellVol,
  };
  state.buyVol = 0; state.sellVol = 0; state.beat = false;
  return tick;
}

/**
 * Connect and emit one tick per heartbeat. Returns a handle with stop().
 * Reconnects with backoff, because a dropped socket mid-run is a data gap
 * and the run needs to know rather than quietly flatlining.
 */
export function connect({ onTick, onStatus = () => {}, coin = COIN } = {}) {
  let ws = null, stopped = false, attempt = 0, timer = null;
  const state = newState();

  const open = () => {
    if (stopped) return;
    onStatus({ status: attempt ? 'reconnecting' : 'connecting', attempt });
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      attempt = 0;
      onStatus({ status: 'live' });
      for (const sub of [{ type: 'activeAssetCtx', coin }, { type: 'l2Book', coin }, { type: 'trades', coin }]) {
        ws.send(JSON.stringify({ method: 'subscribe', subscription: sub }));
      }
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      fold(state, msg);
      if (state.beat && state.mid > 0) onTick(drain(state));
    };
    ws.onerror = () => onStatus({ status: 'error' });
    ws.onclose = () => {
      if (stopped) return;
      // 1s, 2s, 4s … capped at 15s.
      const wait = Math.min(15000, 1000 * 2 ** attempt++);
      onStatus({ status: 'dropped', retryInMs: wait });
      timer = setTimeout(open, wait);
    };
  };
  open();
  return {
    stop() { stopped = true; clearTimeout(timer); try { ws?.close(); } catch {} },
    get ready() { return ws?.readyState === 1; },
  };
}

/**
 * Replay a recorded stretch of ticks through the same callback the live
 * socket uses. This is not a test stub: it is how the harness runs without a
 * socket — the same decisions, the same book, the same costs, against a
 * fixed tape. A run you can repeat is the only kind worth comparing.
 */
export function replay(ticks, { onTick, onStatus = () => {}, speed = 1, loop = false } = {}) {
  let i = 0, stopped = false, timer = null;
  const gap = Math.max(20, 1000 / Math.max(0.01, speed));
  onStatus({ status: 'replay', total: ticks.length });
  // A synthetic clock that advances one second per tick regardless of how
  // fast the tape is played. Stamping with Date.now() instead looked live
  // and quietly broke the candles: at speed 14, 180 one-second ticks landed
  // inside 13 seconds of wall time and folded into three five-second
  // buckets. The tape IS one-second data and its stamps have to say so.
  let clock = Date.now();
  const beat = () => {
    if (stopped) return;
    if (i >= ticks.length) {
      if (!loop) { onStatus({ status: 'replay-done', total: ticks.length }); return; }
      i = 0;
    }
    onTick({ ...ticks[i++], t: clock });
    clock += 1000;
    timer = setTimeout(beat, gap);
  };
  timer = setTimeout(beat, 0);
  return { stop() { stopped = true; clearTimeout(timer); }, get ready() { return !stopped; } };
}
