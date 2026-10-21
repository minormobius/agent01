/* games.mino.mobi — the arcade selector.

   Every cabinet plays its own attract loop: a few seconds of real play,
   recorded by tools/attract.mjs into arcade/clips/<id>.mp4 (or .webm where
   H.264 isn't available), with a .jpg poster.
   Only cabinets on screen play. Clips are fetched whole and played from a
   blob URL, because the asset host answers a byte-range request with the
   whole file, and Safari won't play a video that way.

   Hover or arrow-key to a cabinet and it takes the big monitor; Enter or a
   click plays it. On a phone the wall is the whole screen and a tap plays. */

const GAMES = [
  { id: "molt", url: "molt/", name: "MOLT", genre: "ARCADE", c: "#8dff6a", big: true,
    line: "Snake on the skin of a snake. Eat, grow, and when you're long enough you dive into your own body — which becomes the next world.",
    blurb: "Arcade snake on the scales of a snake, against the clock: a minute to start, ten seconds a bite. Every molt takes you one body deeper, a little faster, onto a twistier world.",
    doors: [["cascade", "molt/cascade.html"], ["the ouroboros lab", "molt/ouro.html"], ["the snake that computes", "molt/compute.html"]] },
  { id: "cascade", url: "molt/cascade.html", name: "CASCADE", genre: "ZOOM", c: "#ff4fa3",
    line: "Snake on snake on snake, and the camera never stops falling in.",
    blurb: "The world is your body, you crawl on it, and on your body crawls you again, smaller, for ever. A constant zoom into a snake that is its own world." },
  { id: "anakata", url: "anakata/", name: "ANAKATA", genre: "PUZZLE 4D", c: "#c27bff",
    line: "Walk in three dimensions, see in any three, and hook your way through the fourth.",
    blurb: "Four-dimensional rooms. You can step in x and y; w you can only see, by turning your sight, and only cross with a hook that catches the first thing it meets. Every level is proved solvable, and proved impossible without w." },
  { id: "anabasis", url: "anabasis/", name: "ANABASIS", genre: "CLIMB 4D", c: "#ff8a5c",
    line: "Two gravities: down in z, and kata in w. Falling is free; only a ramp takes you ana.",
    blurb: "Four-dimensional rooms where w is a second down. You stand only where you're held from below and from kata, you slip a slice wherever nothing holds you, and nothing lifts you ana but a ramp. One room's ramps climb round a wrapped w for ever. Every level is proved solvable, and proved impossible without what it's about, and there are rooms made to order, and one for today." },
  { id: "hinton", url: "hinton/", name: "HINTON", genre: "FIRST PERSON 4D", c: "#57e6c8",
    line: "Four-dimensional rooms from behind your own eyes. Turn your sight and the walls swing through w.",
    blurb: "Anakata's and Anabasis's rooms in first person: walk them freely, look round, turn your sight through the fourth dimension, hook along w or fall kata through it. Every move is still the rules' own, so every room is the same proved puzzle, at the same par." },
  { id: "ziggurat", url: "ziggurat/", name: "ZIGGURAT", genre: "ARCADE", c: "#ffc93a",
    line: "The hopping pyramid, one dimension up: every slice of the pile is a pyramid, and you play them all at once.",
    blurb: "The top of a staircase of tesseracts is a tetrahedral pile of cubes, and its slices are pyramids, one smaller each step in. Turn every cube gold: four hops round a pyramid, two to the one beside it. The coil chases you through all of them." },
  { id: "tessera", url: "tessera/", name: "TESSERA", genre: "ARCADE", c: "#ffb347",
    line: "A snake on a tiling that changes shape under you.",
    blurb: "Hexagons, squares, hexagons the other way. When the corners close, any joint that ran across a diagonal is cut, and the tail falls off as food." },
  { id: "oneside", url: "oneside/", name: "ONE SIDE", genre: "CHASE", c: "#4d7dff",
    line: "A maze chase on a Möbius strip. The ghosts are on the other side — and there is only one side.",
    blurb: "Eat the dots round a maze printed on a Möbius strip. The ghosts walk the far face of the paper, which is the same face, a lap away." },
  { id: "tempest", url: "tempest/", name: "TEMPEST", genre: "SHOOTER", c: "#ffe14f",
    line: "Hold the rim. Every level is proved holdable before it ships.",
    blurb: "A tube shooter with procedural levels that are proved holdable before they ship — and when you lose, it can tell you the exact tick the run was lost, and which way round you should have gone." },
  { id: "horde", url: "horde/", name: "HOLD THE LINE", genre: "ACTION", c: "#ff6a3d",
    line: "Surrounded on six sides, and the gun overheats.",
    blurb: "You can't just stare at the worst direction: the gun overheats. Clear a wave and you get six seconds to pick an upgrade — freeze, and it picks the worst one for you." },
  { id: "switchboard", url: "switchboard/", name: "SWITCHBOARD", genre: "REAL-TIME", c: "#ff5d62",
    line: "Six lines, one operator, and everything you aren't holding keeps counting down.",
    blurb: "A shift you can see in full before the clock starts. Hold a line to work it. When the board clears it tells you exactly how many points your commitments cost." },
  { id: "orb", url: "orb/", name: "ORB", genre: "PUZZLE", c: "#8fb4ff",
    line: "Mines on a sphere of Voronoi cells. Never a guess.",
    blurb: "Clear the mines from a ball of irregular cells. Every board is proved guess-free before you see it, and the game counts every move you made that wasn't certain." },
  { id: "fathom", url: "fathom/", name: "FATHOM", genre: "PUZZLE", c: "#5fd6c4",
    line: "Mines in three dimensions: chip through the shells and dive for the core.",
    blurb: "A sea of mines in nested Voronoi shells. Chip through the outside, read the numbers through the holes, and reach the core without a guess." },
  { id: "twelve", url: "twelve/", name: "TWELVE", genre: "PUZZLE", c: "#f59e3b",
    line: "Merge tiles on a ball. A sphere has no 'that way', so every move picks a drain.",
    blurb: "Slide-and-merge on a buckyball. Each move pours every tile toward one of the sphere's drains, and equal tiles that meet become one." },
  { id: "strand", url: "strand/", name: "STRAND", genre: "PUZZLE", c: "#b07cff",
    line: "Join the colours across a sphere. Never cross, fill every cell.",
    blurb: "Join each pair of colours with strands that never cross and together paint every cell — on a buckyball and beyond. Every level has exactly one answer." },
  { id: "skein", url: "skein/", name: "SKEIN", genre: "WORDS", c: "#ffb04d",
    line: "A ball of words. Every letter belongs to one theme word.",
    blurb: "Trace the theme words out of a buckyball of letters. Every letter belongs to exactly one of them, and the theme itself runs pole to pole." },
  { id: "bucky", url: "bucky/", name: "BUCKY", genre: "LOGIC", c: "#ffd84d",
    line: "Logic gates on a buckyball: every carbon has three bonds.",
    blurb: "Two bonds in and one out is a gate; one in and two out is a splitter. Wire NOT, AND and NAND across C60 to light the outputs." },
  { id: "naught", url: "naught/", name: "NAUGHT", genre: "MATH", c: "#ff7eb6",
    line: "Noughts and crosses on an n-dimensional torus.",
    blurb: "The board is (ℤ₃)ⁿ: three cells make a line exactly when they sum to zero. Making a line is a race; avoiding one is the deep game." },
  { id: "telegraph", url: "telegraph/", name: "TELEGRAPH", genre: "TACTICS", c: "#ff8a4d",
    line: "Every enemy shows you where it will strike. You can't stop them all.",
    blurb: "No timer, no dice, nothing hidden — and never enough actions. After each turn it searches every position you could have reached and tells you how many were right." },
  { id: "ratchet", url: "ratchet/", name: "THE RATCHET", genre: "STRATEGY", c: "#cfcfe6",
    line: "A road you cross once, with tools you spend once.",
    blurb: "Every choice permanently removes an option. When the run ends it names the exact move that killed it — usually several stages before you found out." },
  { id: "outbound", url: "outbound/", name: "OUTBOUND", genre: "STRATEGY", c: "#f2c14b",
    line: "A convoy across the Europan ice, with a crew you won't get back.",
    blurb: "Two trips out of the shielded core is what a person has in them. Spend your crew by dragging them onto the ice; at the end it shows the crossing where the last way through closed." },
  { id: "onecoast", url: "onecoast/", name: "ONE COAST", genre: "BUILD", c: "#7fd66b",
    line: "Build a world tile by tile: one continent, one ocean, one coastline.",
    blurb: "Place tiles on a buckyball until it closes. A perfect world — exactly one coastline — is always in the bag." },
  { id: "ecumene", url: "ecumene/", name: "ECUMENE", genre: "SIM", c: "#f2d04b",
    line: "Run transit on a small planet; cities grow where your lines reach.",
    blurb: "Towns grow where the water is, cities grow where your lines reach, and the lines fill as they do. Built on mappa's world engine." },
  { id: "hearth", url: "hearth/", name: "HEARTH", genre: "SIM", c: "#9ad0ff",
    line: "A town three kilometres across, on a world of its own.",
    blurb: "Held down by a fusion core, fed through one rocket port: the town grows up where it can reach the most." },
  { id: "gen", url: "gen/", name: "LUDOGRAPHER", genre: "CATALOGUE", c: "#e8d5a3",
    line: "An endless catalogue of board games that don't exist yet.",
    blurb: "Every number resolves to the same complete game — theme, board, mechanics, components, rulebook, designer — for ever." },
];

