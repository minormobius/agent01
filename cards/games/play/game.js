// ============================================================
// CRITTER RED - Main Game Loop
// State management, menus, shop, input, initialization
// ============================================================

const Game = {
  state: {
    mode: 'title', // title, starterSelect, overworld, battle, menu, shop
    party: [],
    box: [],
    bag: [
      { id: 'potion', count: 3 },
      { id: 'critterball', count: 5 },
    ],
    money: 3000,
    badges: [],
    hasStarter: false,
    playerName: 'RED',
    defeatedTrainers: {},
  },

  // Menu state
  menuOpen: false,
  menuIndex: 0,
  menuSubState: null, // null, 'party', 'partyDetail', 'bag', 'critterdex'
  partyMenuIndex: 0,
  bagMenuIndex: 0,

  // Shop state
  shopOpen: false,
  shopIndex: 0,
  shopItems: ['critterball', 'greatball', 'potion', 'superpotion', 'antidote', 'repel'],

  // Starter select
  starterIndex: 0,

  // Title screen
  titleBlink: 0,

  // Input
  keys: {},
  keyPressed: {},
  lastKey: null,
  inputCooldown: 0,

  // --- Initialization ---
  init() {
    // Input handlers
    window.addEventListener('keydown', (e) => {
      e.preventDefault();
      this.keys[e.key] = true;
      this.keyPressed[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });

    this.gameLoop();
  },

  // --- Input mapping ---
  getInput() {
    const pressed = {};
    // Map keys to game actions
    if (this.keyPressed['ArrowUp'] || this.keyPressed['w']) pressed.up = true;
    if (this.keyPressed['ArrowDown'] || this.keyPressed['s']) pressed.down = true;
    if (this.keyPressed['ArrowLeft'] || this.keyPressed['a']) pressed.left = true;
    if (this.keyPressed['ArrowRight'] || this.keyPressed['d']) pressed.right = true;
    if (this.keyPressed['z'] || this.keyPressed['Z'] || this.keyPressed[' ']) pressed.confirm = true;
    if (this.keyPressed['x'] || this.keyPressed['X'] || this.keyPressed['Backspace']) pressed.cancel = true;
    if (this.keyPressed['Enter']) pressed.start = true;

    this.keyPressed = {};
    return pressed;
  },

  getHeld() {
    const held = {};
    if (this.keys['ArrowUp'] || this.keys['w']) held.up = true;
    if (this.keys['ArrowDown'] || this.keys['s']) held.down = true;
    if (this.keys['ArrowLeft'] || this.keys['a']) held.left = true;
    if (this.keys['ArrowRight'] || this.keys['d']) held.right = true;
    return held;
  },

  // --- Game Loop ---
  gameLoop() {
    const input = this.getInput();
    const held = this.getHeld();

    this.update(input, held);
    this.render();

    requestAnimationFrame(() => this.gameLoop());
  },

  update(input, held) {
    this.titleBlink++;

    switch (this.state.mode) {
      case 'title':
        if (input.confirm || input.start) {
          this.state.mode = 'overworld';
          Overworld.init('playerhouse', 4, 4, 'down');
        }
        break;

      case 'starterSelect':
        if (input.left) this.starterIndex = (this.starterIndex + 2) % 3;
        if (input.right) this.starterIndex = (this.starterIndex + 1) % 3;
        if (input.confirm) this.confirmStarter();
        break;

      case 'overworld':
        if (this.menuOpen) {
          this.updateMenu(input);
        } else if (this.shopOpen) {
          this.updateShop(input);
        } else {
          Overworld.update();

          if (!Overworld.dialogActive && !Overworld.transitioning) {
            // Movement (held keys for continuous walk)
            if (held.up) Overworld.tryMove(0, -1);
            else if (held.down) Overworld.tryMove(0, 1);
            else if (held.left) Overworld.tryMove(-1, 0);
            else if (held.right) Overworld.tryMove(1, 0);

            // Interact
            if (input.confirm) Overworld.interact();

            // Open menu
            if (input.start || input.cancel) {
              this.menuOpen = true;
              this.menuIndex = 0;
              this.menuSubState = null;
            }
          } else {
            // Dialog input
            if (input.confirm) Overworld.interact();
          }
        }
        break;

      case 'battle':
        Battle.update();
        if (Battle.active) {
          if (input.up) Battle.handleInput('up');
          if (input.down) Battle.handleInput('down');
          if (input.left) Battle.handleInput('left');
          if (input.right) Battle.handleInput('right');
          if (input.confirm) Battle.handleInput('confirm');
          if (input.cancel) Battle.handleInput('cancel');
        } else {
          this.state.mode = 'overworld';
        }
        break;
    }
  },

  render() {
    clearScreen();

    switch (this.state.mode) {
      case 'title':
        this.renderTitle();
        break;

      case 'starterSelect':
        drawStarterSelect(this.starterIndex);
        break;

      case 'overworld':
        Overworld.render();
        if (this.menuOpen) this.renderMenu();
        if (this.shopOpen) this.renderShop();
        break;

      case 'battle':
        Battle.render();
        break;
    }
  },

  // --- Title Screen ---
  renderTitle() {
    // Background
    ctx.fillStyle = '#c83830';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Decorative pokeball
    ctx.fillStyle = '#e85048';
    ctx.beginPath();
    ctx.arc(240, 200, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(240, 200, 120, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#c83830';
    ctx.fillRect(120, 192, 240, 16);
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(240, 200, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#081820';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(240, 200, 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(240, 200, 24, 0, Math.PI * 2);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#f8f8f8';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CRITTER', 240, 80);
    ctx.fillStyle = '#f8d030';
    ctx.font = 'bold 64px monospace';
    ctx.fillText('RED', 240, 140);
    ctx.textAlign = 'left';

    // Version text
    drawText('A monster-catching adventure', 90, 340, '#f0c0c0', 2);

    // Blink "Press Start"
    if (Math.floor(this.titleBlink / 30) % 2 === 0) {
      drawText('Press Z or ENTER to start', 80, 390, '#f8f8f8', 2);
    }
  },

  // --- Starter Selection ---
  startStarterSelect() {
    this.state.mode = 'starterSelect';
    this.starterIndex = 0;
  },

  confirmStarter() {
    const starters = ['embark', 'splashling', 'sproutail'];
    const rivalStarters = { embark: 'splashling', splashling: 'sproutail', sproutail: 'embark' };

    const chosen = starters[this.starterIndex];
    const starter = createCritter(chosen, 5);

    this.state.party = [starter];
    this.state.hasStarter = true;

    // Set rival's critter (type advantage)
    const rivalSpecies = rivalStarters[chosen];
    TRAINERS.rival1.critters = [{ species: rivalSpecies, level: 5 }];

    this.state.mode = 'overworld';
    Overworld.showDialog([
      'Prof. Willow: Excellent choice!',
      'You got a ' + starter.name + '!',
      'Take good care of it.',
      'Here are some Critterballs too.',
      'Catch wild critters in the tall grass!'
    ]);
  },

  // --- Battle Entry ---
  startWildBattle(wildCritter) {
    this.state.mode = 'battle';
    Battle.startWild(wildCritter);
  },

  startTrainerBattle(trainerId) {
    this.state.mode = 'battle';
    Battle.startTrainer(trainerId);
    this.state.defeatedTrainers[trainerId] = true;
  },

  // --- Healing ---
  healParty() {
    for (const c of this.state.party) {
      c.hp = c.maxHp;
      c.status = null;
      c.statMods = { atk: 0, def: 0, spa: 0, spd: 0, spd2: 0 };
      for (const m of c.moves) {
        m.pp = m.maxPp;
      }
    }
  },

  // --- Menu System ---
  updateMenu(input) {
    if (this.menuSubState === null) {
      // Main menu
      const options = ['PARTY', 'BAG', 'BADGES', 'SAVE', 'CLOSE'];
      if (input.up) this.menuIndex = (this.menuIndex + options.length - 1) % options.length;
      if (input.down) this.menuIndex = (this.menuIndex + 1) % options.length;
      if (input.cancel) { this.menuOpen = false; return; }
      if (input.confirm) {
        switch (this.menuIndex) {
          case 0: this.menuSubState = 'party'; this.partyMenuIndex = 0; break;
          case 1: this.menuSubState = 'bag'; this.bagMenuIndex = 0; break;
          case 2: this.menuSubState = 'badges'; break;
          case 3:
            // Save to localStorage
            try {
              localStorage.setItem('critterred_save', JSON.stringify(this.state));
              Overworld.showDialog(['Game saved!']);
            } catch(e) {
              Overworld.showDialog(['Save failed!']);
            }
            this.menuOpen = false;
            break;
          case 4: this.menuOpen = false; break;
        }
      }
    } else if (this.menuSubState === 'party') {
      if (input.up) this.partyMenuIndex = (this.partyMenuIndex + this.state.party.length - 1) % this.state.party.length;
      if (input.down) this.partyMenuIndex = (this.partyMenuIndex + 1) % this.state.party.length;
      if (input.cancel) { this.menuSubState = null; }
      if (input.confirm) {
        // Show detail
        this.menuSubState = 'partyDetail';
      }
    } else if (this.menuSubState === 'partyDetail') {
      if (input.cancel || input.confirm) { this.menuSubState = 'party'; }
    } else if (this.menuSubState === 'bag') {
      const bagLen = this.state.bag.length;
      if (bagLen === 0) { this.menuSubState = null; return; }
      if (input.up) this.bagMenuIndex = (this.bagMenuIndex + bagLen - 1) % bagLen;
      if (input.down) this.bagMenuIndex = (this.bagMenuIndex + 1) % bagLen;
      if (input.cancel) { this.menuSubState = null; }
      if (input.confirm) {
        // Use healing items outside battle
        const entry = this.state.bag[this.bagMenuIndex];
        const item = ITEMS[entry.id];
        if (item && item.type === 'heal' && this.state.party.length > 0) {
          // Heal first damaged critter
          for (const c of this.state.party) {
            if (c.hp < c.maxHp) {
              const heal = Math.min(item.healAmount, c.maxHp - c.hp);
              c.hp += heal;
              entry.count--;
              if (entry.count <= 0) this.state.bag = this.state.bag.filter(b => b.count > 0);
              this.menuOpen = false;
              Overworld.showDialog([c.name + ' recovered ' + heal + ' HP!']);
              return;
            }
          }
          Overworld.showDialog(['Everyone is at full HP!']);
        } else if (item && item.type === 'field') {
          if (item.steps) {
            Overworld.repelSteps = item.steps;
            entry.count--;
            if (entry.count <= 0) this.state.bag = this.state.bag.filter(b => b.count > 0);
            this.menuOpen = false;
            Overworld.showDialog(['Repel\'s effect will last ' + item.steps + ' steps!']);
          }
        }
      }
    } else if (this.menuSubState === 'badges') {
      if (input.cancel || input.confirm) { this.menuSubState = null; }
    }
  },

  renderMenu() {
    if (this.menuSubState === null) {
      drawMenu('MENU', ['PARTY', 'BAG', 'BADGES', 'SAVE', 'CLOSE'], this.menuIndex,
        SCREEN_W - 160, 10, 150);
      // Player info
      ctx.fillStyle = PAL.white;
      ctx.fillRect(SCREEN_W - 160, 200, 150, 50);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 2;
      ctx.strokeRect(SCREEN_W - 158, 202, 146, 46);
      drawText(this.state.playerName, SCREEN_W - 148, 206, PAL.black, 2);
      drawText('$' + this.state.money, SCREEN_W - 148, 228, PAL.dark, 1.5);

    } else if (this.menuSubState === 'party') {
      // Party list
      ctx.fillStyle = PAL.white;
      ctx.fillRect(10, 10, SCREEN_W - 20, SCREEN_H - 20);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, SCREEN_W - 24, SCREEN_H - 24);

      drawText('PARTY', 20, 16, PAL.black, 2.5);

      for (let i = 0; i < this.state.party.length; i++) {
        const c = this.state.party[i];
        const cy = 60 + i * 58;
        if (i === this.partyMenuIndex) {
          ctx.fillStyle = '#d8e8c8';
          ctx.fillRect(18, cy - 4, SCREEN_W - 36, 52);
          drawText('\u25B6', 22, cy + 8, PAL.black, 2);
        }
        // Mini sprite
        drawMonsterSprite(44, cy - 2, c.speciesId, 40, false);
        drawText(c.name, 100, cy, PAL.black, 2);
        drawText('Lv' + c.level, 280, cy, PAL.dark, 2);
        drawHpBar(100, cy + 28, c.hp, c.maxHp, 140);
        drawText(c.hp + '/' + c.maxHp, 250, cy + 22, PAL.dark, 1.5);
      }

    } else if (this.menuSubState === 'partyDetail') {
      const c = this.state.party[this.partyMenuIndex];
      if (!c) return;

      ctx.fillStyle = PAL.white;
      ctx.fillRect(10, 10, SCREEN_W - 20, SCREEN_H - 20);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, SCREEN_W - 24, SCREEN_H - 24);

      drawMonsterSprite(30, 30, c.speciesId, 80, false);
      drawText(c.name, 130, 30, PAL.black, 3);
      drawText('Lv ' + c.level, 130, 60, PAL.dark, 2);

      // Type badge
      ctx.fillStyle = TYPES[c.type]?.color || '#888';
      ctx.fillRect(130, 90, 80, 22);
      drawText(c.type, 140, 90, '#fff', 2);
      if (c.type2) {
        ctx.fillStyle = TYPES[c.type2]?.color || '#888';
        ctx.fillRect(220, 90, 80, 22);
        drawText(c.type2, 230, 90, '#fff', 2);
      }

      // Stats
      const stats = [
        ['HP', c.hp + '/' + c.maxHp],
        ['ATK', c.atk],
        ['DEF', c.def],
        ['SP.A', c.spa],
        ['SP.D', c.spd],
        ['SPD', c.spd2],
      ];
      for (let i = 0; i < stats.length; i++) {
        drawText(stats[i][0], 30, 140 + i * 26, PAL.dark, 2);
        drawText('' + stats[i][1], 120, 140 + i * 26, PAL.black, 2);
      }

      // Moves
      drawText('MOVES:', 260, 140, PAL.dark, 2);
      for (let i = 0; i < c.moves.length; i++) {
        const m = MOVES[c.moves[i].id];
        drawText(m.name, 260, 170 + i * 26, PAL.black, 2);
        ctx.fillStyle = TYPES[m.type]?.color || '#888';
        ctx.fillRect(420, 172 + i * 26, 6, 14);
      }

      // EXP
      drawText('EXP: ' + c.exp + ' / ' + c.expNext, 30, 310, PAL.dark, 1.5);
      drawExpBar(30, 335, c.exp - expForLevel(c.level), c.expNext - expForLevel(c.level), 200);

      // Dex entry
      const sp = SPECIES[c.speciesId];
      if (sp) {
        drawText(sp.dexEntry, 30, 360, PAL.dark, 1.5);
      }

      drawText('[Z/X] Back', 30, 400, PAL.dark, 1.5);

    } else if (this.menuSubState === 'bag') {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(10, 10, SCREEN_W - 20, SCREEN_H - 20);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, SCREEN_W - 24, SCREEN_H - 24);

      drawText('BAG', 20, 16, PAL.black, 2.5);

      if (this.state.bag.length === 0) {
        drawText('Empty!', 20, 60, PAL.dark, 2);
      } else {
        for (let i = 0; i < this.state.bag.length; i++) {
          const entry = this.state.bag[i];
          const item = ITEMS[entry.id];
          const iy = 60 + i * 44;
          if (i === this.bagMenuIndex) {
            ctx.fillStyle = '#d8e8c8';
            ctx.fillRect(18, iy - 4, SCREEN_W - 36, 40);
            drawText('\u25B6', 22, iy + 4, PAL.black, 2);
          }
          drawText(item.name, 48, iy, PAL.black, 2);
          drawText('x' + entry.count, 300, iy, PAL.dark, 2);
          drawText(item.desc || '', 48, iy + 20, PAL.dark, 1.2);
        }
      }

    } else if (this.menuSubState === 'badges') {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(10, 10, SCREEN_W - 20, SCREEN_H - 20);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, SCREEN_W - 24, SCREEN_H - 24);

      drawText('BADGES', 20, 16, PAL.black, 2.5);

      if (this.state.badges.length === 0) {
        drawText('No badges yet.', 20, 60, PAL.dark, 2);
      } else {
        for (let i = 0; i < this.state.badges.length; i++) {
          const by = 60 + i * 40;
          // Badge icon
          ctx.fillStyle = '#f0c030';
          ctx.beginPath();
          ctx.arc(40, by + 12, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = PAL.black;
          ctx.lineWidth = 2;
          ctx.stroke();
          drawText(this.state.badges[i], 64, by, PAL.black, 2);
        }
      }
    }
  },

  // --- Shop ---
  openShop() {
    this.shopOpen = true;
    this.shopIndex = 0;
  },

  updateShop(input) {
    const items = this.shopItems;
    if (input.up) this.shopIndex = (this.shopIndex + items.length - 1) % items.length;
    if (input.down) this.shopIndex = (this.shopIndex + 1) % items.length;
    if (input.cancel) { this.shopOpen = false; return; }
    if (input.confirm) {
      const itemId = items[this.shopIndex];
      const item = ITEMS[itemId];
      if (this.state.money >= item.price) {
        this.state.money -= item.price;
        // Add to bag
        const existing = this.state.bag.find(b => b.id === itemId);
        if (existing) {
          existing.count++;
        } else {
          this.state.bag.push({ id: itemId, count: 1 });
        }
        // Stay in shop
      }
    }
  },

  renderShop() {
    ctx.fillStyle = PAL.white;
    ctx.fillRect(20, 20, SCREEN_W - 40, SCREEN_H - 40);
    ctx.strokeStyle = PAL.black;
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, SCREEN_W - 44, SCREEN_H - 44);

    drawText('CRITTER MART', 30, 28, PAL.black, 2.5);
    drawText('Money: $' + this.state.money, 300, 32, PAL.dark, 2);

    for (let i = 0; i < this.shopItems.length; i++) {
      const itemId = this.shopItems[i];
      const item = ITEMS[itemId];
      const iy = 80 + i * 48;

      if (i === this.shopIndex) {
        ctx.fillStyle = '#d8e8c8';
        ctx.fillRect(28, iy - 4, SCREEN_W - 56, 44);
        drawText('\u25B6', 32, iy + 6, PAL.black, 2);
      }

      drawText(item.name, 58, iy, PAL.black, 2);
      drawText('$' + item.price, 300, iy, PAL.dark, 2);
      drawText(item.desc, 58, iy + 22, PAL.dark, 1.2);

      // Show owned count
      const owned = this.state.bag.find(b => b.id === itemId);
      if (owned) {
        drawText('Own: ' + owned.count, 400, iy, PAL.dark, 1.5);
      }
    }

    drawText('[Z] Buy  [X] Exit', 30, SCREEN_H - 60, PAL.dark, 2);
  },

  // --- Load saved game ---
  loadSave() {
    try {
      const saved = localStorage.getItem('critterred_save');
      if (saved) {
        const data = JSON.parse(saved);
        Object.assign(this.state, data);
        return true;
      }
    } catch (e) {
      console.warn('Failed to load save:', e);
    }
    return false;
  },
};

// --- Start the game ---
Game.init();
