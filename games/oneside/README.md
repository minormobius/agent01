# One Side — `/oneside/`

A maze chase on a Möbius strip. Eat every dot. The ghosts pass through
walls, of course, because they don't walk your maze. They walk the maze on
**the other side of the paper**, half a strip away. Its rails show through
faintly, in violet, and the ghosts glide along them, through your walls,
upside down (they're on the underside). They take their signals from over
there, and they reach you through the paper.

But a Möbius strip has only one side. Walk half a strip and you're on the
maze they were bound to; they're bound to the one you left. Clear both faces
to clear the level.

Swipe (keep the finger down to keep steering) or use the arrows / WASD; the
turn waits for the next opening. Space or P pauses; B shows or hides the band.

## The surface

The paper of a Möbius strip, both faces together, is one band twice the
strip's length with no twist (the strip's double cover). The maze is painted
on that band: 48 × 17 tiles, wrapping round. The back of any spot is the
part of the band half its length on, flipped top to bottom:

    back(x, y) = (x + 24, 16 − y)

so the back of where you stand is a different stretch of the same maze.
`js/maze.js` builds it like the arcade's: corridors one tile wide on node
rows and columns (rows mirror about the middle, so a node's back is a node),
a random spanning tree plus loops, no dead ends, four power pellets.

## The ghosts

Every ghost is physically on the other face of wherever it seems to be: a
ghost at surface point `g` stands at the same spot of the strip as
`back(g)`, which is where you see it. So:

- **its moves are bound by the maze half a strip away** (the maze at `g`),
  never by your walls;
- **its signals come from half a strip away**: the arcade's targets are
  worked out where you are and carried through the twist;
- **it catches you through the paper**, at your spot on the other face. A
  ghost on your own stretch of the surface is half a strip away, and harmless.

The minds are the arcade's: tile to tile, never straight back, the open way
whose next tile is nearest the target, ties broken up, left, down, right;
scatter and chase on the arcade's clock (with shorter chases), a turn-around
at every change of mode. Red aims at you, pink four tiles ahead, cyan at
twice the step from red to two tiles ahead, orange at you until it's within
8, then home. A power pellet frightens them for a few seconds: for a moment
there's only one side, and you can eat them.

**Why there are fewer of them.** Your walls don't slow them, so they're far
harder to shake than the arcade's: measured with bots, even a pure fleeing
player is caught twice a minute by four ghosts. So level 1 has two ghosts,
level 2 three, and all four come from level 3; they run at 75% of your
speed, and you have four lives and one more every 5000 points.

## The fruit

Of course there are cherries: the arcade's bonus fruit, by level (cherry
100, strawberry 300, orange 500, apple 700, melon 1000, galaxian 2000, bell
3000, then the key, 5000), after 70 and 170 dots. Each one turns up right
beside you, faint and upside down, through the paper: it sits at the back
of a corridor near where you are, so it's really half a strip away. You
have twelve seconds to go round and eat it from its own face.

## The leaderboard

Highest scores (🏆, and POST SCORE when a game ends), read live off
ATProto: a score is a `com.minomobi.lab.score` record in the player's own
repo, `{ site: "oneside", game: "score-v1", value, unit: "points",
higherIsBetter: true, detail: "seed=… level=…" }`, and every browser
rebuilds the board from the network (Orb's `board-kit.js` and `corpus.js`).
The game id carries a version: change the rules in a way that moves scores,
and bump it. `js/score.js` holds the record rules, which the selftest checks.

## The band

Above the strip, the strip itself: the whole surface painted on a Möbius
band in 3D (`mob(u, y)`, a half twist per lap, so `mob(u + 24, 16 − y)` is the
same point with the opposite normal). It turns to keep your face of the
paper toward you, so the ghosts near you are behind it, faint, through the
paper, and come into view as the twist brings their face round.

## Files

| file | what |
|---|---|
| `js/maze.js` | the surface, `back()`, the maze generator |
| `js/game.js` | the simulation (no DOM): movement, the ghost minds through the twist, modes, collisions through the paper |
| `js/view.js` | the strip with its rails, the band in 3D |
| `js/main.js` | swipes and keys, the fixed-step loop |

## Tests

```bash
node games/oneside/test/oneside.selftest.mjs   # the surface, the maze, the rules that carry the idea; preflight runs this
```
