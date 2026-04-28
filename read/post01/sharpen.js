// Sharpening pass — between Outline and Draft. Causal chains, arcs,
// relationship dynamic, structural rhythm. Once-over the skeleton
// before any prose is committed.

export const SHARPEN = {
  'compliance-window': {
    structuralLabel: 'Structural comedy',
    causalChain: [
      { beat: 'Mon', text: `BECAUSE the letter arrives certified (signature required, legally noted), Derek cannot pretend he didn't receive it; THEREFORE Tuesday must admit Janet.` },
      { beat: 'Tue', text: `Janet removes Wednesdays AND so Derek reaches for a specific Wednesday to protest with — finds none — THEREFORE his protest dies in his throat, which is the only permission Janet needs to continue.` },
      { beat: 'Wed', text: `BECAUSE Derek did not protest Tuesday, Janet escalates to people; she consolidates Linda and Ruth into Grandma, BUT mid-removal she skips a NOTED, and Derek sees it; THEREFORE the procedure now has a witness inside it.` },
      { beat: 'Thu', text: `BECAUSE he was witnessed, Janet offers Derek a line item (the Casio, named); he accepts, AND so she writes his request where NOTED used to go — the column has been repurposed; THEREFORE Friday's draft is no longer purely hers.` },
      { beat: 'Fri', text: `BECAUSE the paragraph contains the Casio, Derek recognizes it as his; THEREFORE he steps in. Janet hums the two bars and does not stop, BECAUSE there is no longer a client to be Tier II in front of.` },
    ],
    arcs: [
      {
        name: 'Derek',
        start: `Thumb pressed to the Casio's bezel while reading cereal ingredients aloud at the counter — a man who measures himself in maltodextrin.`,
        inflection: `Thursday, the half-second after Janet asks about the Casio. He looks at his wrist before answering. That look is the arc.`,
        end: `Stepping into the paragraph without checking his watch. He has been told which parts counted; he doesn't need the bezel anymore.`,
      },
      {
        name: 'Janet',
        start: `9:02 sharp, mechanical pencil already out, humming the two bars and clipping herself off at the same syllable she has clipped for nine years.`,
        inflection: `Wednesday, the skipped NOTED. Not a decision — a small mechanical failure she allows. Her pencil hovers, then moves on.`,
        end: `Friday, humming the full two bars on Derek's stoop after he's gone in. Nobody asked what she was before Tier II. She let the song finish anyway.`,
      },
    ],
    relationship: `The unspoken negotiation: Derek is asking to be audited; Janet is asking to be seen as the auditor. He wants an authority to tell him which parts of his life were load-bearing; she wants a client to recognize that nineteen years of NOTEDs was a person's labor, not a function. Neither says this. He teaches her that a column can hold a request, not just a protest. She teaches him that compression is not erasure if someone names the part that stays. The single silent move: Wednesday's skipped NOTED. She doesn't write it; he doesn't mention seeing it. That mutual non-mention is the contract.`,
    structuralUnit: `The unit is the NOTED — a clipboard column entry, three letters, all caps, made with a mechanical pencil. Each removal generates one. The rhythm is: hum (two bars) / clip / removal / NOTED. Four-beat procedural bar, repeated. Deadpan comes from the bar's indifference to the size of what's being removed (a Wednesday, a grandmother, a commute — same four beats).`,
    structuralNotes: [
      { type: 'Break · heart', text: `Wednesday: Grandma's line from the kitchen doorway lands in the middle of the bar — between removal and NOTED — and Janet's pencil doesn't close the bar. The missing NOTED is a rest where a downbeat should be.` },
      { type: 'Break · heart', text: `Thursday: Janet writes "Casio F-91W" in the NOTED column. The bar plays, but the last beat is in a different key.` },
      { type: 'Return', text: `Friday: the bar plays clean — hum, clip, removal (Derek), NOTED (the paragraph itself is the NOTED). The rhythm closes, and that closure is what makes the step-in funny instead of sad. Then the coda: Janet hums two bars without clipping. The bar refuses to close. That is the ending.` },
    ],
    nail: `The Wednesday skipped NOTED must read as a nineteen-year muscle failing for half a second — not a character softening, not a wink — so that the Casio entry on Thursday lands as a procedure being repurposed by two people who still won't look at each other.`,
  },
  'kolmogorov': {
    structuralLabel: 'Structural urgency',
    causalChain: [
      { beat: '1', text: `Iris feeds the compressor a 280-char post BECAUSE shipping a working demo for Hannelore is the only thing on her calendar; the 4,200-word output contains the kitchen argument, THEREFORE the seed-to-output ratio is no longer the result she was optimizing for.` },
      { beat: '2', text: `She skimmed past the kitchen sentence in real time BUT the Cyber-shot's last frame surfaces in the published novella, THEREFORE the output cannot be generation — it indexes private state from an air-gapped SD card.` },
      { beat: '3', text: `She needs a control trial to falsify the index hypothesis, THEREFORE she seeds a grocery list; it returns Marisol Acuña's childhood, BECAUSE the substrate does not distinguish between Iris's dead and a stranger's living. She opens Marisol's two unread emails — and this is the ethics hinge: she reads them, knowing.` },
      { beat: '3→4', text: `BECAUSE she has already crossed the line by reading Marisol, the kitchen seed is no longer discovery; it is a second offense she has pre-authorized. THEREFORE Beat 4 is not catharsis earned by curiosity but a debt taken on knowingly.` },
      { beat: '4', text: `The kitchen output gives her the version where Theo apologizes, BUT she stops crying to calculate, BECAUSE the substrate has shown her it will keep paying out and the only remaining question is the seed for her own remainder.` },
      { beat: '5', text: `Hannelore arrives, sees Marisol, says DARPA is the right audience, THEREFORE Iris understands the demo will weaponize what she already stole; the choice collapses to a private one.` },
      { beat: '6', text: `BECAUSE she cannot un-know and cannot let Hannelore demo it, she types the codepoint for her own life, photographs the screen with the Cyber-shot, sets the camera face-down — refusing to be the one who reads it.` },
    ],
    arcs: [
      {
        name: 'Iris',
        start: `9:07 PM: deadline-calm, receipt-margin math, sleeves pushed to elbows, coffee third refill.`,
        inflection: `Beat 3, the moment she clicks the second Marisol email. Not the kitchen. Reading Marisol is the trespass; the kitchen is the receipt.`,
        end: `3:00 AM: still, finger resting on Return, not pressing. The calculation is done; the gesture left is refusal-by-camera.`,
      },
      {
        name: 'Theo (decompressed)',
        start: `First decompression: Theo as Iris already remembered him — Pyrex ashtray, "right?", the argument as she rehearsed it.`,
        inflection: `Kitchen output: Theo as she wishes she had let him be — apologizing in vocabulary he never owned, staying past the door slam.`,
        end: `Photograph face-down: Theo as a thing she will not keep looking at, even true. The substrate's gift refused mid-acceptance.`,
      },
    ],
    relationship: `Each output is the substrate offering Theo on more generous terms. She accepts the kitchen apology — reads it twice — but refuses the codepoint's payoff by photographing instead of reading. The silent turn is the camera face-down on the desk: the first time in six hours she declines a decompression that is already hers. The unopened second Marisol email, left open in a tab behind the terminal, is the witness she keeps so she cannot pretend later.`,
    structuralUnit: `Unit: wall-clock timestamps as section breaks, Newton's cradle ticking as ambient meter, output word-count as escalating pressure (4,200 → unredacted childhood → verbatim+counterfactual → one codepoint).`,
    structuralNotes: [
      { type: 'Slow', text: `The kitchen output: read it at reading speed, full paragraphs, no timestamp.` },
      { type: 'Slow', text: `The photograph: shutter, set down, face-down — three beats, one per sentence.` },
      { type: 'Fast', text: `Beat 3 from grocery-list seed to opening Marisol's emails: timestamps clipped, sentences dropping verbs.` },
      { type: 'Fast', text: `Beat 5 Hannelore's arrival: cradle audible, dialogue clipped to single lines.` },
    ],
    nail: `The instant Iris opens Marisol's second email must read as the story's true crime — quieter than the kitchen, quieter than the codepoint, and the one act she cannot photograph her way out of.`,
  },
};
