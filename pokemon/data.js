// ============================================================
// CRITTER RED - Game Data
// Monster RPG inspired by classic Game Boy games
// ============================================================

// --- Color Palette (Game Boy-ish) ---
const PAL = {
  white: '#e0f0e8',
  light: '#88c070',
  dark: '#346856',
  black: '#081820',
  // Battle UI
  hpGreen: '#48a848',
  hpYellow: '#f8b800',
  hpRed: '#e03030',
  expBlue: '#4888f8',
};

// --- Types ---
const TYPES = {
  FIRE: { name: 'Fire', color: '#f08030' },
  WATER: { name: 'Water', color: '#6890f0' },
  GRASS: { name: 'Grass', color: '#78c850' },
  NORMAL: { name: 'Normal', color: '#a8a878' },
  ELECTRIC: { name: 'Electric', color: '#f8d030' },
  POISON: { name: 'Poison', color: '#a040a0' },
  GROUND: { name: 'Ground', color: '#e0c068' },
  BUG: { name: 'Bug', color: '#a8b820' },
  FLYING: { name: 'Flying', color: '#a890f0' },
};

// Type effectiveness: attacker -> defender -> multiplier
const TYPE_CHART = {
  FIRE:     { GRASS: 2, WATER: 0.5, FIRE: 0.5, BUG: 2 },
  WATER:    { FIRE: 2, GRASS: 0.5, WATER: 0.5, GROUND: 2 },
  GRASS:    { WATER: 2, FIRE: 0.5, GRASS: 0.5, GROUND: 2, POISON: 0.5 },
  ELECTRIC: { WATER: 2, GRASS: 0.5, GROUND: 0, ELECTRIC: 0.5, FLYING: 2 },
  POISON:   { GRASS: 2, POISON: 0.5, GROUND: 0.5 },
  GROUND:   { FIRE: 2, ELECTRIC: 2, GRASS: 0.5, FLYING: 0, POISON: 2 },
  BUG:      { GRASS: 2, FIRE: 0.5, POISON: 0.5, FLYING: 0.5 },
  FLYING:   { BUG: 2, GRASS: 2, ELECTRIC: 0.5 },
  NORMAL:   {},
};

// --- Moves ---
const MOVES = {
  tackle:     { name: 'Tackle',     type: 'NORMAL',   power: 40,  acc: 100, pp: 35, cat: 'phys' },
  scratch:    { name: 'Scratch',    type: 'NORMAL',   power: 40,  acc: 100, pp: 35, cat: 'phys' },
  pound:      { name: 'Pound',      type: 'NORMAL',   power: 40,  acc: 100, pp: 35, cat: 'phys' },
  bite:       { name: 'Bite',       type: 'NORMAL',   power: 60,  acc: 100, pp: 25, cat: 'phys' },
  headbutt:   { name: 'Headbutt',   type: 'NORMAL',   power: 70,  acc: 100, pp: 15, cat: 'phys' },
  bodyslam:   { name: 'Body Slam',  type: 'NORMAL',   power: 85,  acc: 100, pp: 15, cat: 'phys' },
  ember:      { name: 'Ember',      type: 'FIRE',     power: 40,  acc: 100, pp: 25, cat: 'spec' },
  flamewheel: { name: 'Flame Wheel',type: 'FIRE',     power: 60,  acc: 100, pp: 25, cat: 'phys' },
  fireblast:  { name: 'Fire Blast', type: 'FIRE',     power: 110, acc: 85,  pp: 5,  cat: 'spec' },
  watergun:   { name: 'Water Gun',  type: 'WATER',    power: 40,  acc: 100, pp: 25, cat: 'spec' },
  bubble:     { name: 'Bubble',     type: 'WATER',    power: 40,  acc: 100, pp: 30, cat: 'spec' },
  surf:       { name: 'Surf',       type: 'WATER',    power: 90,  acc: 100, pp: 15, cat: 'spec' },
  vinewhip:   { name: 'Vine Whip',  type: 'GRASS',    power: 45,  acc: 100, pp: 25, cat: 'phys' },
  razorleaf:  { name: 'Razor Leaf', type: 'GRASS',    power: 55,  acc: 95,  pp: 25, cat: 'phys' },
  solarbeam:  { name: 'Solar Beam', type: 'GRASS',    power: 120, acc: 100, pp: 10, cat: 'spec' },
  thundershk: { name: 'Thundershock',type:'ELECTRIC', power: 40,  acc: 100, pp: 30, cat: 'spec' },
  thunderbolt:{ name: 'Thunderbolt',type: 'ELECTRIC', power: 90,  acc: 100, pp: 15, cat: 'spec' },
  poisonsting:{ name: 'Poison Sting',type:'POISON',   power: 15,  acc: 100, pp: 35, cat: 'phys' },
  sludge:     { name: 'Sludge',     type: 'POISON',   power: 65,  acc: 100, pp: 20, cat: 'spec' },
  mudslap:    { name: 'Mud-Slap',   type: 'GROUND',   power: 20,  acc: 100, pp: 10, cat: 'spec' },
  earthquake: { name: 'Earthquake', type: 'GROUND',   power: 100, acc: 100, pp: 10, cat: 'phys' },
  gust:       { name: 'Gust',       type: 'FLYING',   power: 40,  acc: 100, pp: 35, cat: 'spec' },
  wingattack: { name: 'Wing Attack',type: 'FLYING',   power: 60,  acc: 100, pp: 35, cat: 'phys' },
  stringshot: { name: 'String Shot',type: 'BUG',      power: 0,   acc: 95,  pp: 40, cat: 'stat', effect: 'spdDown' },
  bugbite:    { name: 'Bug Bite',   type: 'BUG',      power: 60,  acc: 100, pp: 20, cat: 'phys' },
  growl:      { name: 'Growl',      type: 'NORMAL',   power: 0,   acc: 100, pp: 40, cat: 'stat', effect: 'atkDown' },
  leer:       { name: 'Leer',       type: 'NORMAL',   power: 0,   acc: 100, pp: 30, cat: 'stat', effect: 'defDown' },
};

