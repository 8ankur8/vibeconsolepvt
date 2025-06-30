import React, { useState, useEffect } from 'react';
import { Code, Database, Zap, ExternalLink, Lock, Users, ArrowLeft, Crown } from 'lucide-react';

interface EditorSelectionProps {
  sessionId: string;
  lobbyCode: string;
  players: any[];
  onBack: () => void;
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
  onBack
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keyboard navigation for console (backup)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          setSelectedIndex(prev => prev > 0 ? prev - 1 : editors.length - 1);
          break;
        case 'ArrowRight':
          setSelectedIndex(prev => prev < editors.length - 1 ? prev + 1 : 0);
          break;
        case 'Escape':
          onBack();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onBack]);

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
            Use your phone to select an editor
          </p>
          
          {/* Current selection indicator */}
          <div className="mt-6 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 max-w-md mx-auto">
            <div className="flex items-center justify-center gap-2 text-indigo-300">
              <span className="text-sm">Currently Highlighted:</span>
              <span className="font-bold text-white">{editors[selectedIndex].name}</span>
              <span className="text-xs bg-indigo-500 px-2 py-1 rounded">{selectedIndex + 1}/{editors.length}</span>
            </div>
            <div className="mt-2 text-xs text-purple-300">
              Waiting for phone controller selection...
            </div>
          </div>
        </div>

        {/* Editor Cards - Purely Presentational */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {editors.map((editor, index) => {
            const isSelected = index === selectedIndex;
            const IconComponent = editor.icon;
            
            return (
              <div
                key={editor.id}
                className={`relative group transition-all duration-500 transform ${
                  isSelected 
                    ? 'scale-110 z-10' 
                    : 'scale-95 opacity-60'
                }`}
              >
                {/* Enhanced Selection Ring with animation */}
                {isSelected && (
                  <>
                    <div className="absolute -inset-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur-xl opacity-75"></div>
                    <div className="absolute -inset-4 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-2xl blur-md opacity-50"></div>
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

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute bottom-4 right-4">
                      <div className="bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-medium animate-bounce shadow-lg">
                        📱 Select on Phone
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

      </div>
    </div>
  );
};

export default EditorSelection;