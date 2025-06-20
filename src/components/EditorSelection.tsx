import React, { useState, useEffect, useRef } from 'react';
import { Code, Database, Zap, ExternalLink, Lock, Users, ArrowLeft, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import WebRTCDebugPanel from './WebRTCDebugPanel';

interface EditorSelectionProps {
  sessionId: string;
  lobbyCode: string;
  players: any[];
  onBack: () => void;
  webrtcStatus?: any;
  onWebRTCMessage?: (message: any) => any;
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
  onWebRTCMessage
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEditor, setSelectedEditor] = useState<Editor | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Use refs to prevent stale closures and unnecessary re-subscriptions
  const selectedIndexRef = useRef(selectedIndex);
  const lastNavigationTimeRef = useRef(0);

  // Keep ref updated with current selectedIndex
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Listen for navigation inputs from phones - ENHANCED WITH WEBRTC
  useEffect(() => {
    if (!sessionId) return;

    console.log('Setting up real-time navigation listener for session:', sessionId);

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
          const newData = payload.new as any;
          console.log('Raw session update received:', newData);
          
          if (newData.selected_editor) {
            try {
              const editorData = JSON.parse(newData.selected_editor);
              console.log('Parsed navigation data:', editorData);
              
              // Prevent duplicate processing of the same event
              const currentTime = Date.now();
              if (editorData.timestamp && Math.abs(currentTime - editorData.timestamp) > 5000) {
                console.log('Ignoring old navigation event');
                return;
              }
              
              if (editorData.action === 'navigate') {
                console.log('Processing navigation:', editorData.direction);
                handleNavigation(editorData.direction);
                lastNavigationTimeRef.current = currentTime;
              } else if (editorData.action === 'select') {
                console.log('Processing selection');
                handleSelectEditor();
              }
            } catch (error) {
              console.error('Error parsing editor data:', error);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Navigation subscription status:', status);
      });

    return () => {
      console.log('Cleaning up navigation subscription');
      subscription.unsubscribe();
    };
  }, [sessionId]); // Only depend on sessionId to prevent re-subscriptions

  const handleSelectEditor = () => {
    const editor = editors[selectedIndexRef.current]; // Use ref to get latest value
    console.log('Selecting editor:', editor.name);
    setSelectedEditor(editor);
    setShowFullscreen(true);

    // Broadcast selection via WebRTC if available
    if (onWebRTCMessage) {
      const result = onWebRTCMessage({
        type: 'selection',
        data: { editor, selectedIndex: selectedIndexRef.current },
      });
      console.log('📡 WebRTC broadcast result:', result);
    }
  };

  const handleCloseFullscreen = () => {
    setShowFullscreen(false);
    setSelectedEditor(null);
  };

  const handleNavigation = (direction: string) => {
    console.log('Handling navigation:', direction, 'Current index:', selectedIndexRef.current);
    
    switch (direction) {
      case 'left':
        setSelectedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : editors.length - 1;
          console.log('Moving left to index:', newIndex);
          
          // Broadcast navigation via WebRTC if available
          if (onWebRTCMessage) {
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
          console.log('Moving right to index:', newIndex);
          
          // Broadcast navigation via WebRTC if available
          if (onWebRTCMessage) {
            onWebRTCMessage({
              type: 'navigation',
              data: { direction, newIndex, editor: editors[newIndex] },
            });
          }
          
          return newIndex;
        });
        break;
      case 'up':
        // Optional: Could implement up/down navigation for different rows
        break;
      case 'down':
        // Optional: Could implement up/down navigation for different rows
        break;
    }
  };

  // Keyboard navigation for console (backup)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      console.log('Keyboard event:', e.key);
      switch (e.key) {
        case 'ArrowLeft':
          handleNavigation('left');
          break;
        case 'ArrowRight':
          handleNavigation('right');
          break;
        case 'ArrowUp':
          handleNavigation('up');
          break;
        case 'ArrowDown':
          handleNavigation('down');
          break;
        case 'Enter':
        case ' ':
          handleSelectEditor();
          break;
        case 'Escape':
          if (showFullscreen) {
            handleCloseFullscreen();
          } else {
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
          
          {/* Debug info for development */}
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Selected Index:</span>
              <span className="text-indigo-300">{selectedIndex}</span>
            </div>
            <div className="flex justify-between">
              <span>Session ID:</span>
              <span className="text-indigo-300 font-mono">{sessionId.slice(-8)}</span>
            </div>
            {webrtcStatus && (
              <>
                <div className="flex justify-between">
                  <span>WebRTC Status:</span>
                  <span className={webrtcStatus.isInitialized ? 'text-green-300' : 'text-red-300'}>
                    {webrtcStatus.isInitialized ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Connected/Total:</span>
                  <span className="text-blue-300">
                    {webrtcStatus.connectedDevices.length}/{Object.keys(webrtcStatus.connections).length}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

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