import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Disable auth persistence for gaming sessions
  },
  realtime: {
    params: {
      eventsPerSecond: 20, // Increase event rate for gaming
    },
  },
});

// Enhanced TypeScript interfaces matching your database schema
export interface Session {
  id: string;
  code: string;
  is_active: boolean;
  is_locked: boolean;
  selected_editor: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Device {
  id: string;
  session_id: string;
  name: string;
  device_type: 'phone' | 'console';
  is_host: boolean;
  joined_at: number; // FIXED: Changed to number for BIGINT compatibility
  last_seen: string; // Keep as string for TIMESTAMPTZ
  connected_at?: string; // Legacy column for backward compatibility
}

export interface WebRTCSignal {
  id: string;
  session_id: string;
  sender_device_id: string;
  receiver_device_id: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  processed: boolean;
  created_at: string;
}

// Enhanced helper functions
export const sessionHelpers = {
  // Create a new session with proper defaults
  async createSession(code: string): Promise<Session | null> {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          code,
          is_active: true,
          is_locked: false,
          selected_editor: null
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating session:', error);
        return null;
      }

      console.log('✅ Session created:', data);
      return data;
    } catch (error) {
      console.error('❌ Exception creating session:', error);
      return null;
    }
  },

  // Get session by code
  async getSessionByCode(code: string): Promise<Session | null> {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('ℹ️ Session not found:', code);
          return null;
        }
        console.error('❌ Error fetching session:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Exception fetching session:', error);
      return null;
    }
  },

  // Lock session for game start
  async lockSession(sessionId: string, selectedEditor?: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ 
          is_locked: true,
          selected_editor: selectedEditor || null
        })
        .eq('id', sessionId);

      if (error) {
        console.error('❌ Error locking session:', error);
        return false;
      }

      console.log('🔒 Session locked successfully');
      return true;
    } catch (error) {
      console.error('❌ Exception locking session:', error);
      return false;
    }
  }
};

export const deviceHelpers = {
  // ENHANCED: Create device with proper BIGINT timestamp and explicit connected_at
  async createDevice(
    sessionId: string, 
    name: string, 
    deviceType: 'phone' | 'console' = 'phone',
    isHost: boolean = false
  ): Promise<Device | null> {
    try {
      const now = new Date().toISOString();
      const joinedAtTimestamp = Date.now(); // Use milliseconds timestamp for BIGINT
      
      console.log('📝 Creating device with explicit parameters:', {
        session_id: sessionId,
        name,
        device_type: deviceType,
        is_host: isHost,
        joined_at: joinedAtTimestamp,
        last_seen: now,
        connected_at: now // ENHANCED: Explicitly set connected_at
      });
      
      const { data, error } = await supabase
        .from('devices')
        .insert({
          session_id: sessionId,
          name,
          device_type: deviceType,
          is_host: isHost,
          joined_at: joinedAtTimestamp, // BIGINT timestamp
          last_seen: now, // TIMESTAMPTZ
          connected_at: now // ENHANCED: Explicitly set connected_at for compatibility
        })
        .select()
        .single();

      if (error) {
        // ENHANCED: Detailed error logging with full error object
        console.error('❌ DETAILED ERROR creating device:', {
          error: error,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          insertData: {
            session_id: sessionId,
            name,
            device_type: deviceType,
            is_host: isHost,
            joined_at: joinedAtTimestamp,
            last_seen: now,
            connected_at: now
          }
        });
        return null;
      }

      console.log(`✅ Device created successfully: ${name} (${deviceType})`, data);
      return data;
    } catch (error) {
      // ENHANCED: Catch and log any exceptions with full details
      console.error('❌ EXCEPTION creating device:', {
        error: error,
        message: error.message,
        stack: error.stack,
        sessionId,
        name,
        deviceType,
        isHost
      });
      return null;
    }
  },

  // Update device activity
  async updateDeviceActivity(deviceId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('devices')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', deviceId);

      if (error) {
        console.error('❌ Error updating device activity:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Exception updating device activity:', error);
      return false;
    }
  },

  // Get devices for session
  async getSessionDevices(sessionId: string): Promise<Device[]> {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching devices:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Exception fetching devices:', error);
      return [];
    }
  },

  // Check if device is host
  async isDeviceHost(deviceId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('is_host')
        .eq('id', deviceId)
        .single();

      if (error) {
        console.error('❌ Error checking host status:', error);
        return false;
      }

      return data?.is_host || false;
    } catch (error) {
      console.error('❌ Exception checking host status:', error);
      return false;
    }
  }
};

