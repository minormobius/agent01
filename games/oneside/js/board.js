/* One Side's leaderboard: highest scores, read live off ATProto through
   Orb's portable board (../../orb/js/board-kit.js). A module: it needs
   ../../lib/auth.js, which the deploy vendors. */
import { mountBoard } from "../../orb/js/board-kit.js";
import { GAME, accept } from "./score.js";

window.ONESIDE.board = mountBoard({
  site: "oneside", title: "ONE SIDE", blurb: "highest scores · read live off ATProto", groups: [],
  gameId: () => GAME, accept, higher: true,
  format: (v) => v.toLocaleString("en"),
  record: (r) => ({ value: r.value, unit: "points", higherIsBetter: true, detail: "seed=" + r.seed + " level=" + r.level }),
});
