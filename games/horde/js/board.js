/* Hold the Line's leaderboard: the wave the wall fell on, read live off
   ATProto through Orb's portable board (../../orb/js/board-kit.js), all
   time / week / today. A module of its own, loaded apart from the game: it
   needs ../../lib/auth.js, which the deploy vendors, and the game must still
   run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, accept, record } from "./score.js";

window.HORDE_BOARD = mountBoard({
  site: "horde", title: "HOLD THE LINE", blurb: "furthest wave · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => "wave " + v,
  record,
});
window.dispatchEvent(new Event("horde-board"));
