/* borges — THE LEXICON: the combinatorial substrate of the endless book.

   The robots have every story already. What they do not have is a fixed one to
   tell, so they build each telling out of parts: a country to borrow the
   furniture from (the CULTURES), a skeleton of plot to hang it on (the PROPP
   functions and the TALETYPE frames that order them), the recurring story-atoms
   that flavour the beats (the MOTIFS, filed by the folklorists' letter-classes),
   and a cast of archetypes (the ROLES) instantiated with borrowed names.

   This is deliberately the *same apparatus* as the annotated tales on
   read.mino.mobi — Propp's morphology, the Thompson motif-classes, a typed
   cast — only here it runs forward, as a generator, instead of backward, as
   analysis. A robot posts the resulting mythograph to the Tabard before it
   speaks a word, because a robot is a structured thing and likes to publish
   its blueprint first.

   Realize-templates use %tokens% that the generator fills from the world it
   rolls up: %hero% %heroine% %villain% %donor% %helper% %dispatcher% %false%
   %elder% (the names), %object% %object2% %creature% %place% %place2% %term%
   %quest% %number%. Attaches to BORGES.lex. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};

  /* ───────────────────────── CULTURES ─────────────────────────
     Each pack is a wardrobe, not a doctrine: a stock of names, places,
     creatures and objects the tellers raid for texture. The *voice* stays
     medieval-English-oral; only the furniture travels. */
  var CULTURES = {
    welsh: {
      id: "welsh", label: "Brittonic",
      male: ["Pwyll", "Bran", "Math", "Gwydion", "Lleu", "Manawydan", "Pryderi", "Gwawl", "Teirnon", "Amaethon", "Gilfaethwy", "Custennin"],
      female: ["Rhiannon", "Branwen", "Arianrhod", "Blodeuwedd", "Cigfa", "Goewin", "Olwen", "Creiddylad", "Penarddun"],
      epithet: ["of the seven cantref", "of the pale-white horse", "of the silver hand", "Head of the Otherworld", "the Old", "of Dyfed", "of the Bright Hill", "Thunderous-Surge"],
      place: ["Arberth", "Gwales", "the Gorsedd mound", "Annwn", "Caer Dathyl", "the glen of Cuch", "Harlech", "the seven cantref of Dyfed"],
      creature: ["a hound shining white with red ears", "a salmon older than the flood", "a great pale-white mare none could overtake", "the eagle of Gwernabwy", "an unseen claw at the window", "a giant of the marsh"],
      object: ["a hamper that fed a hundred", "a cauldron that gave back the slain", "a small bag that swallowed all it was fed", "a horn of the old kings", "a torc of red gold"],
      honorific: "lord", settingLine: "in the old days of the island, before the Saxon kept the calendar"
    },
    norse: {
      id: "norse", label: "Norse",
      male: ["Sigurd", "Hogni", "Gunnar", "Egil", "Thrain", "Ketil", "Volund", "Starkad", "Hrolf", "Ottar", "Svein"],
      female: ["Brynhild", "Gudrun", "Sigrun", "Aslaug", "Hervor", "Thordis", "Gunnhild", "Yrsa"],
      epithet: ["the Ill-Counselled", "Iron-Beard", "the Far-Travelled", "Snake-in-the-Eye", "the Smith", "Shield-Breaker", "the Oath-Keeper", "Crow-Boot"],
      place: ["a steading under the fell", "the howe by the grey shore", "the long hall of the jarl", "the ford of the two kings", "the smithy below the falls", "the isle of the drowned"],
      creature: ["a worm coiled on red gold", "a grey wolf that spoke", "a one-eyed wanderer in a blue cloak", "a valkyrie ringed in fire", "a draugr in its howe"],
      object: ["a sword reforged from its shards", "a ring that bred more rings", "an arm-ring sworn upon", "a cloak that hid its wearer", "a horn that could not be emptied"],
      honorific: "jarl", settingLine: "in the hard years before the white Christ came north"
    },
    irish: {
      id: "irish", label: "Gaelic",
      male: ["Cú Chulainn", "Finn", "Oisín", "Diarmuid", "Conaire", "Fergus", "Bricriu", "Lugh", "Nuada", "Midir"],
      female: ["Emer", "Gráinne", "Étaín", "Deirdre", "Macha", "Fand", "Líadan", "Bóand"],
      epithet: ["of the Long Hand", "the Hound of Ulster", "the Fair", "of the apple-branch", "the Hospitaller", "Honey-Mouth", "of the Síd"],
      place: ["the síd-mound at Brí Léith", "Tara of the kings", "the ford of Ulster", "the orchard of the Otherworld", "the bright hostel", "the plain of Muirthemne"],
      creature: ["a salmon of all knowledge", "a hound no leash could hold", "a woman of the síd in a bird's shape", "a cow that filled every pail", "a man with a club in one hand and a cup in the other"],
      object: ["a branch of silver with golden apples", "a cup that broke at a lie and mended at three truths", "a spear that thirsted", "a cloak of the síd", "a board of fidchell that played itself"],
      honorific: "king", settingLine: "in the time when the hills were doorways"
    },
    greek: {
      id: "greek", label: "Hellenic",
      male: ["Bellerophon", "Theseus", "Jason", "Glaucus", "Admetus", "Pelops", "Meleager", "Lykaon", "Anchises"],
      female: ["Atalanta", "Medea", "Alcestis", "Psyche", "Ariadne", "Procne", "Auge", "Danaë"],
      epithet: ["the Stranger-Guest", "tamer of the winged horse", "of the golden fleece", "swift-footed", "the Returned", "born of the shower of gold"],
      place: ["a polis between two seas", "the labyrinth under the palace", "the oracle's smoke-filled cleft", "the island of the sorceress", "the river of the dead", "a wine-dark strait"],
      creature: ["a winged horse out of the spring", "a bronze bull breathing fire", "a sphinx with a riddle and an appetite", "a many-headed marsh-serpent", "a stranger who was a god in a beggar's coat"],
      object: ["a thread to unwind the maze", "a fleece of gold on a sleepless oak", "a cup the sun sailed home in", "a helm of unseeing", "a bridle forged by the grey-eyed one"],
      honorific: "lord", settingLine: "in the age of heroes, when the gods still walked to dinner"
    },
    arabian: {
      id: "arabian", label: "Arabian",
      male: ["Hasan", "Kamar", "Aladdin", "Sindbad", "Ma'ruf", "Nur al-Din", "Hatim", "Yunan", "Duban"],
      female: ["Scheherazade", "Budur", "Dunya", "Zubaidah", "Maryam", "Anitra", "Sitt al-Husn"],
      epithet: ["the Cobbler", "of the Sea", "the Sage", "the Vizier's son", "of Basra", "the Generous", "the Sleeper-Waked"],
      place: ["the bazaar of a city without a name", "a brass city in the sand", "the vizier's garden", "an island of apes", "the valley of diamonds", "a palace raised in a night"],
      creature: ["an ifrit folded into a copper jar", "a roc that darkened the noon", "a horse of black ebony that flew", "a fish that spoke from the pan", "a serpent-queen beneath the floor"],
      object: ["a lamp with a servant of smoke", "a ring with a slave of the ring", "a carpet that obeyed the foot", "a copper bottle stoppered with lead", "an apple that cured all but jealousy"],
      honorific: "sultan", settingLine: "in a city that may have been Baghdad and may have been a rumour of Baghdad"
    },
    japanese: {
      id: "japanese", label: "Japanese",
      male: ["Momotarō", "Urashima", "Issun", "Yoshitsune", "Kintarō", "Hōichi", "Tarō", "Genkurō"],
      female: ["Kaguya", "Otohime", "Tamamo", "Izanami", "Ohatsu", "Yuki-onna", "Tsuru"],
      epithet: ["the Peach-Born", "the Inch-High", "of the Dragon Palace", "the Crane-Wife", "of the snow", "the Nine-Tailed"],
      place: ["a village under the blue mountain", "the dragon palace beneath the wave", "a bamboo grove that glowed at the root", "the capital of peace and tranquillity", "a teahouse at the pass", "the snow country"],
      creature: ["a fox with too many tails", "a crane that became a wife at the loom", "a woman of the snow with no footprints", "an oni with an iron club", "a tortoise that carried a man to the sea-king"],
      object: ["a mallet that knocked out gold", "a jewel that ruled the tides", "a box that must not be opened", "a straw coat of invisibility", "a flute that called the foxes"],
      honorific: "lord", settingLine: "long ago, in the age of the gods and just after"
    },
    persian: {
      id: "persian", label: "Persian",
      male: ["Rostam", "Zal", "Kai Khosrow", "Bahram", "Sohrab", "Faramarz", "Esfandiyar", "Bizhan"],
      female: ["Rudabeh", "Tahmineh", "Manijeh", "Gordafarid", "Sindukht", "Katayoun"],
      epithet: ["the White-Haired", "of the seven trials", "the World-Seeker", "raised by the bird", "of the bronze body", "the Champion"],
      place: ["the court at Balkh", "a pit of the warlord", "the white castle of the seven trials", "the river that parts kingdoms", "the mountain where the bird nests"],
      creature: ["the Simurgh, the bird that healed with a feather", "a div of the mountain", "a dragon athwart the road", "a horse that chose its own rider", "a lion-pelted demon"],
      object: ["a feather that summoned the great bird", "a mace of ox-head shape", "a cup that showed the seven climes", "a coat of armour no blade would bite", "a goblet of the world-seeing wine"],
      honorific: "shah", settingLine: "in the reigns the book of kings remembers"
    },
    westafrican: {
      id: "westafrican", label: "West African",
      male: ["Anansi", "Ananse", "Kweku", "Ọ̀rúnmìlà", "Sundiata", "Mmoatia", "Kwaku"],
      female: ["Aso", "Yaa", "Oya", "Abena", "Akua", "Nana"],
      epithet: ["the Spider", "the Trickster", "the Lion's son", "of the crossroads", "the Sky-God's debtor", "Wisdom-Hoarder"],
      place: ["the village at the forest's edge", "the sky-god's high house", "the crossroads at dusk", "the river where the drum was kept", "the market of every tongue"],
      creature: ["a spider who wore a man's shape", "a python that guarded the wisdom-pot", "a leopard fooled by flattery", "a tortoise with a cracked shell and a long memory", "a hornet bargained into a gourd"],
      object: ["a pot meant to hold all the world's wisdom", "a drum that summoned the village", "a magic gourd that fed or famished", "a calabash of stories bought from the sky", "a talking skull that warned the curious"],
      honorific: "chief", settingLine: "in the time when the sky still owned the stories"
    },
    finnish: {
      id: "finnish", label: "Finnic",
      male: ["Väinämöinen", "Ilmarinen", "Lemminkäinen", "Kullervo", "Joukahainen", "Untamo"],
      female: ["Louhi", "Aino", "Marjatta", "Kyllikki", "Ilmatar"],
      epithet: ["the Eternal Sage", "the Smith of Heaven", "the Reckless", "the Ill-Fated", "Mistress of the North", "born on the knee of the air"],
      place: ["the misty farms of Kalevala", "the dark farms of the North", "the river of the dead", "the forge where the sky was hammered", "the rapids of the great pike"],
      creature: ["a great pike whose jaw became a harp", "a swan on the river of the dead", "an elk of demons to be hunted on skis", "a bee sent to the ninth heaven", "an iron eagle"],
      object: ["a mill that ground salt and grain and gold for ever", "a harp made from a fish's jaw and a maiden's hair", "a sky hammered from the tip of a feather", "a boat that sailed by singing"],
      honorific: "master", settingLine: "in the days when a song could hammer iron or sink a boat"
    },
    indian: {
      id: "indian", label: "Indic",
      male: ["Vikram", "NaLa", "Hariśa", "Sudhana", "Trishanku", "Chandra", "Mahoshadha"],
      female: ["Damayanti", "Savitri", "Tara", "Mohini", "Padmavati", "Ratnavali"],
      epithet: ["the Just", "of the swan-messenger", "the Bodhisattva", "who bargained with death", "of the lotus", "the Riddle-Solver"],
      place: ["the city of Ujjain", "a cremation-ground at the dark of the moon", "the court of the swan-king", "a forest of ascetics", "the palace of the seven gates"],
      creature: ["a vetala hanging head-down from a tree", "a golden swan that carried letters", "a serpent-king in a jewelled hood", "a tiger that had been a brahmin", "an elephant white as the new moon"],
      object: ["a ring that turned a king to a beggar", "a bowl that filled with whatever was wished", "a noose taken back from the lord of death", "a jewel born in a serpent's hood", "a board of dice that ruled fates"],
      honorific: "raja", settingLine: "in the reign of a king the storytellers loved"
    },
    slavic: {
      id: "slavic", label: "Slavic",
      male: ["Ivan", "Dobrynya", "Koschei", "Sadko", "Vasily", "Finist", "Yemelya"],
      female: ["Vasilisa", "Marya", "Alyonushka", "Snegurochka", "Zvezda"],
      epithet: ["the Fool", "the Fair", "the Deathless", "the Wise", "of the falcon-feather", "Tsarevich"],
      place: ["a tsardom past the thrice-ninth land", "a hut on hen's legs in the dark wood", "the underwater court of the sea-tsar", "the apple-orchard of the firebird", "the river of milk with banks of jelly"],
      creature: ["a firebird whose feather lit a hall", "a hut that turned on hen's legs", "a grey wolf that ran faster than thought", "a witch who flew in a mortar", "a serpent with three then six then nine heads"],
      object: ["a feather of the firebird", "a doll that gave good counsel from a pocket", "a ball of yarn that rolled the road ahead", "a tablecloth that laid its own feast", "an egg that held a villain's death"],
      honorific: "tsar", settingLine: "beyond the thrice-ninth land, in the thrice-tenth tsardom"
    },
    mongol: {
      id: "mongol", label: "Steppe",
      male: ["Geser", "Temür", "Bodonchar", "Khasar", "Sübeedei", "Erkhii"],
      female: ["Alan-goa", "Börte", "Manduhai", "Khulan"],
      epithet: ["the Marksman", "Son of Heaven", "the Wrestler", "of the white herd", "the Far-Rider"],
      place: ["a felt camp on the endless grass", "the blue mountain of the ancestors", "a ford of the great river", "the council under the world-tree", "the white tent of the khan"],
      creature: ["a horse foaled of the wind", "a marmot that had been a marksman", "a many-coloured deer", "a wolf at the head of a bloodline", "a swan-maiden on the grey lake"],
      object: ["a bow that none but its master could string", "a whip that woke the dead horse", "a banner of horsetails", "a cup of the conquered khan's skull", "an arrow that always found the throat"],
      honorific: "khan", settingLine: "on the grass that has no end, under the eternal blue sky"
    }
  };

  /* ───────────────────────── ROLES ─────────────────────────
     The cast archetypes — Propp's dramatis personae. Mirrors the read/ tales'
     characters.roles[] shape so the character web and mythograph render
     unchanged. */
  var ROLES = [
    { id: "hero", label: "The hero", color: "#d6a93f" },
    { id: "heroine", label: "The bride / the sought-for", color: "#c98aa6" },
    { id: "villain", label: "The villain", color: "#c25b4a" },
    { id: "donor", label: "The donor", color: "#7fb3a0" },
    { id: "helper", label: "The helper", color: "#9fb0c9" },
    { id: "dispatcher", label: "The dispatcher", color: "#9a86c4" },
    { id: "false", label: "The false hero", color: "#8a8270" },
    { id: "elder", label: "The king / the elder", color: "#b08a4b" }
  ];

  /* ───────────────────────── PROPP ─────────────────────────
     A working subset of Propp's 31 functions, each with a symbol, the act it
     belongs to, a one-line gloss, and oral-voice realize-templates. `invert`
     gives the for-laughs reversed realization the remixer reaches for. */
  var PROPP = [
    { id: "first-function", sym: "α", name: "Initial situation", act: "setup", gloss: "The family and the hero are introduced.",
      realize: ["In %place% there dwelt %hero%, %heroEp%, and the days were good while they lasted.", "There was once in %place% a %honorific% whose heir was %hero%, and that is where it starts.", "Now %hero%, %heroEp%, kept the hall at %place% in those years, and kept it well, and that is the beginning."] },
    { id: "absentation", sym: "β", name: "Absentation", act: "setup", gloss: "A member of the family is taken or goes away.",
      realize: ["%connect% %heroine% was taken in the dark, gone from the cradle, gone from the gate, and no agent named.", "%connect% %elder% went over the water and left the hall unwarded, and that was the door the trouble came in by.", "%connect% one was missing at the morning count, and the empty place at the board said the rest."],
      invert: ["%connect% it was the villain who vanished first, sulking, and the whole hall had to go and coax him back, which is no way to start a tale, and exactly how this one starts.", "%connect% nobody went anywhere, and the hall stayed full, and the teller had to send someone out by hand to get the thing moving."] },
    { id: "interdiction", sym: "γ", name: "Interdiction", act: "setup", gloss: "A prohibition is laid on the hero.",
      realize: ["%connect% the word was laid on %hero%: by no means open %object%, by no means cross into %place2%.", "%connect% %elder% forbade the one thing: touch not %object%, ask not the name, as elders will.", "%connect% there was a single rule on %hero%, and a single rule in a tale is a hinge: do not open %object%."] },
    { id: "violation", sym: "δ", name: "Violation", act: "setup", gloss: "The prohibition is broken.",
      realize: ["%connect% the word was broken, as words in tales are broken, and %object% was opened.", "%connect% %hero% did the forbidden thing within the hour, for what is a prohibition but a signpost.", "%connect% the one rule was kept three days and broken on the fourth, and the fourth is the only day a tale remembers."],
      invert: ["%connect% %hero% kept the prohibition faithfully, to the letter, for ever, and so nothing happened at all, until the teller lost patience and broke it for them.", "%connect% the rule was broken by accident, by a draught and an unlatched door, which fooled no one and bound the hero just the same."] },
    { id: "reconnaissance", sym: "ε", name: "Reconnaissance", act: "complication", gloss: "The villain makes an attempt at reconnaissance.",
      realize: ["%connect% %villain% went abroad to learn the lie of the land, asking after %object% and after the hero's name.", "%connect% %villain% sent out scouts, or was the scout, sniffing for the weak place in the wall.", "%connect% %villain% came asking soft questions at the gate of %place%, the kind that map a house for a later night."] },
    { id: "trickery", sym: "η", name: "Trickery", act: "complication", gloss: "The villain deceives, to take possession.",
      realize: ["%connect% %villain% came in fair clothing to %place% and asked a boon before he would name it, the oldest snare there is.", "%connect% %villain% put on a kind face and offered %hero% a bargain that had a hook in the soft of it.", "%connect% %villain% smiled the smile that means a clause, and laid a fair-seeming wager on the board."] },
    { id: "complicity", sym: "θ", name: "Complicity", act: "complication", gloss: "The victim submits and unwittingly helps.",
      realize: ["%connect% %hero% granted it before the naming, whatever you ask you shall have, and so gave away %object% and the half of %place% with it.", "%connect% the hero believed the fair face, and helped the trap shut on the hero's own hand.", "%connect% %hero% signed the soft bargain unread, the way a tale needs someone to, and the hook set."] },
    { id: "villainy", sym: "A", name: "Villainy / Lack", act: "complication", gloss: "The villain causes harm, or a lack is felt.",
      realize: ["%connect% the harm was done: %heroine% carried off to %place2%, and the hall sat in the ash of it.", "%connect% there opened in the kingdom a lack: no heir, no water, no %object%; and a lack is a hunger that walks.", "%connect% %villain% took what was wanted and was gone, and the want of it was a wound the whole country felt."],
      invert: ["%connect% the villain did the harm and then felt so badly about it that he wrote a letter of apology, which is not in Propp, and which is exactly what happened.", "%connect% there was no villain at all, only an absence where one ought to be, and the hall had to make do and call the weather the enemy."] },
    { id: "mediation", sym: "B", name: "Mediation", act: "complication", gloss: "The lack is made known; the hero is dispatched.",
      realize: ["%connect% the word came to %hero% by %dispatcher%, and the hero rose: this wrong is mine to mend.", "%connect% %dispatcher% laid the lack before the hall, and every eye turned to %hero%.", "%connect% the trouble was cried through the country, and a crier's news is a finger pointed: go, %hero%."] },
    { id: "counteraction", sym: "C", name: "Beginning counteraction", act: "complication", gloss: "The hero agrees to act.",
      realize: ["%connect% %hero% said, right gladly, I shall go, and meant it more than was wise.", "%connect% the hero took the quest upon the hero's own neck: to win back %object%, to bring home %heroine%.", "%connect% %hero% rose without being asked twice, which is the whole difference between a hero and the rest of the hall."] },
    { id: "departure", sym: "↑", name: "Departure", act: "journey", gloss: "The hero leaves home.",
      realize: ["%connect% %hero% set out from %place% with little but a name and a need, and the road took the rest.", "%connect% the hero rode out toward %place2%, and the hall watched the dust until there was no dust.", "%connect% %hero% turned a back on the warm hall and walked into the cold of the road, which is where tales actually live."] },
    { id: "donor", sym: "D", name: "The donor's test", act: "journey", gloss: "The hero is tested by a donor.",
      realize: ["%connect% on the road stood %donor%, who set the hero a small strange test before any gift was named.", "%connect% %donor% asked of %hero% a courtesy, or a cruelty refused, or a riddle: the toll the road takes.", "%connect% %donor% was hungry, or trapped, or rude, and how %hero% answered that was the whole examination."],
      invert: ["%connect% the donor failed the <em>hero's</em> test, fumbled the riddle, and had to be tutored in donoring before the gift could change hands.", "%connect% %donor% gave the gift straight off with no test at all, out of sheer fondness, which spoiled the structure and pleased everyone."] },
    { id: "reaction", sym: "E", name: "Hero's reaction", act: "journey", gloss: "The hero responds to the donor.",
      realize: ["%connect% %hero% answered as one ought, sparing the small beast, sharing the last bread, keeping the hard word, and so passed.", "%connect% the hero did the kind thing without weighing it, which is the only way the test is ever passed.", "%connect% %hero% gave up the last of the bread to %donor% and went hungry, and that hunger bought the gift."] },
    { id: "receipt", sym: "F", name: "Receipt of the magical agent", act: "journey", gloss: "The hero acquires the magical agent.",
      realize: ["%connect% the gift was given into the hero's hand: %object2%, which would matter exactly once and exactly enough.", "%connect% %donor% gave up %object2%; guard it, the donor said, and use it but the once.", "%connect% into the hero's keeping came %object2%, with the warning that all such gifts carry: it is good for one true need and no idle one."],
      invert: ["%connect% the magical agent turned out to be %object2%, which is the single most useless object in any of the long reels, and the hero was stuck with it.", "%connect% %donor% handed over %object2% with great ceremony and absolutely no instructions, which is how half the trouble in tales begins."] },
    { id: "guidance", sym: "G", name: "Guidance", act: "journey", gloss: "The hero is led to the object of the search.",
      realize: ["%connect% %helper% brought the hero the long way to %place2%, where the trouble kept its house.", "%connect% the road folded, as roads will in such tellings, and %hero% stood at the threshold of %place2% before the hero was ready.", "%connect% a thread, a thrown ball of yarn, a bird going on ahead: by such a guide %hero% came to %place2%."] },
    { id: "struggle", sym: "H", name: "Struggle", act: "ordeal", gloss: "Hero and villain join in direct combat.",
      realize: ["%connect% %hero% and %villain% met at the ford, and there were no more words to spend.", "%connect% %hero% closed with %creature% in %place2%, and the world narrowed to the reach of an arm.", "%connect% it came to the meeting it was always coming to: %hero% against %villain%, and the ground between them going quiet."] },
    { id: "branding", sym: "I", name: "Branding", act: "ordeal", gloss: "The hero is marked.",
      realize: ["%connect% the hero took a mark in it: a nick at the throat, a ring on the hand, a scar that told the rest of the story ever after.", "%connect% %hero% came away marked, and the mark was the true coin of the deed.", "%connect% there was a wound that would not be hidden after: a white seam, a changed eye, the body keeping the tale's account."],
      invert: ["%connect% the hero asked, very reasonably, <em>not</em> to be branded this time, and for once the tale allowed it, and everyone felt the lack of a scar.", "%connect% the mark landed on the wrong person entirely, on a bystander who wore it ever after and dined out on it for years."] },
    { id: "victory", sym: "J", name: "Victory", act: "ordeal", gloss: "The villain is defeated.",
      realize: ["%connect% with %object2% and the one blow it was good for, %hero% had the better of %villain%.", "%connect% the creature went down, or yielded its pledge, and the long fear of %place2% was over.", "%connect% it ended in a breath: %villain% beaten, the field gone still, the thing that could not be done done."] },
    { id: "liquidation", sym: "K", name: "Liquidation of lack", act: "ordeal", gloss: "The initial lack is set right.",
      realize: ["%connect% %heroine% was won back, %object% restored, the hunger of the kingdom fed at last.", "%connect% the lack that had walked the land lay down: water in the well, an heir in the hall, the thing made whole.", "%connect% what had been missing was set back in its place, and the country let out the breath it had held for years."] },
    { id: "return", sym: "↓", name: "Return", act: "homecoming", gloss: "The hero sets out for home.",
      realize: ["%connect% %hero% turned toward %place% and the long road home, which is never the same road.", "%connect% homeward, then; and home is the harder country, as every returning hero learns.", "%connect% %hero% set a face back the way the road had come, carrying what had been won and the new weight of it."] },
    { id: "pursuit", sym: "Pr", name: "Pursuit", act: "homecoming", gloss: "The hero is pursued.",
      realize: ["%connect% behind the hero came %villain%'s kin on the wind, and the chase was on across %place2%.", "%connect% the dark sent something after %hero%: a screaming on the road, a shape that gained.", "%connect% there was a sound behind that was not the wind, and it was keeping pace, and then it was not keeping pace but closing."],
      invert: ["%connect% nobody pursued the hero at all; the road home was insultingly quiet; the hero kept looking over a shoulder at nothing, which Mercury insists is funnier.", "%connect% the pursuit set out keenly and then stopped for lunch, and never quite resumed, and the hero got home unbothered and faintly insulted."] },
    { id: "rescue", sym: "Rs", name: "Rescue", act: "homecoming", gloss: "The hero is rescued from pursuit.",
      realize: ["%connect% %helper% threw the comb that became a forest, the cloth that became a flood, and the chase fell behind.", "%connect% %object2% saved the hero the second time, as gifts in tales are good for twice when they are good at all.", "%connect% at the last reach of the chase a river stood up where no river was, and the far bank was home, and the near bank was the end of the danger."] },
    { id: "unfounded-claims", sym: "L", name: "Unfounded claims", act: "homecoming", gloss: "A false hero claims the hero's prize.",
      realize: ["%connect% while the true %hero% was still on the road, %false% came to %place% with the head, the heart, the token, and the lie that he had done it.", "%connect% %false% stood in the hall and claimed the bride and the praise, having done nothing but arrive first.", "%connect% %false% had the proof in hand, a tongue or a ring or a severed thing, and a good loud story to hang on it, and the hall believed the story."] },
    { id: "difficult-task", sym: "M", name: "Difficult task", act: "recognition", gloss: "A difficult task is set.",
      realize: ["%connect% to sort true from false a task was set: lift the stone, string the bow, name the thing none could name.", "%connect% %elder% set the proof: only the hand that did the deed can do this thing; and the hall held its breath.", "%connect% there was one test left that no liar could pass, and they set it on the table between the claimants."] },
    { id: "solution", sym: "N", name: "Solution", act: "recognition", gloss: "The task is resolved.",
      realize: ["%connect% %hero% did it at the first asking, easily, the way only the true hand can.", "%connect% the bow was strung, the stone was lifted, the name was said, and the false claim went grey in the air.", "%connect% %hero% took up the impossible task like a familiar tool, and it was plainly the right hand on it."] },
    { id: "recognition", sym: "Q", name: "Recognition", act: "recognition", gloss: "The hero is recognised.",
      realize: ["%connect% then they knew the hero: by the mark, by the token, by the very face of the father in the son.", "%connect% %helper% cried out: it is the hero, it was the hero all along, look.", "%connect% an old token came out into the light, a half-ring matched to its half, and the knowing ran round the hall like fire in dry grass."] },
    { id: "exposure", sym: "Ex", name: "Exposure", act: "recognition", gloss: "The false hero is exposed.",
      realize: ["%connect% %false%'s lie came apart in three sentences, as such lies do once the true hand is in the room.", "%connect% the false hero could not do the task, and that was the whole of the exposure.", "%connect% %false% reached for the proof and the proof would not answer to that hand, and the hall turned its face away from him."],
      invert: ["%connect% the false hero, exposed, simply explained the lie so charmingly that the court took <em>his</em> side, and the true hero had to apologise for the awkwardness.", "%connect% %false% confessed at once, unprompted, out of boredom, which robbed the scene of its drama and everyone of their fun."] },
    { id: "transfiguration", sym: "T", name: "Transfiguration", act: "recognition", gloss: "The hero is given a new appearance.",
      realize: ["%connect% the hero was made new: the rags fell, the true name was spoken, and a king stood where a beggar had stood.", "%connect% %hero% put off the old shape and the old name and took up the better ones, earned now.", "%connect% the road's grime washed off %hero% and something kingly stood up underneath it, as if it had been there the whole walk."] },
    { id: "punishment", sym: "U", name: "Punishment", act: "recognition", gloss: "The villain is punished.",
      realize: ["%connect% %villain% paid, by the law or the blade or the long shame, as the tale's country preferred.", "%connect% the wrong-doer got the wage of the wrong, and the hall was glad of it.", "%connect% %villain% was given exactly what %villain% had meant for another, which is the oldest justice and the most satisfying."],
      invert: ["%connect% the villain was not punished at all; was, if anything, given a small pension, for in this country they had read enough endings to find vengeance tedious.", "%connect% the punishment fell, and then was quietly commuted at the wedding, because no one wanted a hanging to spoil the dancing."] },
    { id: "wedding", sym: "W", name: "Wedding", act: "recognition", gloss: "The hero is married and ascends the throne.",
      realize: ["%connect% %hero% wed %heroine%, and %place% kept the feast until the lamps burned low.", "%connect% there was a wedding, and a crowning, and the line went on, which is how the old reels like to close a door.", "%connect% the marriage was made and the kingdom set on %hero%'s shoulders, and the tale shut its book on a full hall."] }
  ];
  var PROPP_BY_ID = {}; PROPP.forEach(function (p) { PROPP_BY_ID[p.id] = p; });

  /* ───────────────────────── TALETYPE FRAMES ─────────────────────────
     A frame is an ordered spine of Propp ids plus a motif-class bias and a
     title pattern. The generator picks a frame (steered by the teller), then
     instantiates and (sometimes) scrambles it. */
  var TALETYPES = [
    { id: "quest", label: "The Quest for the Lost Thing", titles: ["The Winning of %object%", "How %hero% Sought %object%", "%hero% and the Long Road"],
      spine: ["first-function", "villainy", "mediation", "counteraction", "departure", "donor", "reaction", "receipt", "guidance", "struggle", "victory", "liquidation", "return", "wedding"],
      motifBias: { F: 1.6, D: 1.6, H: 1.4, Q: 1.2 } },
    { id: "bride", label: "The Winning of the Otherworld Bride", titles: ["%hero% and %heroine%", "The Bride No Rider Could Catch", "How %heroine% Was Won by Asking"],
      spine: ["first-function", "reconnaissance", "donor", "reaction", "trickery", "complicity", "receipt", "struggle", "victory", "recognition", "wedding"],
      motifBias: { T: 1.8, F: 1.8, H: 1.4, K: 1.2 } },
    { id: "calumny", label: "The Slandered Innocent", titles: ["The Lie at the Gate", "%heroine% and the Six False Witnesses", "The Penance and the Finding"],
      spine: ["first-function", "wedding", "absentation", "unfounded-claims", "branding", "departure", "guidance", "recognition", "exposure", "transfiguration"],
      motifBias: { K: 1.8, Q: 1.6, N: 1.4, S: 1.4 } },
    { id: "beheading", label: "The Exchange of Blows", titles: ["The Bargain of %object%", "One Blow and the Year Between", "The Game at %place%"],
      spine: ["first-function", "trickery", "complicity", "interdiction", "departure", "donor", "reaction", "struggle", "branding", "recognition", "transfiguration"],
      motifBias: { M: 1.8, H: 1.6, Q: 1.4, Z: 1.4 } },
    { id: "descent", label: "The Descent and the Return", titles: ["%hero% in %place2%", "Down Past the Last Door", "The Harp Against the Dark"],
      spine: ["first-function", "absentation", "villainy", "counteraction", "departure", "guidance", "struggle", "liquidation", "return", "pursuit", "rescue", "recognition"],
      motifBias: { F: 2, D: 1.4, T: 1.2, N: 1.4 } },
    { id: "trickster", label: "The Theft by the Clever One", titles: ["How %hero% Stole %object%", "%hero% and the Sky-God's %object%", "The Trick That Made the World"],
      spine: ["first-function", "villainy", "counteraction", "departure", "trickery", "complicity", "receipt", "victory", "return", "transfiguration"],
      motifBias: { K: 2, J: 1.6, A: 1.4, Z: 1.2 } },
    { id: "dragon", label: "The Slaying at the Water", titles: ["%hero% and %creature%", "The Worm of %place%", "Iron Against the Coil"],
      spine: ["first-function", "villainy", "mediation", "counteraction", "departure", "receipt", "struggle", "victory", "branding", "unfounded-claims", "difficult-task", "solution", "exposure", "wedding"],
      motifBias: { S: 1.6, H: 1.4, M: 1.4, Q: 1.4 } },
    { id: "taboo", label: "The Broken Word", titles: ["The Door That Was Forbidden", "%hero% and the One Thing Forbidden", "The Name Not to Be Asked"],
      spine: ["first-function", "wedding", "interdiction", "violation", "absentation", "counteraction", "departure", "donor", "reaction", "guidance", "liquidation", "return"],
      motifBias: { M: 1.6, F: 1.6, T: 1.4, Q: 1.2 } },

    { id: "swanmaiden", label: "The Animal Bride, Lost and Won Back", titles: ["The Bride Who Flew", "%hero% and the Hidden Skin", "How %heroine% Was Won Twice"],
      spine: ["first-function", "reconnaissance", "donor", "reaction", "receipt", "wedding", "interdiction", "violation", "absentation", "counteraction", "departure", "guidance", "liquidation", "return"],
      motifBias: { F: 2, T: 1.8, D: 1.4, M: 1.2 } },
    { id: "ogretasks", label: "The Bride Behind the Tasks", titles: ["%hero% and the Giant's Daughter", "The Tasks Set for %heroine%'s Hand", "The Hard Things Done for Love"],
      spine: ["first-function", "counteraction", "departure", "guidance", "difficult-task", "solution", "struggle", "victory", "liquidation", "wedding"],
      motifBias: { H: 2.2, G: 1.6, T: 1.4, D: 1.2 } },
    { id: "masterflight", label: "The Master-Maid and the Flight", titles: ["The Master-Maid", "%hero% in the House of %creature%", "The Flight, and the Things Cast Behind"],
      spine: ["first-function", "villainy", "departure", "guidance", "difficult-task", "solution", "liquidation", "return", "pursuit", "rescue", "recognition", "wedding"],
      motifBias: { R: 2, G: 1.4, K: 1.4, H: 1.2 } },
    { id: "twobrothers", label: "The True Hero and the False", titles: ["The Two Brothers", "%hero% and the False %false%", "The Deed and the Stolen Boast"],
      spine: ["first-function", "departure", "struggle", "victory", "branding", "liquidation", "unfounded-claims", "return", "difficult-task", "solution", "exposure", "recognition", "wedding"],
      motifBias: { S: 1.4, K: 1.4, Q: 1.4, H: 1.2 } },
    { id: "fateddoom", label: "The Doom Foretold", titles: ["The Doom Foretold", "What %hero% Could Not Outrun", "The Fixed Hour"],
      spine: ["first-function", "interdiction", "departure", "donor", "reaction", "struggle", "branding", "recognition", "transfiguration"],
      motifBias: { M: 2, N: 1.6, Q: 1.4, D: 1.2 } },
    { id: "ashlad", label: "The Unpromising Hero", titles: ["The Ash-Lad", "The Least of the Hall", "How the Youngest Won"],
      spine: ["first-function", "villainy", "mediation", "counteraction", "departure", "donor", "reaction", "receipt", "difficult-task", "solution", "recognition", "transfiguration", "wedding"],
      motifBias: { Z: 1.6, S: 1.4, H: 1.4, Q: 1.2 } },
    { id: "chastitywager", label: "The Wager on the Wife", titles: ["The Wager on %heroine%", "The Lie of the False Token", "How %heroine% Cleared Her Name"],
      spine: ["first-function", "wedding", "trickery", "unfounded-claims", "villainy", "departure", "guidance", "recognition", "exposure", "transfiguration"],
      motifBias: { K: 2, T: 1.6, M: 1.4, Q: 1.2 } },
    { id: "braided", label: "The Braided Tale, in Two Arcs", titles: ["The Braided Tale", "The Two Turnings of %hero%", "%hero%, Twice Over"],
      spine: ["first-function", "villainy", "counteraction", "departure", "struggle", "victory", "liquidation", "trickery", "complicity", "receipt", "struggle", "victory", "recognition", "wedding"],
      motifBias: { M: 1.6, F: 1.4, H: 1.4, T: 1.2, Q: 1.2 } }
  ];

  /* ───────────────────────── MOTIFS ─────────────────────────
     Thompson-style story-atoms, filed by letter-class. Each carries a gloss
     (for the index view) and a realize-template (a flavour-sentence the
     telling can drop in). `cross` lists sister-codes the remixer can riff on. */
  var MOTIF_CLASSES = { A: "Mythological", B: "Animals", D: "Magic", F: "Marvels & the Otherworld", G: "Ogres & monsters", H: "Tests & tasks", J: "The wise & the foolish", K: "Deceptions", M: "Ordaining the future", N: "Chance & fate", Q: "Reward & punishment", R: "Captives & fugitives", S: "Unnatural cruelty", T: "Love & marriage", Z: "Formulas & symbols" };
  var MOTIF_CLASS_ORDER = ["A", "B", "D", "F", "G", "H", "J", "K", "M", "N", "Q", "R", "S", "T", "Z"];

  var MOTIFS = [
    { code: "A1654", cls: "A", name: "Origin of a custom / game first played", theme: ["recognition"], gloss: "The tale ends by naming a real-world thing it claims to have founded — a game, a lay, a livery.", realize: "and that, they say, was the first time ever the thing was done, and it is done so yet.", cross: ["A1450"] },
    { code: "A1450", cls: "A", name: "Origin of the lay — the deed set to the harp", theme: ["recognition"], gloss: "The story closes by claiming itself as the source of a real song or poem.", realize: "and a maker took it up and set it to the harp, and the song you have just had is that song.", cross: ["A1654"] },
    { code: "A186", cls: "A", name: "A demoted god walks as a character", theme: ["setup", "complication"], gloss: "An old divinity, euhemerised, moves through the tale as a mortal king or bride.", realize: "%creature% was older than any god the tale would name, and walked as a %honorific% notwithstanding.", cross: ["F232"] },
    { code: "A511", cls: "A", name: "The culture-hero who shapes the land", theme: ["setup", "recognition"], gloss: "A figure who founds a people, names the rivers, or fixes a custom for all who come after.", realize: "it was %hero% who set the boundary-stones of %place% that stand yet, or so the country swears." },
    { code: "B11", cls: "B", name: "The dragon on the hoard", theme: ["ordeal"], gloss: "A worm or serpent coiled on gold it has guarded an age.", realize: "%creature% lay coiled on the cold gold of %place2%, and had lain so since before the grandfathers." },
    { code: "B211", cls: "B", name: "Speaking animal", theme: ["journey", "complication"], gloss: "A beast counsels, warns, or bargains in human speech.", realize: "and %creature% spoke then, in the plain tongue of the hall, which surprised no one in a tale of that country." },
    { code: "B313", cls: "B", name: "Helpful animal, a gift repaid", theme: ["ordeal", "homecoming"], gloss: "A beast spared early returns at need to repay the kindness.", realize: "the small beast %hero% had spared on the road came back at the worst hour, the debt warm in its mouth." },
    { code: "B335", cls: "B", name: "The helpful beast slain by foolish counsel", theme: ["homecoming"], gloss: "A jealous court persuades the hero to kill the very animal that saved him.", realize: "and they talked %hero% into killing the beast that had thrice saved the hall, which is the saddest line in any reel." },
    { code: "D700", cls: "D", name: "Disenchantment by the right act", theme: ["recognition", "ordeal"], gloss: "A spell breaks at the one correct deed — a kiss, a name spoken, a blow withheld.", realize: "the long enchantment broke at the single right act, the way ice goes at the one warm hour." },
    { code: "D1361.5", cls: "D", name: "Transformation by another's borrowed form", theme: ["complication", "ordeal"], gloss: "One figure wears another's shape so wholly that no one near suspects.", realize: "%villain% laid its own form on %hero% for a term, so that not a soul in %place% knew the change.", cross: ["K1810"] },
    { code: "D1413", cls: "D", name: "The object that will not let go", theme: ["complication", "ordeal"], gloss: "A thing that holds fast whatever touches it, until the right word frees it.", realize: "whatever set a hand to %object% was held to it, and stuck fast, and the line of the stuck grew comic and then long." },
    { code: "D1521", cls: "D", name: "Magic travel — the league-eating boots", theme: ["journey"], gloss: "Boots, a cloak, or a steed that puts impossible distance underfoot.", realize: "%object2% put the leagues under %hero% like water under a leaf, and a month's road was a morning's." },
    { code: "D1652", cls: "D", name: "The inexhaustible (or unfillable) vessel", theme: ["complication", "ordeal"], gloss: "A container that never empties — or, inverted, never fills.", realize: "%object% would not be filled, however they fed it; the more it took, the emptier it stayed.", cross: ["D1472"] },
    { code: "D1810.8", cls: "D", name: "Magic knowledge / a warning in a dream", theme: ["setup", "journey"], gloss: "Foreknowledge arrives in sleep, by oracle, or by a counselling token.", realize: "in sleep the warning came to %hero%, plain and unwelcome, the way true warnings come." },
    { code: "F92", cls: "F", name: "The descent through the cleft", theme: ["journey"], gloss: "The way into the underworld is a crack in the rock, a well, a barrow-mouth.", realize: "the way down was a cleft in the rock, %place2% past the last of the light, and %hero% took it on hands and knees." },
    { code: "F302", cls: "F", name: "The fairy mistress / Otherworld bride", theme: ["complication", "journey"], gloss: "A woman of the Otherworld loves a mortal and crosses over to him.", realize: "%heroine% had loved %hero% before ever they met, and had crossed out of %place2% to find him.", cross: ["F302.1.2"] },
    { code: "F320", cls: "F", name: "Fairies carry mortals off", theme: ["setup", "complication"], gloss: "The Otherworld reaches across a threshold-hour and takes a person away.", realize: "the unseen power took %heroine% across the threshold at the thin hour, and left no print to follow." },
    { code: "F167", cls: "F", name: "The shining beast of the Otherworld", theme: ["setup"], gloss: "An animal of unearthly colour marks the border of the other realm.", realize: "%creature% came out of %place2%, of a colour no waking beast wears, and that was the first sign." },
    { code: "F771", cls: "F", name: "The Otherworld hall", theme: ["journey"], gloss: "A court of the other realm — finer, or stranger, than any in the world.", realize: "%place2% opened into a hall finer than any %honorific%'s, with no door %hero% had seen them pass." },
    { code: "F811", cls: "F", name: "The wonderful tree", theme: ["setup", "journey"], gloss: "A tree that bears out of season, or bears jewels, or marks the world's middle.", realize: "in the middle of %place% stood a tree that bore the wrong fruit in the right season, and everyone pretended not to notice." },
    { code: "F576", cls: "F", name: "Otherworldly speed / cannot be overtaken", theme: ["complication", "journey"], gloss: "A figure moves at a pace no pursuit can match; only asking will halt it.", realize: "the faster they rode after %heroine%, the further she drew; only the right word, gently asked, would halt her." },
    { code: "G512", cls: "G", name: "The ogre / monster slain", theme: ["ordeal"], gloss: "A giant, worm, or demon holding the land in fear is put down.", realize: "%creature% had held %place2% in fear past living memory, and now it would not." },
    { code: "G530", cls: "G", name: "The ogre's helpful kin", theme: ["ordeal", "journey"], gloss: "A daughter, wife, or servant of the monster helps the hero against it.", realize: "%helper%, of the monster's own household, turned and showed %hero% the one way in." },
    { code: "G610", cls: "G", name: "Theft from the ogre", theme: ["ordeal"], gloss: "The hero lifts a treasure from under the very nose of the sleeping monster.", realize: "%hero% lifted %object% from under the very breath of %creature%, and was three fields off before the snoring broke." },
    { code: "H1556", cls: "H", name: "Test of fidelity", theme: ["journey", "ordeal"], gloss: "Faithfulness is tried — in a bed, in a bargain, in a long absence.", realize: "for a whole term %hero% was tried in faith, and turned away nightly, and said no word of it.", cross: ["T338"] },
    { code: "H335", cls: "H", name: "Tasks set for the suitor", theme: ["complication", "journey"], gloss: "A bride's keeper sets impossible labours before the wedding.", realize: "%elder% set %hero% a string of impossible labours for %heroine%'s hand, meaning each to be the last." },
    { code: "H331", cls: "H", name: "The suitor contest — race, leap, or vigil", theme: ["complication"], gloss: "The bride goes to whoever can outrun, outleap, or outlast the field.", realize: "the hand of %heroine% was set as the prize of a contest, to the one who could outlast all the rest at it." },
    { code: "H561", cls: "H", name: "The riddle solved", theme: ["ordeal", "recognition"], gloss: "A clever answer turns a trap, a sphinx, or a doom aside.", realize: "the riddle had killed the others; %hero% turned it over once and gave it back its own answer." },
    { code: "H1023", cls: "H", name: "The impossible task — emptying the sea, counting the stars", theme: ["journey", "ordeal"], gloss: "A labour set to be unperformable, performed anyway by gift or guile.", realize: "they set %hero% to empty the sea with a holed spoon, and somehow, by the gift, the spoon held." },
    { code: "J1115", cls: "J", name: "The clever one outwits the strong", theme: ["ordeal"], gloss: "Wit beats force; the small or weak undoes the great.", realize: "%hero% had no strength to match %villain%, and so used the better tool, which is the head." },
    { code: "J1661", cls: "J", name: "Cunning deduction from small signs", theme: ["journey", "recognition"], gloss: "The hero reads a whole truth from a hair, a track, a crumb.", realize: "from a hair on the cup and a track at the sill %hero% read the whole of it, and named the thief before the soup was cold." },
    { code: "J2415", cls: "J", name: "The foolish imitation of the lucky one", theme: ["homecoming"], gloss: "A neighbour copies the hero's luck step for step and reaps the opposite.", realize: "the greedy neighbour did each thing %hero% had done, exactly, and got the exact reverse for the trouble." },
    { code: "K1810", cls: "K", name: "Deception by disguise", theme: ["journey", "ordeal", "homecoming"], gloss: "The hero or villain passes hidden in borrowed or beggar's clothing.", realize: "%hero% came into %place% in beggar's rags at the hour of most wine and least suspicion.", cross: ["K1812", "D1361.5"] },
    { code: "K500", cls: "K", name: "Death escaped by a trick of words", theme: ["ordeal", "recognition"], gloss: "A clause, a quibble, or a legal nicety turns the killing aside.", realize: "it is no fit death, %villain% pleaded, to be killed so; and on that nicety was let go under pledge." },
    { code: "K341", cls: "K", name: "Attention diverted while the theft is made", theme: ["complication", "ordeal"], gloss: "A distraction — a dropped coin, a loosed beast — covers the real move.", realize: "while every eye chased the loosed beast across the yard, the true thing went quietly out the other door." },
    { code: "K1911", cls: "K", name: "The false bride substituted at the gate", theme: ["homecoming", "recognition"], gloss: "Another woman is swapped for the true bride at the threshold of the wedding.", realize: "%false% set another in %heroine%'s place at the very gate, and the swap near held until a small true voice named it." },
    { code: "K2110", cls: "K", name: "The slander of the innocent", theme: ["complication", "homecoming"], gloss: "Coordinated false witness destroys a blameless figure.", realize: "%false% and the others had their story straight: six mouths against one, and the one could not be heard." },
    { code: "K1610", cls: "K", name: "The deceiver falls into his own trap", theme: ["ordeal", "recognition"], gloss: "The trickster is undone by the very snare he laid.", realize: "the snare %villain% set caught %villain%, by the foot, and the hall laughed before it judged." },
    { code: "M223", cls: "M", name: "The rash promise / the blank boon", theme: ["complication"], gloss: "A boon is granted before it is named, and the naming binds.", realize: "%hero% granted the boon unasked-what, and %villain% named it after: the bride, the hall, the half of all.", cross: ["M201"] },
    { code: "M201", cls: "M", name: "The pledge held on honour", theme: ["complication", "recognition"], gloss: "A sworn word is kept though it costs more than it is worth.", realize: "the word once given was a chain, and %hero% wore it though it galled, because a word is a deed not yet done." },
    { code: "M242", cls: "M", name: "The year-and-a-day bargain", theme: ["setup", "complication"], gloss: "A meeting, a debt, or a doom is set at a fixed future term.", realize: "%term% from that night, they swore, at this same place; and time keeps such appointments whether men will or no." },
    { code: "M341", cls: "M", name: "The doom foretold at the cradle", theme: ["setup"], gloss: "A prophecy fixes the hero's fate to a set time or a set agent.", realize: "it was foretold over the cradle that %hero% would meet a fixed doom at a fixed hour, and the hall spent years dodging the clock." },
    { code: "M211", cls: "M", name: "The bargain with the dark power", theme: ["complication"], gloss: "A pact struck with the thing in the dark, payable in the one coin you meant to keep.", realize: "%hero% struck a bargain with the thing in %place2%, the kind that is always paid in the one coin you swore to keep." },
    { code: "N777", cls: "N", name: "The hunt that leads to the adventure", theme: ["setup", "journey"], gloss: "A chase after beast or bird carries the hero across the threshold of the tale.", realize: "it was a hunt that began it: a beast that ran wrong, into %place2%, and %hero% after it alone." },
    { code: "N886", cls: "N", name: "Recognition by resemblance", theme: ["recognition"], gloss: "A face, a likeness to the father, betrays the hidden hero.", realize: "%helper% looked at the child and saw the father's face on it, and the truth fell out of the looking." },
    { code: "N271", cls: "N", name: "The murder will out — the telltale token", theme: ["recognition"], gloss: "A bone, a ring, a singing harp betrays a hidden crime.", realize: "the buried thing would not stay buried: a bone, a ring, a harp that sang the deed, and the hall went cold to hear it." },
    { code: "N825", cls: "N", name: "The old helper at the road's edge", theme: ["journey"], gloss: "A crone, a hermit, an old smith gives the hero the one needful thing.", realize: "at the road's edge sat an old one who had been waiting, it seemed, only for %hero%, and gave the one needful word." },
    { code: "Q40", cls: "Q", name: "The reward refused", theme: ["recognition"], gloss: "The doer of the great deed takes none of the offered pay.", realize: "offered the best of %place% for it, %hero% would take nothing; the deed, %hero% said, was the wage." },
    { code: "Q2", cls: "Q", name: "Kind and unkind — courtesy repaid in kind", theme: ["journey", "recognition"], gloss: "The courteous are rewarded and the rude served exactly as they served.", realize: "the courteous hand drew gold from the well and the grasping hand drew toads, which is the whole moral economy of the thing." },
    { code: "Q211", cls: "Q", name: "The death-debt — a life for a life", theme: ["ordeal", "recognition"], gloss: "A death must be answered by a death, or bought off by a greater gift.", realize: "the blood asked blood, by the old reckoning, until a greater gift was set on the scale to outweigh it." },
    { code: "Q450", cls: "Q", name: "The cruel punishment — or its pointed absence", theme: ["recognition"], gloss: "The villain is broken on the wheel of the ending; or, tellingly, is not.", realize: "and here the country's grammar showed: the wrong was paid in full coin, or not paid at all, and the not-paying said the more." },
    { code: "R11", cls: "R", name: "The carrying-off", theme: ["setup", "complication"], gloss: "Maiden, child, or treasure is abducted into the far place.", realize: "%villain% bore %heroine% off to %place2%, past the last road, where rescue would have to come on foot." },
    { code: "R111", cls: "R", name: "The rescue of the captive", theme: ["ordeal", "homecoming"], gloss: "The hero brings the taken one back out of the far place.", realize: "%hero% brought %heroine% up out of %place2% by the hand, into a light that hurt them both, and did not let go." },
    { code: "R181", cls: "R", name: "The captor bound by its own word", theme: ["ordeal", "recognition"], gloss: "The taker is held to an oath it swore, and must open the door it kept.", realize: "%hero% bound the captor with the captor's own oath, and the thing that kept the door was made to open it." },
    { code: "R215", cls: "R", name: "The flight and the obstacle-cast", theme: ["homecoming"], gloss: "Fugitives throw down objects that become forest, flood, and fire behind them.", realize: "behind them %helper% cast the comb and the cloth, and a forest stood up, and a river ran, between them and the chase." },
    { code: "S11", cls: "S", name: "The cruel parent / kin", theme: ["setup", "complication"], gloss: "A father, stepmother, or uncle works the harm from inside the family.", realize: "the harm wore a kinsman's face: %villain%, of %hero%'s own blood, which is the worst door for harm to come in by." },
    { code: "S31", cls: "S", name: "The cruel stepmother", theme: ["setup", "complication"], gloss: "The second wife turns the household against the first wife's child.", realize: "the new wife in %place% could not abide the first child, and set about the slow cruelty that opens so many tales." },
    { code: "S262", cls: "S", name: "The sacrifice demanded — a life owed to the water", theme: ["complication", "ordeal"], gloss: "A town must yield a victim to a monster or a flood, by lot, each year.", realize: "%place% owed a life to the water each year, by the drawing of lots, and this year the lot fell where it always falls in tales." },
    { code: "S268", cls: "S", name: "The child promised away", theme: ["setup"], gloss: "An heir is pledged, unknowing, to a power that comes to collect.", realize: "%elder% had promised the first thing to meet him home, not knowing it would be %heroine%, and the debt came due." },
    { code: "T11", cls: "T", name: "Love before the meeting", theme: ["setup", "complication"], gloss: "The hero loves at a name, a portrait, a rumour — before ever a meeting.", realize: "%hero% loved %heroine% at the bare report of her, and would have no other, having seen none." },
    { code: "T68", cls: "T", name: "The princess offered as the prize of the deed", theme: ["complication", "recognition"], gloss: "A ruler sets a daughter and half a kingdom on whoever does the impossible thing.", realize: "%elder% set %heroine% and the half of %place% as the wage of the deed, never thinking the deed would be done." },
    { code: "T96", cls: "T", name: "Lovers reunited after the long trial", theme: ["recognition"], gloss: "After exile, penance, or enchantment, the parted lovers come together.", realize: "after all the long trial of it %hero% and %heroine% stood in one room again, older, and said almost nothing." },
    { code: "T338", cls: "T", name: "The chaste temptation refused", theme: ["journey", "ordeal"], gloss: "Tempted with licence and no witness, the hero keeps faith anyway.", realize: "the night, the leave, and no eye to see, and still %hero% turned to the wall and kept the bond.", cross: ["H1556"] },
    { code: "T211", cls: "T", name: "Faith kept against the false charge", theme: ["homecoming"], gloss: "A spouse refuses to set the slandered partner aside.", realize: "there are children to her, %hero% said, and I will not put her away, against the whole hall's verdict." },
    { code: "Z65", cls: "Z", name: "Colour-grammar of the Otherworld", theme: ["setup", "journey"], gloss: "A fixed palette — white-and-red, or green, or snow — marks the other realm.", realize: "all that came out of %place2% wore the one colour, white-and-red, or green, or snow, so you knew it for what it was." },
    { code: "Z71.1", cls: "Z", name: "The formulistic three", theme: ["setup", "complication", "ordeal"], gloss: "Three days, three tasks, three blows: the tale counts in threes.", realize: "three days she rode past, three tasks were set, three blows were struck, for the tale could not count otherwise." },
    { code: "Z254", cls: "Z", name: "The unpromising hero — the ash-lad who wins", theme: ["setup"], gloss: "The least-regarded of the house turns out to be the one the tale chose.", realize: "the least-likely of the hall, the one who sat by the ashes, was the one the tale had meant all along." },
    { code: "Z356", cls: "Z", name: "The sole survivor", theme: ["homecoming"], gloss: "One alone comes back to tell it, which is why there is a tale at all.", realize: "one alone came back out of it to tell the thing, which is the only reason you have it to hear." },
    { code: "Z71.6", cls: "Z", name: "The year and a day, as the pulse of plot", theme: ["setup", "complication", "homecoming"], gloss: "The year-and-a-day measure beats out the structure of the whole.", realize: "%term% to bind it, %term% to suffer it, %term% to mend it: the tale ran on that one measure like a heart." }
  ];
  var MOTIF_BY_CODE = {}; MOTIFS.forEach(function (m) { MOTIF_BY_CODE[m.code] = m; });

  /* ───────────────────────── FILLERS ─────────────────────────
     Loose stock the generator dips into when a frame needs an object, a term,
     a quest-phrase, a number, or an absurd substitution for the remix. */
  var FILL = {
    term: ["a year and a day", "a year from that night", "seven years", "thrice three nights", "a twelvemonth", "the turning of one whole year", "nine nights and a morning", "three winters", "a day and a year"],
    number: ["three", "seven", "nine", "twelve", "a hundred", "two", "forty"],
    quest: ["the lost crown", "the water that would not come", "the stolen light", "the name no one would say", "the heir taken in the night", "the bride past the last door", "the sword broken at the hilt", "the well that had gone bitter", "the song the dead king left unfinished", "the debt no coin could clear", "the door that opened only inward"],
    // absurd objects the remixer swaps in "for laughs" — tagged so the spec can flag the joke
    absurdObject: ["a magic spoon that stirred only widdershins", "an enchanted ledger that balanced itself and gloated", "a self-important teapot", "a sock that granted one wish, badly", "a turnip of prophecy", "a very small and bureaucratic door", "a cheese that remembered everything", "an umbrella that worked only indoors", "a comb that combed only other people's hair", "a lantern that shone exclusively on things you'd rather not see", "a flute that could play but the one tune, and that one flat", "a perfectly ordinary brick the donor was weirdly attached to", "a map of a country that no longer agreed to exist", "a key that fit every lock and turned in none"],
    absurdCreature: ["a dragon that hoarded overdue library books", "a sphinx that had run out of riddles and now just sighed at you", "a giant exclusively afraid of teaspoons", "a were-accountant", "a ghost who haunted the wrong house out of politeness", "a sea-serpent on a strict diet of rumours", "a troll who took bridge-tolls in compliments", "a basilisk that had been told to mind its manners and now stared only at the floor", "a wolf in a cardigan, pretending hard to be a grandmother and a librarian at once", "a minor demon contractually obliged to grant favours and visibly resentful of it", "an ogre who had given up eating travellers for the sake of his joints"],
    connectorTime: ["that winter", "by midsummer", "before the snow", "at the thin of the year", "on the eve of the feast", "when the moon was old", "at cock-crow", "the next May Eve", "deep in the dark of the year"],
    // soft lead-ins the transition layer hangs a stray motif-flavour line on, so it doesn't
    // jar; each ends with a colon or dash so a capitalised sentence can follow it cleanly
    motifLead: ["And they tell, too:", "It is said, also:", "And mark this:", "Men say:", "And in that country:", "Now the tale keeps such things:", "Now here is a thing the old reels hold:", "And it was ever so:", "And folk add:"]
  };

  B.lex = {
    CULTURES: CULTURES,
    ROLES: ROLES,
    PROPP: PROPP, PROPP_BY_ID: PROPP_BY_ID,
    TALETYPES: TALETYPES,
    MOTIFS: MOTIFS, MOTIF_BY_CODE: MOTIF_BY_CODE,
    MOTIF_CLASSES: MOTIF_CLASSES, MOTIF_CLASS_ORDER: MOTIF_CLASS_ORDER,
    FILL: FILL
  };
})();
