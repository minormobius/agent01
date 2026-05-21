export const SEED = `If you had to create an abstract machine that takes a short string, like the length of this post, and turns it into a short story of a few thousand words, how would you do that? What is a short story anyway? how do you know if one is good`;

export const SEED_SOURCE = {
  author: '@deepfates',
  platform: 'Bluesky',
  url: 'https://bsky.app/profile/deepfates.com.deepfates.com.deepfates.com.deepfates.com.deepfates.com/post/3mkguu33p422g',
};

export const PITCHES = [
  {
    id: 'kolmogorov',
    title: 'The Kolmogorov Prize',
    genre: 'Hard SF',
    pitch: `Iris Vance runs a 14-line compressor at the Allen Institute that claims to extract the minimum-length program generating any human "story-shaped" artifact. She feeds it a 280-character Bluesky post about abstract machines and gets back a 4,200-word novella about her dead brother Theo, including a kitchen argument from 2009 that she has never told anyone. The transgression: she submits the output, unedited, to Clarkesworld, and it is accepted. The next seed she tries — a grocery list — produces a story containing the unredacted childhood of the reviewer who accepted the first one. Iris realizes the machine is not generating; it is decompressing a substrate every short string was already a pointer into. She has six hours before her PI runs the demo for DARPA. The ending image: Iris at 3 a.m. typing the single character that, by her calculation, decompresses to the exact story of her own remaining life, finger hovering, the cursor blinking at the rate of her pulse.`,
    why: `The compression conceit is load-bearing, not decorative; the horror is epistemic and the prose can stay clipped and Eganesque. The final gesture is a closed-form question the reader can solve emotionally before Iris does.`,
  },
  {
    id: 'concordance',
    title: 'The Concordance Clerk',
    genre: 'Literary realism',
    pitch: `Mira Halloran indexes oral histories at the Newfoundland Folklore Archive in St. John's, paid by the tagged minute. Her father, a retired fisherman with aphasia, has started speaking again — but only in fragments lifted from the tapes she plays him at the nursing home. He returns her grandmother's vowels, a stranger's joke about cod liver, the cadence of a man drowned in 1974. Mira realizes he isn't remembering. He's compressing — running a lifetime of listening through whatever circuit still works. When the archive's funding gets cut and a tech firm offers to scrape the tapes for a "regional voice model," Mira has to decide whether to hand over the master reels or smuggle them home in her tote bag, one cassette at a time. The story turns on a Tuesday she spends transcribing her father transcribing the dead, both of them working the same tape from opposite ends.`,
    why: `The structure mirrors its subject — a daughter and father indexing each other in real time — and the prose can stay quiet because the metaphor is doing load-bearing work. Ends on a held breath, not a thesis.`,
  },
  {
    id: 'lossy',
    title: 'Lossy',
    genre: 'Cyberpunk',
    pitch: `Neha reverse-engineers cochlear firmware in a Goa flat above a paint shop, and pays rent by selling "shorts" — sub-kilobyte payloads that unpack into eight-minute hallucinated memories on bootleg Sony implants. Her scoring function is brutal and market-tested: did the customer cry, did they tip, did they come back. A client called Old Bose pays triple for a 312-byte string and asks her not to audit the unpack. She audits the unpack. It is a short story, in her own narrator-voice, about Neha agreeing not to audit the unpack. The inciting transgression is that she runs it twice. The recursion costs her four hours and a tooth. She tracks the seed back through three resellers to a defunct Bluesky archive and a man who insists he only ever wrote one post, as a joke, in 2024. The ending image: Neha on the Mandovi bridge at dawn, implant muted, humming the melody the story ended on, unsure whether the humming is hers or the last 18 bytes still decompressing.`,
    why: `Voice does the worldbuilding; the economy of the "short" mirrors the economy of the story. The ending trusts ambiguity without becoming vague — the tooth is real.`,
  },
  {
    id: 'weight-of-said',
    title: 'The Weight of Said',
    genre: 'Magical realism',
    pitch: `In Talca, Chile, words start landing on the scales. Not metaphor — actual mass. A whispered te amo tips a kitchen scale by 0.4 grams; a courtroom guilty dents a hardwood floor. Tomás Vergara, a postal worker who stutters, discovers his half-sentences weigh more than other people's whole ones. The post office reroutes him to dead letters, where unsent mail piles up at industrial tonnage and the building begins to list. Tomás finds a 1987 letter from his mother to a man who isn't his father, sealed, addressed, never mailed — and heavier than anything else in the room. He has to choose: read it (and add his knowing to the load), burn it (and the smoke will still weigh something), or deliver it forty years late to a man who may have spent four decades waiting for exactly this envelope. The physics never gets explained. The post office keeps sinking.`,
    why: `The rule is small and ruthlessly enforced, so every line of dialogue becomes a budget. The ending hinges on what a son is willing to carry, which is the only question the premise was ever asking.`,
  },
  {
    id: 'compliance-window',
    title: 'The Compliance Window',
    genre: 'Absurdist comedy',
    pitch: `Derek Pell, 34, receives a letter informing him that his life has been selected for compression. A representative named Janet arrives Tuesday with a clipboard and a tape measure. She explains, pleasantly, that Derek's life is currently 71 years long and must be reduced to approximately 4,200 words by Friday. Derek asks if this is legal. Janet says compliance is voluntary but non-compliance is also being phased out. They begin in the kitchen. Janet removes Wednesdays. Derek's mother, who lives in Toledo, is consolidated with his aunt, who lives in Akron, into a single woman named Grandma who lives in Ohio. Derek's first marriage is summarized as "a learning experience" and placed in a manila envelope. By Thursday, Derek's commute has been replaced with the phrase "and then he was at work." Derek protests that he liked his commute. Janet notes the protest on a form and removes the form. On Friday, Derek opens his front door and finds a paragraph. He steps into it. The paragraph is fine. The paragraph is, honestly, mostly what he remembered.`,
    why: `The comedy is procedural — the absurdity has paperwork — and the ending refuses to wink, which is what makes the last sentence quietly devastating.`,
  },
  {
    id: 'sparse-representation',
    title: 'Sparse Representation',
    genre: 'Romance',
    pitch: `Yusuf Adeyemi compresses MRI scans for a hospital network in Leeds; June Kowalczyk runs the radiology floor and hates his algorithm because it smooths the kind of soft-tissue noise she's trained to read as something is wrong here. They meet arguing about a 7mm shadow that his pipeline discarded and her gut wouldn't. The shadow turns out to be nothing. The argument turns out to be the start of eleven months of after-hours coffee, a shared Spotify account, and a habit of texting each other single words at 2 a.m. Then June finds a real shadow on her own scan, and Yusuf has to look at the raw file — the one his own software would have thrown away — and decide what version of her he's been in love with: the lossless one, or the one his model preferred. She makes him say it out loud before she'll let him drive her to the appointment.`,
    why: `The romance and the technical conflict are the same conflict, so the climax doesn't need a grand gesture — just one honest sentence in a hospital car park. Ends on her hand on the door handle.`,
  },
  {
    id: 'tally-stick',
    title: 'The Tally-Stick at Westminster',
    genre: 'Historical fiction',
    pitch: `Joseph Hume, a clerk twenty years past his prime, is tasked with burning the Exchequer's tally-sticks: notched hazel rods that recorded Crown debts since the twelfth century. Each stick is a string. Each notch — a wide cut for a thousand pounds, a narrow scratch for a shilling — was once a whole transaction, a whole farmer, a whole quarrel settled. Joseph has spent his life reading them. His superior wants the lot in the stove under the House of Lords by nightfall. Joseph begins to read them aloud as he feeds them in, inventing the lives behind the notches: a wool-merchant's widow in Norwich, a Cornish tin-shipment that never arrived, a bishop's nephew. By dusk he is improvising whole households from a single groove. The stove overheats. The flue catches. Parliament burns. Joseph stands in Palace Yard watching the sky go orange and understands, finally, that he was never the archivist — he was the last reader, and the readers are what made the notches mean anything.`,
    why: `The real 1834 fire is the ending the protagonist's voice has been earning all along; compression is literal — notches into lives — and the story trusts the reader to feel the catastrophe as grief, not spectacle.`,
  },
  {
    id: 'length-of-this-post',
    title: 'The Length of This Post',
    genre: 'Noir / mystery',
    pitch: `Marisol Quan runs the lost-and-found at the Port Authority, which means she touches three thousand abandoned objects a week and is not supposed to wonder about any of them. Then a paperback shows up in the umbrella bin with a receipt tucked at page 41: a confession, signed, dated last Tuesday, to a murder no precinct has on file. She should hand it to the duty sergeant. She does not. She starts cross-referencing receipts against the bin log, then against the bus manifests, then against a city she suddenly sees as a sorting facility for grief. The killer, it turns out, has been mailing himself into the lost-and-found in pieces — a glove here, a margin note there — because he wants to be found by someone whose job is to find. Marisol catches him at the 3 a.m. shift change, holding his last installment: a child's mitten, knit blue. She files it. She does not file the report.`,
    why: `The engine is taxonomy as moral act — every paragraph is a small act of cataloging that the reader feels accruing weight, until the final filing lands like a verdict.`,
  },
  {
    id: 'eight-fourteen',
    title: 'Eight Hundred and Fourteen Characters',
    genre: 'Metafiction',
    pitch: `A woman named Ines runs a tiny press out of a converted laundromat in Lisbon. Her late brother Tomás left her a notebook of "seeds" — short strings, a sentence each — and a note: turn these into stories, one per year, until you run out. She is on seed seventeen. The current seed is the Bluesky post about the abstract machine. Ines doesn't know what Bluesky is; Tomás died before it existed. She tries anyway. The story you're reading is her draft, and it keeps interrupting itself: a paragraph about a Lisbon tram, then a margin note (he hated trams), then the tram again but now Tomás is on it, then Ines crossing out Tomás because she promised herself no resurrections. The thing that breaks is her rule. She lets him stay on the tram for one paragraph. The story ends with her closing the notebook on seed eighteen, unread, because she has finally understood what the machine was for: not to expand the string, but to give her somewhere to put him down.`,
    why: `The formal trick (a story drafting itself) serves grief, not vanity; the ending withholds the next seed, which is the only honest move.`,
  },
  {
    id: 'salla',
    title: `The Weighing of Salla's Word`,
    genre: 'Mythic fantasy',
    pitch: `In the salt-flats north of Erech-Tal, a town the size of a market, there is one judge: an old woman named Salla who can hear whether a sentence is true. Not the speaker — the sentence itself. A true sentence rings; a false one sits flat on her tongue like a wet stone. She has judged for forty-one years. A herder named Mosk comes to her with eleven words about his brother and a missing flock. Salla listens, and for the first time in her life she cannot tell. The sentence neither rings nor sits. It hovers. She sends Mosk away and spends the night walking the flats, testing old sentences she knows are true — her mother's name, the count of her teeth — and finds them all suddenly ambiguous. The gift is leaving her, or the world is changing, or Mosk has spoken the first sentence that is genuinely both. At dawn she returns and tells him: I do not know. The town, hearing this, does not collapse. It simply begins, for the first time, to argue.`,
    why: `The magic is one rule, cleanly broken, and the ending earns its civic weight — a small society learning doubt is a bigger event than any war.`,
  },
  {
    id: 'post-that-read-me-back',
    title: 'The Post That Read Me Back',
    genre: 'Cosmic horror',
    pitch: `Wend Halloran, a copy editor at a dying Dublin trade-pub, keeps a private rule: any text under 300 characters can be held entire in the mind, and is therefore safe. She reads a Bluesky post — the one about the abstract machine — and that night dreams a short story, fully formed, 3,800 words, about a copy editor named Wend who reads a post and dreams a story. She writes it down. The transgression is small: she publishes it under a pseudonym to a webzine called Hagglethorn. A week later a reader emails to say they enjoyed the part where Wend's mother dies; Wend's mother is alive, and that scene is not in the published version, but it is in the draft on her hard drive. More emails arrive, each describing scenes from progressively later drafts she has not yet written. The ending image: Wend at her kitchen table, deleting the file character by character from the end, watching the unsent emails in her drafts folder shorten in lockstep, until only the seed post remains, blinking, waiting to be read by someone smaller.`,
    why: `The wrongness is structural, not gory; the horror lives in the reader's growing certainty about the scoring function. The deletion-as-climax inverts the compression premise cleanly and earns its quiet.`,
  },
  {
    id: 'pelo',
    title: 'The Boy Who Counted the River',
    genre: 'Fable',
    pitch: `In a village at the bend of a long river, a boy named Pelo was given the job of counting what the river brought. Each morning he sat on the flat stone and wrote in his book: one heron, two pears, a door. The elders said a good count made the village safe. Pelo counted for years. One day the river brought a word he did not know, written on a leaf. He wrote it down anyway. The next day it brought a sentence. Then a page. Then a story so long it took until winter to pass. Pelo wrote and wrote, and his hand grew old at the wrist while the rest of him stayed twelve. When the story ended, the river was empty, and Pelo was a man, and the book was the village. He set the book on the flat stone and walked upstream to find who had been writing.`,
    why: `The structure is a riddle that solves itself in the last line, and the prose has the patience of something translated from a language no one speaks anymore.`,
  },
];
