// ─────────────────────────────────────────────────────────────────────────────
// iching.js — a grounded, deterministic reading engine for the Yijing.
//
// Two layers, kept separate. (1) A STRUCTURAL reader that reasons the way classical
// commentators do: it decomposes the figure into its trigrams, reads each line's
// position-doctrine (correctness 正, centrality 中, correspondence 應, the ruling
// line), and composes prose from a vocabulary grounded in the sources. Same cast →
// same words (Borges-style). (2) The CANONICAL TEXT — our own open translation of
// the Zhouyi (read/iching/data.js, mirrored to clock/lib/zhouyi.js). Pass that table
// to composeReading() and it attaches, to exactly the line(s) and judgment(s) a cast
// surfaces under Zhu Xi's rules, the received 卦辭/爻辭 in our translation. The
// structural prose then reads as commentary *around* the authentic text, not in place
// of it. Omit the table and you get the structural layer alone (the older behaviour).
//
// Apparatus & sources are documented in /yijing (the "Method" tab) and below:
//  · Trigram attributes — Shuogua (8th Wing); table per Wikipedia "Bagua".
//  · Line doctrine (zheng/zhong/ying, ruling line) — classical exegesis (Wilhelm
//    intro; Legge, Sacred Books of the East XVI, 1882, public domain).
//  · Moving-line rules — Zhu Xi, Yixue Qimeng (易學啟蒙); summarised at
//    castiching.com & biroco.com.
//  Hexagram Judgments carried in the page are editorial paraphrases grounded in
//  Legge/Wilhelm — NOT direct quotations; the generated copy is flagged as such.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

function xmur3(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0;};}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const seeded=key=>mulberry32(xmur3('yi:'+key)());
const pick=(arr,key)=>arr[Math.floor(seeded(key)()*arr.length)];

// ── the eight trigrams, indexed by 3-bit code (bit0 = bottom line, 1 = yang) ──
// nature/attribute/family from the Shuogua; element per the Bagua table.
export const TRIGRAMS = {
  7:{zh:'乾',py:'Qián',en:'The Creative',nature:'heaven',attr:'strong',family:'father',element:'metal',counsel:'makes its strength tireless'},
  3:{zh:'兌',py:'Duì',en:'The Joyous',nature:'lake',attr:'joyous',family:'youngest daughter',element:'metal',counsel:'gladdens others and draws them near'},
  5:{zh:'離',py:'Lí',en:'The Clinging',nature:'fire',attr:'clinging',family:'middle daughter',element:'fire',counsel:'clings to what is right and sheds light'},
  1:{zh:'震',py:'Zhèn',en:'The Arousing',nature:'thunder',attr:'arousing',family:'eldest son',element:'wood',counsel:'rouses things to movement and life'},
  6:{zh:'巽',py:'Xùn',en:'The Gentle',nature:'wind',attr:'penetrating',family:'eldest daughter',element:'wood',counsel:'reaches everywhere by gentle persistence'},
  2:{zh:'坎',py:'Kǎn',en:'The Abysmal',nature:'water',attr:'dangerous',family:'middle son',element:'water',counsel:'flows on without flinching through danger'},
  4:{zh:'艮',py:'Gèn',en:'Keeping Still',nature:'mountain',attr:'still',family:'youngest son',element:'earth',counsel:'knows when to stop and keep still'},
  0:{zh:'坤',py:'Kūn',en:'The Receptive',nature:'earth',attr:'yielding',family:'mother',element:'earth',counsel:'carries all things with devotion'},
};
const triBits=y=>y[0]+y[1]*2+y[2]*4;

// ── the six positions: the social/spatial ladder (Wilhelm; Legge) ──
const POS_SHORT=['the foot','the inner field','the threshold','the court','the throne','the apex'];
const POS_LONG=[
  'the foot — the beginning, still hidden and low',
  'the inner field — the place of the responsive official',
  'the threshold — the exposed top of the lower trigram, a place of danger',
  'the court — close to power, and to its peril',
  'the throne — central and commanding, the ruler’s own place',
  'the apex — beyond the action: the sage, or what is already past',
];

export function lines2yang(lines){ return lines.map(v=>v===7||v===9?1:0); }

export function decompose(lines){
  const y=lines2yang(lines);
  return {
    y,
    lower:TRIGRAMS[triBits([y[0],y[1],y[2]])],
    upper:TRIGRAMS[triBits([y[3],y[4],y[5]])],
    nucLower:TRIGRAMS[triBits([y[1],y[2],y[3]])],   // inner trigram, lines 2-3-4
    nucUpper:TRIGRAMS[triBits([y[2],y[3],y[4]])],   // inner trigram, lines 3-4-5
  };
}

