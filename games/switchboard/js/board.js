/* Switchboard's leaderboards, read live off ATProto through Orb's portable
   board (../../orb/js/board-kit.js): the run's points, and how close the run
   came to the exact optimum (js/score.js says why both). A module, loaded
   apart from the game: it needs ../../lib/auth.js, which the deploy vendors,
   and the game must still run if it can't load. main.js shows its buttons
   on the "switchboard-board" event. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { BOARDS, accept, records, label, format } from "./score.js";

const S = window.SWITCHBOARD;
const before = new Set(document.body.children);
S.board = mountBoard({
  site: "switchboard", title: "SWITCHBOARD", blurb: "read live off ATProto",
  groups: [{ key: "metric", options: Object.keys(BOARDS).map((k) => [k, label[k]]) }],
  gameId: (sel) => BOARDS[sel.metric] || BOARDS.points, accept, higher: true,
  format, records,
});
// the overlay the kit just added, so the game can pause while it is open
S.boardEl = Array.from(document.body.children).find((n) => !before.has(n) && n.classList.contains("lbk")) || null;
window.dispatchEvent(new Event("switchboard-board"));
