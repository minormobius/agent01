// silk/word/stopwords.mjs — GENERATED. Do not edit by hand.
//
// Copied verbatim from rite/lexicon/lexicons.js so the two surfaces measure the
// same thing. It lives here as a module rather than being read out of that file
// at build time because this pipeline now also runs in a Web Worker, where
// there is no filesystem to read it from.
//
// Regenerate:  node silk/word/build.mjs --sync-stopwords
// The selftest fails if this drifts from rite/lexicon, so it cannot rot quietly.

export const STOPWORDS = new Set(`
a an the and or but so if then than as that this these those there here of
to in on at by for with from into onto off over under above below up down
between among through during about against around across along after before
since until while because since though although unless whether either
neither is am are was were be been being have has had having do does did
doing will would shall should can could may might must ought get got gets
getting go goes going gone went come comes coming came say says said saying
tell tells told asking ask asks asked let lets letting take takes took taken
make makes made making know knows knew known think thinks thought see sees
saw seen look looks looked want wants wanted use uses used find finds found
give gives gave given keep keeps kept i you he she it we they me him her us
them my your his its our their mine yours hers ours theirs myself yourself
himself herself itself ourselves yourselves themselves who whom whose what
which when where why how dont wont cant isnt arent wasnt werent doesnt didnt
havent hasnt hadnt wouldnt shouldnt couldnt aint im youre hes shes its were
theyre ive youve weve theyve id youd hed shed wed theyd ill youll hell shell
well theyll not no yes nor only just also even still very too quite rather
really much many more most some any all both each every either every same
other own such few several another both this that these those some any all
each every now then today tomorrow yesterday soon late later early already
always never ever sometimes often usually maybe perhaps probably actually
basically literally honestly seriously totally absolutely lol lmao omg haha
hahaha hehe idk tbh imo imho btw fwiw fyi ty ttyl gtg yeah yea yep nah nope
ok okay alright sure cool nice yo huh hmm uhh umm hi hello hey bye gonna
wanna gotta lemme kinda sorta dunno thing things stuff something anything
everything nothing someone anyone everyone nobody somebody everybody anybody
one ones way ways post posts thread threads reply replies people person
folks
`.split(/\s+/).filter(Boolean));