/* the games with a global leaderboard (Orb's board kit, or Orb's own board) */
const BOARDS = new Set(["molt", "ziggurat", "tessera", "orb", "fathom", "oneside", "twelve", "horde", "telegraph", "ratchet", "outbound", "switchboard", "tempest"]);

const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/* ---------------------------------------------------------------- clips */
const EXT = document.createElement("video").canPlayType('video/mp4; codecs="avc1.640015"') ? "mp4" : "webm"; // some builds ship without H.264
const blobs = new Map(); // id → Promise<objectURL | null>
function clip(id) {
  if (!blobs.has(id)) blobs.set(id, fetch(`arcade/clips/${id}.${EXT}`).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  return blobs.get(id);
}
async function run(video, id) {
  video.dataset.want = id;
  const src = await clip(id);
  if (!src || video.dataset.want !== id) return;
  if (video.dataset.src !== src) { video.src = src; video.dataset.src = src; }
  video.play().catch(() => {}); // low-power mode refuses: the poster stays, which is fine
}
function halt(video) { video.dataset.want = ""; video.pause(); }

/* ----------------------------------------------------------------- wall */
const wall = $("wall");
GAMES.forEach((g, i) => {
  const a = document.createElement("a");
  a.className = "cab" + (g.big ? " big" : "");
  a.href = g.url; a.dataset.id = g.id; a.style.setProperty("--c", g.c);
  a.setAttribute("aria-label", `${g.name} — ${g.line}`);
  a.innerHTML =
    (g.big ? '<span class="ribbon">★ PLAYER’S PICK</span>' : "") +
    `<div class="screen" style="background-image:url(arcade/clips/${g.id}.jpg)"><video muted loop playsinline preload="none" aria-hidden="true"></video>` +
    `<span class="no">${BOARDS.has(g.id) ? '<i title="global leaderboard">🏆</i> ' : ""}${String(i + 1).padStart(2, "0")}</span><span class="genre">${esc(g.genre)}</span></div>` +
    `<div class="plate"><b>${esc(g.name)}</b><small>${esc(g.line)}</small></div>`;
  wall.appendChild(a);
});
const cabs = [...wall.querySelectorAll(".cab")];
const byId = (id) => GAMES.find((g) => g.id === id);

const seen = new Set();
function wake(cab) {
  const v = cab.querySelector("video");
  if (seen.has(cab) && (!reduced || cab.classList.contains("on"))) run(v, cab.dataset.id); else halt(v);
}
const io = new IntersectionObserver((es) => {
  for (const e of es) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); wake(e.target); }
}, { threshold: 0.2 });
cabs.forEach((c) => io.observe(c));

