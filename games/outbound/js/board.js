/* Outbound's leaderboard: most depots made, read live off ATProto through
   Orb's portable board (../../orb/js/board-kit.js). Its own module, loaded
   apart from the game: it needs ../../lib/auth.js, which the deploy vendors,
   and the game must still run if it can't load. main.js shows the board's
   buttons once "outbound-board" fires. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, accept, record } from "./score.js";

window.OUTBOUND_BOARD = mountBoard({
  site: "outbound", title: "OUTBOUND", blurb: "most depots made · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => v + (v === 1 ? " depot" : " depots"),
  record,
});
window.dispatchEvent(new Event("outbound-board"));
