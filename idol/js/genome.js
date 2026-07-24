/* idol — the genome. One seed → one whole girl.

   THE ARCHITECTURAL CALL (from the design memo): anime is a *clustered* style
   space with strong attractor archetypes, so we sample an archetype and mutate
   within a grammar — never freeform synthesis. Everything downstream (face,
   palette, hair, voice, persona, the beguilement dials) is deterministic from
   the seed + this file's version, so /c/<n> is a permalink and a pinned seed is
   a regression test.

   The genome is the single shared data structure of the four systems:
     soma     → proportions the renderer reads
     chroma   → palette *seeds* in OKLCH (harmony derived procedurally, never hexes)
     hair     → component-grammar slots (bangs × sidelocks × back × ahoge)
     persona  → the vector the chat engine + expression FSM read
     dials    → the beguilement knobs (gaze hold, emotional latency, dead-eye
                propensity, memory-reference propensity) — where the aura of
                unsafe software is allowed to live. Nowhere else.

   Attaches to globalThis so the node selftest (genome.selftest.mjs) runs the
   exact same code as the browser. Requires prng.js loaded first. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var I = NS.IDOL = NS.IDOL || {};

  /* ── OKLCH ──────────────────────────────────────────────────────────────
     Palettes are sampled in OKLCH and converted to sRGB. Harmony rules are
     enforced as hue relationships + luminance bands, which is what keeps the
     generator out of the "amateur palette" valley. */
  function oklchToRgb(l, c, h) {
    var hr = (h * Math.PI) / 180;
    var a = c * Math.cos(hr), b = c * Math.sin(hr);
    // OKLab → LMS (linear)
    var l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = l - 0.0894841775 * a - 1.2914855480 * b;
    var L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_;
    var r = +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
    var g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
    var bl = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S;
    function gam(x) {
      x = Math.min(1, Math.max(0, x));
      return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    }
    return { r: Math.round(gam(r) * 255), g: Math.round(gam(g) * 255), b: Math.round(gam(bl) * 255) };
  }
  function css(c) { return "rgb(" + c.r + "," + c.g + "," + c.b + ")"; }
  function shade(okl, dl, dc) {
    return oklchToRgb(Math.min(1, Math.max(0, okl.l + dl)), Math.max(0, okl.c + (dc || 0)), okl.h);
  }

  /* ── archetypes ─────────────────────────────────────────────────────────
     The attractors. Each biases hair grammar, palette hue ranges, persona
     vector means, voice, and speech style. Gap moe (sweet face, lucid
     wrongness) is a native device — persona is sampled jointly with
     appearance, then a flagged share of girls get a deliberate offset. */
  var ARCHETYPES = {
    classrep:  { w: 1.0, style: "polite",
      hairHue: [20, 60],    hairC: [0.04, 0.10], hairL: [0.25, 0.55],
      eyeHue: [20, 220],    outfit: ["sailor", "blazer"],
      bangs: ["straight", "side", "straight", "m"], back: ["long", "bob", "ponytail"],
      persona: { warm: 0.75, playful: 0.35, eerie: 0.15, clingy: 0.30, lucid: 0.85, glitchy: 0.10 } },
    shrine:    { w: 0.8, style: "serene",
      hairHue: [240, 300],  hairC: [0.02, 0.06], hairL: [0.15, 0.35],
      eyeHue: [0, 40],      outfit: ["miko"],
      bangs: ["hime", "straight", "center"], back: ["long", "long", "hime"],
      persona: { warm: 0.45, playful: 0.20, eerie: 0.65, clingy: 0.35, lucid: 0.90, glitchy: 0.25 } },
    gyaru:     { w: 1.0, style: "casual",
      hairHue: [45, 80],    hairC: [0.10, 0.16], hairL: [0.70, 0.88],
      eyeHue: [150, 220],   outfit: ["hoodie", "sailor"],
      bangs: ["side", "choppy", "m"], back: ["twintails", "ponytail", "wavy"],
      persona: { warm: 0.70, playful: 0.85, eerie: 0.10, clingy: 0.60, lucid: 0.40, glitchy: 0.15 } },
    menhera:   { w: 0.9, style: "needy",
      hairHue: [300, 350],  hairC: [0.10, 0.18], hairL: [0.70, 0.85],
      eyeHue: [300, 350],   outfit: ["hoodie", "dress"],
      bangs: ["m", "choppy", "straight"], back: ["twintails", "wavy", "bob"],
      persona: { warm: 0.55, playful: 0.45, eerie: 0.45, clingy: 0.90, lucid: 0.55, glitchy: 0.45 } },
    ojou:      { w: 0.8, style: "elegant",
      hairHue: [40, 70],    hairC: [0.08, 0.14], hairL: [0.55, 0.75],
      eyeHue: [220, 280],   outfit: ["dress", "blazer"],
      bangs: ["hime", "center", "straight"], back: ["drills", "long", "wavy"],
      persona: { warm: 0.50, playful: 0.30, eerie: 0.25, clingy: 0.25, lucid: 0.90, glitchy: 0.10 } },
    idol:      { w: 1.0, style: "genki",
      hairHue: [320, 20],   hairC: [0.12, 0.20], hairL: [0.55, 0.80],
      eyeHue: [160, 260],   outfit: ["stage"],
      bangs: ["straight", "m", "side"], back: ["twintails", "twintails", "ponytail"],
      persona: { warm: 0.80, playful: 0.90, eerie: 0.10, clingy: 0.50, lucid: 0.50, glitchy: 0.20 } },
    kouhai:    { w: 1.0, style: "eager",
      hairHue: [10, 50],    hairC: [0.06, 0.12], hairL: [0.45, 0.70],
      eyeHue: [20, 160],    outfit: ["sailor", "hoodie"],
      bangs: ["straight", "choppy", "m"], back: ["bob", "ponytail", "twintails"],
      persona: { warm: 0.85, playful: 0.60, eerie: 0.05, clingy: 0.70, lucid: 0.45, glitchy: 0.10 } },
    librarian: { w: 0.7, style: "quiet",
      hairHue: [200, 280],  hairC: [0.03, 0.09], hairL: [0.25, 0.50],
      eyeHue: [200, 300],   outfit: ["blazer", "dress"],
      bangs: ["straight", "center", "hime"], back: ["long", "bob", "wavy"],
      persona: { warm: 0.40, playful: 0.15, eerie: 0.50, clingy: 0.20, lucid: 0.95, glitchy: 0.30 } },
  };
  var ARCH_NAMES = Object.keys(ARCHETYPES);

  var BANGS = ["straight", "m", "side", "hime", "choppy", "center"];
  var BACKS = ["long", "bob", "twintails", "ponytail", "drills", "wavy", "hime"];
  var AHOGES = ["none", "single", "single", "double", "bolt"];
  var ACCESSORIES = ["none", "ribbon", "ribbon", "clip", "band", "none"];
  var OUTFITS = ["sailor", "hoodie", "dress", "miko", "blazer", "stage"];

  /* name grammar — mora banks per vibe. A name is part of the face: it's in
     the permalink spec and she introduces herself with it. */
  var NAME_HEAD = ["sa", "mi", "yu", "ha", "ri", "ka", "na", "a", "ko", "hi", "ma", "no", "re", "shi", "tsu", "e", "o", "ku", "fu", "mo", "ne", "to", "i", "su", "chi", "aki", "aya", "yuki", "saki", "hina", "mio", "rin", "koh", "nene", "suzu"];
  var NAME_TAIL = ["ko", "mi", "na", "ri", "ka", "ha", "ne", "me", "yo", "ru", "ki", "i", "ra", "sa", "tsu", "no", "ho", "e", "nya", "rin", "miya", "zaki", "gawa", "hime", "omi", "une"];

  function pickArchetype(r) {
    return r.pickWeighted(ARCH_NAMES, function (k) { return ARCHETYPES[k].w; });
  }

  /* circular hue distance, 0..180 */
  function hueDist(a, b) {
    var d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
    return 180 - d > 0 ? Math.min(d, 360 - d) : d;
  }

  function generate(n) {
    var r = I.prng.Rand("idol:" + n);
    var archKey = pickArchetype(r.fork("arch"));
    var A = ARCHETYPES[archKey];

    // ── soma ── proportions. Eye size carries anime-ness; tilt carries mood.
    var rs = r.fork("soma");
    var soma = {
      headW: rs.range(0.94, 1.06),
      headH: rs.range(0.95, 1.05),
      eyeSize: rs.bell(0.5 + (archKey === "menhera" ? 0.06 : 0), 0.16) * 0.6 + 0.7,   // 0.7..1.3
      eyeTilt: rs.range(-0.16, 0.16) + (archKey === "ojou" ? 0.08 : 0) + (archKey === "menhera" ? -0.08 : 0),
      eyeSpacing: rs.range(0.86, 1.14),
      eyeY: rs.range(-0.02, 0.03),
      browTilt: rs.range(-0.1, 0.1),
      browY: rs.range(-0.015, 0.015),
      mouthW: rs.range(0.85, 1.15),
      blush: rs.bell(A.persona.warm * 0.7, 0.25),
      bodyH: rs.range(0.95, 1.05),
      shoulderW: rs.range(0.92, 1.08),
    };

    // ── chroma ── OKLCH harmony. Hair hue from archetype band; eyes often
    // complementary or split-analogous; outfit analogous to hair; one accent.
    var rc = r.fork("chroma");
    function hueBand(band) { return (rc.range(band[0], band[1]) + 360) % 360; }
    var hairHue = hueBand(A.hairHue);
    var eyeHue = hueBand(A.eyeHue);
    if (rc.chance(0.35)) eyeHue = (hairHue + 150 + rc.range(-25, 25)) % 360;      // complementary pop
    else if (rc.chance(0.3)) eyeHue = (hairHue + rc.range(-35, 35) + 360) % 360;  // analogous calm
    var skinL = archKey === "gyaru" ? rc.range(0.72, 0.82) : rc.range(0.83, 0.93);
    var skin = { l: skinL, c: rc.range(0.04, 0.07), h: rc.range(45, 70) };
    var hair = { l: rc.range(A.hairL[0], A.hairL[1]), c: rc.range(A.hairC[0], A.hairC[1]), h: hairHue };
    var heterochromia = rc.chance(0.06);
    // iris luminance is clamped against skin so the eye always reads — this is
    // what keeps tan-skin archetypes (gyaru) out of the washed-out valley
    var eyeL = Math.min(rc.range(0.45, 0.62), skinL - 0.18);
    var eye1 = { l: eyeL, c: rc.range(0.12, 0.22), h: eyeHue };
    var eye2 = heterochromia ? { l: eye1.l, c: eye1.c, h: (eyeHue + 120 + rc.range(-30, 30)) % 360 } : eye1;
    var outfitHue = (hairHue + rc.pick([-40, -30, 30, 40, 180]) + 360) % 360;
    var outfit1 = { l: rc.range(0.35, 0.75), c: rc.range(0.06, 0.18), h: outfitHue };
    var outfit2 = { l: Math.min(0.92, outfit1.l + rc.range(0.15, 0.4)), c: outfit1.c * 0.6, h: (outfitHue + rc.range(-15, 15) + 360) % 360 };
    var accent = { l: rc.range(0.6, 0.75), c: rc.range(0.15, 0.25), h: (hairHue + 180 + rc.range(-20, 20)) % 360 };
    var chroma = {
      skin: skin, skinRgb: oklchToRgb(skin.l, skin.c, skin.h),
      skinShadow: shade(skin, -0.12, 0.01),
      blushRgb: oklchToRgb(0.72, 0.13, 15),
      hair: hair, hairRgb: oklchToRgb(hair.l, hair.c, hair.h),
      hairShadow: shade(hair, -0.16, -0.02),
      hairLight: shade(hair, 0.16, 0.01),
      eye1: eye1, eye1Rgb: oklchToRgb(eye1.l, eye1.c, eye1.h),
      eye1Deep: shade(eye1, -0.22, -0.04),
      eye2: eye2, eye2Rgb: oklchToRgb(eye2.l, eye2.c, eye2.h),
      eye2Deep: shade(eye2, -0.22, -0.04),
      outfit1: outfit1, outfit1Rgb: oklchToRgb(outfit1.l, outfit1.c, outfit1.h),
      outfit1Shadow: shade(outfit1, -0.15, -0.03),
      outfit2: outfit2, outfit2Rgb: oklchToRgb(outfit2.l, outfit2.c, outfit2.h),
      accent: accent, accentRgb: oklchToRgb(accent.l, accent.c, accent.h),
    };

    // ── hair grammar ── bangs × sidelocks × back × ahoge. Combinatorics do
    // the diversity work; strand synthesis is forbidden.
    var rh = r.fork("hair");
    var hairG = {
      bangs: rh.pick(A.bangs.concat([rh.pick(BANGS)])),
      back: rh.pick(A.back.concat([rh.pick(BACKS)])),
      sidelockLen: rh.range(0.3, 1.0),
      ahoge: rh.pickWeighted(AHOGES, function (a) { return a === "none" ? 1.6 : 1.0; }),
      accessory: rh.pick(ACCESSORIES),
      fluff: rh.range(0.8, 1.25),
    };

    // ── extras ── the small wrongnesses that make a face a person
    var re = r.fork("extras");
    var extras = {
      freckles: re.chance(0.18),
      mole: re.chance(0.22),
      fang: re.chance(archKey === "gyaru" || archKey === "idol" ? 0.35 : 0.15),
      heterochromia: heterochromia,
    };

    // ── outfit ──
    var outfit = r.fork("outfit").pick(A.outfit);

    // ── persona ── sampled jointly with appearance from archetype means...
    var rp = r.fork("persona");
    var persona = {};
    ["warm", "playful", "eerie", "clingy", "lucid", "glitchy"].forEach(function (k) {
      persona[k] = Math.round(rp.bell(A.persona[k], 0.14) * 100) / 100;
    });
    // ...then a flagged share get the gap-moe offset: sweet face, lucid
    // wrongness. The offset is *in the genome* so it's reviewable, and so the
    // renderer never has to know.
    if (rp.chance(0.22)) {
      persona.eerie = Math.min(1, persona.eerie + rp.range(0.25, 0.45));
      persona.lucid = Math.min(1, persona.lucid + rp.range(0, 0.2));
      extras.gapMoe = true;
    }

    // ── dials ── the beguilement knobs, derived from persona + seed. These
    // are the ONLY places uncanny behaviour is sanctioned.
    var rd = r.fork("dials");
    var dials = {
      gazeHold: Math.min(0.95, 0.35 + persona.clingy * 0.35 + persona.eerie * 0.25 + rd.range(-0.05, 0.1)),
      blinkRate: 0.6 + (1 - persona.eerie) * 0.5 + rd.range(-0.15, 0.15),       // eerie girls blink less
      fidgetRate: 0.3 + persona.playful * 0.6,
      latency: 0.25 + persona.eerie * 0.6 + persona.lucid * 0.25 + rd.range(0, 0.2), // emotional hang time, seconds
      deadEyeChance: persona.eerie * 0.5 + persona.glitchy * 0.3,
      memoryChance: 0.25 + persona.clingy * 0.45 + persona.lucid * 0.15,
      desireChance: 0.10 + persona.clingy * 0.25 + persona.eerie * 0.20,
      glitchChance: persona.glitchy * 0.35,
    };

    // ── voice ── Web Speech params; pitch high-ish, style sets rate
    var rv = r.fork("voice");
    var voice = {
      pitch: rv.range(1.25, 1.95) + (archKey === "menhera" ? -0.15 : 0),
      rate: rv.range(0.9, 1.1) + (archKey === "gyaru" ? 0.12 : 0) + (archKey === "shrine" ? -0.1 : 0),
      volume: 0.9,
    };

    var rn = r.fork("name");
    var name = capitalize(rn.pick(NAME_HEAD) + rn.pick(NAME_TAIL));

    return {
      v: 1,
      seed: n,
      name: name,
      archetype: archKey,
      style: A.style,
      soma: soma,
      chroma: chroma,
      hair: hairG,
      outfit: outfit,
      extras: extras,
      persona: persona,
      dials: dials,
      voice: voice,
    };
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  I.genome = {
    generate: generate,
    ARCHETYPES: ARCHETYPES, BANGS: BANGS, BACKS: BACKS, AHOGES: AHOGES,
    ACCESSORIES: ACCESSORIES, OUTFITS: OUTFITS,
    oklchToRgb: oklchToRgb, css: css, hueDist: hueDist,
  };
})();