// --- Monster Species (Critterdex) ---
const SPECIES = {
  // Fire starter line
  embark: {
    name: 'Embark', type: 'FIRE', type2: null,
    baseHp: 39, baseAtk: 52, baseDef: 43, baseSpa: 60, baseSpd: 50, baseSpd2: 65,
    learnset: { 1: 'scratch', 1.1: 'growl', 7: 'ember', 13: 'bite', 20: 'flamewheel', 34: 'fireblast' },
    evolveLevel: 16, evolveTo: 'blazehound',
    sprite: 'fire1', cry: 'Embark!',
    dexEntry: 'A loyal pup with a flame on its tail. Its bark can singe eyebrows.',
  },
  blazehound: {
    name: 'Blazehound', type: 'FIRE', type2: null,
    baseHp: 58, baseAtk: 64, baseDef: 58, baseSpa: 80, baseSpd: 65, baseSpd2: 80,
    learnset: { 1: 'scratch', 1.1: 'growl', 7: 'ember', 13: 'bite', 20: 'flamewheel', 36: 'fireblast' },
    evolveLevel: 36, evolveTo: 'infernoking',
    sprite: 'fire2', cry: 'Blaaaze!',
    dexEntry: 'Flames erupt from its mane when angered. Can melt steel with its breath.',
  },
  infernoking: {
    name: 'Infernoking', type: 'FIRE', type2: 'GROUND',
    baseHp: 78, baseAtk: 84, baseDef: 78, baseSpa: 109, baseSpd: 85, baseSpd2: 100,
    learnset: { 1: 'scratch', 7: 'ember', 13: 'bite', 20: 'flamewheel', 36: 'fireblast', 44: 'earthquake' },
    evolveLevel: null, evolveTo: null,
    sprite: 'fire3', cry: 'INFERNO!',
    dexEntry: 'The undisputed king of flame. Legends say it carved valleys with its fire.',
  },

  // Water starter line
  splashling: {
    name: 'Splashling', type: 'WATER', type2: null,
    baseHp: 44, baseAtk: 48, baseDef: 65, baseSpa: 50, baseSpd: 64, baseSpd2: 43,
    learnset: { 1: 'tackle', 1.1: 'growl', 7: 'bubble', 13: 'watergun', 20: 'bite', 33: 'surf' },
    evolveLevel: 16, evolveTo: 'torrentoise',
    sprite: 'water1', cry: 'Splash!',
    dexEntry: 'A tiny turtle that squirts water from its mouth when surprised.',
  },
  torrentoise: {
    name: 'Torrentoise', type: 'WATER', type2: null,
    baseHp: 59, baseAtk: 63, baseDef: 80, baseSpa: 65, baseSpd: 80, baseSpd2: 58,
    learnset: { 1: 'tackle', 7: 'bubble', 13: 'watergun', 20: 'bite', 33: 'surf' },
    evolveLevel: 36, evolveTo: 'tsunamishell',
    sprite: 'water2', cry: 'Torrent!',
    dexEntry: 'Its shell is hard enough to withstand dynamite. Swims faster than a jet ski.',
  },
  tsunamishell: {
    name: 'Tsunamishell', type: 'WATER', type2: null,
    baseHp: 79, baseAtk: 83, baseDef: 100, baseSpa: 85, baseSpd: 105, baseSpd2: 78,
    learnset: { 1: 'tackle', 7: 'bubble', 13: 'watergun', 20: 'bite', 33: 'surf' },
    evolveLevel: null, evolveTo: null,
    sprite: 'water3', cry: 'TSUNAMI!',
    dexEntry: 'Can create tidal waves by slamming its tail. Gentle with children.',
  },

  // Grass starter line
  sproutail: {
    name: 'Sproutail', type: 'GRASS', type2: null,
    baseHp: 45, baseAtk: 49, baseDef: 49, baseSpa: 65, baseSpd: 65, baseSpd2: 45,
    learnset: { 1: 'tackle', 1.1: 'growl', 7: 'vinewhip', 13: 'razorleaf', 20: 'poisonsting', 32: 'solarbeam' },
    evolveLevel: 16, evolveTo: 'thornvine',
    sprite: 'grass1', cry: 'Sprout!',
    dexEntry: 'The bulb on its back grows larger as it absorbs sunlight.',
  },
  thornvine: {
    name: 'Thornvine', type: 'GRASS', type2: 'POISON',
    baseHp: 60, baseAtk: 62, baseDef: 63, baseSpa: 80, baseSpd: 80, baseSpd2: 60,
    learnset: { 1: 'tackle', 7: 'vinewhip', 13: 'razorleaf', 20: 'sludge', 32: 'solarbeam' },
    evolveLevel: 32, evolveTo: 'junglord',
    sprite: 'grass2', cry: 'Thorn!',
    dexEntry: 'Thorny vines extend from its back. The flower buds release a sweet scent.',
  },
  junglord: {
    name: 'Junglord', type: 'GRASS', type2: 'POISON',
    baseHp: 80, baseAtk: 82, baseDef: 83, baseSpa: 100, baseSpd: 100, baseSpd2: 80,
    learnset: { 1: 'tackle', 7: 'vinewhip', 13: 'razorleaf', 20: 'sludge', 32: 'solarbeam' },
    evolveLevel: null, evolveTo: null,
    sprite: 'grass3', cry: 'JUNGLORD!',
    dexEntry: 'A walking jungle. Its flower blooms once every hundred years.',
  },

  // Route 1 encounters
  rattail: {
    name: 'Rattail', type: 'NORMAL', type2: null,
    baseHp: 30, baseAtk: 56, baseDef: 35, baseSpa: 25, baseSpd: 35, baseSpd2: 72,
    learnset: { 1: 'tackle', 4: 'growl', 7: 'bite', 14: 'headbutt', 23: 'bodyslam' },
    evolveLevel: 20, evolveTo: 'ratking',
    sprite: 'rat1', cry: 'Squeak!',
    dexEntry: 'Cautious yet curious. Its long tail helps it balance while running.',
  },
  ratking: {
    name: 'Ratking', type: 'NORMAL', type2: null,
    baseHp: 55, baseAtk: 81, baseDef: 60, baseSpa: 50, baseSpd: 70, baseSpd2: 97,
    learnset: { 1: 'tackle', 4: 'growl', 7: 'bite', 14: 'headbutt', 23: 'bodyslam' },
    evolveLevel: null, evolveTo: null,
    sprite: 'rat2', cry: 'RATKING!',
    dexEntry: 'Leader of the pack. Its fangs can gnaw through steel cables.',
  },
  pidgey: {
    name: 'Featherix', type: 'NORMAL', type2: 'FLYING',
    baseHp: 40, baseAtk: 45, baseDef: 40, baseSpa: 35, baseSpd: 35, baseSpd2: 56,
    learnset: { 1: 'tackle', 5: 'gust', 12: 'wingattack', 20: 'headbutt' },
    evolveLevel: 18, evolveTo: 'falcrest',
    sprite: 'bird1', cry: 'Chirp!',
    dexEntry: 'A common bird seen everywhere. Surprisingly fierce when cornered.',
  },
  falcrest: {
    name: 'Falcrest', type: 'NORMAL', type2: 'FLYING',
    baseHp: 63, baseAtk: 60, baseDef: 55, baseSpa: 50, baseSpd: 50, baseSpd2: 71,
    learnset: { 1: 'tackle', 5: 'gust', 12: 'wingattack', 20: 'headbutt' },
    evolveLevel: null, evolveTo: null,
    sprite: 'bird2', cry: 'SCREECH!',
    dexEntry: 'Soars above the clouds. Its keen eyes can spot prey from miles away.',
  },

  // Bug types (forest)
  caterpod: {
    name: 'Caterpod', type: 'BUG', type2: null,
    baseHp: 45, baseAtk: 30, baseDef: 35, baseSpa: 20, baseSpd: 20, baseSpd2: 45,
    learnset: { 1: 'tackle', 1.1: 'stringshot', 10: 'bugbite' },
    evolveLevel: 10, evolveTo: 'mothora',
    sprite: 'bug1', cry: 'Squirm!',
    dexEntry: 'Eats three times its weight in leaves daily. Evolves quickly.',
  },
  mothora: {
    name: 'Mothora', type: 'BUG', type2: 'FLYING',
    baseHp: 60, baseAtk: 45, baseDef: 50, baseSpa: 80, baseSpd: 80, baseSpd2: 70,
    learnset: { 1: 'tackle', 1.1: 'gust', 10: 'bugbite', 18: 'wingattack' },
    evolveLevel: null, evolveTo: null,
    sprite: 'bug2', cry: 'Flutter!',
    dexEntry: 'Its wings scatter a glowing dust. Drawn to light at night.',
  },

  // Electric type
  zapfox: {
    name: 'Zapfox', type: 'ELECTRIC', type2: null,
    baseHp: 40, baseAtk: 55, baseDef: 30, baseSpa: 95, baseSpd: 40, baseSpd2: 90,
    learnset: { 1: 'tackle', 1.1: 'growl', 6: 'thundershk', 15: 'bite', 26: 'thunderbolt' },
    evolveLevel: null, evolveTo: null,
    sprite: 'elec1', cry: 'Zap!',
    dexEntry: 'Stores static electricity in its fur. Shocks anyone who pets it wrong.',
  },

  // Poison (route 2 / forest)
  grimeleech: {
    name: 'Grimeleech', type: 'POISON', type2: null,
    baseHp: 40, baseAtk: 30, baseDef: 40, baseSpa: 55, baseSpd: 50, baseSpd2: 35,
    learnset: { 1: 'pound', 1.1: 'poisonsting', 8: 'sludge', 18: 'bite' },
    evolveLevel: null, evolveTo: null,
    sprite: 'poison1', cry: 'Slurp!',
    dexEntry: 'A toxic slug that leaves a trail of corrosive slime.',
  },
};