// per-line doctrine: correctness (zheng), centrality (zhong), correspondence (ying), ruler
export function lineProps(lines){
  const y=lines2yang(lines);
  return lines.map((v,i)=>{
    const yang=y[i]===1, oddPlace=(i%2===0);          // places 1,3,5 are "odd" → proper to yang
    const partner=i<3?i+3:i-3;
    return {
      pos:i+1, value:v, yang, moving:(v===6||v===9),
      correct: yang===oddPlace,                        // 正: yang in odd place, yin in even
      central: (i===1||i===4),                         // 中: 2nd & 5th places
      ruler:   (i===4),                                // the throne governs
      partner: partner+1,
      responds: y[i]!==y[partner],                     // 應: holds when the pair are opposite
    };
  });
}

export function movingLines(lines){ const m=[]; lines.forEach((v,i)=>{ if(v===6||v===9) m.push(i); }); return m; }

// ── Zhu Xi's rules: which text(s) a cast surfaces (Yixue Qimeng) ──
export function zhuXiFocus(lines){
  const m=movingLines(lines), k=m.length, top=m[m.length-1], bottom=m[0];
  const nonMoving=[0,1,2,3,4,5].filter(i=>!m.includes(i));
  switch(k){
    case 0: return {rule:'No lines move.', read:'judgment of the primary', lines:[]};
    case 1: return {rule:'One line moves — read that line.', read:'one line', lines:[m[0]]};
    case 2: return {rule:'Two lines move — read both, but the upper governs.', read:'two lines (upper rules)', lines:m, governs:top};
    case 3: return {rule:'Three lines move — read the judgments of both hexagrams; the primary is your present, the relating your trend.', read:'both judgments', lines:[]};
    case 4: return {rule:'Four lines move — in the relating hexagram, read the lower of the two still lines.', read:'a still line of the relating hexagram', lines:[nonMoving[0]], relating:true};
    case 5: return {rule:'Five lines move — in the relating hexagram, read its single still line.', read:'the lone still line of the relating hexagram', lines:[nonMoving[0]], relating:true};
    case 6: return {rule:'All six lines move — read the judgment of the relating hexagram (the Creative and the Receptive have their own “all-lines” text).', read:'judgment of the relating hexagram', lines:[]};
  }
}

export function transformedLines(lines){ return lines.map(v=> v===6?7 : v===9?8 : v); }

// ───────────────────────── procedural composition ─────────────────────────
const rel=(u,l)=> u===l ? 'redoubled' : 'over';
function imageLine(d, hexEn){
  const u=d.upper, l=d.lower;
  if(u===l) return `${cap(u.nature)} ${rel(u,l)} — ${hexEn}. The noble one ${u.counsel}.`;
  return `${cap(u.nature)} over ${l.nature} — ${hexEn}. The noble one ${u.counsel}, and ${l.counsel}.`;
}
function structureLine(props, key){
  const ruler=props[4], field=props[1];
  const a=[];
  a.push(`The throne (fifth place) is ${ruler.yang?'firm':'yielding'} and ${ruler.correct?'correctly placed':'out of its proper place'}${ruler.central?', and central':''}`);
  a.push(ruler.responds
    ? `it answers to the inner field below — ruler and minister hold together`
    : `it stands without an answer below — the ruler acts alone`);
  const nc=props.filter(p=>p.correct).length;
  a.push(nc>=5?`nearly every line sits in its proper place — a settled figure`
        : nc<=1?`almost no line sits where it belongs — an unsettled, contrary figure`
        : `${nc} of the six lines sit correctly`);
  return a.join('; ')+'.';
}
const CHANGE={6:'a yielding line on the point of hardening into action',9:'a firm line on the point of relaxing into yielding'};
function lineReading(p, key){
  const place=POS_SHORT[p.pos-1];
  const bits=[`${ordinal(p.pos)} place — ${place}`];
  bits.push(p.correct?'a line in its proper place':'a line out of place');
  if(p.central) bits.push('and central');
  if(p.ruler)   bits.push('the ruler’s own seat');
  bits.push(p.responds?'it finds its answer across the figure':'it has no answer across the figure');
  const tail = pick([
    'so the change here carries weight',
    'so what moves here is the crux of the matter',
    'so attend to this line above the rest',
  ], key+':'+p.pos);
  return `${cap(bits.join(', '))}: ${CHANGE[p.value]} — ${tail}.`;
}

