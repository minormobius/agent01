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
      var c = { id: role, name: name, role: role, epithet: ep,
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
    var moves = [], movements = [], curAct = null, curMovement = null;
    spine.forEach(function (id) {
      var fn = lex.PROPP_BY_ID[id]; if (!fn) return;
      if (fn.act !== curAct) {
        curAct = fn.act;
        var meta = ACTS[curAct];
        var idx = movements.length + 1;
        var ttl = fill(pr.pick(meta.titles).replace("%PLACE%", world.place).replace("%PLACE2%", world.place2).replace("%CREATURE%", world.creature), pr);
        curMovement = { idx: idx, act: curAct, label: meta.label, color: meta.color, title: toRoman(idx) + ". " + cap(ttl), beats: [] };
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
    var motifList = chosen.map(function (m) {
      var passages = mr.sample(Array.from({ length: M }, function (_, i) { return i + 1; }), mr.int(1, 2)).sort(function (a, b) { return a - b; });
      var conf = mr.chance(0.7) ? "high" : (mr.chance(0.5) ? "med" : "spec");
      // cross-cultural / absurd remixes drag a motif's confidence toward "spec"
      if (secondary && mr.chance(0.3)) conf = "spec";
      var realize = fill(m.realize, mr);
      var gloss = m.gloss + (m.cross && m.cross.length ? " <em>Sister-codes: " + m.cross.join(", ") + ".</em>" : "");
      return { cls: m.cls, code: m.code, name: m.name, gloss: gloss, conf: conf, passages: passages, realize: realize };
    });

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
    var V = teller.voice;
    var motifByPassage = {};
    motifList.forEach(function (m) { if (mr.chance(0.6)) { var p = mr.pick(m.passages); (motifByPassage[p] = motifByPassage[p] || []).push(m.realize); } });
    var tr2 = rand.fork("telling");
    var passages = movements.map(function (mv, mvi) {
      var segs = [];
      // proem on the first movement
      if (mvi === 0) {
        var proem = join(
          tr2.pick(HOUSE.proem) + " — " + stripPunct(tr2.pick(V.openers)),
          "This is a tale " + teller.name + " told in the watch, of " + world.quest + ", " +
            aWord(primary.label) + primary.label + " telling" + (secondary ? " with the " + secondary.label + " smuggled in" : "") + ", " + world.setting
        );
        segs.push({ e: proem });
      }
      // the beats of this movement, woven
      mv.beats.forEach(function (bi, k) {
        var move = moves[bi];
        var text;
        // sometimes lead with a teller flourish in place of the beat's own connective
        if (k > 0 && move.hadConn && tr2.chance(0.5)) {
          text = join(stripPunct(tr2.pick(V.connect)), cap(move.body));
        } else {
          text = move.realized;
        }
        if (tr2.chance(0.16)) text = text.replace(/([.!?])$/, " " + tr2.pick(HOUSE.hedge) + "$1");
        segs.push({ e: sentence(text) });
      });
      // drop in any motif flavour assigned here
      (motifByPassage[mv.idx] || []).forEach(function (line) { if (tr2.chance(0.8)) segs.push({ e: cap(line) }); });
      // teller signature near the climax (penultimate movement) and envoi at the end
      if (mvi === M - 2 && M > 2) segs.push({ e: sentence(tr2.pick(V.signature)) });
      if (mvi === M - 1) {
        var envoi = join(tr2.pick(V.close), tr2.pick(HOUSE.close));
        if (teller.id === "saturn") envoi += " (And " + teller.name + " numbered it: tale the " + ordinal(n) + " of the endless night.)";
        segs.push({ e: envoi });
      }
      return { title: mv.title, act: mv.act, segments: segs };
    });

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
      movementCount: M
    };
  }

  function escapeAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  B.generate = generate;
})();