// --- Wild encounter tables ---
const ENCOUNTER_TABLES = {
  route1: [
    { species: 'rattail', minLv: 2, maxLv: 5, weight: 50 },
    { species: 'pidgey', minLv: 2, maxLv: 5, weight: 50 },
  ],
  route2: [
    { species: 'rattail', minLv: 4, maxLv: 7, weight: 30 },
    { species: 'pidgey', minLv: 4, maxLv: 7, weight: 25 },
    { species: 'caterpod', minLv: 3, maxLv: 6, weight: 30 },
    { species: 'grimeleech', minLv: 4, maxLv: 6, weight: 15 },
  ],
  forest: [
    { species: 'caterpod', minLv: 4, maxLv: 8, weight: 40 },
    { species: 'pidgey', minLv: 5, maxLv: 8, weight: 20 },
    { species: 'grimeleech', minLv: 5, maxLv: 8, weight: 20 },
    { species: 'zapfox', minLv: 6, maxLv: 8, weight: 20 },
  ],
  route3: [
    { species: 'rattail', minLv: 7, maxLv: 11, weight: 25 },
    { species: 'pidgey', minLv: 7, maxLv: 11, weight: 25 },
    { species: 'zapfox', minLv: 8, maxLv: 12, weight: 20 },
    { species: 'grimeleech', minLv: 7, maxLv: 10, weight: 30 },
  ],
};

