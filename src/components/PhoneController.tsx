import React, { useState, useEffect } from 'react';
import { ArrowLeft, Gamepad2, Crown, Lock, Users, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Code, Monitor, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useWebRTC } from '../hooks/useWebRTC';
import WebRTCDebugPanel from './WebRTCDebugPanel';

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
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  const navigate = useNavigate();

  // WebRTC integration for phone controller
  const webrtc = useWebRTC({
    sessionId: currentSessionId,
    deviceId: myPlayerId,
    isHost: false, // Phone controllers are never hosts in WebRTC context
    onMessage: (message, fromDeviceId) => {
      console.log('📩 Phone received WebRTC message from', fromDeviceId, ':', message);
      // Handle WebRTC messages from console here
    },
    enabled: currentSessionId !== '' && myPlayerId !== '' && isLobbyLocked
  });

  // Create device name mapping for debug panel
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

  // Load session and check if it exists
  const loadSession = async () => {
    console.log('🔍 Loading session for lobby code:', lobbyCode);
    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('id, is_locked')
        .eq('code', lobbyCode)
        .eq('is_active', true)
        .single();

      if (error || !session) {
        console.error('❌ Session not found:', error);
        setConnectionError('Lobby not found or inactive');
        return null;
      }

      console.log('✅ Session loaded:', session);
      setCurrentSessionId(session.id);
      const wasLocked = isLobbyLocked;
      const nowLocked = session.is_locked || false;
      
      setIsLobbyLocked(nowLocked);
      
      // INSTANT TRANSITION: If lobby just got locked, immediately switch to editor selection
      if (!wasLocked && nowLocked) {
        console.log('🔒 Lobby locked - instantly switching to editor selection mode');
        setGameStatus('editor_selection');
      } else if (nowLocked) {
        console.log('🔒 Lobby is locked - setting editor selection mode');
        setGameStatus('editor_selection');
      } else {
        console.log('🔓 Lobby is unlocked - setting waiting mode');
        setGameStatus('waiting');
      }
      
      return session;
    } catch (error) {
      console.error('💥 Error loading session:', error);
      setConnectionError('Failed to load lobby');
      return null;
    }
  };

  // Load players in the session
  const loadPlayers = async () => {
    if (!currentSessionId) {
      console.log('⚠️ No session ID available for loading players');
      return;
    }

    console.log('👥 Loading players for session:', currentSessionId);
    try {
      const { data: devices, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('connected_at', { ascending: true });

      if (error) {
        console.error('❌ Error loading players:', error);
        return;
      }

      console.log('📱 Raw devices data:', devices);

      // Filter out console device and only show phone controllers
      const mappedPlayers: Player[] = devices
        .filter(device => device.name !== 'Console') // Exclude console device
        .map((device) => ({
          id: device.id,
          name: device.name,
          isHost: device.is_leader || false
        }));

      setPlayers(mappedPlayers);
      console.log('✅ Players mapped (phone controllers only):', mappedPlayers);

      // Check if current player is host
      const myDevice = devices.find(d => d.id === myPlayerId);
      if (myDevice) {
        const amHost = myDevice.is_leader || false;
        setIsHost(amHost);
        console.log('👑 Am I host?', amHost, 'My device:', myDevice);
      }
    } catch (error) {
      console.error('💥 Error loading players:', error);
    }
  };

  useEffect(() => {
    console.log('🚀 PhoneController mounted with lobby code:', lobbyCode);
    loadSession();
  }, [lobbyCode]);

  useEffect(() => {
    if (currentSessionId) {
      console.log('🔄 Setting up subscriptions for session:', currentSessionId);
      loadPlayers();
      
      // Set up real-time subscriptions with unique channel names
      const devicesSubscription = supabase
        .channel(`devices_changes_${currentSessionId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'devices',
            filter: `session_id=eq.${currentSessionId}`
          }, 
          (payload) => {
            console.log('📱 Device change detected:', payload);
            loadPlayers();
          }
        )
        .subscribe((status) => {
          console.log('📱 Devices subscription status:', status);
        });

      const sessionSubscription = supabase
        .channel(`session_changes_${currentSessionId}`)
        .on('postgres_changes', 
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'sessions',
            filter: `id=eq.${currentSessionId}`
          }, 
          (payload) => {
            console.log('🏠 Session change detected:', payload);
            const newData = payload.new as any;
            const wasLocked = isLobbyLocked;
            const nowLocked = newData.is_locked || false;
            
            setIsLobbyLocked(nowLocked);
            
            // INSTANT TRANSITION: Switch modes immediately when lock status changes
            if (!wasLocked && nowLocked) {
              console.log('🔒 Lobby locked - instantly switching to editor selection mode');
              setGameStatus('editor_selection');
            } else if (wasLocked && !nowLocked) {
              console.log('🔓 Lobby unlocked - switching back to waiting mode');
              setGameStatus('waiting');
            }
          }
        )
        .subscribe((status) => {
          console.log('🏠 Session subscription status:', status);
        });

      return () => {
        console.log('🧹 Cleaning up subscriptions');
        devicesSubscription.unsubscribe();
        sessionSubscription.unsubscribe();
      };
    }
  }, [currentSessionId, myPlayerId, isLobbyLocked]);

  const joinLobby = async () => {
    if (!playerName.trim() || !lobbyCode) {
      console.log('⚠️ Missing player name or lobby code');
      return;
    }

    console.log('🚪 Attempting to join lobby with name:', playerName.trim());
    try {
      const session = await loadSession();
      if (!session) {
        console.log('❌ Failed to load session, cannot join');
        return;
      }

      // Check if lobby is full (max 4 players, excluding console)
      const { data: existingDevices, error: countError } = await supabase
        .from('devices')
        .select('id, name')
        .eq('session_id', session.id);

      if (countError) {
        console.error('❌ Error checking lobby capacity:', countError);
        setConnectionError('Failed to check lobby capacity');
        return;
      }

      // Count only phone controllers (exclude console)
      const phoneControllers = existingDevices.filter(device => device.name !== 'Console');
      console.log('📊 Current phone controllers in lobby:', phoneControllers.length);
      
      if (phoneControllers.length >= 4) {
        console.log('🚫 Lobby is full');
        setConnectionError('Lobby is full (max 4 players)');
        return;
      }

      // IMPORTANT: First phone controller becomes host (not including console)
      const isFirstPlayer = phoneControllers.length === 0;
      console.log('👑 Is first phone controller (will be host)?', isFirstPlayer);

      // Add device to session
      const { data: device, error: deviceError } = await supabase
        .from('devices')
        .insert({
          session_id: session.id,
          name: playerName.trim(),
          is_leader: isFirstPlayer // First phone controller becomes host
        })
        .select()
        .single();

      if (deviceError) {
        console.error('❌ Error joining lobby:', deviceError);
        setConnectionError('Failed to join lobby');
        return;
      }

      console.log('✅ Successfully joined lobby:', device);
      setMyPlayerId(device.id);
      setIsJoined(true);
      setIsHost(isFirstPlayer);
      setConnectionError('');

      console.log('🎉 Join complete - Player ID:', device.id, 'Is host:', isFirstPlayer);
    } catch (error) {
      console.error('💥 Error joining lobby:', error);
      setConnectionError('Failed to join lobby');
    }
  };

  const lockLobby = async () => {
    if (!isHost || !currentSessionId) {
      console.log('⚠️ Cannot lock lobby - not host or no session ID');
      return;
    }

    console.log('🔒 Host attempting to lock lobby');
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_locked: true })
        .eq('id', currentSessionId);

      if (error) {
        console.error('❌ Error locking lobby:', error);
        return;
      }

      // INSTANT LOCAL UPDATE: Don't wait for real-time update
      setIsLobbyLocked(true);
      setGameStatus('editor_selection');
      console.log('✅ Lobby locked - immediately switching to editor selection');
    } catch (error) {
      console.error('💥 Error locking lobby:', error);
    }
  };

  const unlockLobby = async () => {
    if (!isHost || !currentSessionId) {
      console.log('⚠️ Cannot unlock lobby - not host or no session ID');
      return;
    }

    console.log('🔓 Host attempting to unlock lobby');
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_locked: false })
        .eq('id', currentSessionId);

      if (error) {
        console.error('❌ Error unlocking lobby:', error);
        return;
      }

      // INSTANT LOCAL UPDATE: Don't wait for real-time update
      setIsLobbyLocked(false);
      setGameStatus('waiting');
      console.log('✅ Lobby unlocked - immediately switching to waiting');
    } catch (error) {
      console.error('💥 Error unlocking lobby:', error);
    }
  };

  // ENHANCED: Send navigation input via WebRTC first, fallback to Supabase
  const sendNavigation = async (direction: string) => {
    console.log('🎮 sendNavigation called with direction:', direction);
    console.log('📊 Current state - Session ID:', currentSessionId, 'Player ID:', myPlayerId);
    
    if (!currentSessionId) {
      console.log('❌ Cannot send navigation - no session ID');
      return;
    }

    // Throttle navigation to prevent spam
    const currentTime = Date.now();
    if (currentTime - lastNavigationTime < 150) {
      console.log('⏱️ Throttling navigation input - too soon since last input');
      return;
    }

    try {
      console.log('📤 Sending navigation:', direction, 'at timestamp:', currentTime);
      
      // Try WebRTC first if available
      const webrtcMessage = {
        type: 'navigation' as const,
        data: { direction, timestamp: currentTime, playerId: myPlayerId }
      };

      // Find console device to send WebRTC message to
      const consoleDevice = await supabase
        .from('devices')
        .select('id')
        .eq('session_id', currentSessionId)
        .eq('name', 'Console')
        .single();

      let webrtcSent = false;
      if (consoleDevice.data && webrtc.status.isInitialized) {
        webrtcSent = webrtc.sendMessage(consoleDevice.data.id, webrtcMessage);
        console.log('📡 WebRTC navigation sent:', webrtcSent);
      }

      // Fallback to Supabase if WebRTC failed
      if (!webrtcSent) {
        console.log('📤 Falling back to Supabase for navigation');
        const { error } = await supabase
          .from('sessions')
          .update({ 
            selected_editor: JSON.stringify({ 
              action: 'navigate', 
              direction, 
              timestamp: currentTime,
              playerId: myPlayerId 
            })
          })
          .eq('id', currentSessionId);

        if (error) {
          console.error('❌ Error sending navigation via Supabase:', error);
        } else {
          console.log('✅ Navigation sent via Supabase');
        }
      }

      setLastNavigationTime(currentTime);
    } catch (error) {
      console.error('💥 Error sending navigation:', error);
    }
  };

  const sendSelection = async () => {
    console.log('🎯 sendSelection called');
    console.log('📊 Current state - Session ID:', currentSessionId, 'Player ID:', myPlayerId);
    
    if (!currentSessionId) {
      console.log('❌ Cannot send selection - no session ID');
      return;
    }

    try {
      console.log('📤 Sending selection');
      
      // Try WebRTC first if available
      const webrtcMessage = {
        type: 'selection' as const,
        data: { timestamp: Date.now(), playerId: myPlayerId }
      };

      // Find console device to send WebRTC message to
      const consoleDevice = await supabase
        .from('devices')
        .select('id')
        .eq('session_id', currentSessionId)
        .eq('name', 'Console')
        .single();

      let webrtcSent = false;
      if (consoleDevice.data && webrtc.status.isInitialized) {
        webrtcSent = webrtc.sendMessage(consoleDevice.data.id, webrtcMessage);
        console.log('📡 WebRTC selection sent:', webrtcSent);
      }

      // Fallback to Supabase if WebRTC failed
      if (!webrtcSent) {
        console.log('📤 Falling back to Supabase for selection');
        const { error } = await supabase
          .from('sessions')
          .update({ 
            selected_editor: JSON.stringify({ 
              action: 'select', 
              timestamp: Date.now(),
              playerId: myPlayerId 
            })
          })
          .eq('id', currentSessionId);

        if (error) {
          console.error('❌ Error sending selection via Supabase:', error);
        } else {
          console.log('✅ Selection sent via Supabase');
        }
      }
    } catch (error) {
      console.error('💥 Error sending selection:', error);
    }
  };

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
                {connectionError}
              </div>
            )}

            <button
              onClick={joinLobby}
              disabled={!playerName.trim()}
              className={`w-full py-4 rounded-lg text-lg font-medium transition-colors ${
                playerName.trim() 
                  ? 'bg-indigo-500 hover:bg-indigo-600' 
                  : 'bg-gray-700 cursor-not-allowed'
              }`}
            >
              Join Game
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
          {/* WebRTC Status */}
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              webrtc.status.isInitialized 
                ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' 
                : 'bg-gray-500/20 text-gray-300 hover:bg-gray-500/30'
            }`}
          >
            <Activity size={12} />
            <span>WebRTC</span>
            <div className={`w-1 h-1 rounded-full ${
              webrtc.status.connectedDevices.length > 0 ? 'bg-green-400' : 'bg-gray-400'
            }`}></div>
          </button>
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

      {/* WebRTC Debug Panel */}
      {showDebugPanel && (
        <div className="mb-6">
          <WebRTCDebugPanel
            status={webrtc.status}
            deviceNames={deviceNames}
            className="text-sm"
          />
        </div>
      )}

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
              {webrtc.status.isInitialized && (
                <p className="text-xs text-green-400 mt-1">
                  WebRTC: {webrtc.status.connectedDevices.length > 0 ? 'Connected' : 'Connecting...'}
                </p>
              )}
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

          {/* ENHANCED: TV Remote Controls with better feedback */}
          <div className="flex justify-center mb-6">
            <div className="relative w-48 h-48">
              <div className="absolute inset-0 rounded-full bg-gray-800 border-2 border-gray-700 shadow-2xl">
                {/* Center button (Select) */}
                <button
                  onClick={sendSelection}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 border-indigo-400 transition-all duration-150 shadow-lg active:scale-95"
                >
                  <span className="text-xs font-bold">SEL</span>
                </button>
                
                {/* Direction buttons with enhanced feedback */}
                <button 
                  onClick={() => sendNavigation('up')}
                  className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-t-full border-2 bg-gray-700 hover:bg-purple-600 active:bg-purple-700 border-gray-600 hover:border-purple-500 transition-all duration-150 flex items-center justify-center shadow-lg active:scale-95"
                >
                  <ChevronUp size={20} className="text-white" />
                </button>
                
                <button 
                  onClick={() => sendNavigation('down')}
                  className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-12 rounded-b-full border-2 bg-gray-700 hover:bg-purple-600 active:bg-purple-700 border-gray-600 hover:border-purple-500 transition-all duration-150 flex items-center justify-center shadow-lg active:scale-95"
                >
                  <ChevronDown size={20} className="text-white" />
                </button>
                
                <button 
                  onClick={() => sendNavigation('right')}
                  className="absolute right-0 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-r-full border-2 bg-gray-700 hover:bg-purple-600 active:bg-purple-700 border-gray-600 hover:border-purple-500 transition-all duration-150 flex items-center justify-center shadow-lg active:scale-95"
                >
                  <ChevronRight size={20} className="text-white" />
                </button>
                
                <button 
                  onClick={() => sendNavigation('left')}
                  className="absolute left-0 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-l-full border-2 bg-gray-700 hover:bg-purple-600 active:bg-purple-700 border-gray-600 hover:border-purple-500 transition-all duration-150 flex items-center justify-center shadow-lg active:scale-95"
                >
                  <ChevronLeft size={20} className="text-white" />
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
          
          {/* ENHANCED: Debug info for development */}
          <div className="mt-6 bg-gray-800/30 rounded-lg p-3 text-xs text-gray-400">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between">
                <span>Session:</span>
                <span className="text-indigo-300 font-mono">{currentSessionId.slice(-8)}</span>
              </div>
              <div className="flex justify-between">
                <span>Player ID:</span>
                <span className="text-purple-300 font-mono">{myPlayerId.slice(-8)}</span>
              </div>
              <div className="flex justify-between">
                <span>WebRTC:</span>
                <span className={webrtc.status.isInitialized ? 'text-green-300' : 'text-red-300'}>
                  {webrtc.status.isInitialized ? 'Ready' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Connected:</span>
                <span className="text-blue-300">{webrtc.status.connectedDevices.length}</span>
              </div>
            </div>
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