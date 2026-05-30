// enzymes.js — curated restriction-enzyme dataset for the Enzyme Table.
// Each entry: [name, site, cut5, cut3, organism?]
//   cut5 = top-strand cut offset from site start
//   cut3 = bottom-strand cut offset (in top-strand coordinates)
// Overhang spans [min(cut5,cut3) .. max]; 5' when cut5<cut3, 3' when cut5>cut3,
// blunt when equal. All sites here are palindromic (so the overhang is its own
// reverse-complement, which is exactly what makes ligation matching clean).
// Cut coordinates follow the standard REBASE/textbook definitions.
window.ENZYME_DATA = [
  // ---- 6-cutters, 5' overhangs ----
  ['EcoRI','GAATTC',1,5,'Escherichia coli RY13'],
  ['MfeI','CAATTG',1,5,'Mycoplasma fermentans'],
  ['BamHI','GGATCC',1,5,'Bacillus amyloliquefaciens H'],
  ['BglII','AGATCT',1,5,'Bacillus globigii'],
  ['BclI','TGATCA',1,5,'Bacillus caldolyticus'],
  ['HindIII','AAGCTT',1,5,'Haemophilus influenzae Rd'],
  ['XhoI','CTCGAG',1,5,'Xanthomonas holcicola'],
  ['SalI','GTCGAC',1,5,'Streptomyces albus G'],
  ['NheI','GCTAGC',1,5,'Neisseria mucosa'],
  ['SpeI','ACTAGT',1,5,'Sphaerotilus natans'],
  ['XbaI','TCTAGA',1,5,'Xanthomonas badrii'],
  ['AvrII','CCTAGG',1,5,'Anabaena variabilis'],
  ['NcoI','CCATGG',1,5,'Nocardia corallina'],
  ['BspHI','TCATGA',1,5,'Bacillus sphaericus'],
  ['PciI','ACATGT',1,5,'Planococcus citreus'],
  ['AflII','CTTAAG',1,5,'Anabaena flos-aquae'],
  ['MluI','ACGCGT',1,5,'Micrococcus luteus'],
  ['BsiWI','CGTACG',1,5,'Bacillus stearothermophilus'],
  ['Acc65I','GGTACC',1,5,'Acinetobacter calcoaceticus'],
  ['AgeI','ACCGGT',1,5,'Agrobacterium gelatinovorum'],
  ['BspEI','TCCGGA',1,5,'Bacillus species'],
  ['XmaI','CCCGGG',1,5,'Xanthomonas malvacearum'],
  ['NgoMIV','GCCGGC',1,5,'Neisseria gonorrhoeae MS11'],
  ['EagI','CGGCCG',1,5,'Enterobacter agglomerans'],

  // ---- 6-cutters, 3' overhangs ----
  ['PstI','CTGCAG',5,1,'Providencia stuartii 164'],
  ['KpnI','GGTACC',5,1,'Klebsiella pneumoniae OK8'],
  ['SacI','GAGCTC',5,1,'Streptomyces achromogenes'],
  ['SphI','GCATGC',5,1,'Streptomyces phaeochromogenes'],
  ['ApaI','GGGCCC',5,1,'Acetobacter pasteurianus'],
  ['AatII','GACGTC',5,1,'Acetobacter aceti'],

  // ---- 6-cutters, blunt ----
  ['SmaI','CCCGGG',3,3,'Serratia marcescens'],
  ['EcoRV','GATATC',3,3,'Escherichia coli J62'],
  ['HpaI','GTTAAC',3,3,'Haemophilus parainfluenzae'],
  ['DraI','TTTAAA',3,3,'Deinococcus radiodurans'],
  ['ScaI','AGTACT',3,3,'Streptomyces caespitosus'],
  ['StuI','AGGCCT',3,3,'Streptomyces tubercidicus'],
  ['PvuII','CAGCTG',3,3,'Proteus vulgaris'],
  ['NruI','TCGCGA',3,3,'Nocardia rubra'],
  ['FspI','TGCGCA',3,3,'Fischerella species'],
  ['NaeI','GCCGGC',3,3,'Nocardia aerocolonigenes'],

  // ---- 6-cutters, 2-nt overhangs ----
  ['NdeI','CATATG',2,4,'Neisseria denitrificans'],
  ['ClaI','ATCGAT',2,4,'Caryophanon latum L'],
  ['BstBI','TTCGAA',2,4,'Bacillus stearothermophilus'],
  ['NarI','GGCGCC',2,4,'Nocardia argentinensis'],

  // ---- 8-cutters ----
  ['NotI','GCGGCCGC',2,6,'Nocardia otitidis-caviarum'],
  ['AscI','GGCGCGCC',2,6,'Arthrobacter species'],
  ['FseI','GGCCGGCC',6,2,'Frankia species'],
  ['SbfI','CCTGCAGG',6,2,'Streptomyces species Bf-61'],
  ['PacI','TTAATTAA',5,3,'Pseudomonas alcaligenes'],
  ['PmeI','GTTTAAAC',4,4,'Pseudomonas mendocina'],
  ['SwaI','ATTTAAAT',4,4,'Staphylococcus warneri'],

  // ---- 4-cutters ----
  ['AluI','AGCT',2,2,'Arthrobacter luteus'],
  ['HaeIII','GGCC',2,2,'Haemophilus aegyptius'],
  ['RsaI','GTAC',2,2,'Rhodopseudomonas sphaeroides'],
  ['HhaI','GCGC',3,1,'Haemophilus haemolyticus'],
  ['HpaII','CCGG',1,3,'Haemophilus parainfluenzae'],
  ['MspI','CCGG',1,3,'Moraxella species'],
  ['TaqI','TCGA',1,3,'Thermus aquaticus'],
  ['Sau3AI','GATC',0,4,'Staphylococcus aureus 3A'],
  ['MboI','GATC',0,4,'Moraxella bovis'],
  ['DpnI','GATC',2,2,'Diplococcus pneumoniae'],
  ['NlaIII','CATG',4,0,'Neisseria lactamica'],
];