// --- Trainer data ---
const TRAINERS = {
  rival1: {
    name: 'RIVAL',
    critters: [], // Set dynamically based on player starter
    reward: 500,
    defeatMsg: 'What?! I picked the wrong one?!',
    sprite: 'rival',
  },
  bug1: {
    name: 'BUG CATCHER',
    critters: [
      { species: 'caterpod', level: 6 },
      { species: 'caterpod', level: 6 },
    ],
    reward: 120,
    defeatMsg: 'My bugs! They got squished!',
    sprite: 'bugcatcher',
  },
  lass1: {
    name: 'LASS',
    critters: [
      { species: 'rattail', level: 8 },
      { species: 'pidgey', level: 8 },
    ],
    reward: 200,
    defeatMsg: 'Oh no, I lost!',
    sprite: 'lass',
  },
  youngster1: {
    name: 'YOUNGSTER',
    critters: [
      { species: 'rattail', level: 7 },
    ],
    reward: 140,
    defeatMsg: 'Shorts are comfy and easy to wear!',
    sprite: 'youngster',
  },
  gymleader1: {
    name: 'LEADER PETRA',
    critters: [
      { species: 'grimeleech', level: 12 },
      { species: 'grimeleech', level: 14 },
    ],
    reward: 1400,
    defeatMsg: 'You have earned the Sludge Badge!',
    sprite: 'gymleader',
    isGymLeader: true,
    badge: 'Sludge Badge',
  },
};

// --- Items ---
const ITEMS = {
  critterball: { name: 'Critterball', type: 'ball', catchRate: 1.0, price: 200,
    desc: 'A basic ball for catching wild critters.' },
  greatball: { name: 'Great Ball', type: 'ball', catchRate: 1.5, price: 600,
    desc: 'A better ball with a higher catch rate.' },
  potion: { name: 'Potion', type: 'heal', healAmount: 20, price: 300,
    desc: 'Restores 20 HP to one critter.' },
  superpotion: { name: 'Super Potion', type: 'heal', healAmount: 50, price: 700,
    desc: 'Restores 50 HP to one critter.' },
  antidote: { name: 'Antidote', type: 'status', cures: 'poison', price: 100,
    desc: 'Cures poisoning.' },
  repel: { name: 'Repel', type: 'field', steps: 100, price: 350,
    desc: 'Prevents weak wild critters from appearing.' },
};

