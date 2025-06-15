import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';

export class LobbyManager {
  constructor() {
    this.lobbies = new Map();
    this.playerToLobby = new Map(); // Track which lobby each player is in
  }

  generateLobbyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 6 }, () => 
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join('');
    } while (this.findLobbyByCode(code));
    return code;
  }

  async createLobby(hostSocketId, options = {}) {
    const lobbyId = uuidv4();
    const lobbyCode = this.generateLobbyCode();
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const connectionUrl = `${baseUrl}/controller?lobby=${lobbyCode}`;

    // Generate QR code
    let qrCodeData;
    try {
      qrCodeData = await QRCode.toDataURL(connectionUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      qrCodeData = null;
    }

    const lobby = {
      id: lobbyId,
      code: lobbyCode,
      host: hostSocketId,
      players: [],
      gameStatus: 'waiting', // waiting, playing, paused, ended
      createdAt: Date.now(),
      maxPlayers: options.maxPlayers || 8,
      gameType: options.gameType || 'default',
      settings: options.settings || {},
      connectionUrl,
      qrCodeData
    };

    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(hostSocketId, lobbyId);

    // Add host as first player
    lobby.players.push({
      id: hostSocketId,
      name: options.hostName || 'Host',
      deviceType: 'console',
      isHost: true,
      joinedAt: Date.now(),
      status: 'connected'
    });

    console.log(`Lobby created: ${lobbyId} (${lobbyCode}) by ${hostSocketId}`);
    return lobby;
  }

  findLobbyByCode(code) {
    for (const lobby of this.lobbies.values()) {
      if (lobby.code === code) {
        return lobby;
      }
    }
    return null;
  }

  joinLobby(lobbyCode, socketId, playerName, deviceType = 'phone') {
    const lobby = this.findLobbyByCode(lobbyCode);
    
    if (!lobby) {
      return { success: false, message: 'Lobby not found' };
    }

    if (lobby.players.length >= lobby.maxPlayers) {
      return { success: false, message: 'Lobby is full' };
    }

    if (lobby.gameStatus === 'ended') {
      return { success: false, message: 'Game has ended' };
    }

    // Check if player is already in the lobby
    const existingPlayer = lobby.players.find(p => p.id === socketId);
    if (existingPlayer) {
      return { success: false, message: 'Already in lobby' };
    }

    // Remove player from any other lobby first
    this.removePlayerFromAllLobbies(socketId);

    const player = {
      id: socketId,
      name: playerName,
      deviceType,
      isHost: false,
      joinedAt: Date.now(),
      status: 'connected'
    };

    lobby.players.push(player);
    this.playerToLobby.set(socketId, lobby.id);

    console.log(`Player ${playerName} (${socketId}) joined lobby ${lobby.id}`);
    return { success: true, lobby, isHost: false };
  }

  leaveLobby(lobbyId, socketId) {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      return { success: false, message: 'Lobby not found' };
    }

    const playerIndex = lobby.players.findIndex(p => p.id === socketId);
    if (playerIndex === -1) {
      return { success: false, message: 'Player not in lobby' };
    }

    const player = lobby.players[playerIndex];
    lobby.players.splice(playerIndex, 1);
    this.playerToLobby.delete(socketId);

    // If host left, either promote someone else or close lobby
    if (player.isHost) {
      if (lobby.players.length > 0) {
        // Promote first remaining player to host
        lobby.players[0].isHost = true;
        lobby.host = lobby.players[0].id;
        console.log(`Host transferred to ${lobby.players[0].name} in lobby ${lobbyId}`);
      } else {
        // No players left, close lobby
        this.lobbies.delete(lobbyId);
        console.log(`Lobby ${lobbyId} closed - no players remaining`);
        return { success: true, lobby: null };
      }
    }

    console.log(`Player ${player.name} (${socketId}) left lobby ${lobbyId}`);
    return { success: true, lobby };
  }

  removePlayerFromAllLobbies(socketId) {
    const currentLobbyId = this.playerToLobby.get(socketId);
    if (currentLobbyId) {
      this.leaveLobby(currentLobbyId, socketId);
    }
  }

  getLobby(lobbyId) {
    return this.lobbies.get(lobbyId);
  }

  getAllLobbies() {
    const lobbiesArray = Array.from(this.lobbies.values());
    return lobbiesArray.map(lobby => ({
      id: lobby.id,
      code: lobby.code,
      playerCount: lobby.players.length,
      maxPlayers: lobby.maxPlayers,
      gameStatus: lobby.gameStatus,
      gameType: lobby.gameType,
      createdAt: lobby.createdAt
    }));
  }

  updatePlayerStatus(lobbyId, socketId, status) {
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) {
      const player = lobby.players.find(p => p.id === socketId);
      if (player) {
        player.status = status;
        return true;
      }
    }
    return false;
  }

  // Cleanup inactive lobbies (can be called periodically)
  cleanupInactiveLobbies(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    const toDelete = [];

    for (const [lobbyId, lobby] of this.lobbies.entries()) {
      if (now - lobby.createdAt > maxAge && lobby.gameStatus === 'waiting') {
        toDelete.push(lobbyId);
      }
    }

    toDelete.forEach(lobbyId => {
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        lobby.players.forEach(player => {
          this.playerToLobby.delete(player.id);
        });
        this.lobbies.delete(lobbyId);
        console.log(`Cleaned up inactive lobby: ${lobbyId}`);
      }
    });

    return toDelete.length;
  }
}