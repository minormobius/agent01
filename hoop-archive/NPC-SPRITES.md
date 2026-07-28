# hoop — NPC Sprite Spec (for the sprite-generation pass)

This is a brief for generating NPC sprites for **hoop** (`hoop.mino.mobi/v3/`), the top-down game on
the O'Neill-cylinder city. Hand this to the sprite-generation Claude. Everything it needs to make
sprites that drop straight into the renderer is here: context, exact dimensions, palette, the role
taxonomy, animation needs, file/output contract, and prompt seeds.

---

## 1. The world the sprites live in

- **View:** strict **top-down** (bird's-eye), 2-D canvas. The camera rides the player `@` (a glyph)
  centred on screen. Rooms are ~15 m, drawn at **120 px per room** at zoom 1 (zoom ranges 0.3–2.5).
- **Aesthetic:** a **dark ship** — near-black void (`#05060a`), buildings glowing warm/cool from
  within (occluded lighting: light pools and spills out doorways), faint hand-inked plate seams,
  a subtle scanline overlay. Brutalist-but-handmade. Think *inked, low-saturation, lamplit station
  interior seen from above*, not bright cartoon.
- **Scale reference:** the player `@` is drawn at ~**16 px tall** at zoom 1 (a person in a 120 px
  room). NPCs are the same scale — small figures, read at a glance, not detailed portraits.
- **What NPCs ARE:** members of the city's society. Each person "wears many hats" — a **primary
  role** (their job/verb) plus affiliations. They live in dwellings and work/worship/learn around
  the deck. The sprite represents a person *by their primary role* (colour + emblem), walking the
  concourse and rooms.

The current player marker is a gold `@` glyph with a soft glow. NPCs will replace/augment glyph
markers with actual small sprites, so they should **read as little top-down people**, distinct from
the player, colour-keyed to role.

---

## 2. Hard technical contract (so they drop in without code changes)

| Property | Value |
|---|---|
| **Canvas** | Top-down 2-D. North = up. |
| **Base sprite size** | **32×32 px** (the figure occupies ~20–24 px of it; keep ~4 px transparent margin all round). Provide an optional **@2x = 64×64** for crisp zoom-in. |
| **Format** | **PNG, RGBA, transparent background.** No baked drop-shadow (the engine lights/shadows the scene; a sprite-baked shadow fights it). A very soft 1-px contact ellipse at the feet is OK at ≤25% alpha. |
| **Pivot / anchor** | **Centre of the sprite = the character's ground position** (the engine places the sprite centred on the NPC's world point). Feet roughly at centre, head toward the facing direction. |
| **Color depth** | 32-bit; limited palette encouraged (see §4). Slight dithering fine; heavy gradients discouraged (won't match the flat-cell look). |
| **Outline** | A thin dark outline (`#05060a`–`#0b1014`, 1 px) helps the figure read against varied floor colours. Keep it subtle. |
| **Sheet layout** | One PNG per role is fine, OR a single **sprite sheet**: a grid where **each row = one role**, **each column = one animation frame/facing** (see §5). If a sheet, also give a JSON of frame rects (`{role, dir, frame, x, y, w, h}`) or just keep a strict, documented grid so we can compute rects. |
| **Naming** | `npc-<role>-<facing>-<frame>.png` (e.g. `npc-make-s-0.png`), or `npc-sheet.png` + `npc-sheet.json`. Lowercase, hyphenated. |

**Do NOT** bake lighting into the sprite (the world lights it). Keep sprites at a **neutral, slightly
lit** value so the dark scene reads them; the engine may tint them by ambient later, but ship them
legible on a near-black background first.

---

## 3. Orientation & animation (kept realistic for generation)

AI sprite generation struggles with frame-to-frame consistency, so the **minimum viable set** is
deliberately small. Deliver in this priority order:

1. **Tier A (ship this first): one top-down idle per role**, facing **south (toward the viewer /
   "down")**. 13 sprites. This alone makes the world feel alive (NPCs as colour-keyed figures).
2. **Tier B: 4 cardinal facings** (N/E/S/W) per role — the figure rotates/orients. 4×13 = 52. The
   engine will pick the facing nearest the NPC's heading. (8-way is a nice-to-have, not required.)
3. **Tier C: a 2–4 frame walk cycle** per facing (a simple leg/arm bob or step). Even a 2-frame
   "step A / step B" bob sells motion. Player gets priority for this.

If full per-role facings are too costly, an acceptable fallback is **one shared "citizen" body**
with **per-role recolour + a role emblem** (see §4), in 4 facings — far fewer unique generations.

**Player marker:** also generate a distinct **player sprite** (or keep the gold `@`): a clearly
different, brighter figure (warm gold `#ffce78`) with a soft halo, so the player never blends into
the crowd. 4 facings + a 2–4 frame walk is ideal here.

---

## 4. The role taxonomy — colour + emblem per NPC

Each NPC's **primary role** sets its **accent colour** and an **emblem glyph**. These are the canon
colours/glyphs already used in the game (don't invent new ones — match these so sprites agree with
the building colours and inspector). Body can be a neutral dark coverall; the **accent** (a sash,
hood, tool, or the emblem) carries the role colour.

| Role | Meaning | Accent colour | Emblem | Sprite cue idea |
|---|---|---|---|---|
| `dwell` | resident / home | `#d9b24a` (amber) | ⌂ | plain citizen, amber scarf |
| `grow` | farmer / gardener | `#5aa845` (green) | ❀ | green apron, carries a frond |
| `make` | maker / forge | `#e0772f` (orange) | ⚒ | heavy apron, hammer; warm rim |
| `mend` | repairer | `#9b6b3a` (brown) | ⚙ | tool belt, wrench |
| `trade` | trader | `#cf3b3b` (red) | ⇄ | satchel, red sash |
| `serve` | host / café | `#c853a0` (magenta) | ☕ | apron, tray |
| `play` | play / recreation | `#3bb0c9` (cyan) | ◍ | light, loose clothes, cyan |
| `heal` | clinic / care | `#dfe7e2` (white) | ✚ | white coat, calm |
| `learn` | learning / lore | `#5570d8` (blue) | ❍ | robe, carries a slate/book |
| `worship` | worship | `#b39bd8` (violet) | ☥ | hooded robe, violet |
| `govern` | council / order | `#33408f` (deep blue) | ⛬ | formal, sash of office |
| `move` | transit / porter | `#6b7a82` (grey) | ↕ | utilitarian, hi-vis grey |
| `store` | storage / logistics | `#566066` (slate) | ▣ | crate, slate overalls |

**Shared world palette** (for harmony — backgrounds/UI, not required in sprites):
void `#05060a` · ink `#dfe7e2` · player gold `#ffce78` · gate gold `#f4bf62` · teal `#7fd8d0` ·
road/concourse `#2c463c` · wall `#0a0e12`.

Design rule: **a viewer should tell two NPCs apart by role at 24 px** — so lean on the **accent
colour block + silhouette of the emblem/tool**, not fine facial detail (invisible at this size).

---

## 5. Recommended sheet layout (if doing a sheet)

```
npc-sheet.png   — grid, transparent
  rows  = roles, in this fixed order:
          dwell, grow, make, mend, trade, serve, play, heal, learn, worship, govern, move, store
  cols  = frames, in this order per facing block:
          [S idle][S walk1][S walk2]  [N idle][N walk1][N walk2]
          [E idle][E walk1][E walk2]  [W idle][W walk1][W walk2]
  cell  = 32×32 (or 64×64 @2x)
```
Plus a **player** row (gold) appended at the bottom. Ship `npc-sheet.json` with
`{ cell: 32, rows: [...roles..., "player"], cols: [...frame names...] }` so we can slice it.

If sheets are awkward, **individual PNGs named `npc-<role>-<facing>-<frame>.png`** are equally fine.

---

## 6. Prompt seeds (starting points for the generator)

Tune freely, but keep the constraints (top-down, 32px, transparent, flat-lit, dark outline, role
accent). Examples:

- *"Top-down pixel/vector sprite of a station worker seen from directly above, 32×32, transparent
  background, dark thin outline, neutral charcoal coverall with an **orange** apron and a small
  hammer (a 'maker'), flat lighting, low saturation, reads at small size, facing down."*
- *"Top-down 32×32 sprite, transparent, of a **white-coated** medic figure ('heal'), calm, thin dark
  outline, no background shadow, flat neutral lighting."*
- *"Top-down 32×32 sprite, transparent, hooded **violet** robe figure ('worship'), thin dark
  outline, low saturation."*
- Player: *"Top-down 32×32 hero sprite, transparent, warm **gold** figure with a faint soft halo,
  thin dark outline, clearly brighter than crowd NPCs, facing down."*

**Consistency tips for the generator:** fix the camera angle (pure top-down), fix the body
proportions and the 32px frame, generate the **idle-south** for every role first as a style anchor,
then derive facings/walks from those anchors so the set stays coherent.

---

## 7. Deliverables checklist

- [ ] **Tier A:** 13 role idle-south sprites (+ player). PNG, 32×32, transparent. ← unblocks integration
- [ ] **Tier B:** 4 facings per role (+ player).
- [ ] **Tier C:** 2–4 frame walk per facing (player first, then roles).
- [ ] Optional `@2x` 64×64 set for zoomed-in crispness.
- [ ] If a sheet: `npc-sheet.png` + `npc-sheet.json` (cell size, row order = role order above, col order).
- [ ] A tiny **contact sheet** preview (all sprites on a `#05060a` background) so we can eyeball
      legibility on the real backdrop before wiring.

Drop the assets under `hoop/sprites/` (the engine will be pointed there). When Tier A lands, the game
side can wire NPC rendering immediately and iterate on B/C in parallel.