// --- Tile types ---
const TILE = {
  GRASS_PLAIN: 0,    // Walkable grass (no encounters)
  GRASS_TALL: 1,     // Tall grass (encounters)
  PATH: 2,           // Dirt path
  WATER: 3,          // Water (impassable)
  TREE: 4,           // Tree (impassable)
  WALL: 5,           // Building wall (impassable)
  FLOOR: 6,          // Indoor floor
  DOOR: 7,           // Door (transition)
  LEDGE: 8,          // One-way ledge (jump down only)
  SIGN: 9,           // Readable sign
  NPC: 10,           // NPC position marker
  PC: 11,            // Critter storage PC
  HEAL: 12,          // Healing station
  COUNTER: 13,       // Shop counter
  MAT: 14,           // Door mat (transition trigger)
  FLOWER: 15,        // Decorative flower
  FENCE: 16,         // Fence (impassable)
  SAND: 17,          // Sandy ground
  BOULDER: 18,       // Boulder
  STAIRS_UP: 19,     // Stairs going up
  STAIRS_DOWN: 20,   // Stairs going down
};

// Tile properties
const TILE_PROPS = {};
TILE_PROPS[TILE.GRASS_PLAIN] = { walkable: true,  encounter: false };
TILE_PROPS[TILE.GRASS_TALL]  = { walkable: true,  encounter: true };
TILE_PROPS[TILE.PATH]        = { walkable: true,  encounter: false };
TILE_PROPS[TILE.WATER]       = { walkable: false, encounter: false };
TILE_PROPS[TILE.TREE]        = { walkable: false, encounter: false };
TILE_PROPS[TILE.WALL]        = { walkable: false, encounter: false };
TILE_PROPS[TILE.FLOOR]       = { walkable: true,  encounter: false };
TILE_PROPS[TILE.DOOR]        = { walkable: true,  encounter: false };
TILE_PROPS[TILE.LEDGE]       = { walkable: true,  encounter: false }; // special handling
TILE_PROPS[TILE.SIGN]        = { walkable: false, encounter: false };
TILE_PROPS[TILE.NPC]         = { walkable: false, encounter: false };
TILE_PROPS[TILE.PC]          = { walkable: false, encounter: false };
TILE_PROPS[TILE.HEAL]        = { walkable: false, encounter: false };
TILE_PROPS[TILE.COUNTER]     = { walkable: false, encounter: false };
TILE_PROPS[TILE.MAT]         = { walkable: true,  encounter: false };
TILE_PROPS[TILE.FLOWER]      = { walkable: true,  encounter: false };
TILE_PROPS[TILE.FENCE]       = { walkable: false, encounter: false };
TILE_PROPS[TILE.SAND]        = { walkable: true,  encounter: false };
TILE_PROPS[TILE.BOULDER]     = { walkable: false, encounter: false };
TILE_PROPS[TILE.STAIRS_UP]   = { walkable: true,  encounter: false };
TILE_PROPS[TILE.STAIRS_DOWN] = { walkable: true,  encounter: false };

// Shorthand for map building
const _ = TILE.GRASS_PLAIN;
const T = TILE.GRASS_TALL;
const P = TILE.PATH;
const W = TILE.WATER;
const R = TILE.TREE;
const B = TILE.WALL;
const F = TILE.FLOOR;
const D = TILE.DOOR;
const L = TILE.LEDGE;
const S = TILE.SIGN;
const N = TILE.NPC;
const H = TILE.HEAL;
const C = TILE.COUNTER;
const M = TILE.MAT;
const FL= TILE.FLOWER;
const FN= TILE.FENCE;
const BO= TILE.BOULDER;