export const webrtcHelpers = {
  // Send WebRTC signal
  async sendSignal(
    sessionId: string,
    senderDeviceId: string,
    receiverDeviceId: string,
    type: 'offer' | 'answer' | 'candidate',
    payload: any,
    retries: number = 3
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { error } = await supabase
          .from('webrtc_signals')
          .insert({
            session_id: sessionId,
            sender_device_id: senderDeviceId,
            receiver_device_id: receiverDeviceId,
            type,
            payload,
            processed: false
          });

        if (error) {
          console.error(`❌ Error sending signal (attempt ${attempt}):`, error);
          if (attempt === retries) return false;
          
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        console.log(`📤 Signal sent: ${type} from ${senderDeviceId.slice(-8)} to ${receiverDeviceId.slice(-8)}`);
        return true;
      } catch (error) {
        console.error(`❌ Exception sending signal (attempt ${attempt}):`, error);
        if (attempt === retries) return false;
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  },

  // Mark signal as processed
  async markSignalProcessed(signalId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('webrtc_signals')
        .update({ processed: true })
        .eq('id', signalId);

      if (error) {
        console.error('❌ Error marking signal as processed:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Exception marking signal as processed:', error);
      return false;
    }
  },

  // Subscribe to WebRTC signals
  subscribeToWebRTCSignals(
    sessionId: string,
    deviceId: string,
    onSignal: (signal: WebRTCSignal) => void,
    includeProcessed: boolean = false
  ) {
    console.log(`📡 Setting up WebRTC signals subscription for device ${deviceId.slice(-8)}`);
    
    const channelName = `webrtc_signals_${sessionId}_${deviceId}`;
    
    const channel = supabase
      .channel(channelName, {
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
          filter: `receiver_device_id=eq.${deviceId}${includeProcessed ? '' : ',processed=eq.false'}`
        }, 
        async (payload) => {
          console.log('📡 Received WebRTC signal:', payload);
          
          try {
            const signal = payload.new as WebRTCSignal;
            onSignal(signal);
            
            if (!includeProcessed && signal.id) {
              await webrtcHelpers.markSignalProcessed(signal.id);
            }
          } catch (error) {
            console.error('❌ Error handling WebRTC signal:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 WebRTC signaling subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ WebRTC signaling channel ready');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ WebRTC signaling channel error');
        }
      });

    return channel;
  }
};

// Real-time subscription helpers
export const realtimeHelpers = {
  // Subscribe to device changes
  subscribeToDevices(
    sessionId: string,
    onDeviceChange: (payload: any) => void,
    enableDeduplication: boolean = true
  ) {
    const channelName = `devices_${sessionId}`;
    let lastPayload: any = null;
    
    console.log(`📱 Setting up devices subscription for session ${sessionId.slice(-8)}`);
    
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'devices',
          filter: `session_id=eq.${sessionId}`
        }, 
        (payload) => {
          console.log('📱 Device change detected:', payload);
          
          if (enableDeduplication && JSON.stringify(payload) === JSON.stringify(lastPayload)) {
            console.log('🔄 Duplicate device change ignored');
            return;
          }
          
          lastPayload = payload;
          onDeviceChange(payload);
        }
      )
      .subscribe((status) => {
        console.log(`📱 Devices subscription status: ${status}`);
      });

    return channel;
  },

  // Subscribe to session changes
  subscribeToSession(
    sessionId: string,
    onSessionChange: (payload: any) => void
  ) {
    const channelName = `session_${sessionId}`;
    
    console.log(`🏠 Setting up session subscription for ${sessionId.slice(-8)}`);
    
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'sessions',
          filter: `id=eq.${sessionId}`
        }, 
        (payload) => {
          console.log('🏠 Session change detected:', payload);
          onSessionChange(payload);
        }
      )
      .subscribe((status) => {
        console.log(`🏠 Session subscription status: ${status}`);
      });

    return channel;
  }
};

// Export all helpers
export default {
  sessionHelpers,
  deviceHelpers,
  webrtcHelpers,
  realtimeHelpers
};