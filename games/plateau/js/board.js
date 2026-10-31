/* PLATEAU's leaderboards, read live off ATProto through Orb's portable board
   (../../orb/js/board-kit.js): for each seed crystal (the modes), today's foam
   and any foam, by distance, all time / week / today. A module of its own,
   loaded apart from the game: it needs ../../lib/auth.js, which the deploy
   vendors, and the game must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { MODES, MODE_LABEL, openId, dailyId, accept, record } from "./score.js";

window.PLATEAU_BOARD = mountBoard({
  site: "plateau", title: "PLATEAU", blurb: "furthest through the foam · read live off ATProto",
  groups: [
    { key: "mode", options: MODES.map((m) => [m, MODE_LABEL[m]]) },
    { key: "board", options: [["daily", "today's foam"], ["open", "any foam"]] },
  ],
  gameId: (sel) => (sel.board === "open" ? openId(sel.mode) : dailyId(undefined, sel.mode)), accept, higher: true,
  format: (v) => v.toLocaleString("en") + " m",
  record,
});
window.dispatchEvent(new Event("plateau-board"));