/* -------------------------------------------------------------- monitor */
const mon = { video: $("m-video"), screen: $("m-screen"), bezel: $("monitor") };
let current = null;
function select(id, how) {
  if (current === id) return;
  const prev = current; current = id;
  const g = byId(id);
  cabs.forEach((c) => { const on = c.dataset.id === id; if (c.classList.contains("on") !== on) { c.classList.toggle("on", on); if (reduced) wake(c); } });
  mon.bezel.style.setProperty("--c", g.c);
  $("m-name").textContent = g.name;
  $("m-genre").textContent = g.genre;
  $("m-no").textContent = "NO. " + String(GAMES.indexOf(g) + 1).padStart(2, "0") + (BOARDS.has(g.id) ? " · 🏆 HI-SCORES" : "");
  $("m-blurb").textContent = g.blurb;
  $("m-doors").innerHTML = (g.doors || []).map(([t, u]) => `<a href="${u}">${esc(t)} →</a>`).join("");
  $("m-play").href = g.url;
  mon.screen.style.backgroundImage = `url(arcade/clips/${g.id}.jpg)`;
  if (prev && !reduced) { mon.screen.classList.remove("tune"); void mon.screen.offsetWidth; mon.screen.classList.add("tune"); }
  if (getComputedStyle(mon.bezel).display !== "none") run(mon.video, g.id);
  if (how === "key") { const cab = cabs.find((c) => c.dataset.id === id); cab.focus({ preventScroll: true }); cab.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); }
}
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
cabs.forEach((c) => {
  if (fine) c.addEventListener("mouseenter", () => select(c.dataset.id, "mouse"));
  c.addEventListener("focus", () => select(c.dataset.id, "focus"));
});
select("molt");
addEventListener("resize", () => { if (getComputedStyle(mon.bezel).display !== "none") run(mon.video, current); else halt(mon.video); });

/* joystick: arrows walk the wall by where the cabinets actually sit */
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (e.key === "Enter" && !(t && t.closest && t.closest(".cab"))) { location.href = byId(current).url; e.preventDefault(); return; }
  if (!dir) return;
  const from = cabs.find((c) => c.dataset.id === current).getBoundingClientRect();
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  let best = null, bestScore = Infinity;
  for (const c of cabs) {
    if (c.dataset.id === current) continue;
    const r = c.getBoundingClientRect(), dx = r.left + r.width / 2 - fx, dy = r.top + r.height / 2 - fy;
    const along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] - dy * dir[0]);
    if (along <= 4) continue;
    const s = along + across * 2.2;
    if (s < bestScore) { bestScore = s; best = c; }
  }
  if (best) { select(best.dataset.id, "key"); e.preventDefault(); }
});

/* -------------------------------------------------------- party rooms */
async function loadGames() {
  const root = $("games");
  try {
    const res = await fetch("/api/games");
    const { games } = await res.json();
    if (!games.length) { root.innerHTML = '<p>No party games yet.</p>'; return; }
    root.innerHTML = "";
    for (const g of games) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "room";
      b.innerHTML = `<b>${esc(g.name)}</b><small>${esc(g.blurb || "")}</small><i>${esc(g.players || "")} PLAYERS · CREATE ROOM ▸</i>`;
      b.addEventListener("click", () => createRoom(g.id));
      root.appendChild(b);
    }
  } catch (e) {
    root.innerHTML = '<p>The room list didn’t load.</p>';
  }
}

async function createRoom(gameId) {
  const status = $("create-status");
  status.textContent = "creating room…";
  try {
    const res = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gameId }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "failed");
    status.textContent = `room ${body.code} created — opening TV view…`;
    setTimeout(() => { location.href = `/play.html?code=${body.code}&role=tv`; }, 250);
  } catch (e) {
    status.textContent = `error: ${e.message}`;
  }
}

$("join-btn").addEventListener("click", () => {
  const code = $("code").value.toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(code)) { $("join-status").textContent = "enter a 4-character code"; return; }
  location.href = `/play.html?code=${code}&role=phone`;
});
$("code").addEventListener("keyup", (e) => { if (e.key === "Enter") $("join-btn").click(); });

loadGames();
