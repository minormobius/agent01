# OOZE

Pilot a 4D amoeba to the exit, at `kata.mino.mobi/ooze/`. It's a game made from AMOEBA's engine (`../amoeba/`), which
it imports from the same site rather than copying.

## The game

You are an amoeba in four dimensions, crawling on a floor that is a 3D space (x, z, w). Get your middle into the gold
goal.

- **Steer** by pressing and holding the smell sphere (bottom right). Its directions are the floor's, so you can steer
  ana and kata, out of your slice. The cell answers with pseudopods. It is the real AMOEBA cell (a remeshed membrane of
  tetrahedra, signalling, myosin, adhesion), steered and nothing more.
- **Energy.** Every pseudopod costs energy: the work of polymerisation, the membrane pushed out, at a rate measured to
  be about one unit a radius, plus a little for being alive. Food (green) refills it; crawl over a morsel and close
  round it to eat it. With none left you can't push a pseudopod, and after three seconds you have starved.
- **Walls** are 4D boxes the membrane and the nucleus can't enter. A wall across your whole view may stop short in w,
  and then the way round is through w.

## The oracle (`js/game.js`)

It says whether a level can be done, and how hard it is. It is a model of the cell, not the cell:

1. **Where the cell fits.** A grid over the floor at 0.25. A point is free if it is at least 0.55 from every wall:
   the nucleus is the rigid part, and the membrane flows round anything.
2. **Distances** between the start, each food and the goal, by Dijkstra over that grid (26 neighbours).
3. **Which food, in what order.** States are (where, which eaten), holding the most energy you can have there. A level
   is solvable if some state reaches the goal with energy to spare. Each leg costs 1.45 a radius: the measured cost,
   plus a margin for the turning and waiting a real pilot does.

It gives back:

- the plan, and its path through the grid (the hint, and the bot's route);
- the food needed, at the least;
- the margin;
- the route's length, and how much of it runs through w;
- the narrowest gap;
- a difficulty out of 10, made from those.

## The levels

Ten made by hand, each teaching one thing:

1. First crawl
2. Hungry
3. Squeeze
4. Ana
5. Off to one side
6. Two ways
7. The wall
8. Larder
9. Kata and back
10. Hyphae

Each is harder than the last (1.3 → 6.3). Each one's starting energy is 1.3× the least the oracle needs. Where there
is food, the level can't be done without it. The selftest holds all of that.

Beating a level opens the next (kept in this browser; `?level=n` opens any). "new" grows a level from a random seed
(`?seed=s&diff=d` to share one). The generator builds barriers across x, each with a gap in z, a gap in w, or a
window in both, and puts food round about. It sets the energy so food is needed, and keeps only what the oracle can do
near the difficulty asked for.

## Flown by the bot

The bot flies the oracle's route through the real simulation (`js/play.js`): pure pursuit, steering at the point
1.5 radii further along the path, through the same steering the sphere gives you. The selftest has it win level 1.
All ten were flown once to confirm them:

BOTRESULTS

The bot found two engine bugs:

- **A thin wall let points out the far side.** A point that got more than halfway through went out the nearer side.
  Points now leave by the side they came in by.
- **Walls began exactly at the floor,** so points lying on it (y = 0) never counted as inside one. Walls now reach
  below the floor.

## Files

- `js/game.js`: levels, oracle, generator. No DOM.
- `js/play.js`: a level set up on AMOEBA's engine, judged, and the bot.
- `js/worker.js`: the physics, and generation, off the page's thread.
- `js/main.js`: the page (AMOEBA's, made over). It adds walls and the goal to the ray-marched scene, the energy bar,
  the levels and the banner, and draws the level and the hint on the map.
- `test/ooze.selftest.mjs`: about 60 s.

AMOEBA's engine gained two hooks for this, both off unless a game sets them:

- `A.obstacles`: walls, for the points and the nucleus.
- `A.energy`: spent by polymerisation and refilled by food. With none left there is no pushing.