// --- Maps ---
const MAPS = {
  hometown: {
    name: 'Rootvale Town',
    width: 20, height: 18,
    encounterTable: null,
    music: 'town',
    tiles: [
      R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,
      R,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,B,B,B,B,_,_,_,_,_,_,_,B,B,B,B,_,_,R,
      R,_,B,F,F,B,_,_,FL,_,_,FL,_,B,F,F,B,_,_,R,
      R,_,B,F,F,B,_,_,_,P,P,_,_,B,F,F,B,_,_,R,
      R,_,_,D,_,_,_,_,_,P,P,_,_,_,D,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,FL,_,_,S,_,_,_,P,P,_,_,S,_,_,FL,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,B,B,B,B,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,B,F,F,B,_,_,P,P,_,_,_,W,W,_,_,_,R,
      R,_,_,B,F,F,B,_,_,P,P,_,_,W,W,W,W,_,_,R,
      R,_,_,_,D,_,_,_,_,P,P,_,_,_,W,W,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
    ],
    connections: {
      south: { map: 'route1', playerX: 9, playerY: 0 },
    },
    exits: [
      // South edge exits to route1
      { x: 9, y: 17, toMap: 'route1', toX: 9, toY: 0, dir: 'south' },
      { x: 10, y: 17, toMap: 'route1', toX: 10, toY: 0, dir: 'south' },
    ],
    doors: [
      { x: 3, y: 5, toMap: 'playerhouse', toX: 3, toY: 6, dir: 'up' },
      { x: 14, y: 5, toMap: 'rivalhouse', toX: 3, toY: 6, dir: 'up' },
      { x: 4, y: 13, toMap: 'lab', toX: 5, toY: 8, dir: 'up' },
    ],
    npcs: [
      { x: 7, y: 7, sprite: 'girl', dir: 'down',
        dialog: ['Welcome to Rootvale Town!', 'The professor\'s lab is to the south-west.'] },
      { x: 15, y: 9, sprite: 'oldman', dir: 'left',
        dialog: ['The tall grass is full of wild critters.', 'Be careful out there!'] },
    ],
    signs: [
      { x: 5, y: 8, text: 'ROOTVALE TOWN\nA quiet place to call home.' },
      { x: 13, y: 8, text: 'RIVAL\'s House' },
    ],
  },

  route1: {
    name: 'Route 1',
    width: 20, height: 30,
    encounterTable: 'route1',
    music: 'route',
    tiles: [
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
      R,_,_,T,T,_,_,_,_,P,P,_,_,_,T,T,_,_,_,R,
      R,_,T,T,T,T,_,_,_,P,P,_,_,T,T,T,T,_,_,R,
      R,_,T,T,T,_,_,_,_,P,P,_,_,_,T,T,_,_,_,R,
      R,_,_,T,_,_,_,_,_,P,P,_,_,_,_,T,T,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,FN,FN,_,P,P,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,T,T,T,_,_,_,P,P,_,_,T,T,_,_,_,_,R,
      R,_,T,T,T,T,T,_,_,P,P,_,T,T,T,T,_,_,_,R,
      R,_,_,T,T,T,_,_,_,P,P,_,_,T,T,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,T,T,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,T,T,T,T,_,_,P,P,_,_,T,T,T,_,_,_,R,
      R,_,_,T,T,T,_,_,_,P,P,_,_,T,T,T,T,_,_,R,
      R,_,_,_,T,_,_,_,_,P,P,_,_,_,T,T,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,L,L,L,L,L,L,L,L,P,P,L,L,L,L,L,L,L,L,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,T,T,_,_,R,
      R,_,_,T,T,_,_,_,_,P,P,_,_,_,T,T,T,_,_,R,
      R,_,T,T,T,T,_,_,_,P,P,_,_,_,_,T,_,_,_,R,
      R,_,_,T,T,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
    ],
    exits: [
      { x: 9, y: 0, toMap: 'hometown', toX: 9, toY: 16, dir: 'north' },
      { x: 10, y: 0, toMap: 'hometown', toX: 10, toY: 16, dir: 'north' },
      { x: 9, y: 29, toMap: 'gatetown', toX: 9, toY: 0, dir: 'south' },
      { x: 10, y: 29, toMap: 'gatetown', toX: 10, toY: 0, dir: 'south' },
    ],
    doors: [],
    npcs: [
      { x: 7, y: 5, sprite: 'boy', dir: 'right',
        dialog: ['I just caught a Rattail!', 'The tall grass is full of critters!'] },
    ],
    signs: [],
    trainers: [
      { x: 14, y: 13, sprite: 'youngster', dir: 'left', sightRange: 3,
        trainerId: 'youngster1', defeated: false },
    ],
  },

  gatetown: {
    name: 'Gatetown City',
    width: 24, height: 20,
    encounterTable: null,
    music: 'town',
    tiles: [
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,R,R,R,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,B,B,B,B,_,_,_,P,P,_,_,_,B,B,B,B,B,_,_,_,_,R,
      R,_,B,F,F,B,_,_,_,P,P,_,_,_,B,F,F,F,B,_,_,_,_,R,
      R,_,B,F,F,B,_,_,_,P,P,_,_,_,B,F,F,F,B,_,_,_,_,R,
      R,_,_,D,_,_,_,_,_,P,P,_,_,_,_,_,D,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,S,_,_,P,P,P,P,_,_,_,S,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,P,_,_,P,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,P,_,_,P,_,_,_,_,_,B,B,B,B,_,_,R,
      R,_,FL,_,_,_,_,_,P,_,_,P,_,_,_,_,_,B,F,F,B,_,_,R,
      R,_,_,_,_,_,_,_,P,_,_,P,_,_,_,_,_,B,F,F,B,_,_,R,
      R,_,_,_,_,_,_,_,P,P,P,P,_,_,_,_,_,_,D,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,_,W,W,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,W,W,W,W,_,_,_,P,P,_,_,_,_,_,_,_,_,FL,_,_,_,R,
      R,_,_,W,W,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,_,_,_,_,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,R,R,R,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,R,R,R,R,
    ],
    exits: [
      { x: 9, y: 0, toMap: 'route1', toX: 9, toY: 28, dir: 'north' },
      { x: 10, y: 0, toMap: 'route1', toX: 10, toY: 28, dir: 'north' },
      { x: 9, y: 19, toMap: 'route2', toX: 9, toY: 0, dir: 'south' },
      { x: 10, y: 19, toMap: 'route2', toX: 10, toY: 0, dir: 'south' },
    ],
    doors: [
      { x: 3, y: 5, toMap: 'center', toX: 4, toY: 8, dir: 'up' },
      { x: 16, y: 5, toMap: 'mart', toX: 3, toY: 6, dir: 'up' },
      { x: 18, y: 12, toMap: 'gym1', toX: 4, toY: 8, dir: 'up' },
    ],
    npcs: [
      { x: 12, y: 6, sprite: 'girl', dir: 'down',
        dialog: ['This is Gatetown City!', 'We have a Critter Center, a Mart, and a Gym!'] },
      { x: 6, y: 10, sprite: 'oldman', dir: 'right',
        dialog: ['The Gym Leader Petra uses Poison-type critters.', 'Bring some antidotes!'] },
    ],
    signs: [
      { x: 5, y: 7, text: 'CRITTER CENTER\nHeal your critters for free!' },
      { x: 15, y: 7, text: 'CRITTER MART\nYour one-stop shop!' },
    ],
  },

  route2: {
    name: 'Route 2',
    width: 20, height: 25,
    encounterTable: 'route2',
    music: 'route',
    tiles: [
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,T,T,_,_,_,_,_,P,P,_,_,T,T,T,_,_,_,R,
      R,_,T,T,T,_,_,_,_,P,P,_,T,T,T,T,T,_,_,R,
      R,_,_,T,T,_,_,_,_,P,P,_,_,T,T,T,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,T,T,T,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,T,T,T,T,T,_,P,P,_,_,_,T,T,_,_,_,R,
      R,_,_,_,T,T,T,_,_,P,P,_,_,T,T,T,T,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,T,T,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,T,T,_,_,_,_,_,P,P,_,_,_,_,T,T,_,_,R,
      R,_,T,T,T,_,_,_,_,P,P,_,_,_,T,T,T,_,_,R,
      R,_,_,T,_,_,_,_,_,P,P,_,_,_,_,T,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,_,T,T,T,_,_,_,_,P,P,_,_,_,T,T,T,_,_,R,
      R,_,T,T,T,T,_,_,_,P,P,_,_,T,T,T,T,_,_,R,
      R,_,_,T,T,_,_,_,_,P,P,_,_,_,T,T,_,_,_,R,
      R,_,_,_,_,_,_,_,_,P,P,_,_,_,_,_,_,_,_,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
      R,R,R,R,R,R,R,R,R,P,P,R,R,R,R,R,R,R,R,R,
    ],
    exits: [
      { x: 9, y: 0, toMap: 'gatetown', toX: 9, toY: 18, dir: 'north' },
      { x: 10, y: 0, toMap: 'gatetown', toX: 10, toY: 18, dir: 'north' },
    ],
    doors: [],
    npcs: [],
    signs: [],
    trainers: [
      { x: 5, y: 6, sprite: 'bugcatcher', dir: 'right', sightRange: 3,
        trainerId: 'bug1', defeated: false },
      { x: 14, y: 11, sprite: 'lass', dir: 'left', sightRange: 4,
        trainerId: 'lass1', defeated: false },
    ],
  },

  // Indoor maps
  playerhouse: {
    name: 'Your House',
    width: 8, height: 8,
    encounterTable: null, music: 'town', indoor: true,
    tiles: [
      B,B,B,B,B,B,B,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,B,B,M,M,B,B,B,
    ],
    exits: [
      { x: 3, y: 7, toMap: 'hometown', toX: 3, toY: 6, dir: 'south' },
      { x: 4, y: 7, toMap: 'hometown', toX: 3, toY: 6, dir: 'south' },
    ],
    doors: [],
    npcs: [
      { x: 2, y: 3, sprite: 'mom', dir: 'down',
        dialog: ['Good morning, dear!', 'Prof. Willow wanted to see you at his lab.', 'It\'s just south of here.'] },
    ],
    signs: [],
  },

  rivalhouse: {
    name: 'Rival\'s House',
    width: 8, height: 8,
    encounterTable: null, music: 'town', indoor: true,
    tiles: [
      B,B,B,B,B,B,B,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,B,B,M,M,B,B,B,
    ],
    exits: [
      { x: 3, y: 7, toMap: 'hometown', toX: 14, toY: 6, dir: 'south' },
      { x: 4, y: 7, toMap: 'hometown', toX: 14, toY: 6, dir: 'south' },
    ],
    doors: [],
    npcs: [
      { x: 5, y: 2, sprite: 'girl', dir: 'down',
        dialog: ['My brother already left for the lab.', 'He\'s always in such a rush!'] },
    ],
    signs: [],
  },

  lab: {
    name: 'Professor\'s Lab',
    width: 10, height: 10,
    encounterTable: null, music: 'town', indoor: true,
    tiles: [
      B,B,B,B,B,B,B,B,B,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,B,B,B,M,M,B,B,B,B,
    ],
    exits: [
      { x: 4, y: 9, toMap: 'hometown', toX: 4, toY: 14, dir: 'south' },
      { x: 5, y: 9, toMap: 'hometown', toX: 4, toY: 14, dir: 'south' },
    ],
    doors: [],
    npcs: [
      { x: 5, y: 2, sprite: 'professor', dir: 'down',
        dialog: ['_STARTER_SELECT_'] }, // Special trigger
    ],
    signs: [],
    starterTable: { x1: 3, x2: 5, x3: 7, y: 3 }, // positions of the 3 starter balls
  },

  center: {
    name: 'Critter Center',
    width: 9, height: 10,
    encounterTable: null, music: 'town', indoor: true,
    tiles: [
      B,B,B,B,B,B,B,B,B,
      B,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,B,
      B,F,F,F,H,F,F,F,B,
      B,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,B,
      B,B,B,M,M,M,B,B,B,
    ],
    exits: [
      { x: 3, y: 9, toMap: 'gatetown', toX: 3, toY: 6, dir: 'south' },
      { x: 4, y: 9, toMap: 'gatetown', toX: 3, toY: 6, dir: 'south' },
      { x: 5, y: 9, toMap: 'gatetown', toX: 3, toY: 6, dir: 'south' },
    ],
    doors: [],
    npcs: [
      { x: 4, y: 2, sprite: 'nurse', dir: 'down',
        dialog: ['_HEAL_'] }, // Special trigger
    ],
    signs: [],
  },

  mart: {
    name: 'Critter Mart',
    width: 8, height: 8,
    encounterTable: null, music: 'town', indoor: true,
    tiles: [
      B,B,B,B,B,B,B,B,
      B,F,F,F,F,F,F,B,
      B,F,F,C,C,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,B,
      B,B,M,M,M,B,B,B,
    ],
    exits: [
      { x: 2, y: 7, toMap: 'gatetown', toX: 16, toY: 6, dir: 'south' },
      { x: 3, y: 7, toMap: 'gatetown', toX: 16, toY: 6, dir: 'south' },
      { x: 4, y: 7, toMap: 'gatetown', toX: 16, toY: 6, dir: 'south' },
    ],
    doors: [],
    npcs: [
      { x: 3, y: 1, sprite: 'clerk', dir: 'down',
        dialog: ['_SHOP_'] },
    ],
    signs: [],
  },

  gym1: {
    name: 'Gatetown Gym',
    width: 10, height: 10,
    encounterTable: null, music: 'gym', indoor: true,
    tiles: [
      B,B,B,B,B,B,B,B,B,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,N,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,F,F,F,F,F,F,F,F,B,
      B,B,B,B,M,M,B,B,B,B,
    ],
    exits: [
      { x: 4, y: 9, toMap: 'gatetown', toX: 18, toY: 13, dir: 'south' },
      { x: 5, y: 9, toMap: 'gatetown', toX: 18, toY: 13, dir: 'south' },
    ],
    doors: [],
    npcs: [],
    signs: [],
    trainers: [
      { x: 4, y: 2, sprite: 'gymleader', dir: 'down', sightRange: 5,
        trainerId: 'gymleader1', defeated: false },
    ],
  },
};

