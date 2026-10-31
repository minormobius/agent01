/* Tempest's leaderboard: the best runs, read live off ATProto through Orb's
   portable board (../../orb/js/board-kit.js). A module of its own, loaded
   apart from the game: it needs ../../lib/auth.js, which the deploy vendors,
   and the game must still run if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, accept, records } from "./score.js";

window.TEMPEST_BOARD = mountBoard({
  site: "tempest", title: "TEMPEST", blurb: "best runs · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => v.toLocaleString("en"),
  records,
});
window.dispatchEvent(new Event("tempest-board"));
