export class GameLogic {
  constructor() {
    this.gameStates = new Map();
    this.gameSettings = new Map();
  }

  initializeGame(lobbyId, players) {
    const gameState = {
      lobbyId,
      players: players.map(player => ({
        id: player.id,
        name: player.name,
        score: 0,
        position: { x: 0, y: 0 },
        status: 'active',
        lastInput: null,
        inputHistory: []
      })),
      gameData: {
        level: 1,
        timeElapsed: 0,
        objectives: [],
        powerUps: [],
        obstacles: []
      },
      status: 'playing',
      startTime: Date.now(),
      lastUpdate: Date.now()
    };

    this.gameStates.set(lobbyId, gameState);
    this.gameSettings.set(lobbyId, {
      gameType: 'default',
      difficulty: 'normal',
      timeLimit: null,
      scoreLimit: null
    });

    console.log(`Game initialized for lobby ${lobbyId} with ${players.length} players`);
    return gameState;
  }

  processInput(lobbyId, playerId, inputData) {
    const gameState = this.gameStates.get(lobbyId);
    
    if (!gameState) {
      throw new Error('Game not found');
    }

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found in game');
    }

    // Update player's last input and add to history
    player.lastInput = {
      ...inputData,
      timestamp: Date.now()
    };
    
    player.inputHistory.push(player.lastInput);
    
    // Keep only last 10 inputs in history
    if (player.inputHistory.length > 10) {
      player.inputHistory.shift();
    }

    // Process different types of input
    this.handlePlayerInput(gameState, player, inputData);

    // Update game state timestamp
    gameState.lastUpdate = Date.now();
    gameState.gameData.timeElapsed = gameState.lastUpdate - gameState.startTime;

    // Check for game end conditions
    this.checkGameEndConditions(gameState);

    return gameState;
  }

  handlePlayerInput(gameState, player, inputData) {
    const { type, data } = inputData;

    switch (type) {
      case 'movement':
        this.handleMovementInput(player, data);
        break;
      case 'action':
        this.handleActionInput(gameState, player, data);
        break;
      case 'gesture':
        this.handleGestureInput(player, data);
        break;
      case 'button':
        this.handleButtonInput(gameState, player, data);
        break;
      case 'joystick':
        this.handleJoystickInput(player, data);
        break;
      case 'accelerometer':
        this.handleAccelerometerInput(player, data);
        break;
      default:
        console.log(`Unknown input type: ${type}`);
    }
  }

  handleMovementInput(player, data) {
    const { direction, intensity = 1 } = data;
    const speed = 5 * intensity;

    switch (direction) {
      case 'up':
        player.position.y = Math.max(0, player.position.y - speed);
        break;
      case 'down':
        player.position.y = Math.min(100, player.position.y + speed);
        break;
      case 'left':
        player.position.x = Math.max(0, player.position.x - speed);
        break;
      case 'right':
        player.position.x = Math.min(100, player.position.x + speed);
        break;
    }
  }

  handleActionInput(gameState, player, data) {
    const { action, target } = data;

    switch (action) {
      case 'jump':
        // Handle jump action
        break;
      case 'shoot':
        // Handle shoot action
        break;
      case 'interact':
        // Handle interaction with objects
        break;
      case 'use_powerup':
        // Handle power-up usage
        break;
    }
  }

  handleGestureInput(player, data) {
    const { gesture, confidence } = data;
    
    if (confidence > 0.7) { // Only process high-confidence gestures
      switch (gesture) {
        case 'swipe_left':
        case 'swipe_right':
        case 'swipe_up':
        case 'swipe_down':
          // Handle swipe gestures
          break;
        case 'tap':
        case 'double_tap':
        case 'long_press':
          // Handle tap gestures
          break;
      }
    }
  }

  handleButtonInput(gameState, player, data) {
    const { button, pressed, duration } = data;

    // Map button inputs to game actions
    const buttonMap = {
      'A': 'jump',
      'B': 'shoot',
      'X': 'interact',
      'Y': 'special',
      'start': 'pause',
      'select': 'menu'
    };

    const action = buttonMap[button];
    if (action && pressed) {
      this.handleActionInput(gameState, player, { action });
    }
  }

  handleJoystickInput(player, data) {
    const { x, y, magnitude } = data;
    
    if (magnitude > 0.1) { // Dead zone
      player.position.x = Math.max(0, Math.min(100, player.position.x + x * 5));
      player.position.y = Math.max(0, Math.min(100, player.position.y + y * 5));
    }
  }

  handleAccelerometerInput(player, data) {
    const { x, y, z } = data;
    
    // Use accelerometer data for tilt-based movement
    const sensitivity = 2;
    player.position.x = Math.max(0, Math.min(100, player.position.x + x * sensitivity));
    player.position.y = Math.max(0, Math.min(100, player.position.y + y * sensitivity));
  }

  checkGameEndConditions(gameState) {
    const settings = this.gameSettings.get(gameState.lobbyId);
    
    if (settings.timeLimit && gameState.gameData.timeElapsed >= settings.timeLimit) {
      this.endGame(gameState, 'time_limit');
    } else if (settings.scoreLimit) {
      const winner = gameState.players.find(p => p.score >= settings.scoreLimit);
      if (winner) {
        this.endGame(gameState, 'score_limit', winner);
      }
    }
  }

  endGame(gameState, reason, winner = null) {
    gameState.status = 'ended';
    gameState.endTime = Date.now();
    gameState.endReason = reason;
    gameState.winner = winner;

    console.log(`Game ended in lobby ${gameState.lobbyId}: ${reason}`);
  }

  getGameState(lobbyId) {
    return this.gameStates.get(lobbyId);
  }

  pauseGame(lobbyId) {
    const gameState = this.gameStates.get(lobbyId);
    if (gameState) {
      gameState.status = 'paused';
      gameState.pauseTime = Date.now();
    }
  }

  resumeGame(lobbyId) {
    const gameState = this.gameStates.get(lobbyId);
    if (gameState && gameState.status === 'paused') {
      gameState.status = 'playing';
      const pauseDuration = Date.now() - gameState.pauseTime;
      gameState.startTime += pauseDuration; // Adjust start time to account for pause
      delete gameState.pauseTime;
    }
  }

  updateGameSettings(lobbyId, settings) {
    this.gameSettings.set(lobbyId, { ...this.gameSettings.get(lobbyId), ...settings });
  }

  cleanupGame(lobbyId) {
    this.gameStates.delete(lobbyId);
    this.gameSettings.delete(lobbyId);
    console.log(`Game state cleaned up for lobby ${lobbyId}`);
  }
}