/* The Ratchet's leaderboard: most routes crossed in a run, read live off
   ATProto through Orb's portable board (../../orb/js/board-kit.js). Its own
   module, loaded apart from the game: it needs ../../lib/auth.js, which the
   deploy vendors, and the game must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, accept, record } from "./score.js";

window.RATCHET.board = mountBoard({
  site: "ratchet", title: "THE RATCHET", blurb: "most routes crossed · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => v + (v === 1 ? " route" : " routes"),
  record,
});
window.dispatchEvent(new Event("ratchet-board"));
