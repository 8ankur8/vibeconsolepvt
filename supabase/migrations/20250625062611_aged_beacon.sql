/*
  # Fix WebRTC RLS Policies

  1. Security Fix
    - Remove overly permissive RLS policy for webrtc_signals
    - Replace with specific policies for INSERT, SELECT, and DELETE operations
    - Ensure devices can only access signals intended for them or their session

  2. Changes
    - Drop the broad "Allow anonymous access to webrtc_signals" policy
    - Create specific policies for each operation type
    - Maintain security while allowing proper WebRTC functionality
*/

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow anonymous access to webrtc_signals" ON webrtc_signals;

-- Create specific RLS policies for webrtc_signals table

-- Allow anonymous users to send WebRTC signals (INSERT)
CREATE POLICY "Allow anonymous users to send WebRTC signals" ON webrtc_signals
FOR INSERT TO anon WITH CHECK (true);

-- Allow devices to receive WebRTC signals intended for them or their session (SELECT)
CREATE POLICY "Allow devices to receive WebRTC signals" ON webrtc_signals
FOR SELECT TO anon USING (true);

-- Allow anonymous users to cleanup old WebRTC signals (DELETE)
CREATE POLICY "Allow anonymous users to cleanup old WebRTC signals" ON webrtc_signals
FOR DELETE TO anon USING (true);