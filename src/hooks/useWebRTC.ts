import { useEffect, useRef, useState, useCallback } from 'react';
import { WebRTCManager, WebRTCMessage } from '../lib/webrtc';
import { supabase } from '../lib/supabase';

interface UseWebRTCProps {
  sessionId: string;
  deviceId: string;
  isHost: boolean;
  onMessage?: (message: WebRTCMessage, fromDeviceId: string) => void;
  enabled?: boolean;
}

interface WebRTCStatus {
  isInitialized: boolean;
  isSignalingChannelReady: boolean; // ENHANCED: New state variable
  connections: Record<string, RTCPeerConnectionState>;
  dataChannels: Record<string, RTCDataChannelState | 'none'>;
  connectedDevices: string[];
  lastError?: string;
  totalConnections: number;
  readyConnections: number;
}

export const useWebRTC = ({ 
  sessionId, 
  deviceId, 
  isHost, 
  onMessage, 
  enabled = true 
}: UseWebRTCProps) => {
  const webrtcManager = useRef<WebRTCManager | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>({
    isInitialized: false,
    isSignalingChannelReady: false, // ENHANCED: Initialize to false
    connections: {},
    dataChannels: {},
    connectedDevices: [],
    totalConnections: 0,
    readyConnections: 0
  });

  // Memoized status update to prevent unnecessary re-renders
  const updateStatus = useCallback(() => {
    if (!webrtcManager.current) return;
    
    const connections = webrtcManager.current.getConnectionStatus();
    const dataChannels = webrtcManager.current.getDataChannelStatus();
    const connectedDevices = webrtcManager.current.getConnectedDevices();
    
    setStatus(prev => ({
      ...prev,
      connections,
      dataChannels,
      connectedDevices,
      totalConnections: Object.keys(connections).length,
      readyConnections: connectedDevices.length
    }));
  }, []);

  // Stable connection state change handler
  const connectionStateChangeHandler = useCallback((deviceId: string, state: RTCPeerConnectionState) => {
    console.log(`🔗 Connection state changed for ${deviceId}: ${state}`);
    updateStatus();
  }, [updateStatus]);

  // Initialize WebRTC manager
  useEffect(() => {
    if (!enabled || !sessionId || !deviceId) {
      console.log('⚠️ WebRTC disabled or missing required params:', { 
        enabled, 
        sessionId: !!sessionId, 
        deviceId: !!deviceId 
      });
      return;
    }

    // Prevent duplicate initialization
    if (webrtcManager.current) {
      console.log('⚠️ WebRTC manager already initialized, skipping...');
      return;
    }

    console.log('🚀 Initializing WebRTC manager', { sessionId, deviceId, isHost });

    try {
      webrtcManager.current = new WebRTCManager(
        sessionId,
        deviceId,
        isHost,
        onMessage,
        connectionStateChangeHandler
      );

      setStatus(prev => ({ 
        ...prev, 
        isInitialized: true, 
        lastError: undefined 
      }));

      // Initial status update
      updateStatus();

    } catch (error) {
      console.error('❌ Failed to initialize WebRTC manager:', error);
      setStatus(prev => ({ 
        ...prev, 
        lastError: `Initialization failed: ${error.message}` 
      }));
    }

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up WebRTC manager');
      if (webrtcManager.current) {
        webrtcManager.current.cleanup();
        webrtcManager.current = null;
      }
      setStatus({
        isInitialized: false,
        isSignalingChannelReady: false, // ENHANCED: Reset signaling channel state
        connections: {},
        dataChannels: {},
        connectedDevices: [],
        totalConnections: 0,
        readyConnections: 0
      });
    };
  }, [sessionId, deviceId, isHost, enabled]); // Removed onMessage to prevent recreation

  // Set up signaling listener - separate effect to avoid recreation
  useEffect(() => {
    if (!webrtcManager.current || !sessionId || !deviceId) {
      return;
    }

    console.log(`📡 Setting up WebRTC signaling for device ${deviceId}`);

    const signalChannel = supabase
      .channel(`webrtc_signals_${sessionId}_${deviceId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: deviceId }
        }
      })
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'webrtc_signals',
          filter: `receiver_device_id=eq.${deviceId}`
        }, 
        async (payload) => {
          console.log('📡 Received WebRTC signal:', payload);
          try {
            if (webrtcManager.current) {
              await webrtcManager.current.handleSignal(payload.new);
              updateStatus();
            }
          } catch (error) {
            console.error('❌ Error handling WebRTC signal:', error);
            setStatus(prev => ({ 
              ...prev, 
              lastError: `Signal handling error: ${error.message}` 
            }));
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 WebRTC signaling subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ WebRTC signaling channel ready');
          // ENHANCED: Set signaling channel ready state
          setStatus(prev => ({ ...prev, isSignalingChannelReady: true }));
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ WebRTC signaling channel error - check RLS policies');
          setStatus(prev => ({ 
            ...prev, 
            isSignalingChannelReady: false, // ENHANCED: Reset on error
            lastError: 'Signaling channel error - check database permissions' 
          }));
        }
      });

    return () => {
      console.log('🧹 Cleaning up WebRTC signaling');
      setStatus(prev => ({ ...prev, isSignalingChannelReady: false })); // ENHANCED: Reset on cleanup
      signalChannel.unsubscribe();
    };
  }, [sessionId, deviceId, updateStatus]);

  // Connect to a specific device
  const connectToDevice = useCallback(async (targetDeviceId: string): Promise<boolean> => {
    if (!webrtcManager.current) {
      console.error('❌ WebRTC manager not initialized');
      return false;
    }

    try {
      console.log(`🤝 Attempting to connect to device: ${targetDeviceId}`);
      await webrtcManager.current.connectToPeer(targetDeviceId);
      updateStatus();
      return true;
    } catch (error) {
      console.error('❌ Error connecting to device:', error);
      setStatus(prev => ({ 
        ...prev, 
        lastError: `Connection error: ${error.message}` 
      }));
      return false;
    }
  }, [updateStatus]);

  // Send message to specific device
  const sendMessage = useCallback((targetDeviceId: string, message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>) => {
    if (!webrtcManager.current) {
      console.error('❌ WebRTC manager not initialized');
      return false;
    }

    const result = webrtcManager.current.sendMessage(targetDeviceId, message);
    if (result) {
      updateStatus();
    }
    return result;
  }, [updateStatus]);

  // Broadcast message to all connected devices
  const broadcastMessage = useCallback((message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>) => {
    if (!webrtcManager.current) {
      console.error('❌ WebRTC manager not initialized');
      return { webrtc: 0, fallback: [] };
    }

    const result = webrtcManager.current.broadcastMessage(message);
    updateStatus();
    return result;
  }, [updateStatus]);

  // Get detailed status for debugging
  const getDetailedStatus = useCallback(() => {
    if (!webrtcManager.current) return {};
    return webrtcManager.current.getDetailedStatus();
  }, []);

  // Status update interval (reduced frequency)
  useEffect(() => {
    if (!webrtcManager.current) return;

    const interval = setInterval(updateStatus, 5000); // Every 5 seconds
    return () => clearInterval(interval);
  }, [updateStatus]);

  return {
    status,
    connectToDevice,
    sendMessage,
    broadcastMessage,
    updateStatus,
    getDetailedStatus
  };
};