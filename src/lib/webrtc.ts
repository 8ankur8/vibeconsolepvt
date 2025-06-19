export interface WebRTCConnection {
  peerConnection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  deviceId: string;
  isInitiator: boolean;
}

export interface WebRTCMessage {
  type: 'navigation' | 'selection' | 'heartbeat' | 'game_data';
  data: any;
  timestamp: number;
  senderId: string;
}

export class WebRTCManager {
  private connections = new Map<string, WebRTCConnection>();
  private sessionId: string;
  private deviceId: string;
  private isHost: boolean;
  private onMessageCallback?: (message: WebRTCMessage, fromDeviceId: string) => void;
  private onConnectionStateChange?: (deviceId: string, state: RTCPeerConnectionState) => void;

  constructor(
    sessionId: string, 
    deviceId: string, 
    isHost: boolean = false,
    onMessage?: (message: WebRTCMessage, fromDeviceId: string) => void,
    onConnectionStateChange?: (deviceId: string, state: RTCPeerConnectionState) => void
  ) {
    this.sessionId = sessionId;
    this.deviceId = deviceId;
    this.isHost = isHost;
    this.onMessageCallback = onMessage;
    this.onConnectionStateChange = onConnectionStateChange;
  }

  // ICE servers configuration (using free STUN servers)
  private getIceServers(): RTCIceServer[] {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
  }

