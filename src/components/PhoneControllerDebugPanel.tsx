
import React, { useState, useEffect } from 'react';

interface DebugInfo {
  webrtc: {
    isInitialized: boolean;
    connections: Record<string, string>;
    connectedDevices: string[];
    lastMessage: any;
  };
  session: {
    sessionId: string;
    myPlayerId: string;
    consoleDeviceId: string | null;
  };
  communication: {
    lastWebRTCSent: string | null;
    lastSupabaseSent: string | null;
    sendAttempts: number;
  };
}

const PhoneControllerDebugPanel: React.FC<{
  sessionId: string;
  myPlayerId: string;
  webrtcStatus: any;
  onTestInput: () => void;
}> = ({ sessionId, myPlayerId, webrtcStatus, onTestInput }) => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    webrtc: {
      isInitialized: false,
      connections: {},
      connectedDevices: [],
      lastMessage: null
    },
    session: {
      sessionId,
      myPlayerId,
      consoleDeviceId: null
    },
    communication: {
      lastWebRTCSent: null,
      lastSupabaseSent: null,
      sendAttempts: 0
    }
  });

  // Find console device
  useEffect(() => {
    const findConsoleDevice = async () => {
      try {
        const { supabase } = await import('../lib/supabase');
        const { data: consoleDevice } = await supabase
          .from('devices')
          .select('id')
          .eq('session_id', sessionId)
          .eq('name', 'Console')
          .single();
        
        setDebugInfo(prev => ({
          ...prev,
          session: {
            ...prev.session,
            consoleDeviceId: consoleDevice?.id || null
          }
        }));
      } catch (error) {
        console.error('Error finding console device:', error);
      }
    };

    if (sessionId) {
      findConsoleDevice();
    }
  }, [sessionId]);

  // Update WebRTC status
  useEffect(() => {
    if (webrtcStatus) {
      setDebugInfo(prev => ({
        ...prev,
        webrtc: {
          isInitialized: webrtcStatus.isInitialized,
          connections: webrtcStatus.connections,
          connectedDevices: webrtcStatus.connectedDevices,
          lastMessage: prev.webrtc.lastMessage
        }
      }));
    }
  }, [webrtcStatus]);

  const testDirectWebRTC = async () => {
    if (!debugInfo.session.consoleDeviceId) {
      console.error('No console device found');
      return;
    }

    try {
      // Test direct WebRTC message
      const testMessage = {
        type: 'game_data' as const,
        data: {
          dpad: {
            directionchange: {
              key: 'right',
              pressed: true
            }
          }
        }
      };

      console.log('🧪 Testing direct WebRTC message:', testMessage);
      // Assuming you have access to webrtc.sendMessage
      // const result = webrtc.sendMessage(debugInfo.session.consoleDeviceId, testMessage);
      
      setDebugInfo(prev => ({
        ...prev,
        communication: {
          ...prev.communication,
          lastWebRTCSent: new Date().toISOString(),
          sendAttempts: prev.communication.sendAttempts + 1
        }
      }));
    } catch (error) {
      console.error('WebRTC test failed:', error);
    }
  };

  const testSupabaseFallback = async () => {
    try {
      const { supabase } = await import('../lib/supabase');
      const testData = {
        action: 'navigate',
        direction: 'right',
        timestamp: Date.now(),
        playerId: myPlayerId,
        playerName: 'TestPlayer',
        source: 'debug_test'
      };

      console.log('🧪 Testing Supabase fallback:', testData);
      const { error } = await supabase
        .from('sessions')
        .update({ 
          selected_editor: JSON.stringify(testData)
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Supabase test failed:', error);
      } else {
        setDebugInfo(prev => ({
          ...prev,
          communication: {
            ...prev.communication,
            lastSupabaseSent: new Date().toISOString(),
            sendAttempts: prev.communication.sendAttempts + 1
          }
        }));
      }
    } catch (error) {
      console.error('Supabase test failed:', error);
    }
  };

  return (
    <div className="mt-4 bg-gray-800/50 border border-gray-600 rounded-lg p-4">
      <h3 className="text-lg font-bold text-white mb-4">🔧 Debug Panel</h3>
      
      {/* Session Info */}
      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
        <h4 className="text-blue-300 font-medium mb-2">Session Info</h4>
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Session ID:</span>
            <span className="text-blue-300 font-mono">{sessionId.slice(-8)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">My Player ID:</span>
            <span className="text-green-300 font-mono">{myPlayerId.slice(-8)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Console Device:</span>
            <span className={`font-mono ${debugInfo.session.consoleDeviceId ? 'text-green-300' : 'text-red-300'}`}>
              {debugInfo.session.consoleDeviceId ? debugInfo.session.consoleDeviceId.slice(-8) : 'Not Found'}
            </span>
          </div>
        </div>
      </div>

      {/* WebRTC Status */}
      <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded">
        <h4 className="text-purple-300 font-medium mb-2">WebRTC Status</h4>
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Initialized:</span>
            <span className={debugInfo.webrtc.isInitialized ? 'text-green-300' : 'text-red-300'}>
              {debugInfo.webrtc.isInitialized ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Connections:</span>
            <span className="text-blue-300">{Object.keys(debugInfo.webrtc.connections).length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Connected:</span>
            <span className="text-green-300">{debugInfo.webrtc.connectedDevices.length}</span>
          </div>
        </div>
        
        {Object.keys(debugInfo.webrtc.connections).length > 0 && (
          <div className="mt-2 p-2 bg-gray-700/50 rounded">
            <div className="text-xs text-gray-300">Connection States:</div>
            {Object.entries(debugInfo.webrtc.connections).map(([deviceId, state]) => (
              <div key={deviceId} className="flex justify-between text-xs">
                <span className="text-gray-400">{deviceId.slice(-8)}:</span>
                <span className={`${state === 'connected' ? 'text-green-300' : 'text-yellow-300'}`}>
                  {state}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Communication Status */}
      <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded">
        <h4 className="text-green-300 font-medium mb-2">Communication Status</h4>
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Send Attempts:</span>
            <span className="text-blue-300">{debugInfo.communication.sendAttempts}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Last WebRTC:</span>
            <span className="text-green-300 text-xs">
              {debugInfo.communication.lastWebRTCSent || 'Never'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Last Supabase:</span>
            <span className="text-yellow-300 text-xs">
              {debugInfo.communication.lastSupabaseSent || 'Never'}
            </span>
          </div>
        </div>
      </div>

      {/* Test Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={testDirectWebRTC}
          className="py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded text-purple-300 text-sm transition-colors"
        >
          Test WebRTC
        </button>
        <button
          onClick={testSupabaseFallback}
          className="py-2 px-3 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded text-yellow-300 text-sm transition-colors"
        >
          Test Supabase
        </button>
        <button
          onClick={onTestInput}
          className="py-2 px-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded text-green-300 text-sm transition-colors col-span-2"
        >
          Test Navigation Input
        </button>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-2 bg-gray-700/30 rounded text-xs text-gray-400">
        <div className="font-medium text-gray-300 mb-1">Debugging Steps:</div>
        <div>1. Check if Console Device is found</div>
        <div>2. Verify WebRTC initialization</div>
        <div>3. Test direct WebRTC communication</div>
        <div>4. Test Supabase fallback</div>
        <div>5. Monitor console logs for detailed info</div>
      </div>
    </div>
  );
};

export default PhoneControllerDebugPanel;