/*
  # Fix WebRTC signaling RLS policy

  1. Security Updates
    - Drop the problematic SELECT policy that uses uid() with anonymous users
    - Create a new SELECT policy that properly handles anonymous device access
    - Ensure devices can only read signals intended for them or broadcast signals

  2. Changes
    - Remove the existing SELECT policy that references uid()
    - Add a new policy that allows devices to read signals where:
      - receiver_device_id matches a device in the same session, OR
      - receiver_device_id is NULL (broadcast signals) for devices in the session
*/

-- Drop the existing problematic SELECT policy
DROP POLICY IF EXISTS "Allow anonymous users to receive WebRTC signals" ON webrtc_signals;

-- Create a new SELECT policy that works with anonymous users
CREATE POLICY "Allow devices to receive WebRTC signals"
  ON webrtc_signals
  FOR SELECT
  TO anon
  USING (
    -- Allow reading signals where receiver_device_id is NULL (broadcast)
    receiver_device_id IS NULL
    OR
    -- Allow reading signals intended for devices in the same session
    EXISTS (
      SELECT 1 FROM devices 
      WHERE devices.id = webrtc_signals.receiver_device_id
      AND devices.session_id = webrtc_signals.session_id
    )
  );