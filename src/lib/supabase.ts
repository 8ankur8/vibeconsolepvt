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
}

export interface Device {
  id: string;
  session_id: string;
  name: string;
  device_type: 'phone' | 'console';
  is_host: boolean;
  joined_at: number; // BIGINT timestamp
  last_seen: string; // TIMESTAMPTZ
  connected_at?: string; // Legacy column for backward compatibility
}

export interface DeviceInput {
  id: string;
  session_id: string;
  device_id: string;
  input_type: 'dpad' | 'button' | 'swipe' | 'touch' | 'accelerometer';
  input_action: string;
  input_data: any; // JSONB
  timestamp: string; // TIMESTAMPTZ
  source: 'webrtc' | 'supabase';
  created_at: string;
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

      console.log('✅ Session created:', data.id.slice(-8));
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
  // Create device with proper BIGINT timestamp and explicit connected_at
  async createDevice(
    sessionId: string, 
    name: string, 
    deviceType: 'phone' | 'console' = 'phone',
    isHost: boolean = false
  ): Promise<Device | null> {
    try {
      const now = new Date().toISOString();
      const joinedAtTimestamp = Date.now(); // Use milliseconds timestamp for BIGINT
      
      const { data, error } = await supabase
        .from('devices')
        .insert({
          session_id: sessionId,
          name,
          device_type: deviceType,
          is_host: isHost,
          joined_at: joinedAtTimestamp, // BIGINT timestamp
          last_seen: now, // TIMESTAMPTZ
          connected_at: now // Explicitly set connected_at for compatibility
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating device:', error);
        return null;
      }

      console.log(`✅ Device created: ${name} (${deviceType})`);
      return data;
    } catch (error) {
      console.error('❌ Exception creating device:', error);
      return null;
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
  }
};

// Device Input Helpers
export const deviceInputHelpers = {
  // Create a new device input record
  async createDeviceInput(
    sessionId: string,
    deviceId: string,
    inputType: 'dpad' | 'button' | 'swipe' | 'touch' | 'accelerometer',
    inputAction: string,
    inputData: any = {},
    source: 'webrtc' | 'supabase' = 'supabase',
    timestamp?: string
  ): Promise<DeviceInput | null> {
    try {
      const inputTimestamp = timestamp || new Date().toISOString();
      
      const { data, error } = await supabase
        .from('device_inputs')
        .insert({
          session_id: sessionId,
          device_id: deviceId,
          input_type: inputType,
          input_action: inputAction,
          input_data: inputData,
          source,
          timestamp: inputTimestamp
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating device input:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Exception creating device input:', error);
      return null;
    }
  },

  // Subscribe to device inputs for real-time updates
  subscribeToDeviceInputs(
    sessionId: string,
    onNewInput: (input: DeviceInput) => void,
    deviceId?: string
  ) {
    console.log(`📡 Setting up device inputs subscription for session ${sessionId.slice(-8)}`);
    
    let filter = `session_id=eq.${sessionId}`;
    if (deviceId) {
      filter += `,device_id=eq.${deviceId}`;
    }
    
    const channelName = `device_inputs_${sessionId}${deviceId ? `_${deviceId}` : ''}`;
    
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'device_inputs',
          filter
        }, 
        (payload) => {
          console.log('📱 New device input received:', payload.new.input_type, payload.new.input_action);
          const input = payload.new as DeviceInput;
          onNewInput(input);
        }
      )
      .subscribe((status) => {
        console.log(`📱 Device inputs subscription status: ${status}`);
      });

    return channel;
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

  // Subscribe to WebRTC signals with refined filter
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
          filter: `receiver_device_id=eq.${deviceId}`
        }, 
        async (payload) => {
          console.log('📡 Received WebRTC signal:', payload.new.type);
          
          try {
            const signal = payload.new as WebRTCSignal;
            onSignal(signal);
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
    onDeviceChange: (payload: any) => void
  ) {
    const channelName = `devices_${sessionId}`;
    
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
          console.log('📱 Device change detected:', payload.eventType);
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
          console.log('🏠 Session change detected');
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
  deviceInputHelpers,
  webrtcHelpers,
  realtimeHelpers
};