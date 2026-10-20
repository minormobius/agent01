/* Anabasis's levels: Anakata's text format (one block per w-slice, w = 0
   first; a row per y; the z layers side by side, z = 0 first), in worlds
   where w is a second down. Slice w = 0 is the kata end of the world, the
   way z = 0 is the bottom, so it's usually solid: the ground in w that the
   first slice above it stands against.

   Gravity takes you kata; nothing but a ramp takes you ana. One idea at a
   time: held from two sides; slipping down a slice where the block kata of
   you ends; a ramp that carries you round a wall in your slice; ramps that
   hold you up over nothing; a crate dropped into a gap kata of you; a crate
   dropped two slices down a shaft; and the ramps round a room that climb
   for ever. The selftest solves every one, pins its par, and proves each
   impossible without what it's about (the second down, its ramps, its
   crates, its wrap). */
const RAW = [
  {
    name: "held",
    hint: "Two downs here: z, and w. You stand only where something holds you from below AND from kata: a block in the slice beneath yours in w. Turn your sight (SIGHT, or V) to see w as up: that block is your floor.",
    map: `
######  ######

######  @....G`,
  },
  {
    name: "slip", needsDown: true,
    hint: "Where the block kata of you ends, nothing holds you in w, and you slip down a slice. Let it.",
    map: `
#######  #######

#######  ###...G

#######  @......`,
  },
  {
    name: "around", needsRamp: true,
    hint: "A wall in your slice stops you, and gravity only ever takes you kata. But a ramp (the tile ahead, cool to warm) carries you a slice ana: walk off it toward the wall and you go round it in w. Then the wall is kata of you, holding you up.",
    map: `
######  ######

##>###  @..###

######  .....G`,
  },
  {
    name: "stair", needsRamp: true,
    hint: "A ramp holds you against w's gravity. Where the floor in your slice drops away ahead, the ramp you're on carries you over it a slice ana, onto the next ramp.",
    map: `
######  ######

#>....  @.....

..>...  ....#.

...>##  ....G.`,
  },
  {
    name: "bridge",
    hint: "There's a gap in the block kata of you: walk over it and you'll slip into it, and there's no way out. A crate falls kata too.",
    map: `
#######  #######

#######  ###.###

#######  @C....G`,
  },
  {
    name: "plumb", needsRamp: true,
    hint: "The same gap, and the only crate is a slice ana of you, beside a shaft that goes straight down through w.",
    map: `
#######  #######
#######  #######
#######  #######

#######  ###.###
#######  #######
#######  #######

#######  @.....G
#######  .######
#>.####  ...####

#######  ....###
#######  ...C###
##>####  ##..###`,
  },
  {
    name: "ascending", needsRamp: true, wrap: true,
    hint: "w goes round here. The goal is just past the wall beside you, one slice down, and nothing takes you down through a wall. Go up: the ramps round the room climb for ever.",
    map: `
####  ####
###v  G##.
^##.  .##.
####  ####

#.##  @.##
####  ####
###v  ###.
##.#  ##..

#>.#  #..#
####  ####
####  ####
#.<#  #..#

##>#  ##..
###.  ###.
.###  .###
#<##  ..##`,
  },
];
export const LEVELS = RAW.map((d) => Object.assign({ gravW: true }, d));
