// ============================================================
// CRITTER RED - Rendering Engine
// Handles all canvas drawing: tiles, sprites, UI, text
// ============================================================

const TILE_SIZE = 16;
const SCALE = 3;
const SCREEN_TILES_X = 10; // Viewport width in tiles
const SCREEN_TILES_Y = 9;  // Viewport height in tiles
const SCREEN_W = 480;
const SCREEN_H = 432;

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// --- Pixel art sprite drawing ---
// All sprites are drawn procedurally (no external assets)

function drawPixels(x, y, pixels, palette, scale) {
  for (let row = 0; row < pixels.length; row++) {
    for (let col = 0; col < pixels[row].length; col++) {
      const colorIdx = pixels[row][col];
      if (colorIdx === 0) continue; // transparent
      ctx.fillStyle = palette[colorIdx] || '#ff00ff';
      ctx.fillRect(
        x + col * scale,
        y + row * scale,
        scale, scale
      );
    }
  }
}

// --- Tile rendering ---
const TILE_COLORS = {};
TILE_COLORS[TILE.GRASS_PLAIN] = '#88c070';
TILE_COLORS[TILE.GRASS_TALL]  = '#58a048';
TILE_COLORS[TILE.PATH]        = '#d8c078';
TILE_COLORS[TILE.WATER]       = '#5090d0';
TILE_COLORS[TILE.TREE]        = '#306030';
TILE_COLORS[TILE.WALL]        = '#a0a0a0';
TILE_COLORS[TILE.FLOOR]       = '#e8d8b0';
TILE_COLORS[TILE.DOOR]        = '#806040';
TILE_COLORS[TILE.LEDGE]       = '#78a858';
TILE_COLORS[TILE.SIGN]        = '#c0a060';
TILE_COLORS[TILE.NPC]         = '#e8d8b0';
TILE_COLORS[TILE.PC]          = '#8080a0';
TILE_COLORS[TILE.HEAL]        = '#e06060';
TILE_COLORS[TILE.COUNTER]     = '#a08060';
TILE_COLORS[TILE.MAT]         = '#c05030';
TILE_COLORS[TILE.FLOWER]      = '#88c070';
TILE_COLORS[TILE.FENCE]       = '#b09060';
TILE_COLORS[TILE.SAND]        = '#e8d898';
TILE_COLORS[TILE.BOULDER]     = '#808080';

