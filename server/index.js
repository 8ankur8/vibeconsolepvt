import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { LobbyManager } from './modules/LobbyManager.js';
import { GameLogic } from './modules/GameLogic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize modules
const lobbyManager = new LobbyManager();
const gameLogic = new GameLogic();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/lobbies', (req, res) => {
  res.json(lobbyManager.getAllLobbies());
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Lobby Management Events
  socket.on('createLobby', (data) => {
    try {
      const lobby = lobbyManager.createLobby(socket.id, data);
      socket.join(lobby.id);
      
      socket.emit('lobbyCreated', {
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        qrCodeData: lobby.qrCodeData,
        connectionUrl: lobby.connectionUrl
      });

      console.log(`Lobby created: ${lobby.id} by ${socket.id}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('joinLobby', (data) => {
    try {
      const { lobbyCode, playerName, deviceType = 'phone' } = data;
      const result = lobbyManager.joinLobby(lobbyCode, socket.id, playerName, deviceType);
      
      if (result.success) {
        socket.join(result.lobby.id);
        
        // Notify the player they joined successfully
        socket.emit('playerJoined', {
          lobbyId: result.lobby.id,
          playerId: socket.id,
          playerName,
          isHost: result.isHost
        });

        // Notify all clients in the lobby about the new player
        io.to(result.lobby.id).emit('lobbyStateUpdate', {
          lobbyId: result.lobby.id,
          players: result.lobby.players,
          gameStatus: result.lobby.gameStatus,
          playerCount: result.lobby.players.length
        });

        console.log(`Player ${playerName} (${socket.id}) joined lobby ${result.lobby.id}`);
      } else {
        socket.emit('joinError', { message: result.message });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('leaveLobby', (data) => {
    try {
      const { lobbyId } = data;
      const result = lobbyManager.leaveLobby(lobbyId, socket.id);
      
      if (result.success) {
        socket.leave(lobbyId);
        
        // Notify remaining players
        io.to(lobbyId).emit('playerLeft', {
          lobbyId,
          playerId: socket.id,
          remainingPlayers: result.lobby?.players || []
        });

        if (result.lobby) {
          io.to(lobbyId).emit('lobbyStateUpdate', {
            lobbyId,
            players: result.lobby.players,
            gameStatus: result.lobby.gameStatus,
            playerCount: result.lobby.players.length
          });
        }

        console.log(`Player ${socket.id} left lobby ${lobbyId}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Editor Selection Events
  socket.on('editorSelectionMode', (data) => {
    try {
      const { lobbyId } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.host === socket.id) {
        lobby.gameStatus = 'editor_selection';
        
        // Notify all controllers about editor selection mode
        io.to(lobbyId).emit('editorSelectionMode', {
          lobbyId
        });

        console.log(`Editor selection mode activated in lobby ${lobbyId}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('editorNavigation', (data) => {
    try {
      const { lobbyId, playerId, direction, action } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.gameStatus === 'editor_selection') {
        // Broadcast navigation input to the console
        io.to(lobbyId).emit('editorNavigation', {
          lobbyId,
          playerId,
          direction,
          action,
          timestamp: Date.now()
        });

        console.log(`Editor navigation: ${action} ${direction} from ${playerId} in lobby ${lobbyId}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('editorSelectionUpdate', (data) => {
    try {
      const { lobbyId, selectedIndex, selectedEditor, isLocked } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.host === socket.id) {
        // Broadcast selection update to all controllers
        io.to(lobbyId).emit('editorSelectionUpdate', {
          lobbyId,
          selectedIndex,
          selectedEditor,
          isLocked
        });

        console.log(`Editor selection updated in lobby ${lobbyId}: ${selectedEditor?.name}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('editorSelected', (data) => {
    try {
      const { lobbyId, editor, selectedBy } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.host === socket.id) {
        // Broadcast editor selection to all clients
        io.to(lobbyId).emit('editorSelected', {
          lobbyId,
          editor,
          selectedBy
        });

        console.log(`Editor selected in lobby ${lobbyId}: ${editor.name}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Game Events
  socket.on('startGame', (data) => {
    try {
      const { lobbyId } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.host === socket.id) {
        lobby.gameStatus = 'playing';
        gameLogic.initializeGame(lobbyId, lobby.players);
        
        io.to(lobbyId).emit('gameStarted', {
          lobbyId,
          gameState: gameLogic.getGameState(lobbyId)
        });

        console.log(`Game started in lobby ${lobbyId}`);
      } else {
        socket.emit('error', { message: 'Only the host can start the game' });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('playerInput', (data) => {
    try {
      const { lobbyId, inputData } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.gameStatus === 'playing') {
        const gameState = gameLogic.processInput(lobbyId, socket.id, inputData);
        
        // Broadcast updated game state to all players in the lobby
        io.to(lobbyId).emit('gameStateUpdate', {
          lobbyId,
          gameState,
          timestamp: Date.now()
        });

        // Also send the raw input to console for immediate feedback
        io.to(lobbyId).emit('playerInputReceived', {
          lobbyId,
          playerId: socket.id,
          inputData,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('pauseGame', (data) => {
    try {
      const { lobbyId } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.host === socket.id) {
        lobby.gameStatus = 'paused';
        
        io.to(lobbyId).emit('gamePaused', {
          lobbyId,
          gameState: gameLogic.getGameState(lobbyId)
        });

        console.log(`Game paused in lobby ${lobbyId}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('resumeGame', (data) => {
    try {
      const { lobbyId } = data;
      const lobby = lobbyManager.getLobby(lobbyId);
      
      if (lobby && lobby.host === socket.id) {
        lobby.gameStatus = 'playing';
        
        io.to(lobbyId).emit('gameResumed', {
          lobbyId,
          gameState: gameLogic.getGameState(lobbyId)
        });

        console.log(`Game resumed in lobby ${lobbyId}`);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Heartbeat for connection monitoring
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove player from all lobbies
    const lobbies = lobbyManager.getAllLobbies();
    Object.values(lobbies).forEach(lobby => {
      const player = lobby.players.find(p => p.id === socket.id);
      if (player) {
        const result = lobbyManager.leaveLobby(lobby.id, socket.id);
        if (result.success && result.lobby) {
          io.to(lobby.id).emit('playerLeft', {
            lobbyId: lobby.id,
            playerId: socket.id,
            playerName: player.name,
            remainingPlayers: result.lobby.players
          });

          io.to(lobby.id).emit('lobbyStateUpdate', {
            lobbyId: lobby.id,
            players: result.lobby.players,
            gameStatus: result.lobby.gameStatus,
            playerCount: result.lobby.players.length
          });
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 VibeConsole server running on port ${PORT}`);
  console.log(`📱 Console: http://localhost:${PORT}`);
  console.log(`🎮 Controller: http://localhost:${PORT}/controller`);
});