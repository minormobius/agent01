/* The Ratchet — the viability solver.
 *
 * One question, asked over and over: **does any future still complete this
 * route?** Because the state graph is acyclic and small, that is answerable
 * exactly by memoised depth-first search — no heuristics, no estimate.
 *
 * From it falls the readout this game exists for. Telegraph can tell you how
 * many of your options this turn were right; that is a local judgement. Here
 * the solver can watch viability flip from true to false and name **the exact
 * choice that killed the run** — which is usually several stages before the
 * player finds out. Nothing else in the family can say that.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var R = NS.RATCHET = NS.RATCHET || {};

  /* A memo is valid for one route only — the stage list is baked into the
     meaning of `at`. Callers keep one per route and reuse it. */
  function newMemo() { return {}; }

  function viable(s, memo) {
    if (s.phase === "won") return true;
    if (s.phase === "lost") return false;
    memo = memo || newMemo();
    var k = R.keyOf(s);
    if (memo[k] !== undefined) return memo[k];

    var actions = R.legalActions(s);
    var ok = false;
    for (var i = 0; i < actions.length; i++) {
      var n = R.cloneState(s);
      if (!R.applyAction(n, actions[i])) continue;
      if (viable(n, memo)) { ok = true; break; }
    }
    memo[k] = ok;
    return ok;
  }

  /* Every legal action from here, each tagged with whether taking it leaves a
     completable route. This is the per-choice tightness: `viable / legal`.

     Note the denominator counts scrapping every distinct tool, which is a real
     option the player can see and take. Excluding "obviously silly" moves would
     flatter the number, and the number is the point. */
  function analyseChoice(s, memo) {
    memo = memo || newMemo();
    var actions = R.legalActions(s);
    var options = [], viableCount = 0;
    for (var i = 0; i < actions.length; i++) {
      var n = R.cloneState(s);
      if (!R.applyAction(n, actions[i])) continue;
      var ok = viable(n, memo);
      if (ok) viableCount++;
      options.push({ action: actions[i], key: R.actionKey(actions[i]), viable: ok });
    }
    return {
      options: options,
      legal: options.length,
      viable: viableCount,
      tightness: options.length ? viableCount / options.length : 0,
      // Was the route still completable *before* this choice? If not, the run
      // was already lost and nothing offered here could have saved it.
      alive: viable(s, memo),
    };
  }

  /* Replay a finished run and find the first choice that took a completable
     route and made it uncompletable. That move, not the last one, is where the
     run ended. */
  function postMortem(initial, history, memo) {
    memo = memo || newMemo();
    var s = R.cloneState(initial);
    var wasViable = viable(s, memo);
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var action = h.action === "pay" ? { type: "pay" } : { type: h.action, tool: h.tool };
      var before = R.cloneState(s);
      var analysis = wasViable ? analyseChoice(before, memo) : null;
      if (!R.applyAction(s, action)) break;
      var nowViable = viable(s, memo);
      if (wasViable && !nowViable) {
        return {
          index: i,
          stage: h.at,
          action: h,
          // How many of the options on the table at that moment would have kept
          // the run alive — the thing the player could have found and didn't.
          survivingOptions: analysis ? analysis.viable : 0,
          legalOptions: analysis ? analysis.legal : 0,
        };
      }
      wasViable = nowViable;
    }
    return null;   // never had a fatal move — either won, or was dead on arrival
  }

  /* Cheapest description of a route's difficulty: the tightness of the opening
     choice, plus whether it is completable at all. Used by the generator to
     accept or repair a route. */
  function rate(state) {
    var memo = newMemo();
    var a = analyseChoice(state, memo);
    return { completable: a.alive, legal: a.legal, viable: a.viable, tightness: a.tightness };
  }

  R.newMemo = newMemo;
  R.viable = viable;
  R.analyseChoice = analyseChoice;
  R.postMortem = postMortem;
  R.rate = rate;
})();
