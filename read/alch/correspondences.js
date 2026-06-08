// ─────────────────────────────────────────────────────────────────────────────
// correspondences.js — the Alchemist's Garden CORRESPONDENCE OVERLAY.
//
// This is the layer that makes the garden *alchemical*. It is NOT Walahfrid and
// NOT Macer: it is a third, transparent layer laid over the plants both poems
// share, drawn from named donor sources and kept visibly separate.
//
// Each plant carries two correspondence systems, shown side by side because they
// do not always agree:
//
//   1. THE GALENIC TEMPERAMENT — hot/cold × dry/moist, and the element + humour
//      that follow from it (the classical square below). The qualities are taken
//      from MACER'S OWN STATED DEGREES where the plant has a Macer chapter (a
//      primary source, already in macer/data.js); where Macer gives no degree, or
//      the plant is Walahfrid-only, they follow the Galenic/Dioscoridean tradition
//      (marked in `qSource`).
//
//   2. THE PLANETARY RULE — the planet that governs the herb, after Nicholas
//      Culpeper's «The English Physician / Complete Herbal» (1653), the standard
//      donor for planetary rulerships; and the METAL that planet carries in the
//      classical planet→metal correspondence — the bridge herb → planet → metal
//      that is the heart of an alchemist's reading.
//
// Where the two systems diverge (e.g. an iris that is Galenically hot-and-dry but
// ruled by the cold-moist Moon), the `signature` says so rather than papering over
// it. Signatures are interpretive and labelled as such.
//
// Reusable by any surface (crosswalk, the two readers) and by a downstream app:
// it exports the derivation maps (PLANETS, TEMPERAMENTS) so a consumer needs no
// logic of its own. CC BY-SA 4.0.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// planet → its alchemical glyph (shared by the planet and its metal) + the metal.
export const PLANETS = {
  Sun:     { glyph: '☉', metal: 'gold' },
  Moon:    { glyph: '☽', metal: 'silver' },
  Mercury: { glyph: '☿', metal: 'quicksilver' },
  Venus:   { glyph: '♀', metal: 'copper' },
  Mars:    { glyph: '♂', metal: 'iron' },
  Jupiter: { glyph: '♃', metal: 'tin' },
  Saturn:  { glyph: '♄', metal: 'lead' },
};

// the Galenic square: a hot/cold × dry/moist temperament → element + humour (+ the
// alchemical element glyph).
export const TEMPERAMENTS = {
  'hot & dry':    { element: 'Fire',  humour: 'choler',     glyph: '🜂' },
  'hot & moist':  { element: 'Air',   humour: 'blood',      glyph: '🜁' },
  'cold & moist': { element: 'Water', humour: 'phlegm',     glyph: '🜄' },
  'cold & dry':   { element: 'Earth', humour: 'melancholy', glyph: '🜃' },
};

