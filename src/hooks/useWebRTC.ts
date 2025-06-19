import { useEffect, useRef, useState } from 'react';
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
  connections: Record<string, RTCPeerConnectionState>;
  dataChannels: Record<string, RTCDataChannelState | 'none'>;
  connectedDevices: string[];
  lastError?: string;
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
    connections: {},
    dataChannels: {},
    connectedDevices: []
  });

  // Update status from WebRTC manager
  const updateStatus = () => {
    if (!webrtcManager.current) return;
    
    setStatus(prev => ({
      ...prev,
      connections: webrtcManager.current!.getConnectionStatus(),
      dataChannels: webrtcManager.current!.getDataChannelStatus(),
      connectedDevices: webrtcManager.current!.getConnectedDevices()
    }));
  };

  // Initialize WebRTC manager
  useEffect(() => {
    if (!enabled || !sessionId || !deviceId) {
      console.log('⚠️ WebRTC disabled or missing required params:', { enabled, sessionId: !!sessionId, deviceId: !!deviceId });
      return;
    }

    console.log('🚀 Initializing WebRTC manager', { sessionId, deviceId, isHost });

    const handleConnectionStateChange = (deviceId: string, state: RTCPeerConnectionState) => {
      console.log(`🔗 Connection state changed for ${deviceId}: ${state}`);
      updateStatus();
    };

    webrtcManager.current = new WebRTCManager(
      sessionId,
      deviceId,
      isHost,
      onMessage,
      handleConnectionStateChange
    );

    setStatus(prev => ({ ...prev, isInitialized: true, lastError: undefined }));

    // Set up signaling listener with better error handling
    const signalChannel = supabase
      .channel(`webrtc_signals_${sessionId}_${deviceId}`)
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
            console.error('Error handling WebRTC signal:', error);
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
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ WebRTC signaling channel error');
          setStatus(prev => ({ 
            ...prev, 
            lastError: 'Signaling channel error' 
          }));
        }
      });

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up WebRTC hook');
      signalChannel.unsubscribe();
      if (webrtcManager.current) {
        webrtcManager.current.cleanup();
        webrtcManager.current = null;
      }
      setStatus({
        isInitialized: false,
        connections: {},
        dataChannels: {},
        connectedDevices: []
      });
    };
  }, [sessionId, deviceId, isHost, enabled]);

  // Connect to a specific device
  const connectToDevice = async (targetDeviceId: string) => {
    if (!webrtcManager.current) {
      console.error('WebRTC manager not initialized');
      return false;
    }

    try {
      console.log(`🤝 Attempting to connect to device: ${targetDeviceId}`);
      await webrtcManager.current.connectToPeer(targetDeviceId);
      updateStatus();
      return true;
    } catch (error) {
      console.error('Error connecting to device:', error);
      setStatus(prev => ({ 
        ...prev, 
        lastError: `Connection error: ${error.message}` 
      }));
      return false;
    }
  };

  // Send message to specific device
  const sendMessage = (targetDeviceId: string, message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>) => {
    if (!webrtcManager.current) {
      console.error('WebRTC manager not initialized');
      return false;
    }

    const result = webrtcManager.current.sendMessage(targetDeviceId, message);
    if (result) {
      updateStatus();
    }
    return result;
  };

  // Broadcast message to all connected devices
  const broadcastMessage = (message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>) => {
    if (!webrtcManager.current) {
      console.error('WebRTC manager not initialized');
      return { webrtc: 0, fallback: [] };
    }

    const result = webrtcManager.current.broadcastMessage(message);
    updateStatus();
    return result;
  };

  // Status update interval (less frequent to reduce overhead)
  useEffect(() => {
    if (!webrtcManager.current) return;

    const interval = setInterval(updateStatus, 3000); // Every 3 seconds
    return () => clearInterval(interval);
  }, [webrtcManager.current]);

  // Get detailed status for debugging
  const getDetailedStatus = () => {
    if (!webrtcManager.current) return {};
    return webrtcManager.current.getDetailedStatus();
  };

  return {
    status,
    connectToDevice,
    sendMessage,
    broadcastMessage,
    updateStatus,
    getDetailedStatus
  };
};