// the whole reading, assembled from the structure.
// ZHOUYI (optional) = our open translation keyed by King Wen number; when given, the
// canonical 卦辭/爻辭 are attached to exactly what this cast surfaces (see footer).
export function composeReading(lines, HEX, ZHOUYI){
  const code=lines.reduce((c,v,i)=>c|((v===7||v===9)?1<<i:0),0);
  const primaryNo=codeToNo(HEX,code);
  const tl=transformedLines(lines), tcode=tl.reduce((c,v,i)=>c|((v===7||v===9)?1<<i:0),0);
  const transformedNo=codeToNo(HEX,tcode);
  const d=decompose(lines), props=lineProps(lines), m=movingLines(lines), focus=zhuXiFocus(lines);
  const key=primaryNo+'/'+m.join('-');

  const out={ primaryNo, transformedNo:(m.length?transformedNo:null), moving:m,
    lower:d.lower, upper:d.upper, nuclear:{lower:d.nucLower, upper:d.nucUpper},
    image:imageLine(d, HEX[primaryNo].en),
    structure:structureLine(props, key),
    focus, lineReadings:[] };

  // which line readings to surface, per Zhu Xi
  if(focus.lines.length){
    const hx = focus.relating ? tl : lines;
    const rp = lineProps(hx);
    out.lineReadings = focus.lines.map(i=>({
      pos:i+1, relating:!!focus.relating,
      hexNo: focus.relating ? transformedNo : primaryNo,   // which hexagram this line belongs to
      text:lineReading(rp[i], key),                        // structural gloss
    }));
  }

  // ── attach the canonical translation for exactly what this cast surfaces ──
  if(ZHOUYI){
    const k=m.length;
    out.judgment = ZHOUYI[primaryNo]?.judgment || null;                     // 卦辭 of the primary
    out.relating = out.transformedNo ? {                                    // the transitional / 之卦
      no: out.transformedNo,
      judgment: ZHOUYI[out.transformedNo]?.judgment || null,
      // why we look at it, and how hard, per the moving-line count:
      role: !k ? null
          : k>=6 ? 'whole'                  // all move → the relating Judgment IS the answer (Hex 1/2 excepted)
          : k===3 ? 'coequal'              // three move → both Judgments are read (present / trend)
          : (k>=4 ? 'host' : 'trend'),     // 4–5 move → the surfaced line lives here; 1–2 → it shows the tendency
    } : null;
    // all six moving: Hexagrams 1 & 2 alone have their own all-lines text (用九 / 用六)
    out.useLine = (k===6 && ZHOUYI[primaryNo]?.useLine) ? ZHOUYI[primaryNo].useLine : null;
    // splice the canonical line-text onto each surfaced line
    out.lineReadings = out.lineReadings.map(x => ({
      ...x, canonical: ZHOUYI[x.hexNo]?.lines?.[x.pos-1] || null,
    }));
  }
  return out;
}

// helpers
function codeToNo(HEX,code){ for(let n=1;n<=64;n++){ let c=0; const b=HEX[n].b; for(let i=0;i<6;i++) if(b[i]==='1') c|=1<<i; if(c===code) return n; } }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function ordinal(n){ return ['first','second','third','fourth','fifth','sixth'][n-1]||n+'th'; }

// docs helpers (used by the Method tab to show the apparatus from the same data)
export const POSITIONS = POS_LONG;
export function trigramRows(){
  return [7,3,5,1,6,2,4,0].map(code=>{ const t=TRIGRAMS[code];
    const g=[code&1,(code>>1)&1,(code>>2)&1];   // bottom→top
    return {...t, glyph:g}; });
}
export const ZHUXI_RULES=[
  [0,'no lines move','read the judgment of the primary hexagram'],
  [1,'one line moves','read that line’s text'],
  [2,'two lines move','read both lines — the upper governs'],
  [3,'three lines move','read the judgments of both hexagrams (primary = present, relating = trend)'],
  [4,'four lines move','in the relating hexagram, read the lower of its two still lines'],
  [5,'five lines move','in the relating hexagram, read its single still line'],
  [6,'all six move','read the relating hexagram’s judgment (Hexagrams 1 & 2 have their own all-lines text)'],
];

if (typeof globalThis!=='undefined') globalThis.ICHING={ TRIGRAMS, decompose, lineProps, movingLines, zhuXiFocus, transformedLines, composeReading, trigramRows, ZHUXI_RULES };
