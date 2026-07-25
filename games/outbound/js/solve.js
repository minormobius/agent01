/* Outbound — the viability solver.
 *
 * One question, asked after every choice: **can this haul still be finished?**
 * The state graph is acyclic (see the note in rules.js — every action either
 * advances a stage or strictly spends fuel), so that is answerable exactly by
 * memoised depth-first search. No heuristics, no estimate.
 *
 * From it falls the readout the game exists for: the ceiling can only fall, so
 * every drop in it is a decision that cost you the haul, and the FIRST drop is
 * where the run really ended — usually several systems before anyone noticed.
 *
 * Inherited whole from The Ratchet. The mechanic was always right; what needed
 * rebuilding was everything around it.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var O = NS.OUTBOUND = NS.OUTBOUND || {};

  function newMemo() { return {}; }

  function viable(s, memo) {
    if (s.phase === "arrived") return true;
    if (s.phase === "lost") return false;
    memo = memo || newMemo();
    var k = O.keyOf(s);
    if (memo[k] !== undefined) return memo[k];

    var actions = O.legalActions(s);
    var ok = false;
    for (var i = 0; i < actions.length; i++) {
      var n = O.cloneState(s);
      if (!O.applyAction(n, actions[i])) continue;
      if (viable(n, memo)) { ok = true; break; }
    }
    memo[k] = ok;
    return ok;
  }

  /* Every legal action here, tagged with whether taking it leaves a finishable
     haul. `viable / legal` is the per-choice tightness.

     The denominator counts every option the player can actually see and take,
     including obviously poor ones. Filtering to "sensible" moves would flatter
     the number, and the number is the point. */
  function analyseChoice(s, memo) {
    memo = memo || newMemo();
    var actions = O.legalActions(s);
    var options = [], ok = 0;
    for (var i = 0; i < actions.length; i++) {
      var n = O.cloneState(s);
      if (!O.applyAction(n, actions[i])) continue;
      var good = viable(n, memo);
      if (good) ok++;
      options.push({ action: actions[i], key: O.actionKey(actions[i]), viable: good });
    }
    return {
      options: options, legal: options.length, viable: ok,
      tightness: options.length ? ok / options.length : 0,
      alive: viable(s, memo),
    };
  }

  /* Replay a finished haul and find the first choice that took a finishable
     route and made it unfinishable. That decision, not the last one, is where
     the run ended. */
  function postMortem(initial, history, memo) {
    memo = memo || newMemo();
    var s = O.cloneState(initial);
    var wasViable = viable(s, memo);
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var action = h.action === "send" ? { type: "send", crew: h.crew }
        : h.action === "rest" ? { type: "rest", crew: h.crew } : { type: "burn" };
      var before = O.cloneState(s);
      var analysis = wasViable ? analyseChoice(before, memo) : null;
      if (!O.applyAction(s, action)) break;
      var nowViable = viable(s, memo);
      if (wasViable && !nowViable) {
        return {
          index: i, stage: h.at, action: h,
          survivingOptions: analysis ? analysis.viable : 0,
          legalOptions: analysis ? analysis.legal : 0,
        };
      }
      wasViable = nowViable;
    }
    return null;
  }

  /* The tightest moment on a perfect crossing: fly the haul making only moves
     that keep it finishable, and report the narrowest that any choice along the
     way ever got.

     This exists because rating the OPENING is close to useless — the first
     system is deliberately forgiving, the squeeze is supposed to arrive later
     when the crew is worn and the road is not. Generating against the opening
     produced hauls where 63% of all decisions had no wrong answer at all.
     Choices with a single legal option are skipped: a corridor is not a
     question, and counting it as one at 100% flatters the number. */
  function narrowest(s, memo) {
    memo = memo || newMemo();
    var cur = O.cloneState(s), min = 1, guard = 0;
    while (cur.phase === "travel" && guard++ < 120) {
      var a = analyseChoice(cur, memo);
      if (a.legal > 1) min = Math.min(min, a.tightness);
      var good = null;
      for (var i = 0; i < a.options.length; i++) if (a.options[i].viable) { good = a.options[i]; break; }
      if (!good) break;
      var next = O.cloneState(cur);
      O.applyAction(next, good.action);
      cur = next;
    }
    return min;
  }

  function rate(state) {
    var memo = newMemo();
    var a = analyseChoice(state, memo);
    return { completable: a.alive, legal: a.legal, viable: a.viable, tightness: a.tightness };
  }

  O.newMemo = newMemo;
  O.viable = viable;
  O.analyseChoice = analyseChoice;
  O.narrowest = narrowest;
  O.postMortem = postMortem;
  O.rate = rate;
})();
