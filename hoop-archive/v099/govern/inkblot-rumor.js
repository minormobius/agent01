// govern/inkblot-rumor.js — the GOVERN fixture's rumor builder. Pure, no DOM, node-testable.
//
// The government room's principal fixture is THE SEAL-STAND: the player flips through seeded Rorschach
// blots (wars/ink, vendored under govern/ink/) until one reads true, optionally adds a line of their own
// "colour" (a free-text gloss), and stamps it. What gets published is the blot's ARCHETYPE PROFILE (its
// four perceptual poles + objective traits, from wars/ink's judge) plus the player's added colour — a
// rumor (com.minomobi.hoop.story.rumor, kind:'inkblot') the engine reads as a civic/temperament signal.
//
// The blot GENERATION + render is the browser's job (govern/inkblot.js, needs canvas); THIS module is the
// pure payload builder so the record shape is node-tested independent of the DOM.

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// Build the kind:'inkblot' rumor from a selected blot. `sel` = { seed, portrait, traits?, color? } where
// portrait is wars/ink INKJUDGE.portrait(scores) and traits is the INKENGINE trait vector.
export function inkblotRumor(world, sel = {}) {
  const p = sel.portrait || {};
  const colour = String(sel.color == null ? '' : sel.color).slice(0, 280).trim();
  const profile = {
    system: 'inkblot', seed: String(sel.seed),
    title: p.title || null, blurb: p.blurb || null,
    axes: Array.isArray(p.axes) ? p.axes.map((a) => ({ key: a.key, pole: a.pole, value: r2(a.value) })) : [],
    traits: Array.isArray(sel.traits) ? sel.traits.map((t) => ({ key: t.key, value: r2(t.value) })) : undefined,
    colour: colour || undefined,
  };
  const text = (`A seal is read: ${p.title || 'an unnamed figure'}.` + (colour ? ` “${colour}”` : '')).slice(0, 600);
  const rumor = { world, kind: 'inkblot', seed: String(sel.seed), text, profileJson: JSON.stringify(profile) };
  if (colour) rumor.color = colour;
  return rumor;
}
