/* Tessera's leaderboard: highest scores, read live off ATProto through Orb's
   portable board (../../orb/js/board-kit.js). Two boards, today's daily and
   open play, each all time / week / today. A module of its own, loaded apart
   from the game: it needs ../../lib/auth.js, which the deploy vendors, and the
   game must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { OPEN, dailyId, accept, detail, label } from "./score.js";

const today = dailyId();
window.TESSERA_BOARD = mountBoard({
  site: "tessera", title: "TESSERA", blurb: "highest scores · read live off ATProto",
  groups: [{ key: "board", options: [[today, label(today)], [OPEN, label(OPEN)]] }],
  gameId: (sel) => sel.board, accept, higher: true,
  format: (v) => v.toLocaleString("en"),
  record: (r) => ({ value: r.value, unit: "points", higherIsBetter: true, detail: detail(r) }),
});
window.dispatchEvent(new Event("tessera-board"));
