/* Story graph — Branwen ferch Llŷr mapped onto Vladimir Propp's "Morphology
   of the Folktale" (1928): the 31 narrative functions of the wonder-tale.

   SKELETON IN PROGRESS. The frame and the opening functions are seeded so the
   spine, the cards, and the mythograph render from Movement I; the full
   morphology is laid in as the translation reaches each movement. The
   distinctive thing about Branwen, against the rest of the corpus, is that it
   is a TRAGEDY: the wonder-tale spine that Pwyll, Owain, Culhwch and the
   English romances complete (Lack → … → Liquidation → Wedding) here runs
   backwards into ruin — the donor's gift becomes the enemy's weapon, the
   rescue empties two kingdoms, and there is no restoration. The `absent`
   section reads that inversion. Loaded after tale.js; attaches to
   window.BRANWEN. */
window.BRANWEN = window.BRANWEN || {};
window.BRANWEN.propp = {
  intro: "Propp argued that wonder-tales drew their events from a fixed sequence of <strong>31 functions</strong> — Absentation, Interdiction, Villainy, the Donor, Struggle, Victory, Liquidation, Return, Recognition, Wedding. <em>Branwen</em> is the corpus's great counter-example: it has the parts but runs them toward catastrophe. A marriage made to bind two islands; a villainy (Efnisien's outrage) that is patched, not punished; a magical agent (the Cauldron of Rebirth) given as <em>amends</em> that returns as the enemy's weapon; a rescue-expedition that wins the field and empties both kingdoms; and, at the end, no wedding and no restoration — only seven survivors, a buried head, and a woman dead of grief. Below, the movements are laid against the spine as they are translated; the comparative payoff is read against Pwyll, Culhwch, Owain, Orfeo and Gawain in the <a href=\"/pendragon/\">Pendragon crosswalk</a>.",
  acts: [
    { id: "marriage", label: "The marriage at Aberffraw",        color: "#c9a24a" },
    { id: "outrage",  label: "Efnisien's outrage; the cauldron", color: "#6f9ac9" },
    { id: "ireland",  label: "Branwen in Ireland; the message",  color: "#c97f9a" },
    { id: "crossing", label: "Brân's crossing; the house",       color: "#b07a4b" },
    { id: "ruin",     label: "The feast, the fire, the battle",  color: "#9a6f9a" },
    { id: "head",     label: "The seven; the wondrous head",     color: "#7fb37f" },
  ],
  moves: [
    // ── Act 1: marriage ──────────────────────────────────────────
    { act: "marriage", sym: "α", node: "Initial situation", name: "Initial situation", gloss: "The family is introduced.",
      realized: "The House of Llŷr on the rock of Harlech: the giant king Bendigeidfran, his brother Manawydan, and the half-brothers Nisien the peace-maker and Efnisien the strife-maker. The tale names its moral poles before anything happens — peace and ruin already seated side by side.", passage: 1 },
    { act: "marriage", sym: "W°(pre)", node: "The binding marriage", name: "Marriage as alliance", gloss: "A wedding opens the tale rather than closing it.",
      realized: "Matholwch of Ireland sails with thirteen ships to ask for Branwen; the counsel grants her, to bind the Island of the Mighty to Ireland. The feast at Aberffraw, in tents because no house can hold Brân, and Branwen becomes Matholwch's wife. Branwen inverts the wonder-tale: it puts the wedding at the START, as the thing that will be undone, not the reward that crowns the end.", passage: 1 },
    // The outrage and the cauldron, Branwen's punishment and the starling, the
    // crossing and the house, the fire and the battle, and the wondrous head
    // are seeded as the translation reaches each movement.
  ],
  absent: {
    note: "<em>Provisional — to be finalised once the full text is rendered.</em> On the evidence of the opening and the known shape of the branch, Branwen's distinctive Propp profile is the inversion of the wonder-tale, in three features:",
    groups: [
      { label: "The wedding at the wrong end", syms: "W", text: "Where Pwyll, Culhwch, Owain and Orfeo <em>close</em> on a wedding or restoration, Branwen <em>opens</em> on one — and spends the rest of the tale destroying it. The marriage is not the reward but the fuse." },
      { label: "The donor's gift as the enemy's weapon", syms: "F→A", text: "Propp's magical agent (F) is normally what wins the hero his victory. The Cauldron of Rebirth is given by Brân as <em>amends</em>, and in Ireland it is turned against his own men, reviving the Irish dead each night. The gift becomes the villainy it was meant to settle." },
      { label: "Liquidation that empties the world", syms: "K↓", text: "The rescue succeeds and ruins everything: the field is won, but Ireland is left with five pregnant women and Britain with seven men. There is no K (liquidation of lack) that restores an order — only a victory indistinguishable from catastrophe." },
    ],
    verdict: "<em>Verdict pending the full translation.</em> The working thesis: Branwen is the corpus's structural negative. It is built from the same wonder-tale parts as its sister-branch Pwyll, but assembled to run the engine backwards — alliance into war, gift into weapon, rescue into desolation, marriage into a grave on the Alaw. Set against the restorative closes of the other five tales, it measures exactly how much the Welsh imagination could also refuse the happy ending.",
  },
};
