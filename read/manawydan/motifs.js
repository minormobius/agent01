/* The motif index — Manawydan uab Llyr classified against the folklorists'
   "Dewey decimal": the Thompson Motif-Index (letter-classed call-numbers) and
   the Aarne-Thompson-Uther (ATU) tale-type index.

   IN PROGRESS. Tale-types, class headers and class order are fixed; the motif
   list is filled out as the translation lands. Confidence flag per motif:
     high = well-attested code & application   med = code right, application interpretive
     spec = the number itself is a guess.
   Attaches to window.MANAWYDAN. */
window.MANAWYDAN = window.MANAWYDAN || {};
window.MANAWYDAN.motifs = {
  intro: "Folklorists file every recurring story-atom under a letter-class and number: B animals, C taboo, D magic, F marvels, K deceptions, N fate, Q rewards &amp; punishments, Z formulas. <em>Manawydan</em> is a native Welsh branch, not an ATU wonder-tale, but it is the most motif-dense of the Branches for the folklorist: the <strong>enchanted wasteland</strong> and its lifting, the <strong>vanishing otherworld fort</strong> with its fatal golden bowl, the <strong>magician's shape-shift</strong> of a war-band into a host of mice, and the <strong>life-bargain over a captured wife</strong>. Below, the motif index for the whole branch, keyed to the movements that realise each, with cross-references into the sister tales — especially <em>Pwyll</em>, whose old quarrel (the badger-in-the-bag) is the hidden cause of everything here.",
  taletypes: [
    { code: "The Four Branches", name: "Native Welsh cycle (no clean ATU type)", conf: "high",
      gloss: "Manawydan is the Third of the Four Branches of the Mabinogi, opening on the seven survivors of Branwen (the Second) and closing the revenge-arc begun in Pwyll (the First): Llwyd lays the wasteland to avenge Gwawl son of Clud, whom Pwyll tricked in the badger-in-the-bag game. It is not an ATU wonder-tale but a native cycle; its motifs are Insular and old." },
  ],
  classes: {
    B: "Animals",
    C: "Tabu",
    D: "Magic",
    F: "Marvels",
    K: "Deceptions",
    N: "Chance and fate",
    Q: "Rewards and punishments",
    Z: "Miscellaneous (formulas)",
  },
  classOrder: ["B", "C", "D", "F", "K", "N", "Q", "Z"],
  list: [],
};
