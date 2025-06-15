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
    }
  }
}