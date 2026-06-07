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

    // ── VI. Melon ─────────────────────────────────────────────────────────
    {
      seq: 6, roman: 'VI', kind: 'plant',
      la: 'Pepones', en: 'Melon', bot: 'Cucumis melo',
      lines: [
        { la: 'Hoc simul in spatio, campo quo figitur imis', en: 'In this same space, where in the lowest ground is set' },
        { la: 'Haec tam laeta seges, vili quam carmine pinxi,', en: 'this crop so glad, which I have painted in cheap verse,',
          n: '“vili carmine pinxi” — the poet glances back at the gourd he has just “painted,” with a modest shrug.' },
        { la: 'Visitur alterius vitis genus acre, per aequor', en: 'another sharp kind of “vine” is seen, creeping' },
        { la: 'Serpere pulvereum, et fructus nutrire rotundos', en: 'over the dusty level, and nursing round' },
        { la: 'Pomorum. Haec species terrae super arida vulgo', en: 'fruits. This sort, lying commonly on the dry' },
        { la: 'Tecta iacens, crementa capit pulcherrima, donec', en: 'roof of earth, takes on the loveliest growth, until,' },
        { la: 'Solibus aestivis flavos intincta colores', en: 'steeped by summer suns in golden colours,' },
        { la: 'Messoris calathos matura fruge replerit.', en: 'ripe, it fills the reaper’s baskets with its yield.' },
        { la: 'Tum videas aliis oblongo stemmate ventrem', en: 'Then on some you would see a belly hung down' },
        { la: 'Demissum, nucis aut ovi versatilis instar:', en: 'on a long stalk, like a nut or a turnable egg:' },
        { la: 'Vel qualis manibus quondam suspensa supinis', en: 'or such as, once, held up in upturned hands,' },
        { la: 'Lucet, agens circum lomenti bulla salivam', en: 'a bubble of soap-froth shines, driving spittle round it,',
          n: 'A child’s soap-bubble: “lomentum” is bean-meal worked into a lather. The round melon is likened to a bubble blown in the hands — one of the poem’s most elaborate conceits (lines 11–20).' },
        { la: 'Ante recens maceratur aquis quam spuma refusis,', en: 'while still fresh it is worked into foam with water poured again,' },
        { la: 'Dum lentescit adhuc digitis luctantibus, et se', en: 'while it grows pliant yet under struggling fingers, and' },
        { la: 'Alternis vicibus, studioque fricantibus uno', en: 'by turns, the fingers rubbing with a single intent' },
        { la: 'Inter utramque manum, parvo fit parvus hiatu', en: 'between the two hands, by a small gap a small' },
        { la: 'Exitus: huc stricto lenis meat ore Noti vis,', en: 'outlet is made: through this narrowed mouth the gentle South wind passes,',
          n: '“Noti vis” — the force of Notus, the south wind; here the breath blown into the bubble.' },
        { la: 'Distenditque cavum vitrea sub imagine pondus,', en: 'and swells the hollow weight to a glassy seeming,' },
        { la: 'Et centrum medio confingit labile fundo,', en: 'and shapes a wavering centre in the middle of its floor,' },
        { la: 'Undique conveniat cameri quo inflexio tecti.', en: 'so that the curve of the vaulted roof may meet on every side.' },
        { la: 'Ergo calybs huius penetrat dum viscera pomi,', en: 'So, when the steel pierces the innards of this fruit,',
          n: '“calybs” = chalybs, steel — the knife.' },
        { la: 'Elicit humoris largos cum semine rivos', en: 'it draws out lavish streams of juice, with manifold' },
        { la: 'Multiplici: tum deinde cavum per plurima tergus', en: 'seed; then, scattering the hollow rind by hand' },
        { la: 'Frusta manu spargens hortorum laetus opimas', en: 'in many pieces, the glad guest takes the rich' },
        { la: 'Delicias conviva capit, candorque saporque', en: 'delights of the gardens, and its whiteness and savour' },
        { la: 'Oblectant fauces: nec duros illa molares', en: 'please the throat; nor does that food make the hard' },
        { la: 'Esca stupere facit, facili sed mansa voratu', en: 'molars ache, but, chewed down in easy swallowing,' },
        { la: 'Vi naturali frigus per viscera nutrit.', en: 'by its natural power it feeds coolness through the body.',
          n: 'The melon’s humoral signature: it is cooling — it “feeds coolness through the body.”' },
      ],
      note: 'A sister to the gourd, but trailing along the ground rather than climbing: a dusty creeper ripening golden in the sun. Its roundness draws the poem’s loveliest digression — a child blowing a soap-bubble — before the knife opens it to its cool, sweet, seed-filled flesh.',
    },

    // ── VII. Wormwood ─────────────────────────────────────────────────────
    {
      seq: 7, roman: 'VII', kind: 'plant',
      la: 'Absynthium', en: 'Wormwood', bot: 'Artemisia absinthium',
      lines: [
        { la: 'Proximus absynthi frutices locus erigit acris,', en: 'The next plot raises the shrubs of sharp wormwood,' },
        { la: 'Herbarum matrem simulantes vimine lento.', en: 'their pliant stems resembling the mother of herbs.',
          n: '“mater herbarum” — “the mother of herbs,” the classical epithet of mugwort (Artemisia vulgaris), wormwood’s near kin.' },
        { la: 'In foliis color est alius, ramisque odor alter', en: 'In its leaves the colour is other, and other the scent on its downy' },
        { la: 'Puberibus, longeque saporis amarior haustus.', en: 'branches, and far more bitter the draught of its taste.' },
        { la: 'Ferventem domuisse sitim, depellere febres', en: 'To master burning thirst, to drive off fevers,' },
        { la: 'Hoc solet auxilium clara virtute probatum.', en: 'this remedy is wont — proven of shining virtue.' },
        { la: 'Si tibi praeterea caput acri forte dolore', en: 'If besides your head should chance to be struck' },
        { la: 'Pulsetur subito, vel si vertigo fatiget,', en: 'of a sudden by a sharp pain, or if dizziness wearies you,' },
        { la: 'Huius opem rimare, coquens frondentis amaram', en: 'search out its help: boil the bitter wood' },
        { la: 'Absynthi silvam, tum iura lebete capaci', en: 'of leafy wormwood, then pour the broth into a roomy' },
        { la: 'Effunde, et capitis perfunde cacumina summi.', en: 'cauldron, and drench the very crown of your head.' },
        { la: 'Quo postquam ablueris graciles humore capillos,', en: 'And after you have washed your thin hair in the liquid,' },
        { la: 'Devinctas frondes superimposuisse memento.', en: 'remember to lay the bound leaves over it.' },
        { la: 'Tum mollis fotos constringat fascia crines,', en: 'Then let a soft band bind your steeped locks,' },
        { la: 'Et post non multas elapsi temporis horas', en: 'and after not many hours of elapsed time' },
        { la: 'Hoc inter reliquas eius mirabere vires.', en: 'you will marvel at this among its other powers.' },
      ],
      note: 'The bitterest bed: wormwood, bitterer than its kin southernwood, against thirst and fever — and then a hands-on cure for headache and vertigo, a decoction poured over the crown and the bruised leaves bound on beneath a band.',
    },

    // ── VIII. White horehound ──────────────────────────────────────────────
    {
      seq: 8, roman: 'VIII', kind: 'plant',
      la: 'Marrubium', en: 'White horehound', bot: 'Marrubium vulgare',
      lines: [
        { la: 'Quid referam iuxta positi nimiumque potentis', en: 'Why should I tell of the over-potent horehound' },
        { la: 'Marrubii non vile genus, licet acrius ora', en: 'planted hard by — no mean kind — though it bites the mouth' },
        { la: 'Mordeat, et longe gustum disiungat odore.', en: 'rather sharply, and sets taste far at odds with smell?' },
        { la: 'Dulce enim olet, non dulce sapit, sed pectoris aegros', en: 'For it smells sweet, tastes not sweet; yet it presses down' },
        { la: 'Comprimit angores, tristi dum sumitur haustu,', en: 'the sick anguish of the chest, when taken in a grim draught,' },
        { la: 'Praecipue talis caleat si potus ab igni,', en: 'above all if such a drink be warmed at the fire,' },
        { la: 'Et coenam cyathis cogatur claudere crebris,', en: 'and one is made to close the meal with cups of it, again and again.' },
        { la: 'Si quando infensae quaesita venena novercae', en: 'If ever the sought-out poisons of a hateful stepmother' },
        { la: 'Potibus immiscent, dapibusve aconita dolosis', en: 'are mixed in the drink, or aconite into the treacherous' },
        { la: 'Tristitia confundunt, extemplo sumpta salubris', en: 'dishes, confounding them with grief — then, taken at once, a wholesome' },
        { la: 'Potio marrubii suspecta pericula pressat.', en: 'draught of horehound crushes the dangers feared.',
          n: 'The stepmother’s poison and aconite are the stock literary signs of murder by the cup; horehound is set against them as antidote.' },
      ],
      note: 'Horehound: sweet to the nose, bitter on the tongue — taste at war with smell. A chest-clearing draught best taken warm, and the bed turns, as several do, to the old fear of the poisoned feast, against which horehound is the cure.',
    },

    // ── IX. Fennel ──────────────────────────────────────────────────────────
    {
      seq: 9, roman: 'IX', kind: 'plant',
      la: 'Feniculum', en: 'Fennel', bot: 'Foeniculum vulgare',
      lines: [
        { la: 'Nec marathri taceatur honor, quod stipite forti', en: 'Nor let the honour of fennel go unsaid, which on a strong stalk' },
        { la: 'Tollitur, et late ramorum brachia tendit;', en: 'is raised, and spreads wide the arms of its branches;' },
        { la: 'Dulce satis gustu, dulcem satis addit odorem.', en: 'sweet enough to the taste, it adds a scent sweet enough.' },
        { la: 'Hoc oculis quos umbra premit prodesse loquuntur.', en: 'This, they say, helps the eyes that shadow weighs upon.',
          n: 'Fennel for failing sight — a classical and medieval commonplace (and the opposite of lovage below, thought to dim the eyes).' },
        { la: 'Huius item semen, fetae cum lacte capellae', en: 'Its seed too, taken with the milk of a kidding she-goat,' },
        { la: 'Absumptum, ventris fertur mollire tumorem,', en: 'is said to soften a swelling of the belly,' },
        { la: 'Cunctantisque moras dissolvere protinus alvi', en: 'and at once to loosen the lingering delays of a sluggish bowel.' },
        { la: 'Praeterea radix marathri, commixta liquori', en: 'Besides, the root of fennel, mixed with the liquor' },
        { la: 'Lenaeo, tussim percepta repellit anhelam.', en: 'of Lenaeus, taken, drives off the panting cough.',
          n: '“Lenaeus” — a name of Bacchus; the liquor is wine (cf. Lyaeus in the gourd).' },
      ],
      note: 'Fennel, named with its Greek word marathrum, tall and sweet: a remedy for dim sight, for a swollen belly (with goat’s milk), and, its root in wine, for a breathless cough.',
    },

    // ── X. Iris / gladdon ─────────────────────────────────────────────────
    {
      seq: 10, roman: 'X', kind: 'plant',
      la: 'Gladiola', en: 'Iris / gladdon', bot: 'Iris sp.',
      crux: 'Identity disputed — read as an iris or as a small gladiolus. The fuller’s use (orris, for stiffening and scenting linen) and the bladder remedy point to Iris (orris root).',
      lines: [
        { la: 'Te neque transierim Latiae cui libera linguae', en: 'Nor would I pass you by — you to whom the free' },
        { la: 'Nomine digladii nomen facundia finxit.', en: 'eloquence of the Latin tongue shaped a name from the sword.',
          n: '“gladiola,” a little gladius (sword) — named for the blade-shaped leaves.' },
        { la: 'Tu mihi purpurei progignis floris honorem,', en: 'You bring forth for me the glory of a purple flower,' },
        { la: 'Prima aestate gerens violae iucunda nigellae', en: 'bearing, in early summer, the pleasant gifts of the dark' },
        { la: 'Munera, vel qualis mensa sub Apollinis alta', en: 'violet; or such as Hyacinthus, beneath Apollo’s high table,' },
        { la: 'Investis pueri pro morte recens Hyacinthus', en: 'sprang up afresh for the unrobed boy’s death,' },
        { la: 'Exiit, et regis signavit vertice nomen.', en: 'and stamped a king’s name upon its crown.',
          n: 'The myth of Hyacinthus, the boy loved by Apollo: from his blood sprang the flower marked, they said, with letters of lament. Walahfrid likens the iris’s bloom to it.' },
        { la: 'Radicis ramenta tuae siccata fluenti', en: 'The shavings of your root, dried, we steep —' },
        { la: 'Diluimus contusa mero, saevumque dolorem', en: 'crushed — in flowing wine, and the savage pain' },
        { la: 'Vesicae premimus tali, non secius, arte.', en: 'of the bladder we press down, no less, by such an art.' },
        { la: 'Pignore, fullo, tuo, lini candentia texta', en: 'By your pledge, O fuller, the white-shining webs of linen' },
        { la: 'Efficit ut rigeant, dulcesque imitentur odores.', en: 'are made to stiffen, and to mimic sweet scents.',
          n: 'The fuller’s orris: iris root stiffens linen and lends it perfume — the use that, with the bladder remedy, points the disputed name toward Iris.' },
      ],
      note: 'The “little sword,” named for its blade-leaves, with a purple flower the poet sets beside the mythic hyacinth sprung from Apollo’s dead beloved. Its dried root serves two trades at once: a wine-steeped remedy for the bladder, and the fuller’s orris that stiffens and scents fine linen.',
    },

    // ── XI. Lovage ──────────────────────────────────────────────────────────
    {
      seq: 11, roman: 'XI', kind: 'plant',
      la: 'Libisticum', en: 'Lovage', bot: 'Levisticum officinale',
      lines: [
        { la: 'Inter odoratam memorare libistica silvam', en: 'Amid the fragrant thicket, the wider love' },
        { la: 'Fortia suadet amor parvi diffusior horti.', en: 'of my little garden urges me to tell of sturdy lovage.' },
        { la: 'Hoc germen succo quamvis et odore gemellis', en: 'Though this shoot is thought, by its juice and scent, to work' },
        { la: 'Orbibus efficere et tenebras inferre putetur,', en: 'upon the twin orbs of the eyes, and to bring on their darkness,',
          n: '“gemellis orbibus” — the twin globes, the eyes; lovage was reputed to dim the sight (the reverse of fennel).' },
        { la: 'Semina saepe tamen quaesitis addere curis', en: 'yet its small seeds are often wont to lend themselves' },
        { la: 'Parva solent, famamque aliena laude mereri.', en: 'to sought-out cures, and to earn their fame by another’s praise.',
          n: 'A modest verdict: lovage shines as an adjunct — it wins its renown by improving other remedies.' },
      ],
      note: 'A short, candid bed: lovage is suspected of harming the eyes, yet Walahfrid will not leave it out — its seeds earn their place, and their fame, as the helper that makes other cures work better.',
    },

    // ── XII. Chervil ────────────────────────────────────────────────────────
    {
      seq: 12, roman: 'XII', kind: 'plant',
      la: 'Caerefolium', en: 'Chervil', bot: 'Anthriscus cerefolium',
      lines: [
        { la: 'Quae tot bellorum, tot famosissima rerum', en: 'You who, devout, with sacred lips fashion the records' },
        { la: 'Magnarum monumenta sacro pia conficis ore,', en: 'of so many wars, of so many most famous great deeds —' },
        { la: 'Exiles, Erato, non dedignare meorum', en: 'do not disdain, Erato, to run through with me in verse',
          n: 'The poem’s mid-point flourish: Walahfrid calls on Erato, muse of poetry, to stoop from epic wars to his slender pot-herbs.' },
        { la: 'Divitias olerum versu perstringere mecum.', en: 'the slender riches of my garden greens.' },
        { la: 'Infirmis divisa licet Macedonia ramis', en: 'Though Macedonia is scattered abroad on frail',
          n: '“Macedonia” — Walahfrid’s learned name for the herb of this bed (chervil); compare the ancient “Macedonian parsley.”' },
        { la: 'Spargitur, et crebris ignobile semen aristis', en: 'branches, and yields but lowly seed on crowded spikes,' },
        { la: 'Sufficit, illa tamen, toto reparabilis anno,', en: 'yet it — renewable the whole year round —' },
        { la: 'Pauperiem largo solatur munere plebis', en: 'comforts the poverty of the humble folk' },
        { la: 'Indignae, nec non restringere sanguinis undas', en: 'with bounteous gift; and it is wont to check the floods of blood' },
        { la: 'Corpore diffusas, facili solet obvia gustu.', en: 'spread through the body, ready at an easy taste.' },
        { la: 'Illa quoque infesto venter dum forte dolore', en: 'It too, when the belly chances to be troubled' },
        { la: 'Turbatur, fomenta super non irrita ducit,', en: 'with hostile pain, draws no idle poultice over it,' },
        { la: 'Puleium sibimet frondesque papaveris addens.', en: 'adding to itself pennyroyal and the leaves of poppy.',
          n: 'The poultice foreshadows two beds still to come — pennyroyal (XVII) and poppy (XIV).' },
      ],
      note: 'At the catalogue’s mid-point Walahfrid invokes Erato and shrugs at his “slender riches.” Chervil (under the learned name Macedonia) is the poor man’s ever-renewing herb: it stanches bleeding, and joins pennyroyal and poppy in a poultice for the gut.',
    },

    // ── XIII. Madonna lily ──────────────────────────────────────────────────
    {
      seq: 13, roman: 'XIII', kind: 'plant',
      la: 'Lilium', en: 'Madonna lily', bot: 'Lilium candidum',
      lines: [
        { la: 'Lilia quo versu candentia, carmine quove', en: 'In what verse, in what song could the dry leanness' },
        { la: 'Ieiunae macies satis efferat arida musae?', en: 'of a starveling muse fittingly extol the white lilies —' },
        { la: 'Quorum candor habet nivei simulacra nitoris.', en: 'whose whiteness holds the very image of snowy brightness?' },
        { la: 'Dulcis odor, silvas imitatur flore Sabaeas.', en: 'Sweet their scent: in flower it rivals the groves of Sheba.',
          n: '“silvas Sabaeas” — the Sabaean (Arabian) groves, byword for frankincense and spice.' },
        { la: 'Non Parius candore lapis, non nardus odore', en: 'Not Parian stone in whiteness, not spikenard in scent,' },
        { la: 'Lilia nostra premit: nec non si perfidus anguis', en: 'outdoes our lilies. And if a treacherous snake,' },
        { la: 'Ingenitis collecta dolis serit ore venena', en: 'with inborn guile, sows from its plague-bearing mouth' },
        { la: 'Pestifero, caecum per vulnus ad intima mortem', en: 'its gathered venom — through the blind wound sending grim death' },
        { la: 'Corde feram mittens, pistillo lilia praesta', en: 'to the heart’s inmost parts — make ready to steep the lilies,' },
        { la: 'Commacerare gravi, succosque haurire falerno.', en: 'crushing them with a heavy pestle, and to draw their juice in Falernian wine.',
          n: '“falernum” — Falernian, the most prized Roman wine; here the menstruum for the remedy.' },
        { la: 'Si quod contusum est summo liventis in ore', en: 'If the crushed pulp be set, prick by prick, on the surface' },
        { la: 'Ponatur punctim, tum iam dignoscere vires', en: 'of the livid bite, then at once you may know' },
        { la: 'Magnificas huiusce datur medicaminis ultro.', en: 'the magnificent powers of this medicine, freely shown.' },
        { la: 'Haec et iam laxis prodest contusio membris.', en: 'This same poultice helps, too, for slackened limbs.' },
      ],
      note: 'The lily gets the grand humility-topos: the “starveling muse” cannot praise a whiteness that outdoes Parian marble and a scent that beats spikenard and the spice-groves of Sheba. Then, abruptly practical — crushed in Falernian wine, it is a poultice for snakebite and for weakened limbs.',
    },

    // ── XIV. Opium poppy ────────────────────────────────────────────────────
    {
      seq: 14, roman: 'XIV', kind: 'plant',
      la: 'Papaver', en: 'Opium poppy', bot: 'Papaver somniferum',
      lines: [
        { la: 'Et cereale quidem nugarum in parte papaver', en: 'And the grain-poppy, too, here in this nook of trifles,',
          n: '“nugarum in parte” — Walahfrid calls his own poem mere “trifles” (nugae), the modesty topos.' },
        { la: 'Hac memorare placet, quod raptae moesta puellae', en: 'it pleases me to name — which the grieving mother of the' },
        { la: 'Mater ut immensis optata oblivia mentem', en: 'ravished girl, that longed-for oblivion might strip her mind' },
        { la: 'Exuerent curis, fertur Latona vorasse.', en: 'of measureless cares, is said — as Latona — to have devoured.',
          n: 'A flagged crux: the myth is Ceres (Demeter), eating poppies to dull her grief for ravished Proserpina. The text names Latona instead — a mythological slip, left as transmitted.' },
        { la: 'Hoc simul auxilio carbunculus, ater ab imo', en: 'By this same help the carbuncle — black, which from the deep' },
        { la: 'Pectore qui ructus nimium convolvit amaros', en: 'chest rolls up belchings overly bitter,' },
        { la: 'Oris adusque fores, reprimi persaepe videtur.', en: 'right to the doors of the mouth — is very often seen suppressed.' },
        { la: 'Huius ad alta caput, granorum semine fetum', en: 'Its head aloft, teeming with the seed of its grains,' },
        { la: 'Protento fragilique solet se tollere collo,', en: 'is wont to raise itself on a long and brittle neck,' },
        { la: 'Inque modum mali, regio cui Punica nomen', en: 'and, in the manner of the apple to which the Punic land' },
        { la: 'Indidit, unius patulo sub pellis amictu', en: 'gave its name, under the spreading wrap of a single skin' },
        { la: 'Grana celebrandae virtutis plurima claudit.', en: 'it shuts very many grains of a virtue to be famed.',
          n: '“mali Punici” — the Punic apple, the pomegranate; the seed-packed poppy-head is likened to it.' },
        { la: 'Deque sono mandentis habet formabile nomen.', en: 'and from the sound of chewing it takes its fashioned name.',
          n: 'A folk etymology: “papaver” is said to echo the sound of munching the seeds.' },
      ],
      note: 'The poppy carries the bed’s richest mythology — the mother eating poppies to forget her ravished daughter (Walahfrid’s text says Latona, but the tale is Ceres and Proserpina). It soothes bitter heartburn, lifts a pomegranate-like seed-head on a brittle neck, and supposedly takes its very name from the sound of chewing.',
    },

    // ── XV. Clary sage (with costmary) ───────────────────────────────────────
    {
      seq: 15, roman: 'XV', kind: 'plant',
      la: 'Sclarea', en: 'Clary sage', bot: 'Salvia sclarea',
      lines: [
        { la: 'Hic umbrosa novos inter sclarea virores,', en: 'Here shady clary, amid the fresh green,' },
        { la: 'Stipite praevalido assurgens, ramosque comasque', en: 'rising on a stout stalk, lifts its branches and leaves' },
        { la: 'Altius extollit: quae quamvis rarius ulli', en: 'higher; and though it is more rarely sought by any' },
        { la: 'Quaesita auxilio, medicorum pene putetur', en: 'for help — all but thought to have escaped' },
        { la: 'Effugisse manus, dulci tamen indita caldae', en: 'the physicians’ hands — yet, steeped in sweet warm wine,',
          n: '“calda” — a warm spiced wine-and-water; clary was added to drink for strength and aroma.' },
        { la: 'Et vires et odorati fermenta saporis', en: 'it gives both strength and the ferment of a fragrant savour.' },
        { la: 'Praestat, eam iuxta hortensis non extima costi', en: 'Beside it the garden’s no-mean thicket of costmary' },
        { la: 'Silva latet, stomachique moras ventremque salubri', en: 'lies hidden, and it stirs the stoppages of stomach and belly' },
        { la: 'Provocat auxilio, radicis munere coctae.', en: 'with wholesome help, by the gift of its boiled root.',
          n: 'The bed quietly holds two herbs: clary, and its neighbour costmary (costus), whose boiled root aids digestion.' },
      ],
      note: 'Clary is the herb the doctors overlook, yet it lends warmth and fragrance to spiced wine. Walahfrid lets a second plant share the bed — costmary alongside — whose boiled root settles the stomach.',
    },

    // ── XVI. Mint ────────────────────────────────────────────────────────────
    {
      seq: 16, roman: 'XVI', kind: 'plant',
      la: 'Mentha', en: 'Mint', bot: 'Mentha sp.',
      lines: [
        { la: 'Nec mihi defuerit vulgaris copia menthae', en: 'Nor would the common wealth of mint fail me,' },
        { la: 'Multa per et genera et species diversa coloresque', en: 'through its many kinds, its varied species, colours,' },
        { la: 'Et vires: huius quoddam genus utile vocem', en: 'and powers: one useful kind of it, they think,' },
        { la: 'Raucisonam claro rursus redhibere canori', en: 'can give a hoarse voice back to clear song again,' },
        { la: 'Posse putant, eius succos si fauce vorarit', en: 'if he should swallow its juices on a fasting' },
        { la: 'Ieiuna, quem crebra premens raucedo fatigat.', en: 'throat, whom nagging hoarseness wears away.' },
        { la: 'Est aliud praepingue genus huiusce frutecti,', en: 'There is another, fat-leaved kind of this bush,' },
        { la: 'Quod iam non parvi diffundat germinis umbras,', en: 'which spreads the shade of no small shoot now,' },
        { la: 'Celsa ebuli sed more petens, a stipite forti', en: 'but, climbing tall in the manner of danewort, from a strong stalk',
          n: '“ebulum” — danewort or dwarf elder, a tall coarse plant; the second mint grows as high.' },
        { la: 'Undique maiores foliorum porrigat alas,', en: 'puts out on all sides the broader wings of its leaves,' },
        { la: 'Quis odor alter inest, pauloque immitior haustus.', en: 'in which is another scent, and a somewhat harsher draught.' },
        { la: 'Sed si qui vires, species, et nomina menthae', en: 'But if any can tell the powers, the kinds, the names' },
        { la: 'Ad plenum memorare potest, sciat ille necesse est', en: 'of mint in full, he needs must know as well' },
        { la: 'Aut quot Erythreo volitent in gurgite pisces,', en: 'how many fish dart in the Red Sea’s flood,' },
        { la: 'Lemnius aut altum quot in aera Mulciber ire', en: 'or how many sparks the Lemnian Mulciber sees fly' },
        { la: 'Scintillas vastis videat fornacibus Aetnae.', en: 'to the high air from the vast furnaces of Etna.',
          n: '“Mulciber” — Vulcan, the Lemnian smith-god; the mint’s kinds are as countless as the fish of the Red Sea or the sparks of Etna.' },
      ],
      note: 'Mint defeats the catalogue: its kinds, colours, and powers are past numbering. One sort restores a hoarse singing voice; another grows tall and harsh like danewort — and to count them all, Walahfrid says, you would have to number the fish of the Red Sea and the sparks of Etna.',
    },

    // ── XVII. Pennyroyal ─────────────────────────────────────────────────────
    {
      seq: 17, roman: 'XVII', kind: 'plant',
      la: 'Puleium', en: 'Pennyroyal', bot: 'Mentha pulegium',
      lines: [
        { la: 'Non patitur cunctas angustia carminis huius', en: 'The narrowness of this poem does not allow' },
        { la: 'Pulei virtutes celeri comprendere versu.', en: 'all pennyroyal’s virtues to be grasped in hasty verse.' },
        { la: 'Hoc apud Indorum tanti constare peritos', en: 'Among the Indians’ experts it is said to cost as dear' },
        { la: 'Fertur, apud Gallos quanti valet Indica nigri', en: 'as a heap of black Indian pepper is worth among the Gauls;' },
        { la: 'Congeries piperis, quis iam dubitare sinetur', en: 'so who will be suffered now to doubt' },
        { la: 'Hac herba plures leniri posse labores?', en: 'that many a trouble can be eased by this herb?' },
        { la: 'Quam pretiis inhianter emit ditissima tantis', en: 'which the richest of races, awash in ebony and gold,' },
        { la: 'Gens, hebenoque auroque fluens, et mira volenti', en: 'buys greedily at prices so high — a people bearing' },
        { la: 'Quaeque ferens mundo, o magni laudanda Tonantis', en: 'every wonder to the eager world. O praiseworthy' },
        { la: 'Virtus et ratio, nullis quae munera terris', en: 'Virtue and Reason of the great Thunderer, which to no lands',
          n: '“Tonans,” the Thunderer — a classical title of Jupiter, here for God.' },
        { la: 'Larga suae non pandit opis, quae rara sub isto', en: 'spreads not the bounteous gifts of its wealth alone: what you' },
        { la: 'Axe videre soles, aliis in partibus horum', en: 'rarely see under this sky, in other regions' },
        { la: 'Copia tanta iacet, quantam vilissima tecum', en: 'lies in such plenty as the cheapest things make with you;' },
        { la: 'Efficiunt: rursus quaedam quae spreta videntur', en: 'and again, certain things that seem despised,' },
        { la: 'Forte tibi, magno mercantur ditia regna,', en: 'perhaps, by you, rich kingdoms buy at great price,' },
        { la: 'Altera ut alterius potiatur fenore tellus,', en: 'that one land may gain by another’s interest,' },
        { la: 'Orbis et in toto per partes una domus sit.', en: 'and in all the world, through its parts, be one house.',
          n: 'The poem’s great digression: God spreads goods unevenly across the earth so that trade should bind every land into a single household.' },
        { la: 'Puleium quam decoctum curabit amice', en: 'Pennyroyal, decocted, will kindly mend' },
        { la: 'Et potu et fotu stomachum (mihi crede) morantem.', en: 'a sluggish stomach, by drink and by poultice — believe me.' },
        { la: 'Dum canimus quae certa gravi ratione tenemus', en: 'While we sing what we hold sure by weighty reason,' },
        { la: 'Quaedam audita, et iam vero miscere cothurno', en: 'and some things heard by report — and now indeed to mix' },
        { la: 'Fas ususque sinit: ramum coniungito pulei', en: 'the high buskin is right, and use allows — bind a sprig of pennyroyal',
          n: '“cothurnus” — the tragic buskin, i.e. the elevated style.' },
        { la: 'Auriculae, ne forte caput turbaverit aestus', en: 'to your ear, lest the heat of the sun perchance trouble your head,' },
        { la: 'Solis in aerio si te perflarit aperto.', en: 'if it blast upon you out in the open air.' },
        { la: 'Quod nisi me currens deponere vela Thalia', en: 'And did not Thalia, in full course, force me to strike' },
        { la: 'Cogeret, ac tandem portus intrare moneret,', en: 'my sails, and bid me make harbour at last,' },
        { la: 'Hinc tibi multiplices poteram decerpere flores.', en: 'from here I could pluck you flowers without number.',
          n: '“Thalia” — the muse; the strike-sail-and-make-harbour image is Walahfrid reining in the catalogue.' },
      ],
      note: 'The richest bed of all: pennyroyal, prized in the East as pepper is in Gaul, launches the poem’s famous meditation that God distributes the world’s goods unevenly so that commerce should make one household of all lands. Then, gently, back to earth — a decoction for a slow stomach, a sprig behind the ear against sunstroke — before the muse Thalia orders the sails struck and the harbour made.',
    },

    // ── XVIII–XXIV. Fallow beds (in the poem's order), awaiting later tranches ──
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
