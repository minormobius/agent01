/* Tessera's leaderboards, read live off ATProto through Orb's portable board
   (../../orb/js/board-kit.js): today's daily and open play, each ranked by
   score and by the longest snake, all time / week / today. A run posts both
   records at once. A module of its own, loaded apart from the game: it needs
   ../../lib/auth.js, which the deploy vendors, and the game must still run if
   it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { OPEN, dailyId, lenId, accept, records, label } from "./score.js";

const today = dailyId(), long = (sel) => !!sel && sel.metric === "length";
window.TESSERA_BOARD = mountBoard({
  site: "tessera", title: "TESSERA", blurb: "read live off ATProto",
  groups: [
    { key: "board", options: [[today, label(today)], [OPEN, label(OPEN)]] },
    { key: "metric", options: [["score", "score"], ["length", "longest snake"]] },
  ],
  gameId: (sel) => long(sel) ? lenId(sel.board) : sel.board, accept, higher: true,
  format: (v, sel) => long(sel) ? v + " long" : v.toLocaleString("en"),
  records: (r) => records(r, r.sel.board),
});
window.dispatchEvent(new Event("tessera-board"));
