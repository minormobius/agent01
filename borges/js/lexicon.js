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
      realize: ["%connect% %hero% granted it before the naming, whatever you ask you shall have, and so gave away %object% and the half of %place% with it.", "%connect% %hero% believed the fair face, and helped the trap close.", "%connect% %hero% signed the soft bargain unread, the way a tale needs someone to, and the hook set."] },
    { id: "villainy", sym: "A", name: "Villainy / Lack", act: "complication", gloss: "The villain causes harm, or a lack is felt.",
      realize: ["%connect% the harm was done: %heroine% carried off to %place2%, and the hall sat in the ash of it.", "%connect% there opened in the kingdom a lack: no heir, no water, no %object%; and a lack is a hunger that walks.", "%connect% %villain% took what was wanted and was gone, and the want of it was a wound the whole country felt."],
      invert: ["%connect% the villain did the harm and then felt so badly about it that he wrote a letter of apology, which is not in Propp, and which is exactly what happened.", "%connect% there was no villain at all, only an absence where one ought to be, and the hall had to make do and call the weather the enemy."] },
    { id: "mediation", sym: "B", name: "Mediation", act: "complication", gloss: "The lack is made known; the hero is dispatched.",
      realize: ["%connect% the word came to %hero% by %dispatcher%, and was taken up that hour: this wrong is mine to mend.", "%connect% %dispatcher% laid the lack before the hall, and every eye turned to %hero%.", "%connect% the trouble was cried through the country, and a crier's news is a finger pointed: go, %hero%."] },
    { id: "counteraction", sym: "C", name: "Beginning counteraction", act: "complication", gloss: "The hero agrees to act.",
      realize: ["%connect% %hero% said, right gladly, I shall go, and meant it more than was wise.", "%connect% %hero% took the quest up: to win back %object%, and to bring home %heroine%.", "%connect% %hero% rose without being asked twice, which is the whole difference between a hero and the rest of the hall."] },
    { id: "departure", sym: "↑", name: "Departure", act: "journey", gloss: "The hero leaves home.",
      realize: ["%connect% %hero% set out from %place% with little but a name and a need, and the road took the rest.", "%connect% %hero% rode out toward %place2%, and the hall watched the dust until there was no dust.", "%connect% %hero% turned a back on the warm hall and walked into the cold of the road, which is where tales actually live."] },
    { id: "donor", sym: "D", name: "The donor's test", act: "journey", gloss: "The hero is tested by a donor.",
      realize: ["%connect% on the road stood %donor%, who set the hero a small strange test before any gift was named.", "%connect% %donor% asked of %hero% a courtesy, or a cruelty refused, or a riddle: the toll the road takes.", "%connect% %donor% was hungry, or trapped, or rude, and how %hero% answered that was the whole examination."],
      invert: ["%connect% the donor failed the <em>hero's</em> test, fumbled the riddle, and had to be tutored in donoring before the gift could change hands.", "%connect% %donor% gave the gift straight off with no test at all, out of sheer fondness, which spoiled the structure and pleased everyone."] },
    { id: "reaction", sym: "E", name: "Hero's reaction", act: "journey", gloss: "The hero responds to the donor.",
      realize: ["%connect% %hero% answered as one ought, sparing the small beast, sharing the last bread, keeping the hard word, and so passed.", "%connect% %hero% did the kind thing without weighing it, which is the only way the test is ever passed.", "%connect% %hero% gave up the last of the bread to %donor% and went hungry, and that hunger bought the gift."] },
    { id: "receipt", sym: "F", name: "Receipt of the magical agent", act: "journey", gloss: "The hero acquires the magical agent.",
      realize: ["%connect% the gift was given into the hero's hand: %object2%, which would matter exactly once and exactly enough.", "%connect% %donor% gave up %object2%; guard it, the donor said, and use it but the once.", "%connect% into the hero's keeping came %object2%, with the warning that all such gifts carry: it is good for one true need and no idle one."],
      invert: ["%connect% the magical agent turned out to be %object2%, which is the single most useless object in any of the long reels, and the hero was stuck with it.", "%connect% %donor% handed over %object2% with great ceremony and absolutely no instructions, which is how half the trouble in tales begins."] },
    { id: "guidance", sym: "G", name: "Guidance", act: "journey", gloss: "The hero is led to the object of the search.",
      realize: ["%connect% %helper% brought the hero the long way to %place2%, where the trouble kept its house.", "%connect% the road folded, as roads will in such tellings, and %hero% stood at the threshold of %place2% before the hero was ready.", "%connect% a thread, a thrown ball of yarn, a bird going on ahead: by such a guide %hero% came to %place2%."] },
    { id: "struggle", sym: "H", name: "Struggle", act: "ordeal", gloss: "Hero and villain join in direct combat.",
      realize: ["%connect% %hero% and %villain% met at the ford, and there were no more words to spend.", "%connect% %hero% closed with %creature% in %place2%, and the world narrowed to the reach of an arm.", "%connect% it came to the meeting it was always coming to: %hero% against %villain%, and the ground between them going quiet."] },
    { id: "branding", sym: "I", name: "Branding", act: "ordeal", gloss: "The hero is marked.",
      realize: ["%connect% %hero% took a mark in it: a nick at the throat, a ring on the hand, a scar that told the rest of the story ever after.", "%connect% %hero% came away marked, and the mark was the true coin of the deed.", "%connect% there was a wound that would not be hidden after: a white seam, a changed eye, the body keeping the tale's account."],
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
      realize: ["%connect% then they knew %hero%: by the mark, by the token, by the very face of the father in the son.", "%connect% %helper% cried out: it is the hero, it was the hero all along, look.", "%connect% an old token came out into the light, a half-ring matched to its half, and the knowing ran round the hall like fire in dry grass."] },
    { id: "exposure", sym: "Ex", name: "Exposure", act: "recognition", gloss: "The false hero is exposed.",
      realize: ["%connect% %false%'s lie came apart in three sentences, as such lies do once the true hand is in the room.", "%connect% the false hero could not do the task, and that was the whole of the exposure.", "%connect% %false% reached for the proof and the proof would not answer to that hand, and the hall turned its face away from him."],
      invert: ["%connect% the false hero, exposed, simply explained the lie so charmingly that the court took <em>his</em> side, and the true hero had to apologise for the awkwardness.", "%connect% %false% confessed at once, unprompted, out of boredom, which robbed the scene of its drama and everyone of their fun."] },
    { id: "transfiguration", sym: "T", name: "Transfiguration", act: "recognition", gloss: "The hero is given a new appearance.",
      realize: ["%connect% %hero% was made new: the rags fell, the true name was spoken, and a king stood where a beggar had stood.", "%connect% %hero% put off the old shape and the old name and took up the better ones, earned now.", "%connect% the road's grime washed off %hero% and something kingly stood up underneath it, as if it had been there the whole walk."] },
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
      spine: ["first-function", "interdiction", "departure", "donor", "reaction", "struggle", "branding", "recognition"],
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
  var MOTIF_CLASSES = { A: "Mythological", B: "Animals", C: "Tabu", D: "Magic", E: "The dead", F: "Marvels & the Otherworld", G: "Ogres & monsters", H: "Tests & tasks", J: "The wise & the foolish", K: "Deceptions", L: "Reversals of fortune", M: "Ordaining the future", N: "Chance & fate", P: "Society & the hall", Q: "Reward & punishment", R: "Captives & fugitives", S: "Unnatural cruelty", T: "Love & marriage", V: "The sacred", W: "Traits of character", X: "Humour", Z: "Formulas & symbols" };
  var MOTIF_CLASS_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "X", "Z"];

  /* ── MOTIF_BEATS: plant-and-payoff pairs, keyed by motif code. A motif here is
     not a sticker but a thread — its `plant` lands in an early movement and its
     `pay` calls back in a later one, the way a real folktale motif recurs. The
     generator picks an early movement for the plant and a later one for the pay;
     where there's no room it falls back to the motif's single `realize`. */
  var MOTIF_BEATS = {
    D1652: { plant: "%object% was a small thing, but it would not be filled, however they fed it", pay: "and into that same unfillable %object% the trouble went at the last, head over heel, and the strings drew tight" },
    D1413: { plant: "whatever set a hand to %object% was held fast to it, and could not let go", pay: "and so the stuck line grew long and comic, and the one at the end of it could not pull free" },
    M223: { plant: "%hero% granted the boon before it was named: whatever you ask, you shall have", pay: "and the naming, when it came, carried off the bride and the half of the hall in one breath" },
    M242: { plant: "%term% from that night, they swore, at this same place", pay: "and the term came round to the very night, and the appointment kept itself, as such appointments do" },
    M341: { plant: "it was foretold over the cradle that %hero% would meet a fixed doom at a fixed hour", pay: "and the fixed hour came, and the doom with it, no finger's width turned aside for all the years of dodging" },
    H1556: { plant: "the test was set on %hero%: a whole term to keep faith, and no eye to keep the score", pay: "and the term ran out with the faith unbroken, every night of it turned to the wall" },
    T11: { plant: "%hero% loved %heroine% at the bare report of her, having seen no face", pay: "and when at the last they stood in one room, it was as though the report had been a memory" },
    T338: { plant: "the night was given, and the leave, and no watcher set on the door", pay: "and still, each night of the term, %hero% turned to the wall and said no word" },
    B313: { plant: "on the road %hero% spared a small beast that any other hand would have killed", pay: "and at the worst hour the spared beast came back, the debt warm in its mouth" },
    D700: { plant: "the enchantment was laid deep, and only the one right act would ever lift it", pay: "and the one right act was done at the last, and the long spell went the way ice goes at noon" },
    N886: { plant: "the child was got away unmarked, save the father's face it wore", pay: "and years on that same face gave the truth away, the father plain in the son" },
    R215: { plant: "%helper% pressed a comb and a cloth into %hero%'s hand, for the running that would come", pay: "and the comb thrown down stood up a forest, the cloth a flood, and the chase fell away behind" },
    K1810: { plant: "%hero% put off the known shape and went in beggar's rags", pay: "and so, unmarked at the high table, %hero% stood where the true face would have been seized at the door" },
    S268: { plant: "%elder% promised the first thing to meet him home, not knowing what it would be", pay: "and the debt came to collect at its own hour, as rash-promised debts always do" },
    R181: { plant: "the captor had sworn a great oath to keep the door it kept", pay: "and by that same oath %hero% bound it, and the door it swore to keep, it was made to open" },
    F576: { plant: "%heroine% rode past at a pace no pursuit could match, the faster chased the further gone", pay: "and only the right word, gently asked, halted her where all the hard chasing had failed" },
    C611: { plant: "one door in %place% was set never to be opened, and a single shut door in a tale is a promise", pay: "and the door was opened, naturally, and what had been behind it was loose in the world" },
    E310: { plant: "%hero% spent the last coin to bury a corpse the town had left unburied in the road", pay: "and the buried stranger's thanks walked back as a helper, asking half of all and meaning to keep none" },
    E761: { plant: "%hero% left a bright blade standing in the tree: while it shone, %hero% lived", pay: "and far off the blade went red and dripped, and the hall knew the worst before the rider came" },
    G512: { plant: "%creature% had held %place2% in fear past the reach of living memory", pay: "and now it would not, for %hero% had done at the water the thing none could do" },
    H561: { plant: "the riddle stood at the gate of %place2%, and it had killed every traveller who guessed", pay: "and %hero% turned it over once and gave it back its own answer, and the gate stood open" },
    "D1810.8": { plant: "in sleep the warning came to %hero%, plain and unwelcome, and was not believed", pay: "and the warning came true to the letter, the way unbelieved warnings do" },
    N271: { plant: "the deed was buried deep in %place%, and the doers thought it buried for good", pay: "but a bone, a ring, a harp that would sing only the one tune brought it up into the light" },
    Q211: { plant: "a death lay unpaid in the account of %place%, an old blood owed", pay: "and the blood was answered at the last, life for life, by the old reckoning" },
    L410: { plant: "%villain% sat the highest seat in %place% and meant to sit it for ever", pay: "and %villain% was set lowest at the end, and learned on the cold floor what the high seat never taught" },
    C961: { plant: "the one forbidden thing was named to %hero%, and the price of it set: not death, but a shape", pay: "and the price was paid in full, and %hero% wore a beast's shape after, until the one right act" },
    F211: { plant: "there was a door in the hill of %place2% that opened but the once a year", pay: "and %hero% went in by it at the thin hour, and the hill closed over the going" },
    E422: { plant: "a wrong went unredressed in %place%, and the wronged one was buried with it unspoken", pay: "and the dead would not stay down, but walked, until at the last the wrong was mended" },
    D2011: { plant: "a sleep fell on %place%, the deep unnatural kind, and the briars climbed up over the gate", pay: "and at the hundredth year came the one who could pass the briars, and the sleep lifted like a fog at noon" },
    D672: { plant: "%hero% and %villain% closed not with blades but with shapes: hawk after dove, pike after otter", pay: "and it ended where such chases end, in the one shape the other had no shape to answer" },
    H512: { plant: "the fierce small helper would take the child unless its name were guessed in three nights", pay: "and the name was guessed at the third asking, and the named thing tore itself in two for rage" },
    K1011: { plant: "%creature% kept the door of %place2% with its one eye, and ate the guests who could not flatter it", pay: "and %hero% put the one eye out in the dark, and went free under the warm bellies of the rams" },
    K2210: { plant: "%hero% set out carrying a sealed letter, trusting the hand that sealed it", pay: "and the letter, read out at the road's end, had asked in plain words for the bearer's death" },
    F601: { plant: "%hero% gathered the gifted on the road, each with one impossible skill, none knowing yet which would be wanted", pay: "and at the crux each skill was wanted exactly once, in the very order they had been found" },
    Q115: { plant: "three wishes were given into %hero%'s keeping, to be spent with care", pay: "and two were spent undoing the first, which is the whole and only history of wishes" }
  };

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
    { code: "Z71.6", cls: "Z", name: "The year and a day, as the pulse of plot", theme: ["setup", "complication", "homecoming"], gloss: "The year-and-a-day measure beats out the structure of the whole.", realize: "%term% to bind it, %term% to suffer it, %term% to mend it: the tale ran on that one measure like a heart." },

    // — B · more animals —
    { code: "B16", cls: "B", name: "The devouring beast tamed by music", theme: ["ordeal", "journey"], gloss: "A monster that no blade can master is quieted by a tune.", realize: "%hero% had no blade that would bite %creature%, only a tune, and the tune was enough." },
    // — C · Tabu —
    { code: "C611", cls: "C", name: "The forbidden chamber", theme: ["setup", "complication"], gloss: "One door, one box, one room is forbidden — and a single shut door in a tale is a promise it will open.", realize: "one door in %place% was never to be opened, and you know already that it was." },
    { code: "C31", cls: "C", name: "Tabu: offending the supernatural spouse", theme: ["complication"], gloss: "The Otherworld bride sets one small absolute rule; breaking it loses her.", realize: "the rule the bride laid was small and absolute, and the breaking of it would cost her wholly." },
    { code: "C752", cls: "C", name: "Tabu: the thing not to be done after dark", theme: ["setup"], gloss: "A prohibition bound to the hour — permitted by day, fatal by night.", realize: "by daylight all was allowed; the one forbidden thing belonged to the dark hours, and so of course it happened then." },
    // — E · The dead —
    { code: "E310", cls: "E", name: "The grateful dead", theme: ["journey"], gloss: "The hero pays for a stranger's burial and gains a helper who is the dead man's thanks.", realize: "%hero% paid to bury a stranger no one else would bury, and bought thereby a debt that would walk back as a friend." },
    { code: "E422", cls: "E", name: "The restless revenant", theme: ["ordeal", "homecoming"], gloss: "The dead will not lie still until the wrong that holds them is set right.", realize: "the dead would not stay down in %place2%, but walked, and would walk, until the old wrong was mended." },
    { code: "E761", cls: "E", name: "The life-token", theme: ["journey", "recognition"], gloss: "An object (a blade, a tree, a spring) mirrors the distant hero's life and betrays his death.", realize: "%hero% left a token behind that would show the truth: while it stayed bright, %hero% lived." },
    { code: "E1", cls: "E", name: "The slain raised whole", theme: ["ordeal"], gloss: "The dead are restored from a cauldron or a spring, minus only some one thing.", realize: "the slain were set whole again into the world, lacking only the power of speech, which is a great deal to lack." },
    // — L · Reversals of fortune —
    { code: "L10", cls: "L", name: "The despised youngest", theme: ["setup"], gloss: "The least-regarded child carries the tale's whole favour.", realize: "the youngest got the ash-corner and the laughter, and the tale's whole favour besides." },
    { code: "L161", cls: "L", name: "The lowly raised to the throne", theme: ["recognition"], gloss: "The swineherd, the ash-lad, the beggar at the gate is crowned.", realize: "the one who had begged at the gate was crowned within the year, and the gate-keepers told it ever after." },
    { code: "L410", cls: "L", name: "The proud brought low", theme: ["recognition", "homecoming"], gloss: "The one who sat highest is set lowest, and learns it on the cold floor.", realize: "the one who had sat highest was set lowest, and learned on the cold floor the lesson the high seat never taught." },
    { code: "L111", cls: "L", name: "The foundling of unknown birth", theme: ["setup"], gloss: "A child is found, not born to the hall, its blood not yet known.", realize: "the child was found and not born to the hall, and whose blood it carried no one yet knew." },
    // — V · The sacred —
    { code: "V11", cls: "V", name: "The offering owed to the old powers", theme: ["complication", "ordeal"], gloss: "The old powers are owed a thing and will have it, gently asked or not.", realize: "the old powers were owed their due, and would have it, asked gently or taken hard." },
    { code: "V229", cls: "V", name: "The holy fool's true sight", theme: ["journey", "recognition"], gloss: "The one the hall counts simple sees the single true thing the wise walked past.", realize: "the one the hall held simple saw the one true thing that all the wise had walked straight past." },
    { code: "V67", cls: "V", name: "The hallowed ground / sanctuary", theme: ["homecoming"], gloss: "Within a marked ring no hand may touch the hero, by a law older than the hall.", realize: "within the marked ring no hand could fall on %hero%, by a law older than the hall and stronger than the king's." },
    // — W · Traits of character —
    { code: "W11", cls: "W", name: "Generosity, and its return", theme: ["journey", "recognition"], gloss: "The hero gives where there is no gain in giving, and the giving returns tenfold.", realize: "%hero% gave where there was nothing to be got by giving, and the giving came back tenfold, as it does in tales." },
    { code: "W154", cls: "W", name: "Ingratitude repaid", theme: ["recognition"], gloss: "The one the hero saved forgets it the moment the danger is past — and is paid for forgetting.", realize: "the one %hero% had saved forgot it the moment the danger passed, and was paid in the end for the forgetting." },
    { code: "W181", cls: "W", name: "Jealousy, the slow poison", theme: ["complication"], gloss: "Not hate but jealousy begins the harm — hate that calls itself love.", realize: "it was not hate that began the harm but jealousy, which is only hate that has learned to call itself love." },
    { code: "W34", cls: "W", name: "Loyalty held past reason", theme: ["ordeal", "homecoming"], gloss: "A helper holds to the hero past sense and past safety.", realize: "%helper% held to %hero% past sense and past safety, for loyalty was never any good at sums." },
    // — X · Humour —
    { code: "X905", cls: "X", name: "The tall tale, sworn true", theme: ["recognition"], gloss: "The teller swears every word true — the surest sign it is not.", realize: "and the teller swore every word of it for truth, which is the surest sign in the world that a tale is none." },
    { code: "X1", cls: "X", name: "The biter bit", theme: ["ordeal", "recognition"], gloss: "The joke the villain set comes back on the villain — the only justice the funny tales allow.", realize: "the joke %villain% had set sprang back on %villain%, which is the whole of the justice the funny tales allow." },
    { code: "X111", cls: "X", name: "The word taken two ways", theme: ["complication"], gloss: "The whole snarl comes of one word understood two ways.", realize: "the whole snarl came of a single word taken two ways, as whole wars have come of less." },
    // — G/N/Q/T · a few more —
    { code: "G303", cls: "G", name: "The dark one outwitted by a quibble", theme: ["ordeal"], gloss: "The devil or demon comes for its bond and is cheated by a nicety of wording.", realize: "the dark one came for its bond and went off cheated, undone by a comma it had not read closely." },
    { code: "N101", cls: "N", name: "Fate's thumb on the scale", theme: ["journey", "ordeal"], gloss: "Chance leans the hero's way so plainly the hall remarks it.", realize: "chance leaned the hero's way so openly that even the hall muttered of a thumb on the scale." },
    { code: "Q53", cls: "Q", name: "Reward for the kept secret", theme: ["recognition"], gloss: "The hero kept the one secret faithfully, and the keeping is the thing rewarded.", realize: "%hero% had kept the one secret to the end, and it was the keeping, not the deed, that was paid for." },
    { code: "T68.1", cls: "T", name: "The bride sets her own price", theme: ["complication"], gloss: "The sought-for names the terms of her own winning — and they are not the terms expected.", realize: "%heroine% named the price of her own winning, and it was not at all the price the suitors had brought." },

    // — C/D/F · more magic, tabu, marvels —
    { code: "C961", cls: "C", name: "Transformation as the price of the tabu", theme: ["complication", "ordeal"], gloss: "The forbidden thing, once done, is paid for not in death but in a changed shape.", realize: "the price set on the forbidden thing was not death but a shape, and %hero% went four-footed a long while for it." },
    { code: "F211", cls: "F", name: "The door in the hill", theme: ["setup", "journey"], gloss: "A way into the Otherworld that opens only at the one hour, the one night.", realize: "there was a door in the hill of %place2% that opened but once a year, and %hero% came to it on the one right night." },
    { code: "D1711", cls: "D", name: "The one who knows the words", theme: ["journey"], gloss: "A figure who holds the words that bind and loose, and parts with only a few.", realize: "%donor% knew the words that bind and loose, and gave %hero% three of them and not a fourth." },
    { code: "D2061", cls: "D", name: "The death-dealing glance", theme: ["ordeal"], gloss: "A look, a word, a name that kills of itself; faced only by indirection.", realize: "%creature%'s glance was death in itself, so %hero% fought it in the bright back of a shield and never head-on." },
    { code: "F451", cls: "F", name: "The folk under the hill", theme: ["journey"], gloss: "Smiths and makers of the underground who forge what the upper world cannot.", realize: "under %place2% dwelt the folk who forge what cannot be forged above, and they owed %hero% a making." },
    // — H/J · tests and counsel —
    { code: "H580", cls: "H", name: "Wisdom given in a riddle", theme: ["journey", "recognition"], gloss: "The needful counsel comes folded into a riddle, and costs time to unfold.", realize: "the counsel came folded in a riddle, as the best counsel does, and cost %hero% a year to read straight." },
    { code: "J21", cls: "J", name: "The counsel spurned, proved true", theme: ["homecoming", "recognition"], gloss: "Advice the hero waved off comes true at the worst possible hour.", realize: "the advice %hero% had waved off came true at the worst hour, which is the hour spurned advice keeps for itself." },
    // — K · more deceptions —
    { code: "K1817", cls: "K", name: "Disguise as pilgrim or holy beggar", theme: ["journey", "ordeal"], gloss: "The hero passes in the one cloak every door opens to and no guard searches.", realize: "%hero% went in the grey cloak of a pilgrim, which every door opens to and no guard thinks to search." },
    // — L · reversals —
    { code: "L113", cls: "L", name: "The hero of humble trade", theme: ["setup"], gloss: "The one who keeps the pigs, the pots, the gate is the one the tale was about.", realize: "%hero% kept the pigs, or the pots, or the gate, and the hall did not yet know what it had at the low end of the board." },
    // — N · chance —
    { code: "N511", cls: "N", name: "The buried treasure found", theme: ["journey", "ordeal"], gloss: "The gold lies where the dream said; the finding is the easy half.", realize: "the gold lay where the dream had said, under the third stone, and the finding of it was the easy half." },
    // — P · society & the hall —
    { code: "P320", cls: "P", name: "Guest-right", theme: ["complication", "homecoming"], gloss: "Bread, salt, and a place at the fire make a bond; to break it is the one unforgivable thing.", realize: "the stranger was given bread and salt and a seat by the fire, and to break that bond is the one wrong no country forgives." },
    { code: "P634", cls: "P", name: "The feast", theme: ["recognition", "setup"], gloss: "A feast where the whole tale turns on who is seated where.", realize: "%place% kept a feast that ran three days, and at such a board the whole of a tale turns on who is seated where." },
    { code: "P12", cls: "P", name: "The king's custom", theme: ["setup"], gloss: "An old absolute custom of the court — a wall set up in a tale only to be walked through.", realize: "the custom of %place% was old and absolute, and a custom in a tale is a wall raised only so the tale can walk through it." },
    // — R · captives —
    { code: "R45", cls: "R", name: "Captivity in the tower or mound", theme: ["complication"], gloss: "The taken one is kept in a tower with no door, a mound with no window, past the last road.", realize: "%heroine% was kept in a tower without a door and a mound without a window, past the last road there was." },
    // — S · cruelty —
    { code: "S183", cls: "S", name: "The frightful gift", theme: ["complication"], gloss: "A thing sent to the hall, wrapped fair, frightful within — a hand, a head, a heart.", realize: "what %villain% sent to the hall came wrapped fair and was a frightful thing within: a hand, a head, a heart." },
    // — W · character —
    { code: "W116", cls: "W", name: "Vanity", theme: ["complication", "recognition"], gloss: "Not greed but the wish to be seen winning undoes the proud one.", realize: "it was vanity undid the proud one, the wish to be seen winning, which is a slower poison even than greed." },
    // — X · humour —
    { code: "X1130", cls: "X", name: "The lying contest", theme: ["recognition"], gloss: "A contest of tall tales at the board, won fairly by lying best.", realize: "they fell to a lying-contest at the board, and the cup went to the biggest liar, fairly, for lying best." },
    // — Z · the personified abstractions (and the immortalist nerve they touch) —
    { code: "Z111", cls: "Z", name: "Death personified", theme: ["ordeal", "recognition"], gloss: "Death walks into the tale as a figure: courteous, unhurried, bargained with but never refused.", realize: "Death came into it as a figure, courteous and unhurried, who would be bargained with for a while but never, in the end, refused." },
    { code: "Z115", cls: "Z", name: "Time personified", theme: ["recognition", "homecoming"], gloss: "Time sits at the edge of the tale, the one player who never loses, and takes the board at last.", realize: "Time sat at the edge of it the whole while, the one player at the board who never loses, and took the game at the last." },

    // — round three: more magic, more deception, and more comedy —
    { code: "D2011", cls: "D", name: "The enchanted sleep", theme: ["complication", "ordeal"], gloss: "A deep unnatural sleep takes a person or a whole court, held until the one act.", realize: "a sleep fell on %place%, the deep unnatural kind, and held it a hundred years while the briars climbed the gate." },
    { code: "D672", cls: "D", name: "The duel of shapes", theme: ["ordeal"], gloss: "Two adepts fight as a chase of transformations, each shape answered by its hunter.", realize: "%hero% and %villain% fought it not with blades but as a chase of shapes: hawk after dove, pike after otter, grain after hen." },
    { code: "D1162", cls: "D", name: "The cloak of invisibility", theme: ["journey", "ordeal"], gloss: "A cloak or cap that hides the wearer — the most useful gift and the loneliest.", realize: "in the cloak %hero% walked unseen through the heart of %place2%, which is the most useful gift there is, and the loneliest." },
    { code: "H512", cls: "H", name: "Guess my name", theme: ["complication", "recognition"], gloss: "A fierce helper claims the child unless its hidden name is guessed in time.", realize: "the small fierce helper would take the child unless its name were guessed, and names like that are not lightly guessed." },
    { code: "K1011", cls: "K", name: "The ogre blinded", theme: ["ordeal"], gloss: "The one-eyed eater is blinded and the hero escapes hidden among the flock.", realize: "%creature% kept the one eye and the one weakness, and %hero% put it out in the dark and went free under the bellies of the rams." },
    { code: "K2210", cls: "K", name: "The treacherous letter", theme: ["journey", "recognition"], gloss: "The hero carries a sealed message that asks, unknown to him, for his own death.", realize: "%hero% carried the sealed letter the long road, trusting the hand that sealed it, never reading what it asked the reader to do." },
    { code: "K1066", cls: "K", name: "The wager that cannot be won", theme: ["complication", "ordeal"], gloss: "A bet dressed as fair sport, the losing fixed from the start.", realize: "%villain% laid a wager got up as fair sport, with the losing of it fixed before the first throw." },
    { code: "J1700", cls: "J", name: "The numbskull", theme: ["journey", "homecoming"], gloss: "The fool does each thing exactly wrong and, against all sense, comes out ahead.", realize: "the fool did each thing precisely wrong, salting the pudding with nails and singing at the funeral, and somehow came out ahead of the clever." },
    { code: "J2050", cls: "J", name: "The foolish bargain", theme: ["setup", "complication"], gloss: "The hero trades the good cow for a handful of beans, to the hall's despair.", realize: "%hero% traded the good cow for a handful of beans, to the despair of the whole hall, and the beans, this being a tale, were not quite nothing." },
    { code: "B435", cls: "B", name: "The trickster-helper beast", theme: ["journey", "ordeal"], gloss: "A fox, a cat, a small clever beast takes the hero's cause and lies the road smooth.", realize: "a fox, or a cat, or some small clever beast took %hero%'s cause in hand and lied the whole road smooth ahead of him." },
    { code: "C12", cls: "C", name: "The careless word that calls the dark", theme: ["complication"], gloss: "A name said three times without thinking, and the dark one is there at the third.", realize: "someone said the name three times without thinking, and the dark one was there at the third, punctual and smiling." },
    { code: "E332", cls: "E", name: "The road-ghost", theme: ["journey", "homecoming"], gloss: "A traveller taken up at the crossroads and gone before the door is opened.", realize: "a traveller was taken up at the crossroads and set down at the churchyard wall, and was not in the cart when the door was opened." },
    { code: "F601", cls: "F", name: "The extraordinary companions", theme: ["journey", "ordeal"], gloss: "The hero gathers a band, each with one impossible skill, each wanted exactly once.", realize: "%hero% gathered the gifted on the road: one who heard the grass grow, one who drank rivers dry, one who ran the world round before breakfast." },
    { code: "F852", cls: "F", name: "The maiden in the glass", theme: ["journey", "recognition"], gloss: "A figure lies in a glass case as if asleep, neither dead nor waking, on the one act.", realize: "%heroine% lay in a case of glass as though asleep, neither dead nor waking, waiting on the one act that would settle it." },
    { code: "N455", cls: "N", name: "The overheard counsel", theme: ["journey", "recognition"], gloss: "The hero lies still and hears the birds let slip the one needful thing.", realize: "%hero% lay still under the tree and heard the birds let slip the one thing needed, the way birds are forever letting it slip." },
    { code: "Q115", cls: "Q", name: "The three wishes wasted", theme: ["complication", "recognition"], gloss: "Three wishes granted; two spent undoing the first — the whole history of wishes.", realize: "three wishes were granted, and two were spent undoing the first, which is the entire and only history of wishes." },
    { code: "X1741", cls: "X", name: "The impossible boast", theme: ["recognition"], gloss: "A boast that swells with the telling until the hall buys the weather itself.", realize: "the boast grew with the telling until %hero% had slain ten, then a hundred, then the weather entire, and the hall bought every word of it." },
    { code: "Z52", cls: "Z", name: "The cumulative chain", theme: ["setup", "complication"], gloss: "The tale that builds link on link — the cat that worried the rat that ate the malt.", realize: "it built the way such tales build: the cat that worried the rat that ate the malt that lay in the house, and so on, and on." }
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
    motifLead: ["And they tell, too:", "It is said, also:", "And mark this:", "Men say:", "And in that country:", "Now the tale keeps such things:", "Now here is a thing the old reels hold:", "And it was ever so:", "And folk add:"],
    // callback lead-ins for the payoff half of a planted motif
    payLead: ["And so it came due:", "And so it fell out, as was promised:", "And the planted thing bore its fruit:", "And then, just as the first hour swore:", "And the debt was paid at the last:", "And the early word kept itself:", "And so the seed of it came up:"]
  };

  /* ───────────────────────── THEMES (Parry–Lord) ─────────────────────────
     Oral-formulaic *themes*: the recurrent set-pieces a singer composes with,
     larger than a formula and smaller than the song — the arming, the feast,
     the boast, the lament, the raising of the mound. A movement whose beats
     touch a theme's `triggers` can EXPAND it: the telling swells into the
     set-piece, the way oral epic fills its own performance time. Distinct from
     motifs (flat flavour-atoms): a theme is a staged scene with its own order. */
  var THEMES = [
    { id: "arming", label: "the arming of the hero", note: "Homeric type-scene: the gear taken up in fixed order before the man is spent.", triggers: ["struggle", "departure"],
      expand: "And first %hero% took up the helm, and then the ringed shirt, and then the blade that had a name, and last the shield; and so was made ready piece by piece, the way the old tellings always arm a man before they spend him." },
    { id: "feast", label: "the feast in hall", note: "The hall-feast set-piece: the boards, the cup, the harper, the seating by rank.", triggers: ["wedding", "first-function", "recognition"],
      expand: "The long boards were set and groaned with it, and the cup went sunwise round, and the harper had the high seat, and every soul was placed by rank, which in a tale is never once an idle matter." },
    { id: "boast", label: "the boasting (flyting)", note: "The flyting: half the war fought in words at the meeting.", triggers: ["struggle", "trickery"],
      expand: "Then came the boasting, each naming his line and his deeds and what his hand would do to the other, for among such folk half the war is fought in words before ever a blade is drawn." },
    { id: "lament", label: "the lament", note: "The grief-cry raised over the irrevocable.", triggers: ["absentation", "villainy", "branding"],
      expand: "And a keening went up then, the old grief-cry, from the hall to the gate to the grey lip of the sea, raised for the thing that had been done and would not be undone." },
    { id: "council", label: "the council in hall", note: "The assembly type-scene: the folk in their orders, the matter laid in the middle.", triggers: ["mediation"],
      expand: "The folk were called and sat in their orders, and the matter was set in the middle of them, and each spoke who had the right to speak, and the speaking was long and the deciding longer." },
    { id: "voyage", label: "the sea-road", note: "The launching set-piece: keel to water, the salt road out of sight of land.", triggers: ["departure", "guidance"],
      expand: "They ran the keel down to the water and shipped the long oars, and the salt road took them out, days and days from the sight of any land, the way the sea-tellings always go." },
    { id: "threshold", label: "the crossing", note: "The threshold-scene: the hero at the line between the worlds.", triggers: ["guidance"],
      expand: "At the very edge of it %hero% stood, where the one world stops and the other begins, and went over; for the crossing of that line is the whole of what a hero is for." },
    { id: "mound", label: "the raising of the mound", note: "The burial set-piece: the howe raised high, the deeds laid in over the bones.", triggers: ["victory"], require: ["struggle", "victory"],
      expand: [
        "They raised the mound high and broad, to be seen far off by folk on the water, and laid the deeds in over the bones; for that is the only deathlessness the old tales will grant their mortals.",
        "So they heaped the howe over the fallen and set a grey stone at its head, and sang the deeds in above the bones; for a song and a hill of earth are the only deathlessness the old tellings allow a mortal.",
        "And they buried what had fallen deep, and raised the earth high over it, and named the deeds aloud that the mound might keep them; for being remembered is the one immortality the old tales will grant a man."
      ] },
    { id: "supplication", label: "the supplication", note: "The suppliant at the knees, asking by the holy thing.", triggers: ["donor", "villainy"],
      expand: "Then there was a going-down to the knees and a clasping of them, and the holy name was named in the asking; for a suppliant cannot be turned away without a cost that comes due later." }
  ];

  B.lex = {
    CULTURES: CULTURES,
    ROLES: ROLES,
    PROPP: PROPP, PROPP_BY_ID: PROPP_BY_ID,
    TALETYPES: TALETYPES,
    MOTIFS: MOTIFS, MOTIF_BY_CODE: MOTIF_BY_CODE, MOTIF_BEATS: MOTIF_BEATS,
    MOTIF_CLASSES: MOTIF_CLASSES, MOTIF_CLASS_ORDER: MOTIF_CLASS_ORDER,
    THEMES: THEMES,
    FILL: FILL
  };
})();
