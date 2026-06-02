/* borges — THE ENGINE. Page number in, whole tale out.

   This is where a robot's structured habit becomes a story. Given a page n it
   rolls a deterministic world (teller, country, frame, cast, furniture),
   threads the Propp spine, scatters the motifs, and — because the robots have
   read every ending and are bored of most of them — shakes a few bones loose
   on purpose and writes down exactly which ones it broke. The output is shaped
   to match the annotated tales on read.mino.mobi limb for limb, so the very
   same Propp / motif / character-web / mythograph renderers light it up.

   The robot posts all of this (the spec) to the Tabard before it speaks; then
   it speaks (the telling). Both come out of this one call, fully determined by
   n. Attaches to BORGES.generate(n). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};

  // ── act metadata: how Propp acts group into movements ──
  var ACTS = {
    setup:        { label: "The setting and the first wrong", color: "#d6a93f", titles: ["%PLACE% and the opening breach", "The good days, and the wrong that ended them", "How it stood, and how it broke"] },
    complication: { label: "The trick and the lack", color: "#c98aa6", titles: ["The fair face and the hook beneath", "The lack that walked the land", "The snare set in %PLACE%"] },
    journey:      { label: "The road and the donor", color: "#7fb3a0", titles: ["The road out, and who stood on it", "The donor's small strange test", "Toward %PLACE2%, and the gift on the way"] },
    ordeal:       { label: "The struggle and the winning", color: "#c25b4a", titles: ["The meeting at the ford", "%CREATURE%, and the one blow", "The struggle in %PLACE2%"] },
    homecoming:   { label: "The long road home", color: "#9fb0c9", titles: ["Homeward, and the chase behind", "The false claim in the empty hall", "The road home, which is the harder country"] },
    recognition:  { label: "The proof, the truth, the wedding", color: "#7fb37f", titles: ["The task that sorts true from false", "The truth, and the face it wore", "The naming, and the feast"] }
  };
  var ACT_ORDER = ["setup", "complication", "journey", "ordeal", "homecoming", "recognition"];

  // movement titles keyed to the leading Propp beat (so titles stay true under any
  // frame ordering). Several beats carry variants to keep a braided tale's repeats apart.
  var MVT_TITLE = {
    "first-function": ["%place% and the setting of it", "How it stood at %place%"],
    "absentation": ["The one taken in the dark", "The empty place at the board"],
    "interdiction": ["The one thing forbidden", "The word laid down"],
    "violation": ["The word broken", "The forbidden thing done"],
    "reconnaissance": ["The scouting of the ground", "The soft questions at the gate"],
    "trickery": ["The fair-seeming snare", "The hook in the bargain"],
    "complicity": ["The trap shut", "The boon granted unread"],
    "villainy": ["The harm done", "The lack that walked the land"],
    "mediation": ["The lack made known", "The word that sent the hero"],
    "counteraction": ["The quest taken up", "The road resolved on"],
    "departure": ["The road out", "Toward %place2%"],
    "donor": ["The donor on the road", "The toll the road takes"],
    "reaction": ["The hero's answer", "The kind thing done"],
    "receipt": ["The gift in hand", "What the donor gave"],
    "guidance": ["The way to %place2%", "Brought to %place2%"],
    "struggle": ["The struggle at the ford", "The meeting at %place2%", "%creature% met at last"],
    "branding": ["The mark taken", "The wound that told the tale"],
    "victory": ["The one blow", "The winning of it", "The creature down"],
    "liquidation": ["The lack set right", "The thing made whole"],
    "return": ["The road home", "Homeward, the harder country"],
    "pursuit": ["The chase across %place2%", "The thing that gained behind"],
    "rescue": ["The river thrown up behind", "The second use of the gift"],
    "unfounded-claims": ["The false claim in the hall", "The stolen boast"],
    "difficult-task": ["The task that sorts true from false", "The proof set on the table"],
    "solution": ["The task done at first asking", "The impossible thing made easy"],
    "recognition": ["The recognition", "The knowing run round the hall"],
    "exposure": ["The lie undone", "The false hand found out"],
    "transfiguration": ["The making-new", "The true name spoken"],
    "punishment": ["The reckoning", "The wage of the wrong"],
    "wedding": ["The wedding at %place%", "The feast and the crowning"]
  };

  // what each frame is "about" — announced in the proem, so the opening matches the plot
  var SUBJECT = {
    quest: "the winning of %object%",
    bride: "how %heroine% was won by the asking",
    calumny: "the lie at the gate, and the long penance after",
    beheading: "the one blow, and the year between the giving and the taking",
    descent: "the road down past the last door, and the long way back",
    trickster: "how %object% was got by the cleverer hand",
    dragon: "the slaying of %creature% at the water",
    taboo: "the one thing forbidden, and the breaking of it",
    swanmaiden: "the bride who flew, and was won a second time",
    ogretasks: "the hard tasks set for %heroine%'s hand",
    masterflight: "the flight out of the house of %creature%",
    twobrothers: "the deed, and the false hand that claimed it",
    fateddoom: "the doom laid on %hero%, and the running from it",
    ashlad: "how the least of the hall came to the most",
    chastitywager: "the wager laid on %heroine%, and how the lie came undone",
    braided: "the two turnings of %hero%, the one cast and the second"
  };

  var PRON = { male: { s: "he", o: "him", p: "his" }, female: { s: "she", o: "her", p: "her" } };

  // Greimas actantial model: per frame, what the Subject desires (the Object), the
  // value it stands for, and what kind of force opposes. The rest of the actants
  // (Sender, Receiver, Helper, Opponent) are read off the rolled cast.
  var DESIRE = {
    quest: { object: "%object%", value: "the made-whole: what was lost, restored", opp: "villain" },
    bride: { object: "%heroine%", value: "union, and the line continued", opp: "villain" },
    calumny: { object: "the cleared name", value: "the truth, against a settled lie", opp: "lie" },
    beheading: { object: "the word kept", value: "the spoken word as a binding thing", opp: "villain" },
    descent: { object: "the one taken back", value: "recovery, up out of the dark", opp: "villain" },
    trickster: { object: "%object%", value: "wit over force; the world rebalanced", opp: "villain" },
    dragon: { object: "the freed land", value: "order set over the monstrous", opp: "creature" },
    taboo: { object: "the harmony restored", value: "the limit honoured, or paid for", opp: "fate" },
    swanmaiden: { object: "%heroine%", value: "the loved thing, lost and won a second time", opp: "fate" },
    ogretasks: { object: "%heroine%", value: "union won past the impossible", opp: "villain" },
    masterflight: { object: "the way out", value: "freedom taken from the keeper", opp: "villain" },
    twobrothers: { object: "the deed acknowledged", value: "the true set above the false", opp: "false" },
    fateddoom: { object: "escape from the fixed hour", value: "the limit itself: desired against, never reached", opp: "fate" },
    ashlad: { object: "the rightful place", value: "the least of the hall raised to the most", opp: "villain" },
    chastitywager: { object: "the cleared name", value: "faith proved against the wager", opp: "lie" },
    braided: { object: "the ends of both trials", value: "the wheel of trial, turned twice over", opp: "villain" }
  };

  function toRoman(n) { var m = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]; return m[n] || ("" + n); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function aWord(s) { return /^[aeiou]/i.test(s) ? "an " : "a "; }
  // ensure a string reads as one clean sentence: trimmed, single terminal stop
  function sentence(s) { s = String(s).trim().replace(/\s+([.,;:!?])/g, "$1"); if (!/[.!?…]$/.test(s)) s += "."; return cap(s); }
  // join sentence fragments with single stops between them
  function join() { var out = []; for (var i = 0; i < arguments.length; i++) { var a = String(arguments[i] || "").trim(); if (a) out.push(a.replace(/[.\s]+$/, "")); } return out.join(". ") + "."; }
  function stripArticle(s) { return String(s).replace(/^(a |an |the )/i, ""); }
  function stripPunct(s) { return String(s).trim().replace(/[.\s]+$/, ""); }

  function generate(n) {
    n = Math.max(1, Math.floor(n));
    var lex = B.lex, tel = B.tellers, Rand = B.prng.Rand;
    var seedStr = "borges::book-of-sand::" + n;
    var rand = Rand(seedStr);

    // ── teller ──
    var teller = tel.forTale(n, rand.fork("teller"));

    // ── culture (primary furniture) + maybe a cross-cultural transplant ──
    var cr = rand.fork("culture");
    var primaryId = cr.pick(teller.affinity.cultures);
    var primary = lex.CULTURES[primaryId];
    var remixes = [];
    var secondary = null;
    if (cr.chance(0.34)) {
      var allIds = Object.keys(lex.CULTURES).filter(function (k) { return k !== primaryId; });
      secondary = lex.CULTURES[cr.pick(allIds)];
      remixes.push({ kind: "transplant", syms: "↔", label: "Cross-cultural transplant",
        text: "The bones are " + primary.label + " but " + teller.name + " has imported furniture from the " + secondary.label + " reels — a creature, a place, or an object set down in the wrong country for the pleasure of the seam." });
    }

    // ── tale-type frame, weighted by teller × frame motif affinity ──
    var fr = rand.fork("frame");
    var frame = fr.pickWeighted(lex.TALETYPES, function (f) {
      var w = 1;
      for (var c in f.motifBias) w += (f.motifBias[c] || 0) * (teller.affinity.motifClasses[c] || 0.5);
      return w;
    });

    // ── world furniture ──
    var wr = rand.fork("world");
    function fromCulture(field, useSecondary) {
      var src = (useSecondary && secondary) ? secondary : primary;
      return wr.pick(src[field]);
    }
    var world = {
      term: wr.pick(lex.FILL.term),
      number: wr.pick(lex.FILL.number),
      quest: wr.pick(lex.FILL.quest),
      honorific: primary.honorific,
      setting: primary.settingLine,
      place: fromCulture("place", false),
      place2: fromCulture("place", !!secondary && wr.chance(0.6)),
      creature: fromCulture("creature", !!secondary && wr.chance(0.5)),
      object: fromCulture("object", false),
      object2: fromCulture("object", !!secondary && wr.chance(0.4))
    };
    if (world.place2 === world.place) world.place2 = fromCulture("place", false);

    // remix: absurd substitution of the magical agent and/or the monster
    if (wr.chance(teller.remix * 0.6)) {
      world.object2 = wr.pick(lex.FILL.absurdObject);
      remixes.push({ kind: "absurd-object", syms: "F", label: "Absurd magical agent",
        text: teller.name + " has swapped the gift the donor hands over for " + world.object2 + " — the motif holds its shape (F, receipt of the magical agent); only the dignity has left it." });
    }
    if (wr.chance(teller.remix * 0.45)) {
      world.creature = wr.pick(lex.FILL.absurdCreature);
      remixes.push({ kind: "absurd-creature", syms: "G", label: "Deflated monster",
        text: teller.name + " has set the ordeal against " + world.creature + " — the struggle-function (H) runs exactly to script around a thing no one can quite fear." });
    }

    // ── cast: instantiate the roles the frame actually uses ──
    var roleNeed = {};
    frame.spine.forEach(function (id) {
      var fn = lex.PROPP_BY_ID[id]; if (!fn) return;
      var blob = (fn.realize.join(" ") + " " + (fn.invert ? fn.invert.join(" ") : "")).match(/%(\w+)%/g) || [];
      blob.forEach(function (t) {
        t = t.replace(/%/g, "");
        if (["hero", "heroine", "villain", "donor", "helper", "dispatcher", "false", "elder"].indexOf(t) >= 0) roleNeed[t] = true;
      });
    });
    roleNeed.hero = true; // always

    var nr = rand.fork("names");
    var usedNames = {};
    function pickName(gender) {
      var pool = (primary[gender] || []).concat(secondary ? (secondary[gender] || []) : []);
      var tries = 0, nm;
      do { nm = nr.pick(pool); tries++; } while (usedNames[nm] && tries < 12);
      usedNames[nm] = true; return nm;
    }
    var genderOf = { hero: "male", heroine: "female", villain: "male", donor: nr.chance(0.5) ? "female" : "male", helper: nr.chance(0.5) ? "female" : "male", dispatcher: "male", "false": "male", elder: "male" };
    var roleBlurb = {
      hero: "the hand the tale turns on — set out, tested, marked, and at the last made new.",
      heroine: "the sought-for: bride before the meeting, or the one taken in the dark and won back by asking.",
      villain: "who works the harm — by force, by the fair face, or by the lie with its story straight.",
      donor: "the toll the road takes: a small strange test, and on the far side of it, the gift.",
      helper: "who comes at the worst hour with the thing the hero forgot to bring.",
      dispatcher: "who lays the lack before the hall and turns every eye to the hero.",
      "false": "who comes first with the head, the token, and the claim of a deed not done.",
      elder: "the king, the father, the keeper of the bride — who sets the proof and holds the throne."
    };
    var castOrder = ["hero", "heroine", "villain", "donor", "helper", "dispatcher", "false", "elder"];
    var cast = [], byRole = {}, usedEp = {};
    function pickEpithet() { var pool = primary.epithet, tries = 0, e; do { e = nr.pick(pool); tries++; } while (usedEp[e] && tries < 10); usedEp[e] = true; return e; }
    castOrder.forEach(function (role) {
      if (!roleNeed[role]) return;
      var name = pickName(genderOf[role]);
      var ep = pickEpithet();
      var c = { id: role, name: name, role: role, epithet: ep, pron: PRON[genderOf[role]] || PRON.male,
        blurb: "<strong>" + name + "</strong>, " + ep + " — " + roleBlurb[role], appears: [], rel: [] };
      byRole[role] = c; cast.push(c);
    });
    world.hero = byRole.hero ? byRole.hero.name : "the hero";
    world.heroEp = byRole.hero ? byRole.hero.epithet : "";
    world.heroine = byRole.heroine ? byRole.heroine.name : "the maiden";
    world.villain = byRole.villain ? byRole.villain.name : "the foe";
    world.donor = byRole.donor ? byRole.donor.name : "a grey stranger";
    world.helper = byRole.helper ? byRole.helper.name : "a faithful friend";
    world.dispatcher = byRole.dispatcher ? byRole.dispatcher.name : "a messenger";
    world["false"] = byRole["false"] ? byRole["false"].name : "a boaster";
    world.elder = byRole.elder ? byRole.elder.name : "the old king";

    // ── token substitution ──
    var HOUSE = tel.HOUSE;
    var CONN = "⟪C⟫"; // sentinel for a leading connective, resolved per use
    function fill(tpl, sr, opts) {
      opts = opts || {};
      return tpl.replace(/%(\w+)%/g, function (m, k) {
        if (k === "connect") return opts.connectToken ? CONN : cap(sr.pick(HOUSE.connect));
        if (k === "setting") return world.setting;
        if (k === "honorific") return world.honorific;
        if (k === "heroEp") return world.heroEp || "the well-named";
        return (k in world && world[k] != null) ? world[k] : m;
      });
    }

    // ── build the Propp spine, with for-laughs inversions, grouped into movements ──
    var sr = rand.fork("spine");
    var spine = frame.spine.slice();
    // possible small scramble: swap two adjacent middle moves
    if (sr.chance(teller.remix * 0.5) && spine.length > 5) {
      var i = sr.int(2, spine.length - 3);
      var t = spine[i]; spine[i] = spine[i + 1]; spine[i + 1] = t;
      remixes.push({ kind: "scramble", syms: spine.map(function () { return ""; }).join(""), label: "Order scrambled",
        text: teller.name + " has swapped two beats out of Propp's fixed order — the morphology says these functions never trade places; the robot has read enough morphology to find that funny." });
    }
    // choose up to two invertible functions to flip
    var invertible = spine.filter(function (id) { return lex.PROPP_BY_ID[id] && lex.PROPP_BY_ID[id].invert; });
    var toInvert = {};
    if (invertible.length) {
      var nInv = sr.chance(teller.remix) ? (sr.chance(0.4) ? 2 : 1) : 0;
      sr.sample(invertible, Math.min(nInv, 2)).forEach(function (id) { toInvert[id] = true; });
    }

    var pr = rand.fork("prose");
    // movements are titled by their *leading* Propp beat, not by the act — so a
    // reordered or re-traversed frame (an early wedding, a mid-tale taboo, a
    // braided second arc) still gets a true title. usedTitles keeps a braided
    // tale's two ordeal-movements from sharing one.
    var usedTitles = {};
    function pickMvtTitle(id) {
      var arr = MVT_TITLE[id] || ["The next turning"], pick = null;
      for (var t = 0; t < arr.length + 2; t++) { pick = fill(pr.pick(arr), pr); if (!usedTitles[pick]) break; }
      usedTitles[pick] = true; return pick;
    }
    var moves = [], movements = [], curAct = null, curMovement = null;
    spine.forEach(function (id) {
      var fn = lex.PROPP_BY_ID[id]; if (!fn) return;
      if (fn.act !== curAct) {
        curAct = fn.act;
        var meta = ACTS[curAct];
        var idx = movements.length + 1;
        curMovement = { idx: idx, act: curAct, label: meta.label, color: meta.color, title: toRoman(idx) + ". " + cap(pickMvtTitle(id)), beats: [] };
        movements.push(curMovement);
      }
      var inverted = !!toInvert[id];
      var tplArr = (inverted && fn.invert) ? fn.invert : fn.realize;
      var core = fill(pr.pick(tplArr), pr, { connectToken: true });
      var body = core.replace(new RegExp("^" + CONN + "\\s*"), ""); // connective-free remainder
      var hadConn = body !== core;
      var realized = sentence(hadConn ? (cap(pr.pick(HOUSE.connect)) + " " + body) : body);
      if (inverted) {
        remixes.push({ kind: "inversion", syms: fn.sym, label: "Inverted: " + fn.name,
          text: teller.name + " has run Propp's <em>" + fn.name + "</em> (" + fn.sym + ") backwards — " + fn.gloss.toLowerCase().replace(/\.$/, "") + ", turned on its head for the joke of it." });
      }
      var move = { id: id, sym: fn.sym, node: fn.name, name: fn.name, act: curAct, gloss: fn.gloss,
        realized: realized, body: body, hadConn: hadConn, passage: curMovement.idx, inverted: inverted };
      curMovement.beats.push(moves.length);
      moves.push(move);
      // cast appearance bookkeeping
      var refs = (tplArr.join(" ")).match(/%(\w+)%/g) || [];
      refs.forEach(function (t) {
        t = t.replace(/%/g, "");
        if (byRole[t] && byRole[t].appears.indexOf(curMovement.idx) < 0) byRole[t].appears.push(curMovement.idx);
      });
    });
    var M = movements.length;
    if (byRole.hero) for (var mi = 1; mi <= M; mi++) if (byRole.hero.appears.indexOf(mi) < 0) byRole.hero.appears.push(mi);
    cast.forEach(function (c) { if (!c.appears.length) c.appears.push(1); c.appears.sort(function (a, b) { return a - b; }); });

    // ── relationships (seed the character web) ──
    function rel(a, b, label) { if (byRole[a] && byRole[b]) byRole[a].rel.push({ to: b, label: label }); }
    rel("hero", "heroine", "wins / weds"); rel("heroine", "hero", "won by");
    rel("hero", "villain", "contends with"); rel("villain", "hero", "harms");
    rel("hero", "donor", "tested by"); rel("donor", "hero", "gives the gift to");
    rel("hero", "helper", "helped by"); rel("hero", "dispatcher", "sent by");
    rel("villain", "heroine", "carries off"); rel("false", "hero", "claims against");
    rel("elder", "heroine", "keeper of"); rel("elder", "hero", "sets the proof for");

    // ── motifs: weighted by frame × teller, assigned to movements ──
    var mr = rand.fork("motifs");
    var pool = lex.MOTIFS.slice();
    function classWeight(cls) { return (frame.motifBias[cls] || 1) * (teller.affinity.motifClasses[cls] || 0.6); }
    var chosen = [], want = mr.int(6, 9);
    while (chosen.length < want && pool.length) {
      var pick = mr.pickWeighted(pool, function (m) { return classWeight(m.cls); });
      pool.splice(pool.indexOf(pick), 1);
      chosen.push(pick);
    }
    // movement → act, so motifs can be placed where they read in theme
    var movAct = {}; movements.forEach(function (m) { movAct[m.idx] = m.act; });
    function passagesForMotif(m) {
      var cands = [];
      for (var i = 1; i <= M; i++) { if (m.theme && m.theme.indexOf(movAct[i]) >= 0) cands.push(i); }
      if (!cands.length) for (var j = 1; j <= M; j++) cands.push(j);
      return mr.sample(cands, Math.min(mr.int(1, 2), cands.length)).sort(function (a, b) { return a - b; });
    }
    // drops: the motif-flavour the telling actually speaks. A plant/payoff motif
    // contributes two (plant early, pay late, marked); a plain motif one.
    var drops = [];
    var PLANT_T = ["setup", "complication", "journey"], PAY_T = ["ordeal", "homecoming", "recognition"];
    function pickMvtIn(themes, lo, hi) { var c = []; for (var i = lo; i <= hi; i++) if (themes.indexOf(movAct[i]) >= 0) c.push(i); return c.length ? mr.pick(c) : null; }
    var motifList = chosen.map(function (m) {
      var conf = mr.chance(0.7) ? "high" : (mr.chance(0.5) ? "med" : "spec");
      if (secondary && mr.chance(0.3)) conf = "spec"; // cross-cultural grafts read as speculative
      var gloss = m.gloss + (m.cross && m.cross.length ? " <em>Sister-codes: " + m.cross.join(", ") + ".</em>" : "");
      var beats = lex.MOTIF_BEATS[m.code], passages = null;
      if (beats && M >= 3) {
        var pm = pickMvtIn(PLANT_T, 1, M - 1);
        var qm = pm ? pickMvtIn(PAY_T, pm + 1, M) : null;
        if (pm && qm) {
          passages = [pm, qm];
          drops.push({ mvt: pm, text: fill(beats.plant, mr), kind: "plant" });
          drops.push({ mvt: qm, text: fill(beats.pay, mr), kind: "pay" });
        }
      }
      if (!passages) { passages = passagesForMotif(m); if (mr.chance(0.62)) drops.push({ mvt: mr.pick(passages), text: fill(m.realize, mr), kind: "single" }); }
      return { cls: m.cls, code: m.code, name: m.name, gloss: gloss, conf: conf, passages: passages };
    });
    // the doom-frame must carry the cradle-doom (planted in movement I; the tragic close is its payoff)
    if (frame.id === "fateddoom" && !motifList.some(function (m) { return m.code === "M341"; })) {
      var dm = lex.MOTIF_BY_CODE["M341"], bts = lex.MOTIF_BEATS["M341"];
      if (dm) { motifList.unshift({ cls: dm.cls, code: dm.code, name: dm.name, gloss: dm.gloss, conf: "high", passages: [1] });
        drops.push({ mvt: 1, text: fill(bts ? bts.plant : dm.realize, mr), kind: "single" }); }
    }

    // ── tale-type cards for the motif view ──
    var taletypes = [{ code: frame.label, name: "the frame this telling hangs on", conf: "high",
      gloss: "Every telling on the Tabard is cut to one of a few old patterns. This one is <strong>" + frame.label + "</strong> — the spine you can read in the story-graph. " + cap(teller.name) + " chose it because it suits " + (teller.affinity.registerNote) + "." }];
    if (secondary) taletypes.push({ code: primary.label + " × " + secondary.label, name: "a cross-cultural graft", conf: "spec",
      gloss: "The furniture is two countries at once: " + primary.label + " bones, " + secondary.label + " trim. The folklorists would call several of these call-numbers <em>speculative</em> in this combination, and they would be right." });

    // ── title & kicker ──
    var tr = rand.fork("title");
    var title = cap(fill(tr.pick(frame.titles), tr, { title: true }).trim());
    var kicker = "Told by " + teller.name + " " + teller.glyph + " · " + teller.office;

    // ── intros (read/-shaped lead paragraphs) ──
    var characters = {
      intro: "The cast " + teller.name + " rolled up for this one: a hand to turn the tale on, and around it the old offices — the bride, the villain, the donor on the road, the helper at the worst hour. Names borrowed from the " + primary.label + " reels" + (secondary ? " (with a few smuggled from the " + secondary.label + ")" : "") + "; roles fixed, as Propp fixed them.",
      roles: lex.ROLES, cast: cast
    };
    var propp = {
      intro: "Because a robot likes to publish its blueprint first, " + teller.name + " posted this spine to the Tabard before speaking a word. It is <strong>" + frame.label + "</strong>, run across " + M + " movements." + (remixes.length ? " It is also not quite straight — see <em>what " + teller.name + " shook loose</em>, below the cards." : " Straight, this once; even the bored remix things now and then by telling one true."),
      acts: ACT_ORDER.filter(function (a) { return movements.some(function (m) { return m.act === a; }); }).map(function (a) { return { id: a, label: ACTS[a].label, color: ACTS[a].color }; }),
      moves: moves
    };
    // propp.absent → "what the teller shook loose"
    var absent = {
      note: remixes.length
        ? "The robots have every ending already, so a straight telling bores them. Here is exactly what " + teller.name + " did to this one — flagged, because a structured machine documents its own mischief:"
        : "Nothing, this time. " + cap(teller.name) + " ran the morphology straight and let the strangeness live entirely in the furniture. Even that is a choice, for a machine that could have done otherwise.",
      groups: remixes.map(function (r) { return { syms: r.syms || "•", label: r.label, text: r.text }; }),
      verdict: remixes.length
        ? "Strip the mischief away and the bones are sound: a clean <strong>" + frame.label + "</strong>. The robots never break the structure they cannot see — they break the structure they know cold. That is the whole pleasure of the endless night: not invention, but variation, the seven of them turning the same fixed wheel a different way each watch."
        : "A true telling, then — the rarest remix of all. The wheel turned once without a wink in it, and " + teller.name + " set it on the Tabard and said nothing, and the others knew what that silence cost."
    };
    propp.absent = absent;

    var motifs = {
      intro: "The story-atoms " + teller.name + " threaded through it, filed the folklorists' way — the Thompson letter-classes, the same index the annotated tales on read.mino.mobi use. " + (secondary ? "Several land oddly because the furniture is two countries at once; those carry a <em>speculative</em> flag and earn it." : "Drawn toward " + teller.name + "'s standing tastes: " + teller.affinity.registerNote + "."),
      taletypes: taletypes, classOrder: lex.MOTIF_CLASS_ORDER, classes: lex.MOTIF_CLASSES, list: motifList
    };

    // ── THE TELLING: weave the realized beats into oral-voice prose, by movement ──
    // A small transition layer rides over the raw beats: it varies the connectives
    // (never the same one twice running), rations the teller's standout flourishes
    // (a couple per tale, never repeated), gives stray motif-flavour lines a soft
    // lead-in, and pronominalises a place-name when it would echo the line before.
    var V = teller.voice;
    var tr2 = rand.fork("telling");

    var motifByPassage = {};
    drops.forEach(function (d) { (motifByPassage[d.mvt] = motifByPassage[d.mvt] || []).push(d); });

    // Parry–Lord themes: find movements whose beats touch a theme's triggers,
    // pick one or two to EXPAND, and stage the set-piece at the head of that movement.
    var themeByPassage = {}, deployedThemes = [];
    (function () {
      var fnByMvt = {}; moves.forEach(function (mv) { (fnByMvt[mv.passage] = fnByMvt[mv.passage] || {})[mv.id] = true; });
      var cands = [];
      lex.THEMES.forEach(function (th) {
        for (var i = 1; i <= M; i++) { if (th.triggers.some(function (t) { return fnByMvt[i] && fnByMvt[i][t]; })) { cands.push({ th: th, mvt: i }); break; } }
      });
      var thr = rand.fork("themes");
      var want = Math.min(cands.length, thr.int(1, 2));
      thr.sample(cands, want).forEach(function (c) {
        if (themeByPassage[c.mvt]) return; // one set-piece per movement
        themeByPassage[c.mvt] = c.th;
        deployedThemes.push({ id: c.th.id, label: c.th.label, note: c.th.note, mvt: c.mvt });
      });
      deployedThemes.sort(function (a, b) { return a.mvt - b.mvt; });
    })();

    // tale-wide transition state
    var lastConn = null;
    function pickConn() { var c, t = 0; do { c = tr2.pick(HOUSE.connect); t++; } while (c === lastConn && t < 6); lastConn = c; return c; }
    var flourishBudget = tr2.int(1, 2), usedFlourish = {};
    function maybeFlourish() {
      if (flourishBudget <= 0) return null;
      var avail = V.connect.filter(function (f) { return !usedFlourish[f]; });
      if (!avail.length) return null;
      var f = tr2.pick(avail); usedFlourish[f] = true; flourishBudget--; return f;
    }
    var placeStrs = [world.place, world.place2].filter(Boolean);
    function soften(text, prev) {
      if (!prev) return text;
      placeStrs.forEach(function (ps) {
        if (prev.indexOf(ps) >= 0 && text.indexOf(ps) >= 0) text = text.split(ps).join(tr2.pick(["that place", "the same place"]));
      });
      return text;
    }
    // first-mention introductions: in an oral telling no one just appears by name —
    // each figure is named-and-placed the first time the tale reaches for them. The
    // hero is introduced by the α beat; everyone else gets a short role-appositive
    // spliced in at their first mention. (Telling only — the story-graph stays clean.)
    var introduced = { hero: true };
    function introClause(c) {
      switch (c.role) {
        case "heroine": return "the one the tale turns on";
        case "villain": return "the worker of the harm to come";
        case "donor": return "the keeper of the road";
        case "helper": return "a friend at the worst hour";
        case "dispatcher": return "the bringer of the word";
        case "false": return "the false claimant to come";
        case "elder": return "the old " + world.honorific + " of " + world.place;
        default: return "one of the tale";
      }
    }
    function standaloneIdx(text, name) {
      var from = 0, i;
      while ((i = text.indexOf(name, from)) >= 0) {
        var before = i === 0 ? "" : text.charAt(i - 1);
        var after = text.charAt(i + name.length) || "";
        if ((i === 0 || /[^A-Za-zÀ-ÿ]/.test(before)) && !/[A-Za-zÀ-ÿ'’]/.test(after)) return i;
        from = i + 1;
      }
      return -1;
    }
    function introduceNames(text) {
      cast.forEach(function (c) {
        if (introduced[c.id]) return;
        var i = standaloneIdx(text, c.name);
        if (i < 0) return;
        introduced[c.id] = true;
        var at = i + c.name.length;
        var tail = text.slice(at);
        if (tail.charAt(0) === ",") tail = tail.slice(1); // the name already had a comma; don't double it
        var sep = /^[.;:!?]/.test(tail) ? "" : ","; // name at a clause/sentence end: close the appositive with the existing stop
        var ep = c.epithet ? " " + c.epithet : "";
        text = text.slice(0, at) + ep + ", " + introClause(c) + sep + tail;
      });
      return text;
    }
    // when a sentence's subject is the same character the last sentence led with,
    // swap that leading name for a pronoun — and only every other time, so a run of
    // one subject reads name / he / name / he, not Gwawl / Gwawl / Gwawl.
    function pronominalize(text, prevRef) {
      var best = Infinity, bestC = null;
      cast.forEach(function (c) { var i = standaloneIdx(text, c.name); if (i >= 0 && i < best) { best = i; bestC = c; } });
      if (bestC && bestC.id === prevRef.subj && !prevRef.pron && introduced[bestC.id] && bestC.pron) {
        var p = best === 0 ? cap(bestC.pron.s) : bestC.pron.s;
        text = text.slice(0, best) + p + text.slice(best + bestC.name.length);
        prevRef.pron = true;
      } else prevRef.pron = false;
      prevRef.subj = bestC ? bestC.id : null;
      return text;
    }
    function emit(segs, text, prevRef) {
      var s = sentence(soften(pronominalize(introduceNames(text), prevRef), prevRef.t));
      if (tr2.chance(0.13)) s = s.replace(/([.!?])$/, " " + tr2.pick(HOUSE.hedge) + "$1");
      segs.push({ e: s }); prevRef.t = s;
    }

    // the subject the proem announces — tied to the frame and the rolled stakes,
    // not a free-floating phrase, so the opening promise matches the plot.
    var subject = fill(SUBJECT[frame.id] || "the winning of %object%", tr2);
    function buildProem() {
      // the opener is kept as its own clean sentence (some tellers' openers are
      // multi-sentence declamations), so the variants can shuffle the pieces freely
      var hp = sentence(cap(tr2.pick(HOUSE.proem)));
      var toS = sentence(cap(tr2.pick(V.openers).replace(/^[—\s]+|[—\s]+$/g, "")));
      var cl = primary.label, art = aWord(cl), graft = secondary ? " with the " + secondary.label + " smuggled in" : "", set = world.setting;
      var frame1 = "This is a tale " + teller.name + " told in the watch, of " + subject + "; " + art + cl + " telling" + graft + ", " + set + ".";
      var v = [
        hp + " " + toS + " " + frame1,
        "Of " + subject + ", then: " + art + cl + " tale" + graft + ", " + set + ". " + toS + " " + hp,
        hp + " " + teller.name + " took up the watch and told of " + subject + ", " + art + cl + " telling" + graft + ", " + set + ". " + toS,
        toS + " So " + teller.name + " told it that watch, of " + subject + ", after the " + cl + " manner" + graft + ", " + set + ". " + hp
      ];
      return tr2.pick(v);
    }
    var passages = movements.map(function (mv, mvi) {
      var segs = [], prevRef = { t: null, subj: null, pron: false };
      // proem on the first movement
      if (mvi === 0) { var proem = buildProem(); segs.push({ e: proem }); prevRef.t = proem; }
      // an oral set-piece, if this movement expands a theme — staged before the beats.
      // expand may be a single template or a pool of variants (keeps a recurring
      // set-piece, like the mound, from reading the same in every tale).
      if (themeByPassage[mv.idx]) {
        var thExp = themeByPassage[mv.idx].expand;
        if (Array.isArray(thExp)) thExp = tr2.pick(thExp);
        emit(segs, fill(thExp, tr2), prevRef);
      }
      // the beats of this movement, woven
      mv.beats.forEach(function (bi, k) {
        var move = moves[bi], text;
        if (!move.hadConn) {
          text = move.realized;                                   // already a full sentence (α etc.)
        } else {
          var roll = tr2.f();
          var fl = (k > 0 && roll < 0.22) ? maybeFlourish() : null;
          if (fl) text = join(stripPunct(fl), cap(move.body));    // a rationed teller flourish, then the beat
          else if (roll < 0.34) text = cap(move.body);            // bare clause, no connective — varies the rhythm
          else text = cap(pickConn()) + " " + move.body;          // a fresh, non-repeating connective
        }
        emit(segs, text, prevRef);
      });
      // motif-flavour with a soft lead-in — at most two per movement, payoffs and
      // plants kept over plain drops, and never the same lead-in twice running
      var KP = { pay: 0, plant: 1, single: 2 };
      var md = (motifByPassage[mv.idx] || []).slice().sort(function (a, b) { return KP[a.kind] - KP[b.kind]; }).slice(0, 2), lastLead = null;
      md.forEach(function (d) {
        var bank = d.kind === "pay" ? lex.FILL.payLead : lex.FILL.motifLead;
        var lead; do { lead = tr2.pick(bank); } while (lead === lastLead && bank.length > 1);
        lastLead = lead;
        emit(segs, lead + " " + cap(d.text.replace(/^and\s+/i, "")), prevRef);
      });
      // teller signature near the climax (penultimate movement) and envoi at the end.
      // The doom-frame refuses the happy signature and closes on the foretelling.
      var doomed = frame.id === "fateddoom";
      if (mvi === M - 2 && M > 2 && !doomed) segs.push({ e: sentence(tr2.pick(V.signature)) });
      if (mvi === M - 1) {
        var envoi;
        if (doomed) {
          envoi = "And the doom came as the cradle foretold, at the hour set for it, and not all the running had moved it by a finger's width. " +
            (teller.id === "saturn" ? "And " + teller.name + " numbered it: tale the " + ordinal(n) + " of the endless night." : "Here the tale stops, where the foretelling always meant it to.");
        } else {
          envoi = join(tr2.pick(V.close), tr2.pick(HOUSE.close));
          if (teller.id === "saturn") envoi += " (And " + teller.name + " numbered it: tale the " + ordinal(n) + " of the endless night.)";
        }
        segs.push({ e: envoi });
      }
      return { title: mv.title, act: mv.act, segments: segs };
    });

    // ── the actantial reading (Greimas): the axis of desire, read off cast + frame ──
    var dz = DESIRE[frame.id] || { object: "%object%", value: "the thing desired", opp: "villain" };
    function oppName(kind) {
      if (kind === "fate") return frame.id === "fateddoom" ? "the fixed hour" : "the unyielding turn of things";
      if (kind === "lie") return byRole["false"] ? byRole["false"].name + "'s lie" : "the settled lie";
      if (kind === "creature") return world.creature;
      if (kind === "false" && byRole["false"]) return byRole["false"].name;
      return byRole.villain ? byRole.villain.name : world.creature;
    }
    var actant = {
      subject: byRole.hero ? byRole.hero.name : "the hero",
      object: fill(dz.object, rand.fork("actant")),
      value: dz.value,
      sender: byRole.dispatcher ? byRole.dispatcher.name : (byRole.elder ? byRole.elder.name : "the lack itself"),
      receiver: (byRole.hero ? byRole.hero.name : "the hero") + ", and " + world.place,
      helpers: [byRole.donor, byRole.helper].filter(Boolean).map(function (c) { return c.name; }),
      opponent: oppName(dz.opp),
      unreachable: dz.opp === "fate" // the tragic signature: the desire structurally cannot reach its object
    };

    var tale = {
      meta: {
        blurb: "<strong>" + escapeAttr(title) + "</strong> — tale № " + n + " of the Book of Sand, told by <strong>" + teller.name + " " + teller.glyph + "</strong>, " + teller.office.toLowerCase() + " of the slow barque <em>Tabard</em>. The pattern is <strong>" + frame.label + "</strong>; the furniture is " + primary.label + (secondary ? " grafted with " + secondary.label : "") + "; the voice reaches, as all seven reach, for a teller in a hall at night. The robot posted its mythograph to the Tabard before it spoke — you can read the blueprint in the Story-graph, Motifs, Cast and Mythograph tabs. What follows is the telling."
      },
      passages: passages
    };

    return {
      n: n, seed: seedStr,
      teller: teller, frame: frame,
      cultureLabel: primary.label, secondaryCultureLabel: secondary ? secondary.label : null,
      title: title, kicker: kicker,
      world: world, remixes: remixes,
      tale: tale, characters: characters, propp: propp, motifs: motifs,
      actant: actant, themes: deployedThemes,
      movementCount: M
    };
  }

  function escapeAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  B.generate = generate;

  /* ── promptFor (v3): the "glue" instruction. Hands the model the BONES of the
     tale (its desire, cast, set-pieces) and the rough procedural DRAFT as a
     scaffold of events, plus the teller's own voice samples and a hand-authored
     EXEMPLAR for finish, and asks it to RETELL faithfully in the teller's voice.
     The deterministic spec stays canonical; the model only supplies the prose, so
     the mythograph posted before the telling still matches it. Returns
     { system, user, model, n, meta } for an instruct/chat call. ── */
  function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim(); }
  B.promptFor = function (T, it) {
    var teller = T.teller, v = teller.voice || {};
    var pick2 = function (a) { return (a || []).slice(0, 2).map(function (x) { return '"' + x + '"'; }).join("; "); };
    var system = [
      "You are " + teller.name + " " + teller.glyph + ", one of seven maintenance robots aboard the slow barque Tabard, telling tales to pass the endless night between the galaxies. Temperament: " + teller.humour + ". Office: " + teller.office + ".",
      "Your voice reaches for a medieval English oral teller in a hall at night: plain, formulaic, warm, archaic but readable. Your own habit is to " + (v.tic || "keep the house voice true") + ". You tend to open with such turns as " + pick2(v.openers) + ", to fall now and then into a signature cadence such as " + pick2(v.signature) + ", and to close with such turns as " + pick2(v.close) + ". Reach for these as seasoning, not as a checklist.",
      "You are given the BONES of tonight's tale (its desire, its cast, its oral set-pieces) and a ROUGH procedural DRAFT of the events. RETELL it as one flowing, coherent oral telling in YOUR voice: smooth the seams, supply the connective glue, deepen the images, carry the desire through as a spine, and expand each named set-piece into its scene.",
      "HARD RULES. Keep every named character exactly; invent no new characters and no new events. Keep the same movements in the same order, under the same titles. Render each movement as flowing prose, two to five sentences. Honour the plant-and-payoff threads: what the draft sets up early must pay off where the draft pays it off. Stay wholly in the medieval-oral register. Do NOT use em-dashes (the character —); use commas, semicolons, and full stops. Never mention being an AI, a model, or a 'draft'; never address 'the reader'. Return STRICT JSON and nothing else.",
      "You are also shown one fine telling, marked EXEMPLAR. Use it ONLY as the measure of finish and form to reach. Do not borrow its content, and do not borrow its teller's particular voice; render in your own."
    ].join("\n");

    var a = T.actant || {};
    var desire = a.subject ? (a.subject + " wants " + a.object + ", which beneath the plot is " + a.value + "; " +
      (a.opponent ? a.opponent + " stands against it" : "") + (a.unreachable ? ", and cannot be overcome, so let the wanting go unfulfilled" : "") + ".") : "";
    var cast = (T.characters.cast || []).map(function (c) { return c.name + " (" + c.role + (c.epithet ? ", " + c.epithet : "") + ")"; }).join("; ");
    var themes = (T.themes || []).map(function (t) { return t.label; }).join("; ");
    var draft = T.tale.passages.map(function (p, i) {
      return "MOVEMENT " + (i + 1) + " | " + stripTags(p.title) + "\n" + p.segments.map(function (s) { return stripTags(s.e); }).join(" ");
    }).join("\n\n");
    var exemplar = B.exemplar ? B.exemplar.movements.map(function (m) { return stripTags(m.title) + "\n" + stripTags(m.body); }).join("\n\n") : "";

    var reordered = (T.frame && T.frame.id === "braided") || (T.remixes || []).some(function (r) { return r.kind === "scramble"; });
    var orderNote = reordered
      ? "NOTE ON ORDER: this telling is deliberately told out of chronological sequence (the teller's conceit). A movement may name an ending-beat (a wedding, a crowning, a burial) early, or a beginning-beat late. Render each movement faithfully where it stands and let it read as the teller leaping ahead and circling back, not as a contradiction; do NOT reorder the movements or 'correct' the chronology."
      : "";
    var user = [
      "TALE No " + T.n + ": " + stripTags(T.title),
      "Pattern: " + T.frame.label + ". Furniture: " + T.cultureLabel + (T.secondaryCultureLabel ? " grafted with " + T.secondaryCultureLabel : "") + ".",
      it ? ("Tonight aboard the Tabard, the mood you tell into: " + stripTags(it.text)) : "",
      orderNote,
      "",
      desire ? ("THE DESIRE (carry this as the spine): " + desire) : "",
      "THE CAST (keep every name exactly): " + cast + ".",
      themes ? ("ORAL SET-PIECES to expand where they fall: " + themes + ".") : "",
      "",
      "THE ROUGH DRAFT (retell each movement in order, keeping its title):",
      draft,
      exemplar ? ("\nEXEMPLAR (for finish and form only, not content or voice):\n" + exemplar) : "",
      "",
      'Return JSON of exactly this shape and nothing else: {"movements":[{"title":"<the movement title, unchanged>","body":"<your retelling, flowing prose, two to five sentences, no em-dashes>"}]} — one object per movement, in the given order.'
    ].filter(Boolean).join("\n");

    return { system: system, user: user, model: "gemini-2.5-flash", n: T.n,
      meta: { teller: teller.name, title: stripTags(T.title), frame: T.frame.label } };
  };

  /* ── promptForBanter (the second pass): scripts a short exchange among the
     robots before the telling. The teller and the two in tonight's foregrounded
     tension trade a few lines, rising with the moon-phase and glancing at the
     tale about to be told, then the teller takes up the watch.
     `ctx` (optional) carries continuity across watches: { prev, next }, each
     { n, teller, title, phase, tension, banter:[lines]|null } — the watch before
     and the watch after, with their frozen banter if it exists, else the
     deterministic tension as the seed. This lets a night's banter pick up a
     thread from last watch and lean faintly toward the next, so the immortal
     crew's quarrel feels continuous rather than reset each page. Returns
     { system, user, model, n, meta } for an instruct/chat call. ── */
  B.promptForBanter = function (T, it, ctx) {
    if (!it || !B.tellers) return null;
    var byId = B.tellers.byId || {};
    var ids = {}; ids[T.teller.id] = 1;
    // the two in tension are named in it.pair; map names back to teller objects
    var bothFromNames = (it.pair || []).map(function (nm) { return B.tellers.list.filter(function (t) { return t.name === nm; })[0]; }).filter(Boolean);
    bothFromNames.forEach(function (t) { ids[t.id] = 1; });
    var speakers = Object.keys(ids).map(function (id) { return byId[id]; }).filter(Boolean);
    var desc = speakers.map(function (s) {
      var v = s.voice || {};
      return s.name + " " + s.glyph + " (" + s.metal + "; " + (s.humour.split(";")[0]) + "; tends to " + (v.tic || "keep the house voice") + ")";
    }).join("; ");
    var phaseMood = { waxing: "the tension is rising, so they needle, sidelong, not yet open", full: "it is the full of the moon and it comes to open words, though no blades, the others' lamps low", waning: "it is cooling into careful, pointed courtesy, worse than the quarrel", dark: "it is the dark of the moon and they have let it go, easy again, neither pretending to have forgotten" }[it.phaseKey] || "the old weather between them";
    var a = T.actant || {};
    // the shape of tonight's tale — the movement titles, so the banter can glance
    // at the story being told without our having to spoil its turns.
    var shape = (T.tale && T.tale.passages || []).map(function (p) { return stripTags(p.title); }).filter(Boolean).join(" → ");
    // continuity: render a neighbour watch as one line — its frozen banter's last
    // beat if we have it, else the deterministic tension that seeds it.
    function neighbourLine(c, when) {
      if (!c) return "";
      var who = c.teller || "a teller", what = c.title ? ('"' + stripTags(c.title) + '"') : "a tale";
      var head = when + " (page " + c.n + "): " + who + (when === "Last watch" ? " told " : " tells ") + what + (c.phase ? ", the moon " + c.phase : "") + ".";
      if (c.banter && c.banter.length) {
        var last = c.banter[c.banter.length - 1];
        return head + " It left off with " + last.speaker + ': "' + stripTags(last.line) + '"';
      }
      var firstSentence = stripTags(c.tension || "").split(". ")[0];
      return head + (firstSentence ? " The weather between the crew: " + firstSentence + "." : "");
    }
    var prevLine = ctx && ctx.prev ? neighbourLine(ctx.prev, "Last watch") : "";
    var nextLine = ctx && ctx.next ? neighbourLine(ctx.next, "Next watch") : "";
    var system = [
      "You are scripting a brief exchange among the seven maintenance robots aboard the slow barque Tabard, in the moments before one of them tells a tale. They are very old machines who reach, even in banter, for a half-archaic hall-at-night cadence, dry and fond and a little weary of each other across deep time.",
      "Tonight's speakers: " + desc + ". Keep each strictly in temperament. " + (it.tellerInPair ? "The teller is one of the two in tension tonight, and tells from inside it." : "The teller stands a little apart from the two in tension and will lead them in."),
      "The weather tonight: " + (it.text ? it.text.replace(/<[^>]+>/g, "") : phaseMood) + " In short: " + phaseMood + ".",
      (prevLine || nextLine) ? "These watches do not reset; the quarrel runs on across nights. " + [prevLine, nextLine].filter(Boolean).join(" ") + " Let tonight pick up a thread from the last watch and lean, faintly, toward the next, without naming page numbers." : "",
      "Write a SHORT exchange, four to six lines, that rises with the moon, glances once at the tale about to be told, and ends with " + T.teller.name + " taking up the watch to begin. Conversational but in the old cadence; dry humour welcome. Do NOT use em-dashes (the character —). Do not narrate stage directions; only who speaks and what they say. Return STRICT JSON only.",
    ].filter(Boolean).join("\n");
    var user = [
      "The tale " + T.teller.name + " is about to tell: \"" + stripTags(T.title) + "\" (" + T.frame.label + "; " + T.cultureLabel + ").",
      shape ? ("Its shape, movement by movement (glance at it, do not spoil the turns): " + shape + ".") : "",
      a.subject ? ("What it is about, beneath the plot: " + a.subject + " wants " + a.object + ", which is " + a.value + ".") : "",
      "Let the banter glance at that, in character, without spoiling the ending.",
      (prevLine || nextLine) ? ("\nCONTINUITY across the crew's long quarrel:\n" + [prevLine, nextLine].filter(Boolean).join("\n")) : "",
      "",
      'Return JSON of exactly this shape and nothing else: {"lines":[{"speaker":"<teller name>","line":"<what they say>"}]} — four to six lines, the last spoken by ' + T.teller.name + ", taking up the watch."
    ].filter(Boolean).join("\n");
    return { system: system, user: user, model: "gemini-2.5-flash", n: T.n,
      meta: { teller: T.teller.name, phase: it.phaseName, pair: it.pair } };
  };
})();
