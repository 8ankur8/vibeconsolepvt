import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Code, Users, QrCode, Copy, Check, Lock, Crown, Wifi, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import { WebRTCMessage } from '../lib/webrtc';
import { InputRouter } from '../lib/inputRouter';
import EditorSelection from './EditorSelection';
import WebRTCDebugPanel from './WebRTCDebugPanel';

interface Player {
  id: string;
  name: string;
  deviceType: 'phone' | 'console'; // Updated to match your schema
  isHost: boolean; // Updated from isLeader to isHost
  joinedAt: number;
  lastSeen: number; // New field from your schema
  status: string;
}

const ConsoleDisplay: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>('');
  const [consoleDeviceId, setConsoleDeviceId] = useState<string>('');
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [connectionUrl, setConnectionUrl] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLobbyLocked, setIsLobbyLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Initialize input router for device identification
  const inputRouter = useRef<InputRouter | null>(null);

  // Create device name mapping for WebRTC messages and debug panel
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

  // Enhanced message handler for WebRTC messages with input router integration
  const handleWebRTCMessage = useCallback((message: WebRTCMessage, fromDeviceId: string) => {
    const deviceName = deviceNames[fromDeviceId] || 'Unknown Device';
    console.log(`📩 WebRTC Message from ${deviceName} (${fromDeviceId.slice(-8)}):`, message);
    
    // Use input router to process and identify inputs
    if (inputRouter.current) {
      const processedInput = inputRouter.current.processWebRTCInput(fromDeviceId, message);
      if (processedInput) {
        console.log(`🎮 Processed input from ${processedInput.deviceName}: ${processedInput.input.type}.${processedInput.input.action}`);
        // Your game logic here - you now know exactly who sent what input!
      }
    }

    // Handle different message types
    switch (message.type) {
      case 'navigation':
        console.log(`🎮 Navigation input from ${deviceName}:`, message.data);
        break;
      case 'selection':
        console.log(`👆 Selection input from ${deviceName}:`, message.data);
        break;
      case 'game_data':
        console.log(`🎯 Game data from ${deviceName}:`, message.data);
        break;
      case 'heartbeat':
        console.log(`💓 Heartbeat from ${deviceName}`);
        // Update last_seen timestamp in database
        updateDeviceActivity(fromDeviceId);
        break;
      default:
        console.log(`❓ Unknown message type from ${deviceName}:`, message);
    }
  }, [deviceNames]);

  // WebRTC integration with enhanced message handling
  const webrtc = useWebRTC({
    sessionId,
    deviceId: consoleDeviceId,
    isHost: true,
    onMessage: handleWebRTCMessage,
    enabled: sessionId !== '' && consoleDeviceId !== '' && isLobbyLocked
  });

  // Update device activity timestamp (uses your new last_seen column) - FIXED: Use Unix timestamp
  const updateDeviceActivity = async (deviceId: string) => {
    try {
      await supabase
        .from('devices')
        .update({ last_seen: Date.now() }) // FIXED: Use Unix timestamp instead of ISO string
        .eq('id', deviceId);
    } catch (error) {
      console.error('Error updating device activity:', error);
    }
  };

  // Generate a random 6-character lobby code
  const generateLobbyCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Generate QR code data URL
  const generateQRCode = async (url: string): Promise<string> => {
    try {
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(url)}`;
      return qrApiUrl;
    } catch (error) {
      console.error('❌ Error generating QR code:', error);
      return '';
    }
  };

  // UPDATED: Create session and console device with new schema - FIXED: Use Unix timestamps
  const createSession = async () => {
    try {
      setIsCreatingSession(true);
      const code = generateLobbyCode();
      const baseUrl = window.location.origin;
      const connectionUrl = `${baseUrl}/controller?lobby=${code}`;
      
      // Step 1: Insert session into Supabase
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          code,
          is_active: true,
          is_locked: false,
          selected_editor: null
        })
        .select()
        .single();

      if (sessionError) {
        console.error('❌ Error creating session:', sessionError);
        return;
      }

      console.log('✅ Session created:', session);

      // Step 2: Create console device entry with enhanced schema - FIXED: Use Unix timestamps
      const now = Date.now(); // FIXED: Use Unix timestamp instead of ISO string
      
      const { data: consoleDevice, error: deviceError } = await supabase
        .from('devices')
        .insert({
          session_id: session.id,
          name: 'Console',
          device_type: 'console', // Using your new device_type column
          is_host: true, // Using your renamed is_host column
          joined_at: now, // FIXED: Using Unix timestamp
          last_seen: now // FIXED: Using Unix timestamp
        })
        .select()
        .single();

      if (deviceError) {
        console.error('❌ Error creating console device:', deviceError);
        return;
      }

      console.log('✅ Console device created:', consoleDevice);

      // Generate QR code
      const qrCode = await generateQRCode(connectionUrl);

      // Update state with all the new information
      setSessionId(session.id);
      setConsoleDeviceId(consoleDevice.id);
      setLobbyCode(code);
      setConnectionUrl(connectionUrl);
      setQrCodeData(qrCode);
      setIsCreatingSession(false);

      console.log('🎉 Session and console device setup complete:', {
        sessionId: session.id,
        consoleDeviceId: consoleDevice.id,
        lobbyCode: code
      });
    } catch (error) {
      console.error('❌ Error creating session:', error);
      setIsCreatingSession(false);
    }
  };

  // UPDATED: Load devices with new schema fields - FIXED: Handle Unix timestamps
  const loadDevices = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data: devices, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true }); // Using new joined_at column

      if (error) {
        console.error('❌ Error loading devices:', error);
        return;
      }

      const mappedPlayers: Player[] = devices.map((device) => ({
        id: device.id,
        name: device.name,
        deviceType: device.device_type || (device.name === 'Console' ? 'console' : 'phone'), // Using new device_type
        isHost: device.is_host || false, // Using renamed is_host column
        joinedAt: device.joined_at || Date.now(), // FIXED: Handle Unix timestamp
        lastSeen: device.last_seen || Date.now(), // FIXED: Handle Unix timestamp
        status: 'connected'
      }));

      setPlayers(mappedPlayers);
      console.log('✅ Players loaded with enhanced schema:', mappedPlayers);

      // Register devices with input router
      if (inputRouter.current) {
        mappedPlayers.forEach(player => {
          inputRouter.current?.registerDevice(player.id, player.name, player.deviceType);
        });
      }

    } catch (error) {
      console.error('❌ Error loading devices:', error);
    }
  }, [sessionId]);

  // Initialize input router
  useEffect(() => {
    inputRouter.current = new InputRouter(
      (input) => {
        console.log(`🎮 Identified input from ${input.deviceName} (${input.deviceType}): ${input.input.type}.${input.input.action}`, input.input.data);
        
        // Now you can process inputs knowing exactly who sent them!
        // Example game logic:
        switch (input.input.type) {
          case 'dpad':
            console.log(`${input.deviceName} pressed ${input.input.action} on D-pad`);
            break;
          case 'button':
            console.log(`${input.deviceName} pressed button ${input.input.action}`);
            break;
          case 'swipe':
            console.log(`${input.deviceName} swiped ${input.input.action}`);
            break;
        }
      },
      (deviceId, mappings) => {
        console.log(`🔄 Input mappings updated for device ${deviceId}:`, mappings);
      }
    );

    return () => {
      inputRouter.current?.clear();
    };
  }, []);

  // Load session status
  const loadSessionStatus = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('is_locked, selected_editor')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('❌ Error loading session status:', error);
        return;
      }

      const wasLocked = isLobbyLocked;
      const nowLocked = session.is_locked || false;
      
      setIsLobbyLocked(nowLocked);
      
      if (!wasLocked && nowLocked) {
        console.log('🔒 Lobby locked - switching to editor selection');
      }
      
    } catch (error) {
      console.error('❌ Error loading session status:', error);
    }
  }, [sessionId, isLobbyLocked]);

  // FIXED: Stable WebRTC connection management without infinite loops
  const connectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const initializeWebRTCConnections = useCallback(async () => {
    if (!sessionId || !consoleDeviceId || !isLobbyLocked || !webrtc.status.isInitialized) {
      return;
    }

    if (isConnectingRef.current) {
      console.log('⚠️ Connection attempt already in progress, skipping...');
      return;
    }

    isConnectingRef.current = true;

    try {
      // Get all phone controllers (exclude console)
      const phoneControllers = players.filter(player => 
        player.deviceType === 'phone' && player.id !== consoleDeviceId
      );

      if (phoneControllers.length === 0) {
        console.log('📱 No phone controllers to connect to');
        return;
      }

      // Get current WebRTC status
      const { connections, connectedDevices } = webrtc.status;
      
      console.log('📊 WebRTC Connection Analysis:', {
        totalPhoneControllers: phoneControllers.length,
        phoneControllers: phoneControllers.map(p => ({ name: p.name, id: p.id.slice(-8) })),
        totalConnections: Object.keys(connections).length,
        connectedDevices: connectedDevices.length
      });

      // Find controllers that need connections
      const needConnection = phoneControllers.filter(player => {
        const hasConnection = connections.hasOwnProperty(player.id);
        const isConnected = connectedDevices.includes(player.id);
        const connectionState = connections[player.id];
        
        const needsConnection = !hasConnection || 
          (connectionState !== 'connected' && connectionState !== 'connecting');
        
        if (needsConnection) {
          console.log(`🔍 ${player.name} needs connection:`, {
            hasConnection,
            isConnected,
            connectionState
          });
        }
        
        return needsConnection;
      });

      // Connect to devices that need connections
      for (const controller of needConnection) {
        try {
          console.log(`🤝 Connecting to ${controller.name} (${controller.id.slice(-8)})`);
          await webrtc.connectToDevice(controller.id);
          
          // Small delay between connections
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
          console.error(`❌ Failed to connect to ${controller.name}:`, error);
        }
      }

      console.log('📋 WebRTC Connection Summary:', {
        phoneControllers: phoneControllers.length,
        attempted: needConnection.length,
        currentConnections: Object.keys(webrtc.status.connections).length,
        currentConnected: webrtc.status.connectedDevices.length
      });

    } catch (error) {
      console.error('❌ Error in WebRTC connection management:', error);
    } finally {
      isConnectingRef.current = false;
    }
  }, [sessionId, consoleDeviceId, isLobbyLocked, players, webrtc.status.isInitialized, webrtc.connectToDevice]);

  // FIXED: Set up connection management with stable intervals
  useEffect(() => {
    if (!sessionId || !consoleDeviceId || !isLobbyLocked || !webrtc.status.isInitialized) {
      if (connectionIntervalRef.current) {
        clearInterval(connectionIntervalRef.current);
        connectionIntervalRef.current = null;
      }
      return;
    }

    console.log('🔄 Starting WebRTC connection management');

    // Initial connection attempt (delayed)
    const initialTimeout = setTimeout(() => {
      initializeWebRTCConnections();
    }, 3000);

    // Set up periodic connection checks
    connectionIntervalRef.current = setInterval(() => {
      initializeWebRTCConnections();
    }, 10000); // Every 10 seconds

    return () => {
      console.log('🧹 Cleaning up WebRTC connection management');
      clearTimeout(initialTimeout);
      if (connectionIntervalRef.current) {
        clearInterval(connectionIntervalRef.current);
        connectionIntervalRef.current = null;
      }
    };
  }, [sessionId, consoleDeviceId, isLobbyLocked, webrtc.status.isInitialized, initializeWebRTCConnections]);

  // Manual connection trigger for debugging
  const manualConnectAll = async () => {
    console.log('🔧 Manual connection trigger activated');
    await initializeWebRTCConnections();
  };

  // Create session on component mount
  useEffect(() => {
    createSession();
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    if (sessionId) {
      // Initial load
      loadDevices();
      loadSessionStatus();
      
      // Set up real-time subscription for devices
      const devicesChannel = supabase
        .channel(`devices_${sessionId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'devices',
            filter: `session_id=eq.${sessionId}`
          }, 
          (payload) => {
            console.log('📱 Device change detected:', payload);
            loadDevices();
          }
        )
        .subscribe((status) => {
          console.log('📱 Devices subscription status:', status);
        });

      // Set up real-time subscription for session changes
      const sessionChannel = supabase
        .channel(`session_${sessionId}`)
        .on('postgres_changes', 
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'sessions',
            filter: `id=eq.${sessionId}`
          }, 
          (payload) => {
            console.log('🏠 Session change detected:', payload);
            loadSessionStatus();
          }
        )
        .subscribe((status) => {
          console.log('🏠 Session subscription status:', status);
        });

      return () => {
        console.log('🧹 Cleaning up subscriptions');
        devicesChannel.unsubscribe();
        sessionChannel.unsubscribe();
      };
    }
  }, [sessionId, loadDevices, loadSessionStatus]);

  // Backup refresh interval
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(() => {
      loadDevices();
      loadSessionStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionId, loadDevices, loadSessionStatus]);

  const copyConnectionUrl = async () => {
    try {
      await navigator.clipboard.writeText(connectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('❌ Failed to copy URL:', err);
    }
  };

  // Show editor selection when lobby is locked
  if (isLobbyLocked) {
    return (
      <EditorSelection
        sessionId={sessionId}
        lobbyCode={lobbyCode}
        players={players}
        onBack={() => setIsLobbyLocked(false)}
        webrtcStatus={webrtc.status}
        onWebRTCMessage={webrtc.broadcastMessage}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-indigo-900 text-white">
      {/* Header */}
      <header className="p-4 border-b border-indigo-500/20 backdrop-blur-md bg-black/20">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Code size={28} className="text-indigo-300" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
              VibeConsole
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-indigo-500/20 px-3 py-1 rounded-full">
              <Users size={16} />
              <span>{players.filter(p => p.deviceType === 'phone').length}/4 players</span>
            </div>
            {lobbyCode && (
              <div className="bg-purple-500/20 px-3 py-1 rounded-full">
                <span className="font-mono text-lg">{lobbyCode}</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-green-500/20 text-green-300 px-3 py-1 rounded-full">
              <Wifi size={16} />
              <span>Live</span>
            </div>
            {/* Enhanced WebRTC Status Indicator */}
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
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Game Area */}
          <div className="lg:col-span-2">
            <div className="bg-black/20 rounded-lg p-8 border border-indigo-500/20 h-96 flex flex-col items-center justify-center relative overflow-hidden">
              {/* Animated background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 animate-pulse"></div>
              </div>
              
              <div className="relative z-10 text-center">
                <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                  Waiting for Players
                </h2>
                <p className="text-indigo-200 mb-8 text-center max-w-md">
                  Share the lobby code or scan the QR code to join the game
                </p>
                
                {players.filter(p => p.deviceType === 'phone').length === 0 ? (
                  <div className="text-center">
                    <div className="text-6xl mb-4 animate-bounce">🎮</div>
                    <p className="text-gray-400 text-lg">No players connected yet</p>
                    <p className="text-sm text-gray-500 mt-2">First player to join becomes the host</p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-indigo-300">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                      <span>Waiting for connections...</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-4xl mb-4 animate-pulse">👥</div>
                    <p className="text-green-400 font-medium text-xl mb-2">
                      {players.filter(p => p.deviceType === 'phone').length} player{players.filter(p => p.deviceType === 'phone').length > 1 ? 's' : ''} connected!
                    </p>
                    {players.find(p => p.isHost && p.deviceType === 'phone') && (
                      <p className="text-purple-300 text-sm mt-2 flex items-center justify-center gap-1">
                        <Crown size={16} className="text-yellow-400" />
                        Host: {players.find(p => p.isHost && p.deviceType === 'phone')?.name}
                      </p>
                    )}
                    <p className="text-gray-400 text-sm mt-2">
                      Waiting for host to lock the lobby...
                    </p>
                    
                    {/* Player avatars with enhanced info */}
                    <div className="flex justify-center gap-2 mt-4">
                      {players.filter(p => p.deviceType === 'phone').map((player) => (
                        <div key={player.id} className="relative">
                          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg border-2 border-white/20">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          {player.isHost && (
                            <Crown size={12} className="absolute -top-1 -right-1 text-yellow-400" />
                          )}
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900 ${
                            webrtc.status.connectedDevices.includes(player.id) ? 'bg-green-400' : 'bg-yellow-400'
                          } animate-pulse`}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced WebRTC Debug Panel */}
            {showDebugPanel && (
              <div className="mt-6">
                <WebRTCDebugPanel
                  status={webrtc.status}
                  deviceNames={deviceNames}
                  onConnectToDevice={webrtc.connectToDevice}
                  getDetailedStatus={webrtc.getDetailedStatus}
                />
                
                {/* Enhanced Debug Controls with Input Router info */}
                <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                  <h4 className="text-yellow-300 font-medium mb-2">Debug Controls</h4>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={manualConnectAll}
                      disabled={!webrtc.status.isInitialized}
                      className={`px-3 py-1 border rounded text-sm transition-colors ${
                        webrtc.status.isInitialized
                          ? 'bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-500/30 text-yellow-300'
                          : 'bg-gray-500/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Force Connect All
                    </button>
                    <button
                      onClick={() => webrtc.updateStatus()}
                      disabled={!webrtc.status.isInitialized}
                      className={`px-3 py-1 border rounded text-sm transition-colors ${
                        webrtc.status.isInitialized
                          ? 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/30 text-blue-300'
                          : 'bg-gray-500/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Refresh Status
                    </button>
                    <button
                      onClick={() => {
                        const stats = inputRouter.current?.getInputStats();
                        console.log('📊 Input Router Stats:', stats);
                      }}
                      className="px-3 py-1 border rounded text-sm bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30 text-purple-300"
                    >
                      Input Stats
                    </button>
                  </div>
                  
                  {/* Input Router Status */}
                  <div className="text-xs text-gray-300 space-y-1">
                    <div>• Input Router: {inputRouter.current ? '✅ Active' : '❌ Inactive'}</div>
                    <div>• Registered Devices: {inputRouter.current?.getRegisteredDevices().length || 0}</div>
                    <div>• Recent Inputs: {inputRouter.current?.getInputHistory(undefined, 5).length || 0}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Connection Info & Players List */}
          <div className="space-y-6">
            {/* Connection Info */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <QrCode className="text-indigo-300" />
                Join Game
              </h3>
              
              {isCreatingSession ? (
                <div className="mb-4 flex justify-center">
                  <div className="w-32 h-32 bg-gray-800/50 rounded-lg flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
                  </div>
                </div>
              ) : qrCodeData ? (
                <div className="mb-4 flex justify-center">
                  <img 
                    src={qrCodeData} 
                    alt="QR Code" 
                    className="w-32 h-32 rounded-lg border border-indigo-500/30" 
                  />
                </div>
              ) : (
                <div className="mb-4 flex justify-center">
                  <div className="w-32 h-32 bg-gray-800/50 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                    QR Code Error
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-indigo-300 block mb-1">Lobby Code</label>
                  <div className="bg-indigo-900/50 px-3 py-2 rounded border border-indigo-500/30 font-mono text-lg text-center">
                    {isCreatingSession ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400"></div>
                        <span className="text-indigo-400">Generating...</span>
                      </div>
                    ) : (
                      lobbyCode
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm text-indigo-300 block mb-1">Connection URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={connectionUrl}
                      readOnly
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                    />
                    <button
                      onClick={copyConnectionUrl}
                      disabled={!connectionUrl}
                      className={`px-3 py-2 rounded transition-colors ${
                        connectionUrl 
                          ? 'bg-indigo-500 hover:bg-indigo-600' 
                          : 'bg-gray-600 cursor-not-allowed'
                      }`}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Connected Players with Schema Info */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Users className="text-indigo-300" />
                Players ({players.filter(p => p.deviceType === 'phone').length}/4)
              </h3>
              <div className="space-y-3">
                {players.filter(p => p.deviceType === 'phone').length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3 animate-bounce">📱</div>
                    <p className="text-indigo-300 font-medium">Waiting for players...</p>
                    <p className="text-sm text-gray-400 mt-1">
                      First player to join becomes the host
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-indigo-400">
                      <div className="w-1 h-1 bg-indigo-400 rounded-full animate-ping"></div>
                      <div className="w-1 h-1 bg-indigo-400 rounded-full animate-ping" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-1 h-1 bg-indigo-400 rounded-full animate-ping" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                ) : (
                  players.filter(p => p.deviceType === 'phone').map((player) => {
                    const timeSinceLastSeen = Date.now() - player.lastSeen;
                    const isRecentlyActive = timeSinceLastSeen < 30000; // Within 30 seconds
                    
                    return (
                      <div key={player.id} className="flex items-center gap-3 p-3 bg-indigo-900/30 rounded-lg border border-indigo-500/20 transition-all hover:bg-indigo-900/40">
                        <div className={`w-3 h-3 rounded-full ${
                          webrtc.status.connectedDevices.includes(player.id) 
                            ? 'bg-green-400' 
                            : isRecentlyActive 
                              ? 'bg-yellow-400' 
                              : 'bg-gray-400'
                        } animate-pulse`}></div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{player.name}</span>
                            {player.isHost && (
                              <Crown size={16} className="text-yellow-400" />
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            {player.isHost ? 'Host' : 'Player'} • {
                              webrtc.status.connectedDevices.includes(player.id) 
                                ? 'WebRTC Connected'
                                : isRecentlyActive 
                                  ? 'Recently Active'
                                  : 'Inactive'
                            }
                          </div>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded ${
                          webrtc.status.connectedDevices.includes(player.id)
                            ? 'text-green-400 bg-green-400/10'
                            : isRecentlyActive
                              ? 'text-yellow-400 bg-yellow-400/10'
                              : 'text-gray-400 bg-gray-400/10'
                        }`}>
                          {webrtc.status.connectedDevices.includes(player.id) 
                            ? 'P2P' 
                            : isRecentlyActive 
                              ? 'Online' 
                              : 'Offline'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Enhanced System Status with Schema Info */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Wifi className="text-indigo-300" />
                System Status
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Database Schema:</span>
                  <span className="text-green-300">Enhanced ✨</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Host:</span>
                  <span className="text-yellow-300">
                    {players.find(p => p.isHost && p.deviceType === 'phone')?.name || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">WebRTC Status:</span>
                  <span className={`${webrtc.status.isInitialized ? 'text-green-300' : 'text-gray-300'}`}>
                    {webrtc.status.isInitialized ? 'Ready' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">P2P Connections:</span>
                  <span className="text-blue-300">
                    {webrtc.status.connectedDevices.length}/{Object.keys(webrtc.status.connections).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Input Router:</span>
                  <span className="text-purple-300">
                    {inputRouter.current ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Console ID:</span>
                  <span className="text-gray-300 font-mono text-xs">
                    {consoleDeviceId ? consoleDeviceId.slice(-8) : 'Loading...'}
                  </span>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <h4 className="font-medium text-purple-300 mb-2">Enhanced Features:</h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• Device Type Detection: ✅</li>
                  <li>• Input Source Identification: ✅</li>
                  <li>• Activity Tracking: ✅</li>
                  <li>• Enhanced Database Schema: ✅</li>
                  <li>• Connection Loop Fix: ✅</li>
                  {webrtc.status.lastError && (
                    <li className="text-red-300">• Error: {webrtc.status.lastError}</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsoleDisplay;