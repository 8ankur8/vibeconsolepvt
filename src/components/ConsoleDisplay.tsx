import React, { useState, useEffect } from 'react';
import { Code, Users, QrCode, Copy, Check, Lock, Crown, Wifi, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import EditorSelection from './EditorSelection';
import WebRTCDebugPanel from './WebRTCDebugPanel';

interface Player {
  id: string;
  name: string;
  deviceType: string;
  isHost: boolean;
  joinedAt: number;
  status: string;
}

const ConsoleDisplay: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>('');
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [connectionUrl, setConnectionUrl] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLobbyLocked, setIsLobbyLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // WebRTC integration
  const webrtc = useWebRTC({
    sessionId,
    deviceId: 'console', // Console acts as a special device
    isHost: true,
    onMessage: (message, fromDeviceId) => {
      console.log('📩 Received WebRTC message from', fromDeviceId, ':', message);
      // Handle WebRTC messages here (navigation, selection, etc.)
    },
    enabled: sessionId !== '' && isLobbyLocked
  });

  // Create device name mapping for debug panel
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

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
      console.error('Error generating QR code:', error);
      return '';
    }
  };

  // Create session in Supabase (NO HOST CREATION)
  const createSession = async () => {
    try {
      setIsCreatingSession(true);
      const code = generateLobbyCode();
      const baseUrl = window.location.origin;
      const connectionUrl = `${baseUrl}/controller?lobby=${code}`;
      
      // Insert session into Supabase - NO HOST CREATION
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          code,
          is_active: true,
          is_locked: false,
          selected_editor: null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating session:', error);
        return;
      }

      // Generate QR code
      const qrCode = await generateQRCode(connectionUrl);

      setSessionId(session.id);
      setLobbyCode(code);
      setConnectionUrl(connectionUrl);
      setQrCodeData(qrCode);
      setIsCreatingSession(false);

      console.log('Session created (no host):', session);
    } catch (error) {
      console.error('Error creating session:', error);
      setIsCreatingSession(false);
    }
  };

  // Load devices for the session
  const loadDevices = async () => {
    if (!sessionId) return;

    try {
      const { data: devices, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .order('connected_at', { ascending: true });

      if (error) {
        console.error('Error loading devices:', error);
        return;
      }

      const mappedPlayers: Player[] = devices.map((device, index) => ({
        id: device.id,
        name: device.name,
        deviceType: 'phone',
        isHost: device.is_leader || false, // Use database field
        joinedAt: new Date(device.connected_at || '').getTime(),
        status: 'connected'
      }));

      setPlayers(mappedPlayers);
      console.log('Players loaded:', mappedPlayers);

    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  // Load session status
  const loadSessionStatus = async () => {
    if (!sessionId) return;

    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('is_locked, selected_editor')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('Error loading session status:', error);
        return;
      }

      const wasLocked = isLobbyLocked;
      const nowLocked = session.is_locked || false;
      
      setIsLobbyLocked(nowLocked);
      
      // INSTANT REDIRECT: If lobby just got locked, immediately switch to editor selection
      if (!wasLocked && nowLocked) {
        console.log('Lobby locked - instantly switching to editor selection');
        // Initialize WebRTC connections to all players
        initializeWebRTCConnections();
      }
      
    } catch (error) {
      console.error('Error loading session status:', error);
    }
  };

  // Initialize WebRTC connections to all players
  const initializeWebRTCConnections = async () => {
    console.log('🚀 Initializing WebRTC connections to all players');
    
    // Wait a moment for WebRTC to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    for (const player of players) {
      if (player.id !== 'console') { // Don't connect to ourselves
        console.log(`🤝 Connecting to player: ${player.name} (${player.id})`);
        await webrtc.connectToDevice(player.id);
      }
    }
  };

  useEffect(() => {
    // Create session on component mount
    createSession();
  }, []);

  useEffect(() => {
    if (sessionId) {
      // Initial load
      loadDevices();
      loadSessionStatus();
      
      // Set up real-time subscription for devices with proper channel naming
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
            console.log('Device change detected:', payload);
            // Reload devices immediately when any change occurs
            loadDevices();
          }
        )
        .subscribe((status) => {
          console.log('Devices subscription status:', status);
        });

      // Set up real-time subscription for session changes with proper channel naming
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
            console.log('Session change detected:', payload);
            // INSTANT RELOAD: Reload session status immediately when changes occur
            loadSessionStatus();
          }
        )
        .subscribe((status) => {
          console.log('Session subscription status:', status);
        });

      // Cleanup function
      return () => {
        console.log('Cleaning up subscriptions');
        devicesChannel.unsubscribe();
        sessionChannel.unsubscribe();
      };
    }
  }, [sessionId, isLobbyLocked]); // Added isLobbyLocked to dependencies

  // Reduced backup refresh interval for faster response
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(() => {
      loadDevices();
      loadSessionStatus();
    }, 2000); // Reduced from 5 seconds to 2 seconds

    return () => clearInterval(interval);
  }, [sessionId]);

  const copyConnectionUrl = async () => {
    try {
      await navigator.clipboard.writeText(connectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  // INSTANT TRANSITION: Show editor selection immediately when lobby is locked
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
              <span>{players.length}/4 players</span>
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
            {/* WebRTC Status Indicator */}
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
                
                {players.length === 0 ? (
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
                      {players.length} player{players.length > 1 ? 's' : ''} connected!
                    </p>
                    {players.find(p => p.isHost) && (
                      <p className="text-purple-300 text-sm mt-2 flex items-center justify-center gap-1">
                        <Crown size={16} className="text-yellow-400" />
                        Host: {players.find(p => p.isHost)?.name}
                      </p>
                    )}
                    <p className="text-gray-400 text-sm mt-2">
                      Waiting for host to lock the lobby...
                    </p>
                    
                    {/* Player avatars */}
                    <div className="flex justify-center gap-2 mt-4">
                      {players.map((player, index) => (
                        <div key={player.id} className="relative">
                          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg border-2 border-white/20">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          {player.isHost && (
                            <Crown size={12} className="absolute -top-1 -right-1 text-yellow-400" />
                          )}
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* WebRTC Debug Panel */}
            {showDebugPanel && (
              <div className="mt-6">
                <WebRTCDebugPanel
                  status={webrtc.status}
                  deviceNames={deviceNames}
                  onConnectToDevice={webrtc.connectToDevice}
                />
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

            {/* Connected Players */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Users className="text-indigo-300" />
                Players ({players.length}/4)
              </h3>
              <div className="space-y-3">
                {players.length === 0 ? (
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
                  players.map((player) => (
                    <div key={player.id} className="flex items-center gap-3 p-3 bg-indigo-900/30 rounded-lg border border-indigo-500/20 transition-all hover:bg-indigo-900/40">
                      <div className={`w-3 h-3 rounded-full ${
                        player.status === 'connected' ? 'bg-green-400' : 'bg-gray-400'
                      } animate-pulse`}></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{player.name}</span>
                          {player.isHost && (
                            <Crown size={16} className="text-yellow-400" />
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {player.isHost ? 'Host' : 'Player'} • Connected
                        </div>
                      </div>
                      <div className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                        Online
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Game Info */}
            <div className="bg-black/20 rounded-lg p-6 border border-indigo-500/20">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Wifi className="text-indigo-300" />
                Lobby Status
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Max Players:</span>
                  <span className="text-white">4</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span className="text-green-300 flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    Open
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Host Required:</span>
                  <span className="text-purple-300">Yes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Current Host:</span>
                  <span className="text-yellow-300">
                    {players.find(p => p.isHost)?.name || 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">WebRTC:</span>
                  <span className={`${webrtc.status.isInitialized ? 'text-green-300' : 'text-gray-300'}`}>
                    {webrtc.status.isInitialized ? 'Ready' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Session ID:</span>
                  <span className="text-gray-300 font-mono text-xs">
                    {sessionId ? sessionId.slice(-8) : 'Loading...'}
                  </span>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <h4 className="font-medium text-purple-300 mb-2">How it works:</h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>• Console creates lobby and waits</li>
                  <li>• First player to join becomes host</li>
                  <li>• Host can lock lobby when ready</li>
                  <li>• After locking, WebRTC connections establish</li>
                  <li>• Real-time peer-to-peer communication begins</li>
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