/* Story graph — Manawydan uab Llyr mapped onto Vladimir Propp's "Morphology
   of the Folktale" (1928): the 31 narrative functions of the wonder-tale.

   IN PROGRESS. The acts (one per movement) are fixed; the function-by-function
   mapping is filled in as the translation lands. Unlike its sister-branch
   Branwen (a tragedy that runs the spine backward), Manawydan is a near-textbook
   Lack → Liquidation wonder-tale: an enchantment empties the land, and a hero
   lifts it — but the "struggle" is a bargain, not a battle. Loaded after
   tale.js; attaches to window.MANAWYDAN. */
window.MANAWYDAN = window.MANAWYDAN || {};
window.MANAWYDAN.propp = {
  intro: "Propp argued that wonder-tales draw their events from a fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Villainy/Lack, the Donor, Struggle, Victory, Liquidation, Return, Recognition, Wedding. <em>Manawydan</em> fits the spine more cleanly than any other tale on this site, with one striking substitution: the <strong>Struggle</strong> against the villain is not a fight but a <strong>negotiation</strong> — a man with a mouse on a gallows, refusing every offer until he has bargained back two kidnapped people, a disenchanted kingdom, and a promise of no revenge. Below, the movements are laid against the spine as they are translated; the comparative payoff against Pwyll, Branwen, Culhwch, Owain, Orfeo and Gawain is read in the <a href=\"/pendragon/\">Pendragon crosswalk</a>.",
  acts: [
    { id: "gift",     label: "The burial; Dyfed and Rhiannon",  color: "#c9a24a" },
    { id: "waste",    label: "The mist; the wasteland",         color: "#6f9ac9" },
    { id: "england",  label: "England: the three crafts",       color: "#b07a4b" },
    { id: "caer",     label: "The boar; the caer; the taken",   color: "#9a6f9a" },
    { id: "crofts",   label: "England again; the three crofts", color: "#8aa363" },
    { id: "bargain",  label: "The mouse; the bargain; the lifting", color: "#c97f9a" },
  ],
  moves: [],
  absent: { note: "", groups: [], verdict: "" },
};
