import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Gamepad2, Crown, Lock, Users, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Code, Monitor, AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, sessionHelpers, deviceHelpers, deviceInputHelpers } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';

interface PhoneControllerProps {
  lobbyCode: string;
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

const PhoneController: React.FC<PhoneControllerProps> = ({ lobbyCode }) => {
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameStatus, setGameStatus] = useState<'waiting' | 'editor_selection'>('waiting');
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [connectionError, setConnectionError] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLobbyLocked, setIsLobbyLocked] = useState(false);
  const [lastNavigationTime, setLastNavigationTime] = useState(0);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  
  const navigate = useNavigate();

  // WebRTC integration for phone controller
  const webrtc = useWebRTC({
    sessionId: currentSessionId,
    deviceId: myPlayerId,
    isHost: false,
    onMessage: (message, fromDeviceId) => {
      console.log('📩 [PHONE] WebRTC message from console:', message.type);
    },
    enabled: currentSessionId !== '' && myPlayerId !== '' && isLobbyLocked
  });

  // Load session and check if it exists
  const loadSession = async () => {
    console.log('🔍 [PHONE] Loading session for lobby code:', lobbyCode);
    setIsLoadingSession(true);
    setConnectionError('');
    
    try {
      const session = await sessionHelpers.getSessionByCode(lobbyCode);
      
      if (!session) {
        console.error('❌ [PHONE] Session not found for lobby code:', lobbyCode);
        setConnectionError(`No active game found with lobby code "${lobbyCode}". Please check the code or ask the host to create a new game.`);
        setIsLoadingSession(false);
        return null;
      }

      console.log('✅ [PHONE] Session loaded:', session.id.slice(-8));
      setCurrentSessionId(session.id);
      const wasLocked = isLobbyLocked;
      const nowLocked = session.is_locked || false;
      
      setIsLobbyLocked(nowLocked);
      
      if (!wasLocked && nowLocked) {
        console.log('🔒 [PHONE] Lobby locked - switching to editor selection mode');
        setGameStatus('editor_selection');
      } else if (nowLocked) {
        setGameStatus('editor_selection');
      } else {
        setGameStatus('waiting');
      }
      
      setIsLoadingSession(false);
      return session;
    } catch (error) {
      console.error('💥 [PHONE] Error loading session:', error);
      setConnectionError('Failed to connect to the game server. Please check your internet connection and try again.');
      setIsLoadingSession(false);
      return null;
    }
  };

  // Retry loading session
  const retryLoadSession = async () => {
    await loadSession();
  };

  // Load players in the session
  const loadPlayers = async () => {
    if (!currentSessionId) return;

    try {
      const devices = await deviceHelpers.getSessionDevices(currentSessionId);

      // Filter out console device and only show phone controllers
      const mappedPlayers: Player[] = devices
        .filter(device => device.device_type !== 'console' && device.name !== 'Console')
        .map((device) => ({
          id: device.id,
          name: device.name,
          isHost: device.is_host || false
        }));

      setPlayers(mappedPlayers);

      // Check if current player is host
      const myDevice = devices.find(d => d.id === myPlayerId);
      if (myDevice) {
        const amHost = myDevice.is_host || false;
        setIsHost(amHost);
      }
    } catch (error) {
      console.error('💥 [PHONE] Error loading players:', error);
    }
  };

  // Send navigation input
  const sendNavigation = async (direction: string) => {
    if (!currentSessionId || !myPlayerId) return;

    // Throttle navigation to prevent spam
    const currentTime = Date.now();
    if (currentTime - lastNavigationTime < 150) return;

    console.log(`🎮 [PHONE] Sending ${direction} navigation`);

    try {
      // Send structured game_data message for InputRouter compatibility
      const webrtcMessage = {
        type: 'game_data' as const,
        data: {
          dpad: {
            directionchange: {
              key: direction,
              pressed: true
            }
          }
        }
      };

      // Find console device to send WebRTC message to
      const { data: consoleDevice, error: consoleError } = await supabase
        .from('devices')
        .select('id')
        .eq('session_id', currentSessionId)
        .eq('name', 'Console')
        .single();

      if (consoleError) {
        console.error('❌ [PHONE] Error finding console device:', consoleError);
      }

      let webrtcSent = false;
      if (consoleDevice && webrtc.status.isInitialized) {
        webrtcSent = webrtc.sendMessage(consoleDevice.id, webrtcMessage);
        if (webrtcSent) {
          console.log('✅ [PHONE] WebRTC navigation sent to console');
        }
      }

      // Store input in device_inputs table
      const inputCreated = await deviceInputHelpers.createDeviceInput(
        currentSessionId,
        myPlayerId,
        'dpad',
        direction,
        {
          pressed: true,
          direction: direction,
          playerName: playerName
        },
        webrtcSent ? 'webrtc' : 'supabase',
        new Date(currentTime).toISOString()
      );

      if (!inputCreated) {
        console.error('❌ [PHONE] Failed to store input in device_inputs table');
      }

      setLastNavigationTime(currentTime);
      
    } catch (error) {
      console.error('💥 [PHONE] Error sending navigation:', error);
    }
  };

  // Send selection input
  const sendSelection = async () => {
    if (!currentSessionId || !myPlayerId) return;

    console.log('🎯 [PHONE] Sending selection');

    try {
      // Send structured game_data message for InputRouter compatibility
      const webrtcMessage = {
        type: 'game_data' as const,
        data: {
          button: {
            a: {
              pressed: true
            }
          }
        }
      };

      // Find console device to send WebRTC message to
      const { data: consoleDevice, error: consoleError } = await supabase
        .from('devices')
        .select('id')
        .eq('session_id', currentSessionId)
        .eq('name', 'Console')
        .single();

      if (consoleError) {
        console.error('❌ [PHONE] Error finding console device:', consoleError);
      }

      let webrtcSent = false;
      if (consoleDevice && webrtc.status.isInitialized) {
        webrtcSent = webrtc.sendMessage(consoleDevice.id, webrtcMessage);
        if (webrtcSent) {
          console.log('✅ [PHONE] WebRTC selection sent to console');
        }
      }

      // Store input in device_inputs table
      const inputCreated = await deviceInputHelpers.createDeviceInput(
        currentSessionId,
        myPlayerId,
        'button',
        'a',
        {
          pressed: true,
          playerName: playerName
        },
        webrtcSent ? 'webrtc' : 'supabase'
      );

      if (!inputCreated) {
        console.error('❌ [PHONE] Failed to store selection input in device_inputs table');
      }
      
    } catch (error) {
      console.error('💥 [PHONE] Error sending selection:', error);
    }
  };

  useEffect(() => {
    console.log('🚀 [PHONE] PhoneController mounted with lobby code:', lobbyCode);
    loadSession();
  }, [lobbyCode]);

  useEffect(() => {
    if (!currentSessionId || !myPlayerId || !isLobbyLocked) return;

    const attemptConsoleConnection = async () => {
      try {
        // Find console device
        const { data: consoleDevice, error } = await supabase
          .from('devices')
          .select('id')
          .eq('session_id', currentSessionId)
          .eq('name', 'Console')
          .single();

        if (error || !consoleDevice) {
          console.error('❌ [PHONE] Console device not found:', error);
          return;
        }

        console.log('📡 [PHONE] Found console device, attempting WebRTC connection');
        
        if (webrtc.status.isInitialized) {
          await webrtc.connectToDevice(consoleDevice.id);
        }
      } catch (error) {
        console.error('💥 [PHONE] Error in console connection:', error);
      }
    };

    // Initial attempt after 2 seconds
    const initialTimeout = setTimeout(attemptConsoleConnection, 2000);
    
    // Retry every 10 seconds if not connected
    const retryInterval = setInterval(() => {
      if (webrtc.status.connectedDevices.length === 0) {
        attemptConsoleConnection();
      }
    }, 10000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(retryInterval);
    };
  }, [currentSessionId, myPlayerId, isLobbyLocked, webrtc.status.isInitialized]);

  const joinLobby = async () => {
    if (!playerName.trim() || !lobbyCode) return;

    console.log('🚪 [PHONE] Attempting to join lobby with name:', playerName.trim());
    try {
      const session = await loadSession();
      if (!session) return;

      // Check if lobby is full (max 4 players, excluding console)
      const existingDevices = await deviceHelpers.getSessionDevices(session.id);

      if (!existingDevices) {
        console.error('❌ [PHONE] Failed to get existing devices');
        setConnectionError('Failed to check lobby capacity');
        return;
      }

      // Count only phone controllers (exclude console)
      const phoneControllers = existingDevices.filter(device => 
        device.device_type !== 'console' && device.name !== 'Console'
      );
      
      if (phoneControllers.length >= 4) {
        console.log('🚫 [PHONE] Lobby is full');
        setConnectionError('Lobby is full (max 4 players)');
        return;
      }

      // First phone controller becomes host (not including console)
      const isFirstPlayer = phoneControllers.length === 0;

      const device = await deviceHelpers.createDevice(
        session.id,
        playerName.trim(),
        'phone',
        isFirstPlayer
      );

      if (!device) {
        console.error('❌ [PHONE] Device creation failed');
        setConnectionError('Failed to join lobby');
        return;
      }

      console.log('✅ [PHONE] Successfully joined lobby');
      setMyPlayerId(device.id);
      setIsJoined(true);
      setIsHost(isFirstPlayer);
      setConnectionError('');
    } catch (error) {
      console.error('💥 [PHONE] Exception during lobby join:', error);
      setConnectionError(`Failed to join lobby: ${error.message || 'Unknown error'}`);
    }
  };

  const lockLobby = async () => {
    if (!isHost || !currentSessionId) return;

    console.log('🔒 [PHONE] Host attempting to lock lobby');
    try {
      const success = await sessionHelpers.lockSession(currentSessionId);
      
      if (!success) {
        console.error('❌ [PHONE] Failed to lock lobby');
        return;
      }

      setIsLobbyLocked(true);
      setGameStatus('editor_selection');
      console.log('✅ [PHONE] Lobby locked successfully');
    } catch (error) {
      console.error('💥 [PHONE] Error locking lobby:', error);
    }
  };

  const unlockLobby = async () => {
    if (!isHost || !currentSessionId) return;

    console.log('🔓 [PHONE] Host attempting to unlock lobby');
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_locked: false })
        .eq('id', currentSessionId);

      if (error) {
        console.error('❌ [PHONE] Error unlocking lobby:', error);
        return;
      }

      setIsLobbyLocked(false);
      setGameStatus('waiting');
      console.log('✅ [PHONE] Lobby unlocked successfully');
    } catch (error) {
      console.error('💥 [PHONE] Error unlocking lobby:', error);
    }
  };

  // Show session not found error
  if (connectionError && !isJoined && !isLoadingSession) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <button 
          onClick={() => navigate('/')}
          className="mb-8 p-2 hover:bg-gray-800 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="flex flex-col items-center justify-center min-h-[80vh]">
          <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mb-8">
            <AlertCircle size={40} className="text-white" />
          </div>
          
          <h1 className="text-3xl font-bold mb-4 text-red-300">Game Not Found</h1>
          
          <div className="w-full max-w-md space-y-6">
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-red-300 text-sm">
              <div className="font-medium mb-2">Connection Error:</div>
              <div>{connectionError}</div>
            </div>

            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <h3 className="font-medium text-gray-300 mb-3">Troubleshooting:</h3>
              <ul className="text-sm text-gray-400 space-y-2">
                <li>• Make sure the console game is running</li>
                <li>• Check that the lobby code is correct: <span className="font-mono text-white">{lobbyCode}</span></li>
                <li>• Ask the host to create a new game</li>
                <li>• Verify your internet connection</li>
              </ul>
            </div>

            <div className="space-y-3">
              <button
                onClick={retryLoadSession}
                disabled={isLoadingSession}
                className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  isLoadingSession
                    ? 'bg-gray-700 cursor-not-allowed'
                    : 'bg-indigo-500 hover:bg-indigo-600'
                }`}
              >
                {isLoadingSession ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Checking...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>Try Again</span>
                  </>
                )}
              </button>

              <button
                onClick={() => navigate('/')}
                className="w-full py-3 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <button 
          onClick={() => navigate('/')}
          className="mb-8 p-2 hover:bg-gray-800 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="flex flex-col items-center justify-center min-h-[80vh]">
          <div className="w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center mb-8">
            <Gamepad2 size={40} className="text-white" />
          </div>
          
          <h1 className="text-3xl font-bold mb-8">Join Game</h1>
          
          <div className="w-full max-w-sm space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Lobby Code
              </label>
              <input
                type="text"
                value={lobbyCode}
                readOnly
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-lg font-mono text-center"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Nickname
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your nickname"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-lg"
                maxLength={20}
                onKeyPress={(e) => e.key === 'Enter' && joinLobby()}
              />
            </div>

            {connectionError && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">
                <div className="font-medium mb-1">Connection Error:</div>
                <div>{connectionError}</div>
              </div>
            )}

            {isLoadingSession && (
              <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 text-blue-300 text-sm flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span>Checking game session...</span>
              </div>
            )}

            <button
              onClick={joinLobby}
              disabled={!playerName.trim() || isLoadingSession}
              className={`w-full py-4 rounded-lg text-lg font-medium transition-colors ${
                playerName.trim() && !isLoadingSession
                  ? 'bg-indigo-500 hover:bg-indigo-600' 
                  : 'bg-gray-700 cursor-not-allowed'
              }`}
            >
              {isLoadingSession ? 'Checking Game...' : 'Join Game'}
            </button>

            <div className="text-center text-sm text-gray-400">
              <p>First player to join becomes the host</p>
              <p>Maximum 4 players per lobby</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate('/')}
          className="p-2 hover:bg-gray-800 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <span className="text-lg font-semibold">{playerName}</span>
            {isHost && <Crown size={16} className="text-yellow-400" />}
          </div>
          <div className={`text-sm ${
            gameStatus === 'editor_selection' ? 'text-purple-400' : 'text-indigo-400'
          }`}>
            {isHost ? 'Host' : 'Player'} • {
              gameStatus === 'editor_selection' ? 'Remote Control' : 'Waiting'
            }
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-sm text-green-400">Connected</span>
        </div>
      </div>

      {/* Players List */}
      <div className="mb-6 bg-black/20 rounded-lg p-4 border border-indigo-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-indigo-300" />
          <h3 className="font-semibold">Players ({players.length}/4)</h3>
          {webrtc.status.isInitialized && (
            <div className="ml-auto text-xs text-blue-300">
              WebRTC: {webrtc.status.connectedDevices.length > 0 ? 'Connected' : 'Connecting...'}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-2 bg-indigo-900/30 p-2 rounded border border-indigo-500/20">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-sm">{player.name}</span>
              {player.isHost && <Crown size={12} className="text-yellow-400" />}
            </div>
          ))}
        </div>
      </div>

      {/* Host Controls - Only show in waiting state */}
      {isHost && gameStatus === 'waiting' && (
        <div className="mb-6 bg-purple-900/30 rounded-lg p-4 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Crown size={16} className="text-yellow-400" />
            <h3 className="font-semibold text-yellow-300">Host Controls</h3>
          </div>
          <button
            onClick={lockLobby}
            className="w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 active:bg-purple-700"
          >
            <Lock size={16} />
            Lock Lobby & Start Editor Selection
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Lock the lobby when all players have joined
          </p>
        </div>
      )}

      {/* Editor Selection Mode - TV Remote */}
      {gameStatus === 'editor_selection' && (
        <div className="flex-1">
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-500/20 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Code size={20} className="text-purple-400" />
              <h3 className="text-lg font-semibold">TV Remote Mode</h3>
            </div>
            
            <div className="text-center mb-4">
              <Monitor size={48} className="text-purple-400 mx-auto mb-2" />
              <h2 className="text-xl font-bold">Control the Main Screen</h2>
              <p className="text-sm text-gray-400">Navigate and select editors on the console</p>
            </div>

            {isHost && (
              <div className="mb-4">
                <button
                  onClick={unlockLobby}
                  className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 text-sm transition-colors"
                >
                  Unlock Lobby
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 bg-gray-800/50 p-2 rounded">
                <ChevronLeft size={16} />
                <ChevronRight size={16} />
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-2 bg-indigo-500/20 p-2 rounded">
                <span className="w-4 h-4 bg-indigo-500 rounded text-center text-xs leading-4">A</span>
                <span>Select</span>
              </div>
            </div>
          </div>

          {/* TV Remote Controls */}
          <div className="flex justify-center mb-6">
            <div className="relative w-48 h-48">
              <div className="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-700 shadow-2xl">
                {/* Navigation buttons */}
                <button 
                  onClick={() => sendNavigation('left')}
                  className="absolute left-0 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
                >
                  <ChevronLeft size={20} className="text-white" />
                </button>

                <button 
                  onClick={() => sendNavigation('right')}
                  className="absolute right-0 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
                >
                  <ChevronRight size={20} className="text-white" />
                </button>

                <button 
                  onClick={() => sendNavigation('up')}
                  className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
                >
                  <ChevronUp size={20} className="text-white" />
                </button>

                <button 
                  onClick={() => sendNavigation('down')}
                  className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all"
                >
                  <ChevronDown size={20} className="text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={sendSelection}
              className="p-4 rounded-lg border-2 bg-indigo-500/20 hover:bg-indigo-500/30 active:bg-indigo-500/40 border-indigo-500/30 text-indigo-300 transition-all duration-150 flex flex-col items-center gap-2 active:scale-95"
            >
              <span className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold">A</span>
              <span className="text-sm">Select</span>
            </button>
            
            <button 
              onClick={() => navigate('/')}
              className="p-4 rounded-lg border-2 bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 border-red-500/30 text-red-300 transition-all duration-150 flex flex-col items-center gap-2 active:scale-95"
            >
              <span className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">B</span>
              <span className="text-sm">Exit</span>
            </button>
          </div>
        </div>
      )}

      {/* Waiting State */}
      {gameStatus === 'waiting' && !isHost && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Gamepad2 size={64} className="text-indigo-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Ready to Play!</h2>
            <p className="text-indigo-200 mb-4">Waiting for the host to lock the lobby...</p>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-sm text-purple-300">
              The host will lock the lobby when everyone is ready
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneController;