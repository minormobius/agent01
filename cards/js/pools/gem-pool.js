// ── Gem Pool — naturally occurring crystals ────────────────
// Each entry: [title, crystalSystem, properties]
//   title: Wikipedia article name
//   crystalSystem: cubic|tetragonal|orthorhombic|hexagonal|trigonal|monoclinic|triclinic
//   properties: { color, hardness, opacity, luster, rarity }

export const CRYSTAL_SYSTEMS = {
  cubic:        { name: "Cubic",        icon: "◆", color: "#e8b4b8", faces: 6 },
  tetragonal:   { name: "Tetragonal",   icon: "◇", color: "#b4d8e8", faces: 8 },
  orthorhombic: { name: "Orthorhombic", icon: "▱", color: "#b8e8b4", faces: 8 },
  hexagonal:    { name: "Hexagonal",    icon: "⬡", color: "#e8d4b4", faces: 8 },
  trigonal:     { name: "Trigonal",      icon: "△", color: "#d4b4e8", faces: 6 },
  monoclinic:   { name: "Monoclinic",   icon: "▰", color: "#e8e4b4", faces: 4 },
  triclinic:    { name: "Triclinic",     icon: "◁", color: "#b4e8e4", faces: 2 },
};

// color: [r, g, b, a] — base crystal color (0-1 range)
// hardness: Mohs scale 1-10
// opacity: 0 = transparent, 0.5 = translucent, 1 = opaque
// luster: "vitreous"|"adamantine"|"metallic"|"pearly"|"silky"|"waxy"|"resinous"|"earthy"
// rarity: "common"|"uncommon"|"rare"|"legendary"

