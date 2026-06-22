import React, { useEffect, useRef, useState } from 'react';

// Tetromino class definition
class Tetromino {
  static TETROMINOES = {
    'I': {
      shape: [[0, 0], [0, 1], [0, 2], [0, 3]],
      color: '#00FFFF',  // Cyan
      inactiveColor: '#006666'  // Darker cyan
    },
    'O': {
      shape: [[0, 0], [0, 1], [1, 0], [1, 1]],
      color: '#FFFF00',  // Yellow
      inactiveColor: '#666600'  // Darker yellow
    },
    'T': {
      shape: [[0, 0], [-1, 0], [1, 0], [0, 1]],
      color: '#800080',  // Purple
      inactiveColor: '#400040'  // Darker purple
    },
    'L': {
      shape: [[0, 0], [0, 1], [0, 2], [1, 0]],
      color: '#FFA500',  // Orange
      inactiveColor: '#663300'  // Darker orange
    },
    'J': {
      shape: [[0, 0], [0, 1], [0, 2], [-1, 0]],
      color: '#0000FF',  // Blue
      inactiveColor: '#000066'  // Darker blue
    },
    'S': {
      shape: [[0, 0], [1, 0], [0, 1], [-1, 1]],  // S shape (correct mirror of Z)
      color: '#00FF00',  // Green
      inactiveColor: '#006600'  // Darker green
    },
    'Z': {
      shape: [[0, 0], [-1, 0], [0, 1], [1, 1]],  // Z shape
      color: '#FF0000',  // Red
      inactiveColor: '#660000'  // Darker red
    }
  };

  static idCounter = 0;

  constructor(species, position = [0, 0], orientation = 0, flipped = false) {
    if (!Tetromino.TETROMINOES[species]) {
      throw new Error(`Unknown tetromino species: ${species}`);
    }
    
    // Generate a unique ID for each tetromino
    this.id = `tetromino-${++Tetromino.idCounter}`;
    
    this.species = species;
    this.position = [...position];
    this.shape = [...Tetromino.TETROMINOES[species].shape].map(p => [...p]); // Deep clone
    this.orientation = orientation % 4;
    this.flipped = flipped;
    this.color = Tetromino.TETROMINOES[species].color;
    this.inactiveColor = Tetromino.TETROMINOES[species].inactiveColor;
    this.adjacencyDict = {};
    
    // New properties for activation system
    this.dependencies = {}; // Maps species to required counts
    this.active = false;    // Tracks if all dependencies are satisfied
    
    // Clump properties
    this.clumpId = null;                 // ID of clump this tetromino belongs to
    this.clumpDependencies = {};         // Clump-level dependencies
    this.clumpAdjacencyDict = {};        // Clump-level adjacency counts
    this.clumpComposition = {};          // What species make up this clump (species -> count)
  }

  // Add method to set dependencies
  setDependencies(dependencies) {
    this.dependencies = {...dependencies};
  }
  
  // Clone method to create a copy with all properties
  clone() {
    const clone = new Tetromino(
      this.species,
      [...this.position],
      this.orientation,
      this.flipped
    );
    
    // Copy dependencies
    clone.setDependencies({...this.dependencies});
    clone.active = this.active;
    
    // Copy clump properties
    clone.clumpId = this.clumpId;
    clone.clumpDependencies = {...this.clumpDependencies};
    clone.clumpAdjacencyDict = {...this.clumpAdjacencyDict};
    clone.clumpComposition = {...this.clumpComposition};
    
    return clone;
  }

  getSquares() {
    // Apply transformations to the shape and return grid positions
    let result = this.shape.map(([x, y]) => [x, y]); // Deep copy
    
    // Apply horizontal reflection if flipped
    if (this.flipped) {
      result = result.map(([x, y]) => [-x, y]);
    }
    
    // Apply rotation
    for (let i = 0; i < this.orientation; i++) {
      result = result.map(([x, y]) => [-y, x]); // 90Â° clockwise
    }
    
    // Add position offset
    return result.map(([x, y]) => [
      this.position[0] + x,
      this.position[1] + y
    ]);
  }

  getBorderSegments() {
    const squares = this.getSquares();
    const edges = [];
    
    // For each square, define its 4 edges
    for (const [x, y] of squares) {
      edges.push([[x+1, y], [x+1, y+1]]);  // Right edge
      edges.push([[x, y+1], [x+1, y+1]]);  // Top edge
      edges.push([[x, y], [x, y+1]]);      // Left edge
      edges.push([[x, y], [x+1, y]]);      // Bottom edge
    }
    
    // Count occurrences of each edge
    const edgeCounts = new Map();
    for (const edge of edges) {
      // Sort edge endpoints to normalize representation
      const sortedEdge = JSON.stringify(edge.sort((a, b) => {
        if (a[0] !== b[0]) return a[0] - b[0];
        return a[1] - b[1];
      }));
      
      edgeCounts.set(sortedEdge, (edgeCounts.get(sortedEdge) || 0) + 1);
    }
    
    // Keep only edges that occur exactly once (these are the borders)
    const borderEdges = [];
    for (const [edgeStr, count] of edgeCounts.entries()) {
      if (count === 1) {
        borderEdges.push(JSON.parse(edgeStr));
      }
    }
    
    return borderEdges;
  }

  getCenterOfMass() {
    const squares = this.getSquares();
    if (squares.length === 0) return this.position;
    
    const xSum = squares.reduce((sum, [x, y]) => sum + x, 0);
    const ySum = squares.reduce((sum, [x, y]) => sum + y, 0);
    
    return [xSum / squares.length, ySum / squares.length];
  }
}

// Gameboard class definition
class Gameboard {
  constructor(width, height, gameMode = 'default') {
    this.width = width;
    this.height = height;
    this.grid = Array(width).fill().map(() => Array(height).fill(null));
    
    // Multiple selection support
    this.selectedTetrominos = [];
    this.anchorTetromino = null;
    
    this.referenceMouseGridLocation = null;
    
    // For adjacency updates
    this.frameCounter = 0;
    this.ADJ_UPDATE_INTERVAL = 60;
    this.adjacencyUpdateCounter = 0;
    
    // Game score
    this.score = 0;
    
    // Game mode
    this.gameMode = gameMode;
    
    // Challenge mode species (will be set during initialization)
    this.challengeSpeciesA = null;
    this.challengeSpeciesB = null;
    
    // Dependencies per species
    this.speciesDependencies = {
      'I': {}, 'O': {}, 'T': {}, 'L': {}, 'J': {}, 'S': {}, 'Z': {}
    };
    
    // Initialize dependencies based on game mode
    this.initializeDependencies();
  }
  
  // Initialize dependencies based on game mode
  initializeDependencies() {
    if (this.gameMode === 'challenge' || this.gameMode === 'clumps') {
      this.initializeChallengeModeDependencies();
    } else {
      this.initializeRandomDependencies();
    }
  }
  
  // Initialize the dependencies randomly for default mode
  initializeRandomDependencies() {
    const allSpecies = Object.keys(Tetromino.TETROMINOES);
    
    // Shuffle species to pick 3 random ones
    const shuffledSpecies = [...allSpecies].sort(() => Math.random() - 0.5);
    const chosenSpecies = shuffledSpecies.slice(0, 3);
    
    for (let i = 0; i < 3; i++) {
      // Choose a random dependency for each chosen species
      const targetSpecies = chosenSpecies[i];
      let dependencySpecies;
      // Allow self-dependency now
      dependencySpecies = allSpecies[Math.floor(Math.random() * allSpecies.length)];
      
      // Set dependency count based on index
      const count = i + 1; // 1, 2, or 3
      this.speciesDependencies[targetSpecies][dependencySpecies] = count;
    }
    
    // Apply dependencies to all existing tetrominos
    this.updateSpecificTetrominos();
  }
  
  // Initialize the dependencies for challenge mode
  initializeChallengeModeDependencies() {
    const allSpecies = Object.keys(Tetromino.TETROMINOES);
    
    // Pick two random species for challenge mode
    const shuffledSpecies = [...allSpecies].sort(() => Math.random() - 0.5);
    this.challengeSpeciesA = shuffledSpecies[0];
    this.challengeSpeciesB = shuffledSpecies[1];
    
    // Reset all dependencies
    for (const species of allSpecies) {
      this.speciesDependencies[species] = {};
    }
    
    // Set challenge mode dependencies:
    // Species A needs 2 of Species B
    this.speciesDependencies[this.challengeSpeciesA][this.challengeSpeciesB] = 2;
    
    // Species B needs 3 of Species A
    this.speciesDependencies[this.challengeSpeciesB][this.challengeSpeciesA] = 3;
    
    // Apply dependencies to all existing tetrominos
    this.updateSpecificTetrominos();
  }
  
