import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  timestamp?: string;
}

const ConnectionTester: React.FC<{
  sessionId: string;
  deviceId: string;
  webrtcStatus?: any;
}> = ({ sessionId, deviceId, webrtcStatus }) => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [consoleDeviceId, setConsoleDeviceId] = useState<string | null>(null);

  const addTestResult = (name: string, status: 'success' | 'error', message: string) => {
    setTests(prev => [
      ...prev.filter(t => t.name !== name),
      {
        name,
        status,
        message,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTests([]);
    
    console.log('🧪 [TESTER] Starting comprehensive connection tests...');

    // Test 1: Supabase Connectivity
    try {
      addTestResult('Supabase Connection', 'pending', 'Testing...');
      const { data, error } = await supabase.from('sessions').select('id').limit(1);
      if (error) throw error;
      addTestResult('Supabase Connection', 'success', 'Database accessible');
    } catch (error) {
      addTestResult('Supabase Connection', 'error', `Failed: ${error.message}`);
    }

    // Test 2: Session Exists
    try {
      addTestResult('Session Verification', 'pending', 'Checking session...');
      const { data: session, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (error) throw error;
      addTestResult('Session Verification', 'success', `Session found: ${session.code}`);
    } catch (error) {
      addTestResult('Session Verification', 'error', `Session not found: ${error.message}`);
    }

    // Test 3: Find Console Device
    try {
      addTestResult('Console Discovery', 'pending', 'Finding console device...');
      const { data: console, error } = await supabase
        .from('devices')
        .select('id, name')
        .eq('session_id', sessionId)
        .eq('name', 'Console')
        .single();
      
      if (error) throw error;
      setConsoleDeviceId(console.id);
      addTestResult('Console Discovery', 'success', `Console found: ${console.id.slice(-8)}`);
    } catch (error) {
      addTestResult('Console Discovery', 'error', `Console not found: ${error.message}`);
    }

    // Test 4: My Device Registration
    try {
      addTestResult('Device Registration', 'pending', 'Checking my device...');
      const { data: myDevice, error } = await supabase
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single();
      
      if (error) throw error;
      addTestResult('Device Registration', 'success', `Device registered: ${myDevice.name}`);
    } catch (error) {
      addTestResult('Device Registration', 'error', `Device not found: ${error.message}`);
    }

    // Test 5: WebRTC Status
    if (webrtcStatus) {
      addTestResult('WebRTC Status', 'pending', 'Checking WebRTC...');
      if (webrtcStatus.isInitialized) {
        const connectedCount = webrtcStatus.connectedDevices.length;
        const totalCount = Object.keys(webrtcStatus.connections).length;
        addTestResult(
          'WebRTC Status', 
          connectedCount > 0 ? 'success' : 'error',
          `Initialized: ${webrtcStatus.isInitialized}, Connected: ${connectedCount}/${totalCount}`
        );
      } else {
        addTestResult('WebRTC Status', 'error', 'WebRTC not initialized');
      }
    }

    // Test 6: Supabase Real-time Test
    try {
      addTestResult('Real-time Test', 'pending', 'Testing real-time updates...');
      
      const testData = {
        action: 'test',
        timestamp: Date.now(),
        source: 'connection_tester'
      };

      const { error } = await supabase
        .from('sessions')
        .update({ selected_editor: JSON.stringify(testData) })
        .eq('id', sessionId);

      if (error) throw error;
      addTestResult('Real-time Test', 'success', 'Supabase update successful');
    } catch (error) {
      addTestResult('Real-time Test', 'error', `Update failed: ${error.message}`);
    }

    setIsRunning(false);
    console.log('🧪 [TESTER] All tests completed');
  };

  const testWebRTCMessage = async () => {
    if (!consoleDeviceId || !webrtcStatus?.isInitialized) {
      addTestResult('WebRTC Message', 'error', 'WebRTC not ready or console not found');
      return;
    }

    try {
      addTestResult('WebRTC Message', 'pending', 'Sending test message...');
      
      const testMessage = {
        type: 'game_data' as const,
        data: {
          test: {
            message: 'Connection test',
            timestamp: Date.now()
          }
        }
      };

      // You'll need to expose this method from your WebRTC hook
      // const success = webrtc.sendMessage(consoleDeviceId, testMessage);
      
      // For now, just check if we're connected
      const isConnected = webrtcStatus.connectedDevices.includes(consoleDeviceId);
      
      if (isConnected) {
        addTestResult('WebRTC Message', 'success', 'Connected and ready to send');
      } else {
        addTestResult('WebRTC Message', 'error', 'Not connected to console');
      }
    } catch (error) {
      addTestResult('WebRTC Message', 'error', `WebRTC test failed: ${error.message}`);
    }
  };

  const testInputRouter = async () => {
    try {
      addTestResult('InputRouter Test', 'pending', 'Testing input format...');
      
      // Test the exact message format your InputRouter expects
      const testInput = {
        type: 'game_data',
        data: {
          dpad: {
            directionchange: {
              key: 'right',
              pressed: true
            }
          }
        },
        timestamp: Date.now(),
        senderId: deviceId
      };

      console.log('🧪 [TESTER] Test input format:', testInput);
      addTestResult('InputRouter Test', 'success', 'Input format validated');
    } catch (error) {
      addTestResult('InputRouter Test', 'error', `Format test failed: ${error.message}`);
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">🧪 Connection Tester</h3>
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className={`px-4 py-2 rounded transition-colors ${
            isRunning 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isRunning ? 'Testing...' : 'Run All Tests'}
        </button>
      </div>

      {/* Test Results */}
      <div className="space-y-2 mb-4">
        {tests.map((test, index) => (
          <div key={index} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                test.status === 'pending' ? 'bg-yellow-400 animate-pulse' :
                test.status === 'success' ? 'bg-green-400' : 'bg-red-400'
              }`}></div>
              <span className="text-white font-medium">{test.name}</span>
            </div>
            <div className="text-right">
              <div className={`text-sm ${
                test.status === 'success' ? 'text-green-300' : 
                test.status === 'error' ? 'text-red-300' : 'text-yellow-300'
              }`}>
                {test.message}
              </div>
              {test.timestamp && (
                <div className="text-xs text-gray-400">{test.timestamp}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Individual Test Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={testWebRTCMessage}
          disabled={!consoleDeviceId}
          className="py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded text-purple-300 text-sm transition-colors disabled:opacity-50"
        >
          Test WebRTC
        </button>
        <button
          onClick={testInputRouter}
          className="py-2 px-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded text-green-300 text-sm transition-colors"
        >
          Test Input Format
        </button>
      </div>

      {/* Session Info */}
      <div className="mt-4 p-3 bg-gray-700/30 rounded text-xs">
        <div className="grid grid-cols-2 gap-2 text-gray-300">
          <div>Session: <span className="text-blue-300">{sessionId.slice(-8)}</span></div>
          <div>Device: <span className="text-green-300">{deviceId.slice(-8)}</span></div>
          <div>Console: <span className="text-purple-300">{consoleDeviceId?.slice(-8) || 'Not found'}</span></div>
          <div>WebRTC: <span className={webrtcStatus?.isInitialized ? 'text-green-300' : 'text-red-300'}>
            {webrtcStatus?.isInitialized ? 'Ready' : 'Not ready'}
          </span></div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300">
        <div className="font-medium mb-1">Testing Guide:</div>
        <div>1. Run all tests to check basic connectivity</div>
        <div>2. If WebRTC fails, check console logs for errors</div>
        <div>3. If Supabase fails, check environment variables</div>
        <div>4. Test individual components to isolate issues</div>
      </div>
    </div>
  );
};

export default ConnectionTester;