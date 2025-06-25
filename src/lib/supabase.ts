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

// Enhanced TypeScript interfaces matching your new database schema
export interface Session {
  id: string;
  code: string;
  is_active: boolean;
  is_locked: boolean;
  selected_editor: string | null;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  session_id: string;
  name: string;
  device_type: 'phone' | 'console'; // New column from your schema
  is_host: boolean; // Renamed from is_leader in your schema
  joined_at: number; // FIXED: Changed to number for Unix timestamp
  last_seen: number; // FIXED: Changed to number for Unix timestamp
  connected_at?: string; // Legacy column for backward compatibility
}

export interface WebRTCSignal {
  id: string;
  session_id: string;
  sender_device_id: string;
  receiver_device_id: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
  processed: boolean; // New column from your schema
  created_at: string;
}

// Enhanced helper functions for your new schema
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

      console.log('✅ Session created with enhanced schema:', data);
      return data;
    } catch (error) {
      console.error('❌ Exception creating session:', error);
      return null;
    }
  },

  // Get session by code with enhanced error handling
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
  // Create device with enhanced schema fields - FIXED: Use Unix timestamps
  async createDevice(
    sessionId: string, 
    name: string, 
    deviceType: 'phone' | 'console' = 'phone',
    isHost: boolean = false
  ): Promise<Device | null> {
    try {
      const now = Date.now(); // FIXED: Use Unix timestamp instead of ISO string
      
      const { data, error } = await supabase
        .from('devices')
        .insert({
          session_id: sessionId,
          name,
          device_type: deviceType, // Using your new column
          is_host: isHost, // Using your renamed column
          joined_at: now, // FIXED: Using Unix timestamp
          last_seen: now // FIXED: Using Unix timestamp
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating device:', error);
        return null;
      }

      console.log(`✅ Device created with enhanced schema: ${name} (${deviceType})`);
      return data;
    } catch (error) {
      console.error('❌ Exception creating device:', error);
      return null;
    }
  },

  // Update device activity using your new last_seen column - FIXED: Use Unix timestamp
  async updateDeviceActivity(deviceId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('devices')
        .update({ last_seen: Date.now() }) // FIXED: Use Unix timestamp instead of ISO string
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

  // Get devices for session with enhanced data
  async getSessionDevices(sessionId: string): Promise<Device[]> {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true }); // Using your new column

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
        .select('is_host') // Using your renamed column
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
  // Send WebRTC signal with enhanced error handling and retry logic
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
            processed: false // Using your new column
          });

        if (error) {
          console.error(`❌ Error sending signal (attempt ${attempt}):`, error);
          if (attempt === retries) return false;
          
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        console.log(`📤 Signal sent successfully: ${type} from ${senderDeviceId.slice(-8)} to ${receiverDeviceId.slice(-8)}`);
        return true;
      } catch (error) {
        console.error(`❌ Exception sending signal (attempt ${attempt}):`, error);
        if (attempt === retries) return false;
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return false;
  },

  // Mark signal as processed (using your new column)
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

  // Subscribe to WebRTC signals with enhanced filtering
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
            
            // Automatically mark as processed if using the processed column feature
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
          console.error('❌ WebRTC signaling channel error - check database permissions');
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ WebRTC signaling subscription timed out');
        } else if (status === 'CLOSED') {
          console.log('🔒 WebRTC signaling channel closed');
        }
      });

    return channel;
  }
};

// Enhanced real-time subscription helpers
export const realtimeHelpers = {
  // Subscribe to device changes with deduplication
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
          
          // Simple deduplication
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
        
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Devices subscription error - check RLS policies');
        }
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
        
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Session subscription error - check RLS policies');
        }
      });

    return channel;
  }
};

// Enhanced monitoring and statistics (works with your new schema)
export const monitoringHelpers = {
  // Get session statistics using your enhanced schema
  async getSessionStats(sessionId: string) {
    try {
      const { data, error } = await supabase
        .rpc('get_session_statistics', { p_session_id: sessionId });

      if (error) {
        console.error('❌ Error getting session stats:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Exception getting session stats:', error);
      return null;
    }
  },

  // Get active devices with last seen info - FIXED: Handle Unix timestamps
  async getActiveDevices(sessionId: string, maxInactiveMinutes: number = 5) {
    try {
      const cutoff = Date.now() - maxInactiveMinutes * 60 * 1000; // FIXED: Use Unix timestamp
      
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .gte('last_seen', cutoff) // Using your new last_seen column with Unix timestamp
        .order('last_seen', { ascending: false });

      if (error) {
        console.error('❌ Error getting active devices:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Exception getting active devices:', error);
      return [];
    }
  },

  // Clean up old processed signals
  async cleanupOldSignals(olderThanHours: number = 1) {
    try {
      const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
      
      const { error } = await supabase
        .from('webrtc_signals')
        .delete()
        .eq('processed', true) // Using your new processed column
        .lt('created_at', cutoff);

      if (error) {
        console.error('❌ Error cleaning up old signals:', error);
        return false;
      }

      console.log('🧹 Old processed signals cleaned up');
      return true;
    } catch (error) {
      console.error('❌ Exception cleaning up old signals:', error);
      return false;
    }
  }
};

// Export all helpers for easy access
export default {
  sessionHelpers,
  deviceHelpers,
  webrtcHelpers,
  realtimeHelpers,
  monitoringHelpers
};