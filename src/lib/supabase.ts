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
          device_type: 'console' | 'phone'
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
}

export interface WebRTCGameMessage {
  type: 'input' | 'navigation' | 'action';
  action?: 'navigate' | 'select' | 'input' | 'touch' | 'dpad';
  direction?: 'up' | 'down' | 'left' | 'right';
  data?: any;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  pressed?: boolean;
}

// Enhanced WebRTC signal sending with retry logic
export const sendWebRTCSignal = async (
  sessionId: string,
  senderDeviceId: string,
  receiverDeviceId: string | null,
  type: 'offer' | 'answer' | 'candidate',
  payload: WebRTCSignalPayload,
  retryCount = 0
): Promise<void> => {
  try {
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
          timestamp: Date.now()
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

    console.log(`✅ WebRTC signal sent successfully: ${type} from ${senderDeviceId} to ${receiverDeviceId || 'broadcast'}`);
  } catch (error) {
    console.error('❌ Failed to send WebRTC signal after retries:', error);
    throw error;
  }
};

// Enhanced WebRTC signal subscription with better error handling
export const subscribeToWebRTCSignals = (
  sessionId: string,
  receiverDeviceId: string | null,
  onSignal: (signal: Database['public']['Tables']['webrtc_signals']['Row']) => void,
  onError?: (error: any) => void
) => {
  const channelName = `webrtc_signals_${sessionId}_${receiverDeviceId || 'broadcast'}`;
  
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
        console.log(`📨 Received WebRTC signal:`, payload.new);
        const signal = payload.new as Database['public']['Tables']['webrtc_signals']['Row'];
        
        // Mark signal as processed
        markSignalAsProcessed(signal.id).catch(console.error);
        
        onSignal(signal);
      }
    )
    .subscribe((status) => {
      console.log(`📡 WebRTC subscription status for ${channelName}:`, status);
      
      if (status === 'CHANNEL_ERROR' && onError) {
        onError(new Error(`WebRTC subscription failed for ${channelName}`));
      }
    });

  return channel;
};

// Mark signal as processed to avoid reprocessing
const markSignalAsProcessed = async (signalId: string) => {
  const { error } = await supabase
    .from('webrtc_signals')
    .update({ processed: true })
    .eq('id', signalId);

  if (error) {
    console.error('Error marking signal as processed:', error);
  }
};

// Enhanced session and device management
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

    // Add device to session
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .insert({
        id: deviceId,
        session_id: sessionData.id,
        name: deviceName,
        device_type: 'phone',
        is_host: false,
        joined_at: Date.now(),
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (deviceError) {
      console.error('❌ Error joining session:', deviceError);
      throw deviceError;
    }

    console.log('✅ Successfully joined session');
    return { session: sessionData, device: deviceData };
  } catch (error) {
    console.error('❌ Failed to join session:', error);
    throw error;
  }
};

// Enhanced device subscription with proper filtering
export const subscribeToDevices = (
  sessionId: string,
  onDevicesChange: (devices: Database['public']['Tables']['devices']['Row'][]) => void,
  onError?: (error: any) => void
) => {
  const channelName = `devices_${sessionId}`;
  
  console.log(`🔗 Subscribing to devices: ${channelName}`);

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'devices',
        filter: `session_id=eq.${sessionId}`
      },
      async () => {
        // Fetch all devices for this session
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

        console.log('👥 Devices updated:', data);
        onDevicesChange(data || []);
      }
    )
    .subscribe((status) => {
      console.log(`📡 Devices subscription status for ${channelName}:`, status);
      
      if (status === 'CHANNEL_ERROR' && onError) {
        onError(new Error(`Devices subscription failed for ${channelName}`));
      }
    });

  return channel;
};

// Enhanced session subscription
export const subscribeToSession = (
  sessionId: string,
  onSessionChange: (session: Database['public']['Tables']['sessions']['Row']) => void,
  onError?: (error: any) => void
) => {
  const channelName = `session_${sessionId}`;
  
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
      }
    });

  return channel;
};

// Update device last seen timestamp
export const updateDeviceLastSeen = async (deviceId: string) => {
  const { error } = await supabase
    .from('devices')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', deviceId);

  if (error) {
    console.error('Error updating device last seen:', error);
  }
};

// Enhanced cleanup function
export const cleanupOldWebRTCSignals = async (sessionId: string, olderThanMinutes: number = 60) => {
  const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  
  const { error } = await supabase
    .from('webrtc_signals')
    .delete()
    .or(`and(session_id.eq.${sessionId},created_at.lt.${cutoffTime}),processed.eq.true`);

  if (error) {
    console.error('Error cleaning up old WebRTC signals:', error);
  } else {
    console.log(`🧹 Cleaned up old WebRTC signals for session ${sessionId}`);
  }
};

// Cleanup session and related data
export const cleanupSession = async (sessionId: string) => {
  try {
    // Delete all devices
    await supabase.from('devices').delete().eq('session_id', sessionId);
    
    // Delete all WebRTC signals
    await supabase.from('webrtc_signals').delete().eq('session_id', sessionId);
    
    // Mark session as inactive
    await supabase.from('sessions').update({ is_active: false }).eq('id', sessionId);
    
    console.log(`✅ Session ${sessionId} cleaned up successfully`);
  } catch (error) {
    console.error('❌ Error cleaning up session:', error);
  }
};