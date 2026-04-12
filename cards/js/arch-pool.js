// ── Arch Pool — structural elements & iconic buildings ──────
// Each entry: [title, structuralSystem, properties]
//   title: Wikipedia article name
//   structuralSystem: arch|beam|buttress|column|dome|foundation|wall|truss
//   properties: { strength, span, complexity, material, era, rarity }

export const STRUCTURAL_SYSTEMS = {
  arch:       { name: "Arch",          icon: "\u2312", color: "#c4a35a" },
  beam:       { name: "Beam & Frame",  icon: "\u2550", color: "#7a8b99" },
  buttress:   { name: "Buttress",      icon: "\u25F9", color: "#8b7355" },
  column:     { name: "Column",        icon: "\u2503", color: "#b8a88a" },
  dome:       { name: "Dome & Vault",  icon: "\u25E0", color: "#5a7a8b" },
  foundation: { name: "Foundation",    icon: "\u25AC", color: "#6b6b6b" },
  wall:       { name: "Wall & Facade", icon: "\u25AE", color: "#9a7b6b" },
  truss:      { name: "Truss & Cable", icon: "\u25B3", color: "#6a8b6a" },
};

// strength: load-bearing capacity (1-10)
// span: maximum practical span in metres (1-1500)
// complexity: construction complexity (1-10)
// material: "stone"|"brick"|"timber"|"iron"|"steel"|"concrete"|"composite"
// era: "ancient"|"medieval"|"renaissance"|"industrial"|"modern"
// rarity: "common"|"uncommon"|"rare"|"legendary"

