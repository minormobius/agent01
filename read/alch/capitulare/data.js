// ─────────────────────────────────────────────────────────────────────────────
// data.js — CAPITULARE DE VILLIS, cap. 70 ("De hortis"): the garden chapter of
// Charlemagne's estate-capitulary, set beside an original English translation.
//
//   Capitulare de villis vel curtis imperii, c. 800 (late in Charlemagne's reign).
//   Chapter 70 commands that every royal estate grow a fixed list of ~73 herbs and
//   16 fruit/nut trees. It is administrative prose, not a poem — the imperial garden
//   as a decree, a near-contemporary of Walahfrid's personal Hortulus (c. 840).
//
// SOURCE OF TRUTH. The critical edition — MGH, Capitularia regum Francorum I, ed.
// Alfred Boretius (Hannover 1883), no. 32, cap. 70 — resting on the single
// surviving manuscript, Wolfenbüttel, Herzog August Bibliothek, Cod. Guelf. 254
// Helmst. The Latin here is the received text of that chapter, read directly; the
// manuscript / Boretius's apparatus is the spine to converge on.
//
// WHY IT IS BED #3. It is the third axis of the crosswalk. Each plant carries `h`
// (its Hortulus bed seq) and/or `m` (its Macer chapter) where the poems also name
// it — and the Capitulare supplies four plants Macer lacks (gourd, melon, radish,
// clary), plus a whole tier of pure kitchen-garden vegetables (beans, peas,
// carrots, beets) that neither poet sings. The correspondence overlay
// (../correspondences.js) lights up any plant it covers. CC BY-SA 4.0.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

