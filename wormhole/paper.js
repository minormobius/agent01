// wormhole — the full-paper engine.
//
// Turns a paper id into a whole procedurally-generated journal article: title,
// authors + affiliations, abstract, numbered sections (intro / related work /
// data & methods with display equations / results with a table / discussion /
// conclusion), acknowledgements, and a reference list.
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
// Depends on engine.js (WORMHOLE) for the field context. header() is cheap and
// NEVER calls generate(), so building a paper's references (one header() per
// reference) can't recurse. Deterministic; runs in worker, browser, and node
// (paper.selftest.mjs). All fiction — no real paper is described.

(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var W = NS.WORMHOLE;
  if (!W) throw new Error("wormhole/paper.js requires engine.js (WORMHOLE) to be loaded first");
  var DATA = NS.WORMHOLE_DATA, CHARTS = NS.WORMHOLE_CHARTS;
  if (!DATA || !CHARTS) throw new Error("wormhole/paper.js requires dataset.js + charts.js (and stats.js) loaded first");
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
    // stable order: references appear numbered as generated
    return refs;
  }

  // in-text citation marker over a set of reference numbers → "[3, 7]"
  function citeTokens(nums) {
    return "[" + nums.slice().sort(function (a, b) { return a - b; }).join(", ") + "]";
  }

  // ---------- prose ----------
  // Each section is an array of paragraphs; a paragraph is {html} where cite
  // markers are already inlined as <a class="cite" href="#ref-N">[N]</a>. The
  // renderer only escapes plain text (paragraphs are pre-escaped here).
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; });
  }
  function cite(refs, r, k) {
    if (!refs.length) return "";
    k = Math.min(k || 1, refs.length);
    var chosen = r.sample(refs.map(function (x) { return x.num; }), k);
    var tok = citeTokens(chosen);
    return ' <a class="cite" href="#ref-' + chosen[0] + '">' + tok + "</a>";
  }

  // pick k distinct terms, padding by reuse only if the bank is too small
  function distinctTerms(r, terms, k) {
    var out = r.sample(terms, Math.min(k, terms.length));
    while (out.length < k) out.push(terms[out.length % terms.length]);
    return out;
  }

  function buildSections(r, field, hdr, refs, data, figNum) {
    var subj = field.subject;
    var g = subj.n;
    var term = data.focal.index, termB = data.focal.rival, termC = data.focal.cov;
    var indexName = data.indexName, rep = data.reported;
    var method = hdr.method = r.pick(W.METHODS);
    var place = r.pick(W.PLACES);
    var adj = r.pick(W.PROSE_ADJ);
    var theories = field.web.theories;
    var champion = theories.length ? r.pick(theories) : null;
    var rival = theories.length > 1 ? r.pick(theories.filter(function (t) { return t !== champion; })) : null;
    hdr.indexName = indexName;
    function figref(role) { return (figNum && figNum[role]) ? ' (Fig.&nbsp;' + figNum[role] + ')' : ''; }

    var sections = [];

    // 1. Introduction
    sections.push({ title: "Introduction", paras: [
      { html: "The study of " + esc(subj.studies) + " occupies an uneasy place within " + esc(field.field.discipline.toLowerCase()) +
        ". Although " + esc(g) + " has attracted sporadic scholarly attention for over a century" + cite(refs, r, 2) +
        ", a systematic treatment of " + esc(term) + " has remained elusive. This paper argues that " + esc(term) +
        " is not an incidental property of " + esc(g) + " but its organising principle." },
      { html: "Two difficulties have hindered progress. First, prior work has tended to conflate " + esc(term) + " with " + esc(termB) +
        cite(refs, r, 1) + ", obscuring the very distinction on which a rigorous account must rest. Second, the field has lacked a" +
        " reproducible measure: claims about " + esc(g) + " are typically advanced " + esc(r.pick(["impressionistically", "on the basis of a single case", "by appeal to authority", "without quantification"])) +
        cite(refs, r, 1) + ". We address both problems directly." },
      { html: "Our contribution is threefold. (i) We introduce the " + esc(indexName) + " (§2), a " + esc(adj) +
        " and reproducible measure of " + esc(term) + " in " + esc(g) + ". (ii) Applying " + esc(method) + " to a corpus of " +
        rep.N + " cases from " + esc(place) + ", we show that " + esc(term) + " varies " + esc(r.pick(["systematically", "sharply", "predictably", "non-trivially"])) +
        " with " + esc(termC) + " (§4). (iii) We argue that these results " + esc(r.pick(["vindicate", "complicate", "undercut"])) +
        " the received view" + (champion ? ", commonly associated with " + esc(champion.name) : "") + cite(refs, r, 1) + "." }
    ]});

    // 2. Related work
    var relParas = [
      { html: "The modern field dates to the founding programme of the 1980s" + cite(refs, r, 1) +
        ", but its central debate is older. " + (champion ? esc(champion.name) + " holds " + esc(champion.claim) : "One tradition emphasises structure") +
        cite(refs, r, 1) + "." + (rival ? " Against this, " + esc(rival.name) + " maintains " + esc(rival.claim) + cite(refs, r, 1) + "." : "") },
      { html: "Both traditions, we contend, mistake a measurement problem for a metaphysical one. Where " +
        (champion ? esc(champion.name) : "the structuralists") + " treats " + esc(term) +
        " as given, and " + (rival ? esc(rival.name) : "their critics") + " denies it altogether, we take it to be " +
        esc(r.pick(["latent but recoverable", "gradient rather than categorical", "observer-relative yet stable", "quantifiable in principle"])) +
        ". Recent methodological advances" + cite(refs, r, 2) + " make this position tractable for the first time." }
    ];
    sections.push({ title: "Background and related work", paras: relParas });

    // 3. Data and methods (with equations)
    sections.push({ title: "Data and methods", paras: [
      { html: "<b>Corpus.</b> We assembled " + rep.N + " instances of " + esc(g) + " collected in " + esc(place) +
        " between " + rep.y0 + " and " + rep.y1 + ". Each instance was coded for " + esc(term) + ", " + esc(termB) +
        ", and " + esc(termC) + " by two annotators (inter-rater agreement κ = " + rep.kappa + ")." },
      { html: "<b>The " + esc(indexName) + ".</b> Following " + esc(r.pick(["standard practice", "the approach of the founders", "recent proposals"])) +
        cite(refs, r, 1) + ", we define the " + esc(indexName) + " for a case <i>i</i> as a weighted aggregate of its " +
        esc(term) + " components:", eq: {
          num: 1,
          html: '<i>I</i><sub>' + esc(g.charAt(0)) + '</sub> = <span class="frac"><span class="num">1</span><span class="den">N</span></span>' +
                ' &sum;<sub><i>j</i>=1</sub><sup><i>N</i></sup> <i>w<sub>j</sub></i> <i>t<sub>ij</sub></i>'
        } },
      { html: "where <i>t<sub>ij</sub></i> is the <i>j</i>-th component of " + esc(term) + " in case <i>i</i> and <i>w<sub>j</sub></i> its weight. " +
        "To test whether " + esc(term) + " tracks " + esc(termC) + ", we fit a " + esc(r.pick(["mixed-effects", "hierarchical", "least-squares", "quasi-Poisson"])) +
        " model", eq: {
          num: 2,
          html: '<i>y<sub>i</sub></i> = &beta;<sub>0</sub> + &beta;<sub>1</sub> <i>I</i><sub>' + esc(g.charAt(0)) + '</sub> + &epsilon;<sub>i</sub>,&nbsp;&nbsp; &epsilon;<sub>i</sub> ~ <i>N</i>(0, &sigma;<sup>2</sup>)'
        } },
      { html: "and estimated &beta;<sub>1</sub> by " + esc(method) + ". All analysis was carried out in " +
        esc(r.pick(["R 4.x", "Python", "a bespoke pipeline", "Stata"])) + "; code and coding manual are available on request." }
    ]});

    // 4. Results (figures + table)
    sections.push({ title: "Results", paras: [
      { html: "Table 1 summarises the " + esc(indexName) + " across the three subsets" + figref("dist") + ". The index ranged from " + rep.lo +
        " to " + rep.hi + " (mean " + rep.mean + ", SD " + rep.sd + "). As predicted, " + esc(term) + " was " +
        esc(r.pick(["strongly", "moderately", "reliably"])) + " associated with " + esc(termC) +
        figref("scatter") + " (&beta;<sub>1</sub> = " + rep.beta + ", " + rep.ci + "; <i>r</i> = " + rep.r + ", <i>p</i> " + rep.p + ", <i>R</i><sup>2</sup> = " + rep.r2 + ")." },
      { html: "The association was consistent across subsets and near-orthogonal to the field's other measures" + figref("heat") + cite(refs, r, 1) + ". It was robust to " +
        esc(r.pick(["dropping outliers", "reweighting", "an alternative coding scheme", "leave-one-region-out cross-validation"])) +
        ". Contrary to " + (rival ? esc(rival.name) : "the sceptical view") + ", we found no evidence that " + esc(term) +
        " reduces to " + esc(termB) + " (ΔAIC = " + rep.aic + " in favour of the two-factor model)." }
    ], table: { caption: "Descriptive statistics of the " + indexName + " by subset.", cols: rep.table.cols, rows: rep.table.rows } });

    // 5. Discussion
    sections.push({ title: "Discussion", paras: [
      { html: "These results place the " + esc(indexName) + " on a firm empirical footing and, we suggest, " +
        esc(r.pick(["settle", "reframe", "reopen"])) + " a debate that has run since the field's founding. The intuition" +
        (champion ? " — associated with " + esc(champion.name) + " — " : " ") + "that " + esc(term) + " is central to " + esc(g) +
        " is borne out; but the assumption that " + esc(term) + " is categorical is not. A variance decomposition attributes " + rep.varExplained + "% of the spread in the " + esc(indexName) + " to the measured factors" + figref("model") + "." },
      { html: "<b>Limitations.</b> Our corpus is drawn from a single region, and " + esc(place) +
        " may be atypical. The " + esc(indexName) + " weights <i>w<sub>j</sub></i> were set " +
        esc(r.pick(["a priori", "by expert elicitation", "to equal values", "by pilot calibration"])) +
        " and a data-driven weighting might sharpen the estimates. Finally, " + esc(method) +
        " assumes " + esc(r.pick(["independence of cases", "stationarity", "linearity", "a well-specified error model"])) +
        ", which " + esc(g) + " may violate in ways we have not modelled." }
    ]});

    // 6. Conclusion
    sections.push({ title: "Conclusion", paras: [
      { html: "We have introduced a reproducible measure of " + esc(term) + " in " + esc(g) + " and shown that it " +
        esc(r.pick(["predicts", "co-varies with", "structures"])) + " " + esc(termC) + " across " + rep.N +
        " cases from " + esc(place) + ". If " + esc(subj.field) + " is to become a cumulative science, it needs shared instruments; the " +
        esc(indexName) + " is offered in that spirit. Future work should extend the corpus beyond " + esc(place) +
        ", learn the weights from data, and test whether the " + esc(indexName) + " travels to adjacent domains" + cite(refs, r, 1) + "." }
    ]});

    return sections;
  }

  // ---------- figures: real charts drawn over the fabricated dataset ----------
  // Each figure is a genuine plot of data.* arrays; captions cite the same numbers
  // the Results section reports (both computed from the dataset). Fig 2 (the
  // distribution) and Fig 4 (the model view) vary by seed so browsing shows the
  // library's range.
  function makeFigures(r, field, data) {
    var idx = data.indexName, cov = data.focal.cov, riv = data.focal.rival;
    var F = [], num = 0;
    function add(role, section, svg, caption, wide) { num++; F.push({ num: num, role: role, section: section, svg: svg, caption: caption, wide: !!wide }); }

    // Fig 1 — the headline result: index vs covariate with OLS fit + CI band
    add("scatter", "Results",
      CHARTS.scatterFit({ points: data.points, groups: data.subsets, xlabel: cap(cov), ylabel: idx, annot: "r = " + data.reported.r, aria: idx + " versus " + cov }),
      "The " + esc(idx) + " increases with " + esc(cov) + " (OLS fit; <i>r</i> = " + data.reported.r + ", " + data.reported.ci +
      "; <i>p</i> " + data.reported.p + "). Each point is one case (<i>n</i> = " + data.N + "); the shaded band is the 95% mean-response interval; colour marks subset.");

    // Fig 2 — distribution of the index by subset (type varies)
    var distType = r.pick(["violin", "ridgeline", "box"]);
    var distSvg = distType === "violin" ? CHARTS.violin({ groups: data.bySubset, ylabel: idx })
      : distType === "ridgeline" ? CHARTS.ridgeline({ groups: data.bySubset, xlabel: idx })
        : CHARTS.box({ groups: data.bySubset, ylabel: idx });
    add("dist", "Results", distSvg,
      "Distribution of the " + esc(idx) + " by subset (" + distType + "; " + data.N + " cases). The subsets differ in level, as the model's subset terms confirm.");

    // Fig 3 — correlation structure across the field's measures (spans the page)
    add("heat", "Results",
      CHARTS.heatmap({ matrix: data.corr.matrix, labels: data.corr.labels, diverging: true, domain: [-1, 1], cblabel: "r" }),
      "Pairwise correlations (Pearson <i>r</i>) among the field's principal measures. The " + esc(idx) + " loads with " + esc(cov) +
      " and is nearly orthogonal to " + esc(riv) + " — the structure the two-factor model rests on.", true);

    // Fig 4 — the model view: coefficient forest or variance waterfall
    var modelType = r.pick(["forest", "waterfall", "forest"]);
    if (modelType === "forest") {
      add("model", "Discussion",
        CHARTS.forest({ rows: data.forestRows, xlabel: "standardized effect on the " + idx + " (SD)", ref: 0 }),
        "Standardized effects on the " + esc(idx) + " (squares = OLS point estimates, bars = 95% CI; dashed line = no effect). " +
        cap(cov) + " is the dominant driver; " + esc(riv) + " adds a smaller but non-zero increment; subset shifts the level.");
    } else {
      add("model", "Discussion",
        CHARTS.waterfall({ items: data.waterfallItems, ylabel: "% of variance" }),
        "Variance in the " + esc(idx) + " attributed to each factor. " + cap(cov) + " accounts for most of the explained variance; " +
        esc(riv) + " and subset add modest increments, leaving " + (100 - data.reported.varExplained) + "% unexplained.");
    }
    return F;
  }

  // ---------- acknowledgements ----------
  function makeAcks(r, field) {
    var f = field.funding.byFunder.slice(0, r.int(1, Math.min(2, field.funding.byFunder.length)));
    var thanks = f.map(function (x) {
      return esc(x.funder) + " (grant no. " + r.pick(["", ""]) + (r.int(100000, 999999)) + ")";
    }).join(" and ");
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
    var data = DATA.build(pid.id, field);
    var refs = buildReferences(r, field, pid.id);
    var figures = makeFigures(r, field, data);
    var figNum = {}; figures.forEach(function (f) { figNum[f.role] = f.num; });
    var sections = buildSections(r, field, hdr, refs, data, figNum);
    // attach each figure to the section it belongs in
    sections.forEach(function (sec) {
      sec.figures = figures.filter(function (f) { return f.section === sec.title; })
        .map(function (f) { return { num: f.num, svg: f.svg, caption: f.caption, wide: f.wide }; });
    });
    var acks = makeAcks(r, field);
    // an abstract for non-foundational papers (foundational reuses field.paper's)
    var abstract = hdr.abstract || (
      "We introduce the " + data.indexName + ", a reproducible measure of " + data.focal.index +
      " in " + field.subject.n + ", and apply it to " + data.reported.N + " cases from " + r.pick(W.PLACES) +
      " using " + (hdr.method || r.pick(W.METHODS)) + ". " + field.field.name +
      " has long debated the status of " + data.focal.cov + "; our results (r = " + data.reported.r + ", p " + data.reported.p +
      ") suggest it is measurable, gradient, and central to " + field.subject.n + ". We discuss the field's foundational disputes."
    );

    return {
      id: pid.id,
      fieldSeed: pid.fieldSeed,
      key: pid.key,
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
