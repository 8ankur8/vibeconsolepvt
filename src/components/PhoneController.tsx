import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Gamepad2, Crown, Lock, Users, Code, Monitor, AlertCircle, RefreshCw, Zap, Database, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, sessionHelpers, deviceHelpers, deviceInputHelpers } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import EditorControlPanel from './EditorControlPanel';

interface PhoneControllerProps {
  lobbyCode: string;
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

interface Editor {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: React.ComponentType<any>;
  color: string;
  bgGradient: string;
  features: string[];
}

const editors: Editor[] = [
  {
    id: 'bolt',
    name: 'Bolt.new',
    description: 'AI-powered full-stack development platform',
    url: 'https://bolt.new',
    icon: Zap,
    color: 'text-yellow-400',
    bgGradient: 'from-yellow-500/20 to-orange-500/20',
    features: ['AI Code Generation', 'Real-time Preview', 'Full-stack Support', 'Instant Deployment']
  },
  {
    id: 'loveable',
    name: 'Loveable',
    description: 'Visual development platform for modern apps',
    url: 'https://loveable.dev',
    icon: Code,
    color: 'text-pink-400',
    bgGradient: 'from-pink-500/20 to-purple-500/20',
    features: ['Visual Builder', 'Component Library', 'Responsive Design', 'Team Collaboration']
  },
  {
    id: 'co',
    name: 'co.dev',
    description: 'Google\'s app development platform',
    url: 'https://co.dev',
    icon: Database,
    color: 'text-orange-400',
    bgGradient: 'from-orange-500/20 to-red-500/20',
    features: ['Real-time Database', 'Authentication', 'Cloud Functions', 'Analytics']
  }
];

const PhoneController: React.FC<PhoneControllerProps> = ({ lobbyCode }) => {
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameStatus, setGameStatus] = useState<'waiting' | 'editor_selection' | 'in_editor'>('waiting');
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [connectionError, setConnectionError] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLobbyLocked, setIsLobbyLocked] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  
  // NEW: Phone editor selection state
  const [phoneSelectedEditorIndex, setPhoneSelectedEditorIndex] = useState(0);
  
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

  // NEW: Handle phone editor selection
  const handlePhoneEditorSelection = async (editorId: string) => {
    console.log('🎯 [PHONE] Editor selected on phone:', editorId);
    
    if (!currentSessionId) {
      console.error('❌ [PHONE] No session ID available for editor selection');
      return;
    }

    try {
      // Find the selected editor
      const selectedEditorInfo = editors.find(editor => editor.id === editorId);
      if (!selectedEditorInfo) {
        console.error('❌ [PHONE] Editor not found:', editorId);
        return;
      }

      // Create selection data for Supabase
      const selectionData = {
        selectedEditor: selectedEditorInfo.id,
        selectedEditorName: selectedEditorInfo.name,
        selectedIndex: editors.findIndex(e => e.id === editorId),
        selectionTimestamp: Date.now(),
        sessionId: currentSessionId,
        lobbyCode: lobbyCode,
        selectedBy: playerName
      };

      console.log('💾 [PHONE] Saving editor selection to Supabase:', selectionData);

      // Update session with selection data - this will trigger ConsoleDisplay to show the editor
      const { error } = await supabase
        .from('sessions')
        .update({ 
          selected_editor: JSON.stringify(selectionData)
        })
        .eq('id', currentSessionId);

      if (error) {
        console.error('❌ [PHONE] Error saving editor selection:', error);
        return;
      }

      console.log('✅ [PHONE] Editor selection saved - switching to in_editor mode');
      
      // Switch to in_editor mode immediately
      setGameStatus('in_editor');

    } catch (error) {
      console.error('💥 [PHONE] Exception during editor selection:', error);
    }
  };

  // NEW: Handle back from editor
  const handleBackFromEditor = async () => {
    console.log('🔙 [PHONE] Going back from editor to selection');
    
    try {
      // Clear the selected_editor field in Supabase
      const { error } = await supabase
        .from('sessions')
        .update({ selected_editor: null })
        .eq('id', currentSessionId);

      if (error) {
        console.error('❌ [PHONE] Error clearing selected editor:', error);
        return;
      }

      // Switch back to editor selection
      setGameStatus('editor_selection');
      console.log('✅ [PHONE] Returned to editor selection');
    } catch (error) {
      console.error('💥 [PHONE] Exception going back from editor:', error);
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

  // NEW: Show Stage 6 - Editor Control Panel
  if (gameStatus === 'in_editor') {
    return (
      <EditorControlPanel
        sessionId={currentSessionId}
        myPlayerId={myPlayerId}
        playerName={playerName}
        webrtcStatus={webrtc.status}
        webrtcSendMessage={webrtc.sendMessage}
        onBack={handleBackFromEditor}
      />
    );
  }

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
      <div className="min-h-screen bg-gray-900 text-white overflow-hidden p-6">
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
          
          <h1 className="text-3xl font-bold mb-8">Join lobby</h1>
          
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
                <span>Checking session...</span>
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
              <p>First to join becomes the host</p>
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
              gameStatus === 'editor_selection' ? 'Select Editor' : 'Waiting'
            }
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-sm text-green-400">Connected</span>
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
            Lock the lobby when all have joined
          </p>
        </div>
      )}

      {/* NEW: Stage 5 - Editor Selection Mode - Horizontal Scroll Carousel */}
      {gameStatus === 'editor_selection' && (
        <div className="flex-1">
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
          {/* NEW: Horizontal Scroll Carousel */}
          <div className="py-8">
            <div className="flex h-full overflow-x-auto space-x-4 pb-4 snap-x snap-mandatory scrollbar-hide">
              {editors.map((editor, index) => {
                const IconComponent = editor.icon;
                const isSelected = index === phoneSelectedEditorIndex;
                
                return (
                  <div
                    key={editor.id}
                    className={`flex-shrink-0 w-64 snap-center transition-all duration-300 transform cursor-pointer ${
                      isSelected ? 'scale-105' : 'scale-95 opacity-70'
                    }`}
                    onClick={() => {
                      console.log('📱 [PHONE] Editor selected:', editor.name);
                      setPhoneSelectedEditorIndex(index);
                      handlePhoneEditorSelection(editor.id);
                    }}
                  >
                    {/* Selection Ring */}
                    {isSelected && (
                      <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl blur opacity-75 animate-pulse"></div>
                    )}
                    
                    <div className={`relative bg-gradient-to-br ${editor.bgGradient} backdrop-blur-md border-2 ${
                      isSelected ? 'border-indigo-400 shadow-xl shadow-indigo-500/25' : 'border-white/10'
                    } rounded-xl p-4 h-full flex flex-col justify-between transition-all duration-300`}>
                      
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2 rounded-lg bg-black/30 ${editor.color} ${
                          isSelected ? 'animate-pulse' : ''
                        }`}>
                          <IconComponent size={20} />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white">{editor.name}</h3>
                          <p className="text-gray-300 text-xs">{editor.description}</p>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="space-y-2 mb-4">
                        {editor.features.slice(0, 3).map((feature, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${editor.color.replace('text-', 'bg-')} ${
                              isSelected ? 'animate-pulse' : ''
                            }`}></div>
                            <span className="text-gray-200 text-xs">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* URL Preview */}
                      <div className="bg-black/30 rounded-lg p-2 mb-3">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <ExternalLink size={10} />
                          <span className="font-mono truncate">{editor.url}</span>
                        </div>
                      </div>

                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="text-center">
                          <div className="bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-medium animate-bounce">
                            ✨ Launching...
                          </div>
                        </div>
                      )}
                      
                      {/* Index indicator */}
                      <div className="absolute top-2 right-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected 
                            ? 'bg-indigo-500 text-white' 
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {index + 1}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


        </div>
      )}

      {/* Waiting State */}
      {gameStatus === 'waiting' && !isHost && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Gamepad2 size={64} className="text-indigo-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Ready to Code!</h2>
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