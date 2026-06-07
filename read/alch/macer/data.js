// ─────────────────────────────────────────────────────────────────────────────
// data.js — an ORIGINAL English translation of MACER FLORIDUS, De viribus herbarum
// (the "Macer"), set beside the Latin, line for line.
//
//   Odo Magdunensis ("Macer Floridus"), 11th c. — a Latin hexameter herb-poem of
//   77 plants, the most-copied herbal of the Middle Ages and the direct
//   descendant of Walahfrid's Hortulus. Where the Hortulus is a lyric garden,
//   Macer is an apothecary: each plant opens with its Galenic "degrees" of heat
//   and dryness, then a litany of decoctions, doses, and cures.
//
// WHY IT IS BED #2. It shares 17 of Walahfrid's 23 plants, so the two poems read
// as a dialogue on the same herbs — lyric vs. clinical. Each shared plant here
// carries a `hortulus` link to its Walahfrid counterpart (the crosswalk spine).
// Macer's stated degrees will also feed the garden's correspondence overlay.
//
// SOURCE OF TRUTH (Tranche 1). The Latin is transcribed from the received text on
// Latin Wikisource (the Choulant 1832 vulgate) — read directly, not from OCR
// (the Internet Archive's OCR of Choulant conflates Macer's formulaic chapters
// and is NOT trusted here). Lightly normalised: consonantal j → i. The modern
// critical edition (Schnell & Crossgrove, Tübingen 2003) and the manuscript
// tradition are the spine to converge on.
//
// The English is ours. A chapter is "planted" iff it carries `lines`; the rest
// are fallow, enumerated in the vulgate's order, awaiting later tranches. The 77
// run from the temperate garden herbs to a closing section of Eastern spices
// (Piper … Aloe), of which only Costus touches Walahfrid's plot. CC BY-SA 4.0.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

export const MACER = {
  meta: {
    title: 'Macer Floridus',
    work: 'De viribus herbarum',
    author: 'Odo Magdunensis ("Macer Floridus"), 11th c.',
    date: 'c. 1070–1100',
    dedicatee: null,
    license: 'CC BY-SA 4.0',
    method:
      'The Hortulus’s own descendant: a Latin hexameter herb-poem of 77 plants, ' +
      'written some two centuries later in the clinical register of the school of ' +
      'Salerno — degree of heat, decoction, dose. Where it shares a plant with ' +
      'Walahfrid (17 of his 23 beds), the two read as a dialogue: the lyric garden ' +
      'against the apothecary. The Latin is transcribed from the received text on ' +
      'Latin Wikisource (the Choulant 1832 vulgate), lightly normalised (j→i); the ' +
      'modern critical edition (Schnell–Crossgrove, 2003) is the spine to converge ' +
      'on. Each herb’s Galenic “degrees” are noted where Macer gives them — the raw ' +
      'material for the garden’s coming correspondence overlay. The English is ours.',
    latinSource: 'Received text (Choulant 1832 vulgate) via Latin Wikisource',
    convergeOn: 'Schnell & Crossgrove, Macer Floridus «De viribus herbarum» (Tübingen, 2003), and the manuscript tradition',
    sources: [
      { label: 'De viribus herbarum (Odo Magdunensis / Macer) — full Latin text', host: 'la.wikisource.org', url: 'https://la.wikisource.org/wiki/De_viribus_herbarum' },
      { label: 'Choulant, Macer Floridus de viribus herbarum (Leipzig, 1832) — the vulgate edition', host: 'archive.org', url: 'https://archive.org/details/deviribusherbaru00mace' },
      { label: 'Schnell & Crossgrove (Tübingen, 2003) — the modern critical edition, to converge on', host: 'reference', url: 'https://www.worldcat.org/oclc/76681313' },
    ],
  },

  // Every chapter in the vulgate's order (seq = chapter number, 1–77). A chapter
  // is "planted" when it has `lines`. `hortulus` is the seq of the matching bed in
  // ../hortulus/ (the crosswalk link) — present only for the 17 shared plants
  // (+ Costus, which Walahfrid names in his clary bed). `degrees` records Macer's
  // Galenic heat/dryness where stated, for the correspondence overlay.
  sections: [
    { seq: 1,  la: 'Artemisia',  en: 'Mugwort',        bot: 'Artemisia vulgaris' },

    // ── 2. Southernwood — pairs with Hortulus IV ──────────────────────────────
    {
      seq: 2, la: 'Abrotanum', en: 'Southernwood', bot: 'Artemisia abrotanum',
      hortulus: 4, degrees: 'hot in the 3rd degree, drying (the seed more fiercely)',
      lines: [
        { la: 'Tertius Abrotano legitur gradus esse caloris,', en: 'Southernwood is reckoned to stand in the third degree of heat,',
          n: 'Macer opens, as he does for nearly every herb, with the Galenic “degrees” — the graded scale of heat and dryness that the correspondence overlay will draw on.' },
        { la: 'et desiccandi semen ferventius herba est,', en: 'and in drying its seed is fiercer than the leaf;' },
        { la: 'unde iuvat nervos et causas pectoris omnes,', en: 'whence it helps the sinews and every trouble of the chest,' },
        { la: 'illius elixi si sit decoctio sumpta.', en: 'if a decoction of it, well boiled, be taken.' },
        { la: 'Sic quoque dysnoicis prodest tussimque repellit,', en: 'So too it helps the short of breath, and drives off the cough,' },
        { la: 'et prodest lumbis, sic vulvarumque querelis.', en: 'and helps the loins, and likewise the complaints of the womb.' },
        { la: 'Omnibus his crudum cum vino proderit haustum,', en: 'For all these, taken raw with wine, it will serve,' },
        { la: 'urinam purgat sic et praecordia mundat,', en: 'thus it purges the urine and cleanses the midriff,' },
        { la: 'sic curat sciasim, sic sumptum menstrua purgat,', en: 'thus it cures sciatica, thus taken it brings on the menses,' },
        { la: 'serpentes nidore fugat, bibitumque venena', en: 'it routs serpents by its reek, and, drunk, the venom' },
        { la: 'illorum extinguit, sedat quoque frigora febris', en: 'of those it quenches; it calms too the chills of fever' },
        { la: 'antea quam veniant si mixto sumitur amne,', en: 'before they come, if it is taken mixed with water,' },
        { la: 'aut oleo quo decoquitur si membra perungas.', en: 'or if you anoint the limbs with the oil it is boiled in.' },
        { la: 'Lumbricos ventris hanc saepe bibendo necabis.', en: 'By drinking it often you will kill the worms of the belly.' },
        { la: 'Huic panis micas et mala cidonia iungens', en: 'Joining to it crumbs of bread and quinces,' },
        { la: 'insimul amne coquas, oculorum cocta dolori', en: 'boil them together in water; the cooked mash, for pain of the eyes' },
        { la: 'apponas vel fervori, curabit utrumque.', en: 'apply, or for their inflammation: it will cure both.' },
        { la: 'Stirpes infixas et spinas abstrahet ipsum', en: 'It will draw out embedded stumps and thorns,' },
        { la: 'appositum per se vel adeps si iungitur illi.', en: 'applied by itself, or if fat is joined to it.' },
        { la: 'Haec etiam venerem pulvino subdita tantum', en: 'This too, merely laid under the pillow,' },
        { la: 'incitat, et veneri nocuis potata resistit.', en: 'rouses desire — and, drunk, withstands what harms it.' },
      ],
      note: 'Set beside Walahfrid’s southernwood (Hortulus IV) the two registers stand bare: Walahfrid gives eight lyric lines on its hair-like foliage and “as many powers as it has threads”; Macer gives a degree of heat and twenty-one lines of pharmacy — chest, loins, womb, urine, sciatica, snakebite, fever, worms, eye-pain, splinters, and a charm under the pillow. Same plant; the garden and the dispensary.',
    },

    { seq: 3,  la: 'Absinthium', en: 'Wormwood',       bot: 'Artemisia absinthium', hortulus: 7 },
    { seq: 4,  la: 'Urtica',     en: 'Nettle',         bot: 'Urtica dioica' },
    { seq: 5,  la: 'Allium',     en: 'Garlic',         bot: 'Allium sativum' },
    { seq: 6,  la: 'Plantago',   en: 'Plantain',       bot: 'Plantago major' },
    { seq: 7,  la: 'Ruta',       en: 'Rue',            bot: 'Ruta graveolens', hortulus: 3 },
    { seq: 8,  la: 'Apium',      en: 'Celery',         bot: 'Apium graveolens', hortulus: 18 },
    { seq: 9,  la: 'Althaea',    en: 'Marshmallow',    bot: 'Althaea officinalis' },
    { seq: 10, la: 'Anethum',    en: 'Dill',           bot: 'Anethum graveolens' },
    { seq: 11, la: 'Betonica',   en: 'Betony',         bot: 'Betonica officinalis', hortulus: 19 },
    { seq: 12, la: 'Sabina',     en: 'Savin',          bot: 'Juniperus sabina' },
    { seq: 13, la: 'Porrum',     en: 'Leek',           bot: 'Allium porrum' },
    { seq: 14, la: 'Chamomilla', en: 'Chamomile',      bot: 'Matricaria chamomilla' },
    { seq: 15, la: 'Nepeta',     en: 'Catmint',        bot: 'Nepeta cataria', hortulus: 22 },
    { seq: 16, la: 'Pulegium',   en: 'Pennyroyal',     bot: 'Mentha pulegium', hortulus: 17 },
    { seq: 17, la: 'Feniculum',  en: 'Fennel',         bot: 'Foeniculum vulgare', hortulus: 9 },
    { seq: 18, la: 'Acidula',    en: 'Sorrel',         bot: 'Rumex acetosa' },
    { seq: 19, la: 'Portulaca',  en: 'Purslane',       bot: 'Portulaca oleracea' },
    { seq: 20, la: 'Lactuca',    en: 'Lettuce',        bot: 'Lactuca sativa' },
    { seq: 21, la: 'Rosa',       en: 'Rose',           bot: 'Rosa', hortulus: 24 },
    { seq: 22, la: 'Lilium',     en: 'Lily',           bot: 'Lilium candidum', hortulus: 13 },
    { seq: 23, la: 'Satureia',   en: 'Savory',         bot: 'Satureja hortensis' },

    // ── 24. Sage — pairs with Hortulus II ─────────────────────────────────────
    {
      seq: 24, la: 'Salvia', en: 'Sage', bot: 'Salvia officinalis',
      hortulus: 2,
      lines: [
        { la: 'Salvia, cui nomen elelisphacus est apud Argos,', en: 'Sage, whose name among the Argives is elelisphacus,',
          n: 'The same Greek name Walahfrid gives it (“elelifagus”, Hortulus II) — the two poems shake hands across two centuries on this one word.' },
        { la: 'cum mulsa iecoris prodest potata querelis,', en: 'drunk with mead, helps the complaints of the liver,' },
        { la: 'pellit abortivum, lotiumque et menstrua purgat,', en: 'drives out the stillbirth, and purges the urine and the menses,',
          n: '“pellit abortivum” — it expels a dead or miscarrying foetus; sage was both emmenagogue and, by reputation, abortifacient.' },
        { la: 'trita venenatos curat superaddita morsus,', en: 'crushed and laid on, it cures venomous bites;' },
        { la: 'crudis vulneribus (quae multo sanguine manant)', en: 'to raw wounds (those that run with much blood)' },
        { la: 'apponas tritam, dicunt retinere cruorem.', en: 'apply it crushed: they say it stanches the gore.' },
        { la: 'Cum vino succus tepidus si sumitur eius,', en: 'If its juice is taken warm with wine,' },
        { la: 'compescit veterem tussim laterisque dolorem.', en: 'it checks an old cough and pain in the side.' },
        { la: 'Pruritus vulvae curat virgaeque virilis,', en: 'It cures the itching of the womb and of the male member,' },
        { la: 'si foveas vino fuerit quo salvia cocta.', en: 'if you bathe with the wine in which sage has been boiled.' },
        { la: 'Illius succo crines nigrescere dicunt,', en: 'With its juice, they say, the hair grows black,' },
        { la: 'si sint hoc uncti crebro sub sole calenti.', en: 'if they are anointed with it often under the hot sun.' },
      ],
      note: 'Walahfrid’s sage (Hortulus II) is a green-youthed plant at war with its own offspring — a fable in seven lines. Macer’s is a working drug: liver, childbirth, urine, menses, snakebite, the stanching of wounds, old coughs, and a recipe for dyeing grey hair black. Only the Greek name elelisphacus is shared word-for-word — the clearest seam between the two poems.',
    },

    { seq: 25, la: 'Ligusticum',     en: 'Lovage',        bot: 'Levisticum officinale', hortulus: 11 },
    { seq: 26, la: 'Ostruthium',     en: 'Masterwort',    bot: 'Peucedanum ostruthium' },
    { seq: 27, la: 'Cerefolium',     en: 'Chervil',       bot: 'Anthriscus cerefolium', hortulus: 12 },
    { seq: 28, la: 'Atriplex',       en: 'Orache',        bot: 'Atriplex hortensis' },
    { seq: 29, la: 'Coriandrum',     en: 'Coriander',     bot: 'Coriandrum sativum' },
    { seq: 30, la: 'Nasturtium',     en: 'Garden cress',  bot: 'Lepidium sativum' },
    { seq: 31, la: 'Eruca',          en: 'Rocket',        bot: 'Eruca sativa' },
    { seq: 32, la: 'Papaver',        en: 'Poppy',         bot: 'Papaver somniferum', hortulus: 14 },
    { seq: 33, la: 'Cepa',           en: 'Onion',         bot: 'Allium cepa' },
    { seq: 34, la: 'Buglossa',       en: 'Bugloss',       bot: 'Anchusa officinalis' },
    { seq: 35, la: 'Sinapi',         en: 'Mustard',       bot: 'Sinapis alba' },
    { seq: 36, la: 'Caulis',         en: 'Cabbage',       bot: 'Brassica oleracea' },
    { seq: 37, la: 'Pastinaca',      en: 'Parsnip',       bot: 'Pastinaca sativa' },
    { seq: 38, la: 'Origanum',       en: 'Oregano',       bot: 'Origanum vulgare' },
    { seq: 39, la: 'Serpillum',      en: 'Wild thyme',    bot: 'Thymus serpyllum' },
    { seq: 40, la: 'Viola',          en: 'Violet',        bot: 'Viola odorata' },
    { seq: 41, la: 'Aristolochia',   en: 'Birthwort',     bot: 'Aristolochia' },
    { seq: 42, la: 'Marrubium',      en: 'Horehound',     bot: 'Marrubium vulgare', hortulus: 8 },
    { seq: 43, la: 'Iris',           en: 'Iris',          bot: 'Iris', hortulus: 10 },
    { seq: 44, la: 'Enula',          en: 'Elecampane',    bot: 'Inula helenium' },
    { seq: 45, la: 'Hyssopus',       en: 'Hyssop',        bot: 'Hyssopus officinalis' },
    { seq: 46, la: 'Asarum',         en: 'Asarabacca',    bot: 'Asarum europaeum' },
    { seq: 47, la: 'Mentha',         en: 'Mint',          bot: 'Mentha', hortulus: 16 },
    { seq: 48, la: 'Cyperus',        en: 'Galingale',     bot: 'Cyperus longus' },
    { seq: 49, la: 'Paeonia',        en: 'Peony',         bot: 'Paeonia officinalis' },
    { seq: 50, la: 'Melissophyllum', en: 'Balm',          bot: 'Melissa officinalis' },
    { seq: 51, la: 'Senecio',        en: 'Groundsel',     bot: 'Senecio vulgaris' },
    { seq: 52, la: 'Chelidonia',     en: 'Celandine',     bot: 'Chelidonium majus' },
    { seq: 53, la: 'Centaurea',      en: 'Centaury',      bot: 'Centaurium' },
    { seq: 54, la: 'Colubrina',      en: 'Dragonwort',    bot: 'Dracunculus vulgaris' },
    { seq: 55, la: 'Gaisdo',         en: 'Gaisdo (?)',    bot: 'uncertain', crux: 'The vulgate heading is garbled; identity uncertain — to be settled against the critical text.' },
    { seq: 56, la: 'Elleborus albus',en: 'White hellebore',bot: 'Veratrum album' },
    { seq: 57, la: 'Elleborus niger',en: 'Black hellebore',bot: 'Helleborus niger' },
    { seq: 58, la: 'Verbena',        en: 'Vervain',       bot: 'Verbena officinalis' },
    { seq: 59, la: 'Chamaedrys',     en: 'Germander',     bot: 'Teucrium chamaedrys' },
    { seq: 60, la: 'Maurella',       en: 'Black nightshade',bot: 'Solanum nigrum' },
    { seq: 61, la: 'Iusquiamus',     en: 'Henbane',       bot: 'Hyoscyamus niger' },
    { seq: 62, la: 'Malva',          en: 'Mallow',        bot: 'Malva sylvestris' },
    { seq: 63, la: 'Lapatium',       en: 'Dock',          bot: 'Rumex' },
    { seq: 64, la: 'Lolium',         en: 'Darnel',        bot: 'Lolium temulentum' },
    { seq: 65, la: 'Cicuta',         en: 'Hemlock',       bot: 'Conium maculatum' },

    // ── 66–77. The Eastern spices (only Costus touches Walahfrid's plot) ───────
    { seq: 66, la: 'Piper',          en: 'Pepper',        bot: 'Piper nigrum' },
    { seq: 67, la: 'Pyrethrum',      en: 'Pellitory',     bot: 'Anacyclus pyrethrum' },
    { seq: 68, la: 'Zinziber',       en: 'Ginger',        bot: 'Zingiber officinale' },
    { seq: 69, la: 'Cuminum',        en: 'Cumin',         bot: 'Cuminum cyminum' },
    { seq: 70, la: 'Galanga',        en: 'Galangal',      bot: 'Alpinia officinarum' },
    { seq: 71, la: 'Zedoar',         en: 'Zedoary',       bot: 'Curcuma zedoaria' },
    { seq: 72, la: 'Gariofilus',     en: 'Clove',         bot: 'Syzygium aromaticum' },
    { seq: 73, la: 'Cinnamomum',     en: 'Cinnamon',      bot: 'Cinnamomum verum' },
    { seq: 74, la: 'Costus',         en: 'Costmary / costus', bot: 'Tanacetum balsamita', hortulus: 15 },
    { seq: 75, la: 'Spica',          en: 'Spikenard',     bot: 'Nardostachys jatamansi' },
    { seq: 76, la: 'Thus',           en: 'Frankincense',  bot: 'Boswellia' },
    { seq: 77, la: 'Aloe',           en: 'Aloe',          bot: 'Aloe' },
  ],
};
