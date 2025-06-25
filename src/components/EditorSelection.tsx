import React, { useState, useEffect, useRef } from 'react';
import { Code, Database, Zap, ExternalLink, Lock, Users, ArrowLeft, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ControllerInput } from '../lib/inputRouter';
import WebRTCDebugPanel from './WebRTCDebugPanel';

interface EditorSelectionProps {
  sessionId: string;
  lobbyCode: string;
  players: any[];
  onBack: () => void;
  webrtcStatus?: any;
  onWebRTCMessage?: (message: any) => any;
  lastControllerInput?: ControllerInput | null;
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
    url: 'https://loveable.ai',
    icon: Code,
    color: 'text-pink-400',
    bgGradient: 'from-pink-500/20 to-purple-500/20',
    features: ['Visual Builder', 'Component Library', 'Responsive Design', 'Team Collaboration']
  },
  {
    id: 'firebase',
    name: 'Firebase Studio',
    description: 'Google\'s app development platform',
    url: 'https://console.firebase.google.com',
    icon: Database,
    color: 'text-orange-400',
    bgGradient: 'from-orange-500/20 to-red-500/20',
    features: ['Real-time Database', 'Authentication', 'Cloud Functions', 'Analytics']
  }
];

const EditorSelection: React.FC<EditorSelectionProps> = ({ 
  sessionId, 
  lobbyCode, 
  players, 
  onBack,
  webrtcStatus,
  onWebRTCMessage,
  lastControllerInput
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEditor, setSelectedEditor] = useState<Editor | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [inputHistory, setInputHistory] = useState<ControllerInput[]>([]);
  
  // Use refs to prevent stale closures and unnecessary re-subscriptions
  const selectedIndexRef = useRef(selectedIndex);
  const lastNavigationTimeRef = useRef(0);
  const lastProcessedInputTimestampRef = useRef(0);

  // Keep ref updated with current selectedIndex
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // ENHANCED: Handle lastControllerInput from InputRouter with detailed logging
  useEffect(() => {
    if (!lastControllerInput) {
      console.log('🎮 [EDITOR_SELECTION] No controller input received');
      return;
    }

    console.log('🎮 [EDITOR_SELECTION] ===== NEW CONTROLLER INPUT RECEIVED =====');
    console.log('🎮 [EDITOR_SELECTION] Full input object:', lastControllerInput);
    console.log('🎮 [EDITOR_SELECTION] Device info:', {
      deviceId: lastControllerInput.deviceId,
      deviceName: lastControllerInput.deviceName,
      deviceType: lastControllerInput.deviceType
    });
    console.log('🎮 [EDITOR_SELECTION] Input details:', {
      type: lastControllerInput.input.type,
      action: lastControllerInput.input.action,
      data: lastControllerInput.input.data,
      timestamp: lastControllerInput.input.timestamp
    });
    console.log('🎮 [EDITOR_SELECTION] Source:', lastControllerInput.webrtcMessage ? 'WebRTC' : 'Supabase');
    console.log('🎮 [EDITOR_SELECTION] Current selected index:', selectedIndex);

    // Prevent processing the same input multiple times
    if (lastControllerInput.input.timestamp <= lastProcessedInputTimestampRef.current) {
      console.log('🎮 [EDITOR_SELECTION] ⚠️ Duplicate input detected, skipping processing');
      console.log('🎮 [EDITOR_SELECTION] Last processed timestamp:', lastProcessedInputTimestampRef.current);
      console.log('🎮 [EDITOR_SELECTION] Current input timestamp:', lastControllerInput.input.timestamp);
      return;
    }

    console.log('🎮 [EDITOR_SELECTION] ✅ Processing new input (timestamp check passed)');
    lastProcessedInputTimestampRef.current = lastControllerInput.input.timestamp;

    // Add to input history for debugging
    setInputHistory(prev => [lastControllerInput, ...prev.slice(0, 19)]);

    // Handle different input types with detailed logging
    if (lastControllerInput.input.type === 'dpad') {
      const direction = lastControllerInput.input.action;
      console.log(`🎮 [EDITOR_SELECTION] Processing dpad input: ${direction}`);
      console.log(`🎮 [EDITOR_SELECTION] Calling handleNavigation with direction: ${direction}`);
      handleNavigation(direction);
    } else if (lastControllerInput.input.type === 'button' && lastControllerInput.input.action === 'a') {
      console.log('🎮 [EDITOR_SELECTION] Processing button A input');
      console.log('🎮 [EDITOR_SELECTION] Calling handleSelectEditor');
      handleSelectEditor();
    } else {
      console.log(`🎮 [EDITOR_SELECTION] ⚠️ Unhandled input type: ${lastControllerInput.input.type}.${lastControllerInput.input.action}`);
    }

    console.log('🎮 [EDITOR_SELECTION] ===== INPUT PROCESSING COMPLETE =====');
  }, [lastControllerInput]);

  // ENHANCED: Listen for navigation inputs from phones via Supabase with detailed logging
  useEffect(() => {
    if (!sessionId) return;

    console.log('📡 [EDITOR_SELECTION] Setting up Supabase navigation listener for session:', sessionId);

    const subscription = supabase
      .channel(`editor_navigation_${sessionId}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'sessions',
          filter: `id=eq.${sessionId}`
        }, 
        (payload) => {
          console.log('📡 [EDITOR_SELECTION] ===== SUPABASE SESSION UPDATE =====');
          console.log('📡 [EDITOR_SELECTION] Raw session update received:', payload);
          
          const newData = payload.new as any;
          console.log('📡 [EDITOR_SELECTION] New data:', newData);
          
          if (newData.selected_editor) {
            try {
              const editorData = JSON.parse(newData.selected_editor);
              console.log('📡 [EDITOR_SELECTION] Parsed navigation data:', editorData);
              
              // Prevent duplicate processing of the same event
              const currentTime = Date.now();
              if (editorData.timestamp && Math.abs(currentTime - editorData.timestamp) > 5000) {
                console.log('📡 [EDITOR_SELECTION] ⚠️ Ignoring old navigation event (>5s old)');
                console.log('📡 [EDITOR_SELECTION] Event timestamp:', editorData.timestamp);
                console.log('📡 [EDITOR_SELECTION] Current time:', currentTime);
                console.log('📡 [EDITOR_SELECTION] Age (ms):', currentTime - editorData.timestamp);
                return;
              }
              
              if (editorData.action === 'navigate') {
                console.log('📡 [EDITOR_SELECTION] Processing Supabase navigation:', editorData.direction);
                console.log('📡 [EDITOR_SELECTION] Player info:', {
                  playerId: editorData.playerId,
                  playerName: editorData.playerName,
                  source: editorData.source
                });
                handleNavigation(editorData.direction);
                lastNavigationTimeRef.current = currentTime;
              } else if (editorData.action === 'select') {
                console.log('📡 [EDITOR_SELECTION] Processing Supabase selection');
                console.log('📡 [EDITOR_SELECTION] Player info:', {
                  playerId: editorData.playerId,
                  playerName: editorData.playerName,
                  source: editorData.source
                });
                handleSelectEditor();
              } else {
                console.log('📡 [EDITOR_SELECTION] ⚠️ Unknown action:', editorData.action);
              }
            } catch (error) {
              console.error('📡 [EDITOR_SELECTION] ❌ Error parsing editor data:', error);
              console.error('📡 [EDITOR_SELECTION] Raw selected_editor value:', newData.selected_editor);
            }
          } else {
            console.log('📡 [EDITOR_SELECTION] ⚠️ No selected_editor in update');
          }
          
          console.log('📡 [EDITOR_SELECTION] ===== SUPABASE UPDATE COMPLETE =====');
        }
      )
      .subscribe((status) => {
        console.log('📡 [EDITOR_SELECTION] Supabase navigation subscription status:', status);
      });

    return () => {
      console.log('📡 [EDITOR_SELECTION] Cleaning up Supabase navigation subscription');
      subscription.unsubscribe();
    };
  }, [sessionId]); // Only depend on sessionId to prevent re-subscriptions

  const handleSelectEditor = () => {
    const editor = editors[selectedIndexRef.current]; // Use ref to get latest value
    console.log('🎯 [EDITOR_SELECTION] ===== SELECTING EDITOR =====');
    console.log('🎯 [EDITOR_SELECTION] Selected editor:', editor.name);
    console.log('🎯 [EDITOR_SELECTION] Selected index:', selectedIndexRef.current);
    console.log('🎯 [EDITOR_SELECTION] Editor details:', editor);
    
    setSelectedEditor(editor);
    setShowFullscreen(true);

    // Broadcast selection via WebRTC if available
    if (onWebRTCMessage) {
      console.log('📡 [EDITOR_SELECTION] Broadcasting selection via WebRTC');
      const result = onWebRTCMessage({
        type: 'selection',
        data: { editor, selectedIndex: selectedIndexRef.current },
      });
      console.log('📡 [EDITOR_SELECTION] WebRTC broadcast result:', result);
    } else {
      console.log('📡 [EDITOR_SELECTION] ⚠️ No WebRTC message handler available');
    }
    
    console.log('🎯 [EDITOR_SELECTION] ===== EDITOR SELECTION COMPLETE =====');
  };

  const handleCloseFullscreen = () => {
    console.log('🎯 [EDITOR_SELECTION] Closing fullscreen editor');
    setShowFullscreen(false);
    setSelectedEditor(null);
  };

  const handleNavigation = (direction: string) => {
    console.log('🧭 [EDITOR_SELECTION] ===== HANDLING NAVIGATION =====');
    console.log('🧭 [EDITOR_SELECTION] Direction:', direction);
    console.log('🧭 [EDITOR_SELECTION] Current index (ref):', selectedIndexRef.current);
    console.log('🧭 [EDITOR_SELECTION] Current index (state):', selectedIndex);
    console.log('🧭 [EDITOR_SELECTION] Total editors:', editors.length);
    
    switch (direction) {
      case 'left':
        setSelectedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : editors.length - 1;
          console.log('🧭 [EDITOR_SELECTION] Moving left: from', prev, 'to', newIndex);
          
          // Broadcast navigation via WebRTC if available
          if (onWebRTCMessage) {
            console.log('📡 [EDITOR_SELECTION] Broadcasting left navigation via WebRTC');
            onWebRTCMessage({
              type: 'navigation',
              data: { direction, newIndex, editor: editors[newIndex] },
            });
          }
          
          return newIndex;
        });
        break;
      case 'right':
        setSelectedIndex(prev => {
          const newIndex = prev < editors.length - 1 ? prev + 1 : 0;
          console.log('🧭 [EDITOR_SELECTION] Moving right: from', prev, 'to', newIndex);
          
          // Broadcast navigation via WebRTC if available
          if (onWebRTCMessage) {
            console.log('📡 [EDITOR_SELECTION] Broadcasting right navigation via WebRTC');
            onWebRTCMessage({
              type: 'navigation',
              data: { direction, newIndex, editor: editors[newIndex] },
            });
          }
          
          return newIndex;
        });
        break;
      case 'up':
        console.log('🧭 [EDITOR_SELECTION] Up navigation (not implemented)');
        break;
      case 'down':
        console.log('🧭 [EDITOR_SELECTION] Down navigation (not implemented)');
        break;
      default:
        console.log('🧭 [EDITOR_SELECTION] ⚠️ Unknown direction:', direction);
    }
    
    console.log('🧭 [EDITOR_SELECTION] ===== NAVIGATION COMPLETE =====');
  };

  // Keyboard navigation for console (backup)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      console.log('⌨️ [EDITOR_SELECTION] Keyboard event:', e.key);
      switch (e.key) {
        case 'ArrowLeft':
          console.log('⌨️ [EDITOR_SELECTION] Keyboard left arrow');
          handleNavigation('left');
          break;
        case 'ArrowRight':
          console.log('⌨️ [EDITOR_SELECTION] Keyboard right arrow');
          handleNavigation('right');
          break;
        case 'ArrowUp':
          console.log('⌨️ [EDITOR_SELECTION] Keyboard up arrow');
          handleNavigation('up');
          break;
        case 'ArrowDown':
          console.log('⌨️ [EDITOR_SELECTION] Keyboard down arrow');
          handleNavigation('down');
          break;
        case 'Enter':
        case ' ':
          console.log('⌨️ [EDITOR_SELECTION] Keyboard select (Enter/Space)');
          handleSelectEditor();
          break;
        case 'Escape':
          if (showFullscreen) {
            console.log('⌨️ [EDITOR_SELECTION] Keyboard escape (close fullscreen)');
            handleCloseFullscreen();
          } else {
            console.log('⌨️ [EDITOR_SELECTION] Keyboard escape (go back)');
            onBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showFullscreen]); // Only depend on showFullscreen

  // Create device name mapping for debug panel
  const deviceNames = players.reduce((acc, player) => {
    acc[player.id] = player.name;
    return acc;
  }, {} as Record<string, string>);

  // ENHANCED: Debug function to test input processing
  const testInputProcessing = () => {
    console.log('🧪 [EDITOR_SELECTION] ===== TESTING INPUT PROCESSING =====');
    
    // Simulate a controller input
    const testInput: ControllerInput = {
      deviceId: 'test-device-123',
      deviceName: 'Test Controller',
      deviceType: 'phone',
      input: {
        type: 'dpad',
        action: 'right',
        data: { pressed: true, direction: 'right' },
        timestamp: Date.now()
      },
      webrtcMessage: false
    };
    
    console.log('🧪 [EDITOR_SELECTION] Simulating controller input:', testInput);
    
    // Add to history
    setInputHistory(prev => [testInput, ...prev.slice(0, 19)]);
    
    // Process the test input
    handleNavigation('right');
    
    console.log('🧪 [EDITOR_SELECTION] ===== TEST COMPLETE =====');
  };

  if (showFullscreen && selectedEditor) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
          <button
            onClick={handleCloseFullscreen}
            className="bg-black/50 hover:bg-black/70 text-white p-3 rounded-full backdrop-blur-md border border-white/20 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="bg-black/50 backdrop-blur-md border border-white/20 rounded-lg px-4 py-2 text-white">
            <div className="flex items-center gap-2">
              <selectedEditor.icon size={20} className={selectedEditor.color} />
              <span className="font-medium">{selectedEditor.name}</span>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-indigo-900 text-white">
      {/* Header */}
      <header className="p-4 border-b border-indigo-500/20 backdrop-blur-md bg-black/20">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-2">
              <Code size={28} className="text-indigo-300" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
                Select Editor
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-indigo-500/20 px-3 py-1 rounded-full">
              <Users size={16} />
              <span>{players.length} players</span>
            </div>
            <div className="bg-purple-500/20 px-3 py-1 rounded-full">
              <span className="font-mono text-lg">{lobbyCode}</span>
            </div>
            <div className="flex items-center gap-2 bg-red-500/20 text-red-300 px-3 py-1 rounded-full">
              <Lock size={16} />
              <span>Locked</span>
            </div>
            {/* WebRTC Status */}
            {webrtcStatus && (
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`flex items-center gap-2 px-3 py-1 rounded-full transition-colors ${
                  webrtcStatus.isInitialized 
                    ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' 
                    : 'bg-gray-500/20 text-gray-300 hover:bg-gray-500/30'
                }`}
              >
                <Activity size={16} />
                <span>WebRTC</span>
                <div className={`w-2 h-2 rounded-full ${
                  webrtcStatus.connectedDevices.length > 0 ? 'bg-green-400' : 'bg-gray-400'
                }`}></div>
                <span className="text-xs">
                  {webrtcStatus.connectedDevices.length}/{Object.keys(webrtcStatus.connections).length}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Instructions */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Choose Your Development Environment</h2>
          <p className="text-xl text-indigo-200 mb-6">
            Use your phone controller to navigate and select an editor
          </p>
          <div className="flex justify-center gap-8 text-sm text-indigo-300">
            <div className="flex items-center gap-2">
              <div className="w-8 h-6 bg-gray-700 rounded flex items-center justify-center">←→</div>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-6 bg-indigo-500 rounded flex items-center justify-center">A</div>
              <span>Select</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-6 bg-red-500 rounded flex items-center justify-center">B</div>
              <span>Back</span>
            </div>
          </div>
          
          {/* Current selection indicator */}
          <div className="mt-6 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 max-w-md mx-auto">
            <div className="flex items-center justify-center gap-2 text-indigo-300">
              <span className="text-sm">Currently Selected:</span>
              <span className="font-bold text-white">{editors[selectedIndex].name}</span>
              <span className="text-xs bg-indigo-500 px-2 py-1 rounded">{selectedIndex + 1}/{editors.length}</span>
            </div>
            {webrtcStatus && (
              <div className="mt-2 text-xs text-gray-400">
                WebRTC: {webrtcStatus.connectedDevices.length} connected, {Object.keys(webrtcStatus.connections).length} total
              </div>
            )}
            {lastControllerInput && (
              <div className="mt-2 text-xs text-purple-300">
                Last Input: {lastControllerInput.deviceName} - {lastControllerInput.input.type}.{lastControllerInput.input.action}
                {lastControllerInput.webrtcMessage ? ' (WebRTC)' : ' (Supabase)'}
              </div>
            )}
          </div>
        </div>

        {/* Editor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {editors.map((editor, index) => {
            const isSelected = index === selectedIndex;
            const IconComponent = editor.icon;
            
            return (
              <div
                key={editor.id}
                className={`relative group transition-all duration-500 transform cursor-pointer ${
                  isSelected 
                    ? 'scale-110 z-10' 
                    : 'scale-95 opacity-60'
                }`}
                onClick={() => {
                  console.log('🖱️ [EDITOR_SELECTION] Mouse click on editor:', editor.name, 'index:', index);
                  setSelectedIndex(index);
                  setTimeout(() => handleSelectEditor(), 200);
                }}
              >
                {/* Enhanced Selection Ring with animation */}
                {isSelected && (
                  <>
                    <div className="absolute -inset-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur-xl opacity-75 animate-pulse"></div>
                    <div className="absolute -inset-4 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-2xl blur-md opacity-50 animate-ping"></div>
                  </>
                )}
                
                <div className={`relative bg-gradient-to-br ${editor.bgGradient} backdrop-blur-md border-2 ${
                  isSelected ? 'border-indigo-400 shadow-2xl shadow-indigo-500/25' : 'border-white/10'
                } rounded-xl p-8 h-full transition-all duration-500`}>
                  
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 rounded-lg bg-black/30 ${editor.color} ${
                      isSelected ? 'animate-pulse' : ''
                    }`}>
                      <IconComponent size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white">{editor.name}</h3>
                      <p className="text-gray-300">{editor.description}</p>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-3 mb-8">
                    {editor.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${editor.color.replace('text-', 'bg-')} ${
                          isSelected ? 'animate-pulse' : ''
                        }`}></div>
                        <span className="text-gray-200">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* URL Preview */}
                  <div className="bg-black/30 rounded-lg p-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <ExternalLink size={16} />
                      <span className="font-mono">{editor.url}</span>
                    </div>
                  </div>

                  {/* Enhanced Selection Indicator */}
                  {isSelected && (
                    <div className="absolute bottom-4 right-4">
                      <div className="bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-medium animate-bounce shadow-lg">
                        ✨ Press A to Select
                      </div>
                    </div>
                  )}
                  
                  {/* Index indicator */}
                  <div className="absolute top-4 right-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
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

        {/* Connected Controllers */}
        <div className="mt-12 bg-black/20 rounded-lg p-6 border border-indigo-500/20 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="text-indigo-300" />
            Connected Controllers
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-3 p-3 bg-indigo-900/30 rounded-lg border border-indigo-500/20">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-white font-medium">{player.name}</span>
                <span className="text-xs text-gray-400 ml-auto">Ready</span>
              </div>
            ))}
          </div>
          
          {/* Enhanced Debug info for development */}
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400">
            <div className="flex justify-between mb-2">
              <span>Selected Index:</span>
              <span className="text-indigo-300">{selectedIndex}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>Session ID:</span>
              <span className="text-indigo-300 font-mono">{sessionId.slice(-8)}</span>
            </div>
            {webrtcStatus && (
              <>
                <div className="flex justify-between mb-2">
                  <span>WebRTC Status:</span>
                  <span className={webrtcStatus.isInitialized ? 'text-green-300' : 'text-red-300'}>
                    {webrtcStatus.isInitialized ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Connected/Total:</span>
                  <span className="text-blue-300">
                    {webrtcStatus.connectedDevices.length}/{Object.keys(webrtcStatus.connections).length}
                  </span>
                </div>
              </>
            )}
            {lastControllerInput && (
              <>
                <div className="flex justify-between mb-2">
                  <span>InputRouter:</span>
                  <span className="text-green-300">Active ✅</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Last Input:</span>
                  <span className="text-purple-300">
                    {lastControllerInput.input.type}.{lastControllerInput.input.action}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Input Source:</span>
                  <span className={lastControllerInput.webrtcMessage ? 'text-green-300' : 'text-yellow-300'}>
                    {lastControllerInput.webrtcMessage ? 'WebRTC' : 'Supabase'}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span>Device:</span>
                  <span className="text-blue-300">{lastControllerInput.deviceName}</span>
                </div>
              </>
            )}
            <div className="flex justify-between mb-2">
              <span>Input History:</span>
              <span className="text-purple-300">{inputHistory.length} entries</span>
            </div>
            
            {/* Test button */}
            <div className="mt-3 pt-2 border-t border-gray-600">
              <button
                onClick={testInputProcessing}
                className="w-full py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded text-purple-300 text-sm transition-colors"
              >
                🧪 Test Input Processing
              </button>
            </div>
          </div>
        </div>

        {/* ENHANCED: Input History Panel */}
        {inputHistory.length > 0 && (
          <div className="mt-8 bg-black/20 rounded-lg p-6 border border-indigo-500/20 max-w-4xl mx-auto">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Activity className="text-indigo-300" />
              Input History ({inputHistory.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {inputHistory.map((input, index) => (
                <div key={index} className="p-3 bg-gray-800/50 rounded border border-gray-600 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">{input.deviceName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        input.webrtcMessage ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {input.webrtcMessage ? 'WebRTC' : 'Supabase'}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {new Date(input.input.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-gray-300">
                    <span className="text-indigo-300">{input.input.type}</span>
                    <span className="text-gray-500">.</span>
                    <span className="text-purple-300">{input.input.action}</span>
                    {input.input.data && Object.keys(input.input.data).length > 0 && (
                      <span className="text-gray-400 ml-2">
                        {JSON.stringify(input.input.data)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WebRTC Debug Panel */}
        {showDebugPanel && webrtcStatus && (
          <div className="mt-8 max-w-4xl mx-auto">
            <WebRTCDebugPanel
              status={webrtcStatus}
              deviceNames={deviceNames}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorSelection;