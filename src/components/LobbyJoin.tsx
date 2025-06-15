import React, { useState } from 'react';
import { ArrowLeft, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const LobbyJoin: React.FC = () => {
  const [lobbyCode, setLobbyCode] = useState('');
  const navigate = useNavigate();

  const joinLobby = () => {
    if (lobbyCode.trim()) {
      navigate(`/controller?lobby=${lobbyCode.trim().toUpperCase()}`);
    }
  };

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
          <QrCode size={40} className="text-white" />
        </div>
        
        <h1 className="text-3xl font-bold mb-8">Join a Game</h1>
        
        <div className="w-full max-w-sm space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Enter Lobby Code
            </label>
            <input
              type="text"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
              placeholder="ABCD12"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-lg font-mono text-center tracking-wider"
              maxLength={6}
              onKeyPress={(e) => e.key === 'Enter' && joinLobby()}
            />
          </div>

          <button
            onClick={joinLobby}
            disabled={!lobbyCode.trim()}
            className={`w-full py-4 rounded-lg text-lg font-medium transition-colors ${
              lobbyCode.trim() 
                ? 'bg-indigo-500 hover:bg-indigo-600' 
                : 'bg-gray-700 cursor-not-allowed'
            }`}
          >
            Join Game
          </button>

          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">
              Or scan the QR code displayed on the console
            </p>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <QrCode size={32} className="text-gray-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500">
                Point your camera at the QR code on the main screen
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyJoin;