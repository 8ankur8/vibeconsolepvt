import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
          connected_at: string | null
          is_leader: boolean | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          name: string
          connected_at?: string | null
          is_leader?: boolean | null
        }
        Update: {
          id?: string
          session_id?: string | null
          name?: string
          connected_at?: string | null
          is_leader?: boolean | null
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
        }
        Insert: {
          id?: string
          session_id: string
          sender_device_id: string
          receiver_device_id?: string | null
          type: 'offer' | 'answer' | 'candidate'
          payload: any
          created_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          sender_device_id?: string
          receiver_device_id?: string | null
          type?: 'offer' | 'answer' | 'candidate'
          payload?: any
          created_at?: string | null
        }
      }
    }
  }
}

// WebRTC-related types for better type safety
export interface WebRTCSignalPayload {
  // For SDP offers and answers
  sdp?: RTCSessionDescriptionInit;
  // For ICE candidates
  candidate?: RTCIceCandidateInit;
  // Additional metadata
  timestamp?: number;
  deviceType?: 'console' | 'controller';
}

export interface WebRTCGameMessage {
  action: 'navigate' | 'select' | 'input';
  direction?: 'up' | 'down' | 'left' | 'right';
  data?: any;
  timestamp: number;
  playerId: string;
}

// Helper function to send WebRTC signaling messages
export const sendWebRTCSignal = async (
  sessionId: string,
  senderDeviceId: string,
  receiverDeviceId: string | null,
  type: 'offer' | 'answer' | 'candidate',
  payload: WebRTCSignalPayload
) => {
  const { error } = await supabase
    .from('webrtc_signals')
    .insert({
      session_id: sessionId,
      sender_device_id: senderDeviceId,
      receiver_device_id: receiverDeviceId,
      type,
      payload
    });

  if (error) {
    console.error('Error sending WebRTC signal:', error);
    throw error;
  }
};

// Helper function to listen for WebRTC signaling messages
export const subscribeToWebRTCSignals = (
  sessionId: string,
  receiverDeviceId: string | null,
  onSignal: (signal: Database['public']['Tables']['webrtc_signals']['Row']) => void
) => {
  const channel = supabase
    .channel(`webrtc_signals_${sessionId}_${receiverDeviceId || 'broadcast'}`)
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'webrtc_signals',
        filter: receiverDeviceId 
          ? `session_id=eq.${sessionId},receiver_device_id=eq.${receiverDeviceId}`
          : `session_id=eq.${sessionId},receiver_device_id=is.null`
      }, 
      (payload) => {
        onSignal(payload.new as Database['public']['Tables']['webrtc_signals']['Row']);
      }
    )
    .subscribe();

  return channel;
};

// Helper function to cleanup old WebRTC signals
export const cleanupOldWebRTCSignals = async (sessionId: string, olderThanMinutes: number = 60) => {
  const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  
  const { error } = await supabase
    .from('webrtc_signals')
    .delete()
    .eq('session_id', sessionId)
    .lt('created_at', cutoffTime);

  if (error) {
    console.error('Error cleaning up old WebRTC signals:', error);
  }
};