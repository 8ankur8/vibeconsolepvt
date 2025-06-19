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
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

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
    
    console.log(`🚀 WebRTC Manager initialized - Session: ${sessionId}, Device: ${deviceId}, Host: ${isHost}`);
  }

  // ICE servers configuration (using free STUN servers)
  private getIceServers(): RTCIceServer[] {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ];
  }

  // Create a new peer connection
  private createPeerConnection(targetDeviceId: string, isInitiator: boolean): RTCPeerConnection {
    console.log(`🔗 Creating peer connection to ${targetDeviceId} (initiator: ${isInitiator})`);
    
    const peerConnection = new RTCPeerConnection({
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 10
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(`📡 Sending ICE candidate to ${targetDeviceId}:`, event.candidate.candidate);
        try {
          await this.sendSignal(targetDeviceId, 'candidate', {
            candidate: event.candidate.toJSON(),
            timestamp: Date.now(),
            deviceType: this.isHost ? 'console' : 'controller'
          });
        } catch (error) {
          console.error('Error sending ICE candidate:', error);
        }
      } else {
        console.log(`✅ ICE gathering complete for ${targetDeviceId}`);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${targetDeviceId}: ${peerConnection.iceConnectionState}`);
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`🔗 Connection state with ${targetDeviceId}: ${state}`);
      this.onConnectionStateChange?.(targetDeviceId, state);
      
      if (state === 'connected') {
        console.log(`✅ Successfully connected to ${targetDeviceId}`);
      } else if (state === 'failed') {
        console.log(`❌ Connection failed with ${targetDeviceId}, will retry...`);
        setTimeout(() => this.reconnectToPeer(targetDeviceId), 2000);
      } else if (state === 'disconnected') {
        console.log(`⚠️ Connection disconnected with ${targetDeviceId}`);
      }
    };

    // Handle incoming data channels (for receivers)
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      console.log(`📨 Received data channel from ${targetDeviceId}: ${dataChannel.label}`);
      
      // Update the connection with the received data channel
      const connection = this.connections.get(targetDeviceId);
      if (connection) {
        connection.dataChannel = dataChannel;
        this.setupDataChannel(dataChannel, targetDeviceId);
      }
    };

    return peerConnection;
  }

  // Setup data channel event handlers
  private setupDataChannel(dataChannel: RTCDataChannel, deviceId: string) {
    console.log(`🔧 Setting up data channel for ${deviceId}`);
    
    dataChannel.onopen = () => {
      console.log(`✅ Data channel opened with ${deviceId} (readyState: ${dataChannel.readyState})`);
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
      const { error } = await supabase
        .from('webrtc_signals')
        .insert({
          session_id: this.sessionId,
          sender_device_id: this.deviceId,
          receiver_device_id: targetDeviceId,
          type,
          payload
        });

      if (error) {
        console.error('Supabase error sending signal:', error);
        throw error;
      }

      console.log(`📤 Sent ${type} signal to ${targetDeviceId}`);
    } catch (error) {
      console.error('Error sending WebRTC signal:', error);
      throw error;
    }
  }

  // Initialize connection to a peer (called by initiator)
  async connectToPeer(targetDeviceId: string): Promise<void> {
    console.log(`🤝 Initiating connection to ${targetDeviceId}`);
    
    // Don't create duplicate connections
    if (this.connections.has(targetDeviceId)) {
      console.log(`⚠️ Connection to ${targetDeviceId} already exists`);
      return;
    }
    
    const peerConnection = this.createPeerConnection(targetDeviceId, true);
    
    // Create data channel (initiator creates the channel)
    const dataChannel = peerConnection.createDataChannel('gameData', {
      ordered: true, // Ensure message order for game commands
      maxRetransmits: 3 // Allow some retransmits for reliability
    });
    
    this.setupDataChannel(dataChannel, targetDeviceId);

    // Store connection
    this.connections.set(targetDeviceId, {
      peerConnection,
      dataChannel,
      deviceId: targetDeviceId,
      isInitiator: true
    });

    try {
      // Create and send offer
      console.log(`📝 Creating offer for ${targetDeviceId}`);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      
      await peerConnection.setLocalDescription(offer);
      console.log(`📤 Sending offer to ${targetDeviceId}`);
      
      await this.sendSignal(targetDeviceId, 'offer', {
        sdp: offer,
        timestamp: Date.now(),
        deviceType: this.isHost ? 'console' : 'controller'
      });
    } catch (error) {
      console.error(`Error creating offer for ${targetDeviceId}:`, error);
      this.connections.delete(targetDeviceId);
      throw error;
    }
  }

  // Handle incoming signaling messages
  async handleSignal(signal: any): Promise<void> {
    const { sender_device_id, type, payload } = signal;
    
    console.log(`📡 Received ${type} signal from ${sender_device_id}`);

    let connection = this.connections.get(sender_device_id);
    
    try {
      if (type === 'offer') {
        // Create new connection for incoming offer
        if (!connection) {
          console.log(`🆕 Creating new connection for incoming offer from ${sender_device_id}`);
          const peerConnection = this.createPeerConnection(sender_device_id, false);
          connection = {
            peerConnection,
            deviceId: sender_device_id,
            isInitiator: false
          };
          this.connections.set(sender_device_id, connection);
        }

        // Set remote description and create answer
        console.log(`📝 Setting remote description and creating answer for ${sender_device_id}`);
        await connection.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        
        // Process any pending ICE candidates
        const pendingCandidates = this.pendingCandidates.get(sender_device_id) || [];
        for (const candidate of pendingCandidates) {
          console.log(`🧊 Adding pending ICE candidate for ${sender_device_id}`);
          await connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingCandidates.delete(sender_device_id);
        
        const answer = await connection.peerConnection.createAnswer();
        await connection.peerConnection.setLocalDescription(answer);
        
        console.log(`📤 Sending answer to ${sender_device_id}`);
        await this.sendSignal(sender_device_id, 'answer', {
          sdp: answer,
          timestamp: Date.now(),
          deviceType: this.isHost ? 'console' : 'controller'
        });
        
      } else if (type === 'answer' && connection) {
        // Handle answer
        console.log(`📝 Setting remote description from answer for ${sender_device_id}`);
        await connection.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        
        // Process any pending ICE candidates
        const pendingCandidates = this.pendingCandidates.get(sender_device_id) || [];
        for (const candidate of pendingCandidates) {
          console.log(`🧊 Adding pending ICE candidate for ${sender_device_id}`);
          await connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingCandidates.delete(sender_device_id);
        
      } else if (type === 'candidate') {
        // Handle ICE candidate
        if (payload.candidate) {
          const candidate = new RTCIceCandidate(payload.candidate);
          
          if (connection && connection.peerConnection.remoteDescription) {
            console.log(`🧊 Adding ICE candidate for ${sender_device_id}`);
            await connection.peerConnection.addIceCandidate(candidate);
          } else {
            // Store candidate for later if remote description isn't set yet
            console.log(`⏳ Storing ICE candidate for later (${sender_device_id})`);
            if (!this.pendingCandidates.has(sender_device_id)) {
              this.pendingCandidates.set(sender_device_id, []);
            }
            this.pendingCandidates.get(sender_device_id)!.push(payload.candidate);
          }
        }
      }
    } catch (error) {
      console.error(`Error handling ${type} signal from ${sender_device_id}:`, error);
      throw error;
    }
  }

  // Send message via WebRTC data channel
  sendMessage(targetDeviceId: string, message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>): boolean {
    const connection = this.connections.get(targetDeviceId);
    
    if (!connection?.dataChannel) {
      console.warn(`⚠️ No data channel for ${targetDeviceId}`);
      return false;
    }
    
    if (connection.dataChannel.readyState !== 'open') {
      console.warn(`⚠️ Data channel not ready for ${targetDeviceId} (state: ${connection.dataChannel.readyState})`);
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
      oldConnection.dataChannel?.close();
      oldConnection.peerConnection.close();
      this.connections.delete(deviceId);
    }

    // Clear pending candidates
    this.pendingCandidates.delete(deviceId);

    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reconnect if we were the initiator
    if (oldConnection?.isInitiator) {
      try {
        await this.connectToPeer(deviceId);
      } catch (error) {
        console.error(`Failed to reconnect to ${deviceId}:`, error);
      }
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
    this.pendingCandidates.clear();
  }

  // Get list of connected device IDs
  getConnectedDevices(): string[] {
    return Array.from(this.connections.keys()).filter(deviceId => {
      const connection = this.connections.get(deviceId);
      return connection?.peerConnection.connectionState === 'connected' && 
             connection?.dataChannel?.readyState === 'open';
    });
  }

  // Get detailed connection info for debugging
  getDetailedStatus() {
    const details: any = {};
    for (const [deviceId, connection] of this.connections) {
      details[deviceId] = {
        connectionState: connection.peerConnection.connectionState,
        iceConnectionState: connection.peerConnection.iceConnectionState,
        iceGatheringState: connection.peerConnection.iceGatheringState,
        dataChannelState: connection.dataChannel?.readyState || 'none',
        isInitiator: connection.isInitiator,
        localDescription: !!connection.peerConnection.localDescription,
        remoteDescription: !!connection.peerConnection.remoteDescription
      };
    }
    return details;
  }
}