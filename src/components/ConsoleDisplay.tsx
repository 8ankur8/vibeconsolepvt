import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Code, Users, Lock, Unlock, QrCode, Monitor, Activity, Gamepad2, Crown, Wifi, WifiOff, AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { useWebRTC } from '../hooks/useWebRTC';
import { supabase, deviceInputHelpers, realtimeHelpers } from '../lib/supabase';
import { InputRouter, ControllerInput } from '../lib/inputRouter';
import EditorSelection from './EditorSelection';
import WebRTCDebugPanel from './WebRTCDebugPanel';

const ConsoleDisplay: React.FC = () => {
  const [gameState, setGameState] = useState<'lobby' | 'editor_selection'>('lobby');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [connectionError, setConnectionError] = useState<string>('');
  const [lastControllerInput, setLastControllerInput] = useState<ControllerInput | null>(null);
  
  // Use session hook for lobby management
  const {
    sessionId,
    consoleDeviceId,
    lobbyCode,
    qrCodeData,
    connectionUrl,
    players,
    isLobbyLocked,
    isCreatingSession,
    error: sessionError,
    createSession,
    lockLobby,
    unlockLobby
  } = useSession();

  // Initialize InputRouter
  const inputRouterRef = useRef<InputRouter | null>(null);

  // Initialize InputRouter
  useEffect(() => {
    if (!inputRouterRef.current) {
      console.log('🎮 [CONSOLE] Initializing InputRouter');
      inputRouterRef.current = new InputRouter(
        (input: ControllerInput) => {
          console.log('🎮 [CONSOLE] InputRouter processed input:', input);
          setLastControllerInput(input);
        },
        (deviceId: string, mappings: any[]) => {
          console.log('🔄 [CONSOLE] Input mappings updated for device:', deviceId, mappings);
        }
      );
    }

    return () => {
      if (inputRouterRef.current) {
        inputRouterRef.current.clear();
        inputRouterRef.current = null;
      }
    };
  }, []);

  // Register devices with InputRouter when players change
  useEffect(() => {
    if (!inputRouterRef.current) return;

    console.log('📝 [CONSOLE] Registering devices with InputRouter:', players.length);
    
    // Register all players with InputRouter
    players.forEach(player => {
      inputRouterRef.current?.registerDevice(
        player.id, 
        player.name, 
        player.deviceType === 'console' ? 'console' : 'phone'
      );
    });

    // Register console device
    if (consoleDeviceId) {
      inputRouterRef.current.registerDevice(consoleDeviceId, 'Console', 'console');
    }
  }, [players, consoleDeviceId]);

  // WebRTC integration for console with enhanced logging
  const webrtc = useWebRTC({
    sessionId,
    deviceId: consoleDeviceId,
    isHost: true,
    onMessage: (message, fromDeviceId) => {
      console.log('📩 [CONSOLE] WebRTC message from', fromDeviceId, ':', message);
      
      // Process WebRTC input through InputRouter
      if (inputRouterRef.current) {
        const controllerInput = inputRouterRef.current.processWebRTCInput(fromDeviceId, message);
        if (controllerInput) {
          console.log('✅ [CONSOLE] WebRTC input processed by InputRouter');
        }
      }
    },
    enabled: sessionId !== '' && consoleDeviceId !== '' && isLobbyLocked
  });

  // Create device name mapping for debug panel
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

  // ENHANCED: WebRTC connection management with signaling channel readiness
  useEffect(() => {
    if (!sessionId || !consoleDeviceId || !isLobbyLocked || !webrtc.status.isInitialized || !webrtc.status.isSignalingChannelReady || connectionError) {
      console.log('⚠️ [CONSOLE] WebRTC connection management blocked:', {
        sessionId: !!sessionId,
        consoleDeviceId: !!consoleDeviceId,
        isLobbyLocked,
        webrtcInitialized: webrtc.status.isInitialized,
        signalingReady: webrtc.status.isSignalingChannelReady, // ENHANCED: Check signaling readiness
        hasConnectionError: !!connectionError
      });
      return;
    }

    console.log('🔗 [CONSOLE] Starting WebRTC connection management');

    const initializeWebRTCConnections = async () => {
      try {
        // Get all phone devices in the session
        const phoneDevices = players.filter(player => 
          player.deviceType !== 'console' && player.name !== 'Console'
        );

        console.log('📱 [CONSOLE] Found phone devices to connect to:', phoneDevices.length);

        for (const device of phoneDevices) {
          console.log(`🤝 [CONSOLE] Attempting connection to ${device.name} (${device.id.slice(-8)})`);
          
          try {
            await webrtc.connectToDevice(device.id);
            console.log(`✅ [CONSOLE] Connection initiated to ${device.name}`);
          } catch (error) {
            console.error(`❌ [CONSOLE] Failed to connect to ${device.name}:`, error);
          }
        }
      } catch (error) {
        console.error('💥 [CONSOLE] Error in WebRTC connection management:', error);
        setConnectionError(`WebRTC connection failed: ${error.message}`);
      }
    };

    // Initial connection attempt
    const initialTimeout = setTimeout(initializeWebRTCConnections, 2000);

    // Periodic retry for failed connections
    const retryInterval = setInterval(() => {
      const connectedCount = webrtc.status.connectedDevices.length;
      const totalPhoneDevices = players.filter(p => p.deviceType !== 'console').length;
      
      if (connectedCount < totalPhoneDevices) {
        console.log(`🔄 [CONSOLE] Retrying connections (${connectedCount}/${totalPhoneDevices} connected)`);
        initializeWebRTCConnections();
      }
    }, 15000); // Every 15 seconds

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(retryInterval);
    };
  }, [sessionId, consoleDeviceId, isLobbyLocked, webrtc.status.isInitialized, webrtc.status.isSignalingChannelReady, connectionError, players]); // ENHANCED: Added signaling channel dependency

  // ✅ CLEAN: Listen for device inputs from database (real-time)
  useEffect(() => {
    if (!sessionId || !inputRouterRef.current) return;

    console.log('📡 [CONSOLE] Setting up device_inputs real-time listener for session:', sessionId.slice(-8));

    const inputsChannel = deviceInputHelpers.subscribeToDeviceInputs(
      sessionId,
      (deviceInput) => {
        console.log('📱 [CONSOLE] New device input received:', deviceInput);
        
        // Process device input through InputRouter
        if (inputRouterRef.current) {
          const controllerInput = inputRouterRef.current.processDeviceInput(deviceInput);
          if (controllerInput) {
            console.log('✅ [CONSOLE] Device input processed by InputRouter');
          }
        }
      }
    );

    return () => {
      console.log('🧹 [CONSOLE] Cleaning up device_inputs subscription');
      inputsChannel.unsubscribe();
    };
  }, [sessionId]);

  // ✅ CLEAN: Listen for Supabase navigation (fallback when WebRTC isn't connected)
  useEffect(() => {
    if (!sessionId) return;

    console.log('📡 [CONSOLE] Starting session listener for:', sessionId.slice(-8));

    const channelName = `session_navigation_${sessionId}`; // ENHANCED: Define channelName variable

    const sessionChannel = supabase
      .channel(channelName) // ENHANCED: Use channelName variable
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, (payload) => {
        const newData = payload.new as any;
        
        if (newData.selected_editor) {
          try {
            const inputData = JSON.parse(newData.selected_editor);
            
            if (inputData.action === 'navigate' && inputData.source === 'phone_controller') {
              console.log('🎮 [CONSOLE] Phone navigation received:', inputData.direction, 'from', inputData.playerName);
              
              // Process navigation through InputRouter
              if (inputRouterRef.current) {
                const controllerInput = inputRouterRef.current.processSupabaseInput(
                  inputData.playerId,
                  {
                    type: 'dpad',
                    action: inputData.direction,
                    data: inputData,
                    timestamp: inputData.timestamp
                  }
                );
                
                if (controllerInput) {
                  console.log('✅ [CONSOLE] Supabase navigation processed by InputRouter');
                }
              }
            }
          } catch (error) {
            // Silently ignore parsing errors
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ [CONSOLE] Navigation listener ready');
        } else if (status === 'CHANNEL_ERROR') {
          // ENHANCED: Enhanced error logging with sessionId and channelName
          console.error(`❌ [CONSOLE] Navigation listener failed for session ${sessionId.slice(-8)} on channel ${channelName}:`, status);
        }
      });

    return () => {
      sessionChannel.unsubscribe();
    };
  }, [sessionId]);

  // Handle navigation input from controllers
  const handleNavigation = useCallback((direction: string, deviceId: string, source: 'webrtc' | 'supabase') => {
    console.log(`🎮 [CONSOLE] Navigation: ${direction} from ${deviceId.slice(-8)} via ${source}`);
    
    if (gameState === 'editor_selection') {
      // Navigation will be handled by EditorSelection component via lastControllerInput
      console.log('🎯 [CONSOLE] Navigation forwarded to EditorSelection component');
    }
  }, [gameState]);

  // Auto-create session on mount
  useEffect(() => {
    if (!sessionId && !isCreatingSession) {
      console.log('🚀 [CONSOLE] Auto-creating session on mount');
      createSession();
    }
  }, [sessionId, isCreatingSession, createSession]);

  // Handle lobby lock/unlock
  const handleLockToggle = async () => {
    if (isLobbyLocked) {
      console.log('🔓 [CONSOLE] Unlocking lobby');
      await unlockLobby();
      setGameState('lobby');
    } else {
      console.log('🔒 [CONSOLE] Locking lobby');
      await lockLobby();
      setGameState('editor_selection');
    }
  };

  // Handle going back from editor selection
  const handleBackToLobby = () => {
    console.log('🔙 [CONSOLE] Going back to lobby');
    setGameState('lobby');
    unlockLobby();
  };

  if (sessionError) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={64} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Session Error</h1>
          <p className="text-red-300 mb-4">{sessionError}</p>
          <button
            onClick={createSession}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isCreatingSession) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-400 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold mb-2">Creating Session...</h1>
          <p className="text-gray-400">Setting up your gaming lobby</p>
        </div>
      </div>
    );
  }

  if (gameState === 'editor_selection') {
    return (
      <EditorSelection
        sessionId={sessionId}
        lobbyCode={lobbyCode}
        players={players}
        onBack={handleBackToLobby}
        webrtcStatus={webrtc.status}
        onWebRTCMessage={webrtc.sendMessage}
        lastControllerInput={lastControllerInput}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-indigo-900 text-white">
      {/* Header */}
      <header className="p-6 border-b border-indigo-500/20 backdrop-blur-md bg-black/20">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Code size={32} className="text-indigo-300" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                VibeConsole
              </h1>
            </div>
            <div className="bg-indigo-500/20 px-3 py-1 rounded-full text-indigo-300 text-sm">
              Console Mode
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* WebRTC Status */}
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className={`flex items-center gap-2 px-3 py-1 rounded-full transition-colors ${
                webrtc.status.isInitialized 
                  ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' 
                  : 'bg-gray-500/20 text-gray-300 hover:bg-gray-500/30'
              }`}
            >
              <Activity size={16} />
              <span>WebRTC</span>
              <div className={`w-2 h-2 rounded-full ${
                webrtc.status.connectedDevices.length > 0 ? 'bg-green-400' : 'bg-gray-400'
              }`}></div>
              <span className="text-xs">
                {webrtc.status.connectedDevices.length}/{Object.keys(webrtc.status.connections).length}
              </span>
            </button>

            {/* Lock Status */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
              isLobbyLocked ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'
            }`}>
              {isLobbyLocked ? <Lock size={16} /> : <Unlock size={16} />}
              <span>{isLobbyLocked ? 'Locked' : 'Open'}</span>
            </div>

            {/* Players Count */}
            <div className="flex items-center gap-2 bg-indigo-500/20 px-3 py-1 rounded-full">
              <Users size={16} />
              <span>{players.length} players</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - QR Code & Connection */}
          <div className="lg:col-span-1">
            <div className="bg-black/20 rounded-xl p-6 border border-indigo-500/20 backdrop-blur-md">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <QrCode className="text-indigo-300" />
                Join Game
              </h2>
              
              {qrCodeData ? (
                <div className="text-center mb-6">
                  <div className="bg-white p-4 rounded-lg inline-block mb-4">
                    <img src={qrCodeData} alt="QR Code" className="w-48 h-48" />
                  </div>
                  <p className="text-sm text-gray-400 mb-2">Scan with your phone camera</p>
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Or visit:</p>
                    <p className="font-mono text-sm text-indigo-300 break-all">{connectionUrl}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center mb-6">
                  <div className="w-48 h-48 bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
                  </div>
                  <p className="text-gray-400">Generating QR code...</p>
                </div>
              )}

              <div className="text-center">
                <div className="bg-purple-500/20 rounded-lg p-4 border border-purple-500/30">
                  <p className="text-lg font-bold text-purple-300 mb-1">Lobby Code</p>
                  <p className="text-3xl font-mono font-bold text-white tracking-wider">{lobbyCode}</p>
                </div>
              </div>
            </div>

            {/* Connection Error */}
            {connectionError && (
              <div className="mt-4 bg-red-500/20 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-300 mb-2">
                  <AlertCircle size={16} />
                  <span className="font-medium">Connection Error</span>
                </div>
                <p className="text-red-200 text-sm">{connectionError}</p>
              </div>
            )}
          </div>

          {/* Right Column - Players & Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Players List */}
            <div className="bg-black/20 rounded-xl p-6 border border-indigo-500/20 backdrop-blur-md">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Users className="text-indigo-300" />
                Connected Players ({players.length}/4)
              </h2>
              
              {players.length === 0 ? (
                <div className="text-center py-8">
                  <Gamepad2 size={48} className="text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">Waiting for players to join...</p>
                  <p className="text-gray-500 text-sm mt-2">Share the QR code or lobby code</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {players.map((player) => (
                    <div key={player.id} className="bg-indigo-900/30 rounded-lg p-4 border border-indigo-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="font-medium text-white">{player.name}</span>
                          {player.isHost && <Crown size={16} className="text-yellow-400" />}
                        </div>
                        <span className="text-xs text-gray-400 capitalize">{player.deviceType}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {player.deviceType === 'console' ? 'Main Display' : 'Controller'}
                        {player.isHost && ' • Host'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Game Controls */}
            <div className="bg-black/20 rounded-xl p-6 border border-indigo-500/20 backdrop-blur-md">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Monitor className="text-indigo-300" />
                Game Controls
              </h2>
              
              <div className="space-y-4">
                <button
                  onClick={handleLockToggle}
                  disabled={players.length <= 1} // Need at least console + 1 player
                  className={`w-full py-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    players.length <= 1
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : isLobbyLocked
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  {isLobbyLocked ? <Unlock size={20} /> : <Lock size={20} />}
                  {isLobbyLocked ? 'Unlock Lobby' : 'Lock Lobby & Start'}
                </button>
                
                {players.length <= 1 && (
                  <p className="text-center text-gray-400 text-sm">
                    Need at least one player to start
                  </p>
                )}
                
                {isLobbyLocked && (
                  <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4">
                    <p className="text-purple-300 text-sm text-center">
                      🎮 Lobby is locked. Players can now use their phones as controllers!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Debug Panel */}
            {showDebugPanel && (
              <WebRTCDebugPanel
                status={webrtc.status}
                deviceNames={deviceNames}
                onConnectToDevice={webrtc.connectToDevice}
                getDetailedStatus={webrtc.getDetailedStatus}
              />
            )}

            {/* Input Router Debug Info */}
            {lastControllerInput && (
              <div className="bg-black/20 rounded-xl p-6 border border-green-500/20 backdrop-blur-md">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-300">
                  <Activity size={20} />
                  Last Controller Input
                </h3>
                <div className="bg-gray-800/50 rounded-lg p-4 font-mono text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-400">Device:</span>
                      <span className="text-white ml-2">{lastControllerInput.deviceName}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Type:</span>
                      <span className="text-indigo-300 ml-2">{lastControllerInput.input.type}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Action:</span>
                      <span className="text-purple-300 ml-2">{lastControllerInput.input.action}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Source:</span>
                      <span className={`ml-2 ${lastControllerInput.webrtcMessage ? 'text-green-300' : 'text-yellow-300'}`}>
                        {lastControllerInput.webrtcMessage ? 'WebRTC' : 'Supabase'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-gray-400">Time:</span>
                    <span className="text-blue-300 ml-2">
                      {new Date(lastControllerInput.input.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {lastControllerInput.input.data && Object.keys(lastControllerInput.input.data).length > 0 && (
                    <div className="mt-2">
                      <span className="text-gray-400">Data:</span>
                      <pre className="text-gray-300 ml-2 text-xs">
                        {JSON.stringify(lastControllerInput.input.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsoleDisplay;