/* Ziggurat's leaderboard: highest scores, read live off ATProto through Orb's
   portable board (../../orb/js/board-kit.js). Its own module, loaded apart
   from the game: it needs ../../lib/auth.js, which the deploy vendors, and
   the game must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, accept, record } from "./score.js";

window.ZIG_BOARD = mountBoard({
  site: "ziggurat", title: "ZIGGURAT", blurb: "highest scores · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => v.toLocaleString("en"),
  record,
});
window.dispatchEvent(new Event("ziggurat-board"));
