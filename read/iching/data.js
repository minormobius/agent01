// ─────────────────────────────────────────────────────────────────────────────
// data.js — an original, openly-licensed translation of the Zhouyi (周易), the
// base text of the Yijing: each hexagram's Judgment (卦辭) and line texts (爻辭).
//
// This is the canonical home of the translation. The Chinese shown is the
// RECEIVED text (the transmitted Wang Bi recension). The English is ours. Notes
// mark graph readings, textual cruxes, and Mawangdui variants. It is a
// transparent WORKING translation — corrections welcome — not a claim to be
// definitive. Licensed CC BY-SA 4.0; the source text is ancient / public domain.
//
// Pilot: Hexagram 1 (乾 Qián) only — the template. 63 to come.
// Shape mirrors read/'s tale data: passages → segments {z, py, e, n}.
// ─────────────────────────────────────────────────────────────────────────────

export const ZHOUYI = {
  meta: {
    title: 'Zhouyi 周易 — an open translation',
    license: 'CC BY-SA 4.0',
    method: "Original translation. The Chinese is the received (Wang Bi) recension; the English is ours. "+
      "Notes flag graph readings, cruxes, and where the Mawangdui silk manuscript differs. A transparent "+
      "working translation, openly licensed — not a claim to definitiveness.",
    sources: [
      { label: 'Zhouyi 周易 · 乾 — received text', url: 'https://ctext.org/book-of-changes/qian', host: 'Chinese Text Project (ctext.org)' },
      { label: 'James Legge, The Yî King (Sacred Books of the East XVI, 1882) — reference', url: 'https://sacred-texts.com/ich/index.htm', host: 'sacred-texts.com (public domain)' },
      { label: 'Mawangdui silk Yijing — variants', url: 'https://en.wikipedia.org/wiki/Mawangdui_Silk_Texts', host: 'Wikipedia' },
    ],
  },

  hexagrams: {
    1: {
      no: 1,
      name: { zh: '乾', py: 'Qián', en: 'The Creative · Force' },
      figure: '111111',                   // bottom→top, 1 = yang
      judgment: {
        z: '元亨利貞', py: 'yuán hēng lì zhēn',
        e: 'The Creative. From the origin it flows through to success; it furthers, and it rewards the steadfast.',
        n: '元亨利貞 — read by the Confucian Wings as four cardinal virtues: 元 origin/sublimity, 亨 success '+
           '(originally 享, an offering “accepted”), 利 benefit/furthering, 貞 steadfast correctness. The oldest '+
           'layer reads more plainly as an omen — “a great offering; favourable to divine” — since 貞 in Shang '+
           'oracle-bone use means “to put a question to the oracle.” We render the received virtue-sense and flag '+
           'the divinatory root. In the Mawangdui silk text the hexagram is written 鍵 (jiàn), not 乾.',
      },
      lines: [
        { pos: 1, name: '初九', z: '潛龍勿用', py: 'qián lóng wù yòng',
          e: 'Nine at the beginning: a dragon lies hidden. Do not act.',
          n: '潛龍, the submerged dragon — power present but not yet to be used. The lowest place: the time of '+
             'concealment. 勿用, “do not employ it.”' },
        { pos: 2, name: '九二', z: '見龍在田，利見大人', py: 'xiàn lóng zài tián, lì jiàn dàrén',
          e: 'Nine in the second place: the dragon appears in the field. It furthers one to see the great person.',
          n: 'The graph 見 turns twice: first as xiàn, “appears,” then as jiàn, “to see” — a deliberate pivot. '+
             '在田, “in the field”: emerged, but still on the ground. 大人, the great person — one of standing whose '+
             'help now counts; the second place answers to the fifth, the throne.' },
        { pos: 3, name: '九三', z: '君子終日乾乾，夕惕若厲，无咎', py: 'jūnzǐ zhōngrì qián-qián, xī tì ruò lì, wú jiù',
          e: 'Nine in the third place: the noble one is tireless the whole day through, and at nightfall still wary, as though in danger. No blame.',
          n: '乾乾 reduplicates the hexagram’s own name as a verb — “strong-and-strong,” ceaselessly diligent. '+
             '惕 wary/anxious; 若厲, “as if there were danger.” The third place is the exposed top of the lower '+
             'trigram, a place of risk; vigilance there earns 无咎, “no blame.”' },
        { pos: 4, name: '九四', z: '或躍在淵，无咎', py: 'huò yuè zài yuān, wú jiù',
          e: 'Nine in the fourth place: now it leaps up, now it stays in the deep. No blame.',
          n: '或, “at times / perhaps”; 躍, to leap; 淵, the abyss-pool. The dragon hesitates at the threshold '+
             'between depth and flight — the fourth place, just below the throne, is a place of testing. Either '+
             'way, rightly taken, is blameless.' },
        { pos: 5, name: '九五', z: '飛龍在天，利見大人', py: 'fēi lóng zài tiān, lì jiàn dàrén',
          e: 'Nine in the fifth place: the dragon flies in heaven. It furthers one to see the great person.',
          n: 'The ruling line: a firm line in the honoured, central fifth place — its proper seat. 飛龍在天 is '+
             'power fully come into its own.' },
        { pos: 6, name: '上九', z: '亢龍有悔', py: 'kàng lóng yǒu huǐ',
          e: 'Nine at the top: the dragon overreaches; there is regret.',
          n: '亢 (kàng), strained too high, overweening (the graph also means “throat”). Past the fifth there is '+
             'nowhere left to climb; force pressed beyond its peak brings 悔, “regret.”' },
      ],
      useLine: {
        name: '用九', z: '見群龍无首，吉', py: 'jiàn qún lóng wú shǒu, jí',
        e: 'Using the nines: a host of dragons appears, none of them foremost. Auspicious.',
        n: 'Read only when all six lines are old yang (all changing). 群龍无首, “a flock of dragons without a '+
           'head” — strength that does not insist on leading. Hexagrams 1 and 2 alone carry such an all-lines '+
           'text (here 用九; in Kūn, 用六).',
      },
      note: 'The six lines trace one image through six stages — the dragon hidden, appearing, toiling, poised, '+
            'soaring, overreaching: the life-curve of any rising force, and the warning folded into its peak.',
    },
  },
};

if (typeof window !== 'undefined') window.ZHOUYI = ZHOUYI;
