// Round 2 prep — character dossiers for the 4 finalists.
// v1: pre-outline pass. Will be revisited after storyboards are logged.

export const CASTS = {
  'kolmogorov': {
    note: `Theo is dead but recurs in machine outputs — he is the load-bearing second character because the PI and the reviewer are plot machinery.`,
    mains: [
      {
        name: 'Iris Vance',
        identity: '34, compression researcher at the Allen Institute, lives in a one-bedroom in Wallingford with a mattress on the floor and a $9,000 keyboard.',
        possession: `A 2009 Sony Cyber-shot still loaded with the SD card from Theo's last birthday; she has never moved the photos off it.`,
        habit: `Re-derives the proof of Kolmogorov's invariance theorem on receipts while waiting for coffee; throws the receipts away.`,
        contradiction: `Publishes everything open-source but encrypts her own sent-mail folder with a key she has not written down.`,
        surfaceWant: 'Ship the 14-line compressor before DARPA arrives at 9 a.m.',
        hiddenWant: 'A version of the kitchen argument in which she said the sentence she actually meant.',
      },
      {
        name: 'Theo Vance',
        identity: 'Would be 31. Dead nine years (fentanyl, alone, Spokane motel). Present only as decompressor output that knows things only he knew.',
        possession: 'A chipped Pyrex measuring cup he used as an ashtray; Iris recognizes it on page three of the novella the machine returns.',
        habit: `Ends declarative sentences with "right?" — a tic she had forgotten until she read it back.`,
        contradiction: `The decompressed Theo apologizes for the 2009 argument in language the living Theo never used; Iris cannot tell if the substrate is lying or if he had rehearsed it.`,
        surfaceWant: '(in outputs) To make the apology stick.',
        hiddenWant: '(in outputs, or in her) To be remembered as the brother he was on the worst day, not the average one.',
      },
    ],
    relationship: `She is the compression ratio; he is the payload. He gives her sentences she can verify against memory and sentences she cannot, and she cannot stop checking. He costs her the grief she had finally flattened into a manageable shape — the machine keeps re-inflating him with new fidelity, including the parts she had edited out to survive. What is unfinished: she left the kitchen in 2009 without answering his question, drove to SeaTac, flew to a conference in Vienna; he was dead before she landed. The substrate has the answer she would have given. She has six hours to decide whether she wants to read it.`,
    supporting: [
      { name: 'Dr. Hannelore Fisk', sketch: '58, her PI, scheduled the DARPA demo without telling her, keeps a Newton\'s cradle on a desk that has never been still.' },
      { name: 'Marisol Acuña', sketch: 'Clarkesworld first reader whose unredacted childhood came out of the grocery-list seed; has emailed Iris twice and Iris has not opened either.' },
    ],
  },
  'compliance-window': {
    note: `Derek and Janet over four days. The mother/aunt are consumed in the action; Grandma gets one line.`,
    mains: [
      {
        name: 'Derek Pell',
        identity: '34, claims adjuster for a regional auto insurer, lives in a one-bedroom in Parma, Ohio.',
        possession: `A Casio F-91W he's worn since seventh grade; the strap has been replaced four times, the watch never.`,
        habit: 'Reads the ingredients on cereal boxes while eating the cereal, even brands he buys weekly.',
        contradiction: `Processes other people's totaled cars with brisk efficiency but has kept a glovebox full of expired registrations going back to 2014.`,
        surfaceWant: 'To keep his life intact, or at least the parts he can name.',
        hiddenWant: 'To be told, by a stranger with authority, which parts were the ones that counted.',
      },
      {
        name: 'Janet Hruby',
        identity: '47, Senior Compression Representative, Tier II, nineteen years on the job, drives in from a satellite office she will not name.',
        possession: 'A mechanical pencil with a chewed eraser and her employee number etched into the barrel with a paperclip.',
        habit: 'Hums two bars of the same unidentifiable song before each removal; stops mid-bar when she notices.',
        contradiction: `Believes deeply in the work; keeps a file at home of every protest she's ever noted and removed.`,
        surfaceWant: `To close Derek's file by 4 p.m. Friday and submit clean paperwork.`,
        hiddenWant: 'For one client, just once, to ask her what she was before Tier II.',
      },
    ],
    relationship: `Over four days, Derek stops treating Janet as the disaster and starts treating her as the only other person in the room, which she is. The form has a box for Subject Cooperation and no box for the small kindnesses: he offers her coffee Tuesday, remembers she takes it black by Thursday, asks Friday morning what the song is. Janet needs a witness — someone to register that compression is a craft, not a deletion. Derek gives her the unintended gift of curiosity. She gives him, off the form, the manila envelope back. He doesn't open it.`,
    supporting: [
      { name: 'Grandma', sketch: 'Formerly Linda of Toledo and Ruth of Akron, consolidated Wednesday morning. Gets one line of dialogue from the kitchen doorway before Janet folds her into a noun: "Derek, your father called." Neither Derek nor Janet knows which mother said it.' },
    ],
  },
  'eight-fourteen': {
    note: `Tomás must be a real character despite being absent. Two supporting figures supply external pressure (Mariana) and ambient memory of place (Rui).`,
    mains: [
      {
        name: 'Ines Saraiva',
        identity: '47, runs Prensa Lavandaria out of a former laundromat on Rua do Poço dos Negros, Lisbon. Still uses the original folding tables for binding.',
        possession: 'A Pilot Hi-Tec-C 0.3 in red, the only pen she edits in; she buys them in twelves from a stationer in Chiado who orders them from Osaka.',
        habit: 'Reads her own prose aloud at quarter-volume, lips moving, never voicing.',
        contradiction: `Prints other people's grief for a living and refuses to let anyone print hers.`,
        surfaceWant: 'To finish seed seventeen on schedule, before the December rains warp the paper stock.',
        hiddenWant: 'Permission to stop. The notebook was a workload she accepted as a sentence; she is waiting for someone, including herself, to commute it.',
      },
      {
        name: 'Tomás Saraiva',
        identity: `Dead at 31 in 2011. Was a structural engineer who took the train from Lisbon to Évora on weekends to teach a free workshop on truss geometry to teenagers who didn't ask for it.`,
        possession: 'A Casio fx-991ES, scratched on the back where he etched I.S. with a compass point when they were kids; Ines keeps it in the drawer with the invoices.',
        habit: 'Corrected waiters\' arithmetic, quietly, on the receipt, then overtipped to apologize.',
        contradiction: 'Built things to last and refused to be photographed.',
        surfaceWant: '(retroactively) For Ines to make something out of the seeds, anything; he wasn\'t precious about it.',
        hiddenWant: 'To be remembered as a person, not a project. The notebook was, in part, a way of making her keep talking to him; he knew that and gave it to her anyway.',
      },
    ],
    relationship: `Older brother, younger sister, four years apart, raised in Setúbal by a mother who treated competence as affection. Tomás taught Ines to set type at fourteen on a press he rebuilt from scrap. The promise she made — at the hospital, to herself, not to him — was no resurrections: she would not write him into anything, would not put words in his mouth, would not let the dead do the work of the living. What he left her, beyond the notebook: the press itself, paid off; a habit of measuring twice; and the unbearable fact that he never met the woman she became without him.`,
    supporting: [
      { name: 'Mariana Reis', sketch: '34, a subscriber in Porto who has written Ines a letter every December asking when seed seventeen ships — the external clock that makes the deadline real.' },
      { name: 'Rui', sketch: 'The upstairs neighbor whose washing machine Ines can hear through the ceiling, a daily reminder of what the building used to be.' },
    ],
  },
  'tally-stick': {
    note: `Joseph renamed Josias Pyatt (a real Joseph Hume sat in Parliament in 1834, too confusable). Whibley is the real Clerk of the Works on duty when Parliament burned — grounds the catastrophe in record.`,
    mains: [
      {
        name: 'Josias Pyatt',
        identity: '58, Deputy Teller of the Receipt, late of the Exchequer at Westminster.',
        possession: 'A horn-handled penknife worn concave on one side from sixty years of recutting notches he was no longer supposed to cut.',
        habit: `Reads everything aloud under his breath, including dinner menus and his wife's shopping lists; the Exchequer broke him to the practice in 1791.`,
        contradiction: `Keeps the King's accounts to the farthing but cannot remember what he paid for his own boots.`,
        surfaceWant: 'To discharge the order, go home, eat the mutton his sister-in-law promised.',
        hiddenWant: 'To be told, by someone with authority, that the sticks meant something — that he did, by extension.',
      },
      {
        name: 'Richard Whibley',
        identity: '41, Clerk of the Works, Houses of Parliament, lodgings at Old Palace Yard.',
        possession: 'A brass-cased pocket-watch that runs four minutes fast, set that way deliberately so he is never late to anything that matters to anyone above him.',
        habit: 'Counts stairs. Aloud, when alone; under his breath, when not.',
        contradiction: 'A reformer in his pamphlets, a foreman in his corridors — believes the old wood must go but flinches when the stove door opens.',
        surfaceWant: `The cellar cleared by nightfall, no smoke complaints from the Lords' housekeeper Mrs. Wright.`,
        hiddenWant: 'To be the man who modernised the place — and to not be the man who burned it down. He cannot have both and does not yet know it.',
      },
    ],
    relationship: `Whibley is younger, better-paid, and Pyatt's nominal superior in this matter only. Pyatt has known him since Whibley was a boy crossing the yard with his father's lunch pail. Each owes the other a courtesy neither will name: Whibley owes Pyatt the dignity of slowness; Pyatt owes Whibley the obedience of a man whose office is being abolished beneath him. What burns at dusk is the fiction that the order came from anywhere a person could be held to.`,
    supporting: [
      { name: 'Mrs. Wright', sketch: `Lords' housekeeper. The first to smell the flue. One line of dialogue, the hinge of the disaster.` },
    ],
  },
};
