import React, { useState, useEffect, useRef } from 'react';
import { Code, Database, Zap, ExternalLink, Lock, Users, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ControllerInput } from '../lib/inputRouter';

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
  
  const selectedIndexRef = useRef(selectedIndex);

  // Keep ref updated with current selectedIndex
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Handle lastControllerInput from InputRouter
  useEffect(() => {
    if (!lastControllerInput) return;

    console.log('🎮 [EDITOR_SELECTION] Processing controller input:', lastControllerInput.input.type, lastControllerInput.input.action);

    // Process input
    if (lastControllerInput.input.type === 'dpad') {
      const direction = lastControllerInput.input.action;
      handleNavigation(direction);
    } else if (lastControllerInput.input.type === 'button' && lastControllerInput.input.action === 'a') {
      handleSelectEditor();
    }
  }, [lastControllerInput, selectedIndex]);

  // Navigation handler
  const handleNavigation = (direction: string) => {
    console.log('🧭 [EDITOR_SELECTION] Navigation:', direction);
    
    switch (direction) {
      case 'left':
        setSelectedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : editors.length - 1;
          selectedIndexRef.current = newIndex;
          return newIndex;
        });
        break;
        
      case 'right':
        setSelectedIndex(prev => {
          const newIndex = prev < editors.length - 1 ? prev + 1 : 0;
          selectedIndexRef.current = newIndex;
          return newIndex;
        });
        break;
    }
  };

  // MODIFIED: Handle editor selection - only update Supabase, no local state
  const handleSelectEditor = async () => {
    console.log('🎯 [EDITOR_SELECTION] Editor selected:', editors[selectedIndex].name);
    
    // Get selected editor info
    const selectedEditorInfo = editors[selectedIndex];
    
    // Find the device that made the selection (host)
    const hostPlayer = players.find(p => p.isHost && p.deviceType === 'phone');
    
    // Create selection data for Supabase
    const selectionData = {
      selectedEditor: selectedEditorInfo.id,
      selectedEditorName: selectedEditorInfo.name,
      selectedIndex: selectedIndex,
      selectionTimestamp: Date.now(),
      sessionId: sessionId,
      lobbyCode: lobbyCode,
      selectedBy: hostPlayer?.name || 'Host'
    };
    
    try {
      console.log('💾 [EDITOR_SELECTION] Saving selection to Supabase:', selectionData);
      
      // Update session with selection data - this will trigger ConsoleDisplay to show the editor
      const { error } = await supabase
        .from('sessions')
        .update({ 
          selected_editor: JSON.stringify(selectionData)
        })
        .eq('id', sessionId);

      if (error) {
        console.error('❌ [EDITOR_SELECTION] Error saving selection:', error);
        return;
      }

      console.log('✅ [EDITOR_SELECTION] Selection saved successfully - ConsoleDisplay will handle the display');
      
      // NOTE: We don't set any local state here - ConsoleDisplay will detect the change
      // and show the fullscreen editor iframe
      
    } catch (error) {
      console.error('💥 [EDITOR_SELECTION] Exception during selection:', error);
    }
  };

  // Keyboard navigation for console (backup)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
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
          onBack();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // REMOVED: The fullscreen editor display logic - ConsoleDisplay handles this now

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
                {player.isHost && <Crown size={12} className="text-yellow-400" />}
              </div>
            ))}
          </div>
          
          {/* Debug info for development */}
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
            <div className="mt-2 text-center text-green-400 text-xs">
              ✅ Editor selection via Supabase status control
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorSelection;