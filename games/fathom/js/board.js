/* Fathom's leaderboard: the fastest PURE clears (no guesses, no hints), by
   goal and size, read live off ATProto through Orb's portable board
   (../../orb/js/board-kit.js). A module: it needs ../../lib/auth.js, which
   the deploy vendors. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { gameId, accept } from "./score.js";

const F = window.FATHOM;
const id = (sel) => { const c = F.SIZES[sel.size]; return gameId(sel.goal, c.shells * c.per, c.m); };
const clock = (ms) => { const t = ms / 1000, m = Math.floor(t / 60); return m + ":" + (t - m * 60).toFixed(1).padStart(4, "0"); };

F.board = mountBoard({
  site: "fathom", title: "FASTEST", blurb: "pure clears only · no guesses, no hints · read live off ATProto",
  groups: [
    { key: "goal", options: [["dive", "dive"], ["clear", "clear"]] },
    { key: "size", options: Object.keys(F.SIZES).map((k) => [k, k]) },
  ],
  gameId: id, accept, higher: false, format: clock,
  record: (r) => ({ value: Math.round(r.value), unit: "ms", higherIsBetter: false, detail: "seed=" + r.seed + " first=" + r.first + " guesses=0" }),
});
