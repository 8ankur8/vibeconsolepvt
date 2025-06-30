import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Code, Users, QrCode, Copy, Check, Crown, Wifi, Activity, AlertCircle, Trash2, ArrowLeft } from 'lucide-react';
import { supabase, sessionHelpers, deviceHelpers, deviceInputHelpers } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import { WebRTCMessage } from '../lib/webrtc';
import { InputRouter, ControllerInput } from '../lib/inputRouter';
import EditorSelection from './EditorSelection';

interface Player {
  id: string;
  name: string;
  deviceType: 'phone' | 'console';
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
  status: string;
}

interface SelectedEditor {
  id: string;
  name: string;
  url: string;
  selectedBy: string;
  timestamp: number;
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // NEW: Selected editor state from Supabase
  const [selectedEditor, setSelectedEditor] = useState<SelectedEditor | null>(null);

  // InputRouter integration
  const inputRouterRef = useRef<InputRouter | null>(null);

  // Create device name mapping for WebRTC messages
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

  // Check Supabase connection
  const checkSupabaseConnection = async (): Promise<boolean> => {
    try {
      console.log('🔍 Checking Supabase connection...');
      
      const { data, error } = await supabase
        .from('sessions')
        .select('id')
        .limit(1);

      if (error) {
        console.error('❌ Supabase connection check failed:', error);
        setConnectionError(`Database error: ${error.message}`);
        return false;
      }

      console.log('✅ Supabase connection successful');
      setConnectionError(null);
      return true;
    } catch (error) {
      console.error('❌ Supabase connection check exception:', error);
      setConnectionError(`Network error: ${error.message || 'Failed to connect to database'}`);
      return false;
    }
  };

