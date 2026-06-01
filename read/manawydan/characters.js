/* The cast of Manawydan uab Llyr — the third stratum of the annotation layer.
   Each entry carries its role, the movements it appears in (links into the
   reading), and typed relationships (which seed the character web).

   IN PROGRESS. Roles are fixed; the cast is filled out as the translation
   lands movement by movement. Attaches to window.MANAWYDAN. */
window.MANAWYDAN = window.MANAWYDAN || {};
window.MANAWYDAN.characters = {
  intro: "<em>Manawydan</em> is the most intimate of the Four Branches: a tale of <strong>four people</strong>. At its centre is <strong>Manawydan son of Llŷr</strong> — brother of the dead giant-king Brân, rightful but un-aspiring king of Britain, and the corpus's great patient craftsman-strategist. With him are <strong>Rhiannon</strong>, the otherworldly queen of the First Branch, now his wife; her son <strong>Pryderi</strong>, lord of Dyfed, who gives him the land and the marriage; and Pryderi's wife <strong>Cigfa</strong>. Against the four stands a single hidden antagonist — <strong>Llwyd son of Cil Coed</strong>, the magician who lays the wasteland to avenge <strong>Gwawl son of Clud</strong>, humiliated two generations back in <em>Pwyll</em>. The cast below is built out as the branch is translated.",
  roles: [
    { id: "principal", label: "The four",                       color: "#c9a24a" },
    { id: "dyfed",     label: "The house of Dyfed & Britain",   color: "#6f9ac9" },
    { id: "enchanter", label: "The enchanter & his quarrel",    color: "#9a6f9a" },
    { id: "craft",     label: "England: craftsmen & clergy",    color: "#b07a4b" },
  ],
  cast: [],
};
