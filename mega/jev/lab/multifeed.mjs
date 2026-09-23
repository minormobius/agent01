// multifeed.mjs — three tapes on one socket.
//
// Hyperliquid's websocket takes several subscriptions on one connection, so a
// second and third asset costs one more subscribe message each, not another
// socket. Each asset keeps its own accumulator state; the heartbeat for an
// asset emits that asset's tick.
//
// WHAT THIS IS FOR, and what it deliberately is not. It does not trade. The
// relative-value case is dead on arithmetic — measured over 3.5 days of minute
// bars, the majors move together ~76% of the time, the leader changes in
// 61-70% of windows, and the median best-vs-worst spread is 4.1bp over a
// minute against ~19bp for the two round trips a pair costs. Nothing here
// opens a position.
//
// It is here so the page can ask the one market question that HAS an answer:
// which of these three is doing what, right now. See cross.mjs.
import { newState, fold, drain } from './feed.mjs';

const WS_URL = 'wss://api.hyperliquid.xyz/ws';
export const UNIVERSE = ['BTC', 'ETH', 'SOL'];

/**
 * Connect once and emit `onTick(coin, tick)` per asset heartbeat.
 *
 * The socket is shared but the STATE IS NOT: each coin folds into its own
 * accumulator, so one asset's trade flow can never leak into another's taker
 * skew. That would be the most flattering possible bug in a cross-sectional
 * comparison — three assets that look correlated because they are literally
 * sharing a number — so the split is the point rather than an implementation
 * detail.
 */
export function connectMany({ onTick, onStatus = () => {}, coins = UNIVERSE } = {}) {
  let ws = null, stopped = false, attempt = 0, timer = null;
  const states = Object.fromEntries(coins.map((c) => [c, newState()]));

  const open = () => {
    if (stopped) return;
    onStatus({ status: attempt ? 'reconnecting' : 'connecting', attempt, coins });
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      attempt = 0;
      onStatus({ status: 'live', coins });
      for (const coin of coins) {
        for (const type of ['activeAssetCtx', 'l2Book', 'trades']) {
          ws.send(JSON.stringify({ method: 'subscribe', subscription: { type, coin } }));
        }
      }
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      for (const [coin, part] of routeMessage(msg, coins)) {
        const st = states[coin];
        if (!st) continue;
        fold(st, part);
        if (st.beat && st.mid > 0) onTick(coin, drain(st));
      }
    };
    ws.onerror = () => onStatus({ status: 'error' });
    ws.onclose = () => {
      if (stopped) return;
      const wait = Math.min(15000, 1000 * 2 ** attempt++);
      onStatus({ status: 'dropped', retryInMs: wait, coins });
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
 * Split one socket message into per-asset messages.
 *
 * With a single subscription this did not exist; with three it is the whole
 * correctness question, because a message folded into the wrong accumulator is
 * a silent corruption that looks exactly like a real cross-asset signal —
 * three assets appearing to move together because they are literally sharing a
 * number. That is the most flattering bug available here, so this routes
 * explicitly and drops what it cannot place.
 *
 * Verified against the live socket rather than assumed:
 *
 *   activeAssetCtx  { data: { coin, ctx } }        -> data.coin
 *   l2Book          { data: { coin, time, levels } } -> data.coin
 *   trades          { data: [ { coin, side, px, sz, ... } ] } -> per element
 *
 * `trades` arrives as an ARRAY, and is split by each fill's own coin rather
 * than routed wholesale by the first element's. Hyperliquid sends one array
 * per subscription so in practice they are uniform, but a mixed batch routed
 * by its head would put one asset's aggressor flow into another's taker skew,
 * and nothing downstream could ever detect it.
 */
export function routeMessage(msg, coins = UNIVERSE) {
  const d = msg?.data;
  if (!msg?.channel || !d) return [];
  if (Array.isArray(d)) {
    const byCoin = new Map();
    for (const item of d) {
      const c = item?.coin;
      if (!c || !coins.includes(c)) continue;
      if (!byCoin.has(c)) byCoin.set(c, []);
      byCoin.get(c).push(item);
    }
    return [...byCoin].map(([c, items]) => [c, { ...msg, data: items }]);
  }
  const c = d.coin;
  return c && coins.includes(c) ? [[c, msg]] : [];
}
