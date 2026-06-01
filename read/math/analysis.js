/* Story graph — Math uab Mathonwy on Propp's 31 functions.
   IN PROGRESS. Acts (one per movement) fixed; function mapping filled in as
   the translation lands. Attaches to window.MATH. */
window.MATH = window.MATH || {};
window.MATH.propp = {
  intro: "Propp's <strong>31 functions</strong> laid against the Fourth Branch. <em>Math</em> is a tale built almost entirely from <strong>Villainy</strong> and <strong>Trickery</strong>: a war begun by fraud, an outrage, a chain of curses each undone by a deception, a wife conjured and a husband betrayed. Its magical agent is a single object — the <strong>wand</strong> (<em>hudlath</em>) — and its donor, deceiver and punisher are often the same man, Gwydion. The comparative payoff against the sister tales is read in the <a href=\"/mabinogi/\">Mabinogi</a> and <a href=\"/pendragon/\">Pendragon</a> crosswalks.",
  acts: [
    { id: "swine",   label: "The swine-war; Pryderi's death",  color: "#c9a24a" },
    { id: "outrage", label: "The outrage; the beast-punishment", color: "#6f9ac9" },
    { id: "births",  label: "The foot-holder test; the births", color: "#8aa363" },
    { id: "curses",  label: "Aranrhod's three curses",          color: "#b07a4b" },
    { id: "flowers", label: "Blodeuwedd; the betrayal",         color: "#9a6f9a" },
    { id: "eagle",   label: "The eagle; the finding; the reckoning", color: "#c97f9a" },
  ],
  moves: [],
  absent: { note: "", groups: [], verdict: "" },
};
