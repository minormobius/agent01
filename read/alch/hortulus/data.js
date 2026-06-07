// ─────────────────────────────────────────────────────────────────────────────
// data.js — an ORIGINAL English translation of Walahfrid Strabo's HORTULUS
// (Liber de cultura hortorum), set beside the Latin, line for line.
//
//   Walahfrid Strabo (c.808–849), monk and abbot of Reichenau.
//   Liber de cultura hortorum ("Hortulus") — 444 dactylic hexameters, c. 840s,
//   dedicated to Grimald, abbot of St Gall.
//
// SOURCE OF TRUTH (Tranche 1). The Latin is transcribed from the received
// printed text (Heinrich Canisius → Migne, Patrologia Latina 114), via the
// public full text on Latin Wikisource — read directly, not from OCR. Lightly
// normalised: consonantal j → i (iacenti, iuventa, iam, iaculata); the stray
// Migne column marker "114.1123A" stripped from the Ruta section; and one
// dittographic line in the proem (a repeated "Tenuia porrigerent radicis
// acumina, caeco") dropped. These are noted, not hidden. Other transmitted
// spellings (quaecunque, sylvae, Pestanae) are left as printed and glossed.
//
// DEEPER SPINE TO CONVERGE ON: the critical edition — MGH, Poetae Latini aevi
// Carolini II, ed. E. Dümmler (Berlin 1884) — and behind it the St Gall /
// Reichenau manuscript tradition. A later tranche collates against these.
//
// The English is ours. This is a transparent WORKING translation — corrections
// welcome. A section is "planted" iff it carries `lines`; the rest are fallow
// beds, enumerated in the poem's order, awaiting later tranches. CC BY-SA 4.0.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