  // Update only the tetrominos matching the species that changed
  updateSpecificTetrominos() {
    // Get all tetrominoes on the board (avoid duplicates)
    const tetrominoes = new Set();
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        if (this.grid[i][j] !== null) {
          tetrominoes.add(this.grid[i][j]);
        }
      }
    }
    
    // Update each tetromino's dependencies based on its species
    for (const tetromino of tetrominoes) {
      const speciesDeps = this.speciesDependencies[tetromino.species];
      tetromino.setDependencies({...speciesDeps});
    }
  }
  
  // Check if all tetrominos are active
  areAllTetrominosActive() {
    const tetrominoes = new Set();
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        if (this.grid[i][j] !== null) {
          tetrominoes.add(this.grid[i][j]);
        }
      }
    }
    
    for (const tetromino of tetrominoes) {
      if (!tetromino.active) {
        return false;
      }
    }
    
    return tetrominoes.size > 0; // Only return true if there are tetrominos
  }
  
  // Increment a dependency based on game mode
  incrementRandomDependency() {
    if (this.gameMode === 'challenge') {
      this.incrementChallengeDependency();
      
      // Apply species-wide dependency changes to individual tetrominos
      this.updateSpecificTetrominos();
    } else if (this.gameMode === 'clumps') {
      // Clumps mode no longer creates new tetrominos here
      // The connected components function handles it instead
    } else {
      this.incrementDefaultDependency();
      
      // Apply species-wide dependency changes to individual tetrominos
      this.updateSpecificTetrominos();
    }
    
    // Increment score
    this.score++;
  }
  
  // Increment a random dependency for default mode
  incrementDefaultDependency() {
    const allSpecies = Object.keys(Tetromino.TETROMINOES);
    
    // Pick a random species to modify
    const targetSpecies = allSpecies[Math.floor(Math.random() * allSpecies.length)];
    const currentDependencies = this.speciesDependencies[targetSpecies];
    const hasDependencies = Object.keys(currentDependencies).length > 0;
    
    // Decide whether to increment existing or add new
    const shouldIncrementExisting = hasDependencies && Math.random() < 2/3;
    
    if (shouldIncrementExisting) {
      // Increment an existing dependency
      const existingDeps = Object.keys(currentDependencies);
      const depToIncrement = existingDeps[Math.floor(Math.random() * existingDeps.length)];
      currentDependencies[depToIncrement]++;
    } else {
      // Add a new dependency
      let newDependencySpecies;
      do {
        newDependencySpecies = allSpecies[Math.floor(Math.random() * allSpecies.length)];
      } while (
        currentDependencies[newDependencySpecies] // Don't pick existing dependency
      );
      
      currentDependencies[newDependencySpecies] = 1;
    }
  }
  
  // Increment a dependency for challenge mode
  incrementChallengeDependency() {
    // In challenge mode, we only add dependencies between the two challenge species
    
    // Randomly choose which species to modify (A or B)
    const targetSpecies = Math.random() < 0.5 ? this.challengeSpeciesA : this.challengeSpeciesB;
    
    // For the chosen species, its dependency must be the other challenge species
    const dependencySpecies = targetSpecies === this.challengeSpeciesA ? 
                              this.challengeSpeciesB : this.challengeSpeciesA;
    
    // Get current dependency count
    const currentDependencies = this.speciesDependencies[targetSpecies];
    const currentCount = currentDependencies[dependencySpecies] || 0;
    
    // Increment the dependency
    currentDependencies[dependencySpecies] = currentCount + 1;
  }
  
  // Create a new pair of tetrominos in selection (no placement on board)
  createTetrominoPairInSelection() {
    const allSpecies = Object.keys(Tetromino.TETROMINOES);
    
    // Calculate board center coordinates for initial position
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    
    // Pick two random species
    const shuffledSpecies = [...allSpecies].sort(() => Math.random() - 0.5);
    const speciesA = shuffledSpecies[0];
    const speciesB = shuffledSpecies[1];
    
    // Create the tetrominos centered in view
    const tetrominoA = new Tetromino(speciesA, [centerX - 1, centerY]);
    const tetrominoB = new Tetromino(speciesB, [centerX + 1, centerY]);
    
    // Get slider values with defaults if not available
    const sliderValue0 = window.devSlider0Value !== undefined ? window.devSlider0Value : 3;
    const sliderValue1 = window.devSlider1Value !== undefined ? window.devSlider1Value : 3;
    
    // Create dependencies between them
    const depsA = {};
    depsA[speciesB] = sliderValue0;  // Tetromino A needs slider0 adjacent B tetrominos
    
    const depsB = {};
    depsB[speciesA] = sliderValue1;  // Tetromino B needs slider1 adjacent A tetrominos
    
    // Set the individual dependencies
    tetrominoA.setDependencies(depsA);
    tetrominoB.setDependencies(depsB);
    
    // Add to selection
    this.selectedTetrominos.push(tetrominoA);
    this.selectedTetrominos.push(tetrominoB);
    
    // Set the first one as anchor
    this.anchorTetromino = tetrominoA;
    
    // Set the reference position for movement
    this.referenceMouseGridLocation = [centerX - 1, centerY];
  }

  getOccupant(i, j) {
    if (i >= 0 && i < this.width && j >= 0 && j < this.height) {
      return this.grid[i][j];
    }
    return null;
  }

  addTetromino(tetromino) {
    const squares = tetromino.getSquares();
    
    // Check if all squares are empty
    for (const [i, j] of squares) {
      if (i < 0 || i >= this.width || j < 0 || j >= this.height || this.grid[i][j] !== null) {
        return false;
      }
    }
    
    // Add the tetromino to all its squares
    for (const [i, j] of squares) {
      this.grid[i][j] = tetromino;
    }
    
    // Only set species-level dependencies if in default or challenge mode
    // In clumps mode, respect the individual tetromino's dependencies
    if (this.gameMode !== 'clumps') {
      const speciesDeps = this.speciesDependencies[tetromino.species];
      tetromino.setDependencies({...speciesDeps});
    }
    
    return true;
  }

  removeTetromino(tetromino) {
    const squares = tetromino.getSquares();
    
    // Check if all squares are occupied by this tetromino
    for (const [i, j] of squares) {
      if (i < 0 || i >= this.width || j < 0 || j >= this.height || this.grid[i][j] !== tetromino) {
        return false;
      }
    }
    
    // Remove the tetromino from all its squares
    for (const [i, j] of squares) {
      this.grid[i][j] = null;
    }
    
    return true;
  }

  // Check if grid position intersects with any selected tetromino
  isPositionInSelection(gridX, gridY) {
    for (const tetromino of this.selectedTetrominos) {
      // Get all squares of this tetromino
      const squares = tetromino.getSquares();
      
      // Check if any square matches the grid position
      for (const [squareX, squareY] of squares) {
        if (squareX === gridX && squareY === gridY) {
          return tetromino; // Return the tetromino that was hit
        }
      }
    }
    
    return null; // No tetromino at this position
  }
  
  // Toggle tetromino selection (for multiple selection)
  toggleTetromino(gridX, gridY) {
    // First check if the position is within any selected tetromino
    const selectedTetromino = this.isPositionInSelection(gridX, gridY);
    if (selectedTetromino) {
      // Found in selection - check if part of a clump
      if (selectedTetromino.clumpId) {
        // Get all tetrominos in this clump from selection
        const clumpTetrominos = this.selectedTetrominos.filter(t => t.clumpId === selectedTetromino.clumpId);
        
        // Try to place all tetrominos in the clump
        let allPlaced = true;
        
        // First check if all positions are free
        for (const tetromino of clumpTetrominos) {
          const squares = tetromino.getSquares();
          for (const [i, j] of squares) {
            if (i < 0 || i >= this.width || j < 0 || j >= this.height || 
                (this.grid[i][j] !== null && !clumpTetrominos.includes(this.grid[i][j]))) {
              allPlaced = false;
              break;
            }
          }
          if (!allPlaced) break;
        }
        
        if (allPlaced) {
          // Now place all tetrominos
          for (const tetromino of clumpTetrominos) {
            const index = this.selectedTetrominos.indexOf(tetromino);
            if (index >= 0) {
              this.selectedTetrominos.splice(index, 1);
            }
            
            // Add to the grid
            const squares = tetromino.getSquares();
            for (const [i, j] of squares) {
              this.grid[i][j] = tetromino;
            }
          }
          
          // If we removed the anchor and it was in the clump, update anchor
          if (this.anchorTetromino && clumpTetrominos.includes(this.anchorTetromino)) {
            this.anchorTetromino = this.selectedTetrominos.length > 0 ? 
                                 this.selectedTetrominos[this.selectedTetrominos.length - 1] : null;
          }
          
          return true;
        }
        return false; // Couldn't place the clump
      }
      
      // Not part of a clump - original logic
      const index = this.selectedTetrominos.indexOf(selectedTetromino);
      if (index >= 0) {
        // Try to place it back on board
        if (this.addTetromino(selectedTetromino)) {
          // Successfully placed, remove from selection
          this.selectedTetrominos.splice(index, 1);
          
          // If we removed the anchor, set a new one or null
          if (this.anchorTetromino === selectedTetromino) {
            this.anchorTetromino = this.selectedTetrominos.length > 0 ? 
                                   this.selectedTetrominos[this.selectedTetrominos.length - 1] : null;
          }
          
          return true;
        }
        // If placement failed, keep in selection
      }
      return false;
    }
    
    // Not in selection, check if there's a tetromino on the board
    const tetromino = this.getOccupant(gridX, gridY);
    if (!tetromino) {
      return false;
    }
    
    // Check if part of a clump
    if (tetromino.clumpId) {
      // Find all tetrominos in this clump
      const clumpTetrominos = [];
      
      for (let i = 0; i < this.width; i++) {
        for (let j = 0; j < this.height; j++) {
          const t = this.grid[i][j];
          if (t && t.clumpId === tetromino.clumpId && !clumpTetrominos.includes(t)) {
            clumpTetrominos.push(t);
          }
        }
      }
      
      // Try to remove all tetrominos in the clump
      for (const t of clumpTetrominos) {
        this.removeTetromino(t);
        
        // Add to selection
        this.selectedTetrominos.push(t);
      }
      
      // Set the clicked tetromino as anchor
      this.anchorTetromino = tetromino;
      this.referenceMouseGridLocation = [gridX, gridY];
      return true;
    }
    
    // Not part of a clump - original logic
    // Not yet selected - try to remove from board and add to selection
    if (this.removeTetromino(tetromino)) {
      // Add to selection
      this.selectedTetrominos.push(tetromino);
      this.anchorTetromino = tetromino;
      this.referenceMouseGridLocation = [gridX, gridY];
      return true;
    }
    // If removal failed, don't add to selection
    return false;
  }
  
  // Clear selection - attempt to place all selected tetrominos
  clearSelection() {
    if (this.selectedTetrominos.length === 0) {
      return true;
    }
    
    // Group tetrominos by clump
    const clumpGroups = new Map();
    const nonClumpedTetrominos = [];
    
    // Organize tetrominos by clump
    for (const tetromino of this.selectedTetrominos) {
      if (tetromino.clumpId) {
        if (!clumpGroups.has(tetromino.clumpId)) {
          clumpGroups.set(tetromino.clumpId, []);
        }
        clumpGroups.get(tetromino.clumpId).push(tetromino);
      } else {
        nonClumpedTetrominos.push(tetromino);
      }
    }
    
    // Try to place all tetrominos one by one
    const stillSelected = [];
    
    // First try to place each clump as a unit
    for (const [clumpId, clumpTetrominos] of clumpGroups.entries()) {
      let canPlaceClump = true;
      
      // Check if we can place all tetrominos in the clump
      for (const tetromino of clumpTetrominos) {
        const squares = tetromino.getSquares();
        for (const [i, j] of squares) {
          if (i < 0 || i >= this.width || j < 0 || j >= this.height || 
              (this.grid[i][j] !== null && !clumpTetrominos.includes(this.grid[i][j]))) {
            canPlaceClump = false;
            break;
          }
        }
        if (!canPlaceClump) break;
      }
      
      if (canPlaceClump) {
        // Place all tetrominos in the clump
        for (const tetromino of clumpTetrominos) {
          const squares = tetromino.getSquares();
          for (const [i, j] of squares) {
            this.grid[i][j] = tetromino;
          }
        }
      } else {
        // Keep all tetrominos in this clump selected
        stillSelected.push(...clumpTetrominos);
      }
    }
    
    // Then try to place non-clumped tetrominos individually
    for (const tetromino of nonClumpedTetrominos) {
      const success = this.addTetromino(tetromino);
      if (!success) {
        // Failed to place this tetromino, keep it in selection
        stillSelected.push(tetromino);
      }
    }
    
    // Update selection with only tetrominos that couldn't be placed
    this.selectedTetrominos = stillSelected;
    
    // Update anchor
    this.anchorTetromino = stillSelected.length > 0 ? stillSelected[stillSelected.length - 1] : null;
    
    // Clear reference position if all placed successfully
    if (stillSelected.length === 0) {
      this.referenceMouseGridLocation = null;
      return true;
    }
    
    return false;
  }
  
  // Rotate all selected tetrominos around the anchor
  rotateSelection(clockwise = true) {
    if (this.selectedTetrominos.length === 0 || !this.anchorTetromino) {
      return false;
    }
    
    // Get anchor position
    const anchorPos = this.anchorTetromino.position;
    
    // Rotate each tetromino around the anchor
    for (const tetromino of this.selectedTetrominos) {
      // First, update orientation
      if (clockwise) {
        tetromino.orientation = (tetromino.orientation + 1) % 4;
      } else {
        tetromino.orientation = (tetromino.orientation - 1 + 4) % 4;
      }
      
      // Skip position update for the anchor tetromino
      if (tetromino === this.anchorTetromino) {
        continue;
      }
      
      // Calculate relative position to anchor
      const relX = tetromino.position[0] - anchorPos[0];
      const relY = tetromino.position[1] - anchorPos[1];
      
      // Apply rotation to the relative position
      // x,y -> -y,x for 90Â° clockwise
      // x,y -> y,-x for 90Â° counterclockwise
      let newRelX, newRelY;
      
      if (clockwise) {
        newRelX = -relY;
        newRelY = relX;
      } else {
        newRelX = relY;
        newRelY = -relX;
      }
      
      // Update tetromino position
      tetromino.position = [
        anchorPos[0] + newRelX,
        anchorPos[1] + newRelY
      ];
    }
    
    return true;
  }
  
  // Move all selected tetrominos
  moveSelection(newMouseGridPos) {
    if (this.selectedTetrominos.length === 0 || !this.referenceMouseGridLocation) {
      return false;
    }
    
    // Calculate grid offset from reference position
    const [oldX, oldY] = this.referenceMouseGridLocation;
    const [newX, newY] = newMouseGridPos;
    
    // Allow movement even if it's to the same position (which can happen with mouse/touch precision)
    // This fixes the issue where you can't move back to the original position
    
    // Calculate delta
    const deltaX = newX - oldX;
    const deltaY = newY - oldY;
    
    // Move each tetromino in selection
    for (const tetromino of this.selectedTetrominos) {
      const [posX, posY] = tetromino.position;
      tetromino.position = [
        posX + deltaX,
        posY + deltaY
      ];
    }
    
    // Update reference position
    this.referenceMouseGridLocation = newMouseGridPos;
    
    return true;
  }
  
  // Clone the entire selection
  cloneSelection() {
    if (this.selectedTetrominos.length === 0) {
      return false;
    }
    
    // Store the original selection
    const originalSelection = [...this.selectedTetrominos];
    const originalAnchor = this.anchorTetromino;
    const originalRefPos = this.referenceMouseGridLocation ? [...this.referenceMouseGridLocation] : null;
    
    // Temporarily remove tetrominos from selection to place them on the board
    this.selectedTetrominos = [];
    this.anchorTetromino = null;
    
    // Try to place all tetrominos on the board
    let allPlaced = true;
    for (const tetromino of originalSelection) {
      const success = this.addTetromino(tetromino);
      if (!success) {
        allPlaced = false;
        break;
      }
    }
    
    if (!allPlaced) {
      // Clone operation failed - restore original selection
      // First, remove any tetrominos that were placed on the board
      for (const tetromino of originalSelection) {
        this.removeTetromino(tetromino);
      }
      
      // Restore original selection
      this.selectedTetrominos = originalSelection;
      this.anchorTetromino = originalAnchor;
      this.referenceMouseGridLocation = originalRefPos;
      
      return false;
    }
    
    // Clone operation succeeded - tetrominos are on the board
    // Create clones with identical properties
    const clones = [];
    
    // Group tetrominos by clump to create new clumps for the clones
    const clumpGroups = new Map(); // original clumpId -> array of clones
    
    for (const original of originalSelection) {
      // Create a new clone with the same properties
      const clone = original.clone();
      
      // If we're in clumps mode, make sure dependencies are preserved
      // by manually copying them instead of relying on the clone method
      if (this.gameMode === 'clumps') {
        clone.dependencies = {...original.dependencies};
        clone.active = original.active;
      }
      
      // If the original is part of a clump, add this clone to the clump group
      if (original.clumpId) {
        if (!clumpGroups.has(original.clumpId)) {
          clumpGroups.set(original.clumpId, []);
        }
        clumpGroups.get(original.clumpId).push(clone);
        
        // Temporarily clear the clump ID (will be reassigned later)
        clone.clumpId = null;
      }
      
      clones.push(clone);
      
      // If this was the anchor, mark the corresponding clone as the new anchor
      if (original === originalAnchor) {
        this.anchorTetromino = clone;
      }
    }
    
    // Assign new clump IDs to each group of clones
    for (const [originalClumpId, cloneGroup] of clumpGroups.entries()) {
      // Create a new clump ID
      const newClumpId = `clump-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Find one tetromino from the original clump to copy dependencies from
      const originalClumpTetromino = originalSelection.find(t => t.clumpId === originalClumpId);
      
      // Set the new clump ID and copy clump dependencies to all clones in this group
      for (const clone of cloneGroup) {
        clone.clumpId = newClumpId;
        clone.clumpDependencies = {...originalClumpTetromino.clumpDependencies};
        clone.clumpAdjacencyDict = {}; // Start with empty adjacency dict
      }
    }
    
    // Set the new selection
    this.selectedTetrominos = clones;
    this.referenceMouseGridLocation = originalRefPos;
    
    return true;
  }
  
  // Clumpify the currently selected tetrominos
  clumpify() {
    if (this.selectedTetrominos.length <= 1) {
      return false; // Need at least 2 tetrominos to form a clump
    }
    
    // Create a unique clump ID
    const clumpId = `clump-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Track composition of the clump (species -> count)
    const clumpComposition = {};
    
    // Collect all unique species in the clump
    const speciesInClump = new Set();
    for (const tetromino of this.selectedTetrominos) {
      speciesInClump.add(tetromino.species);
      // Count species for composition
      clumpComposition[tetromino.species] = (clumpComposition[tetromino.species] || 0) + 1;
    }
    
    // Get all available species
    const allSpecies = Object.keys(Tetromino.TETROMINOES);
    
    // Create weighted pool for random selection
    // Species in the clump have double weight
    const weightedSpeciesPool = [];
    for (const species of allSpecies) {
      // Add the species once
      weightedSpeciesPool.push(species);
      
      // Add it a second time if it's in the clump (double weight)
      if (speciesInClump.has(species)) {
        weightedSpeciesPool.push(species);
      }
    }
    
    // Randomly select two species with replacement
    const shuffledPool = [...weightedSpeciesPool].sort(() => Math.random() - 0.5);
    const speciesA = shuffledPool[0];
    
    // Try to pick a different species for B if possible
    let speciesB;
    let attempts = 0;
    do {
      speciesB = shuffledPool[Math.floor(Math.random() * shuffledPool.length)];
      attempts++;
    } while (speciesB === speciesA && attempts < 5); // Try a few times but don't get stuck
    
    // Get slider values with defaults if not available
    const sliderValue0 = window.devSlider0Value !== undefined ? window.devSlider0Value : 3;
    const sliderValue1 = window.devSlider1Value !== undefined ? window.devSlider1Value : 3;
    
    // Create dependencies for the clump
    const clumpDependencies = {};
    
    // Species A gets sliderValue0 count
    clumpDependencies[speciesA] = sliderValue0;
    
    // Species B gets sliderValue1 count
    clumpDependencies[speciesB] = sliderValue1;
    
    // Track clump adjacency dict for dependency satisfaction
    const clumpAdjacencyDict = {};
    
    // Assign all selected tetrominos to this clump
    for (const tetromino of this.selectedTetrominos) {
      tetromino.clumpId = clumpId;
      // Store clump-level dependencies and adjacency in each tetromino
      tetromino.clumpDependencies = {...clumpDependencies};
      tetromino.clumpAdjacencyDict = {...clumpAdjacencyDict};
      tetromino.clumpComposition = {...clumpComposition};  // Store composition in each tetromino
      // Set active to false by default, will be updated during adjacency check
      tetromino.active = false;
    }
    
    return true;
  }
  
  // Get all tetrominos in the same clump as the given tetromino
  getClumpTetrominos(tetromino) {
    if (!tetromino.clumpId) return [tetromino];
    
    const result = [];
    
    // Check all tetrominos in selection
    for (const t of this.selectedTetrominos) {
      if (t.clumpId === tetromino.clumpId) {
        result.push(t);
      }
    }
    
    // Check all tetrominos on the board
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        const t = this.grid[i][j];
        if (t && t.clumpId === tetromino.clumpId && !result.includes(t)) {
          result.push(t);
        }
      }
    }
    
    return result;
  }
  
  hasSelection() {
    return this.selectedTetrominos.length > 0;
  }

  // Update game state
  update() {
    // Increment frame counter
    this.frameCounter++;
    
    // Check if it's time for an adjacency update
    if (this.frameCounter >= this.ADJ_UPDATE_INTERVAL) {
      this.updateAdjacencies();
      this.frameCounter = 0;
      this.adjacencyUpdateCounter++;
      
      // Check for score conditions based on game mode
      if (this.gameMode === 'clumps') {
        // For clumps mode, check if all non-clumped tetrominos are active and selection is empty
        if (this.selectedTetrominos.length === 0) {
          // Get all non-clumped tetrominos
          const nonClumpedTetrominos = this.getNonClumpedTetrominos();
          
          // Check if there's at least one non-clumped tetromino
          if (nonClumpedTetrominos.length > 0) {
            // Check if all non-clumped tetrominos are active
            const allActive = nonClumpedTetrominos.every(tetromino => tetromino.active);
            
            if (allActive) {
              // Form clumps from connected components
              this.formClumpsFromConnectedComponents();
              
              // Increment score
              this.score++;
            }
          }
        }
      } else {
        // For other modes, check if all tetrominos are active and no selection
        if (this.areAllTetrominosActive() && this.selectedTetrominos.length === 0) {
          this.incrementRandomDependency();
        }
      }
    }
  }
  
  // Get all non-clumped tetrominos on the board
  getNonClumpedTetrominos() {
    const result = [];
    
    // Scan the entire board for non-clumped tetrominos
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        const tetromino = this.grid[i][j];
        
        // Add to result if tetromino exists, isn't in a clump, and isn't already in the result
        if (tetromino && !tetromino.clumpId && !result.includes(tetromino)) {
          result.push(tetromino);
        }
      }
    }
    
    return result;
  }
  
  // Form clumps from connected components of the tetromino adjacency graph
  formClumpsFromConnectedComponents() {
    // Get all non-clumped tetrominos
    const nonClumpedTetrominos = this.getNonClumpedTetrominos();
    
    if (nonClumpedTetrominos.length === 0) {
      return; // Nothing to do
    }
    
    // Build adjacency graph
    const adjacencyGraph = new Map();
    
    // Initialize graph with all tetrominos
    for (const tetromino of nonClumpedTetrominos) {
      adjacencyGraph.set(tetromino, []);
    }
    
    // Find adjacencies between tetrominos
    for (const tetromino of nonClumpedTetrominos) {
      const squares = tetromino.getSquares();
      
      // Check adjacent cells for each square
      for (const [x, y] of squares) {
        // Check all 4 adjacent cells
        const adjacentPositions = [
          [x+1, y], [x-1, y], [x, y+1], [x, y-1]
        ];
        
        for (const [adjX, adjY] of adjacentPositions) {
          // Check if position is within board bounds
          if (adjX >= 0 && adjX < this.width && adjY >= 0 && adjY < this.height) {
            const adjacentTetromino = this.grid[adjX][adjY];
            
            // Skip if no tetromino, same tetromino, or tetromino in a clump
            if (!adjacentTetromino || 
                adjacentTetromino === tetromino || 
                adjacentTetromino.clumpId) {
              continue;
            }
            
            // Add to adjacency list if not already there
            const adjacencyList = adjacencyGraph.get(tetromino);
            if (!adjacencyList.includes(adjacentTetromino)) {
              adjacencyList.push(adjacentTetromino);
            }
          }
        }
      }
    }
    
    // Find connected components using DFS
    const visited = new Set();
    const components = [];
    
    // DFS function to find connected components
    const dfs = (node, component) => {
      visited.add(node);
      component.push(node);
      
      for (const neighbor of adjacencyGraph.get(node)) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, component);
        }
      }
    };
    
    // Find all connected components
    for (const tetromino of nonClumpedTetrominos) {
      if (!visited.has(tetromino)) {
        const component = [];
        dfs(tetromino, component);
        components.push(component);
      }
    }
    
    // Form a clump for each connected component
    for (const component of components) {
      if (component.length > 0) {
        // Create a unique clump ID
        const clumpId = `clump-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Track composition of the clump (species -> count)
        const clumpComposition = {};
        
        // Collect all unique species in the clump
        const speciesInClump = new Set();
        for (const tetromino of component) {
          speciesInClump.add(tetromino.species);
          // Count species for composition
          clumpComposition[tetromino.species] = (clumpComposition[tetromino.species] || 0) + 1;
        }
        
        // Create dependencies using the same algorithm as clumpify
        // Get all available species
        const allSpecies = Object.keys(Tetromino.TETROMINOES);
        
        // Create weighted pool for random selection
        // Species in the clump have double weight
        const weightedSpeciesPool = [];
        for (const species of allSpecies) {
          // Add the species once
          weightedSpeciesPool.push(species);
          
          // Add it a second time if it's in the clump (double weight)
          if (speciesInClump.has(species)) {
            weightedSpeciesPool.push(species);
          }
        }
        
        // Randomly select two species with replacement
        const shuffledPool = [...weightedSpeciesPool].sort(() => Math.random() - 0.5);
        const speciesA = shuffledPool[0];
        
        // Try to pick a different species for B if possible
        let speciesB;
        let attempts = 0;
        do {
          speciesB = shuffledPool[Math.floor(Math.random() * shuffledPool.length)];
          attempts++;
        } while (speciesB === speciesA && attempts < 5); // Try a few times but don't get stuck
        
        // Get slider values with defaults if not available
        const sliderValue0 = window.devSlider0Value !== undefined ? window.devSlider0Value : 3;
        const sliderValue1 = window.devSlider1Value !== undefined ? window.devSlider1Value : 3;
        
        // Create dependencies for the clump
        const clumpDependencies = {};
        
        // Species A gets sliderValue0 count
        clumpDependencies[speciesA] = sliderValue0;
        
        // Species B gets sliderValue1 count
        clumpDependencies[speciesB] = sliderValue1;
        
        // Track clump adjacency dict for dependency satisfaction
        const clumpAdjacencyDict = {};
        
        // Assign all tetrominos to this clump
        for (const tetromino of component) {
          tetromino.clumpId = clumpId;
          // Store clump-level dependencies and adjacency in each tetromino
          tetromino.clumpDependencies = {...clumpDependencies};
          tetromino.clumpAdjacencyDict = {...clumpAdjacencyDict};
          tetromino.clumpComposition = {...clumpComposition};  // Store composition in each tetromino
          // Set active to false by default, will be updated during adjacency check
          tetromino.active = false;
        }
      }
    }
  }

  updateAdjacencies() {
    // Get all tetrominoes on the board (avoid duplicates)
    const tetrominoes = new Set();
    for (let i = 0; i < this.width; i++) {
      for (let j = 0; j < this.height; j++) {
        if (this.grid[i][j] !== null) {
          tetrominoes.add(this.grid[i][j]);
        }
      }
    }
    
    // Group tetrominos by clump
    const clumps = new Map(); // clumpId -> tetrominos array
    const unclumpedTetrominos = [];
    
    // Reset adjacency dicts for all tetrominos
    for (const tetromino of tetrominoes) {
      tetromino.adjacencyDict = {};
      
      // Also reset clump adjacency for clumped tetrominos
      if (tetromino.clumpId) {
        tetromino.clumpAdjacencyDict = {};
        
        // Group by clump
        if (!clumps.has(tetromino.clumpId)) {
          clumps.set(tetromino.clumpId, []);
        }
        clumps.get(tetromino.clumpId).push(tetromino);
      } else {
        unclumpedTetrominos.push(tetromino);
      }
    }
    
    // Process regular adjacencies for unclumped tetrominos
    this.processRegularAdjacencies(unclumpedTetrominos, tetrominoes);
    
    // Process clump adjacencies
    this.processClumpAdjacencies(clumps, tetrominoes);
    
    // Update active states
    for (const tetromino of tetrominoes) {
      if (!tetromino.clumpId) {
        // Regular tetromino
        this.updateTetrominoActiveState(tetromino);
      }
    }
    
    // Update clump active states after all adjacencies are known
    for (const [clumpId, clumpTetrominos] of clumps.entries()) {
      this.updateClumpActiveState(clumpId, clumpTetrominos);
    }
  }
  
  // Process regular adjacencies for unclumped tetrominos
  processRegularAdjacencies(unclumpedTetrominos, allTetrominos) {
    for (const tetromino of unclumpedTetrominos) {
      const squares = tetromino.getSquares();
      // Keep track of unique adjacent tetrominoes by species
      const adjacentTetrominoes = {};
      
      // Check adjacent cells for each square of the tetromino
      for (const [x, y] of squares) {
        // Check all 4 adjacent cells
        const adjacentPositions = [
          [x+1, y], [x-1, y], [x, y+1], [x, y-1]
        ];
        
        for (const [adjX, adjY] of adjacentPositions) {
          // Check if position is within board bounds
          if (adjX >= 0 && adjX < this.width && adjY >= 0 && adjY < this.height) {
            const adjacentTetromino = this.grid[adjX][adjY];
            
            // Skip if no tetromino or it's the same tetromino
            if (adjacentTetromino === null || 
                adjacentTetromino === tetromino ||
                adjacentTetromino.clumpId) { // Skip clumped tetrominos for regular adjacency
              continue;
            }
            
            // Track unique tetrominos by species
            const adjacentSpecies = adjacentTetromino.species;
            if (!adjacentTetrominoes[adjacentSpecies]) {
              adjacentTetrominoes[adjacentSpecies] = new Set();
            }
            
            // Add this tetromino to the set for this species
            adjacentTetrominoes[adjacentSpecies].add(adjacentTetromino);
          }
        }
      }
      
      // Count unique tetrominoes by species
      for (const [species, uniqueTetrominoes] of Object.entries(adjacentTetrominoes)) {
        tetromino.adjacencyDict[species] = uniqueTetrominoes.size;
      }
    }
  }
  
  // Process adjacencies between clumps
  processClumpAdjacencies(clumps, allTetrominos) {
    // First build a map of all clump compositions (what species make up each clump)
    const clumpSpeciesMap = new Map(); // clumpId -> Set of species it contains
    
    for (const [clumpId, clumpTetrominos] of clumps.entries()) {
      if (clumpTetrominos.length > 0) {
        // Get the composition from the first tetromino (all have the same data)
        const composition = clumpTetrominos[0].clumpComposition;
        const speciesSet = new Set(Object.keys(composition));
        clumpSpeciesMap.set(clumpId, speciesSet);
      }
    }
    
    // Next, find adjacencies between clumps
    const clumpAdjacencies = new Map(); // clumpId -> Set of adjacent clumpIds
    
    for (const [clumpId, clumpTetrominos] of clumps.entries()) {
      // Initialize adjacency set for this clump
      clumpAdjacencies.set(clumpId, new Set());
      
      // Process each tetromino to find adjacent clumps
      for (const tetromino of clumpTetrominos) {
        const squares = tetromino.getSquares();
        
        // Check adjacent cells for each square
        for (const [x, y] of squares) {
          // Check all 4 adjacent cells
          const adjacentPositions = [
            [x+1, y], [x-1, y], [x, y+1], [x, y-1]
          ];
          
          for (const [adjX, adjY] of adjacentPositions) {
            // Check if position is within board bounds
            if (adjX >= 0 && adjX < this.width && adjY >= 0 && adjY < this.height) {
              const adjacentTetromino = this.grid[adjX][adjY];
              
              // Skip if no tetromino, or not part of a clump, or part of same clump
              if (!adjacentTetromino || 
                  !adjacentTetromino.clumpId || 
                  adjacentTetromino.clumpId === clumpId) {
                continue;
              }
              
              // Record this adjacent clump
              clumpAdjacencies.get(clumpId).add(adjacentTetromino.clumpId);
            }
          }
        }
      }
    }
    
    // Now, for each clump, calculate how many of each species it has nearby
    // based on adjacent clumps and their composition
    for (const [clumpId, clumpTetrominos] of clumps.entries()) {
      if (clumpTetrominos.length === 0) continue;
      
      // Get adjacent clumps for this clump
      const adjacentClumpIds = clumpAdjacencies.get(clumpId) || new Set();
      
      // Initialize the adjacency counts dictionary
      const adjacencyCounts = {};
      
      // For each adjacent clump, check what species it provides
      for (const adjacentClumpId of adjacentClumpIds) {
        // Get the species in this adjacent clump
        const adjacentClumpSpecies = clumpSpeciesMap.get(adjacentClumpId) || new Set();
        
        // Each clump provides 1 count for each unique species it contains
        for (const species of adjacentClumpSpecies) {
          adjacencyCounts[species] = (adjacencyCounts[species] || 0) + 1;
        }
      }
      
      // Update all tetrominos in this clump with the same adjacency dict
      for (const tetromino of clumpTetrominos) {
        tetromino.clumpAdjacencyDict = {...adjacencyCounts};
      }
    }
  }
  
  // Update active state for a clump
  updateClumpActiveState(clumpId, clumpTetrominos) {
    if (clumpTetrominos.length === 0) return;
    
    // Get clump dependencies from first tetromino (they should all be the same)
    const clumpDependencies = clumpTetrominos[0].clumpDependencies;
    
    // Check if all dependencies are satisfied
    let allSatisfied = true;
    
    // If no dependencies, clump is always active
    if (Object.keys(clumpDependencies).length === 0) {
      for (const tetromino of clumpTetrominos) {
        tetromino.active = true;
      }
      return;
    }
    
    // Check each dependency using the clump adjacency dict
    for (const [species, requiredCount] of Object.entries(clumpDependencies)) {
      const adjacentCount = clumpTetrominos[0].clumpAdjacencyDict[species] || 0;
      if (adjacentCount < requiredCount) {
        allSatisfied = false;
        break;
      }
    }
    
    // Update active state for all tetrominos in the clump
    for (const tetromino of clumpTetrominos) {
      tetromino.active = allSatisfied;
    }
  }
  
  updateTetrominoActiveState(tetromino) {
    // Check if all dependencies are satisfied
    let allSatisfied = true;
    
    // If no dependencies, tetromino is always active
    if (Object.keys(tetromino.dependencies).length === 0) {
      tetromino.active = true;
      return;
    }
    
    // Check each dependency
    for (const [species, requiredCount] of Object.entries(tetromino.dependencies)) {
      const adjacentCount = tetromino.adjacencyDict[species] || 0;
      if (adjacentCount < requiredCount) {
        allSatisfied = false;
        break;
      }
    }
    
    // Update active state
    tetromino.active = allSatisfied;
  }
}

// Camera class for zooming and panning
class Camera {
  constructor(position = [0, 0], zoom = 1.0) {
    this.position = [...position];
    this.zoom = zoom;
  }

  worldToScreen(x, y, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    const sx = centerX + (x - this.position[0]) * this.zoom;
    const sy = centerY + (y - this.position[1]) * this.zoom;
    
    return [sx, sy];
  }

  screenToWorld(sx, sy, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    const x = this.position[0] + (sx - centerX) / this.zoom;
    const y = this.position[1] + (sy - centerY) / this.zoom;
    
    return [x, y];
  }

  zoomAt(x, y, factor, canvasWidth, canvasHeight) {
    const [worldX, worldY] = this.screenToWorld(x, y, canvasWidth, canvasHeight);
    
    const oldZoom = this.zoom;
    this.zoom *= factor;
    this.zoom = Math.max(0.1, Math.min(10.0, this.zoom));
    
    if (oldZoom !== this.zoom) {
      const [screenXNew, screenYNew] = this.worldToScreen(worldX, worldY, canvasWidth, canvasHeight);
      
      const dx = screenXNew - x;
      const dy = screenYNew - y;
      
      const worldDX = dx / this.zoom;
      const worldDY = dy / this.zoom;
      
      this.position[0] += worldDX;
      this.position[1] += worldDY;
    }
  }
}

// Main Tetromino Game Component
const TetrominoGame = () => {
  const canvasRef = useRef(null);
  const requestRef = useRef();
  const previousTimeRef = useRef();
  
  // Game mode state
  const [gameMode, setGameMode] = useState('default');
  
  // DevSlider state values
  const [devSlider0Value, setDevSlider0Value] = useState(3);
  const [devSlider1Value, setDevSlider1Value] = useState(3);
  
  // Game state refs (to avoid re-renders)
  const gameboardRef = useRef(null);
  const cameraRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // Constants
  const GRID_SIZE = 30;
  const BOARD_WIDTH = 200;  // Increased by factor of 10
  const BOARD_HEIGHT = 200; // Increased by factor of 10
  
  // Center coordinates for positioning initial tetrominos
  const CENTER_X = Math.floor(BOARD_WIDTH / 2);
  const CENTER_Y = Math.floor(BOARD_HEIGHT / 2);

  // Initialize game on mount
  useEffect(() => {
    initializeGame(gameMode);
    
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);
  
  // Initialize or reset the game with the given mode
  const initializeGame = (mode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Cancel existing game loop if it exists
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    
    // Create new game components
    gameboardRef.current = new Gameboard(BOARD_WIDTH, BOARD_HEIGHT, mode);
    cameraRef.current = new Camera(
      [BOARD_WIDTH * GRID_SIZE / 2, BOARD_HEIGHT * GRID_SIZE / 2],
      0.7
    );
    
    // Create tetrominoes based on mode
    createTetrominoes();
    
    // Start the game loop
    previousTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(gameLoop);
  };
  
  // Handle game mode changes
  const handleModeChange = (event) => {
    const newMode = event.target.value;
    setGameMode(newMode);
    initializeGame(newMode);
  };

  // Create tetrominoes to populate the board based on game mode
  const createTetrominoes = () => {
    const gameboard = gameboardRef.current;
    
    if (gameboard.gameMode === 'challenge' || gameboard.gameMode === 'clumps') {
      // Challenge modes: create only one of each of the two challenge species
      const speciesA = gameboard.challengeSpeciesA;
      const speciesB = gameboard.challengeSpeciesB;
      
      const tetrominoA = new Tetromino(speciesA, [CENTER_X - 5, CENTER_Y]);
      const tetrominoB = new Tetromino(speciesB, [CENTER_X + 5, CENTER_Y]);
      
      // Set individual dependencies for each tetromino
      const depsA = {};
      depsA[speciesB] = 2;  // A needs 2 B
      
      const depsB = {};
      depsB[speciesA] = 3;  // B needs 3 A
      
      tetrominoA.setDependencies(depsA);
      tetrominoB.setDependencies(depsB);
      
      // Add tetrominoes to the game board
      gameboard.addTetromino(tetrominoA);
      gameboard.addTetromino(tetrominoB);
    } else {
      // Default mode: create the standard demo layout in the center of the board
      const offset_x = CENTER_X - 10; // Center the demo layout
      const offset_y = CENTER_Y - 8;
      
      const tetrominoes = [
        new Tetromino('I', [offset_x + 2, offset_y + 2]),
        new Tetromino('O', [offset_x + 8, offset_y + 2]),
        new Tetromino('T', [offset_x + 14, offset_y + 2]),
        new Tetromino('L', [offset_x + 2, offset_y + 8], 1),
        new Tetromino('J', [offset_x + 8, offset_y + 8], 2),
        new Tetromino('S', [offset_x + 14, offset_y + 8], 3),
        new Tetromino('Z', [offset_x + 2, offset_y + 14], 1),
        new Tetromino('I', [offset_x + 8, offset_y + 14], 2),
        new Tetromino('T', [offset_x + 14, offset_y + 14], 3)
      ];
      
      // Add tetrominoes to the game board
      for (const tetromino of tetrominoes) {
        gameboard.addTetromino(tetromino);
      }
    }
  };

  // Game loop function for FPS calculation
  const gameLoop = (time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const gameboard = gameboardRef.current;
    
    // Calculate delta time
    const deltaTime = time - (previousTimeRef.current || time);
    previousTimeRef.current = time;
    
    // FPS counter removed
    
    // Update game state
    gameboard.update();
    
    // Render the game
    render(ctx, canvas.width, canvas.height);
    
    // Continue the loop
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  // Get mouse position in grid coordinates
  const getMouseGridPosition = (x, y) => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    
    const [worldX, worldY] = camera.screenToWorld(x, y, canvas.width, canvas.height);
    const gridX = Math.floor(worldX / GRID_SIZE);
    const gridY = Math.floor(worldY / GRID_SIZE);
    
    return [gridX, gridY];
  };
  
  // Get accurate pointer position accounting for CSS scaling
  const getPointerPosition = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate the scale factor between CSS pixels and canvas pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Get client coordinates
    let clientX, clientY;
    
    if (e.touches) { // Touch event
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else { // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Convert to canvas coordinates
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    return { x, y };
  };

  // Mouse event handlers - all disabled if touch has been used
  const handleMouseDown = (e) => {
    // Skip if touch has been detected
    if (touchDeviceDetectedRef.current) return;
    
    const canvas = canvasRef.current;
    const gameboard = gameboardRef.current;
    
    const { x, y } = getPointerPosition(e);
    mouseRef.current = { x, y };
    
    // Store initial position for detecting drag vs click
    touchStartPosRef.current = { x, y };
    const [gridX, gridY] = getMouseGridPosition(x, y);
    touchStartGridPosRef.current = { x: gridX, y: gridY };
    
    if (!e.touches && e.button === 2) { // Right click (mouse only)
      // Deselect all tetrominos
      if (gameboard.hasSelection()) {
        gameboard.clearSelection();
      }
      
      // Prevent context menu
      e.preventDefault();
    } else { // Left click
      // Start potential drag - actual selection/deselection happens on mouse up
      isDraggingRef.current = true;
      
      if (gameboard.hasSelection()) {
        // Record the starting grid position for movement reference
        // Store positions of all selected tetrominos
        dragStartTetrominoPositionRef.current = {};
        
        for (const tetromino of gameboard.selectedTetrominos) {
          dragStartTetrominoPositionRef.current[tetromino.id] = [...tetromino.position];
        }
        
        // Set reference grid location for movement
        gameboard.referenceMouseGridLocation = [gridX, gridY];
      }
    }
  };
  
  const handleMouseMove = (e) => {
    // Skip if touch has been detected
    if (touchDeviceDetectedRef.current) return;
    
    const { x, y } = getPointerPosition(e);
    mouseRef.current = { x, y };
    
    // Only process movement when mouse is pressed (dragging)
    if (isDraggingRef.current) {
      const gameboard = gameboardRef.current;
      
      if (gameboard.hasSelection() && dragStartTetrominoPositionRef.current) {
        // Calculate current grid position
        const [gridX, gridY] = getMouseGridPosition(x, y);
        
        // Move the entire selection based on grid position difference
        gameboard.moveSelection([gridX, gridY]);
      } else {
        // Pan the view when no tetrominos are selected
        const camera = cameraRef.current;
        const startPos = touchStartPosRef.current;
        
        if (startPos) {
          // Calculate movement in screen space
          const dx = x - startPos.x;
          const dy = y - startPos.y;
          
          // Convert screen movement to world movement
          const worldDx = dx / camera.zoom;
          const worldDy = dy / camera.zoom;
          
          // Move camera in opposite direction of drag
          camera.position[0] -= worldDx;
          camera.position[1] -= worldDy;
          
          // Update start position for next move
          touchStartPosRef.current = { x, y };
        }
      }
    }
  };
  
  const handleMouseUp = (e) => {
    // Skip if touch has been detected
    if (touchDeviceDetectedRef.current) return;
    
    const gameboard = gameboardRef.current;
    const { x, y } = mouseRef.current;
    
    // Determine if this was a click or a drag
    const startPos = touchStartPosRef.current;
    const distance = startPos ? Math.hypot(x - startPos.x, y - startPos.y) : 0;
    const CLICK_THRESHOLD = 5; // pixels
    
    const isClick = distance < CLICK_THRESHOLD;
    
    if (isClick) {
      // Handle as a click (toggle selection or clear)
      const [gridX, gridY] = getMouseGridPosition(x, y);
      
      // First check if we clicked on an already selected tetromino
      const hitSelectedTetromino = gameboard.isPositionInSelection(gridX, gridY);
      if (hitSelectedTetromino) {
        // Toggle this specific tetromino in the selection
        gameboard.toggleTetromino(gridX, gridY);
      } else {
        // Check if there's a tetromino on the board
        const tetromino = gameboard.getOccupant(gridX, gridY);
        
        if (tetromino) {
          // Toggle this tetromino in the selection
          gameboard.toggleTetromino(gridX, gridY);
        } else {
          // Clicked on empty space - try to clear the selection
          gameboard.clearSelection();
        }
      }
    }
    
    // Reset dragging state
    isDraggingRef.current = false;
    dragStartTetrominoPositionRef.current = null;
  };
  
  const handleWheel = (e) => {
    // Skip if touch has been detected
    if (touchDeviceDetectedRef.current) return;
    
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const { x, y } = mouseRef.current;
    
    // Determine zoom direction
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    // Apply zoom centered on mouse position
    camera.zoomAt(x, y, zoomFactor, canvas.width, canvas.height);
  };
  
  // Additional refs for touch gestures
  const touchStartTimeRef = useRef(0);
  const touchStartPosRef = useRef(null);
  const touchStartGridPosRef = useRef(null);
  const dragStartTetrominoPositionRef = useRef(null);
  const isPinchingRef = useRef(false);
  const initialPinchDistanceRef = useRef(0);
  const touchPrevMidpointRef = useRef(null);
  const isPanningRef = useRef(false);
  const multiTouchActiveRef = useRef(false);  // New flag to track multi-touch gestures
  
  // Flag to completely disable mouse events once touch is detected
  const touchDeviceDetectedRef = useRef(false);
  
  // Touch event handlers
  const handleTouchStart = (e) => {
    e.preventDefault(); // Prevent scrolling
    
    // Set the touch device flag to disable mouse events
    touchDeviceDetectedRef.current = true;
    
    if (e.touches.length === 2) {
      // Set the multi-touch flag
      multiTouchActiveRef.current = true;
      
      // For pinch gesture, store the initial touch positions
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      initialPinchDistanceRef.current = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      isPinchingRef.current = true;
      isPanningRef.current = false;
      
      // Calculate the midpoint of the pinch
      const midX = (touch1.clientX + touch2.clientX) / 2;
      const midY = (touch1.clientY + touch2.clientY) / 2;
      
      // Update the mouse ref for midpoint
      const { x, y } = getPointerPosition({ clientX: midX, clientY: midY });
      mouseRef.current = { x, y };
      
      // Initialize midpoint tracking for pan detection
      touchPrevMidpointRef.current = { x, y };
    } else if (e.touches.length === 1) {
      // If multi-touch is active, ignore new single touches until all fingers are removed
      if (multiTouchActiveRef.current) {
        return;
      }
      
      // Record start time, position, and grid position for tap detection
      touchStartTimeRef.current = Date.now();
      
      // Get touch position
      const { x, y } = getPointerPosition(e);
      touchStartPosRef.current = { x, y };
      mouseRef.current = { x, y };
      
      // Get grid position
      const [gridX, gridY] = getMouseGridPosition(x, y);
      touchStartGridPosRef.current = { x: gridX, y: gridY };
      
      const gameboard = gameboardRef.current;
      
      // Store positions for movement if there are selected tetrominos
      if (gameboard.hasSelection()) {
        // Record the starting grid position for movement reference
        // Store positions of all selected tetrominos
        dragStartTetrominoPositionRef.current = {};
        
        for (const tetromino of gameboard.selectedTetrominos) {
          dragStartTetrominoPositionRef.current[tetromino.id] = [...tetromino.position];
        }
        
        // Set reference grid location for movement
        gameboard.referenceMouseGridLocation = [gridX, gridY];
      }
      
      // Reset dragging flag
      isDraggingRef.current = false;
    }
  };
  
  const handleTouchMove = (e) => {
    e.preventDefault(); // Prevent scrolling
    
    if (e.touches.length === 2) {
      // Make sure multi-touch flag is set
      multiTouchActiveRef.current = true;
      
      // Pinch/zoom handling - unchanged
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      // Calculate midpoint of the two touches
      const midX = (touch1.clientX + touch2.clientX) / 2;
      const midY = (touch1.clientY + touch2.clientY) / 2;
      const midpoint = getPointerPosition({ clientX: midX, clientY: midY });
      
      const canvas = canvasRef.current;
      const camera = cameraRef.current;
      
      // Handle panning - if we have a previous midpoint
      if (touchPrevMidpointRef.current) {
        const prevMidpoint = touchPrevMidpointRef.current;
        
        // Calculate movement in screen space
        const dx = midpoint.x - prevMidpoint.x;
        const dy = midpoint.y - prevMidpoint.y;
        
        // Calculate pinch ratio for detecting zoom vs pan
        const pinchRatio = currentDistance / initialPinchDistanceRef.current;
        const pinchChange = Math.abs(pinchRatio - 1);
        
        // If there's significant movement and little pinch change, it's a pan
        const PINCH_THRESHOLD = 0.05; // 5% change
        const MOVE_THRESHOLD = 2; // pixels
        
        // Pan if significant movement and minimal pinch
        if ((Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) && 
            pinchChange < PINCH_THRESHOLD) {
          // Convert screen movement to world movement
          const worldDx = dx / camera.zoom;
          const worldDy = dy / camera.zoom;
          
          // Pan the camera (move in opposite direction of drag)
          camera.position[0] -= worldDx;
          camera.position[1] -= worldDy;
          
          isPanningRef.current = true;
        }
        
        // Handle zoom if significant pinch change
        if (pinchChange > PINCH_THRESHOLD || !isPanningRef.current) {
          // Apply zoom at the midpoint
          if (Math.abs(pinchRatio - 1) > 0.01) { // Only zoom if significant change
            camera.zoomAt(midpoint.x, midpoint.y, pinchRatio, canvas.width, canvas.height);
            
            // Reset initial distance to current
            initialPinchDistanceRef.current = currentDistance;
          }
        }
      }
      
      // Update previous midpoint for next move event
      touchPrevMidpointRef.current = midpoint;
      
      // Update mouse position
      mouseRef.current = midpoint;
    } else if (e.touches.length === 1) {
      // If multi-touch is active, ignore single touch movement until all fingers are removed
      if (multiTouchActiveRef.current) {
        return;
      }
      
      // Get current touch position
      const { x, y } = getPointerPosition(e);
      mouseRef.current = { x, y };
      
      // Get current grid position
      const [gridX, gridY] = getMouseGridPosition(x, y);
      
      // Calculate distance moved (in pixels) to determine if this is a drag
      const startPos = touchStartPosRef.current;
      const distance = startPos ? Math.hypot(x - startPos.x, y - startPos.y) : 0;
      
      // If we've moved more than the threshold, consider it a drag
      const DRAG_THRESHOLD = 10; // pixels
      
      const gameboard = gameboardRef.current;
      if (distance > DRAG_THRESHOLD) {
        // This is a drag operation
        isDraggingRef.current = true;
        
        if (gameboard.hasSelection()) {
          // Move the entire selection based on grid position
          gameboard.moveSelection([gridX, gridY]);
        } else {
          // Panning when no tetromino is selected
          const camera = cameraRef.current;
          const deltaX = (x - startPos.x) / camera.zoom;
          const deltaY = (y - startPos.y) / camera.zoom;
          
          // Move camera in opposite direction of drag
          camera.position[0] -= deltaX;
          camera.position[1] -= deltaY;
          
          // Update start position for next move
          touchStartPosRef.current = { x, y };
        }
      }
    }
  };
  
  const handleTouchEnd = (e) => {
    // If ending a pinch but still have touches
    if (e.touches.length < 2 && isPinchingRef.current) {
      isPinchingRef.current = false;
      isPanningRef.current = false;
      touchPrevMidpointRef.current = null;
    }
    
    // If all touches ended
    if (e.touches.length === 0) {
      // Reset multi-touch flag only when all fingers are removed
      multiTouchActiveRef.current = false;
      
      const gameboard = gameboardRef.current;
      
      // Check if this was a tap (short duration, little movement)
      const endTime = Date.now();
      const duration = endTime - touchStartTimeRef.current;
      
      // Get current position
      const { x, y } = mouseRef.current;
      const [gridX, gridY] = getMouseGridPosition(x, y);
      
      // If not dragging and duration is short, handle as a tap
      const TAP_DURATION_THRESHOLD = 200; // milliseconds
      
      if (!isDraggingRef.current && duration < TAP_DURATION_THRESHOLD) {
        // First check if we tapped on an already selected tetromino
        const hitSelectedTetromino = gameboard.isPositionInSelection(gridX, gridY);
        if (hitSelectedTetromino) {
          // Toggle this specific tetromino in the selection
          gameboard.toggleTetromino(gridX, gridY);
        } else {
          // Check if there's a tetromino on the board
          const tetromino = gameboard.getOccupant(gridX, gridY);
          
          if (tetromino) {
            // Toggle this tetromino in the selection
            gameboard.toggleTetromino(gridX, gridY);
          } else {
            // Tapped on empty space - try to clear the selection
            gameboard.clearSelection();
          }
        }
      }
      
      // Reset dragging flag
      isDraggingRef.current = false;
    }
  };
  
  // Generate a new tetromino pair to add to selection
  const handleAddTetrominoPair = () => {
    const gameboard = gameboardRef.current;
    
    // Make devSlider values available to the Gameboard class
    window.devSlider0Value = devSlider0Value;
    window.devSlider1Value = devSlider1Value;
    
    // Create two new tetrominos and add them to selection
    gameboard.createTetrominoPairInSelection();
  };
  
  // Button event handlers
  const handleRotateClockwise = () => {
    gameboardRef.current.rotateSelection(true);
  };
  
  const handleRotateCounterClockwise = () => {
    gameboardRef.current.rotateSelection(false);
  };
  
  const handleClone = () => {
    const gameboard = gameboardRef.current;
    
    if (gameboard.hasSelection()) {
      // Try to clone the entire selection
      gameboard.cloneSelection();
    } else {
      // No selection - try to clone one under the mouse
      const { x, y } = mouseRef.current;
      const [gridX, gridY] = getMouseGridPosition(x, y);
      
      const tetromino = gameboard.getOccupant(gridX, gridY);
      if (tetromino) {
        // Toggle (select) the tetromino first
        if (gameboard.toggleTetromino(gridX, gridY)) {
          // Then attempt to clone
          gameboard.cloneSelection();
        }
      }
    }
  };
  
  const handleDelete = () => {
    const gameboard = gameboardRef.current;
    
    if (gameboard.hasSelection()) {
      // Just clear the selection without trying to place
      gameboard.selectedTetrominos = [];
      gameboard.anchorTetromino = null;
      gameboard.referenceMouseGridLocation = null;
    }
  };
  
  // Handle button clicks for clumpify
  const handleClumpify = () => {
    const gameboard = gameboardRef.current;
    
    // Make devSlider values available to the Gameboard class
    window.devSlider0Value = devSlider0Value;
    window.devSlider1Value = devSlider1Value;
    
    if (gameboard.hasSelection()) {
      gameboard.clumpify();
    }
  };

  // Draw score
  const drawScore = (ctx) => {
    const gameboard = gameboardRef.current;
    
    // Top right corner
    ctx.fillStyle = '#FFFFFF'; // Changed to white
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${gameboard.score}`, ctx.canvas.width - 20, 20);
  };
  
  // Rendering functions
  const render = (ctx, width, height) => {
    const gameboard = gameboardRef.current;
    const camera = cameraRef.current;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid
    drawGrid(ctx, width, height);
    
    // Draw tetrominoes
    drawTetrominoes(ctx, width, height);
    
    // Draw adjacency indicators
    drawAdjacencyIndicators(ctx, width, height);
    
    // Draw selected tetrominos
    if (gameboard.hasSelection()) {
      drawSelectedTetromino(ctx, width, height);
    }
    
    // Draw score
    drawScore(ctx);
  };
  
  const drawGrid = (ctx, width, height) => {
    const camera = cameraRef.current;
    
    // Determine visible grid range
    const [minX, minY] = camera.screenToWorld(0, 0, width, height);
    const [maxX, maxY] = camera.screenToWorld(width, height, width, height);
    
    const minGridX = Math.max(0, Math.floor(minX / GRID_SIZE) - 1);
    const minGridY = Math.max(0, Math.floor(minY / GRID_SIZE) - 1);
    const maxGridX = Math.min(BOARD_WIDTH, Math.floor(maxX / GRID_SIZE) + 2);
    const maxGridY = Math.min(BOARD_HEIGHT, Math.floor(maxY / GRID_SIZE) + 2);
    
    ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';  // Darker gray lines for black background
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let i = minGridX; i <= maxGridX; i++) {
      const worldX = i * GRID_SIZE;
      const [sx1, sy1] = camera.worldToScreen(worldX, minGridY * GRID_SIZE, width, height);
      const [sx2, sy2] = camera.worldToScreen(worldX, maxGridY * GRID_SIZE, width, height);
      
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let j = minGridY; j <= maxGridY; j++) {
      const worldY = j * GRID_SIZE;
      const [sx1, sy1] = camera.worldToScreen(minGridX * GRID_SIZE, worldY, width, height);
      const [sx2, sy2] = camera.worldToScreen(maxGridX * GRID_SIZE, worldY, width, height);
      
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }
  };
  
  const drawTetrominoes = (ctx, width, height) => {
    const gameboard = gameboardRef.current;
    const camera = cameraRef.current;
    
    // Determine visible grid range
    const [minX, minY] = camera.screenToWorld(0, 0, width, height);
    const [maxX, maxY] = camera.screenToWorld(width, height, width, height);
    
    const minGridX = Math.max(0, Math.floor(minX / GRID_SIZE) - 1);
    const minGridY = Math.max(0, Math.floor(minY / GRID_SIZE) - 1);
    const maxGridX = Math.min(BOARD_WIDTH, Math.floor(maxX / GRID_SIZE) + 2);
    const maxGridY = Math.min(BOARD_HEIGHT, Math.floor(maxY / GRID_SIZE) + 2);
    
    // Track already rendered tetrominoes
    const renderedTetrominoes = new Set();
    
    // Draw each tetromino in the visible area
    for (let i = minGridX; i < maxGridX; i++) {
      for (let j = minGridY; j < maxGridY; j++) {
        const tetromino = gameboard.getOccupant(i, j);
        
        if (tetromino && !renderedTetrominoes.has(tetromino)) {
          renderedTetrominoes.add(tetromino);
          
          // Draw squares
          const squares = tetromino.getSquares();
          for (const [squareI, squareJ] of squares) {
            const worldX = squareI * GRID_SIZE;
            const worldY = squareJ * GRID_SIZE;
            
            const [sx, sy] = camera.worldToScreen(worldX, worldY, width, height);
            const size = GRID_SIZE * camera.zoom;
            
            // Use active or inactive color based on state
            ctx.fillStyle = tetromino.active ? tetromino.color : tetromino.inactiveColor;
            ctx.fillRect(sx, sy, size, size);
          }
          
          // Draw border segments
          drawTetrominoBorders(ctx, tetromino, width, height);
        }
      }
    }
  };
  
  const drawTetrominoBorders = (ctx, tetromino, width, height) => {
    const camera = cameraRef.current;
    const gameboard = gameboardRef.current;
    
    // Get border segments
    const borderSegments = tetromino.getBorderSegments();
    
    // If part of a clump, categorize borders as external or internal
    if (tetromino.clumpId) {
      const externalSegments = [];
      const internalSegments = [];
      
      // For each border segment, check if it's between two tetrominos of the same clump
      for (const segment of borderSegments) {
        const [[x1, y1], [x2, y2]] = segment;
        
        // For each segment, the middle point is a good place to check for adjacency
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Find which direction this edge is facing
        const dx = x2 - x1;
        const dy = y2 - y1;
        
        // Determine the normal direction (perpendicular to the edge)
        let normalX = 0, normalY = 0;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal edge - normal points vertically
          normalX = 0;
          normalY = dx > 0 ? -1 : 1;
        } else {
          // Vertical edge - normal points horizontally
          normalX = dy > 0 ? 1 : -1;
          normalY = 0;
        }
        
        // Check the cells on both sides of the edge
        const check1X = Math.floor(midX + normalX * 0.5);
        const check1Y = Math.floor(midY + normalY * 0.5);
        const check2X = Math.floor(midX - normalX * 0.5);
        const check2Y = Math.floor(midY - normalY * 0.5);
        
        // Get occupants of both cells
        const occupant1 = gameboard.getOccupant(check1X, check1Y);
        const occupant2 = gameboard.getOccupant(check2X, check2Y);
        
        // If either is not part of the same clump, this is an external border
        const isExternalBorder = (
          !occupant1 || 
          !occupant2 || 
          occupant1.clumpId !== tetromino.clumpId || 
          occupant2.clumpId !== tetromino.clumpId
        );
        
        if (isExternalBorder) {
          externalSegments.push(segment);
        } else {
          internalSegments.push(segment);
        }
      }
      
      // Draw external borders with full opacity
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1.0;
      
      for (const [[x1, y1], [x2, y2]] of externalSegments) {
        // Convert to screen coordinates
        const [sx1, sy1] = camera.worldToScreen(
          x1 * GRID_SIZE, y1 * GRID_SIZE, width, height
        );
        const [sx2, sy2] = camera.worldToScreen(
          x2 * GRID_SIZE, y2 * GRID_SIZE, width, height
        );
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
      
      // Draw internal borders with 25% opacity
      ctx.globalAlpha = 0.25;
      
      for (const [[x1, y1], [x2, y2]] of internalSegments) {
        // Convert to screen coordinates
        const [sx1, sy1] = camera.worldToScreen(
          x1 * GRID_SIZE, y1 * GRID_SIZE, width, height
        );
        const [sx2, sy2] = camera.worldToScreen(
          x2 * GRID_SIZE, y2 * GRID_SIZE, width, height
        );
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
      
      // Reset alpha
      ctx.globalAlpha = 1.0;
    } else {
      // For regular tetrominos, draw all borders normally
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      
      for (const [[x1, y1], [x2, y2]] of borderSegments) {
        // Convert to screen coordinates
        const [sx1, sy1] = camera.worldToScreen(
          x1 * GRID_SIZE, y1 * GRID_SIZE, width, height
        );
        const [sx2, sy2] = camera.worldToScreen(
          x2 * GRID_SIZE, y2 * GRID_SIZE, width, height
        );
        
        // Draw line
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    }
  };
  
  // Draw selected tetromino
  const drawSelectedTetromino = (ctx, width, height) => {
    const gameboard = gameboardRef.current;
    const camera = cameraRef.current;
    
    // Draw each selected tetromino
    for (const tetromino of gameboard.selectedTetrominos) {
      // Draw with a very pale color (almost white)
      ctx.globalAlpha = 1.0;
      
      // Draw squares
      const squares = tetromino.getSquares();
      for (const [squareI, squareJ] of squares) {
        const worldX = squareI * GRID_SIZE;
        const worldY = squareJ * GRID_SIZE;
        
        const [sx, sy] = camera.worldToScreen(worldX, worldY, width, height);
        const size = GRID_SIZE * camera.zoom;
        
        // Draw a very pale version of the tetromino's color
        const baseColor = tetromino.color;
        try {
          // Extract RGB values and make them very pale
          const r = parseInt(baseColor.slice(1, 3), 16);
          const g = parseInt(baseColor.slice(3, 5), 16);
          const b = parseInt(baseColor.slice(5, 7), 16);
          
          // Mix with white (90% white, 10% original color)
          const paleR = Math.round(r * 0.1 + 255 * 0.9);
          const paleG = Math.round(g * 0.1 + 255 * 0.9);
          const paleB = Math.round(b * 0.1 + 255 * 0.9);
          
          ctx.fillStyle = `rgb(${paleR}, ${paleG}, ${paleB})`;
        } catch (e) {
          // Fallback to white if there's any error parsing the color
          ctx.fillStyle = '#F0F0F0';
        }
        
        ctx.fillRect(sx, sy, size, size);
      }
      
      // Draw border segments
      drawTetrominoBorders(ctx, tetromino, width, height);
    }
    
    // Reset opacity
    ctx.globalAlpha = 1.0;
  };
  
  const drawAdjacencyIndicators = (ctx, width, height) => {
    const gameboard = gameboardRef.current;
    const camera = cameraRef.current;
    
    // Find visible tetrominos with dependencies
    const visibleTetrominos = new Set();
    
    // Determine visible grid range
    const [minX, minY] = camera.screenToWorld(0, 0, width, height);
    const [maxX, maxY] = camera.screenToWorld(width, height, width, height);
    
    const minGridX = Math.max(0, Math.floor(minX / GRID_SIZE) - 1);
    const minGridY = Math.max(0, Math.floor(minY / GRID_SIZE) - 1);
    const maxGridX = Math.min(BOARD_WIDTH, Math.floor(maxX / GRID_SIZE) + 2);
    const maxGridY = Math.min(BOARD_HEIGHT, Math.floor(maxY / GRID_SIZE) + 2);
    
    // Gather visible tetrominos
    for (let i = minGridX; i < maxGridX; i++) {
      for (let j = minGridY; j < maxGridY; j++) {
        const tetromino = gameboard.getOccupant(i, j);
        if (tetromino) {
          visibleTetrominos.add(tetromino);
        }
      }
    }
    
    // Track clumps we've already processed (by clumpId)
    const processedClumps = new Set();
    
    // Draw dependency indicators for each tetromino
    for (const tetromino of visibleTetrominos) {
      // For regular tetrominos
      if (!tetromino.clumpId) {
        // Skip if no dependencies or already active
        if (Object.keys(tetromino.dependencies).length === 0 || tetromino.active) {
          continue;
        }
        
        drawTetromonioDependencyIndicators(ctx, tetromino, camera, width, height);
      } 
      // For clumped tetrominos - only process each clump once
      else if (!processedClumps.has(tetromino.clumpId)) {
        // Mark this clump as processed
        processedClumps.add(tetromino.clumpId);
        
        // Skip if active
        if (tetromino.active) {
          continue;
        }
        
        // Get all tetrominos in this clump
        const clumpTetrominos = [];
        for (const t of visibleTetrominos) {
          if (t.clumpId === tetromino.clumpId) {
            clumpTetrominos.push(t);
          }
        }
        
        // Calculate center of mass for the entire clump
        let centerX = 0, centerY = 0;
        for (const t of clumpTetrominos) {
          const [tCenterX, tCenterY] = t.getCenterOfMass();
          centerX += tCenterX;
          centerY += tCenterY;
        }
        centerX /= clumpTetrominos.length;
        centerY /= clumpTetrominos.length;
        
        // Draw dependency indicators for the clump at its center
        drawClumpDependencyIndicators(ctx, tetromino, [centerX, centerY], camera, width, height);
      }
    }
  };
  
  // Helper function to draw dependency indicators for regular tetrominos
  const drawTetromonioDependencyIndicators = (ctx, tetromino, camera, width, height) => {
    // Get center of mass for this tetromino
    const [centerX, centerY] = tetromino.getCenterOfMass();
    
    // Convert to screen coordinates
    const [screenX, screenY] = camera.worldToScreen(
      centerX * GRID_SIZE, centerY * GRID_SIZE, width, height
    );
    
    // Set circle size
    const circleRadius = 5.6 * camera.zoom;
    const circleSpacing = 15 * camera.zoom;
    
    // Get unsatisfied dependencies
    const unsatisfiedDependencies = [];
    for (const [species, requiredCount] of Object.entries(tetromino.dependencies)) {
      const currentCount = tetromino.adjacencyDict[species] || 0;
      if (currentCount < requiredCount) {
        unsatisfiedDependencies.push({
          species,
          remaining: requiredCount - currentCount
        });
      }
    }
    
    // Only draw indicators for unsatisfied dependencies
    unsatisfiedDependencies.sort((a, b) => b.remaining - a.remaining); // Sort by most needed first
    
    // Limit indicators for performance
    const MAX_INDICATORS = 6;
    const indicatorsToDraw = unsatisfiedDependencies.slice(0, MAX_INDICATORS);
    
    // Position indicators in rows of 3
    for (let i = 0; i < indicatorsToDraw.length; i++) {
      const { species, remaining } = indicatorsToDraw[i];
      
      // Use active color for self-dependencies, otherwise use normal color
      const color = species === tetromino.species 
        ? tetromino.color  // Active color for self-dependencies
        : Tetromino.TETROMINOES[species].color;
      
      // Calculate position
      const row = Math.floor(i / 3);
      const col = i % 3;
      
      const xOffset = (col - 1) * circleSpacing;
      const yOffset = -row * circleSpacing;
      
      // Add 1 grid space to the right
      const gridOffsetX = GRID_SIZE * camera.zoom;
      
      // Draw circle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(
        screenX + xOffset + gridOffsetX,
        screenY + yOffset + GRID_SIZE * camera.zoom * 0.5,
        circleRadius,
        0, 2 * Math.PI
      );
      ctx.fill();
      
      // Use white text for blue circles, black for others
      if (color === '#0000FF') {
        ctx.fillStyle = '#FFFFFF'; // White text for blue
      } else {
        ctx.fillStyle = '#000000'; // Black text for other colors
      }
      
      ctx.font = `${Math.max(9 * camera.zoom, 9)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        remaining.toString(),
        screenX + xOffset + gridOffsetX,
        screenY + yOffset + GRID_SIZE * camera.zoom * 0.5
      );
    }
  };
  
  // Helper function to draw dependency indicators for clumps
  const drawClumpDependencyIndicators = (ctx, tetromino, centerPos, camera, width, height) => {
    // Convert to screen coordinates
    const [screenX, screenY] = camera.worldToScreen(
      centerPos[0] * GRID_SIZE, centerPos[1] * GRID_SIZE, width, height
    );
    
    // Use 2.5x size for clump indicators
    const circleRadius = 5.6 * camera.zoom * 2.5;
    const circleSpacing = 15 * camera.zoom * 2.5;
    
    // Get unsatisfied dependencies from the clump
    const unsatisfiedDependencies = [];
    for (const [species, requiredCount] of Object.entries(tetromino.clumpDependencies)) {
      const currentCount = tetromino.clumpAdjacencyDict[species] || 0;
      if (currentCount < requiredCount) {
        unsatisfiedDependencies.push({
          species,
          remaining: requiredCount - currentCount
        });
      }
    }
    
    // Only draw indicators for unsatisfied dependencies
    unsatisfiedDependencies.sort((a, b) => b.remaining - a.remaining); // Sort by most needed first
    
    // Limit indicators for performance
    const MAX_INDICATORS = 6;
    const indicatorsToDraw = unsatisfiedDependencies.slice(0, MAX_INDICATORS);
    
    // Position indicators in rows of 3
    for (let i = 0; i < indicatorsToDraw.length; i++) {
      const { species, remaining } = indicatorsToDraw[i];
      
      // Use species color
      const color = Tetromino.TETROMINOES[species].color;
      
      // Calculate position
      const row = Math.floor(i / 3);
      const col = i % 3;
      
      const xOffset = (col - 1) * circleSpacing;
      const yOffset = -row * circleSpacing;
      
      // Draw circle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(
        screenX + xOffset,
        screenY + yOffset,
        circleRadius,
        0, 2 * Math.PI
      );
      ctx.fill();
      
      // Use white text for blue circles, black for others
      if (color === '#0000FF') {
        ctx.fillStyle = '#FFFFFF'; // White text for blue
      } else {
        ctx.fillStyle = '#000000'; // Black text for other colors
      }
      
      ctx.font = `${Math.max(16 * camera.zoom, 16)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        remaining.toString(),
        screenX + xOffset,
        screenY + yOffset
      );
    }
  };
  
  // FPS counter removed

  // Pan the view in a direction
  const panView = (dx, dy) => {
    const camera = cameraRef.current;
    const panAmount = 20; // Pixels to pan per keypress
    
    // Convert screen movement to world movement
    const worldDx = (dx * panAmount) / camera.zoom;
    const worldDy = (dy * panAmount) / camera.zoom;
    
    // Move camera
    camera.position[0] += worldDx;
    camera.position[1] += worldDy;
  };
  
  // Add keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if touch device is detected (mobile)
      if (touchDeviceDetectedRef.current) return;
      
      // Skip if user is typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      const gameboard = gameboardRef.current;
      
      switch (e.key.toLowerCase()) {
        case 'q':
          // Clone functionality
          handleClone();
          break;
        
        case 'z':
          // Delete functionality
          handleDelete();
          break;
        
        case 'r':
          // Rotate functionality
          if (e.shiftKey) {
            handleRotateCounterClockwise();
          } else {
            handleRotateClockwise();
          }
          break;
        
        case 'g':
          // Clumpify functionality
          handleClumpify();
          break;
        
        // WASD for panning
        case 'w':
          // Pan up
          panView(0, -1);
          break;
        case 'a':
          // Pan left
          panView(-1, 0);
          break;
        case 's':
          // Pan down
          panView(0, 1);
          break;
        case 'd':
          // Pan right
          panView(1, 0);
          break;
      }
    };
    
    // Add the event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Clean up
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  // Effect to adjust canvas size on window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const container = canvas.parentElement;
        if (container) {
          // Set canvas dimensions to match container
          canvas.width = Math.min(container.clientWidth, 1200); // Max width
          canvas.height = Math.min(500, window.innerHeight * 0.7); // Responsive height
        }
      }
    };
    
    // Initial size adjustment
    handleResize();
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-4 bg-gray-100 rounded-lg mb-4">
        <h2 className="text-xl font-bold mb-2">Tetromino Puzzle Game</h2>
        <p className="mb-2">
          Place tetrominos so they satisfy their dependencies. When all pieces are active (bright colored), you score a point and difficulty increases.
        </p>
        <p className="mb-3">
          <strong>Game Modes:</strong> Default: random dependencies. Challenge: dependencies increase over time. Clumps: new pieces spawn each round.
        </p>
        <p className="mb-3">
          <strong>Controls:</strong> Click to select/place, drag to move or pan view, scroll to zoom. Use buttons below to rotate, clone or delete.
        </p>
        <p className="mb-3">
          <strong>Clumps:</strong> Select multiple tetrominos and use the Clumpify button to merge them. Clumps have their own dependency system where:
          <ul className="list-disc ml-6 mt-1">
            <li>Each clump provides a count of 1 for each species it contains</li>
            <li>New clumps require 2 of Species A and devSlider0 value of Species B</li>
            <li>Species with double weight for selection are those in the clump</li>
          </ul>
        </p>
        <p className="mb-3">
          <strong>Board Size:</strong> 200Ã200 grid (expanded by 10Ã) - plenty of room to build complex structures!
        </p>
        
        {/* Game Mode Selection */}
        <div className="flex items-center mb-2">
          <span className="mr-3 font-semibold">Game Mode:</span>
          <div className="flex gap-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4"
                value="default"
                checked={gameMode === 'default'}
                onChange={handleModeChange}
              />
              <span className="ml-2">Default</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4"
                value="challenge"
                checked={gameMode === 'challenge'}
                onChange={handleModeChange}
              />
              <span className="ml-2">Challenge</span>
            </label>
            
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-4 w-4"
                value="clumps"
                checked={gameMode === 'clumps'}
                onChange={handleModeChange}
              />
              <span className="ml-2">Clumps</span>
            </label>
          </div>
        </div>
        
        {/* DevSlider0 - First tetromino dependency count */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Species A dependency count (devSlider0): {devSlider0Value}
          </label>
          <input
            type="range"
            min="0"
            max="15"
            step="1"
            value={devSlider0Value}
            onChange={(e) => setDevSlider0Value(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        
        {/* DevSlider1 - Second tetromino dependency count */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Species B dependency count (devSlider1): {devSlider1Value}
          </label>
          <input
            type="range"
            min="0"
            max="15"
            step="1"
            value={devSlider1Value}
            onChange={(e) => setDevSlider1Value(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
      
      <canvas
        ref={canvasRef}
        width={800}
        height={500}
        className="border border-gray-300 bg-black w-full cursor-pointer touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      />
      
      <div className="flex flex-wrap justify-center gap-2 p-4 bg-gray-100 rounded-lg mt-4">
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleRotateCounterClockwise}
        >
          Rotate âº
        </button>
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleRotateClockwise}
        >
          Rotate â»
        </button>
        <button 
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleClone}
        >
          Clone (Q)
        </button>
        <button 
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleDelete}
        >
          Delete (Z)
        </button>
        <button 
          className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleClumpify}
        >
          Clumpify (G)
        </button>
        <button 
          className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleAddTetrominoPair}
        >
          Add Tetromino Pair
        </button>
      </div>
      
      <div className="mt-3 px-4 pb-2 text-sm text-gray-600">
        <p><strong>Keyboard Controls:</strong> Q: Clone, Z: Delete, R: Rotate CW, Shift+R: Rotate CCW, G: Clumpify, WASD: Pan View</p>
      </div>
    </div>
  );
};

export default TetrominoGame;