  // Retry connection with exponential backoff
  const retryConnection = async (maxRetries: number = 3): Promise<boolean> => {
    setIsRetrying(true);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 Connection attempt ${attempt}/${maxRetries}`);
      
      const isConnected = await checkSupabaseConnection();
      if (isConnected) {
        setIsRetrying(false);
        return true;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    setIsRetrying(false);
    return false;
  };

  // Enhanced WebRTC message handler
  const handleWebRTCMessage = useCallback((message: WebRTCMessage, fromDeviceId: string) => {
    const deviceName = deviceNames[fromDeviceId] || 'Unknown Device';
    console.log(`📩 [CONSOLE] WebRTC Message from ${deviceName} (${fromDeviceId.slice(-8)}):`, message);
    
    // Process through InputRouter first
    if (inputRouterRef.current) {
      console.log(`🎮 [CONSOLE] Processing message through InputRouter...`);
      const processedInput = inputRouterRef.current.processWebRTCInput(fromDeviceId, message);
      if (processedInput) {
        console.log(`✅ [CONSOLE] InputRouter processed input from ${deviceName}:`, processedInput);
      } else {
        console.log(`⚠️ [CONSOLE] InputRouter failed to process input from ${deviceName}`);
      }
    } else {
      console.log(`❌ [CONSOLE] InputRouter not available!`);
    }
    
    // Handle different message types for debugging
    switch (message.type) {
      case 'navigation':
        console.log(`🎮 [CONSOLE] Navigation input from ${deviceName}:`, message.data);
        break;
      case 'selection':
        console.log(`👆 [CONSOLE] Selection input from ${deviceName}:`, message.data);
        break;
      case 'game_data':
        console.log(`🎯 [CONSOLE] Game data from ${deviceName}:`, message.data);
        break;
      case 'heartbeat':
        console.log(`💓 [CONSOLE] Heartbeat from ${deviceName}`);
        deviceHelpers.updateDeviceActivity?.(fromDeviceId);
        break;
      default:
        console.log(`❓ [CONSOLE] Unknown message type from ${deviceName}:`, message);
    }
  }, [deviceNames]);

  // WebRTC integration with enhanced logging
  const webrtc = useWebRTC({
    sessionId,
    deviceId: consoleDeviceId,
    isHost: true,
    onMessage: handleWebRTCMessage,
    enabled: sessionId !== '' && consoleDeviceId !== '' && isLobbyLocked && !connectionError
  });

  // Initialize InputRouter with enhanced logging
  useEffect(() => {
    if (sessionId && consoleDeviceId) {
      console.log('🎮 [CONSOLE] Initializing InputRouter');
      inputRouterRef.current = new InputRouter((input) => {
        console.log(`🎯 [CONSOLE] InputRouter processed input:`, input);
      });

      // Register console device
      inputRouterRef.current.registerDevice(consoleDeviceId, 'Console', 'console');
      console.log('✅ [CONSOLE] InputRouter initialized and console device registered');
    }

    return () => {
      if (inputRouterRef.current) {
        inputRouterRef.current.clear();
        inputRouterRef.current = null;
        console.log('🧹 [CONSOLE] InputRouter cleaned up');
      }
    };
  }, [sessionId, consoleDeviceId]);

  // Register devices with InputRouter when players change
  useEffect(() => {
    if (inputRouterRef.current && players.length > 0) {
      console.log('🎮 [CONSOLE] Registering devices with InputRouter');
      players.forEach(player => {
        inputRouterRef.current!.registerDevice(player.id, player.name, player.deviceType);
        console.log(`📱 [CONSOLE] Registered device: ${player.name} (${player.deviceType})`);
      });
    }
  }, [players]);

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

  // Create session with connection check
  const createSession = async () => {
    try {
      setIsCreatingSession(true);
      setConnectionError(null);

      const isConnected = await checkSupabaseConnection();
      if (!isConnected) {
        console.log('🔄 Attempting to retry connection...');
        const retrySuccess = await retryConnection();
        if (!retrySuccess) {
          setIsCreatingSession(false);
          return;
        }
      }

      const code = generateLobbyCode();
      const baseUrl = window.location.origin;
      const connectionUrl = `${baseUrl}/controller?lobby=${code}`;
      
      console.log('🚀 Creating session with code:', code);
      
      const session = await sessionHelpers.createSession(code);
      if (!session) {
        console.error('❌ Failed to create session');
        setConnectionError('Failed to create session. Please check your database connection.');
        setIsCreatingSession(false);
        return;
      }

      console.log('✅ Session created:', session);

      const consoleDevice = await deviceHelpers.createDevice(
        session.id,
        'Console',
        'console',
        true
      );

      if (!consoleDevice) {
        console.error('❌ Failed to create console device');
        setConnectionError('Failed to create console device. Please check your database connection.');
        setIsCreatingSession(false);
        return;
      }

      console.log('✅ Console device created:', consoleDevice);

      const qrCode = await generateQRCode(connectionUrl);

      setSessionId(session.id);
      setConsoleDeviceId(consoleDevice.id);
      setLobbyCode(code);
      setConnectionUrl(connectionUrl);
      setQrCodeData(qrCode);
      setIsCreatingSession(false);
      setConnectionError(null);

      console.log('🎉 Session setup complete:', {
        sessionId: session.id,
        consoleDeviceId: consoleDevice.id,
        lobbyCode: code
      });
    } catch (error) {
      console.error('❌ Error creating session:', error);
      setConnectionError(`Failed to create session: ${error.message || 'Unknown error'}`);
      setIsCreatingSession(false);
    }
  };

  // Load devices with connection error handling
  const loadDevices = useCallback(async () => {
    if (!sessionId || connectionError) return;

    try {
      const devices = await deviceHelpers.getSessionDevices(sessionId);

      const mappedPlayers: Player[] = devices.map((device) => ({
        id: device.id,
        name: device.name,
        deviceType: device.device_type || (device.name === 'Console' ? 'console' : 'phone'),
        isHost: device.is_host || false,
        joinedAt: typeof device.joined_at === 'number' 
          ? device.joined_at 
          : new Date(device.joined_at || device.connected_at || '').getTime(),
        lastSeen: new Date(device.last_seen || device.connected_at || '').getTime(),
        status: 'connected'
      }));

      setPlayers(mappedPlayers);
      console.log('✅ Players loaded:', mappedPlayers);

    } catch (error) {
      console.error('❌ Error loading devices:', error);
      if (error.message?.includes('fetch')) {
        setConnectionError('Network error: Unable to load devices. Please check your connection.');
      }
    }
  }, [sessionId, connectionError]);

  // NEW: Load session status with selected editor parsing
  const loadSessionStatus = useCallback(async () => {
    if (!sessionId || connectionError) return;

    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('is_locked, selected_editor')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('❌ Error loading session status:', error);
        if (error.message?.includes('fetch') || error.code === 'PGRST301') {
          setConnectionError('Network error: Unable to load session status. Please check your connection.');
        }
        return;
      }

      const wasLocked = isLobbyLocked;
      const nowLocked = session.is_locked || false;
      
      setIsLobbyLocked(nowLocked);
      
      // NEW: Parse selected_editor field
      if (session.selected_editor) {
        try {
          const editorData = JSON.parse(session.selected_editor);
          
          // Check if this is an editor selection (not navigation data)
          if (editorData.selectedEditor && editorData.selectedEditorName) {
            console.log('🎯 [CONSOLE] Editor selected via Supabase:', editorData.selectedEditorName);
            
            // Map editor data to our format
            const editorUrls = {
              'bolt': 'https://bolt.new',
              'loveable': 'https://loveable.dev',
              'co': 'https://co.dev'
            };
            
            setSelectedEditor({
              id: editorData.selectedEditor,
              name: editorData.selectedEditorName,
              url: editorUrls[editorData.selectedEditor] || 'https://bolt.new',
              selectedBy: editorData.selectedBy || 'Host',
              timestamp: editorData.selectionTimestamp || Date.now()
            });
          }
        } catch (parseError) {
          console.log('⚠️ [CONSOLE] Could not parse selected_editor field:', parseError);
          // Not an error - might be navigation data or other format
        }
      }
      
      if (!wasLocked && nowLocked) {
        console.log('🔒 Lobby locked - switching to editor selection');
      }
      
    } catch (error) {
      console.error('❌ Error loading session status:', error);
      if (error.message?.includes('fetch')) {
        setConnectionError('Network error: Unable to load session status. Please check your connection.');
      }
    }
  }, [sessionId, isLobbyLocked, connectionError]);

  // NEW: Clear selected editor and return to editor selection
  const clearSelectedEditor = async () => {
    console.log('🔙 [CONSOLE] Clearing selected editor');
    
    try {
      // Clear the selected_editor field in Supabase
      const { error } = await supabase
        .from('sessions')
        .update({ selected_editor: null })
        .eq('id', sessionId);

      if (error) {
        console.error('❌ [CONSOLE] Error clearing selected editor:', error);
        return;
      }

      // Clear local state
      setSelectedEditor(null);
      console.log('✅ [CONSOLE] Selected editor cleared successfully');
    } catch (error) {
      console.error('💥 [CONSOLE] Exception clearing selected editor:', error);
    }
  };

  // WebRTC connection management
  const connectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const initializeWebRTCConnections = useCallback(async () => {
    if (!sessionId || !consoleDeviceId || !isLobbyLocked || !webrtc.status.isInitialized || connectionError) {
      return;
    }

    if (isConnectingRef.current) {
      console.log('⚠️ Connection attempt already in progress, skipping...');
      return;
    }

    isConnectingRef.current = true;

    try {
      const phoneControllers = players.filter(player => 
        player.deviceType === 'phone' && player.id !== consoleDeviceId
      );

      if (phoneControllers.length === 0) {
        console.log('📱 No phone controllers to connect to');
        return;
      }

      const { connections, connectedDevices } = webrtc.status;
      
      console.log('📊 [CONSOLE] WebRTC Connection Analysis:', {
        totalPhoneControllers: phoneControllers.length,
        phoneControllers: phoneControllers.map(p => ({ name: p.name, id: p.id.slice(-8) })),
        totalConnections: Object.keys(connections).length,
        connectedDevices: connectedDevices.length
      });

      const needConnection = phoneControllers.filter(player => {
        const hasConnection = connections.hasOwnProperty(player.id);
        const isConnected = connectedDevices.includes(player.id);
        const connectionState = connections[player.id];
        
        const needsConnection = !hasConnection || 
          (connectionState !== 'connected' && connectionState !== 'connecting');
        
        if (needsConnection) {
          console.log(`🔍 [CONSOLE] ${player.name} needs connection:`, {
            hasConnection,
            isConnected,
            connectionState
          });
        }
        
        return needsConnection;
      });

      for (const controller of needConnection) {
        try {
          console.log(`🤝 [CONSOLE] Connecting to ${controller.name} (${controller.id.slice(-8)})`);
          await webrtc.connectToDevice(controller.id);
          
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
          console.error(`❌ [CONSOLE] Failed to connect to ${controller.name}:`, error);
        }
      }

      console.log('📋 [CONSOLE] WebRTC Connection Summary:', {
        phoneControllers: phoneControllers.length,
        attempted: needConnection.length,
        currentConnections: Object.keys(webrtc.status.connections).length,
        currentConnected: webrtc.status.connectedDevices.length
      });

    } catch (error) {
      console.error('❌ [CONSOLE] Error in WebRTC connection management:', error);
    } finally {
      isConnectingRef.current = false;
    }
  }, [sessionId, consoleDeviceId, isLobbyLocked, players, webrtc.status.isInitialized, webrtc.connectToDevice, connectionError]);

  // Set up connection management
  useEffect(() => {
    if (!sessionId || !consoleDeviceId || !isLobbyLocked || !webrtc.status.isInitialized || connectionError) {
      if (connectionIntervalRef.current) {
        clearInterval(connectionIntervalRef.current);
        connectionIntervalRef.current = null;
      }
      return;
    }

    console.log('🔄 [CONSOLE] Starting WebRTC connection management');

    const initialTimeout = setTimeout(() => {
      initializeWebRTCConnections();
    }, 3000);

    connectionIntervalRef.current = setInterval(() => {
      initializeWebRTCConnections();
    }, 10000);

    return () => {
      console.log('🧹 [CONSOLE] Cleaning up WebRTC connection management');
      clearTimeout(initialTimeout);
      if (connectionIntervalRef.current) {
        clearInterval(connectionIntervalRef.current);
        connectionIntervalRef.current = null;
      }
    };
  }, [sessionId, consoleDeviceId, isLobbyLocked, webrtc.status.isInitialized, initializeWebRTCConnections, connectionError]);

  // Manual retry connection
  const handleRetryConnection = async () => {
    console.log('🔄 [CONSOLE] Manual retry connection triggered');
    const success = await retryConnection();
    if (success) {
      await loadDevices();
      await loadSessionStatus();
    }
  };

  // Create session on component mount
  useEffect(() => {
    createSession();
  }, []);

  // Set up real-time subscriptions with connection error handling
  useEffect(() => {
    if (sessionId && !connectionError) {
      loadDevices();
      loadSessionStatus();
      
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
          if (status === 'CHANNEL_ERROR') {
            setConnectionError('Real-time connection lost. Please refresh the page.');
          }
        });

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
          if (status === 'CHANNEL_ERROR') {
            setConnectionError('Real-time connection lost. Please refresh the page.');
          }
        });

      return () => {
        console.log('🧹 Cleaning up subscriptions');
        devicesChannel.unsubscribe();
        sessionChannel.unsubscribe();
      };
    }
  }, [sessionId, loadDevices, loadSessionStatus, connectionError]);

  // Backup refresh interval with connection error handling
  useEffect(() => {
    if (!sessionId || connectionError) return;

    const interval = setInterval(() => {
      loadDevices();
      loadSessionStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionId, loadDevices, loadSessionStatus, connectionError]);

  const copyConnectionUrl = async () => {
    try {
      await navigator.clipboard.writeText(connectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('❌ Failed to copy URL:', err);
    }
  };

  // NEW: Show selected editor in fullscreen iframe if one is selected
  if (selectedEditor) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
          <button
            onClick={clearSelectedEditor}
            className="bg-black/50 hover:bg-black/70 text-white p-3 rounded-full backdrop-blur-md border border-white/20 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-lg px-4 py-2 text-white">
            <div className="flex items-center gap-2">
              <Code size={20} className="text-indigo-300" />
              <span className="font-medium">{selectedEditor.name}</span>
              <span className="text-xs text-gray-400">
                Selected by {selectedEditor.selectedBy}
              </span>
            </div>
          </div>
        </div>
        
        <iframe
          src={selectedEditor.url}
          className="w-full h-full border-0"
          title={selectedEditor.name}
          allow="fullscreen"
        />
      </div>
    );
  }

  // NEW: Show editor selection when lobby is locked (but no editor selected yet)
  if (isLobbyLocked && !selectedEditor) {
    return (
      <EditorSelection
        sessionId={sessionId}
        lobbyCode={lobbyCode}
        players={players}
        onBack={() => setIsLobbyLocked(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-indigo-900 text-white">
      {/* Header */}
      <header className="p-4 border-b border-indigo-500/20 backdrop-blur-md bg-black/20">
        <div className="container mx-auto flex justify-between items-center">
          <a href="/" className="flex items-center gap-2">
            <Code size={28} className="text-indigo-300" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
              VibeConsole
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {lobbyCode}
          </div>
        </a>
      </header>
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Game Area */}
          <div className="lg:col-span-2">
            <div className="bg-black/20 rounded-lg p-8 border border-indigo-500/20 h-96 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 animate-pulse"></div>
              </div>
              
              <div className="relative z-10 text-center">
                <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                  Waiting for team
                </h2>
                <p className="text-indigo-200 mb-8 text-center max-w-md">
                  Scan the QR to join the lobby
                </p>
                {players.filter(p => p.deviceType === 'phone').length === 0 ? (
                  <div className="text-center">
                    <div className="text-6xl mb-4 animate-bounce">🎮</div>
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
                    
                    {/* Player avatars */}
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
          </div>
               
          {/* Sidebar */}
          <div className="space-y-6">
            {/* Connection Info */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <QrCode className="text-indigo-300" />
                Join Lobby
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
                      lobbyCode || 'ERROR'
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsoleDisplay;