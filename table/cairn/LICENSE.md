# Licence and attribution — the Cairn roller

## The game

**Cairn Second Edition** is by **Yochai Gal**, and its text is licensed under the
[Creative Commons Attribution-ShareAlike 4.0 International licence (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

- Game: <https://cairnrpg.com/>
- The edition used here: <https://cairnrpg.com/second-edition/>

## What this directory contains

[`data.js`](data.js) is an **adaptation** of the Cairn 2e SRD: the twenty
backgrounds (names, starting gear, and both d6 tables each), the eight d10
character-trait tables, the d20 bonds table, the d20 omens table, and the scars
table — restructured into JSON so a program can roll on them. Nothing has been
reworded; the change is of form, not of content.

It was produced by [`tools/scrape-srd.py`](tools/scrape-srd.py) from the pages
under <https://cairnrpg.com/second-edition/>, and can be regenerated:

```sh
python3 table/cairn/tools/scrape-srd.py > table/cairn/data.js
```

## What that obliges us to do

CC BY-SA 4.0 asks for two things, and both are met here:

1. **Attribution** — credited in `data.js`, in the page footer of the roller, and
   in this file, with a link to the source and to the licence.
2. **ShareAlike** — because `data.js` adapts licensed material, it is offered
   under the **same licence, CC BY-SA 4.0**. Anyone may take that file and use
   it on the same terms.

The surrounding code (`roll.js`, `app.js`, `index.html`) is this repository's own
work and is not a derivative of the Cairn text; it is offered under CC BY-SA 4.0
as well, so the whole directory can be reused as one piece without anyone having
to work out where the boundary falls.

## What this is not

This roller is an unofficial, third-party tool. It is **not affiliated with,
endorsed by, or supported by Yochai Gal**. Cairn's own licence explicitly allows
compatible third-party material without approval or notification, which is the
basis on which this exists. Bugs here are ours, not the game's.
