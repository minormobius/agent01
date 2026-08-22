/* ken — thin assets worker.
 *
 * A pure pass-through. There used to be a map from /syllabus to
 * /syllabus.html here, on the assumption that clean URLs needed handling.
 * They do not: Workers Static Assets resolves them itself, and redirects the
 * .html form to the clean one with a 307.
 *
 * This was discovered the embarrassing way. Four edits that were supposed to
 * add /lab, /wp1, /log and /run to that map silently failed to apply, and all
 * four routes worked in production regardless. The map was never load-bearing.
 * Measured on the live site: /lab, /wp1, /log and /run all returned 200 while
 * absent from it, and /run.html returned 307.
 *
 * Keeping a dead map would mean the next person adding a page has to guess
 * whether to update it. So: no map. If a route ever needs real handling, add
 * it here deliberately and give it a test.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
