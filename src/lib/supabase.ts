import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  auth: {
    persistSession: false // For anonymous usage
  }
})

export type Database = {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          code: string
          created_at: string | null
          is_active: boolean | null
          is_locked: boolean | null
          selected_editor: string | null
        }
        Insert: {
          id?: string
          code: string
          created_at?: string | null
          is_active?: boolean | null
          is_locked?: boolean | null
          selected_editor?: string | null
        }
        Update: {
          id?: string
          code?: string
          created_at?: string | null
          is_active?: boolean | null
          is_locked?: boolean | null
          selected_editor?: string | null
        }
      }
      devices: {
        Row: {
          id: string
          session_id: string | null
          name: string
          device_type: 'console' | 'phone'
          is_host: boolean | null
          connected_at: string | null
          joined_at: number | null
          last_seen: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          name: string
          device_type?: 'console' | 'phone'
          is_host?: boolean | null
          connected_at?: string | null
          joined_at?: number | null
          last_seen?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          name?: string
          device_type?: 'console' | 'phone'
          is_host?: boolean | null
          connected_at?: string | null
          joined_at?: number | null
          last_seen?: string | null
        }
      }
      webrtc_signals: {
        Row: {
          id: string
          session_id: string
          sender_device_id: string
          receiver_device_id: string | null
          type: 'offer' | 'answer' | 'candidate'
          payload: any
          created_at: string | null
          processed: boolean | null
        }
        Insert: {
          id?: string
          session_id: string
          sender_device_id: string
          receiver_device_id?: string | null
          type: 'offer' | 'answer' | 'candidate'
          payload: any
          created_at?: string | null
          processed?: boolean | null
        }
        Update: {
          id?: string
          session_id?: string
          sender_device_id?: string
          receiver_device_id?: string | null
          type?: 'offer' | 'answer' | 'candidate'
          payload?: any
          created_at?: string | null
          processed?: boolean | null
        }
      }
    }
    Views: {
      active_sessions_view: {
        Row: {
          id: string
          code: string
          created_at: string | null
          is_active: boolean | null
          is_locked: boolean | null
          selected_editor: string | null
          device_count: number
          phone_count: number
          console_count: number
          last_activity: string | null
        }
      }
    }
    Functions: {
      cleanup_old_data: {
        Args: {}
        Returns: void
      }
      get_session_stats: {
        Args: { session_uuid: string }
        Returns: {
          total_devices: number
          active_devices: number
          console_devices: number
          phone_devices: number
          host_devices: number
          pending_signals: number
          processed_signals: number
        }[]
      }
      update_session_activity: {
        Args: {}
        Returns: void
      }
    }
  }
}

// Enhanced WebRTC-related types
export interface WebRTCSignalPayload {
  // For SDP offers and answers
  sdp?: RTCSessionDescriptionInit;
  // For ICE candidates
  candidate?: RTCIceCandidateInit;
  // Additional metadata
  timestamp?: number;
  deviceType?: 'console' | 'phone';
  retryCount?: number;
  signalId?: string;
}

export interface WebRTCGameMessage {
  type: 'input' | 'navigation' | 'action' | 'heartbeat' | 'status';
  action?: 'navigate' | 'select' | 'input' | 'touch' | 'dpad' | 'button';
  direction?: 'up' | 'down' | 'left' | 'right';
  data?: any;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  pressed?: boolean;
  sessionId?: string;
}

// Enhanced device interface
export interface Device {
  id: string;
  sessionId: string;
  name: string;
  deviceType: 'console' | 'phone';
  isHost: boolean;
  connectedAt: string;
  joinedAt: number;
  lastSeen: string;
  status: 'connected' | 'disconnected' | 'inactive';
}

// Enhanced session interface
export interface Session {
  id: string;
  code: string;
  createdAt: string;
  isActive: boolean;
  isLocked: boolean;
  selectedEditor?: string;
  deviceCount?: number;
  phoneCount?: number;
  consoleCount?: number;
  lastActivity?: string;
}

