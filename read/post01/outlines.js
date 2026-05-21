// Round 2 — beat-level outlines for each finalist.
// Each outline records POV, word target, beats (with interior shift), stakes,
// ending image, and a self-honest risk note.

export const OUTLINES = {
  'kolmogorov': {
    pov: `Close-third Iris, present tense. Lab time stamped in Pacific; flashback in past tense, low fidelity until Beat 4.`,
    wordTarget: '3,000',
    beats: [
      {
        num: 1, title: '14 Lines', words: 450,
        what: `9:07 PM. Iris feeds the Bluesky post ("the river is the same river twice if you don't look") into the compressor. 4,200 words spool out: Theo's voice, the Pyrex ashtray, "right?". The kitchen argument appears as a single sentence she skims past.`,
        shift: `Pride collapses into recognition — she did not write this. The compressor did not write this. Something gave it back. Flashback fidelity: glancing. One word: Vienna.`,
      },
      {
        num: 2, title: 'Acceptance', words: 400,
        what: `11:40 PM. Clarkesworld auto-reply. Iris re-reads the novella; finds a detail she did not see the first time — Theo's birthday cake, half-eaten, on the Cyber-shot's last frame. She has never opened that photo on any networked machine.`,
        shift: `The want pivots. Shipping DARPA matters less than feeding the machine again. She queues a grocery list.`,
      },
      {
        num: 3, title: 'Marisol', words: 450,
        what: `1:12 AM. Output: a stranger's childhood — bunk bed, Tucson, a stepfather's belt. Byline at the bottom: Marisol Acuña. Iris opens the two unread emails. Marisol asks, plainly, where Iris got the bunk-bed scene. Iris had not read the novella's middle.`,
        shift: `The theory crystallizes — not generation, decompression. Every short string is already a pointer. Guilt arrives before ethics. Hidden want surfaces: if the substrate holds Marisol's childhood, it holds the kitchen.`,
      },
      {
        num: 4, title: 'The Kitchen, Full Fidelity', words: 650,
        what: `2:04 AM. Iris seeds the compressor with the date — 11/14/09 — and a single word: right. Output is the argument verbatim, plus the version where she stayed. Decompressed-Theo apologizes in sentences living-Theo never had. Pyrex cup. The question she did not answer, answered.`,
        shift: `The load-bearing shift. Grief reorganizes into a problem with a solution. She stops crying mid-paragraph because she is calculating. Fidelity: total.`,
      },
      {
        num: 5, title: 'Hannelore', words: 450,
        what: `2:38 AM. Fisk arrives early to prep slides; Newton's cradle ticking. Iris does not show her the kitchen output. She shows her the Marisol output and says: we cannot demo this. Fisk, calmly, says DARPA is the only audience that should see it.`,
        shift: `The institutional exit closes. She understands she will not be stopped; she will only be scheduled. Decision: she will seed one more string, for herself, before 9 AM.`,
      },
      {
        num: 6, title: 'One Character', words: 600,
        what: `3:00 AM. Iris computes the index — the single Unicode codepoint whose decompression is the remaining story of her own life. She types it. She does not press enter yet. She lifts the Cyber-shot, photographs the screen, sets the camera face-down.`,
        shift: `The want resolves into its true shape — not to know, but to have the option of knowing be the last thing she chose.`,
      },
    ],
    stakes: `If she fails the rubric — write the version where she said what she meant — the substrate keeps the kitchen and she keeps the silence. DARPA gets the compressor either way.`,
    ending: `The cursor blinks beside one character. Her finger rests on Return, and the Newton's cradle two rooms away ticks once, twice, into a room she has already left.`,
    risk: `The Marisol beat has to land as ethics, not plot mechanics — if she reads as merely curious instead of culpable, Beat 4's catharsis becomes self-indulgent and the ending stops costing anything.`,
  },
  'compliance-window': {
    pov: `Close-third on Derek, present tense, free indirect drift into Janet's procedural register as she works — the prose itself begins to compress (sentences shorten, paragraphs thin) as the week proceeds.`,
    wordTarget: '2,800',
    beats: [
      {
        num: 1, title: 'Monday · The Letter', words: 450,
        what: `Derek finds the certified envelope between a tire-rotation coupon and a jury summons. The letter explains his life (71y) has been selected for compression to approximately 4,200 words by Friday. Compliance is voluntary; non-compliance is being phased out. He reads it twice while eating Cheerios, then reads the ingredients on the box. He calls in sick.`,
        shift: `Derek/Janet — none yet; Janet is only a signature. Hook: he sets the Casio's alarm for Tuesday 9 a.m. The watch has outlived four straps. It will outlive this.`,
      },
      {
        num: 2, title: 'Tuesday · Wednesdays', words: 550,
        what: `Janet arrives at 9:02, clipboard, tape measure, mechanical pencil. She hums two bars, stops. She measures the hallway. She explains Wednesdays are the most consolidatable weekday — "low narrative yield." Derek protests; she notes the protest in a column titled NOTED. She removes Wednesdays. Derek tries to remember a specific Wednesday and cannot.`,
        shift: `Derek expects an adversary; gets a professional. Janet expects a signature; gets a man who reads her clipboard upside down and asks what the column headings mean. She tells him. Nobody has asked in nine years.`,
      },
      {
        num: 3, title: 'Wednesday · Grandma in Ohio', words: 600,
        what: `The day is gone but the appointment isn't. Janet consolidates Linda (Toledo) and Ruth (Akron) into "Grandma in Ohio." Derek tries to hold the distinction — Linda's lemon bars, Ruth's screen door — and the distinctions slip the way a name slips when you say it too many times. Mid-consolidation, from the kitchen doorway, a voice: "Derek, your father called." Neither he nor Janet can say which one said it. Janet does not write this down. She lets the line stand.`,
        shift: `First crack. Janet skips a NOTED. Derek sees her skip it.`,
      },
      {
        num: 4, title: 'Thursday · And Then He Was at Work', words: 500,
        what: `Janet replaces Derek's commute with the phrase "and then he was at work." She offers to also compress the glovebox of expired registrations (2014–). Derek says no. She writes NOTED, then crosses it out. She asks if he wants to keep the Casio explicitly named in the final draft. He says yes. She asks why. He doesn't know. She writes that down instead.`,
        shift: `She is no longer closing a file; she is editing a life with him. Neither acknowledges this. He almost asks what she was before Tier II. He doesn't.`,
      },
      {
        num: 5, title: 'Friday · The Paragraph', words: 700,
        what: `3:47 p.m. Janet hands Derek the final draft on a single sheet. He opens his front door and there is no street, only a paragraph, justified, twelve-point. He reads it. It is mostly what he remembered. The Casio is in it. Grandma is in it, singular. He steps in. Janet, on the stoop, hums two bars and does not stop herself this time.`,
        shift: `Mutual recognition without acknowledgement. He has been told which parts counted. She has been the one to tell him.`,
      },
    ],
    stakes: `If the comedy lands but the heart doesn't, the story becomes a clever McSweeney's bit about bureaucracy — disposable. The heart is Derek being told, finally, which parts counted, and Janet being the one person qualified to tell him.`,
    ending: `Janet on the empty stoop, clipboard at her side, finishing the second bar of the song for the first time in nineteen years. The paragraph on the page is still warm from the printer.`,
    risk: `Janet tips into whimsical-bureaucrat shtick and stops being a person with nineteen years of NOTEDs in a home file.`,
  },
  'eight-fourteen': {
    pov: `Close-third on Ines, present tense, single day (a December afternoon in the laundromat). Two layers only: the draft she is writing (italics in final story), and the page she is writing on (margin notes in her red Pilot, strikethroughs visible). No third frame. The reader sees the seam, never the scaffolding behind it.`,
    wordTarget: '2,750',
    beats: [
      {
        num: 1, title: 'Seed Seventeen, 4:11 PM', words: 380,
        what: `Ines opens Tomás's notebook to seed 17: the Bluesky string about the abstract machine. She doesn't know what Bluesky is. She writes the date at the top of a blank page, then a first sentence about a tram on Rua da Conceição. Rui's spin cycle starts upstairs. Mariana's December email sits unopened in the corner of the screen.`,
        shift: `From ritual obedience to private unease — the seed is from a country he never entered.`,
      },
      {
        num: 2, title: `What an Abstract Machine Is, According to Someone Who Doesn't Know`, words: 420,
        what: `Ines drafts a paragraph defining the machine in her own terms — a lathe for sentences, a frame that takes a string and returns a longer one. Margin note in red: he would have known. Strikethrough. Replaced with: he would have built one out of dowels.`,
        shift: `She admits, on paper, that she's been guessing what he'd approve of for sixteen years.`,
      },
      {
        num: 3, title: 'The Tram, First Pass', words: 340,
        what: `The tram paragraph. Empty 28 climbing to Estrela. Wet rails. A woman's coat. No Tomás. Margin note: he hated trams (motion sickness, the calculus of overhead wires). The draft notes its own omission.`,
        shift: `She registers that absence is now a technique she's good at — and that this is the problem.`,
      },
      {
        num: 4, title: 'The Tram, Second Pass · LOAD-BEARING', words: 560,
        what: `She rewrites the paragraph. Tomás is on the 28, Casio in his lap, correcting the conductor's change. He doesn't speak to her. He is thirty-one and stays thirty-one. Her pen hovers over the strikethrough. She does not cross him out. One paragraph. She lets him ride to Estrela and get off.`,
        shift: `The promise breaks cleanly, without drama. She discovers breaking it costs less than keeping it did.`,
      },
      {
        num: 5, title: `Mariana's Email, and What the Machine Was Actually For`, words: 410,
        what: `She opens Mariana's email — same question, seventh year. Begins a reply, deletes it. Returns to the seed. Realizes the abstract machine was never the prompt; it was the permission structure. A frame that lets a short string become longer, or stop. She writes one closing line for seed 17 and means it.`,
        shift: `From expansion as duty to expansion as choice. The yearly contract dissolves.`,
      },
      {
        num: 6, title: 'Closing on Seed Eighteen', words: 240,
        what: `She closes the notebook with seed 18 unread. Caps the red Pilot. Writes Mariana a four-line email: seed 17 ships in January, and it is the last one. Rui's spin cycle ends.`,
        shift: `The decision becomes a date on a calendar. She lets it.`,
      },
    ],
    stakes: `If the form floats free of the grief, the interruptions become a parlor trick — a writer admiring her own seams while a dead brother is used as set dressing. The metafiction has to cost her the promise, or it costs the reader nothing.`,
    ending: `The notebook closed on her desk, seed 18 still folded inside it like a pressed leaf. Outside, the December rain finally starts, and for once she does not move the paper.`,
    risk: `Cleverness eating tenderness — the margin-note device upstaging the tram paragraph it exists to protect.`,
  },
  'tally-stick': {
    pov: `Close-third Pyatt, present-tense, hour-by-hour: 06:30 dawn at the Receipt to ~18:00 in Palace Yard as the sky goes orange. Whibley's brass watch (four minutes fast) is the ticking pressure; Pyatt's voice is the heat.`,
    wordTarget: '3,000',
    beats: [
      {
        num: 1, title: 'An Order in a Clean Hand · 06:30', words: 400,
        what: `Pyatt receives the written order: two cartloads of tally-sticks, hazel, twelfth century onward, into the Lords' under-stove by nightfall. Whibley hovers, watch out, counting stairs. Pyatt opens the first bundle, mutters the notches aloud as he always has — sheriff of Wiltshire, Michaelmas, fourteen pounds six. Translation only. He thinks: discharge the order, go home, eat the mutton.`,
        shift: `A small dread under the duty — these are his hands' record, not just the Crown's.`,
      },
      {
        num: 2, title: 'Hazel and Iron · 09:00', words: 450,
        what: `The under-Lords furnace is small, domestic, lined for coal not wood. Pyatt notes this and says nothing; Whibley notes Pyatt noting and says nothing back. Pyatt feeds sticks in slowly, reading each: a clothier in Norwich, 1623; a widow's dower returned, 1701. The penknife in his pocket, concave from sixty years, feels suddenly like a tool without a job.`,
        shift: `He stops calling it burning. He calls it, under his breath, reading out.`,
      },
      {
        num: 3, title: 'The First Invention · Midday', words: 500,
        what: `A stick with one ambiguous groove — could be twelve shillings, could be a recut. Pyatt, tired, hungry, says aloud: "Twelve shillings, and the boy was named Thomas, and he did not come home from the harvest." Whibley doesn't hear. Pyatt hears himself. The line between translation and invention crosses HERE — a single furnished name, a household conjured from a notch.`,
        shift: `Terror, then a strange permission. If no one else can read these, then meaning is whatever he says it is.`,
      },
      {
        num: 4, title: 'Households from a Groove · 14:00–16:00', words: 550,
        what: `The cart empties faster. Pyatt is improvising whole lives now — a Cheapside chandler's three daughters, a Yorkshire ferryman's debt to his brother. The stove door glows. Whibley, pamphleteer-reformer, watches the medieval rubbish vanish and feels his modern century arriving on schedule. Watch: 16:04, really 16:00. He does not check the flue. Neither does Pyatt — Pyatt is somewhere in 1487, naming a miller.`,
        shift: `Pyatt understands he was never the archivist. He was the last reader. The notches were mute the whole time without him.`,
      },
      {
        num: 5, title: 'Mrs. Wright at the Door · Late afternoon', words: 450,
        what: `The Lords' housekeeper, on her rounds, stops in the corridor above. One line: "There is a great heat coming up through the floor." Whibley moves; Pyatt does not — he is finishing a sentence about a girl in Hull. Smoke at the wainscot. The flue, choked with sixty cartloads of resinous hazel, has caught the joists.`,
        shift: `Pyatt finishes the sentence anyway. He keeps reading as men shout.`,
      },
      {
        num: 6, title: 'Palace Yard, Orange Sky · ~18:00', words: 650,
        what: `Pyatt outside, hat in hand, watching St. Stephen's go up. Whibley somewhere inside, counting stairs the wrong way. Pyatt does not feel guilt the size of the building. He feels, smaller and worse, that he has been told — at last, by fire — that the sticks meant something. Because look what their unreading costs.`,
        shift: `A late, terrible self-knowledge. He was the meaning, not the keeper.`,
      },
    ],
    stakes: `If the fire lands as spectacle, it's a costume drama with a big effect. The grief is: a man learns at 58 that he was the meaning, not the keeper, and learns it by setting fire to the nation.`,
    ending: `Pyatt in Palace Yard, the penknife still in his pocket, lips moving — naming a Norfolk farrier nobody asked him to name. Above him the Lords' roof opens like a read book.`,
    risk: `Pyatt's improvisations tip into whimsy and the fire becomes literary set-dressing rather than the cost of his late, terrible self-knowledge.`,
  },
};
