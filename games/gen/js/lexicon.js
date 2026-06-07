/* The Ludographer — THE GRAMMAR.

   This is the rulebook for rulebooks. It is to a board game what borges/'s
   lexicon.js (Propp functions + motif atoms + culture packs) is to a tale:
   the finite vocabulary of legal parts, tagged so the generator can only ever
   bolt together combinations that cohere.

   Three axes recombine into the ~10^4-10^6 structurally distinct games the
   space affords, then theme + parameter tuning make the seed-space effectively
   endless:

     1. TOPOLOGIES   the physical substrate the game lives on (8)
     2. MECHANICS    the primitives, tagged provides/requires/conflicts (~32)
     3. WIN          the legal victory conditions, gated on what's present (7)

   plus THEMES (skins that rename resources/components/titles so two games that
   share a skeleton still feel like different objects on the table).

   The tag system is load-bearing. A mechanic PROVIDES capability-tags and may
   REQUIRE others be present in the assembled set; win conditions REQUIRE tags
   too. The generator (generate.js) is just a constraint walk over this data:
   pick a core, satisfy its needs with compatible secondaries, then pick a win
   condition the assembled set can actually reach. Coherence is structural — no
   illegal game can be expressed — which is the v1 playability guarantee.

   Attaches to LUDO.lex. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  // ─────────────────────────────────────────────────────────────────────────
  // TOPOLOGIES — the board substrate. `params(rand)` rolls size/shape numbers.
  // ─────────────────────────────────────────────────────────────────────────
  var TOPOLOGIES = [
    { id: "square", name: "Orthogonal grid", short: "grid",
      blurb: "A square lattice; pieces occupy cells and act on rank-and-file neighbours.",
      params: function (r) { var n = r.int(5, 9); return { cols: n, rows: n, cells: n * n }; } },
    { id: "hex", name: "Hex field", short: "hex",
      blurb: "A hexagonal tiling; six neighbours per cell, no awkward diagonals.",
      params: function (r) { var n = r.int(4, 7); return { radius: n, cells: 1 + 3 * n * (n + 1) }; } },
    { id: "graph", name: "Point-to-point map", short: "map",
      blurb: "A network of named sites joined by routes; movement and control happen on the edges.",
      params: function (r) { var n = r.int(8, 16); return { nodes: n, edges: r.int(n + 2, n * 2) }; } },
    { id: "track", name: "Looping track", short: "track",
      blurb: "A circuit of numbered spaces; everything advances around it.",
      params: function (r) { var n = r.int(24, 54); return { spaces: n, loop: r.chance(0.5) }; } },
    { id: "modular", name: "Modular tiles", short: "tiles",
      blurb: "The board does not exist at setup — players build it from drawn tiles as they play.",
      params: function (r) { return { tilePool: r.int(48, 84), startTiles: r.int(1, 3) }; } },
    { id: "tableau", name: "Shared row + tableaus", short: "tableau",
      blurb: "No map — a central market/row feeds private tableaus that each player grows.",
      params: function (r) { return { rowSize: r.int(4, 7), tableauCap: r.int(8, 16) }; } },
    { id: "rondel", name: "Action rondel", short: "rondel",
      blurb: "A wheel of action wedges; your marker walks the wheel and you take where it lands.",
      params: function (r) { return { wedges: r.int(6, 10), freeStep: r.int(1, 3) }; } },
    { id: "regions", name: "Partitioned regions", short: "regions",
      blurb: "The board is carved into a handful of contested regions, each scored on its own.",
      params: function (r) { return { regions: r.int(5, 9) }; } }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // MECHANICS. family: core (an engine to build a game around) | spice (layers
  // on a core) | economy (resource plumbing) . weight 1..5 ~ rules complexity.
  //
  //   provides : capability-tags this contributes to the assembled set
  //   requires : tags that MUST already be present for this to make sense
  //   conflicts: mechanic ids that cannot co-exist with this
  //   topos    : compatible topology ids ("*" = any)
  //   comps    : component ids implied (the manifest is the union over the set)
  //   rule(g)  : a rulebook paragraph, rendered against the finished spec g
  // ─────────────────────────────────────────────────────────────────────────
  var MECH = [
    // ── core engines ────────────────────────────────────────────────────────
    { id: "worker-placement", name: "Worker placement", family: "core", weight: 3,
      provides: ["action", "resource", "vp"], requires: [], conflicts: [],
      topos: ["graph", "tableau", "rondel", "modular", "regions"],
      comps: ["worker-meeples", "action-board", "resource-cubes"],
      desc: "Deploy limited workers to claim action spaces; once taken, a space is blocked.",
      rule: function (g) { return "On your turn place one " + g.t.worker + " on an empty action space and resolve it immediately. Each space holds one " + g.t.worker + "; an occupied space is closed to everyone until the round ends and all " + g.t.worker + "s return. The squeeze for the best spaces is the game."; } },

    { id: "area-majority", name: "Area majority / influence", family: "core", weight: 3,
      provides: ["majority", "spatial", "vp"], requires: [], conflicts: [],
      topos: ["hex", "regions", "graph", "square"],
      comps: ["influence-discs", "board"],
      desc: "Commit presence to zones; whoever holds the most when a zone scores takes it.",
      rule: function (g) { return "Spend actions to add " + g.t.influence + " to a region. When a region scores, the player with the most " + g.t.influence + " there takes the larger reward and the runner-up a smaller one. Ties split. Spreading thin loses everywhere; over-committing wastes pieces."; } },

    { id: "tile-laying", name: "Tile laying", family: "core", weight: 2,
      provides: ["spatial", "vp"], requires: [], conflicts: [],
      topos: ["modular", "square", "hex"],
      comps: ["tiles", "board"],
      desc: "Draw and place tiles whose edges must match; placement scores features.",
      rule: function (g) { return "Draw a tile and place it so its edges agree with the tiles already down. Completing a feature (a closed loop, a filled cluster) scores it to whoever committed the most " + g.t.piece + "s to it. Where you place is half the decision; whether to place at all is the other half."; } },

    { id: "network-building", name: "Network building", family: "core", weight: 3,
      provides: ["network", "spatial", "vp"], requires: [], conflicts: ["connection"],
      topos: ["graph", "square", "hex"],
      comps: ["route-tokens", "board"],
      desc: "Lay routes to link sites into a personal network that pays out by reach.",
      rule: function (g) { return "Claim an edge to extend your network of " + g.t.route + "s. Longer connected runs and reaching scoring sites pay increasing " + g.t.vp + ". Edges are exclusive — a route claimed is a route denied — so the map is a slow knife-fight over chokepoints."; } },

    { id: "set-collection", name: "Set collection", family: "core", weight: 2,
      provides: ["set", "vp"], requires: [], conflicts: [],
      topos: ["tableau", "square", "hex", "graph"],
      comps: ["cards", "tokens"],
      desc: "Gather matching or complementary cards; complete sets cash in for points.",
      rule: function (g) { return "Collect " + g.t.card + "s and turn in sets — either all-alike or all-different, declared at setup — for " + g.t.vp + ". The more ambitious the set the steeper the reward curve, so the tension is always cash a safe small set now or hold for the big one."; } },

    { id: "engine-building", name: "Engine building", family: "core", weight: 4,
      provides: ["engine", "resource", "vp"], requires: [], conflicts: [],
      topos: ["tableau"],
      comps: ["dev-cards", "resource-cubes", "player-board"],
      desc: "Buy upgrades that make later turns produce more, compounding over the game.",
      rule: function (g) { return "Spend " + g.r0 + " to install " + g.t.card + "s on your player board; each one fires every round, so early purchases compound. The whole game is a bet on the interest rate of your own engine versus the clock."; } },

    { id: "deck-building", name: "Deck building", family: "core", weight: 3,
      provides: ["engine", "hand", "vp"], requires: [], conflicts: [],
      topos: ["tableau"],
      comps: ["cards", "market-row"],
      desc: "Buy cards into your own deck; refine the deck's average draw over time.",
      rule: function (g) { return "Play your hand for buying power, acquire stronger " + g.t.card + "s from the central row into your discard, and shuffle them in when your deck runs out. Thinning weak starters matters as much as adding strong cards: the deck is the engine and the average draw is the dial."; } },

    { id: "bag-building", name: "Bag building", family: "core", weight: 3,
      provides: ["engine", "resource"], requires: [], conflicts: ["deck-building"],
      topos: ["tableau"],
      comps: ["bag", "resource-tokens"],
      desc: "Draw tokens blind from a bag you slowly stock; output is a probability you tune.",
      rule: function (g) { return "Draw a handful of tokens blind from your bag and spend what comes out. Buying better tokens raises your expected draw; the randomness never fully leaves, so you are tuning a distribution, not a hand."; } },

    { id: "pickup-deliver", name: "Pick-up and deliver", family: "core", weight: 3,
      provides: ["movement", "resource", "spatial"], requires: [], conflicts: [],
      topos: ["graph", "track", "hex"],
      comps: ["pawns", "goods-tokens", "board"],
      desc: "Haul goods from where they're made to where they're wanted, for payment.",
      rule: function (g) { return "Move your " + g.t.piece + " to load " + g.r0 + " where it is produced and carry it to a site that demands it for payment. Routes silt up with others' deliveries; the optimisation is which loop to run, and when the prices shift under you."; } },

    { id: "racing", name: "Racing", family: "core", weight: 2,
      provides: ["race", "movement", "spatial"], requires: [], conflicts: [],
      topos: ["track", "graph"],
      comps: ["pawns", "track-board"],
      desc: "Advance along a track; first to the line (with tie-breaks) wins.",
      rule: function (g) { return "Push your " + g.t.piece + " along the track. Movement is paid for, never free, so the lead is a resource you spend down — the race is really about who converts " + g.r0 + " into distance most efficiently near the line."; } },

    { id: "auction", name: "Auction / bidding", family: "core", weight: 3,
      provides: ["market", "resource", "vp"], requires: [], conflicts: [],
      topos: ["tableau"],
      comps: ["money-tokens", "lots"],
      desc: "Lots come up for bid; players spend a shared currency to win them.",
      rule: function (g) { return "Each round, lots are revealed and bid on in turn. You spend " + g.r0 + " to win the lot you want — but " + g.r0 + " is finite and shared across the whole game, so every bid is also a vote on what you can afford to want later. Overpay and you starve; underbid and rivals furnish themselves cheaply."; } },

    { id: "drafting", name: "Card drafting", family: "core", weight: 2,
      provides: ["draft", "set"], requires: [], conflicts: [],
      topos: ["tableau"],
      comps: ["cards"],
      desc: "Pick one card from a hand, pass the rest; what you deny is as real as what you take.",
      rule: function (g) { return "Take one " + g.t.card + " from the hand you hold, then pass the rest to your neighbour. You will see those hands come round again, lighter each time. Drafting for your own plan and hate-drafting away an opponent's are the same motion seen from two sides."; } },

    { id: "area-movement", name: "Area movement (dudes on a map)", family: "core", weight: 4,
      provides: ["movement", "spatial", "elimination"], requires: [], conflicts: [],
      topos: ["graph", "hex", "regions"],
      comps: ["army-units", "board", "combat-dice"],
      desc: "Move units between adjacent areas; where forces meet, they fight and are removed.",
      rule: function (g) { return "March " + g.t.piece + "s between adjacent areas. When opposing forces share an area they fight: losses are removed from the board. Holding ground costs presence you could be spending elsewhere — the map is always too big for your army."; } },

    { id: "stock-influence", name: "Stock holding / influence", family: "core", weight: 4,
      provides: ["market", "majority", "vp"], requires: [], conflicts: [],
      topos: ["tableau", "regions"],
      comps: ["shares", "board"],
      desc: "Hold shares in ventures you also steer; you profit when what you back rises.",
      rule: function (g) { return "Buy " + g.t.share + "s in the ventures on the board, then use actions to grow the ventures you are most invested in. Pay-outs follow holdings, so the sharpest play is steering a venture everyone shares while quietly owning the most of it."; } },

    { id: "pattern-building", name: "Pattern building", family: "core", weight: 2,
      provides: ["spatial", "vp", "set"], requires: [], conflicts: [],
      topos: ["square", "hex", "tableau"],
      comps: ["tiles", "player-board"],
      desc: "Arrange pieces on your own board to satisfy adjacency and shape goals.",
      rule: function (g) { return "Take " + g.t.piece + "s into your personal board so they satisfy the round's pattern goals — adjacencies, lines, no-repeats. Drafting the wrong piece can be forced on you, so the skill is leaving yourself legal, scoring placements when the good pieces are gone."; } },

    { id: "enclosure", name: "Enclosure / territory", family: "core", weight: 3,
      provides: ["spatial", "majority"], requires: [], conflicts: [],
      topos: ["square", "hex"],
      comps: ["walls", "board"],
      desc: "Wall off empty space; enclosed area scores to whoever sealed it.",
      rule: function (g) { return "Place " + g.t.wall + "s to fence in open cells. A region you fully enclose scores its area to you — but walls are shared scenery once placed, so a careless line can hand a rival the room you were building. Territory is taken by closing, not by filling."; } },

    { id: "connection", name: "Connection", family: "core", weight: 2,
      provides: ["network", "spatial", "race"], requires: [], conflicts: ["network-building"],
      topos: ["square", "hex", "graph"],
      comps: ["stones", "board"],
      desc: "Place pieces to forge an unbroken link between your two sides; first to connect wins.",
      rule: function (g) { return "Place one " + g.t.piece + " per turn. Win the instant your pieces form an unbroken chain joining your two sides of the board. Every placement both extends your line and blocks an opponent's — the move that connects you is often the move that cuts them."; } },

    { id: "rondel-actions", name: "Rondel actions", family: "core", weight: 3,
      provides: ["action", "movement"], requires: [], conflicts: [],
      topos: ["rondel"],
      comps: ["rondel-board", "pawns"],
      desc: "Walk a marker around an action wheel; far jumps cost, so timing is geometry.",
      rule: function (g) { return "Each turn move your marker forward around the wheel and take the action it lands on. The first few steps are free; jumping further costs " + g.r0 + ". You cannot take an action without walking to it, so your turn order is a path-planning problem on a circle."; } },

    { id: "route-building", name: "Route building / ticket", family: "core", weight: 2,
      provides: ["network", "set", "vp"], requires: [], conflicts: ["connection"],
      topos: ["graph"],
      comps: ["route-cards", "claim-tokens", "board"],
      desc: "Collect matching cards to claim map routes that complete secret destination tickets.",
      rule: function (g) { return "Gather matching " + g.t.card + "s and spend them to claim routes between cities, working toward secret destination tickets that pay out if completed and bite if not. Claimed routes are exclusive, so a late traveller pays in detours."; } },

    // ── spice (secondary; layered onto exactly one core) ─────────────────────
    { id: "push-your-luck", name: "Push your luck", family: "spice", weight: 1,
      provides: ["risk"], requires: ["resource", "movement", "race"], conflicts: [],
      topos: ["*"], comps: ["risk-dice"],
      desc: "Keep going for more, but bust and lose the turn's gains.",
      rule: function (g) { return "When you act you may press on for a larger result — but each press risks a bust that voids everything you banked this turn. Knowing when to stop is the whole sub-game stitched over the rest."; } },

    { id: "hand-management", name: "Hand management", family: "spice", weight: 1,
      provides: ["hand"], requires: [], conflicts: ["deck-building"],
      topos: ["*"], comps: ["cards"],
      desc: "A hand of multi-use cards; the same card pays different ways.",
      rule: function (g) { return "You hold a hand of " + g.t.card + "s, each usable several ways — as the action printed, as currency, or as a one-shot effect. Sequencing the hand to waste nothing is where good players pull ahead."; } },

    { id: "variable-powers", name: "Variable player powers", family: "spice", weight: 1,
      provides: ["asymmetry"], requires: [], conflicts: [],
      topos: ["*"], comps: ["power-cards"],
      desc: "Each player starts with a unique rule-bending power.",
      rule: function (g) { return "Each player takes a faction with its own standing rule that bends the base game in one direction. The general strategy is shared; the optimal line is yours alone, set by the power you drew."; } },

    { id: "hidden-objectives", name: "Hidden objectives", family: "spice", weight: 1,
      provides: ["vp", "hidden"], requires: [], conflicts: [],
      topos: ["*"], comps: ["objective-cards"],
      desc: "Secret end-game goals nobody else can see.",
      rule: function (g) { return "Hold one or more secret objectives that score only at game-end. Because rivals must guess what you are building toward, half your play is misdirection — chasing a board state that reads as someone else's plan."; } },

    { id: "tech-tree", name: "Tech tree / advances", family: "spice", weight: 2,
      provides: ["engine", "vp"], requires: ["resource"], conflicts: [],
      topos: ["*"], comps: ["tech-board"],
      desc: "Unlock advances along branching tracks for permanent upgrades.",
      rule: function (g) { return "Spend " + g.r0 + " to unlock advances along branching tracks; each opens stronger options and small permanent bonuses. You cannot have it all, so the tree you climb is a commitment that shapes every later turn."; } },

    { id: "simultaneous-selection", name: "Simultaneous action selection", family: "spice", weight: 1,
      provides: ["tempo"], requires: ["action", "hand"], conflicts: [],
      topos: ["*"], comps: ["select-cards"],
      desc: "Everyone chooses secretly, then all reveal at once.",
      rule: function (g) { return "Each round everyone secretly programs their action, then all reveal together and resolve in a fixed order. Reading the table — who needs what, who will collide — matters as much as your own plan, and removes the agony of downtime."; } },

    { id: "take-that", name: "Take-that interaction", family: "spice", weight: 1,
      provides: ["interaction"], requires: ["hand", "movement"], conflicts: [],
      topos: ["*"], comps: ["action-cards"],
      desc: "Direct attacks: steal, block, redirect a rival's plan.",
      rule: function (g) { return "Some " + g.t.card + "s let you reach across the table — steal a resource, cancel an action, redirect a delivery. Held in reserve, the threat of them shapes play as much as their use; spent early, they are merely tempo."; } },

    { id: "catch-up", name: "Catch-up mechanism", family: "spice", weight: 1,
      provides: ["balance"], requires: ["vp", "race"], conflicts: [],
      topos: ["*"], comps: [],
      desc: "Trailing players get a structural boost; the leader is gently taxed.",
      rule: function (g) { return "Turn order, bonus actions, or cheaper purchases flow to whoever is behind on " + g.t.vp + ", and the leader pays a small tax in tempo. The game stays live to the last turn instead of snowballing out of reach."; } },

    { id: "end-bonuses", name: "End-game scoring bonuses", family: "spice", weight: 1,
      provides: ["vp"], requires: [], conflicts: [],
      topos: ["*"], comps: ["bonus-cards"],
      desc: "Revealed goals at game-end reward whoever leaned into them.",
      rule: function (g) { return "A set of public end-game goals (most of a thing, longest something, broadest spread) pays a fat bonus to whoever leaned hardest into each. They reframe the whole game the moment they flip, so reading them early is an edge."; } },

    // ── economy plumbing ─────────────────────────────────────────────────────
    { id: "resource-conversion", name: "Resource conversion", family: "economy", weight: 1,
      provides: ["resource"], requires: ["resource"], conflicts: [],
      topos: ["*"], comps: ["conversion-board"],
      desc: "Trade up raw goods into refined ones along a fixed chain.",
      rule: function (g) { return "Raw " + g.r0 + " refines into " + (g.r1 || "finished goods") + " up a fixed chain, each step worth more and harder to make. The chain is a tempo question: refine now for value, or hold raw goods flexible for whatever the board demands next."; } },

    { id: "market-fluctuation", name: "Fluctuating market", family: "economy", weight: 2,
      provides: ["market"], requires: ["resource", "market"], conflicts: [],
      topos: ["*"], comps: ["price-track"],
      desc: "Prices rise and fall with what players buy and sell.",
      rule: function (g) { return "Prices for " + g.r0 + " ride a track that climbs as players buy and sags as they sell. Flooding a good craters its value, so timing your sales against the table — and against your own earlier buys — is the quiet game beneath the loud one."; } }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // WIN CONDITIONS. Each gates on a tag being present in the assembled set, so
  // a game can only end the way its mechanics can actually be driven toward.
  // ─────────────────────────────────────────────────────────────────────────
  var WINS = [
    { id: "vp-threshold", name: "Victory points", needs: "vp", weight: 0.55,
      describe: function (g) { return "The game ends when the round track runs out or a player reaches " + g.params.vpTarget + " " + g.t.vp + ". The most " + g.t.vp + " then wins; ties break toward unspent " + g.r0 + "."; } },
    { id: "race-finish", name: "First past the line", needs: "race", weight: 0.9,
      describe: function (g) { return "The first player to reach the finish ends the game at once. Order of crossing is the result; there is no scoring afterward, so a marginal lead held to the line is a win as clean as a runaway one."; } },
    { id: "area-control", name: "Dominance scoring", needs: "majority", weight: 0.8,
      describe: function (g) { return "At fixed scoring moments (and a final reckoning) every contested zone pays its holder. Whoever has banked the most when the last region scores takes the game; the board, not a track, is the scoreboard."; } },
    { id: "last-standing", name: "Last force standing", needs: "elimination", weight: 0.85,
      describe: function (g) { return "Players are knocked out as their forces are wiped from the board. The last with " + g.t.piece + "s in play wins — though most tables agree a victory threshold of held regions to shorten the endgame."; } },
    { id: "network-complete", name: "Completed network", needs: "network", weight: 0.85,
      describe: function (g) { return "The game resolves when a player first completes the target network — a spanning link across the named sites — or the round track expires, in which case the broadest connected network wins."; } },
    { id: "set-monopoly", name: "The collection", needs: "set", weight: 0.7,
      describe: function (g) { return "Victory goes to the first player to assemble the named collection in full, or — if the deck exhausts first — to whoever holds the most complete partial collection of " + g.t.card + "s."; } },
    { id: "economic", name: "Economic victory", needs: "market", weight: 0.6,
      describe: function (g) { return "The game ends when the bank is depleted or a player banks " + g.params.vpTarget + " " + g.r0 + ". Greatest wealth wins; holdings and " + g.t.share + "s convert to their face value in the final count."; } }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // COMPONENT CATALOG — display names + a render hint for the manifest icons.
  // ─────────────────────────────────────────────────────────────────────────
  var COMPONENTS = {
    "worker-meeples": ["worker meeples", "meeple"],
    "action-board": ["a central action board", "board"],
    "resource-cubes": ["resource cubes", "cube"],
    "influence-discs": ["influence discs", "disc"],
    "board": ["the main board", "board"],
    "tiles": ["terrain tiles", "tile"],
    "route-tokens": ["route tokens", "bar"],
    "cards": ["a card deck", "card"],
    "tokens": ["assorted tokens", "token"],
    "dev-cards": ["development cards", "card"],
    "player-board": ["player boards", "board"],
    "market-row": ["a market row", "card"],
    "bag": ["a cloth draw bag", "bag"],
    "resource-tokens": ["resource tokens", "token"],
    "pawns": ["player pawns", "pawn"],
    "goods-tokens": ["goods tokens", "token"],
    "track-board": ["a race track board", "board"],
    "money-tokens": ["money tokens", "coin"],
    "lots": ["lot cards", "card"],
    "army-units": ["unit blocks", "block"],
    "combat-dice": ["combat dice", "die"],
    "shares": ["share certificates", "card"],
    "walls": ["wall segments", "bar"],
    "stones": ["playing stones", "disc"],
    "rondel-board": ["the action rondel", "board"],
    "claim-tokens": ["claim tokens", "bar"],
    "route-cards": ["route cards", "card"],
    "risk-dice": ["push dice", "die"],
    "power-cards": ["faction power cards", "card"],
    "objective-cards": ["secret objective cards", "card"],
    "tech-board": ["a tech track board", "board"],
    "select-cards": ["selection cards", "card"],
    "action-cards": ["action cards", "card"],
    "bonus-cards": ["end-game goal cards", "card"],
    "conversion-board": ["a conversion board", "board"],
    "price-track": ["a price track", "board"]
  };

  // ─────────────────────────────────────────────────────────────────────────
  // THEMES — the skin. Each renames the resource economy and the generic piece
  // nouns, supplies a title word-bank and a palette. This is what keeps two
  // games that share a skeleton from feeling like the same object. (borges does
  // exactly this with its culture packs.)
  //
  //   t: { worker, influence, piece, card, route, wall, share, vp }  (piece nouns)
  // ─────────────────────────────────────────────────────────────────────────
  function nouns(o) {
    return Object.assign({ worker: "agent", influence: "marker", piece: "piece",
      card: "card", route: "link", wall: "wall", share: "share", vp: "points" }, o);
  }
  var THEMES = [
    { id: "spice-routes", name: "Spice Routes",
      setting: "Monsoon-belt trade, where reputations are made in pepper and lost in storms.",
      resources: ["pepper", "cloves", "silk", "ivory", "indigo", "porcelain", "tea"],
      t: nouns({ worker: "factor", piece: "dhow", route: "sea-lane", vp: "prestige" }),
      pal: { accent: "#c98a2b", accent2: "#7a9e6b", board: "#efe2c4" },
      words: { adj: ["Monsoon", "Salt", "Far", "Crimson", "Golden", "Drowned"], noun: ["Routes", "Ledger", "Harbour", "Compass", "Monopoly", "Tide"], place: ["Malacca", "Zanzibar", "Calicut", "Aden", "Banda"], agent: ["Factor", "Nabob", "Consul", "Pilot"], verb: ["Spice", "Harbour", "Ledger", "Convoy"] } },
    { id: "undersea", name: "Undersea Courts",
      setting: "Bioluminescent kingdoms feuding along the lightless trench.",
      resources: ["pearl", "coral", "kelp", "brine", "amber", "nacre"],
      t: nouns({ worker: "envoy", piece: "leviathan", influence: "glow", vp: "favour" }),
      pal: { accent: "#2b9ea6", accent2: "#7a6bbf", board: "#cfe6e8" },
      words: { adj: ["Abyssal", "Pelagic", "Drowned", "Pale", "Trench", "Lantern"], noun: ["Courts", "Trench", "Tides", "Reef", "Current", "Depths"], place: ["the Trench", "Coral Hall", "the Cold Shelf", "Nacre Deep"], agent: ["Envoy", "Tidewarden", "Anemone", "Pelagarch"], verb: ["Drown", "Glow", "Tide", "Fathom"] } },
    { id: "clockwork", name: "Clockwork City",
      setting: "A brass metropolis run by automata that bargain in cogs and steam.",
      resources: ["cogs", "steam", "brass", "oil", "springs", "glass"],
      t: nouns({ worker: "automaton", piece: "engine", vp: "renown" }),
      pal: { accent: "#b9762e", accent2: "#5f8a93", board: "#e7ddcb" },
      words: { adj: ["Brass", "Geared", "Wound", "Tin", "Sprung", "Escapement"], noun: ["City", "Mechanism", "Spring", "Works", "Movement", "Tower"], place: ["the Works", "Cog Quarter", "Mainspring", "the Foundry"], agent: ["Automaton", "Regulator", "Horologist", "Founder"], verb: ["Wind", "Gear", "Forge", "Tick"] } },
    { id: "fungal", name: "Fungal Succession",
      setting: "Mycelial politics on the forest floor, where everything composts into everything.",
      resources: ["spores", "hyphae", "sugar", "loam", "lichen", "sap"],
      t: nouns({ worker: "fruiting body", piece: "colony", influence: "mycelium", vp: "biomass" }),
      pal: { accent: "#6f8f3a", accent2: "#a8642e", board: "#e3e3c8" },
      words: { adj: ["Mycelial", "Loamy", "Spent", "Damp", "Saprophytic", "Rotting"], noun: ["Succession", "Bloom", "Loam", "Canopy", "Rot", "Network"], place: ["the Litter", "Deadfall", "the Canopy", "Loam Reach"], agent: ["Sporeling", "Decomposer", "Cap", "Mycarch"], verb: ["Bloom", "Spread", "Compost", "Root"] } },
    { id: "skyports", name: "Storm-Isle Skyports",
      setting: "Floating harbours trading between thunderheads on the high winds.",
      resources: ["aether", "ballast", "canvas", "ore", "charts", "lightning"],
      t: nouns({ worker: "skipper", piece: "skyship", route: "wind-lane", vp: "renown" }),
      pal: { accent: "#3d7bbf", accent2: "#c2a23d", board: "#dbe6f0" },
      words: { adj: ["High", "Thunderhead", "Drifting", "Aether", "Storm", "Cloudbound"], noun: ["Skyports", "Gale", "Lanes", "Anchorage", "Drift", "Heights"], place: ["the Updraft", "Anvil Isle", "Cloudfoot", "the Gale"], agent: ["Skipper", "Windward", "Aeronaut", "Harbourmaster"], verb: ["Drift", "Anchor", "Gale", "Soar"] } },
    { id: "ant-colony", name: "Colony Pheromone",
      setting: "Pheromone politics underground, where a scent is a command and a vote.",
      resources: ["forage", "larvae", "resin", "nectar", "soil", "scent"],
      t: nouns({ worker: "forager", piece: "column", influence: "scent-trail", vp: "fitness" }),
      pal: { accent: "#b07a23", accent2: "#7a5230", board: "#e9ddc2" },
      words: { adj: ["Subterranean", "Scented", "Brood", "Tunnelled", "Resinous", "Teeming"], noun: ["Colony", "Trail", "Brood", "Mound", "Tunnels", "Swarm"], place: ["the Mound", "Brood Hall", "the Galleries", "Deep Tunnel"], agent: ["Forager", "Nurse", "Soldier", "Gyne"], verb: ["Forage", "Tunnel", "Swarm", "Mark"] } },
    { id: "glassblowers", name: "Glass Guilds",
      setting: "Rival guilds of the glass cities, where heat is money and breath is craft.",
      resources: ["silica", "soda", "lime", "flux", "pigment", "heat"],
      t: nouns({ worker: "journeyman", piece: "furnace", vp: "renown" }),
      pal: { accent: "#bf5a7a", accent2: "#4f8a93", board: "#ecdfe2" },
      words: { adj: ["Molten", "Blown", "Annealed", "Cristallo", "Fired", "Crystal"], noun: ["Guilds", "Furnace", "Murano", "Crucible", "Pane", "Vitrine"], place: ["Murano", "the Glasshouse", "Crucible Row", "the Kilns"], agent: ["Journeyman", "Maestro", "Gaffer", "Founder"], verb: ["Blow", "Anneal", "Fire", "Cast"] } },
    { id: "cartographers", name: "The Cartographers",
      setting: "Survey companies mapping an unfinished continent ahead of their rivals.",
      resources: ["ink", "vellum", "sightings", "rumor", "coin", "compass"],
      t: nouns({ worker: "surveyor", piece: "expedition", route: "survey-line", vp: "renown" }),
      pal: { accent: "#9a6a3a", accent2: "#5a7a8a", board: "#ece0c8" },
      words: { adj: ["Uncharted", "Surveyed", "Blank", "Margin", "Inked", "Trackless"], noun: ["Cartographers", "Survey", "Margins", "Atlas", "Frontier", "Bearings"], place: ["the Blank Quarter", "Last Meridian", "the Interior", "Cape Rumor"], agent: ["Surveyor", "Pathfinder", "Draughtsman", "Sighter"], verb: ["Chart", "Survey", "Ink", "Sight"] } },
    { id: "monastery", name: "The Scriptorium",
      setting: "Monastic scriptoria racing to copy a library before the candles gutter.",
      resources: ["vellum", "ink", "gold-leaf", "pigment", "prayer", "candles"],
      t: nouns({ worker: "monk", piece: "scribe", vp: "grace" }),
      pal: { accent: "#5a52a6", accent2: "#b08a2e", board: "#ece6d6" },
      words: { adj: ["Illuminated", "Vellum", "Cloistered", "Gilded", "Marginal", "Vesper"], noun: ["Scriptorium", "Codex", "Hours", "Cloister", "Gloss", "Vigil"], place: ["the Cloister", "the Library", "Vespers", "the Armarium"], agent: ["Scribe", "Illuminator", "Armarius", "Novice"], verb: ["Copy", "Illuminate", "Gild", "Gloss"] } },
    { id: "asteroid", name: "The Outer Belt",
      setting: "Claim-jumping prospectors carving up the asteroid belt by transponder and law.",
      resources: ["ice", "nickel", "helium", "regolith", "fuel", "data"],
      t: nouns({ worker: "prospector", piece: "hauler", route: "transfer-orbit", vp: "credits" }),
      pal: { accent: "#5a8aa6", accent2: "#a6743a", board: "#d9dde2" },
      words: { adj: ["Outer", "Jumped", "Vacuum", "Cold", "Drifting", "Claim"], noun: ["Belt", "Claim", "Orbit", "Rock", "Vacuum", "Registry"], place: ["the Belt", "Ceres Hub", "the Trojans", "Cold Rock"], agent: ["Prospector", "Registrar", "Hauler", "Wildcatter"], verb: ["Mine", "Claim", "Burn", "Refine"] } },
    { id: "vineyards", name: "Terroir Wars",
      setting: "Rival estates contesting the river valley one vintage at a time.",
      resources: ["grapes", "oak", "must", "sun", "labor", "gold"],
      t: nouns({ worker: "vigneron", piece: "estate", vp: "acclaim" }),
      pal: { accent: "#9a3a5a", accent2: "#6a8a3a", board: "#ecdcd6" },
      words: { adj: ["Vintage", "Riverbend", "Sunlit", "Oaked", "Estate", "Reserve"], noun: ["Terroir", "Vintage", "Estates", "Cellar", "Harvest", "Valley"], place: ["the Côte", "River Bend", "the Old Vines", "Hautes Terres"], agent: ["Vigneron", "Négociant", "Cellarer", "Steward"], verb: ["Harvest", "Press", "Age", "Bottle"] } },
    { id: "festival", name: "Lantern Festival",
      setting: "Guilds courting the spring crowd with light, sweets and noise.",
      resources: ["silk", "lanterns", "music", "sweets", "fireworks", "crowd"],
      t: nouns({ worker: "steward", piece: "float", influence: "acclaim", vp: "acclaim" }),
      pal: { accent: "#c2462e", accent2: "#c2a02e", board: "#f0e2cf" },
      words: { adj: ["Lantern", "Spring", "Bright", "Festal", "Painted", "Riotous"], noun: ["Festival", "Procession", "Lights", "Carnival", "Parade", "Bloom"], place: ["the Causeway", "Lantern Bridge", "the Square", "Sweetmarket"], agent: ["Steward", "Crier", "Master of Revels", "Lampwright"], verb: ["Parade", "Light", "Court", "Dazzle"] } },
    { id: "tundra", name: "Migration Line",
      setting: "Reindeer clans negotiating the long migration across the tundra.",
      resources: ["moss", "antler", "hide", "salt", "fish", "fire"],
      t: nouns({ worker: "herder", piece: "herd", route: "migration-line", vp: "standing" }),
      pal: { accent: "#5a7a8a", accent2: "#a6603a", board: "#dfe4e4" },
      words: { adj: ["Frozen", "Wandering", "White", "Long", "Antlered", "Driven"], noun: ["Migration", "Line", "Tundra", "Herd", "Crossing", "Reach"], place: ["the Long Line", "Salt Crossing", "the White Reach", "Riverford"], agent: ["Herder", "Drover", "Wayfinder", "Elder"], verb: ["Drive", "Cross", "Winter", "Follow"] } },
    { id: "arcane", name: "Arcane Faculty",
      setting: "Sorcery faculties contesting tenure, students, and the dangerous syllabus.",
      resources: ["mana", "reagents", "tomes", "chalk", "glimmer", "dread"],
      t: nouns({ worker: "adept", piece: "familiar", influence: "ward", vp: "tenure" }),
      pal: { accent: "#6a3a9a", accent2: "#3a8a7a", board: "#e2dcec" },
      words: { adj: ["Arcane", "Tenured", "Forbidden", "Chalked", "Glimmering", "Warded"], noun: ["Faculty", "Syllabus", "Wards", "Athenaeum", "Tenure", "Circle"], place: ["the Athenaeum", "the Long Library", "Chalk Hall", "the Warded Wing"], agent: ["Adept", "Dean", "Demonstrator", "Magister"], verb: ["Ward", "Summon", "Tenure", "Inscribe"] } }
  ];

  // designer / studio persona word-banks (pure flavour, borges-style).
  var STUDIO = {
    fore: ["Hollow", "Iron", "Paper", "Salt", "Lantern", "Quiet", "Slow", "Bright", "Folded", "Cold", "Amber", "Vellum", "Tin", "Glass", "Long"],
    aft: ["Crow", "Atlas", "Ledger", "Compass", "Loom", "Anvil", "Quill", "Beacon", "Almanac", "Cartouche", "Tessera", "Meridian", "Gambit", "Rookery"],
    kind: ["Spiele", "Games", "& Co.", "Werkstatt", "Editions", "Press", "Studio", "Manufaktur"]
  };
  var DESIGNER = {
    first: ["Halla", "Bram", "Ines", "Cosmo", "Yara", "Tomas", "Oona", "Felix", "Mira", "Anselm", "LUDmila", "Rune", "Cleo", "Ozren", "Petra", "Soren"],
    last: ["Vandermeer", "Okonkwo", "Halloran", "Brügger", "Castellan", "Nakashima", "Ferreira", "Lindqvist", "Marchetti", "Aalto", "Varga", "Delacroix", "Sørensen", "Quist"]
  };

  L.lex = {
    TOPOLOGIES: TOPOLOGIES,
    MECH: MECH,
    WINS: WINS,
    COMPONENTS: COMPONENTS,
    THEMES: THEMES,
    STUDIO: STUDIO,
    DESIGNER: DESIGNER,
    // small helpers
    byId: function (id) { for (var i = 0; i < MECH.length; i++) if (MECH[i].id === id) return MECH[i]; return null; },
    topoById: function (id) { for (var i = 0; i < TOPOLOGIES.length; i++) if (TOPOLOGIES[i].id === id) return TOPOLOGIES[i]; return null; }
  };
})();
