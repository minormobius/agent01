// wormhole — the full-paper engine.
//
// Turns a paper id into a whole procedurally-generated journal article: title,
// authors + affiliations, abstract, numbered sections (intro / related work /
// data & methods with display equations / results with figures + a table /
// discussion / conclusion), acknowledgements, and a reference list.
//
// A paper id names a paper deterministically:
//   "<fieldSeed>.f"   → field <fieldSeed>'s FOUNDATIONAL paper (matches the
//                        dossier card on /f/<fieldSeed> exactly)
//   "<fieldSeed>.r<k>" → the k-th ordinary paper in field <fieldSeed>
// Every reference is itself a paper id, so citations link to /p/<id> and land
// on a coherent paper — mostly in the same field (shared subject vocabulary,
// journals, author pool), sometimes an "interdisciplinary" reach into another
// field. Reference metadata is produced by header(), the same function that
// titles the target when you open it, so the citation always matches the paper.
//
// The DESIGN-SPECIFIC content — data statement, methods, results, table, and the
// figures with their readouts — comes from analysis.js (the method × analytics
// design space). paper.js supplies the shared narrative frame and weaves it all
// into an ordered `flow` per section, with text between the figures.
//
// header() is cheap and NEVER calls generate(), so building references can't
// recurse. Deterministic; runs in worker, browser, and node (paper.selftest.mjs).
// All fiction — no real paper is described.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var W = NS.WORMHOLE;
  if (!W) throw new Error("wormhole/paper.js requires engine.js (WORMHOLE) to be loaded first");
  var DATA = NS.WORMHOLE_DATA, CHARTS = NS.WORMHOLE_CHARTS, ANALYSIS = NS.WORMHOLE_ANALYSIS;
  if (!DATA || !CHARTS || !ANALYSIS) throw new Error("wormhole/paper.js requires dataset.js + charts.js + analysis.js (and stats.js) loaded first");
  var P = NS.WORMHOLE_PAPER = NS.WORMHOLE_PAPER || {};

  var Rand = W._Rand, cap = W.cap;

  function parseId(id) {
    id = String(id === undefined || id === null || id === "" ? "1.f" : id);
    var dot = id.indexOf(".");
    if (dot < 0) return { fieldSeed: id, key: "f", id: id + ".f" };
    var key = id.slice(dot + 1) || "f";
    return { fieldSeed: id.slice(0, dot), key: key, id: id.slice(0, dot) + "." + key };
  }

  // ---------- name / citation helpers ----------
  function initials(name) {
    // "Given Middle van der Surname" → surname = last token, initials of the rest
    var parts = String(name).trim().split(/\s+/);
    var surname = parts.pop();
    // pull particles back onto the surname (van, der, de, von, etc.)
    while (parts.length && /^(van|der|de|von|del|di|da|la|le|den|ter|bin|al)$/i.test(parts[parts.length - 1])) {
      surname = parts.pop() + " " + surname;
    }
    var inits = parts.map(function (p) { return p.charAt(0).toUpperCase() + "."; }).join(" ");
    return { surname: surname, inits: inits };
  }
  function citeAuthors(authors) {
    var names = authors.map(function (a) {
      var x = initials(a.name || a);
      return x.surname + (x.inits ? ", " + x.inits : "");
    });
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + " & " + names[1];
    if (names.length <= 5) return names.slice(0, -1).join(", ") + ", & " + names[names.length - 1];
    return names[0] + " et al.";
  }
  function authorLine(authors) {
    return authors.map(function (a) { return a.name; }).join(", ").replace(/, ([^,]*)$/, authors.length > 1 ? ", and $1" : "$1");
  }

  // ---------- title generation (in the field's vocabulary) ----------
  function makeTitle(r, subj) {
    var term = r.pick(subj.terms), term2 = r.pick(subj.terms);
    var method = r.pick(W.METHODS), adj = r.pick(W.PROSE_ADJ), place = r.pick(W.PLACES), g = subj.n;
    var t = r.pick([
      "Toward a " + adj + " account of " + term,
      "Reconsidering " + term + " in " + subj.field,
      cap(term) + " and " + term2 + ": a " + adj + " study",
      "The role of " + term + " in " + g,
      "Measuring " + term + ": evidence from " + place,
      "A " + adj + " model of " + g,
      "On " + term + " and its discontents",
      "Patterns of " + term + " across " + place,
      cap(g) + " reconsidered: the case for " + term,
      "From " + term + " to " + term2 + ": rethinking " + subj.field,
      "What " + method + " tells us about " + g,
      "The " + cap(term.split(" ")[0]) + " hypothesis revisited"
    ]);
    return t;
  }

  // ---------- author pool for a field (coherent with its labs) ----------
  function authorPool(field) {
    var r = Rand("authorpool::" + field.seed);
    var pool = [];
    field.web.labs.forEach(function (l) { pool.push({ name: l.pi, affil: l.univ }); });
    // a few extra field regulars so not every author is a PI
    for (var i = 0; i < 8; i++) pool.push({ name: W.personName(r), affil: W.university(r) });
    return pool;
  }

  // ---------- header: cheap, self-consistent, NEVER calls generate() ----------
  // For key "f" it returns the field's foundational paper (from the dossier), so
  // the full article and the /f/ card agree. For "r<k>" it mints a header in the
  // field's voice. `field` may be passed to avoid re-deriving it.
  function header(id, field) {
    var pid = parseId(id);
    field = field || W.generate(pid.fieldSeed);
    var subj = field.subject;

    if (pid.key === "f") {
      var p = field.paper;
      return {
        id: pid.id, fieldSeed: pid.fieldSeed, key: "f",
        title: p.title, authors: p.authors, journal: p.journal,
        year: p.year, volume: p.volume, issue: p.issue, pages: p.pages,
        doi: p.doi, citations: p.citations, abstract: p.abstract,
        fieldName: field.field.name
      };
    }

    var r = Rand("phdr::" + pid.id);
    var pool = authorPool(field);
    var nAuth = r.pickw([1, 2, 3, 4], function (x) { return [3, 5, 3, 1][x - 1]; });
    var authors = r.sample(pool, Math.min(nAuth, pool.length));
    if (!authors.length) authors = [{ name: W.personName(r), affil: W.university(r) }];

    var journal = r.chance(0.72) ? r.pick(field.journals).name
                                 : "The " + r.pick(["Journal", "Annals", "Review"]) + " of " + r.pick(W.MODIFIERS) + " Studies";
    var year = r.int(field.field.founded, 2025);
    var vol = Math.max(1, year - r.int(1990, 2004));
    var issue = r.int(1, 4);
    var startPg = r.int(1, 320);
    var pages = startPg + "–" + (startPg + r.int(8, 30));
    var abbr = (subj.n.replace(/[^a-z]/gi, "").slice(0, 4).toLowerCase()) || "xxx";
    var doi = "10." + r.int(1000, 9999) + "/" + abbr + "." + year + "." + r.int(100, 999);
    var age = 2026 - year;
    var citations = Math.round(r.int(0, 22) + age * r.int(0, 6) * r.f());

    return {
      id: pid.id, fieldSeed: pid.fieldSeed, key: pid.key,
      title: makeTitle(r, subj), authors: authors, journal: journal,
      year: year, volume: vol, issue: issue, pages: pages, doi: doi,
      citations: citations, fieldName: field.field.name
    };
  }

  // ---------- references ----------
  // A mix of in-field papers (shared field), the field's own foundational paper,
  // and a minority of cross-field "interdisciplinary" citations. Each carries the
  // target paper id so the reader can open it.
  function buildReferences(r, field, selfId) {
    var pid = parseId(selfId);
    var n = r.int(12, 22);
    var refs = [];
    var usedIds = {};
    usedIds[pid.id] = 1; // never cite ourselves as a reference row
    var localK = r.shuffle(Array.from({ length: 46 }, function (_, i) { return i + 1; }));
    var lk = 0;

    for (var i = 0; i < n; i++) {
      var targetId, hdr;
      var roll = r.f();
      if (roll < 0.14 && pid.key !== "f" && !usedIds[pid.fieldSeed + ".f"]) {
        targetId = pid.fieldSeed + ".f";                // cite the founder
      } else if (roll < 0.78) {
        targetId = pid.fieldSeed + ".r" + localK[lk++ % localK.length]; // in-field
      } else {
        // interdisciplinary reach: another field entirely
        var other = String(r.int(1, 900000000));
        targetId = other + (r.chance(0.5) ? ".f" : ".r" + r.int(1, 40));
      }
      if (usedIds[targetId]) continue;
      usedIds[targetId] = 1;
      var sameField = parseId(targetId).fieldSeed === pid.fieldSeed;
      hdr = header(targetId, sameField ? field : null);
      refs.push({ num: refs.length + 1, id: targetId, header: hdr, sameField: sameField });
    }
    return refs;
  }

  // in-text citation marker over a set of reference numbers → "[3, 7]"
  function citeTokens(nums) {
    return "[" + nums.slice().sort(function (a, b) { return a - b; }).join(", ") + "]";
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; });
  }
  function cite(refs, r, k) {
    if (!refs.length) return "";
    k = Math.min(k || 1, refs.length);
    var chosen = r.sample(refs.map(function (x) { return x.num; }), k);
    return ' <a class="cite" href="#ref-' + chosen[0] + '">' + citeTokens(chosen) + "</a>";
  }

  // resolve tokens analysis.js embeds in text: @fig:ROLE@ → "Fig. N",
  // @tab@ → "Table 1", @place@ → a place name.
  function makeResolver(figNum, place) {
    return function (html) {
      return String(html)
        .replace(/@fig:([\w:]+)@/g, function (m, role) { return figNum[role] ? "Fig.&nbsp;" + figNum[role] : "the figure"; })
        .replace(/@tab@/g, "Table&nbsp;1")
        .replace(/@place@/g, esc(place));
    };
  }

  // Build the paper skeleton. Narrative sections (intro / related / discussion /
  // conclusion) are shared boilerplate; the design-specific content comes from
  // analysis.js. Every section carries an ordered `flow` of blocks:
  //   {t:'p', html, first?}  {t:'eq', num, html}  {t:'fig', num, svg, caption, wide}  {t:'table', caption, cols, rows}
  function buildSkeleton(r, field, hdr, refs, An, figNum, place) {
    var subj = field.subject, g = subj.n;
    var fr = An.frame, rep = An.reported, resolve = makeResolver(figNum, place);
    var term = fr.focal.index, termB = fr.focal.rival, indexName = fr.indexName;
    var method = r.pick(W.METHODS), adj = r.pick(W.PROSE_ADJ);
    var theories = field.web.theories;
    var champion = theories.length ? r.pick(theories) : null;
    var rival = theories.length > 1 ? r.pick(theories.filter(function (t) { return t !== champion; })) : null;
    var eqNo = 0;
    function Par(html, first) { return { t: "p", html: html, first: !!first }; }
    var sections = [];

    // 1. Introduction
    sections.push({ title: "Introduction", flow: [
      Par("The study of " + esc(subj.studies) + " occupies an uneasy place within " + esc(field.field.discipline.toLowerCase()) +
        ". Although " + esc(g) + " has attracted sporadic scholarly attention for over a century" + cite(refs, r, 2) +
        ", a systematic treatment of " + esc(term) + " has remained elusive. This paper argues that " + esc(term) +
        " is not an incidental property of " + esc(g) + " but its organising principle.", true),
      Par("Two difficulties have hindered progress. First, prior work has tended to conflate " + esc(term) + " with " + esc(termB) +
        cite(refs, r, 1) + ", obscuring the very distinction on which a rigorous account must rest. Second, the field has lacked a" +
        " reproducible measure: claims about " + esc(g) + " are typically advanced " + esc(r.pick(["impressionistically", "on the basis of a single case", "by appeal to authority", "without quantification"])) +
        cite(refs, r, 1) + ". We take up " + esc(An.designLabel) + " to address both."),
      Par("Our contribution is threefold. (i) We introduce the " + esc(indexName) + " (§2), a " + esc(adj) +
        " and reproducible measure of " + esc(term) + " in " + esc(g) + ". (ii) We apply it to " + rep.N + " cases (§4). " +
        "(iii) We argue that the results " + esc(r.pick(["vindicate", "complicate", "undercut"])) +
        " the received view" + (champion ? ", commonly associated with " + esc(champion.name) : "") + cite(refs, r, 1) + ".")
    ]});

    // 2. Background
    sections.push({ title: "Background and related work", flow: [
      Par("The modern field dates to the founding programme of the 1980s" + cite(refs, r, 1) +
        ", but its central debate is older. " + (champion ? esc(champion.name) + " holds " + esc(champion.claim) : "One tradition emphasises structure") +
        cite(refs, r, 1) + "." + (rival ? " Against this, " + esc(rival.name) + " maintains " + esc(rival.claim) + cite(refs, r, 1) + "." : ""), true),
      Par("Both traditions, we contend, mistake a measurement problem for a metaphysical one. Where " +
        (champion ? esc(champion.name) : "the structuralists") + " treats " + esc(term) +
        " as given, and " + (rival ? esc(rival.name) : "their critics") + " denies it altogether, we take it to be " +
        esc(r.pick(["latent but recoverable", "gradient rather than categorical", "observer-relative yet stable", "quantifiable in principle"])) +
        ". Recent methodological advances" + cite(refs, r, 2) + " make this position tractable for the first time.")
    ]});

    // map an analysis flow (p / h3 / fig / table / eq) into a rendered section flow
    function mapFlow(items) {
      return items.map(function (it) {
        if (it.t === "p") return { t: "p", html: resolve(it.html), first: it.first };
        if (it.t === "h3") return { t: "h3", text: it.text };
        if (it.t === "table") return { t: "table", caption: it.caption, cols: it.cols, rows: it.rows };
        if (it.t === "fig") return { t: "fig", num: figNum[it.role], svg: it.svg, caption: resolve(it.caption), wide: it.wide };
        if (it.t === "eq") return { t: "eq", num: ++eqNo, html: resolve(it.html) };
        return it;
      });
    }

    // 3. Data and methods (the datastream + the sequence of techniques)
    var methodsFlow = [Par(resolve(An.dataStatement), true)].concat(mapFlow(An.methodsFlow));
    methodsFlow.push(Par("Estimates were obtained by " + esc(method) + "; all analysis was carried out in " +
      esc(r.pick(["R 4.x", "Python", "a bespoke pipeline", "Stata", "Julia"])) + ", and code is available on request."));
    sections.push({ title: "Data and methods", flow: methodsFlow });

    // 4. Results — the analytical story: one subsection per technique, figures + readouts interleaved
    sections.push({ title: "Results", flow: mapFlow(An.resultsFlow) });

    // 5. Discussion — interpretation, then the synthesis subsection, then limitations
    var discFlow = [Par("These analyses converge on the " + esc(indexName) + ": the measured factors account for " +
      rep.varExplained + "% of the variation, so " + esc(term) + " is neither an artefact nor beyond measure.", true)];
    discFlow = discFlow.concat(mapFlow(An.discussionFlow || []));
    discFlow.push(Par("<b>Limitations.</b> Our data are drawn from a single setting, which may be atypical; the " + esc(indexName) +
      " rests on choices a larger, pre-registered sample could sharpen; and " + esc(An.designLabel) +
      " assumes " + esc(r.pick(["independence of cases", "stationarity", "approximate normality", "a well-specified model"])) +
      ", which " + esc(g) + " may violate in ways we have not modelled."));
    sections.push({ title: "Discussion", flow: discFlow });

    // 6. Conclusion
    sections.push({ title: "Conclusion", flow: [
      Par("We have introduced a reproducible measure of " + esc(term) + " in " + esc(g) + " and shown, across " + rep.N +
        " cases, that it carries real structure. If " + esc(subj.field) + " is to become a cumulative science it needs shared instruments; the " +
        esc(indexName) + " is offered in that spirit. Future work should widen the sample, learn the measure's weights from data, and test whether it travels to adjacent domains" + cite(refs, r, 1) + ".", true)
    ]});

    return sections;
  }

  // ---------- acknowledgements ----------
  function makeAcks(r, field) {
    var f = field.funding.byFunder.slice(0, r.int(1, Math.min(2, field.funding.byFunder.length)));
    var thanks = f.map(function (x) { return esc(x.funder) + " (grant no. " + r.int(100000, 999999) + ")"; }).join(" and ");
    var pi = r.pick(field.web.labs).pi;
    return "This work was supported by " + thanks + ". We thank " + esc(pi) +
      " and two anonymous reviewers for comments on an earlier draft. The authors declare no competing interests.";
  }

  // ---------- top-level ----------
  function generate(id) {
    var pid = parseId(id);
    var field = W.generate(pid.fieldSeed);
    var hdr = header(pid.id, field);
    var r = Rand("paper::" + pid.id);
    var place = r.pick(W.PLACES);
    var An = ANALYSIS.run(pid.id, field);
    var refs = buildReferences(r, field, pid.id);

    // number figures in reading order: through the Results story, then the synthesis
    var figNum = {}, fn = 0;
    (An.resultsFlow || []).concat(An.discussionFlow || []).forEach(function (it) { if (it.t === "fig") figNum[it.role] = ++fn; });

    var sections = buildSkeleton(r, field, hdr, refs, An, figNum, place);
    var acks = makeAcks(r, field);

    // abstract for non-foundational papers (foundational reuses the field's own)
    var abstract = hdr.abstract || (
      "We take up " + An.designLabel + " to study " + field.subject.n + " in " + field.field.name +
      ". Introducing the " + An.frame.indexName + ", we analyse " + An.reported.N + " cases from " + place +
      "; our results (r = " + An.reported.r + ", p " + An.reported.p + ") indicate that " + An.frame.focal.index +
      " is measurable and carries " + An.reported.varExplained + "% of the relevant variation. We discuss the field's foundational disputes."
    );

    return {
      id: pid.id,
      fieldSeed: pid.fieldSeed,
      key: pid.key,
      design: An.design,
      isFoundational: pid.key === "f",
      field: { seed: field.seed, name: field.field.name, discipline: field.field.discipline, studies: field.field.studies },
      header: {
        title: hdr.title, authors: hdr.authors, journal: hdr.journal,
        year: hdr.year, volume: hdr.volume, issue: hdr.issue, pages: hdr.pages,
        doi: hdr.doi, citations: hdr.citations
      },
      abstract: abstract,
      sections: sections,
      acknowledgements: acks,
      references: refs.map(function (rf) {
        var h = rf.header;
        return {
          num: rf.num, id: rf.id, sameField: rf.sameField,
          authors: citeAuthors(h.authors), year: h.year, title: h.title,
          journal: h.journal, volume: h.volume, issue: h.issue, pages: h.pages, doi: h.doi
        };
      }),
      _disclaimer: "Generated fiction. Not a real paper."
    };
  }

  P.generate = generate;
  P.header = header;
  P.parseId = parseId;
  P.citeAuthors = citeAuthors;
  P.authorLine = authorLine;
})();
