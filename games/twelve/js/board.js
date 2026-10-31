/* Twelve's leaderboards, read live off ATProto through Orb's portable board
   (../../orb/js/board-kit.js): best score on each board and flow, all time /
   week / today. Its own module, loaded apart from the game: it needs
   ../../lib/auth.js, which the deploy vendors, and the game must still run
   if it can't load. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { SLOTS, gameId, accept, records, label } from "./score.js";

window.TWELVE_BOARD = mountBoard({
  site: "twelve", title: "TWELVE", blurb: "highest scores · read live off ATProto",
  groups: [{ key: "board", options: SLOTS.map((s) => [s, label(s)]) }],
  gameId: (sel) => gameId(SLOTS.indexOf(sel.board) >= 0 ? sel.board : SLOTS[0]), accept, higher: true,
  format: (v) => v.toLocaleString("en"),
  records,
});
window.dispatchEvent(new Event("twelve-board"));