function drawTile(screenX, screenY, tileType) {
  const s = TILE_SIZE * SCALE;
  const x = screenX * s;
  const y = screenY * s;

  // Base color
  ctx.fillStyle = TILE_COLORS[tileType] || '#ff00ff';
  ctx.fillRect(x, y, s, s);

  // Detail overlays
  switch (tileType) {
    case TILE.GRASS_TALL:
      // Draw grass blades
      ctx.fillStyle = '#408830';
      for (let i = 0; i < 4; i++) {
        const gx = x + 4 + i * 12;
        const gy = y + 8 + (i % 2) * 8;
        ctx.fillRect(gx, gy, 3, 12);
        ctx.fillRect(gx - 3, gy + 3, 3, 3);
        ctx.fillRect(gx + 3, gy + 3, 3, 3);
      }
      break;

    case TILE.TREE:
      // Trunk
      ctx.fillStyle = '#604020';
      ctx.fillRect(x + 16, y + 28, 16, 20);
      // Canopy
      ctx.fillStyle = '#407030';
      ctx.beginPath();
      ctx.arc(x + 24, y + 20, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#306028';
      ctx.beginPath();
      ctx.arc(x + 20, y + 16, 10, 0, Math.PI * 2);
      ctx.fill();
      break;

    case TILE.WATER:
      // Waves
      ctx.fillStyle = '#60a0e0';
      for (let wy = 0; wy < 3; wy++) {
        const waveY = y + 8 + wy * 16;
        for (let wx = 0; wx < 4; wx++) {
          ctx.fillRect(x + wx * 12 + (wy % 2) * 6, waveY, 8, 3);
        }
      }
      break;

    case TILE.WALL:
      // Brick pattern
      ctx.fillStyle = '#909090';
      for (let by = 0; by < 3; by++) {
        for (let bx = 0; bx < 3; bx++) {
          const ox = (by % 2) * 8;
          ctx.fillRect(x + bx * 16 + ox + 1, y + by * 16 + 1, 14, 14);
        }
      }
      break;

    case TILE.DOOR:
      ctx.fillStyle = '#604020';
      ctx.fillRect(x + 6, y + 3, 36, 42);
      ctx.fillStyle = '#503018';
      ctx.fillRect(x + 9, y + 6, 30, 36);
      // Knob
      ctx.fillStyle = '#c0a020';
      ctx.fillRect(x + 33, y + 22, 4, 4);
      break;

    case TILE.SIGN:
      ctx.fillStyle = '#88c070'; // grass bg
      ctx.fillRect(x, y, s, s);
      // Post
      ctx.fillStyle = '#806040';
      ctx.fillRect(x + 18, y + 22, 12, 26);
      // Board
      ctx.fillStyle = '#d0b060';
      ctx.fillRect(x + 6, y + 6, 36, 20);
      ctx.fillStyle = '#a08040';
      ctx.fillRect(x + 9, y + 10, 30, 3);
      ctx.fillRect(x + 9, y + 16, 30, 3);
      break;

    case TILE.HEAL:
      // Healing machine
      ctx.fillStyle = '#e8d8b0';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#d04040';
      ctx.fillRect(x + 8, y + 8, 32, 32);
      // Cross
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 18, y + 12, 12, 24);
      ctx.fillRect(x + 12, y + 18, 24, 12);
      break;

    case TILE.COUNTER:
      ctx.fillStyle = '#e8d8b0';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#906838';
      ctx.fillRect(x + 2, y + 8, s - 4, 36);
      ctx.fillStyle = '#a07848';
      ctx.fillRect(x + 4, y + 10, s - 8, 4);
      break;

    case TILE.MAT:
      ctx.fillStyle = '#c04828';
      ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
      break;

    case TILE.FLOWER:
      // Grass with flowers
      ctx.fillStyle = '#e8e040';
      ctx.fillRect(x + 8, y + 12, 6, 6);
      ctx.fillRect(x + 28, y + 24, 6, 6);
      ctx.fillStyle = '#e06060';
      ctx.fillRect(x + 20, y + 8, 6, 6);
      ctx.fillRect(x + 12, y + 30, 6, 6);
      break;

    case TILE.FENCE:
      ctx.fillStyle = '#88c070'; // grass bg
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#c09860';
      ctx.fillRect(x, y + 12, s, 6);
      ctx.fillRect(x, y + 28, s, 6);
      ctx.fillRect(x + 6, y + 6, 6, 36);
      ctx.fillRect(x + 30, y + 6, 6, 36);
      break;

    case TILE.BOULDER:
      ctx.fillStyle = '#88c070';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#707070';
      ctx.beginPath();
      ctx.arc(x + 24, y + 26, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.arc(x + 22, y + 22, 12, 0, Math.PI * 2);
      ctx.fill();
      break;

    case TILE.LEDGE:
      ctx.fillStyle = '#88c070';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#68a050';
      ctx.fillRect(x, y + s - 8, s, 8);
      // Shadow line
      ctx.fillStyle = '#508038';
      ctx.fillRect(x, y + s - 9, s, 3);
      break;
  }
}

// --- Character Sprites (procedural pixel art) ---
const SPRITE_DATA = {
  player: {
    down: [
      [0,0,0,1,1,1,0,0],
      [0,0,1,2,2,2,1,0],
      [0,0,1,3,2,3,1,0],
      [0,0,1,2,2,2,1,0],
      [0,0,0,1,1,1,0,0],
      [0,1,1,4,4,4,1,1],
      [0,0,1,4,4,4,1,0],
      [0,0,1,4,4,4,1,0],
      [0,0,0,4,0,4,0,0],
      [0,0,1,1,0,1,1,0],
    ],
    up: [
      [0,0,0,1,1,1,0,0],
      [0,0,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,0],
      [0,0,1,2,2,2,1,0],
      [0,0,0,1,1,1,0,0],
      [0,1,1,4,4,4,1,1],
      [0,0,1,4,4,4,1,0],
      [0,0,1,4,4,4,1,0],
      [0,0,0,4,0,4,0,0],
      [0,0,1,1,0,1,1,0],
    ],
    left: [
      [0,0,1,1,1,0,0,0],
      [0,1,2,2,2,1,0,0],
      [0,1,3,2,2,1,0,0],
      [0,1,2,2,2,1,0,0],
      [0,0,1,1,1,0,0,0],
      [1,1,4,4,4,1,0,0],
      [0,1,4,4,4,1,0,0],
      [0,1,4,4,4,1,0,0],
      [0,0,4,0,4,0,0,0],
      [0,1,1,0,1,1,0,0],
    ],
    right: [
      [0,0,0,1,1,1,0,0],
      [0,0,1,2,2,2,1,0],
      [0,0,1,2,2,3,1,0],
      [0,0,1,2,2,2,1,0],
      [0,0,0,1,1,1,0,0],
      [0,0,1,4,4,4,1,1],
      [0,0,1,4,4,4,1,0],
      [0,0,1,4,4,4,1,0],
      [0,0,0,4,0,4,0,0],
      [0,0,1,1,0,1,1,0],
    ],
    palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#4060d0' },
  },

  // Generic NPC colors
  boy:       { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#40a040' } },
  girl:      { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#d04080' } },
  oldman:    { palette: { 1: '#081820', 2: '#e0c8a0', 3: '#081820', 4: '#808080' } },
  professor: { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#f0f0f0' } },
  mom:       { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#d06060' } },
  nurse:     { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#f08080' } },
  clerk:     { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#4080c0' } },
  rival:     { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#804020' } },
  bugcatcher:{ palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#90b820' } },
  lass:      { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#e080c0' } },
  youngster: { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#f0a030' } },
  gymleader: { palette: { 1: '#081820', 2: '#f0c8a0', 3: '#081820', 4: '#8040a0' } },
};

function drawCharSprite(x, y, spriteId, direction, frame) {
  const base = SPRITE_DATA.player; // Use player shape for all characters
  const spriteInfo = SPRITE_DATA[spriteId] || SPRITE_DATA.player;
  const palette = spriteInfo.palette || SPRITE_DATA.player.palette;
  const dir = direction || 'down';
  const pixels = base[dir] || base.down;

  // Simple walk animation: shift legs
  const scale = SCALE;
  const offsetX = x - (pixels[0].length * scale) / 2;
  const offsetY = y - (pixels.length * scale) + 4;

  for (let row = 0; row < pixels.length; row++) {
    for (let col = 0; col < pixels[row].length; col++) {
      const colorIdx = pixels[row][col];
      if (colorIdx === 0) continue;
      ctx.fillStyle = palette[colorIdx] || '#ff00ff';

      // Walk animation on legs (rows 8-9)
      let drawX = offsetX + col * scale;
      let drawY = offsetY + row * scale;
      if (frame && row >= 8) {
        drawX += (frame % 2 === 1 ? 2 : -2);
      }

      ctx.fillRect(drawX, drawY, scale, scale);
    }
  }
}

// --- Monster sprites for battle ---
function drawMonsterSprite(x, y, speciesId, size, flipped) {
  const sp = SPECIES[speciesId];
  if (!sp) return;

  // Generate sprite from type colors
  const typeColor = TYPES[sp.type]?.color || '#a0a0a0';
  const darkColor = darkenColor(typeColor, 0.6);
  const lightColor = lightenColor(typeColor, 0.3);

  const s = size || 48;
  const hs = s / 2;

  ctx.save();
  if (flipped) {
    ctx.translate(x + hs, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + hs), 0);
  }

  // Body shape varies by species
  const spriteType = sp.sprite || 'default';

  if (spriteType.startsWith('fire')) {
    // Quadruped with tail flame
    ctx.fillStyle = typeColor;
    // Body
    ctx.fillRect(x + 8, y + hs - 8, s - 16, 20);
    ctx.fillRect(x + 12, y + hs - 14, s - 24, 8);
    // Head
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 20, y + hs - 22, 16, 16);
    ctx.fillRect(x + s - 16, y + hs - 26, 12, 6);
    // Eye
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 12, y + hs - 18, 4, 4);
    // Legs
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 14, y + hs + 10, 6, 10);
    ctx.fillRect(x + s - 22, y + hs + 10, 6, 10);
    // Tail flame
    ctx.fillStyle = '#f8a030';
    ctx.fillRect(x + 2, y + hs - 16, 8, 10);
    ctx.fillStyle = '#f86020';
    ctx.fillRect(x + 4, y + hs - 20, 4, 8);
  } else if (spriteType.startsWith('water')) {
    // Shell creature
    ctx.fillStyle = typeColor;
    // Shell
    ctx.beginPath();
    ctx.arc(x + hs, y + hs - 4, hs - 6, 0, Math.PI * 2);
    ctx.fill();
    // Shell pattern
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(x + hs, y + hs - 4, hs - 12, Math.PI * 0.8, Math.PI * 2.2);
    ctx.fill();
    // Head
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 16, y + hs - 18, 14, 14);
    // Eye
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 10, y + hs - 14, 4, 4);
    // Legs
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 10, y + hs + hs - 14, 8, 8);
    ctx.fillRect(x + s - 20, y + hs + hs - 14, 8, 8);
  } else if (spriteType.startsWith('grass')) {
    // Bulb creature
    ctx.fillStyle = typeColor;
    // Body
    ctx.fillRect(x + 8, y + hs, s - 16, hs - 8);
    // Bulb on back
    ctx.fillStyle = '#e04060';
    ctx.beginPath();
    ctx.arc(x + hs, y + hs - 4, hs / 2 + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#40a040';
    ctx.fillRect(x + hs - 4, y + hs - hs / 2 - 8, 4, 10);
    ctx.fillRect(x + hs + 2, y + hs - hs / 2 - 6, 4, 8);
    // Head
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 18, y + hs - 6, 16, 14);
    // Eye
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 10, y + hs - 2, 4, 4);
    // Legs
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 12, y + s - 12, 6, 8);
    ctx.fillRect(x + s - 20, y + s - 12, 6, 8);
  } else if (spriteType.startsWith('rat')) {
    // Small rodent
    ctx.fillStyle = typeColor;
    ctx.fillRect(x + 10, y + hs - 4, s - 20, 16);
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 18, y + hs - 10, 14, 12);
    // Ears
    ctx.fillRect(x + s - 16, y + hs - 16, 4, 8);
    ctx.fillRect(x + s - 8, y + hs - 16, 4, 8);
    // Eye
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 12, y + hs - 6, 3, 3);
    // Tail
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 4, y + hs - 2, 10, 3);
    ctx.fillRect(x + 2, y + hs - 6, 4, 6);
    // Legs
    ctx.fillRect(x + 14, y + hs + 10, 4, 6);
    ctx.fillRect(x + s - 20, y + hs + 10, 4, 6);
  } else if (spriteType.startsWith('bird')) {
    // Bird
    ctx.fillStyle = typeColor;
    // Body
    ctx.fillRect(x + 10, y + hs - 6, s - 20, 14);
    // Wing
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 6, y + hs - 10, 16, 8);
    ctx.fillRect(x + 4, y + hs - 14, 12, 6);
    // Head
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 18, y + hs - 14, 14, 12);
    // Beak
    ctx.fillStyle = '#f0a030';
    ctx.fillRect(x + s - 6, y + hs - 8, 6, 4);
    // Eye
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 12, y + hs - 10, 3, 3);
    // Tail
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 4, y + hs - 4, 8, 4);
    // Legs
    ctx.fillStyle = '#f0a030';
    ctx.fillRect(x + s - 22, y + hs + 6, 3, 8);
    ctx.fillRect(x + s - 16, y + hs + 6, 3, 8);
  } else if (spriteType.startsWith('bug')) {
    // Bug
    ctx.fillStyle = typeColor;
    ctx.fillRect(x + 8, y + hs - 4, s - 16, 14);
    // Segments
    ctx.fillStyle = darkColor;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + 10 + i * 8, y + hs - 6, 6, 18);
    }
    // Head
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 16, y + hs - 8, 12, 12);
    // Eyes
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 10, y + hs - 4, 3, 3);
    // Antenna
    ctx.fillStyle = typeColor;
    ctx.fillRect(x + s - 12, y + hs - 14, 2, 8);
    ctx.fillRect(x + s - 6, y + hs - 14, 2, 8);
    // Legs
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 12, y + hs + 10, 3, 6);
    ctx.fillRect(x + 22, y + hs + 10, 3, 6);
    ctx.fillRect(x + 32, y + hs + 10, 3, 6);
  } else if (spriteType.startsWith('elec')) {
    // Electric fox
    ctx.fillStyle = typeColor;
    // Body
    ctx.fillRect(x + 10, y + hs - 4, s - 20, 14);
    // Head
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + s - 20, y + hs - 14, 16, 14);
    // Ears (pointed)
    ctx.fillStyle = typeColor;
    ctx.fillRect(x + s - 20, y + hs - 22, 4, 10);
    ctx.fillRect(x + s - 10, y + hs - 22, 4, 10);
    // Eye
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + s - 14, y + hs - 8, 4, 4);
    // Tail (zigzag)
    ctx.fillStyle = typeColor;
    ctx.fillRect(x + 2, y + hs - 10, 10, 4);
    ctx.fillRect(x + 8, y + hs - 14, 4, 8);
    ctx.fillRect(x + 2, y + hs - 14, 8, 4);
    // Legs
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 14, y + hs + 8, 4, 8);
    ctx.fillRect(x + s - 20, y + hs + 8, 4, 8);
    // Cheek spark
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(x + s - 8, y + hs - 4, 4, 4);
  } else if (spriteType.startsWith('poison')) {
    // Slug/blob
    ctx.fillStyle = typeColor;
    // Body blob
    ctx.beginPath();
    ctx.arc(x + hs, y + hs, hs - 8, 0, Math.PI * 2);
    ctx.fill();
    // Slime trail
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + 4, y + s - 12, s - 8, 6);
    // Eyes
    ctx.fillStyle = lightColor;
    ctx.fillRect(x + hs + 4, y + hs - 10, 8, 8);
    ctx.fillRect(x + hs - 8, y + hs - 10, 8, 8);
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + hs + 6, y + hs - 6, 4, 4);
    ctx.fillRect(x + hs - 6, y + hs - 6, 4, 4);
    // Antenna
    ctx.fillStyle = darkColor;
    ctx.fillRect(x + hs - 4, y + hs - hs + 2, 3, 10);
    ctx.fillRect(x + hs + 4, y + hs - hs + 2, 3, 10);
  } else {
    // Default blob
    ctx.fillStyle = typeColor;
    ctx.beginPath();
    ctx.arc(x + hs, y + hs, hs - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#081820';
    ctx.fillRect(x + hs + 4, y + hs - 6, 4, 4);
    ctx.fillRect(x + hs - 8, y + hs - 6, 4, 4);
  }

  ctx.restore();
}

