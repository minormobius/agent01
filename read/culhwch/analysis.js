/* Story graph — Culhwch ac Olwen mapped onto Vladimir Propp's "Morphology
   of the Folktale" (1928): the 31 narrative functions of the wonder-tale.
   This is an interpretive mapping, not a canonical one — Propp built his
   scheme on Russian fairy tales, and fitting a medieval Welsh tale to it is
   a reading, not a measurement. `passage` points at the tale's movements
   (1-12) so each function links to the text that realizes it.
   Loaded after tale.js; attaches to window.CULHWCH. */
window.CULHWCH = window.CULHWCH || {};
window.CULHWCH.propp = {
  intro: "Vladimir Propp found that Russian wonder-tales, however different on the surface, drew their events from one fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Violation, Lack, Departure, the Donor, Struggle, Victory, Return, Wedding. Culhwch ac Olwen turns out to be an almost textbook specimen of the <em>quest</em> branch: a Lack created by a curse, a hero dispatched, magical helpers acquired, an impossible Task, a Struggle, and the Lack liquidated in marriage. Below, the tale's twelve movements are laid against Propp's spine. It is an interpretation — and what the tale <em>skips</em> is as telling as what it keeps.",
  acts: [
    { id: "prep",     label: "Preparation",          color: "#7fb37f" },
    { id: "comp",     label: "Complication",         color: "#c9a24a" },
    { id: "donor",    label: "Donor & helpers",      color: "#c97f9a" },
    { id: "task",     label: "Transference & task",  color: "#6fa8c9" },
    { id: "struggle", label: "Struggle & solution",  color: "#cf6a6a" },
    { id: "resolve",  label: "Resolution",           color: "#9a8fd0" },
  ],
  moves: [
    { act: "prep", sym: "α", node: "Setting", name: "Initial situation", gloss: "The family and the hero are introduced.",
      realized: "Cilydd weds Goleuddydd; their son Culhwch is born in a pig-run, and is cousin to Arthur.", passage: 1 },
    { act: "prep", sym: "β", node: "Death", name: "Absentation", gloss: "A member of the family is lost or absents themselves.",
      realized: "Culhwch's mother, Goleuddydd, sickens and dies.", passage: 1 },
    { act: "prep", sym: "γ", node: "Interdiction", name: "Interdiction", gloss: "A command or prohibition is laid down.",
      realized: "The dying queen binds her husband not to remarry until a two-headed briar grows on her grave.", passage: 1 },
    { act: "prep", sym: "δ", node: "Violation", name: "Violation", gloss: "The interdiction is broken.",
      realized: "Through the tutor's neglect the briar grows; the king remarries, seizing King Doged's widow.", passage: 1 },
    { act: "comp", sym: "a", node: "The curse", name: "Lack", gloss: "The hero lacks or comes to desire something.",
      realized: "The stepmother lays a destiny (tynged) on Culhwch — he shall wed none but Olwen, the giant Ysbaddaden's daughter; love fills him at her mere name.", passage: 1 },
    { act: "comp", sym: "B", node: "Dispatch", name: "Mediation", gloss: "The lack is made known; the hero is sent forth.",
      realized: "His father counsels him to seek the boon from his powerful cousin, Arthur.", passage: 1 },
    { act: "comp", sym: "↑", node: "Departure", name: "Departure", gloss: "The hero leaves home.",
      realized: "Culhwch rides in splendour to Arthur's gate — the porter Glewlwyd, the three-shout threat, and his entry to the hall.", passage: 2 },
    { act: "comp", sym: "C", node: "Boon", name: "Beginning counteraction", gloss: "The hero agrees to act against the lack.",
      realized: "Arthur trims his hair, owns the kinship, grants the boon; after a fruitless year, Cei vows to see the quest through.", passage: 3 },
    { act: "donor", sym: "F", node: "Helpers", name: "Receipt of a magical agent", gloss: "The hero gains helpers or magical agents.",
      realized: "Six extraordinary companions are assigned — Cei, Bedwyr, Cynddylig the Guide, Gwrhyr who knows all tongues, Gwalchmai, and Menw the shapeshifter.", passage: 3 },
    { act: "task", sym: "G", node: "Journey", name: "Guidance", gloss: "The hero is led toward the object of search.",
      realized: "The dreamlike road to the unreachable fort, the fire-breathing herdsman Custennin, and the kin who shelter them.", passage: 4 },
    { act: "task", sym: "✶", node: "Olwen", name: "The goal beheld", gloss: "(A connective beat, between Propp's G and M.)",
      realized: "Olwen appears in glory and names the trap: her father dies when she weds, so Culhwch must promise the giant whatever he demands.", passage: 6 },
    { act: "task", sym: "M", node: "The tasks", name: "Difficult task", gloss: "A difficult task is set for the hero.",
      realized: "After the three poisoned-spear exchanges in his hall, Ysbaddaden imposes the ~40 anoethau — the impossible tasks — on pain of death.", passage: 8 },
    { act: "struggle", sym: "F", node: "Mabon", name: "Further helpers won", gloss: "More agents are acquired to meet the task.",
      realized: "The council of the world's oldest animals leads to freeing Mabon son of Modron — the one huntsman who can handle the hound Drudwyn.", passage: 9 },
    { act: "struggle", sym: "H", node: "The hunt", name: "Struggle", gloss: "Hero and antagonist meet in direct combat.",
      realized: "The hunt for the boar Twrch Trwyth across Ireland, Wales and Cornwall; and Arthur's battle with the Black Witch in her cave.", passage: 10 },
    { act: "struggle", sym: "J", node: "Victory", name: "Victory", gloss: "The antagonist is defeated.",
      realized: "Comb, shears and razor are wrested from the boar, who is driven into the sea; Arthur cleaves the Black Witch with Carnwennan.", passage: 11 },
    { act: "struggle", sym: "N", node: "Solved", name: "Task resolved", gloss: "The set task is accomplished.",
      realized: "Every anoetha is won; the treasures are carried back to shave the giant.", passage: 11 },
    { act: "resolve", sym: "K", node: "Olwen won", name: "Liquidation of lack", gloss: "The initial lack is made good.",
      realized: "Ysbaddaden is shaved and yields Olwen — crediting Arthur, not himself.", passage: 12 },
    { act: "resolve", sym: "U", node: "Ysbaddaden slain", name: "Punishment", gloss: "The villain is punished.",
      realized: "Goreu son of Custennin — the hidden son — beheads the giant, avenging his twenty-three brothers, and takes his lands.", passage: 12 },
    { act: "resolve", sym: "W", node: "Wedding", name: "Wedding", gloss: "The hero marries; the tale closes.",
      realized: "Culhwch wins Olwen, his wife as long as he lives; Arthur's hosts disperse.", passage: 12 },
  ],
  absent: {
    note: "What a tale leaves out places it within Propp's scheme. Culhwch keeps the whole <em>quest</em> arc but skips two entire clusters:",
    groups: [
      { label: "The deception cycle", syms: "ε ζ η θ", text: "Reconnaissance, Delivery, Trickery, Complicity — there is no scheming villain who spies out and dupes the hero. Ysbaddaden is an obstacle, not a deceiver." },
      { label: "The false-hero cycle", syms: "Pr Rs O L Q Ex", text: "Pursuit, Rescue, Unrecognised arrival, Unfounded claims, Recognition, Exposure — nobody steals the hero's victory; there is no impostor to unmask, no recognition-token. The win is direct." },
    ],
    verdict: "Strip those away and what remains is the pure <strong>task-and-helpers quest</strong> (ATU 513 crossed with the giant's-daughter / suitor-tasks type) — which is exactly how folklorists classify it. The structure confirms the call-number.",
  },
};
