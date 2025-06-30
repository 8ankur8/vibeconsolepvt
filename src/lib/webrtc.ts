export interface WebRTCConnection {
  peerConnection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  deviceId: string;
  isInitiator: boolean;
  connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
  lastConnectionAttempt?: number;
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
  private connectionAttempts = new Map<string, number>();
  private maxConnectionAttempts = 3;
  private connectionCooldown = 5000; // 5 seconds between attempts

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
    
    console.log(`🚀 [WebRTC] Manager initialized - Session: ${sessionId.slice(-8)}, Device: ${deviceId.slice(-8)}, Host: ${isHost}`);
  }

  // ICE servers configuration (using free STUN servers)
  private getIceServers(): RTCIceServer[] {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }

  // Check if we should attempt connection to a device
  private shouldAttemptConnection(targetDeviceId: string): boolean {
    const existingConnection = this.connections.get(targetDeviceId);
    const currentTime = Date.now();
    
    // Don't connect if already connected or connecting
    if (existingConnection) {
      const state = existingConnection.peerConnection.connectionState;
      
      if (state === 'connected' || state === 'connecting') {
        return false;
      }
      
      // Check cooldown for failed connections
      if (existingConnection.lastConnectionAttempt) {
        const timeSinceLastAttempt = currentTime - existingConnection.lastConnectionAttempt;
        if (timeSinceLastAttempt < this.connectionCooldown) {
          return false;
        }
      }
    }
    
    // Check attempt count
    const attempts = this.connectionAttempts.get(targetDeviceId) || 0;
    if (attempts >= this.maxConnectionAttempts) {
      return false;
    }
    
    return true;
  }

  // Create a new peer connection
  private createPeerConnection(targetDeviceId: string, isInitiator: boolean): RTCPeerConnection {
    console.log(`🔗 [WebRTC] Creating peer connection to ${targetDeviceId.slice(-8)} (initiator: ${isInitiator})`);
    
    const peerConnection = new RTCPeerConnection({
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 10
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log(`📡 [WebRTC] Sending ICE candidate to ${targetDeviceId.slice(-8)}`);
        try {
          await this.sendSignal(targetDeviceId, 'candidate', {
            candidate: event.candidate.toJSON(),
            timestamp: Date.now(),
            deviceType: this.isHost ? 'console' : 'controller'
          });
        } catch (error) {
          console.error(`❌ [WebRTC] Error sending ICE candidate:`, error);
        }
      } else {
        console.log(`✅ [WebRTC] ICE gathering complete for ${targetDeviceId.slice(-8)}`);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      const iceState = peerConnection.iceConnectionState;
      console.log(`🧊 [WebRTC] ICE connection state with ${targetDeviceId.slice(-8)}: ${iceState}`);
      
      // Update connection tracking
      const connection = this.connections.get(targetDeviceId);
      if (connection) {
        if (iceState === 'failed' || iceState === 'disconnected') {
          connection.connectionState = 'failed';
        } else if (iceState === 'connected' || iceState === 'completed') {
          connection.connectionState = 'connected';
          // Reset attempt counter on successful connection
          this.connectionAttempts.delete(targetDeviceId);
        }
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`🔗 [WebRTC] Connection state with ${targetDeviceId.slice(-8)}: ${state}`);
      
      // Update connection tracking
      const connection = this.connections.get(targetDeviceId);
      if (connection) {
        connection.connectionState = state;
      }
      
      this.onConnectionStateChange?.(targetDeviceId, state);
      
      if (state === 'connected') {
        console.log(`✅ [WebRTC] Successfully connected to ${targetDeviceId.slice(-8)}`);
        // Reset attempt counter on successful connection
        this.connectionAttempts.delete(targetDeviceId);
      } else if (state === 'failed') {
        console.log(`❌ [WebRTC] Connection failed with ${targetDeviceId.slice(-8)}`);
        // Increment attempt counter
        const attempts = this.connectionAttempts.get(targetDeviceId) || 0;
        this.connectionAttempts.set(targetDeviceId, attempts + 1);
        
        // Schedule retry if under max attempts
        if (attempts + 1 < this.maxConnectionAttempts) {
          setTimeout(() => this.reconnectToPeer(targetDeviceId), this.connectionCooldown);
        }
      } else if (state === 'disconnected') {
        console.log(`⚠️ [WebRTC] Connection disconnected with ${targetDeviceId.slice(-8)}`);
        if (connection) {
          connection.connectionState = 'disconnected';
        }
      }
    };

    // Handle incoming data channels (for receivers)
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      console.log(`📨 [WebRTC] Received data channel from ${targetDeviceId.slice(-8)}: ${dataChannel.label}`);
      
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
    console.log(`🔧 [WebRTC] Setting up data channel for ${deviceId.slice(-8)}`);
    
    dataChannel.onopen = () => {
      console.log(`✅ [WebRTC] Data channel opened with ${deviceId.slice(-8)}`);
      
      // Update connection state
      const connection = this.connections.get(deviceId);
      if (connection) {
        connection.connectionState = 'connected';
      }
    };

    dataChannel.onclose = () => {
      console.log(`❌ [WebRTC] Data channel closed with ${deviceId.slice(-8)}`);
      
      // Update connection state
      const connection = this.connections.get(deviceId);
      if (connection) {
        connection.connectionState = 'disconnected';
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`💥 [WebRTC] Data channel error with ${deviceId.slice(-8)}:`, error);
      
      // Update connection state
      const connection = this.connections.get(deviceId);
      if (connection) {
        connection.connectionState = 'failed';
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: WebRTCMessage = JSON.parse(event.data);
        console.log(`📩 [WebRTC] Received message from ${deviceId.slice(-8)}:`, message.type);
        this.onMessageCallback?.(message, deviceId);
      } catch (error) {
        console.error(`❌ [WebRTC] Error parsing message from ${deviceId.slice(-8)}:`, error);
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
        console.error(`❌ [WebRTC] Supabase error sending signal:`, error);
        throw error;
      }

      console.log(`📤 [WebRTC] Sent ${type} signal to ${targetDeviceId.slice(-8)}`);
    } catch (error) {
      console.error(`❌ [WebRTC] Error sending signal:`, error);
      throw error;
    }
  }

  // Initialize connection to a peer
  async connectToPeer(targetDeviceId: string): Promise<void> {
    console.log(`🤝 [WebRTC] Connecting to ${targetDeviceId.slice(-8)}`);
    
    // Check if we should attempt this connection
    if (!this.shouldAttemptConnection(targetDeviceId)) {
      return;
    }
    
    // Clean up any existing failed connection
    const existingConnection = this.connections.get(targetDeviceId);
    if (existingConnection && existingConnection.connectionState === 'failed') {
      existingConnection.dataChannel?.close();
      existingConnection.peerConnection.close();
      this.connections.delete(targetDeviceId);
    }
    
    const peerConnection = this.createPeerConnection(targetDeviceId, true);
    
    // Create data channel (initiator creates the channel)
    const dataChannel = peerConnection.createDataChannel('gameData', {
      ordered: true, // Ensure message order for game commands
      maxRetransmits: 3 // Allow some retransmits for reliability
    });
    
    this.setupDataChannel(dataChannel, targetDeviceId);

    // Store connection
    const connection: WebRTCConnection = {
      peerConnection,
      dataChannel,
      deviceId: targetDeviceId,
      isInitiator: true,
      connectionState: 'connecting',
      lastConnectionAttempt: Date.now()
    };
    
    this.connections.set(targetDeviceId, connection);
    
    // Increment attempt counter
    const attempts = this.connectionAttempts.get(targetDeviceId) || 0;
    this.connectionAttempts.set(targetDeviceId, attempts + 1);

    try {
      // Create and send offer
      console.log(`📝 [WebRTC] Creating offer for ${targetDeviceId.slice(-8)}`);
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      
      await peerConnection.setLocalDescription(offer);
      console.log(`✅ [WebRTC] Local description set for ${targetDeviceId.slice(-8)}`);
      
      await this.sendSignal(targetDeviceId, 'offer', {
        sdp: offer,
        timestamp: Date.now(),
        deviceType: this.isHost ? 'console' : 'controller'
      });
      
      console.log(`🎯 [WebRTC] Offer sent successfully to ${targetDeviceId.slice(-8)}`);
    } catch (error) {
      console.error(`💥 [WebRTC] Error creating/sending offer for ${targetDeviceId.slice(-8)}:`, error);
      
      // Clean up failed connection
      connection.connectionState = 'failed';
      dataChannel.close();
      peerConnection.close();
      this.connections.delete(targetDeviceId);
      
      throw error;
    }
  }

  // Handle incoming signaling messages
  async handleSignal(signal: any): Promise<void> {
    const { sender_device_id, type, payload } = signal;
    
    console.log(`📡 [WebRTC] Handling ${type} signal from ${sender_device_id.slice(-8)}`);

    let connection = this.connections.get(sender_device_id);
    
    try {
      if (type === 'offer') {
        // Create new connection for incoming offer if none exists
        if (!connection) {
          console.log(`🆕 [WebRTC] Creating new connection for incoming offer from ${sender_device_id.slice(-8)}`);
          const peerConnection = this.createPeerConnection(sender_device_id, false);
          connection = {
            peerConnection,
            deviceId: sender_device_id,
            isInitiator: false,
            connectionState: 'connecting',
            lastConnectionAttempt: Date.now()
          };
          this.connections.set(sender_device_id, connection);
        }

        // Set remote description and create answer
        await connection.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        console.log(`✅ [WebRTC] Remote description set for ${sender_device_id.slice(-8)}`);
        
        // Process any pending ICE candidates
        const pendingCandidates = this.pendingCandidates.get(sender_device_id) || [];
        for (const candidate of pendingCandidates) {
          await connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingCandidates.delete(sender_device_id);
        
        const answer = await connection.peerConnection.createAnswer();
        await connection.peerConnection.setLocalDescription(answer);
        console.log(`✅ [WebRTC] Answer created for ${sender_device_id.slice(-8)}`);
        
        await this.sendSignal(sender_device_id, 'answer', {
          sdp: answer,
          timestamp: Date.now(),
          deviceType: this.isHost ? 'console' : 'controller'
        });
        
      } else if (type === 'answer' && connection) {
        // Handle answer
        await connection.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        console.log(`✅ [WebRTC] Remote description set from answer for ${sender_device_id.slice(-8)}`);
        
        // Process any pending ICE candidates
        const pendingCandidates = this.pendingCandidates.get(sender_device_id) || [];
        for (const candidate of pendingCandidates) {
          await connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingCandidates.delete(sender_device_id);
        
      } else if (type === 'candidate') {
        // Handle ICE candidate
        if (payload.candidate) {
          const candidate = new RTCIceCandidate(payload.candidate);
          
          if (connection && connection.peerConnection.remoteDescription) {
            await connection.peerConnection.addIceCandidate(candidate);
          } else {
            // Store candidate for later if remote description isn't set yet
            if (!this.pendingCandidates.has(sender_device_id)) {
              this.pendingCandidates.set(sender_device_id, []);
            }
            this.pendingCandidates.get(sender_device_id)!.push(payload.candidate);
          }
        }
      }
      
    } catch (error) {
      console.error(`💥 [WebRTC] Error handling ${type} signal from ${sender_device_id.slice(-8)}:`, error);
      
      // Mark connection as failed
      if (connection) {
        connection.connectionState = 'failed';
      }
      
      throw error;
    }
  }

  // Send message via WebRTC data channel
  sendMessage(targetDeviceId: string, message: Omit<WebRTCMessage, 'timestamp' | 'senderId'>): boolean {
    const connection = this.connections.get(targetDeviceId);
    
    if (!connection?.dataChannel) {
      return false;
    }
    
    if (connection.dataChannel.readyState !== 'open') {
      return false;
    }

    const fullMessage: WebRTCMessage = {
      ...message,
      timestamp: Date.now(),
      senderId: this.deviceId
    };

    try {
      connection.dataChannel.send(JSON.stringify(fullMessage));
      console.log(`📤 [WebRTC] Sent ${fullMessage.type} message to ${targetDeviceId.slice(-8)}`);
      return true;
    } catch (error) {
      console.error(`❌ [WebRTC] Error sending message to ${targetDeviceId.slice(-8)}:`, error);
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

    return { webrtc: webrtcSent.length, fallback: fallbackNeeded };
  }

  // Reconnect to a peer
  private async reconnectToPeer(deviceId: string): Promise<void> {
    console.log(`🔄 [WebRTC] Attempting reconnection to ${deviceId.slice(-8)}`);
    
    // Check if we should attempt reconnection
    if (!this.shouldAttemptConnection(deviceId)) {
      return;
    }
    
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
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reconnect if we were the initiator
    if (oldConnection?.isInitiator) {
      try {
        await this.connectToPeer(deviceId);
      } catch (error) {
        console.error(`❌ [WebRTC] Failed to reconnect to ${deviceId.slice(-8)}:`, error);
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

  // Get list of connected device IDs
  getConnectedDevices(): string[] {
    return Array.from(this.connections.keys()).filter(deviceId => {
      const connection = this.connections.get(deviceId);
      return connection?.peerConnection.connectionState === 'connected' && 
             connection?.dataChannel?.readyState === 'open';
    });
  }

  // Cleanup all connections
  cleanup(): void {
    console.log('🧹 [WebRTC] Cleaning up all connections');
    
    for (const [deviceId, connection] of this.connections) {
      connection.dataChannel?.close();
      connection.peerConnection.close();
    }
    
    this.connections.clear();
    this.pendingCandidates.clear();
    this.connectionAttempts.clear();
  }
}