// The spooky vocabulary: the words a name can be bent toward. Hand-curated.
// build-data.mjs looks each up in CMUdict and writes data/spooks.json with
// its phones; `say` overrides that when the dictionary is missing or wrong.
//
//   k  n  a thing (noun)            a  a quality (adjective, for epithets)
//      v  a doing (verb)            m  a monster or horror name
//
// Words a pun would hurt to land on are left out on purpose: no slurs, no
// real tragedies, nothing that reads as a threat at a real person.

export const SPOOKS = [
  // the dead and the undead
  { w: 'ghost', k: 'n' }, { w: 'ghoul', k: 'n' }, { w: 'ghast', k: 'n' }, { w: 'ghostly', k: 'a' },
  { w: 'ghoulish', k: 'a' }, { w: 'ghastly', k: 'a' }, { w: 'phantom', k: 'n' }, { w: 'specter', k: 'n' },
  { w: 'spirit', k: 'n' }, { w: 'spook', k: 'n' }, { w: 'spooky', k: 'a' }, { w: 'wraith', k: 'n' },
  { w: 'shade', k: 'n' }, { w: 'shadow', k: 'n' }, { w: 'banshee', k: 'm' }, { w: 'poltergeist', k: 'm' },
  { w: 'zombie', k: 'm' }, { w: 'mummy', k: 'm' }, { w: 'vampire', k: 'm' }, { w: 'werewolf', k: 'm' },
  { w: 'wolfman', k: 'm' }, { w: 'goblin', k: 'm' }, { w: 'gremlin', k: 'm' },
  { w: 'demon', k: 'm' }, { w: 'devil', k: 'm' }, { w: 'fiend', k: 'm' }, { w: 'imp', k: 'm' },
  { w: 'lich', k: 'm' }, { w: 'ogre', k: 'm' }, { w: 'troll', k: 'm' }, { w: 'witch', k: 'm' },
  { w: 'warlock', k: 'm' }, { w: 'wizard', k: 'm' }, { w: 'skeleton', k: 'n' }, { w: 'corpse', k: 'n' },
  { w: 'cadaver', k: 'n' }, { w: 'undead', k: 'a' }, { w: 'reaper', k: 'n' }, { w: 'revenant', k: 'm' },
  { w: 'monster', k: 'm' }, { w: 'creature', k: 'm' }, { w: 'beast', k: 'm' }, { w: 'cyclops', k: 'm' },
  { w: 'hag', k: 'm' }, { w: 'crone', k: 'm' }, { w: 'golem', k: 'm' }, { w: 'kraken', k: 'm' },
  { w: 'gorgon', k: 'm' }, { w: 'medusa', k: 'm' }, { w: 'phantasm', k: 'n' }, { w: 'apparition', k: 'n' },
  { w: 'necromancer', k: 'm' }, { w: 'sorcerer', k: 'm' }, { w: 'coven', k: 'n' },

  // the grave
  { w: 'grave', k: 'n' }, { w: 'tomb', k: 'n' }, { w: 'tombstone', k: 'n' }, { w: 'crypt', k: 'n' },
  { w: 'coffin', k: 'n' }, { w: 'casket', k: 'n' }, { w: 'hearse', k: 'n' }, { w: 'morgue', k: 'n' },
  { w: 'mausoleum', k: 'n' }, { w: 'cemetery', k: 'n' }, { w: 'graveyard', k: 'n' }, { w: 'catacomb', k: 'n' },
  { w: 'gravestone', k: 'n' }, { w: 'shroud', k: 'n' }, { w: 'urn', k: 'n' }, { w: 'embalm', k: 'v' },
  { w: 'bury', k: 'v' }, { w: 'buried', k: 'a' }, { w: 'dead', k: 'a' }, { w: 'death', k: 'n' },
  { w: 'deadly', k: 'a' }, { w: 'doom', k: 'n' }, { w: 'doomed', k: 'a' }, { w: 'mortal', k: 'a' },
  { w: 'moribund', k: 'a' }, { w: 'morbid', k: 'a' }, { w: 'funeral', k: 'n' }, { w: 'requiem', k: 'n' },
  { w: 'pallbearer', k: 'n' },

  // the body, unkindly
  { w: 'skull', k: 'n' }, { w: 'bone', k: 'n' }, { w: 'bones', k: 'n' }, { w: 'bony', k: 'a' },
  { w: 'blood', k: 'n' }, { w: 'bloody', k: 'a' }, { w: 'gore', k: 'n' }, { w: 'gory', k: 'a' },
  { w: 'guts', k: 'n' }, { w: 'fang', k: 'n' }, { w: 'fangs', k: 'n' }, { w: 'claw', k: 'n' },
  { w: 'claws', k: 'n' }, { w: 'talon', k: 'n' }, { w: 'carcass', k: 'n' }, { w: 'marrow', k: 'n' },
  { w: 'eyeball', k: 'n' }, { w: 'brains', k: 'n' }, { w: 'flesh', k: 'n' }, { w: 'scar', k: 'n' },
  { w: 'stitches', k: 'n' }, { w: 'goo', k: 'n' }, { w: 'slime', k: 'n' }, { w: 'slimy', k: 'a' },
  { w: 'ooze', k: 'n' }, { w: 'pus', k: 'n' }, { w: 'maggot', k: 'n' }, { w: 'rot', k: 'n' },
  { w: 'rotten', k: 'a' }, { w: 'decay', k: 'n' }, { w: 'mold', k: 'n' }, { w: 'moldy', k: 'a' },
  { w: 'fester', k: 'v' }, { w: 'putrid', k: 'a' }, { w: 'rancid', k: 'a' }, { w: 'cobweb', k: 'n' },

  // the night and its noises
  { w: 'night', k: 'n' }, { w: 'midnight', k: 'n' }, { w: 'moon', k: 'n' }, { w: 'full moon', k: 'n' },
  { w: 'dark', k: 'a' }, { w: 'darkness', k: 'n' }, { w: 'gloom', k: 'n' }, { w: 'gloomy', k: 'a' },
  { w: 'murk', k: 'n' }, { w: 'murky', k: 'a' }, { w: 'fog', k: 'n' }, { w: 'mist', k: 'n' },
  { w: 'bog', k: 'n' }, { w: 'swamp', k: 'n' }, { w: 'mire', k: 'n' }, { w: 'howl', k: 'v' },
  { w: 'moan', k: 'v' }, { w: 'groan', k: 'v' }, { w: 'wail', k: 'v' }, { w: 'shriek', k: 'v' },
  { w: 'scream', k: 'v' }, { w: 'screech', k: 'v' }, { w: 'cackle', k: 'v' }, { w: 'creak', k: 'v' },
  { w: 'creep', k: 'v' }, { w: 'creepy', k: 'a' }, { w: 'crawl', k: 'v' }, { w: 'lurk', k: 'v' },
  { w: 'stalk', k: 'v' }, { w: 'prowl', k: 'v' }, { w: 'haunt', k: 'v' }, { w: 'haunted', k: 'a' },
  { w: 'boo', k: 'n' }, { w: 'eek', k: 'n' }, { w: 'rattle', k: 'v' }, { w: 'chains', k: 'n' },
  { w: 'fright', k: 'n' }, { w: 'frightful', k: 'a' }, { w: 'fear', k: 'n' }, { w: 'dread', k: 'n' },
  { w: 'terror', k: 'n' }, { w: 'horror', k: 'n' }, { w: 'scare', k: 'v' }, { w: 'scary', k: 'a' },
  { w: 'eerie', k: 'a' }, { w: 'grim', k: 'a' }, { w: 'grisly', k: 'a' }, { w: 'gruesome', k: 'a' },
  { w: 'sinister', k: 'a' }, { w: 'wicked', k: 'a' }, { w: 'cursed', k: 'a' }, { w: 'curse', k: 'n' },
  { w: 'hex', k: 'n' }, { w: 'spell', k: 'n' }, { w: 'macabre', k: 'a' }, { w: 'uncanny', k: 'a' },
  { w: 'unholy', k: 'a' }, { w: 'infernal', k: 'a' }, { w: 'diabolical', k: 'a' }, { w: 'fiendish', k: 'a' },
  { w: 'monstrous', k: 'a' }, { w: 'hideous', k: 'a' }, { w: 'vile', k: 'a' }, { w: 'hollow', k: 'a' },
  { w: 'headless', k: 'a' }, { w: 'bloodthirsty', k: 'a' }, { w: 'nocturnal', k: 'a' }, { w: 'spectral', k: 'a' },
  { w: 'baleful', k: 'a' }, { w: 'bewitched', k: 'a' }, { w: 'possessed', k: 'a' },
  { w: 'hell', k: 'n' }, { w: 'brimstone', k: 'n' }, { w: 'inferno', k: 'n' }, { w: 'abyss', k: 'n' },
  { w: 'lunatic', k: 'a' }, { w: 'deranged', k: 'a' }, { w: 'cryptic', k: 'a' },

  // the witch's kitchen
  { w: 'cauldron', k: 'n' }, { w: 'potion', k: 'n' }, { w: 'brew', k: 'n' }, { w: 'broom', k: 'n' },
  { w: 'broomstick', k: 'n' }, { w: 'lantern', k: 'n' },
  { w: 'pumpkin', k: 'n' }, { w: 'jack-o-lantern', k: 'n', say: 'JH AE K AH L AE N T ER N' },
  { w: 'candy', k: 'n' }, { w: 'trick', k: 'n' },
  { w: 'scarecrow', k: 'n' }, { w: 'scythe', k: 'n' },
  { w: 'axe', k: 'n' }, { w: 'cleaver', k: 'n' }, { w: 'dungeon', k: 'n' },
  { w: 'castle', k: 'n' },
  { w: 'ouija', k: 'n' }, { w: 'seance', k: 'n' }, { w: 'tarot', k: 'n' }, { w: 'omen', k: 'n' },
  { w: 'grimoire', k: 'n' }, { w: 'eldritch', k: 'a', say: 'EH L D R IH CH' },

  // the menagerie
  { w: 'bat', k: 'n' }, { w: 'bats', k: 'n' }, { w: 'black cat', k: 'n' },
  { w: 'spider', k: 'n' }, { w: 'raven', k: 'n' }, { w: 'crow', k: 'n' }, { w: 'owl', k: 'n' },
  { w: 'rat', k: 'n' }, { w: 'toad', k: 'n' }, { w: 'newt', k: 'n' }, { w: 'snake', k: 'n' },
  { w: 'serpent', k: 'n' }, { w: 'vulture', k: 'n' }, { w: 'wolf', k: 'n' }, { w: 'hound', k: 'n' },
  { w: 'worm', k: 'n' }, { w: 'leech', k: 'n' }, { w: 'scorpion', k: 'n' }, { w: 'vermin', k: 'n' },
  { w: 'tarantula', k: 'n' }, { w: 'cockroach', k: 'n' }, { w: 'beetle', k: 'n' }, { w: 'buzzard', k: 'n' },

  // the canon (characters and the people who made them famous)
  { w: 'Dracula', k: 'm' }, { w: 'Frankenstein', k: 'm' }, { w: 'Igor', k: 'm' }, { w: 'Nosferatu', k: 'm' },
  { w: 'Transylvania', k: 'm' }, { w: 'Jekyll', k: 'm' }, { w: 'Hyde', k: 'm' }, { w: 'Lugosi', k: 'm' },
  { w: 'Karloff', k: 'm' }, { w: 'Lovecraft', k: 'm' }, { w: 'Cthulhu', k: 'm', say: 'K TH UW L UW' },
  { w: 'Poe', k: 'm' }, { w: 'Elvira', k: 'm' }, { w: 'Morticia', k: 'm' }, { w: 'Gomez', k: 'm' },
  { w: 'Wednesday', k: 'm' }, { w: 'Lurch', k: 'm' }, { w: 'Beetlejuice', k: 'm', say: 'B IY T AH L JH UW S' },
  { w: 'Count', k: 'm' }, { w: 'Baron', k: 'm' }, { w: 'Vlad', k: 'm' }, { w: 'Boris', k: 'm' },
  { w: 'Bela', k: 'm' }, { w: 'Vincent', k: 'm' }, { w: 'Mothman', k: 'm' }, { w: 'Bigfoot', k: 'm' },
  { w: 'Krampus', k: 'm', say: 'K R AE M P AH S' }, { w: 'Wendigo', k: 'm', say: 'W EH N D IH G OW' },
  { w: 'Chupacabra', k: 'm', say: 'CH UW P AH K AA B R AH' }, { w: 'Baba Yaga', k: 'm', say: 'B AA B AH Y AA G AH' },
  { w: 'Rasputin', k: 'm' }, { w: 'Sleepy Hollow', k: 'm' }, { w: 'Halloween', k: 'n' },
];