export const GEM_POOL = [
  // ── Cubic ──────────────────────────────────────────────────
  ["Diamond", "cubic", { color: [0.95, 0.95, 1.0, 0.3], hardness: 10, opacity: 0.1, luster: "adamantine", rarity: "legendary" }],
  ["Pyrite", "cubic", { color: [0.83, 0.69, 0.22, 1], hardness: 6.5, opacity: 1, luster: "metallic", rarity: "common" }],
  ["Fluorite", "cubic", { color: [0.5, 0.2, 0.8, 0.5], hardness: 4, opacity: 0.3, luster: "vitreous", rarity: "common" }],
  ["Garnet", "cubic", { color: [0.55, 0.05, 0.1, 0.7], hardness: 7, opacity: 0.4, luster: "vitreous", rarity: "uncommon" }],
  ["Spinel", "cubic", { color: [0.8, 0.1, 0.2, 0.5], hardness: 8, opacity: 0.3, luster: "vitreous", rarity: "rare" }],
  ["Galena", "cubic", { color: [0.45, 0.45, 0.5, 1], hardness: 2.5, opacity: 1, luster: "metallic", rarity: "common" }],
  ["Halite", "cubic", { color: [0.95, 0.95, 0.95, 0.4], hardness: 2, opacity: 0.2, luster: "vitreous", rarity: "common" }],
  ["Magnetite", "cubic", { color: [0.15, 0.15, 0.18, 1], hardness: 6, opacity: 1, luster: "metallic", rarity: "common" }],
  ["Sodalite", "cubic", { color: [0.15, 0.2, 0.6, 0.7], hardness: 5.5, opacity: 0.6, luster: "vitreous", rarity: "uncommon" }],
  ["Cuprite", "cubic", { color: [0.6, 0.05, 0.05, 0.8], hardness: 3.5, opacity: 0.7, luster: "adamantine", rarity: "uncommon" }],
  ["Lazurite", "cubic", { color: [0.1, 0.15, 0.65, 0.8], hardness: 5.5, opacity: 0.7, luster: "vitreous", rarity: "rare" }],
  ["Sphalerite", "cubic", { color: [0.45, 0.3, 0.1, 0.6], hardness: 3.5, opacity: 0.5, luster: "adamantine", rarity: "common" }],

  // ── Tetragonal ─────────────────────────────────────────────
  ["Zircon", "tetragonal", { color: [0.7, 0.5, 0.2, 0.4], hardness: 7.5, opacity: 0.2, luster: "adamantine", rarity: "uncommon" }],
  ["Rutile", "tetragonal", { color: [0.55, 0.15, 0.05, 0.8], hardness: 6, opacity: 0.8, luster: "adamantine", rarity: "uncommon" }],
  ["Cassiterite", "tetragonal", { color: [0.3, 0.2, 0.1, 0.9], hardness: 6.5, opacity: 0.8, luster: "adamantine", rarity: "uncommon" }],
  ["Scheelite", "tetragonal", { color: [0.9, 0.8, 0.5, 0.4], hardness: 5, opacity: 0.3, luster: "vitreous", rarity: "uncommon" }],
  ["Wulfenite", "tetragonal", { color: [0.9, 0.5, 0.1, 0.5], hardness: 3, opacity: 0.4, luster: "adamantine", rarity: "rare" }],
  ["Apophyllite", "tetragonal", { color: [0.85, 0.95, 0.85, 0.3], hardness: 5, opacity: 0.2, luster: "vitreous", rarity: "uncommon" }],
  ["Vesuvianite", "tetragonal", { color: [0.35, 0.5, 0.2, 0.6], hardness: 6.5, opacity: 0.5, luster: "vitreous", rarity: "uncommon" }],
  ["Chalcopyrite", "tetragonal", { color: [0.8, 0.7, 0.2, 1], hardness: 3.5, opacity: 1, luster: "metallic", rarity: "common" }],

  // ── Orthorhombic ───────────────────────────────────────────
  ["Topaz", "orthorhombic", { color: [0.9, 0.7, 0.3, 0.3], hardness: 8, opacity: 0.15, luster: "vitreous", rarity: "uncommon" }],
  ["Olivine", "orthorhombic", { color: [0.4, 0.6, 0.15, 0.5], hardness: 6.5, opacity: 0.3, luster: "vitreous", rarity: "common" }],
  ["Barite", "orthorhombic", { color: [0.85, 0.85, 0.8, 0.5], hardness: 3.5, opacity: 0.3, luster: "vitreous", rarity: "common" }],
  ["Celestine (mineral)", "orthorhombic", { color: [0.7, 0.8, 0.95, 0.3], hardness: 3.5, opacity: 0.2, luster: "vitreous", rarity: "uncommon" }],
  ["Aragonite", "orthorhombic", { color: [0.9, 0.85, 0.75, 0.5], hardness: 3.5, opacity: 0.4, luster: "vitreous", rarity: "common" }],
  ["Sulfur", "orthorhombic", { color: [0.9, 0.85, 0.2, 0.7], hardness: 2, opacity: 0.6, luster: "resinous", rarity: "common" }],
  ["Chrysoberyl", "orthorhombic", { color: [0.6, 0.7, 0.2, 0.4], hardness: 8.5, opacity: 0.2, luster: "vitreous", rarity: "rare" }],
  ["Staurolite", "orthorhombic", { color: [0.4, 0.25, 0.1, 0.9], hardness: 7, opacity: 0.8, luster: "vitreous", rarity: "uncommon" }],
  ["Tanzanite", "orthorhombic", { color: [0.3, 0.2, 0.7, 0.3], hardness: 6.5, opacity: 0.2, luster: "vitreous", rarity: "rare" }],
  ["Andalusite", "orthorhombic", { color: [0.6, 0.4, 0.3, 0.6], hardness: 7.5, opacity: 0.5, luster: "vitreous", rarity: "uncommon" }],
  ["Marcasite", "orthorhombic", { color: [0.75, 0.72, 0.5, 1], hardness: 6, opacity: 1, luster: "metallic", rarity: "common" }],

  // ── Hexagonal ──────────────────────────────────────────────
  ["Beryl", "hexagonal", { color: [0.6, 0.85, 0.6, 0.3], hardness: 7.5, opacity: 0.15, luster: "vitreous", rarity: "uncommon" }],
  ["Emerald", "hexagonal", { color: [0.15, 0.6, 0.25, 0.4], hardness: 7.5, opacity: 0.3, luster: "vitreous", rarity: "rare" }],
  ["Aquamarine", "hexagonal", { color: [0.4, 0.7, 0.85, 0.25], hardness: 7.5, opacity: 0.15, luster: "vitreous", rarity: "rare" }],
  ["Apatite", "hexagonal", { color: [0.2, 0.6, 0.5, 0.4], hardness: 5, opacity: 0.3, luster: "vitreous", rarity: "common" }],
  ["Morganite", "hexagonal", { color: [0.9, 0.6, 0.65, 0.25], hardness: 7.5, opacity: 0.15, luster: "vitreous", rarity: "rare" }],
  ["Nephrite", "hexagonal", { color: [0.3, 0.5, 0.3, 0.8], hardness: 6, opacity: 0.7, luster: "waxy", rarity: "uncommon" }],
  ["Vanadinite", "hexagonal", { color: [0.85, 0.3, 0.05, 0.7], hardness: 3, opacity: 0.5, luster: "adamantine", rarity: "uncommon" }],
  ["Pyromorphite", "hexagonal", { color: [0.4, 0.65, 0.15, 0.6], hardness: 3.5, opacity: 0.5, luster: "adamantine", rarity: "uncommon" }],
  ["Goshenite", "hexagonal", { color: [0.95, 0.95, 0.95, 0.15], hardness: 7.5, opacity: 0.1, luster: "vitreous", rarity: "uncommon" }],
  ["Heliodor", "hexagonal", { color: [0.85, 0.8, 0.3, 0.25], hardness: 7.5, opacity: 0.15, luster: "vitreous", rarity: "rare" }],
  ["Molybdenite", "hexagonal", { color: [0.4, 0.4, 0.45, 1], hardness: 1.5, opacity: 1, luster: "metallic", rarity: "uncommon" }],

  // ── Trigonal ───────────────────────────────────────────────
  ["Quartz", "trigonal", { color: [0.9, 0.9, 0.92, 0.15], hardness: 7, opacity: 0.1, luster: "vitreous", rarity: "common" }],
  ["Amethyst", "trigonal", { color: [0.55, 0.25, 0.65, 0.35], hardness: 7, opacity: 0.2, luster: "vitreous", rarity: "uncommon" }],
  ["Citrine", "trigonal", { color: [0.85, 0.65, 0.15, 0.3], hardness: 7, opacity: 0.15, luster: "vitreous", rarity: "uncommon" }],
  ["Rose quartz", "trigonal", { color: [0.9, 0.6, 0.65, 0.4], hardness: 7, opacity: 0.3, luster: "vitreous", rarity: "uncommon" }],
  ["Smoky quartz", "trigonal", { color: [0.35, 0.25, 0.2, 0.4], hardness: 7, opacity: 0.3, luster: "vitreous", rarity: "common" }],
  ["Calcite", "trigonal", { color: [0.95, 0.92, 0.85, 0.3], hardness: 3, opacity: 0.2, luster: "vitreous", rarity: "common" }],
  ["Tourmaline", "trigonal", { color: [0.1, 0.35, 0.15, 0.5], hardness: 7, opacity: 0.3, luster: "vitreous", rarity: "uncommon" }],
  ["Corundum", "trigonal", { color: [0.6, 0.6, 0.7, 0.4], hardness: 9, opacity: 0.2, luster: "adamantine", rarity: "rare" }],
  ["Ruby", "trigonal", { color: [0.7, 0.05, 0.1, 0.5], hardness: 9, opacity: 0.3, luster: "adamantine", rarity: "legendary" }],
  ["Sapphire", "trigonal", { color: [0.1, 0.15, 0.65, 0.4], hardness: 9, opacity: 0.25, luster: "adamantine", rarity: "legendary" }],
  ["Rhodochrosite", "trigonal", { color: [0.85, 0.35, 0.4, 0.6], hardness: 4, opacity: 0.5, luster: "vitreous", rarity: "uncommon" }],
  ["Cinnabar", "trigonal", { color: [0.8, 0.1, 0.1, 0.9], hardness: 2, opacity: 0.8, luster: "adamantine", rarity: "uncommon" }],
  ["Hematite", "trigonal", { color: [0.2, 0.2, 0.22, 1], hardness: 6, opacity: 1, luster: "metallic", rarity: "common" }],
  ["Dolomite", "trigonal", { color: [0.9, 0.85, 0.8, 0.5], hardness: 3.5, opacity: 0.4, luster: "vitreous", rarity: "common" }],
  ["Siderite", "trigonal", { color: [0.55, 0.4, 0.2, 0.7], hardness: 4, opacity: 0.6, luster: "vitreous", rarity: "common" }],
  ["Dioptase", "trigonal", { color: [0.05, 0.6, 0.45, 0.5], hardness: 5, opacity: 0.4, luster: "vitreous", rarity: "rare" }],
  ["Bismuth", "trigonal", { color: [0.75, 0.55, 0.65, 0.9], hardness: 2, opacity: 0.9, luster: "metallic", rarity: "uncommon" }],

  // ── Monoclinic ─────────────────────────────────────────────
  ["Gypsum", "monoclinic", { color: [0.95, 0.93, 0.9, 0.3], hardness: 2, opacity: 0.2, luster: "vitreous", rarity: "common" }],
  ["Orthoclase", "monoclinic", { color: [0.85, 0.75, 0.6, 0.7], hardness: 6, opacity: 0.6, luster: "vitreous", rarity: "common" }],
  ["Malachite", "monoclinic", { color: [0.1, 0.55, 0.3, 0.9], hardness: 3.5, opacity: 0.8, luster: "silky", rarity: "uncommon" }],
  ["Azurite", "monoclinic", { color: [0.05, 0.15, 0.65, 0.8], hardness: 3.5, opacity: 0.7, luster: "vitreous", rarity: "uncommon" }],
  ["Jade", "monoclinic", { color: [0.2, 0.55, 0.25, 0.8], hardness: 6.5, opacity: 0.7, luster: "waxy", rarity: "rare" }],
  ["Moonstone", "monoclinic", { color: [0.85, 0.85, 0.9, 0.4], hardness: 6, opacity: 0.3, luster: "pearly", rarity: "uncommon" }],
  ["Selenite", "monoclinic", { color: [0.95, 0.95, 0.95, 0.2], hardness: 2, opacity: 0.1, luster: "vitreous", rarity: "common" }],
  ["Epidote", "monoclinic", { color: [0.35, 0.4, 0.1, 0.6], hardness: 6.5, opacity: 0.5, luster: "vitreous", rarity: "common" }],
  ["Diopside", "monoclinic", { color: [0.2, 0.5, 0.2, 0.5], hardness: 5.5, opacity: 0.4, luster: "vitreous", rarity: "uncommon" }],
  ["Vivianite", "monoclinic", { color: [0.15, 0.25, 0.55, 0.6], hardness: 2, opacity: 0.5, luster: "vitreous", rarity: "uncommon" }],
  ["Realgar", "monoclinic", { color: [0.85, 0.25, 0.05, 0.8], hardness: 1.5, opacity: 0.7, luster: "resinous", rarity: "uncommon" }],
  ["Serpentine subgroup", "monoclinic", { color: [0.3, 0.5, 0.25, 0.8], hardness: 3, opacity: 0.7, luster: "waxy", rarity: "common" }],
  ["Kunzite", "monoclinic", { color: [0.8, 0.5, 0.7, 0.25], hardness: 7, opacity: 0.15, luster: "vitreous", rarity: "rare" }],

  // ── Triclinic ──────────────────────────────────────────────
  ["Labradorite", "triclinic", { color: [0.35, 0.4, 0.5, 0.6], hardness: 6, opacity: 0.5, luster: "vitreous", rarity: "uncommon" }],
  ["Turquoise", "triclinic", { color: [0.2, 0.65, 0.65, 0.9], hardness: 5.5, opacity: 0.8, luster: "waxy", rarity: "uncommon" }],
  ["Amazonite", "triclinic", { color: [0.3, 0.7, 0.6, 0.7], hardness: 6, opacity: 0.6, luster: "vitreous", rarity: "uncommon" }],
  ["Kyanite", "triclinic", { color: [0.25, 0.35, 0.7, 0.5], hardness: 5.5, opacity: 0.4, luster: "vitreous", rarity: "uncommon" }],
  ["Rhodonite", "triclinic", { color: [0.8, 0.3, 0.4, 0.7], hardness: 6, opacity: 0.6, luster: "vitreous", rarity: "uncommon" }],
  ["Sunstone", "triclinic", { color: [0.85, 0.55, 0.25, 0.5], hardness: 6.5, opacity: 0.4, luster: "vitreous", rarity: "uncommon" }],
  ["Larimar", "triclinic", { color: [0.45, 0.7, 0.85, 0.6], hardness: 5, opacity: 0.5, luster: "silky", rarity: "rare" }],
  ["Alexandrite", "triclinic", { color: [0.2, 0.5, 0.3, 0.4], hardness: 8.5, opacity: 0.25, luster: "vitreous", rarity: "legendary" }],
];
