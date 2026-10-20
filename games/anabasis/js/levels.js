/* Anabasis's levels: Anakata's text format (one block per w-slice, w = 0
   first; a row per y; the z layers side by side, z = 0 first), in worlds
   where w is a second down. Slice w = 0 is the kata end of the world, the
   way z = 0 is the bottom, so it's usually solid: the ground in w that the
   first slice above it stands against.

   The onboarding, one idea at a time: held from two sides; slipping down
   in w where the kata wall ends; climbing ana; climbing both ways; a crate
   as a step in w; and the staircase that climbs for ever. Then two harder
   climbs with crates, found by a random search over rooms whose every
   column is a staircase in the z-w plane, and kept for being short to say
   and long to solve. The selftest solves every one, pins its par, and
   proves the ones marked needsDown can't be done with z the only down. */
const RAW = [
  {
    name: "held",
    hint: "Two downs here: z, and w. You stand only where something holds you from below AND from kata: the wall in the slice beneath yours in w. Turn your sight (SIGHT, or V) to see w as up: that wall is your floor.",
    map: `
######  ######

######  @....G`,
  },
  {
    name: "slip", needsDown: true,
    hint: "Where the wall kata of you ends, nothing holds you in w, and you slip down a slice. Let it.",
    map: `
#######  #######

#######  ###...G

#######  @......`,
  },
  {
    name: "ledge", needsDown: true,
    hint: "Two downs, so two ups. The block ahead is too tall in z, but you can climb ana onto it, up in w.",
    map: `
######  ######

######  @..###

######  .....G`,
  },
  {
    name: "stair", needsDown: true,
    hint: "Up in z, then up in w, and up in w again. Walking into a block, you climb whichever way holds you.",
    map: `
#######  #######  #######

#######  @##....  ...##..

#######  ...###.  .....##

#######  .....##  ......G`,
  },
  {
    name: "boost", needsDown: true,
    hint: "The ledge is two slices high in w: too high to climb. Push the crate against it and climb the crate first.",
    map: `
#######  #######

#######  @.C..##

#######  .....##

#######  ......G`,
  },
  {
    name: "ascending", needsDown: true, wrap: true,
    hint: "w goes round here. The goal is one slice below you, kata of the wall in front of you, and the wall is too high to climb. So go up: the stairs round the room climb for ever.",
    map: `
####  ###.
####  G##.
####  .###
####  .###

####  @###
####  ###.
####  ###.
####  ###.

####  ..##
####  ####
####  ####
####  ##..

####  #...
####  ####
####  ####
####  ...#`,
  },
  {
    name: "hoist", needsDown: true,
    hint: "The goal is lower than you in z, and two slices up in w. A crate is a step in either gravity.",
    map: `
###  ###  ###
###  ###  ###
###  ##.  ...

###  ###  @..
###  ###  .C.
###  ...  ...

###  ###  ...
###  ###  ...
###  ...  ...

###  .G.  ...
###  .##  ...
###  ...  ...`,
  },
  {
    name: "cairn", needsDown: true,
    hint: "Two crates, in two slices, and the goal two slices ana of you. Without a crate there is no way up.",
    map: `
####  ####  ##.#
####  ####  ####
####  ####  ####

####  .###  .@.#
####  .###  ..C.
####  ####  ....

####  .###  ...#
####  .###  ....
####  .###  ....

####  .###  ....
####  .G##  ....
####  ..C.  ....`,
  },
];
export const LEVELS = RAW.map((d) => Object.assign({ gravW: true }, d));
