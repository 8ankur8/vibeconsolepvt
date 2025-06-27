/*
  # Create device_inputs table for input history tracking

  1. New Tables
    - `device_inputs`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to sessions)
      - `device_id` (uuid, foreign key to devices)
      - `input_type` (text, e.g., 'dpad', 'button', 'swipe')
      - `input_action` (text, e.g., 'up', 'down', 'a', 'b')
      - `input_data` (jsonb, additional input details)
      - `timestamp` (timestamptz, when input occurred)
      - `source` (text, 'webrtc' or 'supabase')
      - `created_at` (timestamptz, when record was created)

  2. Security
    - Enable RLS on `device_inputs` table
    - Add policy for anonymous users to insert and read session inputs

  3. Indexes
    - Index on session_id for fast session queries
    - Index on device_id for fast device queries
    - Index on timestamp for chronological ordering
    - Composite index on session_id + timestamp for efficient session input history
*/

-- Create device_inputs table
CREATE TABLE IF NOT EXISTS device_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  input_type text NOT NULL CHECK (input_type IN ('dpad', 'button', 'swipe', 'touch', 'accelerometer')),
  input_action text NOT NULL,
  input_data jsonb DEFAULT '{}',
  timestamp timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('webrtc', 'supabase')) DEFAULT 'supabase',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE device_inputs ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_inputs_session_id ON device_inputs(session_id);
CREATE INDEX IF NOT EXISTS idx_device_inputs_device_id ON device_inputs(device_id);
CREATE INDEX IF NOT EXISTS idx_device_inputs_timestamp ON device_inputs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_inputs_session_timestamp ON device_inputs(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_inputs_device_timestamp ON device_inputs(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_inputs_source ON device_inputs(source);

-- RLS Policies for anonymous access (gaming sessions don't require auth)
CREATE POLICY "Allow anonymous access to device_inputs"
  ON device_inputs
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create a view for easy querying of recent inputs per session
CREATE OR REPLACE VIEW session_recent_inputs AS
SELECT 
  di.*,
  d.name as device_name,
  d.device_type,
  s.code as session_code
FROM device_inputs di
JOIN devices d ON di.device_id = d.id
JOIN sessions s ON di.session_id = s.id
ORDER BY di.timestamp DESC;

-- Create a function to get the last input for each device in a session
CREATE OR REPLACE FUNCTION get_session_last_inputs(session_uuid uuid)
RETURNS TABLE (
  device_id uuid,
  device_name text,
  device_type text,
  last_input_type text,
  last_input_action text,
  last_input_data jsonb,
  last_input_timestamp timestamptz,
  last_input_source text
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (d.id)
    d.id as device_id,
    d.name as device_name,
    d.device_type,
    di.input_type as last_input_type,
    di.input_action as last_input_action,
    di.input_data as last_input_data,
    di.timestamp as last_input_timestamp,
    di.source as last_input_source
  FROM devices d
  LEFT JOIN device_inputs di ON d.id = di.device_id
  WHERE d.session_id = session_uuid
  ORDER BY d.id, di.timestamp DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;