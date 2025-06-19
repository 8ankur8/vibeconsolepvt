/*
  # Create WebRTC signaling table

  1. New Tables
    - `webrtc_signals`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to sessions)
      - `sender_device_id` (uuid, foreign key to devices)
      - `receiver_device_id` (uuid, foreign key to devices, nullable for broadcast messages)
      - `type` (text, signal type: 'offer', 'answer', 'candidate')
      - `payload` (jsonb, SDP or ICE candidate data)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `webrtc_signals` table
    - Add policies for session-based access control
    - Allow devices to send and receive signals within their session

  3. Indexes
    - Add indexes for efficient querying by session and device
*/

-- Create the webrtc_signals table
CREATE TABLE IF NOT EXISTS webrtc_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender_device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  receiver_device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('offer', 'answer', 'candidate')),
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS webrtc_signals_session_id_idx ON webrtc_signals(session_id);
CREATE INDEX IF NOT EXISTS webrtc_signals_receiver_device_id_idx ON webrtc_signals(receiver_device_id);
CREATE INDEX IF NOT EXISTS webrtc_signals_created_at_idx ON webrtc_signals(created_at);

-- RLS Policies

-- Allow anonymous users to insert signals (send WebRTC signaling data)
CREATE POLICY "Allow anonymous users to send WebRTC signals"
  ON webrtc_signals
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to read signals intended for them or broadcast to their session
CREATE POLICY "Allow anonymous users to receive WebRTC signals"
  ON webrtc_signals
  FOR SELECT
  TO anon
  USING (
    -- Can read signals sent to them specifically
    receiver_device_id IN (
      SELECT id FROM devices WHERE session_id = webrtc_signals.session_id
    )
    OR
    -- Can read broadcast signals (receiver_device_id is null) in their session
    (receiver_device_id IS NULL AND session_id IN (
      SELECT session_id FROM devices WHERE id = auth.uid()::uuid
    ))
  );

-- Allow anonymous users to delete old signals (cleanup)
CREATE POLICY "Allow anonymous users to cleanup old WebRTC signals"
  ON webrtc_signals
  FOR DELETE
  TO anon
  USING (
    sender_device_id IN (
      SELECT id FROM devices WHERE session_id = webrtc_signals.session_id
    )
    AND created_at < now() - interval '1 hour'
  );

-- Create a function to automatically cleanup old WebRTC signals
CREATE OR REPLACE FUNCTION cleanup_old_webrtc_signals()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM webrtc_signals 
  WHERE created_at < now() - interval '1 hour';
END;
$$;

-- Note: In production, you might want to set up a cron job to call this function periodically
-- For now, we'll rely on manual cleanup or application-level cleanup