/* Telegraph's leaderboard: sectors held, read live off ATProto through Orb's
   portable board (../../orb/js/board-kit.js). Its own module, loaded apart from
   the game: it needs ../../lib/auth.js, which the deploy vendors, and the game
   must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, SITE, accept, record } from "./score.js";

window.TELEGRAPH_BOARD = mountBoard({
  site: SITE, title: "TELEGRAPH", blurb: "most sectors held · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => v + (v === 1 ? " sector" : " sectors"),
  record,
});
window.dispatchEvent(new Event("telegraph-board"));
