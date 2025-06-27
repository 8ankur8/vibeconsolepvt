import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Code, Users, QrCode, Copy, Check, Crown, Wifi, Activity, AlertCircle, Trash2 } from 'lucide-react';
import { supabase, sessionHelpers, deviceHelpers } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import { WebRTCMessage } from '../lib/webrtc';
import { InputRouter, ControllerInput } from '../lib/inputRouter';
import EditorSelection from './EditorSelection';
import WebRTCDebugPanel from './WebRTCDebugPanel';

interface Player {
  id: string;
  name: string;
  deviceType: 'phone' | 'console';
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
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
  const [lastProcessedInput, setLastProcessedInput] = useState<ControllerInput | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [navigationEvents, setNavigationEvents] = useState<any[]>([]);
  const [lastNavigationDirection, setLastNavigationDirection] = useState<string>('');
  const [currentEditorIndex, setCurrentEditorIndex] = useState(0);
  const [editorNavigationData, setEditorNavigationData] = useState(null);
  // ✅ NEW: Phone logs state
  const [phoneLogs, setPhoneLogs] = useState<any[]>([]);

  // InputRouter integration
  const inputRouterRef = useRef<InputRouter | null>(null);

  // Create device name mapping for WebRTC messages and debug panel
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

  // Check Supabase connection
  const checkSupabaseConnection = async (): Promise<boolean> => {
    try {
      console.log('🔍 Checking Supabase connection...');
      
      // Simple health check by trying to select from sessions table
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
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    setIsRetrying(false);
    return false;
  };

  // ENHANCED: Improved message handler for WebRTC messages with better logging
  const handleWebRTCMessage = useCallback((message: WebRTCMessage, fromDeviceId: string) => {
    const deviceName = deviceNames[fromDeviceId] || 'Unknown Device';
    console.log(`📩 [CONSOLE] WebRTC Message from ${deviceName} (${fromDeviceId.slice(-8)}):`, message);
    
    // CRITICAL: Process through InputRouter first
    if (inputRouterRef.current) {
      console.log(`🎮 [CONSOLE] Processing message through InputRouter...`);
      const processedInput = inputRouterRef.current.processWebRTCInput(fromDeviceId, message);
      if (processedInput) {
        console.log(`✅ [CONSOLE] InputRouter processed input from ${deviceName}:`, processedInput);
        setLastProcessedInput(processedInput);
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
        deviceHelpers.updateDeviceActivity(fromDeviceId);
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

  // Enhanced navigation handler function
const handleNavigation = (direction: string, deviceId: string, source: 'webrtc' | 'supabase' = 'webrtc') => {
  const deviceName = deviceNames[deviceId] || 'Unknown';
  console.log(`🎮 [CONSOLE] Navigation: ${direction} from ${deviceName} (${deviceId.slice(-8)}) via ${source}`);
  
  setLastNavigationDirection(direction);
  setNavigationEvents(prev => [...prev.slice(-9), {
    direction,
    deviceId: deviceId.slice(-8),
    deviceName,
    source,
    timestamp: new Date().toLocaleTimeString()
  }]);

if (isLobbyLocked) {
    handleEditorGridNavigation(direction);
  }

  console.log(`📤 [CONSOLE] Navigation forwarded to EditorSelection:`, navigationData);
};

// 3. ADD EDITOR GRID NAVIGATION HANDLER
const handleEditorGridNavigation = (direction: string) => {
  const editors = ['Bolt.new', 'Loveable', 'Firebase', 'Supabase']; // Example editors
  
  switch (direction) {
    case 'left':
      setCurrentEditorIndex(prev => Math.max(0, prev - 1));
      console.log('⬅️ [CONSOLE] Editor selection: moved left');
      break;
    case 'right':
      setCurrentEditorIndex(prev => Math.min(editors.length - 1, prev + 1));
      console.log('➡️ [CONSOLE] Editor selection: moved right');
      break;
    case 'up':
      // Handle up navigation if you have a grid layout
      console.log('⬆️ [CONSOLE] Editor selection: moved up');
      break;
    case 'down':
      // Handle down navigation if you have a grid layout
      console.log('⬇️ [CONSOLE] Editor selection: moved down');
      break;
  }
  
  console.log(`🎯 [CONSOLE] Current editor index: ${currentEditorIndex} (${editors[currentEditorIndex]})`);
};


 const handleSelection = (deviceId: string, source: 'webrtc' | 'supabase' = 'webrtc') => {
  const deviceName = deviceNames[deviceId] || 'Unknown';
  console.log(`🎯 [CONSOLE] Selection from ${deviceName} (${deviceId.slice(-8)}) via ${source}`);
  
  setNavigationEvents(prev => [...prev.slice(-9), {
    direction: 'SELECT',
    deviceId: deviceId.slice(-8),
    deviceName,
    source,
    timestamp: new Date().toLocaleTimeString()
  }]);

  // 🎯 FORWARD SELECTION TO EDITOR
  const selectionData = {
    action: 'select',
    deviceId,
    deviceName,
    source,
    selectedIndex: currentEditorIndex,
    timestamp: Date.now()
  };
  
  setEditorNavigationData(selectionData);
  console.log(`📤 [CONSOLE] Selection forwarded to EditorSelection:`, selectionData);
  
  // Handle editor launch logic
  if (isLobbyLocked) {
    console.log('🚀 [CONSOLE] Launching selected editor...');
    // Add your editor launch logic here
  }
};

// 3. ENHANCE YOUR EXISTING handleWebRTCMessage FUNCTION
// Replace your existing handleWebRTCMessage function with this enhanced version:

const handleWebRTCMessage = useCallback((message: WebRTCMessage, fromDeviceId: string) => {
  const deviceName = deviceNames[fromDeviceId] || 'Unknown Device';
  console.log(`📩 [CONSOLE] WebRTC Message from ${deviceName} (${fromDeviceId.slice(-8)}):`, message);
  
  // CRITICAL: Process through InputRouter first
  if (inputRouterRef.current) {
    console.log(`🎮 [CONSOLE] Processing message through InputRouter...`);
    const processedInput = inputRouterRef.current.processWebRTCInput(fromDeviceId, message);
    if (processedInput) {
      console.log(`✅ [CONSOLE] InputRouter processed input from ${deviceName}:`, processedInput);
      setLastProcessedInput(processedInput);
    } else {
      console.log(`⚠️ [CONSOLE] InputRouter failed to process input from ${deviceName}`);
    }
  } else {
    console.log(`❌ [CONSOLE] InputRouter not available!`);
  }
  
  // ENHANCED: Handle navigation messages with our new functions
  if (message.type === 'game_data' && message.data) {
    const { data } = message;
    
    // Handle D-pad navigation
    if (data.dpad?.directionchange) {
      const direction = data.dpad.directionchange.key;
      handleNavigation(direction, fromDeviceId, 'webrtc');
    }
    
    // Handle button presses
    if (data.button?.a?.pressed) {
      handleSelection(fromDeviceId, 'webrtc');
    }
  }
  
  // Handle different message types for debugging
  switch (message.type) {
    case 'navigation':
      console.log(`🎮 [CONSOLE] Navigation input from ${deviceName}:`, message.data);
      if (message.data.direction) {
        handleNavigation(message.data.direction, fromDeviceId, 'webrtc');
      }
      break;
    case 'selection':
      console.log(`👆 [CONSOLE] Selection input from ${deviceName}:`, message.data);
      handleSelection(fromDeviceId, 'webrtc');
      break;
    case 'game_data':
      console.log(`🎯 [CONSOLE] Game data from ${deviceName}:`, message.data);
      break;
    case 'heartbeat':
      console.log(`💓 [CONSOLE] Heartbeat from ${deviceName}`);
      deviceHelpers.updateDeviceActivity(fromDeviceId);
      break;
    default:
      console.log(`❓ [CONSOLE] Unknown message type from ${deviceName}:`, message);
  }
}, [deviceNames, handleNavigation, handleSelection]);

  const navigationData = {
    direction,
    deviceId,
    deviceName,
    source,
    timestamp: Date.now()
  };
  
  setEditorNavigationData(navigationData);

  
  // Initialize InputRouter with enhanced logging
  useEffect(() => {
    if (sessionId && consoleDeviceId) {
      console.log('🎮 [CONSOLE] Initializing InputRouter');
      inputRouterRef.current = new InputRouter((input) => {
        console.log(`🎯 [CONSOLE] InputRouter processed input:`, input);
        setLastProcessedInput(input);
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

  // ✅ NEW: Listen for phone logs from all devices
  useEffect(() => {
    if (!sessionId) return;

    console.log('📱➡️🖥️ [CONSOLE] Setting up phone log listener for session:', sessionId);

    const phoneLogChannel = supabase
      .channel(`phone_logs_${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'phone_logs',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        const newLog = payload.new;
        console.log('📱➡️🖥️ [CONSOLE] Phone Log Received:', newLog.message);
        
        setPhoneLogs(prev => {
          const updated = [...prev, newLog];
          // Keep only last 50 logs to prevent memory issues
          return updated.slice(-50);
        });
      })
      .subscribe((status) => {
        console.log('📱 [CONSOLE] Phone logs subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ [CONSOLE] Phone log forwarding active - will receive all phone logs');
        }
      });

    return () => {
      console.log('🧹 [CONSOLE] Cleaning up phone log subscription');
      phoneLogChannel.unsubscribe();
    };
  }, [sessionId]);

  // ENHANCED: Listen for Supabase fallback inputs with connection error handling
 useEffect(() => {
  if (!sessionId || !isLobbyLocked || connectionError) return;

  console.log('📡 [CONSOLE] Setting up Supabase fallback input listener');

  const inputChannel = supabase
    .channel(`console_input_fallback_${sessionId}`)
    .on('postgres_changes', 
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, 
      (payload) => {
        const newData = payload.new as any;
        console.log('📡 [CONSOLE] Supabase session update received:', newData);
        
        if (newData.selected_editor) {
          try {
            const inputData = JSON.parse(newData.selected_editor);
            console.log('📡 [CONSOLE] Parsed input data:', inputData);
            
            // ENHANCED: Process navigation and selection with our new functions
            if (inputData.action === 'navigate' && inputData.direction) {
              handleNavigation(inputData.direction, inputData.playerId, 'supabase');
            } else if (inputData.action === 'select') {
              handleSelection(inputData.playerId, 'supabase');
            }
            
            // Process through InputRouter if it's a navigation/selection input
            if (inputRouterRef.current && inputData.playerId && (inputData.action === 'navigate' || inputData.action === 'select')) {
              console.log('🎮 [CONSOLE] Processing Supabase input through InputRouter');
              
              const processedInput = inputRouterRef.current.processSupabaseInput(inputData.playerId, {
                type: inputData.action === 'navigate' ? 'dpad' : 'button',
                action: inputData.action === 'navigate' ? inputData.direction : 'a',
                data: inputData,
                timestamp: inputData.timestamp || Date.now()
              });
              
              if (processedInput) {
                console.log('✅ [CONSOLE] Supabase input processed:', processedInput);
                setLastProcessedInput(processedInput);
              }
            }
          } catch (error) {
            console.error('❌ [CONSOLE] Error parsing Supabase input data:', error);
          }
        }
      }
    )
    .subscribe((status) => {
      console.log('📡 [CONSOLE] Supabase input fallback subscription status:', status);
    });

  return () => {
    console.log('🧹 [CONSOLE] Cleaning up Supabase input fallback subscription');
    inputChannel.unsubscribe();
  };
}, [sessionId, isLobbyLocked, connectionError, handleNavigation, handleSelection]);

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

  // ENHANCED: Create session with connection check
  const createSession = async () => {
    try {
      setIsCreatingSession(true);
      setConnectionError(null);

      // First check if Supabase is accessible
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
      
      // Step 1: Create session using helper
      const session = await sessionHelpers.createSession(code);
      if (!session) {
        console.error('❌ Failed to create session');
        setConnectionError('Failed to create session. Please check your database connection.');
        setIsCreatingSession(false);
        return;
      }

      console.log('✅ Session created:', session);

      // Step 2: Create console device using helper
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

      // Generate QR code
      const qrCode = await generateQRCode(connectionUrl);

      // Update state with all the new information
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

  // ENHANCED: Load devices with connection error handling
  const loadDevices = useCallback(async () => {
    if (!sessionId || connectionError) return;

    try {
      const devices = await deviceHelpers.getSessionDevices(sessionId);

      const mappedPlayers: Player[] = devices.map((device) => ({
        id: device.id,
        name: device.name,
        deviceType: device.device_type || (device.name === 'Console' ? 'console' : 'phone'),
        isHost: device.is_host || false,
        // FIXED: Handle both BIGINT (number) and legacy string timestamps
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

  // ENHANCED: Load session status with improved error handling
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

  // Manual connection trigger for debugging
  const manualConnectAll = async () => {
    console.log('🔧 [CONSOLE] Manual connection trigger activated');
    await initializeWebRTCConnections();
  };

  // Manual retry connection
  const handleRetryConnection = async () => {
    console.log('🔄 [CONSOLE] Manual retry connection triggered');
    const success = await retryConnection();
    if (success) {
      // Reload data after successful connection
      await loadDevices();
      await loadSessionStatus();
    }
  };

  // ENHANCED: Test input processing function
  const testInputProcessing = () => {
    console.log('🧪 [CONSOLE] Testing input processing...');
    
    if (!inputRouterRef.current) {
      console.log('❌ [CONSOLE] InputRouter not available for testing');
      return;
    }

    // Simulate a WebRTC message
    const testMessage = {
      type: 'game_data' as const,
      data: {
        dpad: {
          directionchange: {
            key: 'right',
            pressed: true
          }
        }
      },
      timestamp: Date.now(),
      senderId: 'test-device'
    };

    console.log('🧪 [CONSOLE] Simulating WebRTC message:', testMessage);
    const result = inputRouterRef.current.processWebRTCInput('test-device', testMessage);
    console.log('🧪 [CONSOLE] Test result:', result);
  };

  // ✅ NEW: Clear phone logs function
  const clearPhoneLogs = async () => {
    try {
      console.log('🗑️ [CONSOLE] Clearing phone logs...');
      await supabase
        .from('phone_logs')
        .delete()
        .eq('session_id', sessionId);
      setPhoneLogs([]);
      console.log('✅ [CONSOLE] Phone logs cleared');
    } catch (error) {
      console.error('❌ [CONSOLE] Failed to clear phone logs:', error);
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


  // Show connection error screen
  if (connectionError && !sessionId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-indigo-900 text-white flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8">
          <div className="mb-6">
            <AlertCircle size={64} className="text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-red-300 mb-2">Connection Error</h1>
            <p className="text-gray-300 mb-4">{connectionError}</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={handleRetryConnection}
              disabled={isRetrying}
              className={`w-full px-6 py-3 rounded-lg font-medium transition-colors ${
                isRetrying
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isRetrying ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Retrying...</span>
                </div>
              ) : (
                'Retry Connection'
              )}
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="w-full px-6 py-3 rounded-lg font-medium bg-gray-600 hover:bg-gray-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-left">
            <h3 className="text-yellow-300 font-medium mb-2">Troubleshooting:</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Check your internet connection</li>
              <li>• Verify Supabase configuration</li>
              <li>• Ensure environment variables are set</li>
              <li>• Try refreshing the page</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  
if (isLobbyLocked) {
  return (
    <EditorSelection
      sessionId={sessionId}
      lobbyCode={lobbyCode}
      players={players}
      onBack={() => setIsLobbyLocked(false)}
      webrtcStatus={webrtc.status}
      onWebRTCMessage={webrtc.broadcastMessage}
      lastControllerInput={lastProcessedInput}
      // 🎯 NEW: Pass navigation and selection data
      navigationData={editorNavigationData}
      currentEditorIndex={currentEditorIndex}
      onEditorIndexChange={setCurrentEditorIndex}
      // Clear navigation data after processing
      onNavigationProcessed={() => setEditorNavigationData(null)}
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
      {/* NEW: Last navigation display */}
      {lastNavigationDirection && (
        <div className="ml-4 flex items-center gap-2 bg-purple-900/30 px-3 py-1 rounded-full border border-purple-500/30">
          <span className="text-purple-300 text-sm">Last Input:</span>
          <span className="text-white font-mono bg-purple-500/20 px-2 py-1 rounded text-sm">
            {lastNavigationDirection}
          </span>
        </div>
      )}
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
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
        connectionError 
          ? 'bg-red-500/20 text-red-300' 
          : 'bg-green-500/20 text-green-300'
      }`}>
        <Wifi size={16} />
        <span>{connectionError ? 'Offline' : 'Live'}</span>
      </div>
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
      {/* <header className="p-4 border-b border-indigo-500/20 backdrop-blur-md bg-black/20">
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
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
              connectionError 
                ? 'bg-red-500/20 text-red-300' 
                : 'bg-green-500/20 text-green-300'
            }`}>
              <Wifi size={16} />
              <span>{connectionError ? 'Offline' : 'Live'}</span>
            </div>
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
      </header> */}

      {/* Connection Error Banner */}
      {connectionError && sessionId && (
        <div className="bg-red-500/20 border-b border-red-500/30 p-3">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-300">
              <AlertCircle size={16} />
              <span className="text-sm">{connectionError}</span>
            </div>
            <button
              onClick={handleRetryConnection}
              disabled={isRetrying}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                isRetrying
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </div>
      )}

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

            {/* Debug Panel */}

            {showDebugPanel && (
              
              <div className="mt-6 space-y-6">
                <div className="bg-cyan-900/20 border border-cyan-500/20 rounded-lg p-4">
    <h4 className="text-cyan-300 font-bold mb-3">🔗 Complete Data Flow Status</h4>
    
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-4 gap-2">
        {/* Step 1: Phone Input */}
        <div className={`p-2 rounded border text-center ${
          phoneLogs.length > 0 
            ? 'bg-green-500/20 border-green-500/30 text-green-300' 
            : 'bg-gray-500/20 border-gray-500/30 text-gray-400'
        }`}>
          <div className="text-xs font-bold">1. Phone Input</div>
          <div className="text-xs">{phoneLogs.length} logs</div>
        </div>
        
        {/* Step 2: Console Receives */}
        <div className={`p-2 rounded border text-center ${
          lastProcessedInput 
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' 
            : 'bg-gray-500/20 border-gray-500/30 text-gray-400'
        }`}>
          <div className="text-xs font-bold">2. Console Receives</div>
          <div className="text-xs">
            {lastProcessedInput ? `${lastProcessedInput.input.type}.${lastProcessedInput.input.action}` : 'None'}
          </div>
        </div>
        
        {/* Step 3: Navigation Processing */}
        <div className={`p-2 rounded border text-center ${
          navigationEvents.length > 0 
            ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' 
            : 'bg-gray-500/20 border-gray-500/30 text-gray-400'
        }`}>
          <div className="text-xs font-bold">3. Navigation</div>
          <div className="text-xs">{navigationEvents.length} events</div>
        </div>
        
        {/* Step 4: Editor Selection */}
        <div className={`p-2 rounded border text-center ${
          isLobbyLocked && editorNavigationData 
            ? 'bg-orange-500/20 border-orange-500/30 text-orange-300' 
            : 'bg-gray-500/20 border-gray-500/30 text-gray-400'
        }`}>
          <div className="text-xs font-bold">4. Editor Selection</div>
          <div className="text-xs">
            {isLobbyLocked ? `Index: ${currentEditorIndex}` : 'Locked required'}
          </div>
        </div>
      </div>
      
      <div className="border-t border-cyan-500/30 pt-3">
        <div className="text-cyan-300 font-medium mb-2">Current Flow Status:</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Phone → Console Transport:</span>
            <span className={webrtc.status.connectedDevices.length > 0 ? 'text-green-300' : 'text-orange-300'}>
              {webrtc.status.connectedDevices.length > 0 ? 'WebRTC P2P' : 'Supabase Fallback'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Console → InputRouter:</span>
            <span className={inputRouterRef.current ? 'text-green-300' : 'text-red-300'}>
              {inputRouterRef.current ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Console → EditorSelection:</span>
            <span className={isLobbyLocked ? 'text-green-300' : 'text-yellow-300'}>
              {isLobbyLocked ? 'Connected' : 'Waiting for lock'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last Navigation Data:</span>
            <span className="text-gray-300">
              {editorNavigationData ? 
                `${editorNavigationData.direction} (${editorNavigationData.source})` : 
                'None'
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
                <WebRTCDebugPanel
                  status={webrtc.status}
                  deviceNames={deviceNames}
                  onConnectToDevice={webrtc.connectToDevice}
                  getDetailedStatus={webrtc.getDetailedStatus}
                />
                
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <h4 className="text-green-300 font-medium mb-2">✅ InputRouter Integration</h4>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={manualConnectAll}
                      disabled={!webrtc.status.isInitialized || !!connectionError}
                      className={`px-3 py-1 border rounded text-sm transition-colors ${
                        webrtc.status.isInitialized && !connectionError
                          ? 'bg-green-500/20 hover:bg-green-500/30 border-green-500/30 text-green-300'
                          : 'bg-gray-500/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Force Connect All
                    </button>
                    <button
                      onClick={() => webrtc.updateStatus()}
                      disabled={!webrtc.status.isInitialized || !!connectionError}
                      className={`px-3 py-1 border rounded text-sm transition-colors ${
                        webrtc.status.isInitialized && !connectionError
                          ? 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/30 text-blue-300'
                          : 'bg-gray-500/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Refresh Status
                    </button>
                    <button
                      onClick={testInputProcessing}
                      disabled={!inputRouterRef.current || !!connectionError}
                      className={`px-3 py-1 border rounded text-sm transition-colors ${
                        inputRouterRef.current && !connectionError
                          ? 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30 text-purple-300'
                          : 'bg-gray-500/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      Test Input
                    </button>
                    {connectionError && (
                      <button
                        onClick={handleRetryConnection}
                        disabled={isRetrying}
                        className={`px-3 py-1 border rounded text-sm transition-colors ${
                          isRetrying
                            ? 'bg-gray-500/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                            : 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-300'
                        }`}
                      >
                        {isRetrying ? 'Retrying...' : 'Retry Connection'}
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    InputRouter active - processing structured game_data messages
                    {connectionError && (
                      <div className="text-red-400 mt-1">⚠️ Connection error detected</div>
                    )}
                  </div>
                  {lastProcessedInput && (
                    <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded text-xs">
                      <div className="text-purple-300 font-medium">Last Input:</div>
                      <div className="text-gray-300">
                        {lastProcessedInput.deviceName}: {lastProcessedInput.input.type}.{lastProcessedInput.input.action}
                        {lastProcessedInput.webrtcMessage ? ' (WebRTC)' : ' (Supabase)'}
                      </div>
                    </div>
                  )}
                </div>

                {/* ✅ NEW: Phone Logs Panel */}
                <div className="bg-pink-900/20 border border-pink-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-pink-300 font-bold flex items-center gap-2">
                      📱 Phone Controller Logs ({phoneLogs.length})
                    </h4>
                    <button
                      onClick={clearPhoneLogs}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-1 rounded text-sm border border-red-500/30 transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Clear
                    </button>
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto bg-black/30 rounded p-3 space-y-1">
                    {phoneLogs.length === 0 ? (
                      <div className="text-gray-500 text-center py-8">
                        <div className="text-4xl mb-2">📱</div>
                        <div>No phone logs yet</div>
                        <div className="text-sm mt-2">All phone console.log() calls will appear here in real-time</div>
                      </div>
                    ) : (
                      phoneLogs.map((log, i) => (
                        <div key={log.id || i} className="border-l-2 border-pink-500/30 pl-3 py-1">
                          <div className="flex items-start justify-between text-xs">
                            <span className="text-pink-400 font-medium">{log.device_name}</span>
                            <span className="text-gray-400">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className={`text-sm font-mono ${
                            log.message.includes('[ERROR]') ? 'text-red-300' :
                            log.message.includes('[WARN]') ? 'text-yellow-300' :
                            log.message.includes('[INFO]') ? 'text-blue-300' :
                            'text-gray-300'
                          }`}>
                            {log.message}
                          </div>
                          {log.log_data && (
                            <details className="mt-1">
                              <summary className="text-xs text-gray-400 cursor-pointer">Data</summary>
                              <pre className="text-xs text-gray-500 mt-1 bg-gray-800/50 p-2 rounded overflow-x-auto">
                                {typeof log.log_data === 'string' ? log.log_data : JSON.stringify(log.log_data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  
                  {phoneLogs.length > 0 && (
                    <div className="mt-3 text-xs text-gray-400 text-center">
                      Showing last {phoneLogs.length} logs • Auto-scrolls • Real-time updates from all phone controllers
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
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

            {/* Connected Players */}
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
                  </div>
                ) : (
                  players.filter(p => p.deviceType === 'phone').map((player) => {
                    const timeSinceLastSeen = Date.now() - player.lastSeen;
                    const isRecentlyActive = timeSinceLastSeen < 30000;
                    
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

            {/* System Status */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Wifi className="text-indigo-300" />
                System Status
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Database:</span>
                  <span className={connectionError ? 'text-red-300' : 'text-green-300'}>
                    {connectionError ? 'Disconnected ❌' : 'Connected ✅'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">InputRouter:</span>
                  <span className="text-green-300">{inputRouterRef.current ? 'Active ✅' : 'Inactive'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Phone Logs:</span>
                  <span className="text-pink-300">{phoneLogs.length} received ✅</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Input:</span>
                  <span className="text-purple-300">
                    {lastProcessedInput ? `${lastProcessedInput.input.type}.${lastProcessedInput.input.action}` : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Host:</span>
                  <span className="text-yellow-300">
                    {players.find(p => p.isHost && p.deviceType === 'phone')?.name || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">WebRTC Status:</span>
                  <span className={`${webrtc.status.isInitialized && !connectionError ? 'text-green-300' : 'text-gray-300'}`}>
                    {webrtc.status.isInitialized && !connectionError ? 'Ready' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">P2P Connections:</span>
                  <span className="text-blue-300">
                    {webrtc.status.connectedDevices.length}/{Object.keys(webrtc.status.connections).length}
                  </span>
                </div>
              </div>
              
              <div className={`mt-6 p-4 border rounded-lg ${
                connectionError 
                  ? 'bg-red-500/10 border-red-500/20' 
                  : 'bg-green-500/10 border-green-500/20'
              }`}>
                <h4 className={`font-medium mb-2 ${
                  connectionError ? 'text-red-300' : 'text-green-300'
                }`}>
                  {connectionError ? '⚠️ System Issues:' : '✅ System Health:'}
                </h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• InputRouter: ✅ Integrated</li>
                  <li>• Game Data Format: ✅ Structured</li>
                  <li>• Phone Log Forwarding: ✅ Active</li>
                  <li>• WebRTC Processing: {connectionError ? '⚠️ Limited' : '✅ Active'}</li>
                  <li>• Fallback Support: {connectionError ? '❌ Unavailable' : '✅ Supabase'}</li>
                  <li>• Real-time Updates: {connectionError ? '❌ Offline' : '✅ Active'}</li>
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