// --- Text rendering (pixel font) ---
const FONT_CHARS = {};
// Simple 5x7 bitmap font
const CHAR_W = 5;
const CHAR_H = 7;

function drawText(text, x, y, color, scale) {
  color = color || PAL.black;
  scale = scale || 2;
  ctx.fillStyle = color;
  ctx.font = `${8 * scale}px monospace`;
  ctx.fillText(text, x, y + 8 * scale);
}

function drawTextBox(text, x, y, w, h) {
  // Draw box
  ctx.fillStyle = PAL.white;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

  // Draw text with word wrap
  const lines = wrapText(text, Math.floor((w - 24) / 14));
  for (let i = 0; i < lines.length && i < 3; i++) {
    drawText(lines[i], x + 12, y + 8 + i * 22, PAL.black, 2);
  }
}

function wrapText(text, maxChars) {
  if (text.includes('\n')) {
    return text.split('\n');
  }
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// --- HP Bar ---
function drawHpBar(x, y, current, max, width) {
  width = width || 100;
  const ratio = Math.max(0, current / max);
  const barColor = ratio > 0.5 ? PAL.hpGreen : ratio > 0.2 ? PAL.hpYellow : PAL.hpRed;

  // Background
  ctx.fillStyle = '#282828';
  ctx.fillRect(x, y, width, 8);
  // Bar
  ctx.fillStyle = barColor;
  ctx.fillRect(x, y, Math.floor(width * ratio), 8);
  // Border
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 8);
}

