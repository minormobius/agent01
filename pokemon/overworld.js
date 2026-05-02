// ============================================================
// CRITTER RED - Overworld System
// Player movement, NPC interaction, map transitions
// ============================================================

const Overworld = {
  currentMap: null,
  playerX: 0,
  playerY: 0,
  playerDir: 'down',
  walkFrame: 0,
  moving: false,
  moveTimer: 0,
  moveSpeed: 8, // frames per tile
  targetX: 0,
  targetY: 0,
  startX: 0,
  startY: 0,
  stepCount: 0,
  repelSteps: 0,

  // Camera
  camX: 0,
  camY: 0,

  // Dialog
  dialogActive: false,
  dialogLines: [],
  dialogIndex: 0,
  dialogCallback: null,

  // Transition
  transitioning: false,
  transitionAlpha: 0,
  transitionTarget: null,
  transitionPhase: 'out', // 'out' = fading to black, 'in' = fading from black

  init(mapId, px, py, dir) {
    this.currentMap = MAPS[mapId];
    this.currentMapId = mapId;
    this.playerX = px;
    this.playerY = py;
    this.playerDir = dir || 'down';
    this.moving = false;
    this.dialogActive = false;
    this.updateCamera();
  },

  updateCamera() {
    const map = this.currentMap;
    const screenTilesX = SCREEN_TILES_X;
    const screenTilesY = SCREEN_TILES_Y;

    // Center camera on player
    this.camX = this.playerX - Math.floor(screenTilesX / 2);
    this.camY = this.playerY - Math.floor(screenTilesY / 2);

    // Clamp to map bounds
    this.camX = Math.max(0, Math.min(map.width - screenTilesX, this.camX));
    this.camY = Math.max(0, Math.min(map.height - screenTilesY, this.camY));
  },

  getTile(x, y) {
    const map = this.currentMap;
    if (x < 0 || x >= map.width || y < 0 || y >= map.height) return TILE.TREE;
    return map.tiles[y * map.width + x];
  },

  canWalk(x, y) {
    const tile = this.getTile(x, y);
    const props = TILE_PROPS[tile];
    if (!props || !props.walkable) return false;

    // Check NPC collision
    if (this.currentMap.npcs) {
      for (const npc of this.currentMap.npcs) {
        if (npc.x === x && npc.y === y) return false;
      }
    }
    // Check trainer collision
    if (this.currentMap.trainers) {
      for (const trainer of this.currentMap.trainers) {
        if (trainer.x === x && trainer.y === y) return false;
      }
    }

    return true;
  },

  tryMove(dx, dy) {
    if (this.moving || this.dialogActive || this.transitioning) return;

    const dirMap = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };
    this.playerDir = dirMap[dx + ',' + dy] || this.playerDir;

    const nx = this.playerX + dx;
    const ny = this.playerY + dy;

    // Check for map exits
    if (this.currentMap.exits) {
      for (const exit of this.currentMap.exits) {
        if (nx === exit.x && ny === exit.y) {
          // Gated exits (e.g. leaving the home town before getting a starter).
          if (exit.requires === 'starter' && !Game.state.hasStarter) {
            this.showDialog([
              'Wait! Don\'t go out yet!',
              'It\'s dangerous to go without a critter of your own.',
              'See Prof. Willow at the lab first.',
            ]);
            return;
          }
          this.startTransition(exit.toMap, exit.toX, exit.toY);
          return;
        }
      }
    }

    // Check for doors (walking into a door enters the building)
    if (this.currentMap.doors) {
      for (const door of this.currentMap.doors) {
        if (nx === door.x && ny === door.y) {
          this.startTransition(door.toMap, door.toX, door.toY);
          return;
        }
      }
    }

    // Check ledge (only walkable going down)
    const targetTile = this.getTile(nx, ny);
    if (targetTile === TILE.LEDGE && dy !== 1) return;

    if (this.canWalk(nx, ny)) {
      this.moving = true;
      this.moveTimer = 0;
      this.startX = this.playerX;
      this.startY = this.playerY;
      this.targetX = nx;
      this.targetY = ny;
    }
  },

  interact() {
    if (this.dialogActive) {
      this.advanceDialog();
      return;
    }
    if (this.moving || this.transitioning) return;

    const dirOffsets = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
    const [dx, dy] = dirOffsets[this.playerDir];
    const fx = this.playerX + dx;
    const fy = this.playerY + dy;

    // Check signs
    if (this.currentMap.signs) {
      for (const sign of this.currentMap.signs) {
        if (sign.x === fx && sign.y === fy) {
          this.showDialog([sign.text]);
          return;
        }
      }
    }

    // Check tile interactions
    const facingTile = this.getTile(fx, fy);
    if (facingTile === TILE.HEAL) {
      this.showDialog(['Your critters were healed!'], () => {
        Game.healParty();
      });
      return;
    }
    if (facingTile === TILE.COUNTER && this.currentMapId === 'mart') {
      Game.openShop();
      return;
    }

    // Check NPCs
    if (this.currentMap.npcs) {
      for (const npc of this.currentMap.npcs) {
        if (npc.x === fx && npc.y === fy) {
          // Face the player
          const oppDir = { up: 'down', down: 'up', left: 'right', right: 'left' };
          npc.dir = oppDir[this.playerDir];

          if (npc.dialog[0] === '_STARTER_SELECT_') {
            if (!Game.state.hasStarter) {
              Game.startStarterSelect();
            } else {
              this.showDialog(['Good luck on your journey!', 'Fill up that Critterdex!']);
            }
          } else if (npc.dialog[0] === '_HEAL_') {
            this.showDialog(['Welcome to the Critter Center!', 'Let me heal your critters...', 'Your critters are fully healed!'], () => {
              Game.healParty();
            });
          } else if (npc.dialog[0] === '_SHOP_') {
            Game.openShop();
          } else {
            this.showDialog(npc.dialog);
          }
          return;
        }
      }
    }

    // Check doors
    if (this.currentMap.doors) {
      for (const door of this.currentMap.doors) {
        if (door.x === fx && door.y === fy) {
          this.startTransition(door.toMap, door.toX, door.toY);
          return;
        }
      }
    }
  },

  showDialog(lines, callback) {
    this.dialogActive = true;
    this.dialogLines = lines;
    this.dialogIndex = 0;
    this.dialogCallback = callback || null;
  },

  advanceDialog() {
    this.dialogIndex++;
    if (this.dialogIndex >= this.dialogLines.length) {
      this.dialogActive = false;
      if (this.dialogCallback) {
        this.dialogCallback();
        this.dialogCallback = null;
      }
    }
  },

  startTransition(mapId, toX, toY) {
    this.transitioning = true;
    this.transitionAlpha = 0;
    this.transitionPhase = 'out';
    this.transitionTarget = { mapId, x: toX, y: toY };
  },

  checkEncounter() {
    const map = this.currentMap;
    if (!map.encounterTable) return false;
    if (!Game.state.party || Game.state.party.length === 0) return false;
    const tile = this.getTile(this.playerX, this.playerY);
    if (tile !== TILE.GRASS_TALL) return false;
    if (this.repelSteps > 0) {
      this.repelSteps--;
      return false;
    }

    // ~15% encounter rate in tall grass
    if (Math.random() < 0.15) {
      const wild = rollEncounter(map.encounterTable);
      if (wild) {
        Game.startWildBattle(wild);
        return true;
      }
    }
    return false;
  },

  checkTrainers() {
    if (!this.currentMap.trainers) return;
    if (!Game.state.party || Game.state.party.length === 0) return;
    for (const trainer of this.currentMap.trainers) {
      if (trainer.defeated) continue;

      // Check if player is in sight range
      const dx = this.playerX - trainer.x;
      const dy = this.playerY - trainer.y;
      let inSight = false;

      switch (trainer.dir || 'down') {
        case 'up':    inSight = dx === 0 && dy < 0 && dy >= -trainer.sightRange; break;
        case 'down':  inSight = dx === 0 && dy > 0 && dy <= trainer.sightRange; break;
        case 'left':  inSight = dy === 0 && dx < 0 && dx >= -trainer.sightRange; break;
        case 'right': inSight = dy === 0 && dx > 0 && dx <= trainer.sightRange; break;
      }

      if (inSight) {
        trainer.defeated = true;
        const trainerData = TRAINERS[trainer.trainerId];
        this.showDialog([trainerData.name + ' wants to battle!'], () => {
          Game.startTrainerBattle(trainer.trainerId);
        });
        return;
      }
    }
  },

  update() {
    // Handle transitions
    if (this.transitioning) {
      if (this.transitionPhase === 'out') {
        this.transitionAlpha += 0.08;
        if (this.transitionAlpha >= 1) {
          this.transitionAlpha = 1;
          // Switch map
          const t = this.transitionTarget;
          this.init(t.mapId, t.x, t.y);
          this.transitionPhase = 'in';
          this.transitioning = true; // keep transitioning
        }
      } else {
        this.transitionAlpha -= 0.08;
        if (this.transitionAlpha <= 0) {
          this.transitionAlpha = 0;
          this.transitioning = false;
        }
      }
      return;
    }

    // Handle movement animation
    if (this.moving) {
      this.moveTimer++;
      if (this.moveTimer >= this.moveSpeed) {
        this.playerX = this.targetX;
        this.playerY = this.targetY;
        this.moving = false;
        this.walkFrame++;
        this.stepCount++;
        this.updateCamera();

        // Check for encounters
        this.checkEncounter();
        // Check for trainers
        this.checkTrainers();

        // Check if we stepped on a door mat
        const tile = this.getTile(this.playerX, this.playerY);
        if (tile === TILE.MAT) {
          // Find the exit at this position
          if (this.currentMap.exits) {
            for (const exit of this.currentMap.exits) {
              if (exit.x === this.playerX && exit.y === this.playerY) {
                this.startTransition(exit.toMap, exit.toX, exit.toY);
                return;
              }
            }
          }
        }
      } else {
        this.updateCamera();
      }
    }
  },

  render() {
    const map = this.currentMap;
    if (!map) return;

    // Calculate smooth camera offset during movement
    let smoothOffX = 0, smoothOffY = 0;
    if (this.moving) {
      const t = this.moveTimer / this.moveSpeed;
      const dx = this.targetX - this.startX;
      const dy = this.targetY - this.startY;
      smoothOffX = dx * t;
      smoothOffY = dy * t;
    }

    const playerDrawX = this.moving ? this.startX + smoothOffX : this.playerX;
    const playerDrawY = this.moving ? this.startY + smoothOffY : this.playerY;

    // Recalculate camera with smooth offset
    let camX = playerDrawX - Math.floor(SCREEN_TILES_X / 2);
    let camY = playerDrawY - Math.floor(SCREEN_TILES_Y / 2);
    camX = Math.max(0, Math.min(map.width - SCREEN_TILES_X, camX));
    camY = Math.max(0, Math.min(map.height - SCREEN_TILES_Y, camY));

    clearScreen();

    // Draw tiles
    for (let sy = -1; sy <= SCREEN_TILES_Y + 1; sy++) {
      for (let sx = -1; sx <= SCREEN_TILES_X + 1; sx++) {
        const mx = Math.floor(camX) + sx;
        const my = Math.floor(camY) + sy;
        if (mx < 0 || mx >= map.width || my < 0 || my >= map.height) continue;

        const tile = map.tiles[my * map.width + mx];
        const drawX = (sx - (camX - Math.floor(camX)));
        const drawY = (sy - (camY - Math.floor(camY)));
        drawTile(drawX, drawY, tile);
      }
    }

    // Draw NPCs
    if (map.npcs) {
      for (const npc of map.npcs) {
        const sx = (npc.x - camX) * TILE_SIZE * SCALE + TILE_SIZE * SCALE / 2;
        const sy = (npc.y - camY) * TILE_SIZE * SCALE + TILE_SIZE * SCALE - 4;
        if (sx < -48 || sx > SCREEN_W + 48 || sy < -48 || sy > SCREEN_H + 48) continue;
        drawCharSprite(sx, sy, npc.sprite, npc.dir, 0);
      }
    }

    // Draw trainers
    if (map.trainers) {
      for (const trainer of map.trainers) {
        const sx = (trainer.x - camX) * TILE_SIZE * SCALE + TILE_SIZE * SCALE / 2;
        const sy = (trainer.y - camY) * TILE_SIZE * SCALE + TILE_SIZE * SCALE - 4;
        if (sx < -48 || sx > SCREEN_W + 48 || sy < -48 || sy > SCREEN_H + 48) continue;
        drawCharSprite(sx, sy, trainer.sprite, trainer.dir || 'down', 0);
      }
    }

    // Draw player
    const px = (playerDrawX - camX) * TILE_SIZE * SCALE + TILE_SIZE * SCALE / 2;
    const py = (playerDrawY - camY) * TILE_SIZE * SCALE + TILE_SIZE * SCALE - 4;
    drawCharSprite(px, py, 'player', this.playerDir, this.moving ? this.walkFrame : 0);

    // Draw map name on entry
    if (this.transitioning && this.transitionPhase === 'in' && this.transitionAlpha < 0.5) {
      drawTextBox(map.name, 100, 10, 280, 40);
    }

    // Draw dialog
    if (this.dialogActive) {
      const line = this.dialogLines[this.dialogIndex] || '';
      drawTextBox(line, 10, SCREEN_H - 90, SCREEN_W - 20, 80);
      // Blinking arrow
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        drawText('\u25BC', SCREEN_W - 40, SCREEN_H - 25, PAL.black, 2);
      }
    }

    // Transition overlay
    if (this.transitioning) {
      drawFadeOverlay(this.transitionAlpha);
    }
  },
};