export const CAPITULARE = {
  meta: {
    title: 'Capitulare de villis',
    work: 'cap. 70 — De hortis (the garden chapter)',
    author: 'issued under Charlemagne (Charles the Great)',
    date: 'c. 800',
    license: 'CC BY-SA 4.0',
    method:
      'The garden chapter of Charlemagne’s estate-capitulary: a command that every ' +
      'royal villa grow a fixed roster of herbs and trees — the imperial garden as ' +
      'administration, beside Walahfrid’s personal one. Latin from the received text ' +
      'of cap. 70 (Boretius’s MGH edition), translated into English; each plant ' +
      'cross-linked to its Hortulus bed and Macer chapter where the poems name it. ' +
      'Plant identifications follow the standard reading of the capitulary’s often ' +
      'vernacular-tinged names.',
    latinSource: 'Received text of cap. 70 (MGH, Capitularia I, ed. Boretius, 1883, no. 32)',
    convergeOn: 'Wolfenbüttel, Cod. Guelf. 254 Helmst. (the sole manuscript), and Boretius’s apparatus',
    sources: [
      { label: 'MGH, Capitularia regum Francorum I, ed. Boretius (Hannover 1883), no. 32 — the critical edition', host: 'dmgh.de', url: 'https://www.dmgh.de/mgh_capit_1/index.htm' },
      { label: 'Capitulare de villis — overview and the cap. 70 plant list', host: 'wikipedia.org', url: 'https://en.wikipedia.org/wiki/Capitulare_de_villis' },
    ],
  },

  // The opening command of cap. 70.
  command: {
    la: 'Volumus quod in horto omnes herbas habeant, id est:',
    en: 'We will that in the garden they have all herbs, that is to say:',
  },

  // The ~73 herbs, in the capitulary's own order and spelling. `h` = Hortulus bed
  // seq, `m` = Macer chapter, where the poems also name the plant.
  herbs: [
    { la: 'lilium',          en: 'Lily',              bot: 'Lilium candidum',      h: 13, m: 22 },
    { la: 'rosas',           en: 'Roses',             bot: 'Rosa',                 h: 24, m: 21 },
    { la: 'fenigrecum',      en: 'Fenugreek',         bot: 'Trigonella foenum-graecum' },
    { la: 'costum',          en: 'Costmary',          bot: 'Tanacetum balsamita',  m: 74 },
    { la: 'salviam',         en: 'Sage',              bot: 'Salvia officinalis',   h: 2,  m: 24 },
    { la: 'rutam',           en: 'Rue',               bot: 'Ruta graveolens',      h: 3,  m: 7 },
    { la: 'abrotanum',       en: 'Southernwood',      bot: 'Artemisia abrotanum',  h: 4,  m: 2 },
    { la: 'cucumeres',       en: 'Cucumber',          bot: 'Cucumis sativus' },
    { la: 'pepones',         en: 'Melon',             bot: 'Cucumis melo',         h: 6 },
    { la: 'cucurbitas',      en: 'Bottle gourd',      bot: 'Lagenaria siceraria',  h: 5 },
    { la: 'fasiolum',        en: 'Cowpea',            bot: 'Vigna unguiculata' },
    { la: 'ciminum',         en: 'Cumin',             bot: 'Cuminum cyminum',      m: 69 },
    { la: 'ros marinum',     en: 'Rosemary',          bot: 'Salvia rosmarinus' },
    { la: 'careium',         en: 'Caraway',           bot: 'Carum carvi' },
    { la: 'cicerum italicum',en: 'Chickpea',          bot: 'Cicer arietinum' },
    { la: 'squillam',        en: 'Squill',            bot: 'Drimia maritima' },
    { la: 'gladiolum',       en: 'Iris / gladdon',    bot: 'Iris',                 h: 10, m: 43 },
    { la: 'dragantea',       en: 'Tarragon / bistort',bot: 'Artemisia dracunculus' },
    { la: 'anesum',          en: 'Anise',             bot: 'Pimpinella anisum' },
    { la: 'coloquentidas',   en: 'Colocynth',         bot: 'Citrullus colocynthis' },
    { la: 'solsequiam',      en: 'Heliotrope / marigold', bot: 'Calendula / Heliotropium' },
    { la: 'ameum',           en: 'Ammi (bishop’s-weed)', bot: 'Ammi majus' },
    { la: 'silum',           en: 'Sermountain',       bot: 'Laserpitium siler' },
    { la: 'lactucas',        en: 'Lettuce',           bot: 'Lactuca sativa',       m: 20 },
    { la: 'git',             en: 'Black cumin',       bot: 'Nigella sativa' },
    { la: 'eruca alba',      en: 'Rocket',            bot: 'Eruca sativa',         m: 31 },
    { la: 'nasturtium',      en: 'Garden cress',      bot: 'Lepidium sativum',     m: 30 },
    { la: 'parduna',         en: 'Burdock',           bot: 'Arctium lappa' },
    { la: 'puledium',        en: 'Pennyroyal',        bot: 'Mentha pulegium',      h: 17, m: 16 },
    { la: 'olisatum',        en: 'Alexanders',        bot: 'Smyrnium olusatrum' },
    { la: 'petresilinum',    en: 'Parsley',           bot: 'Petroselinum crispum' },
    { la: 'apium',           en: 'Celery',            bot: 'Apium graveolens',     h: 18, m: 8 },
    { la: 'leiusticum',      en: 'Lovage',            bot: 'Levisticum officinale',h: 11, m: 25 },
    { la: 'savinam',         en: 'Savin',             bot: 'Juniperus sabina',     m: 12 },
    { la: 'anetum',          en: 'Dill',              bot: 'Anethum graveolens',   m: 10 },
    { la: 'fenicolum',       en: 'Fennel',            bot: 'Foeniculum vulgare',   h: 9,  m: 17 },
    { la: 'intubas',         en: 'Endive / chicory',  bot: 'Cichorium' },
    { la: 'diptamnum',       en: 'Dittany',           bot: 'Dictamnus albus' },
    { la: 'sinape',          en: 'Mustard',           bot: 'Sinapis alba',         m: 35 },
    { la: 'satureiam',       en: 'Savory',            bot: 'Satureja hortensis',   m: 23 },
    { la: 'sisimbrium',      en: 'Water mint',        bot: 'Mentha aquatica' },
    { la: 'mentam',          en: 'Mint',              bot: 'Mentha',               h: 16, m: 47 },
    { la: 'mentastrum',      en: 'Horse mint',        bot: 'Mentha longifolia' },
    { la: 'tanazitam',       en: 'Tansy',             bot: 'Tanacetum vulgare' },
    { la: 'neptam',          en: 'Catmint',           bot: 'Nepeta cataria',       h: 22, m: 15 },
    { la: 'febrefugiam',     en: 'Feverfew',          bot: 'Tanacetum parthenium' },
    { la: 'papaver',         en: 'Poppy',             bot: 'Papaver somniferum',   h: 14, m: 32 },
    { la: 'betas',           en: 'Chard / beet',      bot: 'Beta vulgaris' },
    { la: 'vulgigina',       en: 'Asarabacca',        bot: 'Asarum europaeum',     m: 46 },
    { la: 'mismalvas',       en: 'Marshmallow',       bot: 'Althaea officinalis',  m: 9, n: 'the capitulary glosses it: “mismalvas, id est altaeas.”' },
    { la: 'malvas',          en: 'Mallow',            bot: 'Malva sylvestris',     m: 62 },
    { la: 'caruitas',        en: 'Carrot',            bot: 'Daucus carota' },
    { la: 'pastenacas',      en: 'Parsnip',           bot: 'Pastinaca sativa',     m: 37 },
    { la: 'adripias',        en: 'Orache',            bot: 'Atriplex hortensis',   m: 28 },
    { la: 'blidas',          en: 'Blite / amaranth',  bot: 'Amaranthus / Blitum' },
    { la: 'ravacaulos',      en: 'Kohlrabi',          bot: 'Brassica oleracea var.' },
    { la: 'caulos',          en: 'Cabbage',           bot: 'Brassica oleracea',    m: 36 },
    { la: 'uniones',         en: 'Welsh onion',       bot: 'Allium fistulosum' },
    { la: 'britlas',         en: 'Chives',            bot: 'Allium schoenoprasum' },
    { la: 'porros',          en: 'Leek',              bot: 'Allium porrum',        m: 13 },
    { la: 'radices',         en: 'Radish',            bot: 'Raphanus sativus',     h: 23 },
    { la: 'ascalonicas',     en: 'Shallot',           bot: 'Allium ascalonicum' },
    { la: 'cepas',           en: 'Onion',             bot: 'Allium cepa',          m: 33 },
    { la: 'alia',            en: 'Garlic',            bot: 'Allium sativum',       m: 5 },
    { la: 'warentiam',       en: 'Madder',            bot: 'Rubia tinctorum' },
    { la: 'cardones',        en: 'Cardoon / teasel',  bot: 'Cynara cardunculus' },
    { la: 'fabas majores',   en: 'Broad beans',       bot: 'Vicia faba' },
    { la: 'pisos mauriscos', en: 'Peas',              bot: 'Pisum sativum' },
    { la: 'coriandrum',      en: 'Coriander',         bot: 'Coriandrum sativum',   m: 29 },
    { la: 'cerfolium',       en: 'Chervil',           bot: 'Anthriscus cerefolium',h: 12, m: 27 },
    { la: 'lacteridas',      en: 'Spurge',            bot: 'Euphorbia lathyris' },
    { la: 'sclareiam',       en: 'Clary sage',        bot: 'Salvia sclarea',       h: 15 },
  ],

  // The chapter's most-loved line.
  gardener: {
    la: 'Et ille hortulanus habeat super domum suam Iovis barbam.',
    en: 'And let that gardener have, upon his house, Jove’s beard.',
    n: 'Houseleek (Sempervivum, “Jove’s beard”) on the roof — a living charm against lightning. The same barba Iovis Macer folds into his sorrel bed (ch. 18); here it crowns the imperial gardener’s own house.',
  },

  // The trees.
  treesIntro: {
    la: 'De arboribus volumus quod habeant pomarios diversi generis, pirarios diversi generis, prunarios diversi generis, sorbarios, mespilarios, castanearios, persicarios diversi generis, cotoniarios, avellanarios, amandalarios, morarios, lauros, pinos, ficus, nucarios, ceresarios diversi generis.',
    en: 'Of trees, we will that they have apple-trees of various kinds, pear-trees of various kinds, plum-trees of various kinds, sorbs, medlars, chestnuts, peach-trees of various kinds, quinces, hazels, almonds, mulberries, laurels, pines, figs, walnuts, cherry-trees of various kinds.',
  },
  trees: [
    { la: 'pomarios',     en: 'Apple',    bot: 'Malus domestica' },
    { la: 'pirarios',     en: 'Pear',     bot: 'Pyrus communis' },
    { la: 'prunarios',    en: 'Plum',     bot: 'Prunus domestica' },
    { la: 'sorbarios',    en: 'Sorb / service', bot: 'Sorbus domestica' },
    { la: 'mespilarios',  en: 'Medlar',   bot: 'Mespilus germanica' },
    { la: 'castanearios', en: 'Chestnut', bot: 'Castanea sativa' },
    { la: 'persicarios',  en: 'Peach',    bot: 'Prunus persica' },
    { la: 'cotoniarios',  en: 'Quince',   bot: 'Cydonia oblonga' },
    { la: 'avellanarios', en: 'Hazel',    bot: 'Corylus avellana' },
    { la: 'amandalarios', en: 'Almond',   bot: 'Prunus dulcis' },
    { la: 'morarios',     en: 'Mulberry', bot: 'Morus' },
    { la: 'lauros',       en: 'Bay laurel',bot: 'Laurus nobilis' },
    { la: 'pinos',        en: 'Pine',     bot: 'Pinus pinea' },
    { la: 'ficus',        en: 'Fig',      bot: 'Ficus carica' },
    { la: 'nucarios',     en: 'Walnut',   bot: 'Juglans regia' },
    { la: 'ceresarios',   en: 'Cherry',   bot: 'Prunus avium / cerasus' },
  ],

  // The named cultivars that close the chapter.
  cultivars: {
    la: 'Malorum nomina: gozmaringa, geroldinga, crevedella, spirauca; dulcia, acria, omnia servatoria et hastimatica.',
    en: 'The names of the apples: gozmaringa, geroldinga, crevedella, spirauca; sweet ones, sharp ones, all keepers, and the early (“hasty”) sort.',
    n: 'Among the earliest recorded fruit-cultivar names in the West — Frankish apple varieties told apart by taste and keeping-quality.',
  },
};
