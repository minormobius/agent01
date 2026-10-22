/* PLATEAU's leaderboards, read live off ATProto through Orb's portable board
   (../../orb/js/board-kit.js): today's foam and any foam, by distance, all
   time / week / today. A module of its own, loaded apart from the game: it
   needs ../../lib/auth.js, which the deploy vendors, and the game must still
   run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { OPEN, dailyId, accept, record, label } from "./score.js";

const today = dailyId();
window.PLATEAU_BOARD = mountBoard({
  site: "plateau", title: "PLATEAU", blurb: "furthest through the foam · read live off ATProto",
  groups: [{ key: "board", options: [[today, label(today)], [OPEN, label(OPEN)]] }],
  gameId: (sel) => sel.board, accept, higher: true,
  format: (v) => v.toLocaleString("en") + " m",
  record,
});
window.dispatchEvent(new Event("plateau-board"));