  // Create a new peer connection
  private createPeerConnection(targetDeviceId: string, isInitiator: boolean): RTCPeerConnection {
    const peerConnection = new RTCPeerConnection({
      iceServers: this.getIceServers()
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(`📡 Sending ICE candidate to ${targetDeviceId}`);
        await this.sendSignal(targetDeviceId, 'candidate', {
          candidate: event.candidate.toJSON(),
          timestamp: Date.now(),
          deviceType: this.isHost ? 'console' : 'controller'
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${targetDeviceId}: ${peerConnection.connectionState}`);
      this.onConnectionStateChange?.(targetDeviceId, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        console.log(`❌ Connection failed with ${targetDeviceId}, attempting reconnection...`);
        this.reconnectToPeer(targetDeviceId);
      }
    };

    // Handle incoming data channels (for receivers)
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      console.log(`📨 Received data channel from ${targetDeviceId}`);
      this.setupDataChannel(dataChannel, targetDeviceId);
    };

    return peerConnection;
  }

  // Setup data channel event handlers
  private setupDataChannel(dataChannel: RTCDataChannel, deviceId: string) {
    dataChannel.onopen = () => {
      console.log(`✅ Data channel opened with ${deviceId}`);
    };

    dataChannel.onclose = () => {
      console.log(`❌ Data channel closed with ${deviceId}`);
    };

    dataChannel.onerror = (error) => {
      console.error(`💥 Data channel error with ${deviceId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: WebRTCMessage = JSON.parse(event.data);
        console.log(`📩 Received WebRTC message from ${deviceId}:`, message);
        this.onMessageCallback?.(message, deviceId);
      } catch (error) {
        console.error('Error parsing WebRTC message:', error);
      }
    };
  }

  // Send signaling message via Supabase
  private async sendSignal(targetDeviceId: string, type: 'offer' | 'answer' | 'candidate', payload: any) {
    try {
      const { supabase } = await import('./supabase');
      await supabase
        .from('webrtc_signals')
        .insert({
          session_id: this.sessionId,
          sender_device_id: this.deviceId,
          receiver_device_id: targetDeviceId,
          type,
          payload
        });
    } catch (error) {
      console.error('Error sending WebRTC signal:', error);
      throw error;
    }
  }

  // Initialize connection to a peer (called by initiator)
  async connectToPeer(targetDeviceId: string): Promise<void> {
    console.log(`🤝 Initiating connection to ${targetDeviceId}`);
    
    const peerConnection = this.createPeerConnection(targetDeviceId, true);
    
    // Create data channel (initiator creates the channel)
    const dataChannel = peerConnection.createDataChannel('gameData', {
      ordered: false, // Allow out-of-order delivery for better performance
      maxRetransmits: 0 // Don't retransmit for real-time data
    });
    
    this.setupDataChannel(dataChannel, targetDeviceId);

    // Store connection
    this.connections.set(targetDeviceId, {
      peerConnection,
      dataChannel,
      deviceId: targetDeviceId,
      isInitiator: true
    });

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    await this.sendSignal(targetDeviceId, 'offer', {
      sdp: offer,
      timestamp: Date.now(),
      deviceType: this.isHost ? 'console' : 'controller'
    });
  }

  // Handle incoming signaling messages
  async handleSignal(signal: any): Promise<void> {
    const { sender_device_id, type, payload } = signal;
    
    console.log(`📡 Received ${type} signal from ${sender_device_id}`);

    let connection = this.connections.get(sender_device_id);
    
    if (type === 'offer') {
      // Create new connection for incoming offer
      if (!connection) {
        const peerConnection = this.createPeerConnection(sender_device_id, false);
        connection = {
          peerConnection,
          deviceId: sender_device_id,
          isInitiator: false
        };
        this.connections.set(sender_device_id, connection);
      }

      // Set remote description and create answer
      await connection.peerConnection.setRemoteDescription(payload.sdp);
      const answer = await connection.peerConnection.createAnswer();
      await connection.peerConnection.setLocalDescription(answer);
      
      await this.sendSignal(sender_device_id, 'answer', {
        sdp: answer,
        timestamp: Date.now(),
        deviceType: this.isHost ? 'console' : 'controller'
      });
      
    } else if (type === 'answer' && connection) {
      // Handle answer
      await connection.peerConnection.setRemoteDescription(payload.sdp);
      
    } else if (type === 'candidate' && connection) {
      // Handle ICE candidate
      if (payload.candidate) {
        await connection.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    }
  }

  // Send message via WebRTC data channel
  sendMessage(targetDeviceId: string, message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>): boolean {
    const connection = this.connections.get(targetDeviceId);
    
    if (!connection?.dataChannel || connection.dataChannel.readyState !== 'open') {
      console.warn(`⚠️ Data channel not ready for ${targetDeviceId}, falling back to Supabase`);
      return false;
    }

    const fullMessage: WebRTCMessage = {
      ...message,
      timestamp: Date.now(),
      senderId: this.deviceId
    };

    try {
      connection.dataChannel.send(JSON.stringify(fullMessage));
      console.log(`📤 Sent WebRTC message to ${targetDeviceId}:`, fullMessage);
      return true;
    } catch (error) {
      console.error(`Error sending WebRTC message to ${targetDeviceId}:`, error);
      return false;
    }
  }

  // Broadcast message to all connected peers
  broadcastMessage(message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>): { webrtc: number; fallback: string[] } {
    const webrtcSent: string[] = [];
    const fallbackNeeded: string[] = [];

    for (const [deviceId, connection] of this.connections) {
      if (this.sendMessage(deviceId, message)) {
        webrtcSent.push(deviceId);
      } else {
        fallbackNeeded.push(deviceId);
      }
    }

    console.log(`📡 Broadcast: ${webrtcSent.length} via WebRTC, ${fallbackNeeded.length} need fallback`);
    return { webrtc: webrtcSent.length, fallback: fallbackNeeded };
  }

  // Reconnect to a peer
  private async reconnectToPeer(deviceId: string): Promise<void> {
    console.log(`🔄 Reconnecting to ${deviceId}`);
    
    // Clean up old connection
    const oldConnection = this.connections.get(deviceId);
    if (oldConnection) {
      oldConnection.peerConnection.close();
      this.connections.delete(deviceId);
    }

    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reconnect if we were the initiator
    if (oldConnection?.isInitiator) {
      await this.connectToPeer(deviceId);
    }
  }

  // Get connection status for all peers
  getConnectionStatus(): Record<string, RTCPeerConnectionState> {
    const status: Record<string, RTCPeerConnectionState> = {};
    for (const [deviceId, connection] of this.connections) {
      status[deviceId] = connection.peerConnection.connectionState;
    }
    return status;
  }

  // Get data channel status for all peers
  getDataChannelStatus(): Record<string, RTCDataChannelState | 'none'> {
    const status: Record<string, RTCDataChannelState | 'none'> = {};
    for (const [deviceId, connection] of this.connections) {
      status[deviceId] = connection.dataChannel?.readyState || 'none';
    }
    return status;
  }

  // Cleanup all connections
  cleanup(): void {
    console.log('🧹 Cleaning up WebRTC connections');
    for (const [deviceId, connection] of this.connections) {
      connection.dataChannel?.close();
      connection.peerConnection.close();
    }
    this.connections.clear();
  }

  // Get list of connected device IDs
  getConnectedDevices(): string[] {
    return Array.from(this.connections.keys()).filter(deviceId => {
      const connection = this.connections.get(deviceId);
      return connection?.peerConnection.connectionState === 'connected';
    });
  }
}