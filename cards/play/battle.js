// ============================================================
// CRITTER RED - Battle System
// Turn-based combat, catching, items, exp/leveling
// ============================================================

const Battle = {
  active: false,
  isTrainer: false,
  trainerId: null,
  playerCritter: null,
  enemyCritter: null,
  playerPartyIndex: 0,

  // UI state
  phase: 'actionSelect', // actionSelect, moveSelect, itemSelect, partySelect, animating, text, caught, run
  menuIndex: 0,
  moveMenuIndex: 0,
  itemMenuIndex: 0,
  partyMenuIndex: 0,

  // Text/animation
  textQueue: [],
  currentText: '',
  animTimer: 0,
  animType: null, // 'playerAttack', 'enemyAttack', 'faint', 'catch', 'levelup'
  animData: null,

  // Shake/flash effects
  shakeX: 0,
  shakeY: 0,
  flashTimer: 0,
  flashTarget: null, // 'player' or 'enemy'

  startWild(wildCritter) {
    this.active = true;
    this.isTrainer = false;
    this.trainerId = null;
    this.enemyCritter = wildCritter;
    this.playerPartyIndex = this.findFirstAlive();
    this.playerCritter = Game.state.party[this.playerPartyIndex];
    this.phase = 'text';
    this.textQueue = ['A wild ' + wildCritter.name + ' appeared!'];
    this.currentText = this.textQueue.shift();
    this.menuIndex = 0;
    this.moveMenuIndex = 0;
  },

  startTrainer(trainerId) {
    this.active = true;
    this.isTrainer = true;
    this.trainerId = trainerId;
    const trainer = TRAINERS[trainerId];

    // Create trainer's critters
    this.trainerParty = trainer.critters.map(c => createCritter(c.species, c.level));
    this.trainerPartyIndex = 0;
    this.enemyCritter = this.trainerParty[0];

    this.playerPartyIndex = this.findFirstAlive();
    this.playerCritter = Game.state.party[this.playerPartyIndex];
    this.phase = 'text';
    this.textQueue = [trainer.name + ' wants to fight!', trainer.name + ' sent out ' + this.enemyCritter.name + '!'];
    this.currentText = this.textQueue.shift();
    this.menuIndex = 0;
  },

  findFirstAlive() {
    for (let i = 0; i < Game.state.party.length; i++) {
      if (Game.state.party[i].hp > 0) return i;
    }
    return 0;
  },

  hasAlivePartyMember() {
    return Game.state.party.some(c => c.hp > 0);
  },

  selectAction(index) {
    switch (index) {
      case 0: // Fight
        this.phase = 'moveSelect';
        this.moveMenuIndex = 0;
        break;
      case 1: // Bag
        this.phase = 'itemSelect';
        this.itemMenuIndex = 0;
        break;
      case 2: // Party
        this.phase = 'partySelect';
        this.partyMenuIndex = 0;
        break;
      case 3: // Run
        if (this.isTrainer) {
          this.showText(['Can\'t run from a trainer battle!']);
        } else {
          // Run calculation (simplified)
          if (Math.random() < 0.6) {
            this.showText(['Got away safely!']);
            this.phase = 'run';
          } else {
            this.showText(['Can\'t escape!']);
            this.doEnemyTurn();
          }
        }
        break;
    }
  },

  selectMove(index) {
    const move = this.playerCritter.moves[index];
    if (!move || move.pp <= 0) {
      this.showText(['No PP left for this move!']);
      return;
    }
    move.pp--;

    // Determine turn order by speed
    const playerSpeed = this.getEffectiveStat(this.playerCritter, 'spd2');
    const enemySpeed = this.getEffectiveStat(this.enemyCritter, 'spd2');

    if (playerSpeed >= enemySpeed) {
      this.executeMove(this.playerCritter, this.enemyCritter, move, 'player', () => {
        if (this.enemyCritter.hp <= 0) {
          this.onEnemyFaint();
        } else {
          this.doEnemyTurn();
        }
      });
    } else {
      this.doEnemyTurn(() => {
        if (this.playerCritter.hp <= 0) {
          this.onPlayerFaint();
        } else {
          this.executeMove(this.playerCritter, this.enemyCritter, move, 'player', () => {
            if (this.enemyCritter.hp <= 0) {
              this.onEnemyFaint();
            } else {
              this.phase = 'actionSelect';
              this.menuIndex = 0;
            }
          });
        }
      });
      return;
    }
  },

  doEnemyTurn(callback) {
    // Pick a random move with PP
    const availableMoves = this.enemyCritter.moves.filter(m => m.pp > 0);
    if (availableMoves.length === 0) {
      // Struggle
      const struggle = { id: 'tackle', pp: 1, maxPp: 1 };
      this.executeMove(this.enemyCritter, this.playerCritter, struggle, 'enemy', () => {
        if (this.playerCritter.hp <= 0) {
          this.onPlayerFaint();
        } else {
          this.phase = 'actionSelect';
          this.menuIndex = 0;
          if (callback) callback();
        }
      });
      return;
    }

    const move = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    move.pp--;

    this.executeMove(this.enemyCritter, this.playerCritter, move, 'enemy', () => {
      if (this.playerCritter.hp <= 0) {
        this.onPlayerFaint();
      } else {
        this.phase = 'actionSelect';
        this.menuIndex = 0;
        if (callback) callback();
      }
    });
  },

  executeMove(attacker, defender, moveSlot, who, callback) {
    const moveData = MOVES[moveSlot.id];
    if (!moveData) { if (callback) callback(); return; }

    const texts = [];
    texts.push(attacker.name + ' used ' + moveData.name + '!');

    if (moveData.cat === 'stat') {
      // Status move
      if (moveData.acc < 100 && Math.random() * 100 > moveData.acc) {
        texts.push('It missed!');
      } else {
        switch (moveData.effect) {
          case 'atkDown':
            defender.statMods.atk = Math.max(-6, defender.statMods.atk - 1);
            texts.push(defender.name + '\'s attack fell!');
            break;
          case 'defDown':
            defender.statMods.def = Math.max(-6, defender.statMods.def - 1);
            texts.push(defender.name + '\'s defense fell!');
            break;
          case 'spdDown':
            defender.statMods.spd2 = Math.max(-6, defender.statMods.spd2 - 1);
            texts.push(defender.name + '\'s speed fell!');
            break;
        }
      }
      this.showTextSequence(texts, callback);
      return;
    }

    // Accuracy check
    if (Math.random() * 100 > moveData.acc) {
      texts.push('It missed!');
      this.showTextSequence(texts, callback);
      return;
    }

    // Damage calculation (simplified Gen 1)
    const level = attacker.level;
    const isPhysical = moveData.cat === 'phys';
    const atkStat = isPhysical ? this.getEffectiveStat(attacker, 'atk') : this.getEffectiveStat(attacker, 'spa');
    const defStat = isPhysical ? this.getEffectiveStat(defender, 'def') : this.getEffectiveStat(defender, 'spd');

    let damage = Math.floor(((2 * level / 5 + 2) * moveData.power * atkStat / defStat) / 50) + 2;

    // STAB
    if (moveData.type === attacker.type || moveData.type === attacker.type2) {
      damage = Math.floor(damage * 1.5);
      // Don't announce STAB
    }

    // Type effectiveness
    const effectiveness = this.getTypeEffectiveness(moveData.type, defender.type, defender.type2);
    damage = Math.floor(damage * effectiveness);

    if (effectiveness > 1) texts.push('It\'s super effective!');
    else if (effectiveness > 0 && effectiveness < 1) texts.push('It\'s not very effective...');
    else if (effectiveness === 0) texts.push('It doesn\'t affect ' + defender.name + '...');

    // Random factor (85-100%)
    damage = Math.floor(damage * (85 + Math.random() * 16) / 100);
    damage = Math.max(1, damage);

    if (effectiveness === 0) damage = 0;

    // Critical hit (1/16 chance)
    if (Math.random() < 1/16 && effectiveness > 0) {
      damage = Math.floor(damage * 1.5);
      texts.push('A critical hit!');
    }

    // Apply damage
    defender.hp = Math.max(0, defender.hp - damage);

    // Flash effect
    this.flashTarget = who === 'player' ? 'enemy' : 'player';
    this.flashTimer = 20;

    this.showTextSequence(texts, callback);
  },

  getEffectiveStat(critter, statName) {
    const base = critter[statName] || 10;
    const mod = critter.statMods[statName] || 0;
    const multipliers = [2/8, 2/7, 2/6, 2/5, 2/4, 2/3, 2/2, 3/2, 4/2, 5/2, 6/2, 7/2, 8/2];
    return Math.floor(base * multipliers[mod + 6]);
  },

  getTypeEffectiveness(moveType, defType, defType2) {
    let mult = 1;
    const chart = TYPE_CHART[moveType];
    if (chart) {
      if (chart[defType] !== undefined) mult *= chart[defType];
      if (defType2 && chart[defType2] !== undefined) mult *= chart[defType2];
    }
    return mult;
  },

  onEnemyFaint() {
    const texts = [this.enemyCritter.name + ' fainted!'];

    // EXP gain
    const baseExp = 50 + this.enemyCritter.level * 10;
    const expGain = Math.floor(baseExp * (this.isTrainer ? 1.5 : 1));
    texts.push(this.playerCritter.name + ' gained ' + expGain + ' EXP!');

    this.playerCritter.exp += expGain;

    // Level up check
    while (this.playerCritter.exp >= this.playerCritter.expNext) {
      this.playerCritter.level++;
      const sp = SPECIES[this.playerCritter.speciesId];

      // Recalculate stats
      const oldMaxHp = this.playerCritter.maxHp;
      const calcStat = (base, lv, isHp) => {
        const iv = 8; // Use median IV for level-up
        if (isHp) return Math.floor(((base + iv) * 2 * lv) / 100) + lv + 10;
        return Math.floor(((base + iv) * 2 * lv) / 100) + 5;
      };

      this.playerCritter.maxHp = calcStat(sp.baseHp, this.playerCritter.level, true);
      this.playerCritter.hp += (this.playerCritter.maxHp - oldMaxHp);
      this.playerCritter.atk = calcStat(sp.baseAtk, this.playerCritter.level, false);
      this.playerCritter.def = calcStat(sp.baseDef, this.playerCritter.level, false);
      this.playerCritter.spa = calcStat(sp.baseSpa, this.playerCritter.level, false);
      this.playerCritter.spd = calcStat(sp.baseSpd, this.playerCritter.level, false);
      this.playerCritter.spd2 = calcStat(sp.baseSpd2, this.playerCritter.level, false);
      this.playerCritter.expNext = expForLevel(this.playerCritter.level + 1);

      texts.push(this.playerCritter.name + ' grew to level ' + this.playerCritter.level + '!');

      // Learn new moves
      const learnLevels = Object.keys(sp.learnset).map(Number);
      for (const lv of learnLevels) {
        if (lv === this.playerCritter.level) {
          const moveId = sp.learnset[lv];
          const moveData = MOVES[moveId];
          if (!this.playerCritter.moves.find(m => m.id === moveId)) {
            if (this.playerCritter.moves.length < 4) {
              this.playerCritter.moves.push({ id: moveId, pp: moveData.pp, maxPp: moveData.pp });
              texts.push(this.playerCritter.name + ' learned ' + moveData.name + '!');
            } else {
              // For simplicity, replace the weakest move
              let weakest = 0;
              let weakestPower = 999;
              for (let i = 0; i < 4; i++) {
                const mp = MOVES[this.playerCritter.moves[i].id].power || 0;
                if (mp < weakestPower) { weakest = i; weakestPower = mp; }
              }
              if ((moveData.power || 0) > weakestPower) {
                const oldName = MOVES[this.playerCritter.moves[weakest].id].name;
                this.playerCritter.moves[weakest] = { id: moveId, pp: moveData.pp, maxPp: moveData.pp };
                texts.push(this.playerCritter.name + ' forgot ' + oldName + ' and learned ' + moveData.name + '!');
              }
            }
          }
        }
      }

      // Evolution check
      if (sp.evolveLevel && this.playerCritter.level >= sp.evolveLevel) {
        const newSpecies = SPECIES[sp.evolveTo];
        if (newSpecies) {
          texts.push('What? ' + this.playerCritter.name + ' is evolving!');
          this.playerCritter.speciesId = sp.evolveTo;
          this.playerCritter.name = newSpecies.name;
          this.playerCritter.type = newSpecies.type;
          this.playerCritter.type2 = newSpecies.type2;
          texts.push('Congratulations! Your ' + sp.name + ' evolved into ' + newSpecies.name + '!');
        }
      }
    }

    // Trainer battle: next critter or victory
    if (this.isTrainer) {
      this.trainerPartyIndex++;
      if (this.trainerPartyIndex < this.trainerParty.length) {
        this.enemyCritter = this.trainerParty[this.trainerPartyIndex];
        texts.push(TRAINERS[this.trainerId].name + ' sent out ' + this.enemyCritter.name + '!');
        this.showTextSequence(texts, () => {
          this.phase = 'actionSelect';
          this.menuIndex = 0;
        });
        return;
      } else {
        const trainer = TRAINERS[this.trainerId];
        texts.push('You defeated ' + trainer.name + '!');
        texts.push(trainer.defeatMsg);
        texts.push('Got $' + trainer.reward + ' for winning!');
        Game.state.money += trainer.reward;
        if (trainer.badge) {
          Game.state.badges.push(trainer.badge);
          texts.push('You got the ' + trainer.badge + '!');
        }
      }
    }

    this.showTextSequence(texts, () => {
      this.endBattle();
    });
  },

  onPlayerFaint() {
    const texts = [this.playerCritter.name + ' fainted!'];

    // Check for other alive party members
    let nextAlive = -1;
    for (let i = 0; i < Game.state.party.length; i++) {
      if (Game.state.party[i].hp > 0) { nextAlive = i; break; }
    }

    if (nextAlive >= 0) {
      this.playerPartyIndex = nextAlive;
      this.playerCritter = Game.state.party[nextAlive];
      texts.push('Go, ' + this.playerCritter.name + '!');
      this.showTextSequence(texts, () => {
        this.phase = 'actionSelect';
        this.menuIndex = 0;
      });
    } else {
      texts.push('You blacked out!');
      this.showTextSequence(texts, () => {
        // Heal and return to last center/hometown
        Game.healParty();
        this.endBattle();
        Overworld.init('hometown', 9, 9, 'down');
      });
    }
  },

  tryCapture() {
    if (this.isTrainer) {
      this.showText(['Can\'t catch a trainer\'s critter!']);
      return;
    }

    const balls = Game.state.bag.filter(i => ITEMS[i.id].type === 'ball');
    if (balls.length === 0 || balls[0].count <= 0) {
      this.showText(['No Critterballs left!']);
      return;
    }

    balls[0].count--;
    if (balls[0].count <= 0) {
      Game.state.bag = Game.state.bag.filter(i => i.count > 0);
    }

    const item = ITEMS[balls[0]?.id || 'critterball'];
    const catchRate = (item?.catchRate || 1.0);

    // Catch formula (simplified)
    const hpFactor = (3 * this.enemyCritter.maxHp - 2 * this.enemyCritter.hp) / (3 * this.enemyCritter.maxHp);
    const chance = Math.min(0.95, hpFactor * catchRate * 0.5 + 0.1);

    const texts = ['You threw a ' + (item?.name || 'Critterball') + '!'];

    if (Math.random() < chance) {
      texts.push('...');
      texts.push('Gotcha! ' + this.enemyCritter.name + ' was caught!');

      // Add to party or box
      if (Game.state.party.length < 6) {
        Game.state.party.push(this.enemyCritter);
      } else {
        Game.state.box.push(this.enemyCritter);
        texts.push(this.enemyCritter.name + ' was sent to the PC!');
      }

      this.showTextSequence(texts, () => {
        this.endBattle();
      });
    } else {
      texts.push('Oh no! It broke free!');
      this.showTextSequence(texts, () => {
        this.doEnemyTurn();
      });
    }
  },

  useItem(itemId) {
    const item = ITEMS[itemId];
    if (!item) return;

    const bagEntry = Game.state.bag.find(b => b.id === itemId);
    if (!bagEntry || bagEntry.count <= 0) return;

    if (item.type === 'ball') {
      this.tryCapture();
      return;
    }

    if (item.type === 'heal') {
      bagEntry.count--;
      if (bagEntry.count <= 0) {
        Game.state.bag = Game.state.bag.filter(b => b.count > 0);
      }

      const healAmt = Math.min(item.healAmount, this.playerCritter.maxHp - this.playerCritter.hp);
      this.playerCritter.hp += healAmt;

      this.showTextSequence([
        'Used ' + item.name + '!',
        this.playerCritter.name + ' recovered ' + healAmt + ' HP!'
      ], () => {
        this.doEnemyTurn();
      });
    }
  },

  switchCritter(index) {
    if (Game.state.party[index].hp <= 0) {
      this.showText(['That critter has no energy!']);
      return;
    }
    if (index === this.playerPartyIndex) {
      this.showText(['Already in battle!']);
      return;
    }

    this.playerPartyIndex = index;
    this.playerCritter = Game.state.party[index];
    this.playerCritter.statMods = { atk: 0, def: 0, spa: 0, spd: 0, spd2: 0 };

    this.showTextSequence(['Go, ' + this.playerCritter.name + '!'], () => {
      this.doEnemyTurn();
    });
  },

  showText(lines) {
    this.textQueue = lines.slice(1);
    this.currentText = lines[0];
    this.phase = 'text';
  },

  showTextSequence(texts, callback) {
    this.textQueue = texts.slice(1);
    this.currentText = texts[0];
    this.phase = 'text';
    this.textCallback = callback || null;
  },

  advanceText() {
    if (this.textQueue.length > 0) {
      this.currentText = this.textQueue.shift();
    } else {
      if (this.phase === 'run') {
        this.endBattle();
        return;
      }
      if (this.textCallback) {
        const cb = this.textCallback;
        this.textCallback = null;
        cb();
      } else {
        this.phase = 'actionSelect';
        this.menuIndex = 0;
      }
    }
  },

  endBattle() {
    this.active = false;
    // Reset stat mods for party
    for (const c of Game.state.party) {
      c.statMods = { atk: 0, def: 0, spa: 0, spd: 0, spd2: 0 };
    }
    Game.state.mode = 'overworld';
  },

  handleInput(key) {
    switch (this.phase) {
      case 'actionSelect':
        if (key === 'up') this.menuIndex = (this.menuIndex + 3) % 4;
        else if (key === 'down') this.menuIndex = (this.menuIndex + 1) % 4;
        else if (key === 'confirm') this.selectAction(this.menuIndex);
        break;

      case 'moveSelect':
        if (key === 'up') this.moveMenuIndex = (this.moveMenuIndex + this.playerCritter.moves.length - 1) % this.playerCritter.moves.length;
        else if (key === 'down') this.moveMenuIndex = (this.moveMenuIndex + 1) % this.playerCritter.moves.length;
        else if (key === 'confirm') this.selectMove(this.moveMenuIndex);
        else if (key === 'cancel') { this.phase = 'actionSelect'; }
        break;

      case 'itemSelect': {
        const usableItems = Game.state.bag.filter(b => {
          const it = ITEMS[b.id];
          return it && (it.type === 'ball' || it.type === 'heal');
        });
        if (usableItems.length === 0) {
          this.showText(['No usable items!']);
          break;
        }
        if (key === 'up') this.itemMenuIndex = (this.itemMenuIndex + usableItems.length - 1) % usableItems.length;
        else if (key === 'down') this.itemMenuIndex = (this.itemMenuIndex + 1) % usableItems.length;
        else if (key === 'confirm') this.useItem(usableItems[this.itemMenuIndex].id);
        else if (key === 'cancel') { this.phase = 'actionSelect'; }
        break;
      }

      case 'partySelect':
        if (key === 'up') this.partyMenuIndex = (this.partyMenuIndex + Game.state.party.length - 1) % Game.state.party.length;
        else if (key === 'down') this.partyMenuIndex = (this.partyMenuIndex + 1) % Game.state.party.length;
        else if (key === 'confirm') this.switchCritter(this.partyMenuIndex);
        else if (key === 'cancel') { this.phase = 'actionSelect'; }
        break;

      case 'text':
        if (key === 'confirm') this.advanceText();
        break;
    }
  },

  update() {
    // Animation timers
    if (this.flashTimer > 0) this.flashTimer--;
  },

  render() {
    drawBattleBackground();

    // Draw enemy critter (with flash effect)
    if (this.enemyCritter.hp > 0) {
      if (this.flashTarget === 'enemy' && this.flashTimer > 0 && this.flashTimer % 4 < 2) {
        // Flash - don't draw
      } else {
        drawMonsterSprite(310, 90, this.enemyCritter.speciesId, 80, false);
      }
    }

    // Draw player critter (back view - flipped and larger)
    if (this.playerCritter.hp > 0) {
      if (this.flashTarget === 'player' && this.flashTimer > 0 && this.flashTimer % 4 < 2) {
        // Flash
      } else {
        drawMonsterSprite(60, 190, this.playerCritter.speciesId, 100, true);
      }
    }

    // Draw battle UI (HP bars, names)
    drawBattleUI(this.playerCritter, this.enemyCritter);

    // Bottom area
    const boxY = SCREEN_H - 110;
    const boxH = 100;

    switch (this.phase) {
      case 'actionSelect':
        // Text area
        drawTextBox('What will ' + this.playerCritter.name + ' do?', 10, boxY, SCREEN_W / 2 - 5, boxH);
        // Action menu
        drawMenu(null, ['FIGHT', 'BAG', 'PARTY', 'RUN'], this.menuIndex, SCREEN_W / 2 + 5, boxY, SCREEN_W / 2 - 15);
        break;

      case 'moveSelect': {
        // Move list
        const moveNames = this.playerCritter.moves.map(m => {
          const md = MOVES[m.id];
          return md.name + ' ' + m.pp + '/' + m.maxPp;
        });
        drawMenu(null, moveNames, this.moveMenuIndex, 10, boxY, SCREEN_W - 20);

        // Show move type/power
        const selMove = MOVES[this.playerCritter.moves[this.moveMenuIndex]?.id];
        if (selMove) {
          ctx.fillStyle = TYPES[selMove.type]?.color || '#888';
          ctx.fillRect(SCREEN_W - 120, boxY - 30, 110, 24);
          drawText(selMove.type, SCREEN_W - 110, boxY - 28, '#fff', 2);
        }
        break;
      }

      case 'itemSelect': {
        const usableItems = Game.state.bag.filter(b => {
          const it = ITEMS[b.id];
          return it && (it.type === 'ball' || it.type === 'heal');
        });
        if (usableItems.length > 0) {
          const itemNames = usableItems.map(b => ITEMS[b.id].name + ' x' + b.count);
          drawMenu('BAG', itemNames, this.itemMenuIndex, 10, boxY - 20, SCREEN_W - 20);
        }
        break;
      }

      case 'partySelect': {
        const partyNames = Game.state.party.map(c =>
          c.name + ' Lv' + c.level + ' ' + c.hp + '/' + c.maxHp
        );
        drawMenu('PARTY', partyNames, this.partyMenuIndex, 10, 100, SCREEN_W - 20);
        break;
      }

      case 'text':
      case 'run':
        drawTextBox(this.currentText || '', 10, boxY, SCREEN_W - 20, boxH);
        // Advance arrow
        if (Math.floor(Date.now() / 500) % 2 === 0) {
          drawText('\u25BC', SCREEN_W - 40, boxY + boxH - 22, PAL.black, 2);
        }
        break;
    }
  },
};
