/* Vita Merlini — Layer 4 (Propp story graph), plus the Desire (Greimas) and
   Theme (Parry–Lord type-scene) lenses. Skeleton only for now: written after
   the translation has laid down the movements it maps onto.
   Attaches to window.VITAMERLINI.propp / .desire / .themes.
     propp:  { intro, acts:[{id,label,color}], moves:[{sym,name,act,passage,gloss,realized}], absent:{note,groups,verdict} }
     desire: { intro, prose, object, subject, sender, receiver, helpers:[], opponent, unreachable, *Ref ... }
     themes: [{ id, label, passage, note }] */
window.VITAMERLINI = window.VITAMERLINI || {};
window.VITAMERLINI.propp = {
  intro: "The Propp story graph for the <em>Vita Merlini</em> is in preparation. It is written once the translation has fixed the movements each narrative function maps onto.",
  acts: [],
  moves: [],
  absent: { note: "", groups: [], verdict: "" },
};
// .desire and .themes are added once the translation is complete enough to
// anchor the actantial model and the type-scenes to their passages.