// --- EXP curve (medium-fast) ---
function expForLevel(level) {
  return Math.floor(level * level * level);
}

// --- Create a critter instance ---
function createCritter(speciesId, level) {
  const sp = SPECIES[speciesId];
  if (!sp) { console.error('Unknown species:', speciesId); return null; }

  // Calculate stats (simplified Gen 1-ish formula)
  const calcStat = (base, lv, isHp) => {
    const iv = Math.floor(Math.random() * 16);
    if (isHp) return Math.floor(((base + iv) * 2 * lv) / 100) + lv + 10;
    return Math.floor(((base + iv) * 2 * lv) / 100) + 5;
  };

  const hp = calcStat(sp.baseHp, level, true);

  // Build move list from learnset
  const moves = [];
  const learnLevels = Object.keys(sp.learnset).map(Number).sort((a,b) => a - b);
  for (const lv of learnLevels) {
    if (lv <= level) {
      const moveId = sp.learnset[lv];
      // Keep last 4 moves
      if (moves.length >= 4) moves.shift();
      moves.push({ id: moveId, pp: MOVES[moveId].pp, maxPp: MOVES[moveId].pp });
    }
  }

  return {
    speciesId,
    name: sp.name,
    level,
    type: sp.type,
    type2: sp.type2,
    hp, maxHp: hp,
    atk: calcStat(sp.baseAtk, level, false),
    def: calcStat(sp.baseDef, level, false),
    spa: calcStat(sp.baseSpa, level, false),
    spd: calcStat(sp.baseSpd, level, false),
    spd2: calcStat(sp.baseSpd2, level, false),
    moves,
    exp: expForLevel(level),
    expNext: expForLevel(level + 1),
    status: null,
    statMods: { atk: 0, def: 0, spa: 0, spd: 0, spd2: 0 },
  };
}

// --- Pick a random wild encounter ---
function rollEncounter(tableId) {
  const table = ENCOUNTER_TABLES[tableId];
  if (!table) return null;
  const totalWeight = table.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) {
      const lv = entry.minLv + Math.floor(Math.random() * (entry.maxLv - entry.minLv + 1));
      return createCritter(entry.species, lv);
    }
  }
  return null;
}