// Enhanced WebRTC signal sending with retry logic and better error handling
export const sendWebRTCSignal = async (
  sessionId: string,
  senderDeviceId: string,
  receiverDeviceId: string | null,
  type: 'offer' | 'answer' | 'candidate',
  payload: WebRTCSignalPayload,
  retryCount = 0
): Promise<void> => {
  try {
    const signalId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { error } = await supabase
      .from('webrtc_signals')
      .insert({
        session_id: sessionId,
        sender_device_id: senderDeviceId,
        receiver_device_id: receiverDeviceId,
        type,
        payload: {
          ...payload,
          retryCount,
          timestamp: Date.now(),
          signalId
        },
        processed: false
      });

    if (error) {
      console.error(`❌ Error sending WebRTC signal (${type}):`, error);
      
      // Retry logic for failed signals
      if (retryCount < 3) {
        console.log(`🔄 Retrying WebRTC signal send (attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return sendWebRTCSignal(sessionId, senderDeviceId, receiverDeviceId, type, payload, retryCount + 1);
      }
      
      throw error;
    }

    console.log(`✅ WebRTC signal sent successfully: ${type} from ${senderDeviceId.slice(-8)} to ${receiverDeviceId?.slice(-8) || 'broadcast'}`);
  } catch (error) {
    console.error('❌ Failed to send WebRTC signal after retries:', error);
    throw error;
  }
};

// Enhanced WebRTC signal subscription with better error handling and deduplication
export const subscribeToWebRTCSignals = (
  sessionId: string,
  receiverDeviceId: string | null,
  onSignal: (signal: Database['public']['Tables']['webrtc_signals']['Row']) => void,
  onError?: (error: any) => void
) => {
  const channelName = `webrtc_signals_${sessionId}_${receiverDeviceId?.slice(-8) || 'broadcast'}`;
  const processedSignals = new Set<string>();
  
  console.log(`🔗 Subscribing to WebRTC signals: ${channelName}`);

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'webrtc_signals',
        filter: receiverDeviceId 
          ? `and(session_id.eq.${sessionId},receiver_device_id.eq.${receiverDeviceId})`
          : `and(session_id.eq.${sessionId},receiver_device_id.is.null)`
      }, 
      (payload) => {
        const signal = payload.new as Database['public']['Tables']['webrtc_signals']['Row'];
        const signalId = signal.payload?.signalId || signal.id;
        
        // Prevent duplicate processing
        if (processedSignals.has(signalId)) {
          console.log(`⚠️ Duplicate signal ignored: ${signalId}`);
          return;
        }
        
        processedSignals.add(signalId);
        console.log(`📨 Received WebRTC signal (${signal.type}):`, signal.payload?.signalId);
        
        // Mark signal as processed (fire and forget)
        markSignalAsProcessed(signal.id).catch(console.error);
        
        onSignal(signal);
        
        // Clean up processed signals set to prevent memory leaks
        if (processedSignals.size > 100) {
          const oldestSignals = Array.from(processedSignals).slice(0, 50);
          oldestSignals.forEach(id => processedSignals.delete(id));
        }
      }
    )
    .subscribe((status) => {
      console.log(`📡 WebRTC subscription status for ${channelName}:`, status);
      
      if (status === 'CHANNEL_ERROR' && onError) {
        onError(new Error(`WebRTC subscription failed for ${channelName}`));
      } else if (status === 'SUBSCRIBED') {
        console.log(`✅ WebRTC subscription active for ${channelName}`);
      }
    });

  return channel;
};

// Mark signal as processed to avoid reprocessing
const markSignalAsProcessed = async (signalId: string) => {
  try {
    const { error } = await supabase
      .from('webrtc_signals')
      .update({ processed: true })
      .eq('id', signalId);

    if (error) {
      console.error('Error marking signal as processed:', error);
    }
  } catch (error) {
    console.error('Error in markSignalAsProcessed:', error);
  }
};

// Enhanced session creation with proper device setup
export const createSession = async (code: string, deviceId: string, deviceName: string = 'Console') => {
  try {
    // Create session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        code,
        is_active: true,
        is_locked: false
      })
      .select()
      .single();

    if (sessionError) {
      console.error('❌ Error creating session:', sessionError);
      throw sessionError;
    }

    // Create console device
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .insert({
        id: deviceId,
        session_id: sessionData.id,
        name: deviceName,
        device_type: 'console',
        is_host: true,
        joined_at: Date.now(),
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (deviceError) {
      console.error('❌ Error creating console device:', deviceError);
      throw deviceError;
    }

    console.log('✅ Session and console device created successfully');
    return { session: sessionData, device: deviceData };
  } catch (error) {
    console.error('❌ Failed to create session:', error);
    throw error;
  }
};

// Enhanced session joining with proper validation
export const joinSession = async (code: string, deviceId: string, deviceName: string) => {
  try {
    // Find session by code
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (sessionError) {
      console.error('❌ Error finding session:', sessionError);
      throw new Error('Session not found or inactive');
    }

    // Check if session is locked
    if (sessionData.is_locked) {
      throw new Error('Session is locked - no new players allowed');
    }

    // Check device limit (max 4 phones + 1 console = 5 total)
    const { data: existingDevices, error: devicesError } = await supabase
      .from('devices')
      .select('device_type')
      .eq('session_id', sessionData.id);

    if (devicesError) {
      console.error('❌ Error checking device count:', devicesError);
      throw devicesError;
    }

    const phoneCount = existingDevices.filter(d => d.device_type === 'phone').length;
    if (phoneCount >= 4) {
      throw new Error('Session is full - maximum 4 phone controllers allowed');
    }

    // Determine if this should be the host (first phone device if no console exists)
    const hasConsole = existingDevices.some(d => d.device_type === 'console');
    const isFirstPhone = phoneCount === 0;
    const shouldBeHost = !hasConsole && isFirstPhone;

    // Add device to session
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .insert({
        id: deviceId,
        session_id: sessionData.id,
        name: deviceName,
        device_type: 'phone',
        is_host: shouldBeHost,
        joined_at: Date.now(),
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (deviceError) {
      console.error('❌ Error joining session:', deviceError);
      throw deviceError;
    }

    console.log(`✅ Successfully joined session (host: ${shouldBeHost})`);
    return { session: sessionData, device: deviceData };
  } catch (error) {
    console.error('❌ Failed to join session:', error);
    throw error;
  }
};

// Enhanced device subscription with proper filtering and error handling
export const subscribeToDevices = (
  sessionId: string,
  onDevicesChange: (devices: Database['public']['Tables']['devices']['Row'][]) => void,
  onError?: (error: any) => void
) => {
  const channelName = `devices_${sessionId.slice(-8)}`;
  
  console.log(`🔗 Subscribing to devices: ${channelName}`);

  // Initial load
  const loadDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching devices:', error);
        if (onError) onError(error);
        return;
      }

      console.log(`👥 Devices loaded: ${data?.length || 0} devices`);
      onDevicesChange(data || []);
    } catch (error) {
      console.error('❌ Error in loadDevices:', error);
      if (onError) onError(error);
    }
  };

  // Load initial data
  loadDevices();

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'devices',
        filter: `session_id=eq.${sessionId}`
      },
      () => {
        console.log('📱 Device change detected, reloading...');
        loadDevices();
      }
    )
    .subscribe((status) => {
      console.log(`📡 Devices subscription status for ${channelName}:`, status);
      
      if (status === 'CHANNEL_ERROR' && onError) {
        onError(new Error(`Devices subscription failed for ${channelName}`));
      } else if (status === 'SUBSCRIBED') {
        console.log(`✅ Devices subscription active for ${channelName}`);
      }
    });

  return channel;
};

// Enhanced session subscription with better error handling
export const subscribeToSession = (
  sessionId: string,
  onSessionChange: (session: Database['public']['Tables']['sessions']['Row']) => void,
  onError?: (error: any) => void
) => {
  const channelName = `session_${sessionId.slice(-8)}`;
  
  console.log(`🔗 Subscribing to session: ${channelName}`);

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
        console.log('📋 Session updated:', payload.new);
        onSessionChange(payload.new as Database['public']['Tables']['sessions']['Row']);
      }
    )
    .subscribe((status) => {
      console.log(`📡 Session subscription status for ${channelName}:`, status);
      
      if (status === 'CHANNEL_ERROR' && onError) {
        onError(new Error(`Session subscription failed for ${channelName}`));
      } else if (status === 'SUBSCRIBED') {
        console.log(`✅ Session subscription active for ${channelName}`);
      }
    });

  return channel;
};

// Update device last seen timestamp with error handling
export const updateDeviceLastSeen = async (deviceId: string) => {
  try {
    const { error } = await supabase
      .from('devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', deviceId);

    if (error) {
      console.error('Error updating device last seen:', error);
    }
  } catch (error) {
    console.error('Error in updateDeviceLastSeen:', error);
  }
};

// Enhanced cleanup function with better error handling
export const cleanupOldWebRTCSignals = async (sessionId: string, olderThanMinutes: number = 60) => {
  try {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
    
    const { error } = await supabase
      .from('webrtc_signals')
      .delete()
      .or(`and(session_id.eq.${sessionId},created_at.lt.${cutoffTime}),processed.eq.true`);

    if (error) {
      console.error('Error cleaning up old WebRTC signals:', error);
    } else {
      console.log(`🧹 Cleaned up old WebRTC signals for session ${sessionId.slice(-8)}`);
    }
  } catch (error) {
    console.error('Error in cleanupOldWebRTCSignals:', error);
  }
};

// Enhanced session cleanup
export const cleanupSession = async (sessionId: string) => {
  try {
    // Delete all devices
    await supabase.from('devices').delete().eq('session_id', sessionId);
    
    // Delete all WebRTC signals
    await supabase.from('webrtc_signals').delete().eq('session_id', sessionId);
    
    // Mark session as inactive
    await supabase.from('sessions').update({ is_active: false }).eq('id', sessionId);
    
    console.log(`✅ Session ${sessionId.slice(-8)} cleaned up successfully`);
  } catch (error) {
    console.error('❌ Error cleaning up session:', error);
  }
};

// Get session statistics
export const getSessionStats = async (sessionId: string) => {
  try {
    const { data, error } = await supabase
      .rpc('get_session_stats', { session_uuid: sessionId });

    if (error) {
      console.error('Error getting session stats:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('Error in getSessionStats:', error);
    return null;
  }
};

// Trigger cleanup of old data
export const triggerCleanup = async () => {
  try {
    const { error } = await supabase.rpc('cleanup_old_data');
    
    if (error) {
      console.error('Error triggering cleanup:', error);
    } else {
      console.log('✅ Cleanup triggered successfully');
    }
  } catch (error) {
    console.error('Error in triggerCleanup:', error);
  }
};

// Update session activity status
export const updateSessionActivity = async () => {
  try {
    const { error } = await supabase.rpc('update_session_activity');
    
    if (error) {
      console.error('Error updating session activity:', error);
    } else {
      console.log('✅ Session activity updated');
    }
  } catch (error) {
    console.error('Error in updateSessionActivity:', error);
  }
};