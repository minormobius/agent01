/* Molt's leaderboards, read live off ATProto through Orb's portable board
   (../../orb/js/board-kit.js): best score, longest snake and deepest molt,
   each all time / week / today. A run posts all three at once. Its own
   module, loaded apart from the game: it needs ../../lib/auth.js, which the
   deploy vendors, and the game must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { BOARDS, accept, records, label } from "./score.js";

window.MOLT_BOARD = mountBoard({
  site: "molt", title: "MOLT", blurb: "read live off ATProto",
  groups: [{ key: "metric", options: Object.keys(BOARDS).map((k) => [k, label[k]]) }],
  gameId: (sel) => BOARDS[sel.metric] || BOARDS.score, accept, higher: true,
  format: (v, sel) => (sel && sel.metric === "length" ? v + " long" : sel && sel.metric === "depth" ? "depth " + v : v.toLocaleString("en")),
  records,
});
window.dispatchEvent(new Event("molt-board"));