export const CORRESPONDENCES = {
  meta: {
    title: 'The correspondence overlay',
    license: 'CC BY-SA 4.0',
    method:
      'Two correspondence systems laid over the shared plants and shown side by ' +
      'side: the Galenic temperament (hot/cold × dry/moist → element + humour), ' +
      'with the qualities taken from Macer’s own stated degrees where he gives ' +
      'them and from the Galenic tradition otherwise; and the planetary rule after ' +
      'Culpeper (1653), with the metal each planet carries in the classical ' +
      'planet→metal correspondence. The two do not always agree; where they part, ' +
      'the signature says so. A third layer over the two poems, not a claim of either.',
    sources: [
      { label: 'Galenic “degrees” — primary, from Macer’s De viribus herbarum (this hub’s macer/data.js)', host: 'read.mino.mobi/alch/macer', url: '../macer/' },
      { label: 'Planetary rulers — Nicholas Culpeper, The English Physician / Complete Herbal (1653)', host: 'public domain', url: 'https://en.wikipedia.org/wiki/Complete_Herbal' },
      { label: 'Planet→metal correspondence — the classical/alchemical scheme (Sun–gold … Saturn–lead)', host: 'tradition', url: 'https://en.wikipedia.org/wiki/Planetary_metals' },
    ],
  },

  // One record per shared plant, keyed to its Hortulus bed (`hortulus`, the bed
  // seq) and its Macer chapter (`macer`, or null). `qualities` is one of the four
  // TEMPERAMENTS keys (or null); `degree` is Macer's precise phrasing where stated.
  plants: [
    { slug: 'sage', plant: 'Sage', bot: 'Salvia officinalis', hortulus: 2, macer: 24,
      planet: 'Jupiter', qualities: 'hot & dry', degree: null,
      qSource: 'Galenic tradition (Macer states no degree)',
      signature: 'A Jupiter herb — temperate, sovereign, long-lived (Walahfrid’s “perpetual green youth”).' },

    { slug: 'rue', plant: 'Rue', bot: 'Ruta graveolens', hortulus: 3, macer: 7,
      planet: 'Sun', qualities: 'hot & dry', degree: '3rd degree',
      qSource: 'Macer',
      signature: 'Culpeper’s herb of the Sun — bright and opening, the great antidote against poison and dim sight.' },

    { slug: 'southernwood', plant: 'Southernwood', bot: 'Artemisia abrotanum', hortulus: 4, macer: 2,
      planet: 'Mercury', qualities: 'hot & dry', degree: 'hot 3°, dry',
      qSource: 'Macer' },

    { slug: 'gourd', plant: 'Bottle gourd', bot: 'Lagenaria siceraria', hortulus: 5, macer: null,
      planet: 'Moon', qualities: 'cold & moist', degree: null,
      qSource: 'Galenic tradition',
      signature: 'A cold, watery fruit of the Moon — Walahfrid’s climber cooled the body and “fed coolness through it.”' },

    { slug: 'melon', plant: 'Melon', bot: 'Cucumis melo', hortulus: 6, macer: null,
      planet: 'Moon', qualities: 'cold & moist', degree: null,
      qSource: 'Galenic tradition' },

    { slug: 'wormwood', plant: 'Wormwood', bot: 'Artemisia absinthium', hortulus: 7, macer: 3,
      planet: 'Mars', qualities: 'hot & dry', degree: 'hot 1°, dry 2°',
      qSource: 'Macer',
      signature: 'Here the two systems rhyme: hot-dry choler (Fire) and the iron planet Mars — Culpeper’s pugnacious, much-defended choice for the bitterest herb.' },

    { slug: 'horehound', plant: 'White horehound', bot: 'Marrubium vulgare', hortulus: 8, macer: 42,
      planet: 'Mercury', qualities: 'hot & dry', degree: '2nd degree',
      qSource: 'Macer',
      signature: 'Mercury’s herb of the chest and breath — the cough-and-lung draught.' },

    { slug: 'fennel', plant: 'Fennel', bot: 'Foeniculum vulgare', hortulus: 9, macer: 17,
      planet: 'Mercury', qualities: 'hot & dry', degree: '2nd degree',
      qSource: 'Macer',
      signature: 'A Mercury herb — clearing the sight and the airways.' },

    { slug: 'iris', plant: 'Iris / gladdon', bot: 'Iris', hortulus: 10, macer: 43,
      planet: 'Moon', qualities: 'hot & dry', degree: '2nd degree',
      qSource: 'Macer',
      signature: 'The systems part here: Galenically hot-and-dry (Fire), yet Culpeper rules the flower-de-luce by the cold-moist Moon.' },

    { slug: 'lovage', plant: 'Lovage', bot: 'Levisticum officinale', hortulus: 11, macer: 25,
      planet: 'Sun', qualities: 'hot & dry', degree: '3rd degree',
      qSource: 'Macer',
      signature: 'A solar, warming digestive — the bed where Macer argues with Walahfrid by name.' },

    { slug: 'chervil', plant: 'Chervil', bot: 'Anthriscus cerefolium', hortulus: 12, macer: 27,
      planet: 'Jupiter', qualities: 'hot & dry', degree: 'sharp & fiery',
      qSource: 'Macer' },

    { slug: 'lily', plant: 'Madonna lily', bot: 'Lilium candidum', hortulus: 13, macer: 22,
      planet: 'Moon', qualities: 'hot & moist', degree: null,
      qSource: 'Galenic tradition (variously given)',
      signature: 'The Moon’s silver flower — Walahfrid’s and Macer’s “silver lily,” set against the rose’s gold.' },

    { slug: 'poppy', plant: 'Opium poppy', bot: 'Papaver somniferum', hortulus: 14, macer: 32,
      planet: 'Moon', qualities: 'cold & dry', degree: 'cold & dry',
      qSource: 'Macer',
      signature: 'The Moon’s herb of night and sleep — cold, and dangerous past its dose.' },

    { slug: 'clary', plant: 'Clary sage', bot: 'Salvia sclarea', hortulus: 15, macer: null,
      planet: 'Moon', qualities: 'hot & dry', degree: null,
      qSource: 'Galenic tradition' },

    { slug: 'mint', plant: 'Mint', bot: 'Mentha', hortulus: 16, macer: 47,
      planet: 'Venus', qualities: 'hot & dry', degree: '2nd degree',
      qSource: 'Macer',
      signature: 'A Venus herb — its warming, desire-stirring fame in Macer answers its ruler, though the Galenic temperament reads hotter and drier than Venus.' },

    { slug: 'pennyroyal', plant: 'Pennyroyal', bot: 'Mentha pulegium', hortulus: 17, macer: 16,
      planet: 'Venus', qualities: 'hot & dry', degree: '3rd degree',
      qSource: 'Macer',
      signature: 'Venus-ruled, like its mint kin; a childbirth herb above all.' },

    { slug: 'celery', plant: 'Wild celery', bot: 'Apium graveolens', hortulus: 18, macer: 8,
      planet: 'Mercury', qualities: 'hot & dry', degree: '3rd degree',
      qSource: 'Macer',
      signature: 'Smallage, Mercury’s herb — Walahfrid’s “king of the body,” the stomach.' },

    { slug: 'betony', plant: 'Betony', bot: 'Betonica officinalis', hortulus: 19, macer: 11,
      planet: 'Jupiter', qualities: 'hot & dry', degree: null,
      qSource: 'Galenic tradition (Macer states no degree)',
      signature: 'Jupiter’s sovereign herb — each poem’s most-exalted plant, the carry-it-against-all-harm amulet.' },

    { slug: 'agrimony', plant: 'Agrimony', bot: 'Agrimonia eupatoria', hortulus: 20, macer: null,
      planet: 'Jupiter', qualities: 'hot & dry', degree: null,
      qSource: 'Galenic tradition',
      signature: 'A Jupiter herb of the liver — Walahfrid’s “flesh-glue,” sarcocolla.' },

    { slug: 'ambrosia', plant: 'Ambrosia', bot: 'uncertain', hortulus: 21, macer: null,
      planet: null, qualities: null, degree: null,
      qSource: null,
      signature: 'No correspondence assigned: the bed names its own doubt — even Walahfrid was unsure which plant this is.' },

    { slug: 'catmint', plant: 'Catmint', bot: 'Nepeta cataria', hortulus: 22, macer: 15,
      planet: 'Venus', qualities: 'hot & dry', degree: '3rd degree',
      qSource: 'Macer',
      signature: 'A Venus herb — though Macer, against type, says it checks desire.' },

    { slug: 'radish', plant: 'Radish', bot: 'Raphanus sativus', hortulus: 23, macer: null,
      planet: 'Mars', qualities: 'hot & dry', degree: null,
      qSource: 'Galenic tradition',
      signature: 'Mars’s pungency — the sharp root of the last bed.' },

    { slug: 'rose', plant: 'The Rose', bot: 'Rosa', hortulus: 24, macer: 21,
      planet: 'Venus', qualities: 'cold & dry', degree: 'cold 1°, dry',
      qSource: 'Macer',
      signature: 'Venus’s flower — yet Culpeper splits the kinds: red roses to Jupiter, damask to Venus, white to the Moon. Walahfrid’s “flower of flowers” reads, Galenically, cold and dry.' },

    // ── Macer-only beds (no Hortulus counterpart). Temperament from Macer's own
    //    stated degree where he gives one; planet only where Culpeper is clear.
    { slug: 'mugwort', plant: 'Mugwort', bot: 'Artemisia vulgaris', hortulus: null, macer: 1,
      planet: 'Venus', qualities: 'hot & dry', degree: null, qSource: 'Galenic tradition (Macer states no degree)',
      signature: 'Venus’s herb, named for Artemis — the “mother of herbs” that opens the whole poem.' },
    { slug: 'nettle', plant: 'Nettle', bot: 'Urtica dioica', hortulus: null, macer: 4,
      planet: 'Mars', qualities: 'hot & dry', degree: 'fiery', qSource: 'Macer (very hot); dry by tradition',
      signature: 'Mars’s stinging weed — the armed enemy of Walahfrid’s proem, here turned to use.' },
    { slug: 'garlic', plant: 'Garlic', bot: 'Allium sativum', hortulus: null, macer: 5,
      planet: 'Mars', qualities: 'hot & dry', degree: '4th degree', qSource: 'Macer',
      signature: 'Hot in the fourth (top) degree and ruled by fiery Mars — the two systems rhyme.' },
    { slug: 'plantain', plant: 'Plantain', bot: 'Plantago major', hortulus: null, macer: 6,
      planet: 'Venus', qualities: 'cold & dry', degree: '3rd degree', qSource: 'Macer',
      signature: 'Culpeper gives it to Venus “by antipathy to Mars,” against the other astrologers.' },
    { slug: 'marshmallow', plant: 'Marshmallow', bot: 'Althaea officinalis', hortulus: null, macer: 9,
      planet: 'Venus', qualities: 'cold & moist', degree: null, qSource: 'Galenic tradition (the cooling emollient mallow)' },
    { slug: 'dill', plant: 'Dill', bot: 'Anethum graveolens', hortulus: null, macer: 10,
      planet: 'Mercury', qualities: 'hot & dry', degree: '2nd degree', qSource: 'Macer' },
    { slug: 'savin', plant: 'Savin', bot: 'Juniperus sabina', hortulus: null, macer: 12,
      planet: null, qualities: 'hot & dry', degree: '3rd degree', qSource: 'Macer' },
    { slug: 'leek', plant: 'Leek', bot: 'Allium porrum', hortulus: null, macer: 13,
      planet: 'Mars', qualities: 'hot & dry', degree: null, qSource: 'Galenic tradition (Macer states no degree)' },
    { slug: 'chamomile', plant: 'Chamomile', bot: 'Matricaria chamomilla', hortulus: null, macer: 14,
      planet: 'Sun', qualities: 'hot & dry', degree: '1st degree', qSource: 'Macer',
      signature: 'A herb of the Sun — the golden eye set in the flower.' },
    { slug: 'sorrel', plant: 'Sorrel', bot: 'Rumex acetosa', hortulus: null, macer: 18,
      planet: null, qualities: 'cold & dry', degree: '3rd degree', qSource: 'Macer' },
    { slug: 'purslane', plant: 'Purslane', bot: 'Portulaca oleracea', hortulus: null, macer: 19,
      planet: 'Moon', qualities: 'cold & moist', degree: 'moist 3°, cold 2°', qSource: 'Macer' },
    { slug: 'lettuce', plant: 'Lettuce', bot: 'Lactuca sativa', hortulus: null, macer: 20,
      planet: 'Moon', qualities: 'cold & moist', degree: 'cold & very moist', qSource: 'Macer',
      signature: 'The Moon’s cooling, sleep-giving herb.' },
    { slug: 'savory', plant: 'Savory', bot: 'Satureja hortensis', hortulus: null, macer: 23,
      planet: 'Mercury', qualities: 'hot & dry', degree: 'very hot, less dry', qSource: 'Macer' },
    { slug: 'masterwort', plant: 'Masterwort', bot: 'Peucedanum ostruthium', hortulus: null, macer: 26,
      planet: 'Mars', qualities: 'hot & dry', degree: null, qSource: 'Macer' },
    { slug: 'orache', plant: 'Orache', bot: 'Atriplex hortensis', hortulus: null, macer: 28,
      planet: null, qualities: 'cold & moist', degree: 'cold 1°, moist 2°', qSource: 'Macer' },
    { slug: 'coriander', plant: 'Coriander', bot: 'Coriandrum sativum', hortulus: null, macer: 29,
      planet: null, qualities: 'cold & dry', degree: 'cold, astringent', qSource: 'Macer' },
    { slug: 'cress', plant: 'Garden cress', bot: 'Lepidium sativum', hortulus: null, macer: 30,
      planet: 'Mars', qualities: 'hot & dry', degree: null, qSource: 'Macer' },
    { slug: 'rocket', plant: 'Rocket', bot: 'Eruca sativa', hortulus: null, macer: 31,
      planet: 'Mars', qualities: 'hot & dry', degree: 'moderately hot', qSource: 'Macer',
      signature: 'Mars’s herb of heat and desire — the famous aphrodisiac.' },
    { slug: 'onion', plant: 'Onion', bot: 'Allium cepa', hortulus: null, macer: 33,
      planet: 'Mars', qualities: 'hot & dry', degree: null, qSource: 'Galenic tradition (Macer leaves the doctors disputing)' },
    { slug: 'bugloss', plant: 'Bugloss', bot: 'Anchusa officinalis', hortulus: null, macer: 34,
      planet: 'Jupiter', qualities: 'hot & moist', degree: null, qSource: 'Galenic tradition (the sanguine borage)',
      signature: 'Jupiter’s sanguine, heart-gladdening herb — the borage that makes the feast merry.' },
    { slug: 'mustard', plant: 'Mustard', bot: 'Sinapis alba', hortulus: null, macer: 35,
      planet: 'Mars', qualities: 'hot & dry', degree: '4th degree', qSource: 'Macer',
      signature: 'With garlic at the top of the heat-scale — and Mars’s fire to match.' },
    { slug: 'cabbage', plant: 'Cabbage', bot: 'Brassica oleracea', hortulus: null, macer: 36,
      planet: 'Moon', qualities: 'hot & dry', degree: null, qSource: 'Galenic tradition (a drying herb)',
      signature: 'A drying herb, yet Culpeper rules the coleworts by the watery Moon — the systems part.' },
    { slug: 'parsnip', plant: 'Parsnip', bot: 'Pastinaca sativa', hortulus: null, macer: 37,
      planet: 'Venus', qualities: 'hot & moist', degree: null, qSource: 'Galenic tradition (the nourishing root)' },
    { slug: 'oregano', plant: 'Oregano', bot: 'Origanum vulgare', hortulus: null, macer: 38,
      planet: 'Mercury', qualities: 'hot & dry', degree: '3rd degree', qSource: 'Macer' },
    { slug: 'wild-thyme', plant: 'Wild thyme', bot: 'Thymus serpyllum', hortulus: null, macer: 39,
      planet: 'Venus', qualities: 'hot & dry', degree: null, qSource: 'Macer' },
    { slug: 'violet', plant: 'Violet', bot: 'Viola odorata', hortulus: null, macer: 40,
      planet: 'Venus', qualities: 'cold & moist', degree: '1st degree', qSource: 'Macer',
      signature: 'Venus’s cool flower — which Macer ranks above the rose and the lily.' },
    { slug: 'birthwort', plant: 'Birthwort', bot: 'Aristolochia', hortulus: null, macer: 41,
      planet: null, qualities: 'hot & dry', degree: 'dry 1°, hot 2°', qSource: 'Macer' },
    { slug: 'elecampane', plant: 'Elecampane', bot: 'Inula helenium', hortulus: null, macer: 44,
      planet: 'Mercury', qualities: 'hot & moist', degree: 'moist 1°, hot 2°', qSource: 'Macer' },
    { slug: 'hyssop', plant: 'Hyssop', bot: 'Hyssopus officinalis', hortulus: null, macer: 45,
      planet: 'Jupiter', qualities: 'hot & dry', degree: '3rd degree', qSource: 'Macer' },
    { slug: 'asarabacca', plant: 'Asarabacca', bot: 'Asarum europaeum', hortulus: null, macer: 46,
      planet: 'Mars', qualities: 'hot & dry', degree: '3rd degree', qSource: 'Macer' },
    { slug: 'galingale', plant: 'Galingale', bot: 'Cyperus longus', hortulus: null, macer: 48,
      planet: null, qualities: 'hot & dry', degree: '2nd degree', qSource: 'Macer' },
    { slug: 'peony', plant: 'Peony', bot: 'Paeonia officinalis', hortulus: null, macer: 49,
      planet: 'Sun', qualities: 'hot & dry', degree: '2nd degree', qSource: 'Macer',
      signature: 'A herb of the Sun — Galen’s amulet against the falling sickness.' },
  ],
};