export const ARCH_POOL = [
  // ── Arches ─────────────────────────────────────────────────
  ["Arch", "arch", { strength: 7, span: 30, complexity: 4, material: "stone", era: "ancient", rarity: "common" }],
  ["Pointed arch", "arch", { strength: 8, span: 25, complexity: 5, material: "stone", era: "medieval", rarity: "uncommon" }],
  ["Horseshoe arch", "arch", { strength: 6, span: 15, complexity: 6, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Ogee", "arch", { strength: 5, span: 12, complexity: 7, material: "stone", era: "medieval", rarity: "rare" }],
  ["Corbel arch", "arch", { strength: 5, span: 6, complexity: 3, material: "stone", era: "ancient", rarity: "common" }],
  ["Parabolic arch", "arch", { strength: 9, span: 80, complexity: 7, material: "concrete", era: "modern", rarity: "uncommon" }],
  ["Segmental arch", "arch", { strength: 6, span: 20, complexity: 4, material: "brick", era: "ancient", rarity: "common" }],
  ["Triumphal arch", "arch", { strength: 7, span: 15, complexity: 8, material: "stone", era: "ancient", rarity: "rare" }],
  ["Voussoir", "arch", { strength: 7, span: 10, complexity: 5, material: "stone", era: "ancient", rarity: "common" }],
  ["Keystone (architecture)", "arch", { strength: 9, span: 10, complexity: 3, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Catenary arch", "arch", { strength: 8, span: 40, complexity: 5, material: "brick", era: "industrial", rarity: "uncommon" }],
  ["Lancet window", "arch", { strength: 5, span: 8, complexity: 6, material: "stone", era: "medieval", rarity: "uncommon" }],

  // ── Beams & Frames ─────────────────────────────────────────
  ["I-beam", "beam", { strength: 8, span: 20, complexity: 3, material: "steel", era: "industrial", rarity: "common" }],
  ["Cantilever", "beam", { strength: 7, span: 50, complexity: 6, material: "steel", era: "industrial", rarity: "uncommon" }],
  ["Girder", "beam", { strength: 8, span: 30, complexity: 4, material: "steel", era: "industrial", rarity: "common" }],
  ["Lintel", "beam", { strength: 5, span: 5, complexity: 2, material: "stone", era: "ancient", rarity: "common" }],
  ["Post and lintel", "beam", { strength: 5, span: 6, complexity: 2, material: "stone", era: "ancient", rarity: "common" }],
  ["Beam (structure)", "beam", { strength: 6, span: 10, complexity: 2, material: "timber", era: "ancient", rarity: "common" }],
  ["Box girder bridge", "beam", { strength: 9, span: 60, complexity: 7, material: "steel", era: "modern", rarity: "uncommon" }],
  ["Prestressed concrete", "beam", { strength: 9, span: 45, complexity: 8, material: "concrete", era: "modern", rarity: "uncommon" }],
  ["Glued laminated timber", "beam", { strength: 6, span: 30, complexity: 5, material: "timber", era: "modern", rarity: "uncommon" }],
  ["Reinforced concrete", "beam", { strength: 8, span: 35, complexity: 5, material: "concrete", era: "modern", rarity: "common" }],

  // ── Buttresses ─────────────────────────────────────────────
  ["Buttress", "buttress", { strength: 8, span: 3, complexity: 4, material: "stone", era: "ancient", rarity: "common" }],
  ["Flying buttress", "buttress", { strength: 7, span: 10, complexity: 8, material: "stone", era: "medieval", rarity: "rare" }],
  ["Pier (architecture)", "buttress", { strength: 7, span: 2, complexity: 3, material: "stone", era: "ancient", rarity: "common" }],
  ["Abutment", "buttress", { strength: 8, span: 3, complexity: 5, material: "stone", era: "ancient", rarity: "common" }],
  ["Counterfort", "buttress", { strength: 7, span: 3, complexity: 5, material: "stone", era: "medieval", rarity: "uncommon" }],
  ["Retaining wall", "buttress", { strength: 7, span: 5, complexity: 4, material: "concrete", era: "ancient", rarity: "common" }],
  ["Seawall", "buttress", { strength: 6, span: 8, complexity: 6, material: "concrete", era: "ancient", rarity: "uncommon" }],
  ["Embankment (earthworks)", "buttress", { strength: 5, span: 20, complexity: 3, material: "composite", era: "ancient", rarity: "common" }],

  // ── Columns ────────────────────────────────────────────────
  ["Column", "column", { strength: 7, span: 2, complexity: 3, material: "stone", era: "ancient", rarity: "common" }],
  ["Doric order", "column", { strength: 8, span: 3, complexity: 5, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Ionic order", "column", { strength: 7, span: 3, complexity: 6, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Corinthian order", "column", { strength: 7, span: 3, complexity: 8, material: "stone", era: "ancient", rarity: "rare" }],
  ["Composite order", "column", { strength: 7, span: 3, complexity: 9, material: "stone", era: "ancient", rarity: "rare" }],
  ["Tuscan order", "column", { strength: 8, span: 3, complexity: 4, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Caryatid", "column", { strength: 6, span: 2, complexity: 10, material: "stone", era: "ancient", rarity: "legendary" }],
  ["Pilaster", "column", { strength: 5, span: 1, complexity: 5, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Obelisk", "column", { strength: 4, span: 1, complexity: 7, material: "stone", era: "ancient", rarity: "rare" }],
  ["Minaret", "column", { strength: 5, span: 2, complexity: 7, material: "brick", era: "medieval", rarity: "uncommon" }],
  ["Colonnade", "column", { strength: 7, span: 4, complexity: 6, material: "stone", era: "ancient", rarity: "uncommon" }],

  // ── Domes & Vaults ─────────────────────────────────────────
  ["Dome", "dome", { strength: 8, span: 40, complexity: 7, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Barrel vault", "dome", { strength: 7, span: 20, complexity: 5, material: "stone", era: "ancient", rarity: "common" }],
  ["Groin vault", "dome", { strength: 7, span: 25, complexity: 6, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Rib vault", "dome", { strength: 8, span: 30, complexity: 7, material: "stone", era: "medieval", rarity: "uncommon" }],
  ["Fan vault", "dome", { strength: 7, span: 20, complexity: 9, material: "stone", era: "medieval", rarity: "rare" }],
  ["Pendentive", "dome", { strength: 8, span: 35, complexity: 8, material: "stone", era: "ancient", rarity: "rare" }],
  ["Cupola", "dome", { strength: 5, span: 8, complexity: 5, material: "timber", era: "medieval", rarity: "common" }],
  ["Geodesic dome", "dome", { strength: 9, span: 100, complexity: 7, material: "steel", era: "modern", rarity: "rare" }],
  ["Onion dome", "dome", { strength: 5, span: 10, complexity: 7, material: "timber", era: "medieval", rarity: "uncommon" }],
  ["Squinch", "dome", { strength: 6, span: 10, complexity: 6, material: "stone", era: "ancient", rarity: "uncommon" }],

  // ── Foundations ─────────────────────────────────────────────
  ["Foundation (engineering)", "foundation", { strength: 9, span: 5, complexity: 5, material: "concrete", era: "ancient", rarity: "common" }],
  ["Deep foundation", "foundation", { strength: 10, span: 3, complexity: 8, material: "concrete", era: "modern", rarity: "uncommon" }],
  ["Caisson (engineering)", "foundation", { strength: 9, span: 8, complexity: 9, material: "steel", era: "industrial", rarity: "rare" }],
  ["Cofferdam", "foundation", { strength: 7, span: 15, complexity: 7, material: "steel", era: "ancient", rarity: "uncommon" }],
  ["Spread footing", "foundation", { strength: 7, span: 4, complexity: 3, material: "concrete", era: "ancient", rarity: "common" }],
  ["Pile cap", "foundation", { strength: 8, span: 5, complexity: 6, material: "concrete", era: "modern", rarity: "uncommon" }],
  ["Raft foundation", "foundation", { strength: 8, span: 30, complexity: 5, material: "concrete", era: "modern", rarity: "uncommon" }],

  // ── Walls & Facades ────────────────────────────────────────
  ["Curtain wall (architecture)", "wall", { strength: 3, span: 50, complexity: 7, material: "composite", era: "modern", rarity: "uncommon" }],
  ["Load-bearing wall", "wall", { strength: 8, span: 6, complexity: 3, material: "stone", era: "ancient", rarity: "common" }],
  ["Shear wall", "wall", { strength: 9, span: 8, complexity: 6, material: "concrete", era: "modern", rarity: "uncommon" }],
  ["Facade", "wall", { strength: 3, span: 20, complexity: 5, material: "stone", era: "ancient", rarity: "common" }],
  ["Parapet", "wall", { strength: 4, span: 3, complexity: 3, material: "stone", era: "ancient", rarity: "common" }],
  ["Battlement", "wall", { strength: 5, span: 4, complexity: 5, material: "stone", era: "medieval", rarity: "uncommon" }],
  ["Clerestory", "wall", { strength: 3, span: 10, complexity: 6, material: "stone", era: "ancient", rarity: "uncommon" }],
  ["Machicolation", "wall", { strength: 5, span: 3, complexity: 7, material: "stone", era: "medieval", rarity: "rare" }],

  // ── Trusses & Cables ───────────────────────────────────────
  ["Truss", "truss", { strength: 8, span: 40, complexity: 5, material: "steel", era: "industrial", rarity: "common" }],
  ["Truss bridge", "truss", { strength: 8, span: 50, complexity: 6, material: "steel", era: "industrial", rarity: "common" }],
  ["Cable-stayed bridge", "truss", { strength: 9, span: 300, complexity: 9, material: "steel", era: "modern", rarity: "rare" }],
  ["Suspension bridge", "truss", { strength: 9, span: 400, complexity: 10, material: "steel", era: "industrial", rarity: "rare" }],
  ["Space frame", "truss", { strength: 7, span: 80, complexity: 7, material: "steel", era: "modern", rarity: "uncommon" }],
  ["Tensile structure", "truss", { strength: 6, span: 100, complexity: 8, material: "composite", era: "modern", rarity: "rare" }],
  ["Catenary", "truss", { strength: 7, span: 50, complexity: 4, material: "steel", era: "industrial", rarity: "uncommon" }],

  // ── Legendary Structures ───────────────────────────────────
  ["Parthenon", "column", { strength: 8, span: 10, complexity: 9, material: "stone", era: "ancient", rarity: "legendary" }],
  ["Pantheon, Rome", "dome", { strength: 9, span: 43, complexity: 10, material: "concrete", era: "ancient", rarity: "legendary" }],
  ["Hagia Sophia", "dome", { strength: 9, span: 33, complexity: 10, material: "stone", era: "medieval", rarity: "legendary" }],
  ["Notre-Dame de Paris", "buttress", { strength: 8, span: 12, complexity: 10, material: "stone", era: "medieval", rarity: "legendary" }],
  ["Sagrada Fam\u00edlia", "column", { strength: 8, span: 15, complexity: 10, material: "stone", era: "modern", rarity: "legendary" }],
  ["Colosseum", "arch", { strength: 8, span: 6, complexity: 10, material: "stone", era: "ancient", rarity: "legendary" }],
  ["Golden Gate Bridge", "truss", { strength: 10, span: 1280, complexity: 10, material: "steel", era: "modern", rarity: "legendary" }],
  ["Burj Khalifa", "foundation", { strength: 10, span: 2, complexity: 10, material: "steel", era: "modern", rarity: "legendary" }],
];