// --- EXP Bar ---
function drawExpBar(x, y, current, next, width) {
  width = width || 100;
  const ratio = next > 0 ? Math.max(0, Math.min(1, current / next)) : 0;
  ctx.fillStyle = '#282828';
  ctx.fillRect(x, y, width, 4);
  ctx.fillStyle = PAL.expBlue;
  ctx.fillRect(x, y, Math.floor(width * ratio), 4);
}

// --- Battle scene background ---
function drawBattleBackground() {
  // Sky gradient
  ctx.fillStyle = '#a0d8f0';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H * 0.4);

  // Ground
  ctx.fillStyle = '#90b868';
  ctx.fillRect(0, SCREEN_H * 0.4, SCREEN_W, SCREEN_H * 0.3);

  // Platform for enemy
  ctx.fillStyle = '#78a050';
  ctx.beginPath();
  ctx.ellipse(360, 160, 80, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Platform for player
  ctx.fillStyle = '#78a050';
  ctx.beginPath();
  ctx.ellipse(130, 280, 90, 24, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- Battle UI boxes ---
function drawBattleUI(playerCritter, enemyCritter) {
  // Enemy info (top-left)
  ctx.fillStyle = PAL.white;
  ctx.fillRect(10, 20, 200, 60);
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 22, 196, 56);

  drawText(enemyCritter.name, 20, 26, PAL.black, 2);
  drawText('Lv' + enemyCritter.level, 150, 26, PAL.black, 2);
  drawHpBar(20, 52, enemyCritter.hp, enemyCritter.maxHp, 160);

  // Player info (bottom-right)
  ctx.fillStyle = PAL.white;
  ctx.fillRect(260, 200, 210, 80);
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 2;
  ctx.strokeRect(262, 202, 206, 76);

  drawText(playerCritter.name, 270, 206, PAL.black, 2);
  drawText('Lv' + playerCritter.level, 410, 206, PAL.black, 2);
  drawHpBar(270, 232, playerCritter.hp, playerCritter.maxHp, 170);
  drawText(playerCritter.hp + '/' + playerCritter.maxHp, 310, 244, PAL.black, 1.5);
  drawExpBar(270, 266, playerCritter.exp - expForLevel(playerCritter.level),
    playerCritter.expNext - expForLevel(playerCritter.level), 170);
}

// --- Menu rendering ---
function drawMenu(title, options, selectedIndex, x, y, w) {
  const lineH = 28;
  const h = options.length * lineH + 24;
  w = w || 200;

  // Box
  ctx.fillStyle = PAL.white;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

  // Title
  if (title) {
    drawText(title, x + 12, y + 4, PAL.dark, 1.5);
  }

  // Options
  for (let i = 0; i < options.length; i++) {
    const oy = y + 8 + (title ? 16 : 0) + i * lineH;
    if (i === selectedIndex) {
      drawText('\u25B6', x + 8, oy, PAL.black, 2);
    }
    drawText(options[i], x + 28, oy, PAL.black, 2);
  }
}

// --- Screen transitions ---
function drawFadeOverlay(alpha) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

// --- Starter selection screen ---
function drawStarterSelect(selectedIndex) {
  ctx.fillStyle = PAL.white;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawText('Choose your partner!', 100, 30, PAL.black, 3);

  const starters = ['embark', 'splashling', 'sproutail'];
  const names = ['Embark', 'Splashling', 'Sproutail'];
  const types = ['FIRE', 'WATER', 'GRASS'];

  for (let i = 0; i < 3; i++) {
    const bx = 40 + i * 155;
    const by = 100;

    // Selection highlight
    if (i === selectedIndex) {
      ctx.fillStyle = '#f0e8c0';
      ctx.fillRect(bx - 4, by - 4, 140, 280);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 3;
      ctx.strokeRect(bx - 4, by - 4, 140, 280);
    }

    // Critter ball
    ctx.fillStyle = '#e03030';
    ctx.beginPath();
    ctx.arc(bx + 66, by + 40, 30, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(bx + 66, by + 40, 30, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#081820';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx + 66, by + 40, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#081820';
    ctx.fillRect(bx + 36, by + 37, 60, 6);
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(bx + 66, by + 40, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Monster preview
    drawMonsterSprite(bx + 20, by + 100, starters[i], 90, false);

    // Name & type
    drawText(names[i], bx + 10, by + 210, PAL.black, 2);
    ctx.fillStyle = TYPES[types[i]].color;
    ctx.fillRect(bx + 10, by + 240, 110, 20);
    drawText(types[i], bx + 30, by + 238, '#fff', 2);
  }

  // Instructions
  drawText('< Arrow Keys >  Z = Select', 100, 400, PAL.dark, 2);
}

// --- Utility ---
function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${Math.floor(r*factor)},${Math.floor(g*factor)},${Math.floor(b*factor)})`;
}

function lightenColor(hex, factor) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${Math.min(255,Math.floor(r*(1+factor)))},${Math.min(255,Math.floor(g*(1+factor)))},${Math.min(255,Math.floor(b*(1+factor)))})`;
}

function clearScreen() {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}