export const HORTULUS = {
  meta: {
    title: 'Hortulus',
    work: 'Liber de cultura hortorum',
    author: 'Walahfrid Strabo (c.808–849), of Reichenau',
    date: 'c. 840s',
    dedicatee: 'Grimald, abbot of St Gall',
    license: 'CC BY-SA 4.0',
    method:
      'Walahfrid’s garden poem in 444 hexameters: the labour of the plot, then ' +
      'twenty-three plants bed by bed, closing — deliberately — on the lily and ' +
      'the rose. The Latin is transcribed from the received printed text ' +
      '(Canisius → Migne PL 114) and lightly normalised (j→i; a leaked Migne ' +
      'column marker removed; one repeated line in the proem dropped); other ' +
      'transmitted spellings are kept and glossed. The English is an original ' +
      'line-for-line translation. Botanical identifications follow the standard ' +
      'reading; the genuinely disputed ones (Gladiola, Ambrosia) are flagged.',
    latinSource: 'Received text (Canisius → Migne, Patrologia Latina 114), via Latin Wikisource',
    convergeOn: 'MGH, Poetae Latini aevi Carolini II (Dümmler, Berlin 1884), and the St Gall manuscript',
    sources: [
      { label: 'Hortulus — full Latin text', host: 'la.wikisource.org', url: 'https://la.wikisource.org/wiki/Hortulus' },
      { label: 'MGH, Poetae Latini aevi Carolini II, ed. Dümmler (Berlin 1884) — the critical text to converge on', host: 'geschichtsquellen.de/werk/4676', url: 'https://geschichtsquellen.de/werk/4676' },
      { label: 'Payne & Blunt, Hortulus (Hunt Botanical, 1966) — with the St Gall manuscript', host: 'archive.org', url: 'https://archive.org/details/hortulus0000wala' },
    ],
  },

  // Every section in the poem's order. `seq` orders them; `roman` is the source's
  // numbering (the proem is I; the plants are II–XXIV). A bed is planted when it
  // has `lines`. `correspondence` is reserved for the Tranche-2 overlay (planet ·
  // element · qualities · signature) — NOT Walahfrid, and cited separately when added.
  sections: [

    // ── The author's preface ──────────────────────────────────────────────
    {
      seq: 0, roman: '', kind: 'preface',
      la: 'Praefatio auctoris', en: 'The Author’s Preface',
      lines: [
        { la: 'Plurima tranquillae cum sint insignia vitae,', en: 'Many though the marks of a tranquil life may be,' },
        { la: 'Non minimum est, si quis Pestanae deditus arti,', en: 'it is no small one, if a man given to the art of Paestum',
          n: '“Pestanae” (so the printed text) = Paestanae, of Paestum — the southern Italian town famed for its rose-gardens, here a byword for gardening itself.' },
        { la: 'Noverit obsceni curas tractare Priapi.', en: 'has learned to tend the cares of unchaste Priapus.',
          n: 'Priapus, the rustic god set up to guard gardens; “obsceni” is his standing epithet.' },
        { la: 'Ruris enim quaecunque datur possessio, seu sit', en: 'For whatever holding of land falls to you — be it' },
        { la: 'Putris arenoso qua torpet glarea tractu,', en: 'crumbling, where gravel lies sluggish in a sandy reach,' },
        { la: 'Seu pingui mollita graves uligine fetus,', en: 'or, softened with rich marsh-damp, heavy with growth;' },
        { la: 'Collibus erectis alte sita, sive iacenti', en: 'set high on steep hills, or on a level' },
        { la: 'Planitie facilis clivo, seu vallibus horrens;', en: 'plain easy of slope, or bristling among valleys —' },
        { la: 'Non negat ingenuos olerum progignere fructus:', en: 'it does not refuse to bring forth the honest fruits of the garden,' },
        { la: 'Si modo non tua cura gravi compressa veterno,', en: 'if only your care, not crushed by sluggish torpor,' },
        { la: 'Multiplices olitoris opes contemnere stultis', en: 'schools itself in foolish ventures to despise' },
        { la: 'Ausibus assuescit, callosasque aere diurno', en: 'a gardener’s manifold riches, and refuse to brown' },
        { la: 'Detrectat fuscare manus, et stercora plenis', en: 'its calloused hands in the daily air, and shun' },
        { la: 'Vitat in arenti disponere pulvere quallis.', en: 'to spread the dung from brimming baskets on the parched dust.' },
        { la: 'Haec non sola mihi patefecit opinio famae', en: 'This no mere talk of common rumour' },
        { la: 'Vulgaris, quaesita libris nec lectio priscis,', en: 'has opened to me, nor reading sought in ancient books,' },
        { la: 'Sed labor et studium, quibus otia longa dierum', en: 'but labour and study — to which I gave the long leisure' },
        { la: 'Postposui, expertum rebus docuere probatis.', en: 'of my days — taught me, by trial, through things well proven.' },
      ],
      note: 'The poem opens not with a flower but with a defence of manual labour: the soil — any soil — repays the gardener who will dirty his hands. Walahfrid stakes his authority on practice, not on the old books.',
    },

    // ── I. The proem: the labour, and the nettles ─────────────────────────
    {
      seq: 1, roman: 'I', kind: 'proem',
      la: 'Culturae initium', en: 'The Beginning of Cultivation',
      lines: [
        { la: 'Bruma senectutis vernacula totius anni', en: 'Winter — the home-bred old age of the whole year,' },
        { la: 'Venter, et ampliflui consumptrix saeva laboris,', en: 'its glutton belly, the savage waster of all our toil —' },
        { la: 'Veris ubi adventu terrarum pulsa sub imas', en: 'when, at spring’s coming, driven beneath the deep' },
        { la: 'Delituit latebras, vestigiaque horrida avarae', en: 'hollows of earth it hid — and the grim tracks of greedy' },
        { la: 'Ver hiemis reduci rerum delere pararet', en: 'winter Spring made ready to wipe away' },
        { la: 'Stemmate, et antiquo languentia rura nitori', en: 'with the returning garland of things, and to give the drooping fields' },
        { la: 'Reddere, ver orbis primum caput et decus anni:', en: 'back their old lustre — Spring, the world’s first head and the year’s glory:' },
        { la: 'Purior aura diem cum iam reserare serenum', en: 'when now a purer air began to unbar' },
        { la: 'Inciperet, zephyroque herbae floresque secuti', en: 'the clear day, and grasses and flowers, following the west wind,' },
        { la: 'Tenuia porrigerent radicis acumina, caeco', en: 'put out the fine points of their roots, long sealed' },
        { la: 'Tecta diu gremio, canasque exosa pruinas;', en: 'in the dark lap of earth, and loathing the grey frosts;' },
        { la: 'Cum sylvae foliis, montes quoque gramine pingui,', en: 'when the woods with leaves, the hills too with lush grass,' },
        { la: 'Prataque conspicuis vernarent laeta virectis:', en: 'and the glad meadows were greening with bright young growth —' },
        { la: 'Atriolum, quod pro foribus mihi parva patenti', en: 'the little court, which before my door a small open' },
        { la: 'Area vestibulo solis convertit ad ortum,', en: 'plot, for an entry-way, turns toward the rising sun,' },
        { la: 'Urticae implerunt, campique per aequora parvi', en: 'nettles had filled; and over the levels of that little field' },
        { la: 'Illita ferventi creverunt tela veneno.', en: 'grew up their darts, smeared with burning venom.',
          n: 'The famous opening conceit: the weeds are an armed enemy — the nettle’s sting a poisoned spear — and the garden is a war the gardener must win before he can plant.' },
      ],
      note: 'Winter is personified as the year’s decrepit, devouring old age; spring as a returning king crowned with new growth. Then the camera drops to Walahfrid’s own sun-facing forecourt — overrun with nettles. The grand cosmic turn of the seasons resolves into one man clearing weeds by hand.',
    },

    // ── II. Sage ──────────────────────────────────────────────────────────
    {
      seq: 2, roman: 'II', kind: 'plant',
      la: 'Salvia', en: 'Sage', bot: 'Salvia officinalis',
      lines: [
        { la: 'Elelifagus prima praefulget honore locorum,', en: 'Sage shines first in the honour of its place,',
          n: '“Elelifagus” = Greek elelisphakos, the learned name for sage; Walahfrid gives it pride of place at the head of the beds.' },
        { la: 'Dulcis odore, gravis virtute, atque utilis haustu.', en: 'sweet in scent, strong in virtue, and good to drink.' },
        { la: 'Pluribus haec hominum morbis prodesse reperta,', en: 'Found to help against many of the ills of men,' },
        { la: 'Perpetuo viridi meruit gaudere iuventa.', en: 'it has earned to enjoy a green youth without end.' },
        { la: 'Sed tolerat civile malum: nam saeva parentem', en: 'Yet it bears a civil evil: for its own savage' },
        { la: 'Progenies florum, fuerit ni dempta, perurit,', en: 'brood of new shoots, unless cut back, scorches the parent,' },
        { la: 'Et facit antiquos defungier invida ramos.', en: 'and, full of envy, makes the old branches die.',
          n: '“defungier” — an archaic passive infinitive, “to die.” A real horticultural observation dressed as a tragedy of the household: prune the vigorous new growth or it strangles the old wood.' },
      ],
      note: 'Sage opens the catalogue, ever-green and many-virtued — but Walahfrid turns its growth-habit into a small fable of a house at war with itself: the children destroying the parent unless the gardener intervenes.',
    },

    // ── III. Rue ────────────────────────────────────────────────────────────
    {
      seq: 3, roman: 'III', kind: 'plant',
      la: 'Ruta', en: 'Rue', bot: 'Ruta graveolens',
      lines: [
        { la: 'Hoc nemus umbriferum pingit viridissima rutae', en: 'This shady grove is painted by the deep-green little wood' },
        { la: 'Silvula caeruleae, foliis quae praedita parvis', en: 'of blue-grey rue, which, set with small leaves',
          n: '“caerulea” — the cool blue-green of rue’s foliage; Walahfrid sees the herb-bed as a miniature shaded woodland (“silvula”, a little wood).' },
        { la: 'Umbellas iaculata breves, spiramina venti', en: 'and casting up its short umbels, lets the breath of the wind' },
        { la: 'Et radios Phoebi caules transmittit ad imos,', en: 'and the rays of Phoebus pass down through to its deepest stalks,' },
        { la: 'Attactuque graves leni dispergit odores.', en: 'and at a gentle touch gives off its heavy scents.' },
        { la: 'Haec cum multiplici vigeat virtute medelae,', en: 'Since it thrives with manifold healing virtue,' },
        { la: 'Dicitur occultis apprime obstare venenis,', en: 'it is said before all to stand against hidden poisons,' },
        { la: 'Toxicaque invasis incommoda pellere fibris.', en: 'and to drive the toxic mischiefs from the organs they have invaded.',
          n: 'Rue’s ancient fame as the great antidote (Pliny, Dioscorides). Its airy, light-admitting habit is drawn first; then its power against poison.' },
      ],
      note: 'After sage, rue: drawn first as a thing of beauty — an open, light-filled little thicket — and only then as the classical antidote that drives poison from the body.',
    },

    // ── IV. Southernwood ────────────────────────────────────────────────────
    {
      seq: 4, roman: 'IV', kind: 'plant',
      la: 'Abrotonum', en: 'Southernwood', bot: 'Artemisia abrotanum',
      lines: [
        { la: 'Nec minus Abrotoni promptum est mirarier alte', en: 'No less a marvel are Southernwood’s tall,',
          n: '“mirarier” — an archaic infinitive (= mirari, to wonder at).' },
        { la: 'Pubentis frutices, et quas inspicat aristas', en: 'downy shoots — and the fine spikes its teeming' },
        { la: 'Ramorum ubertas, tenues imitata capillos.', en: 'wealth of branches throws up, like delicate strands of hair.' },
        { la: 'Huius odoratum lento cum vimine crinem', en: 'Its fragrant foliage, plucked with the pliant stem,' },
        { la: 'Paeoniis carptum prodest miscere medelis', en: 'it profits to blend into healing cures:',
          n: '“Paeoniis medelis” — Paeonian, i.e. healing, after Paeon, physician of the gods.' },
        { la: 'Febribus obstat enim, telum fugat, adiuvat artus', en: 'for it withstands fevers, puts the dart to flight, and aids the limbs' },
        { la: 'Quos incerta premit furtivae iniuria guttae.', en: 'that the fitful hurt of a stealthy “drop” oppresses.',
          n: '“gutta” — a drop; in humoral medicine a defluxion that settles in a joint. It is the word behind English “gout.”' },
        { la: 'Praeterea tot habet vires quot fila comarum.', en: 'Besides, it has as many powers as its leaf has threads.' },
      ],
      note: 'Southernwood’s feathery, hair-like foliage gives Walahfrid his close: its virtues are past counting — as many as the threads of its leaf. A fever-herb and antidote.',
    },

    // ── V. Bottle gourd ──────────────────────────────────────────────────────
    {
      seq: 5, roman: 'V', kind: 'plant',
      la: 'Cucurbita', en: 'Bottle gourd', bot: 'Lagenaria siceraria',
      lines: [
        { la: 'Haud secus altipetax, semente cucurbita vili', en: 'No otherwise the high-reaching gourd: from a cheap seed,' },
        { la: 'Assurgens, parmis foliorum suscitat umbras', en: 'rising, with the little shields of its leaves it raises',
          n: '“parmis” — small round shields; the gourd’s broad round leaves.' },
        { la: 'Ingentes, crebrisque iacit retinacula ramis:', en: 'huge shadows, and flings out its holdfasts on crowding shoots:' },
        { la: 'Ac velut ulmum hedera implicuit cum frontibus altam,', en: 'And as when ivy has wound its fronds about a tall elm,' },
        { la: 'Ruris abusque sinu toti sua brachia circum', en: 'and from the very lap of the ground has thrown its arms' },
        { la: 'Laxa dedit ligno, summumque secuta cacumen', en: 'loosely all round the whole trunk, and, following to the topmost crown,' },
        { la: 'Corticis occuluit viridi tutamine rugas:', en: 'has hidden the bark’s wrinkles under a green guard:' },
        { la: 'Aut arbustivum vitis genus, arbore cum se', en: 'or as the tree-trained kind of vine, when upon a tree' },
        { la: 'Explicuit quavis, ramorumque alta corymbis', en: 'of any sort it has spread itself, and clothed the high boughs' },
        { la: 'Vestiit, et propria sursum se sponte levavit:', en: 'with clusters, and of its own will has lifted itself aloft:' },
        { la: 'Visitur ergo rubens aliena in sede racemus', en: 'so a reddening cluster is seen, in a borrowed seat,' },
        { la: 'Dependere, premit tabulata virentia Bacchus,', en: 'to hang down; Bacchus weighs the greening tiers,' },
        { la: 'Pampinus et frondes discernit latior altas.', en: 'and the broader vine-leaf picks out the high foliage.' },
        { la: 'Sic mea sic fragili de stirpe cucurbita surgens', en: 'So, even so, my gourd, rising from a frail stalk,' },
        { la: 'Diligit appositas, sua sustentacula, furcas,', en: 'loves the forked props set by it, its own supports,' },
        { la: 'Atque amplexa suas uncis tenet unguibus alnos', en: 'and, embracing them, grips its alder-poles with hooked nails;' },
        { la: 'Ne vero insano divelli turbine possit,', en: 'and lest it be torn loose by a maddened whirlwind,' },
        { la: 'Quot generat nodos, tot iam retinacula trudit.', en: 'as many knots as it breeds, so many holdfasts it thrusts out.' },
        { la: 'Et quoniam duplicem producunt singula funem,', en: 'And since each single one puts forth a doubled cord,' },
        { la: 'Undique fulturam dextra laevaque prehendunt.', en: 'on every side, right and left, they grip their prop.' },
        { la: 'Et velut in fusum nentes cum pensa puellae', en: 'And as, when girls spinning onto the spindle' },
        { la: 'Mollia traiiciunt, spirisque ingentibus omnem', en: 'throw the soft wool across, and in great coils' },
        { la: 'Filorum seriem pulchros metantur in orbes,', en: 'lay out the whole run of threads in fair rings,' },
        { la: 'Sic vaga tortilibus stringunt amenta catenis', en: 'so its roving thongs bind, with twisting chains,',
          n: '“amenta” — straps or thongs; here the questing tendrils. The spinning-girls simile is Walahfrid at his most Virgilian.' },
        { la: 'Scalarum, teretes involvuntque illico virgas,', en: 'the rungs of the trellis, and at once wrap the smooth rods,' },
        { la: 'Viribus et discunt alienis tecta cavarum', en: 'and on another’s strength they learn to scale the high roofs' },
        { la: 'Ardua porticuum volucri superare natatu.', en: 'of the hollow porches with a winged swimming.' },
        { la: 'Iam quis poma queat ramis pendentia passim', en: 'Now who could fittingly marvel at the fruits' },
        { la: 'Mirari digne? quae non minus undique certis', en: 'that hang here and there from the boughs? — shaped on every side' },
        { la: 'Sunt formata viis, quam si tornatile lignum', en: 'by rules as sure as if you eyed turned wood' },
        { la: 'Inspicias medio rasum, quod mymphure constat.', en: 'pared on the lathe, made true by the turner’s gauge.',
          n: '“mymphure” — an obscure, probably corrupt word (some lathe- or gauge-term); left as transmitted, to be settled against the critical text. A flagged crux.' },
        { la: 'Illa quidem, gracili primum demissa flagello,', en: 'These, at first let down on a slender shoot,' },
        { la: 'Oblongo tenuique ferunt ingentia collo', en: 'bear their huge bodies on a long thin neck;' },
        { la: 'Corpora: tum vastum laxatur in ilia pondus,', en: 'then the vast weight loosens out into the flanks,' },
        { la: 'Totum venter habet, totum alvus, et intus aluntur', en: 'the paunch takes it all, all the belly, and within are fed' },
        { la: 'Multa cavernoso seiunctim carcere grana,', en: 'many seeds, kept apart in a cavernous prison,' },
        { la: 'Quae tibi consimilem possunt promittere messem.', en: 'which can promise you a like harvest to come.' },
        { la: 'Ipsis quin etiam teneri sub tempore fructus', en: 'And more: while the fruit is still tender in season —' },
        { la: 'Ante humor quam clausa latens per viscera sero', en: 'before the moisture, hidden shut within its flesh,' },
        { la: 'Autumni adventu rarescat, et arida circum', en: 'thins at autumn’s late coming, and a dry rind' },
        { la: 'Restiterit cutis, inter opes transire ciborum', en: 'has set all round — we often see it pass' },
        { la: 'Saepe videmus, et ardenti sartagine pinguem', en: 'among the riches of the table, and in a hot pan' },
        { la: 'Combibere arvinam, et placidum segmenta saporem', en: 'drink up the fat, while the slices, a mild savour,' },
        { la: 'Ebria multoties mensis praestare secundis.', en: 'drenched, full often furnish to the dessert course.',
          n: '“mensis secundis” — the “second tables,” the dessert course of a Roman meal.' },
        { la: 'Si vero aestivi sinitur spiramina solis', en: 'But if it is let to bear the breathings of the summer sun' },
        { la: 'Cum genitrice pati, et matura falce recidi,', en: 'with its parent-stalk, and to be cut ripe by the sickle,' },
        { la: 'Idem fetus in assiduos formarier usus', en: 'that same fruit can be shaped for the steady uses' },
        { la: 'Vasorum poterit, vasto dum viscera ventre', en: 'of vessels — once we clear the innards from its vast belly,' },
        { la: 'Egerimus, facili radentes ilia torno.', en: 'scraping the sides out with an easy lathe.' },
        { la: 'Nonnunquam hac ingens sextarius abditur alvo,', en: 'Sometimes a whole pint is stowed in this paunch,',
          n: '“sextarius” — a Roman pint-measure, about half a litre.' },
        { la: 'Clauditur aut potior mensurae portio plenae', en: 'or a greater share of a full measure is shut inside —' },
        { la: 'Amphora, quae piceo linitur dum glutine, servat', en: 'a flask which, smeared with pitch-glue,' },
        { la: 'Incorrupta diu generosi dona Lyaei.', en: 'keeps the gifts of noble Lyaeus uncorrupted long.',
          n: '“Lyaeus” — the Loosener, a name of Bacchus; here, wine. The mature gourd becomes a pitch-sealed wine-flask.' },
      ],
      note: 'The longest of the early beds and the most Virgilian: the gourd climbs like ivy up an elm and like a vine trained through a tree, its tendrils binding the trellis as spinning-girls wind thread onto the spindle. Its lathe-true fruits are eaten young — fried, soaked, served at dessert — or grown to full size, hollowed, and pitched into flasks that keep wine.',
    },

    // ── VI–XXIV. Fallow beds (in the poem's order), awaiting later tranches ──
    { seq: 6,  roman: 'VI',   kind: 'plant', la: 'Pepones',     en: 'Melon',           bot: 'Cucumis melo' },
    { seq: 7,  roman: 'VII',  kind: 'plant', la: 'Absynthium',  en: 'Wormwood',        bot: 'Artemisia absinthium' },
    { seq: 8,  roman: 'VIII', kind: 'plant', la: 'Marrubium',   en: 'White horehound', bot: 'Marrubium vulgare' },
    { seq: 9,  roman: 'IX',   kind: 'plant', la: 'Feniculum',   en: 'Fennel',          bot: 'Foeniculum vulgare' },
    { seq: 10, roman: 'X',    kind: 'plant', la: 'Gladiola',    en: 'Iris / gladdon',  bot: 'Iris sp.', crux: 'Identity disputed — the yellow flag (Iris pseudacorus) or another iris; “gladiola” is also read as a small gladiolus.' },
    { seq: 11, roman: 'XI',   kind: 'plant', la: 'Libisticum',  en: 'Lovage',          bot: 'Levisticum officinale' },
    { seq: 12, roman: 'XII',  kind: 'plant', la: 'Caerefolium', en: 'Chervil',         bot: 'Anthriscus cerefolium' },
    { seq: 13, roman: 'XIII', kind: 'plant', la: 'Lilium',      en: 'Madonna lily',    bot: 'Lilium candidum' },
    { seq: 14, roman: 'XIV',  kind: 'plant', la: 'Papaver',     en: 'Opium poppy',     bot: 'Papaver somniferum' },
    { seq: 15, roman: 'XV',   kind: 'plant', la: 'Sclarea',     en: 'Clary sage',      bot: 'Salvia sclarea' },
    { seq: 16, roman: 'XVI',  kind: 'plant', la: 'Mentha',      en: 'Mint',            bot: 'Mentha sp.' },
    { seq: 17, roman: 'XVII', kind: 'plant', la: 'Puleium',     en: 'Pennyroyal',      bot: 'Mentha pulegium' },
    { seq: 18, roman: 'XVIII',kind: 'plant', la: 'Apium',       en: 'Wild celery',     bot: 'Apium graveolens' },
    { seq: 19, roman: 'XIX',  kind: 'plant', la: 'Bettonica',   en: 'Betony',          bot: 'Betonica officinalis' },
    { seq: 20, roman: 'XX',   kind: 'plant', la: 'Agrimonia',   en: 'Agrimony',        bot: 'Agrimonia eupatoria' },
    { seq: 21, roman: 'XXI',  kind: 'plant', la: 'Ambrosia',    en: 'Ambrosia (?)',    bot: 'uncertain', crux: 'Identity genuinely disputed — variously oak-of-Jerusalem (Chenopodium botrys), wood-sage, or another aromatic; left open.' },
    { seq: 22, roman: 'XXII', kind: 'plant', la: 'Nepeta',      en: 'Catmint',         bot: 'Nepeta cataria' },
    { seq: 23, roman: 'XXIII',kind: 'plant', la: 'Raphanus',    en: 'Radish',          bot: 'Raphanus sativus' },
    { seq: 24, roman: 'XXIV', kind: 'plant', la: 'Rosa',        en: 'The Rose',        bot: 'Rosa (gallica / ×alba)' },

    // ── The dedication, to Grimald ──────────────────────────────────────────
    { seq: 25, roman: '', kind: 'dedication', la: 'Dicatio opusculi', en: 'The Dedication of the Little Work' },
  ],
};
