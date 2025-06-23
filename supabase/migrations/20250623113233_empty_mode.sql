/*
  # Enhanced Database Schema Migration

  1. Schema Updates
    - Add missing columns to devices table (device_type, is_host, joined_at, last_seen)
    - Rename is_leader to is_host for consistency
    - Add processed column to webrtc_signals table
    - Add proper constraints and indexes

  2. Performance Improvements
    - Create optimized indexes for common queries
    - Add foreign key constraints for data integrity
    - Ensure unique session codes for active sessions

  3. Data Cleanup
    - Create automated cleanup functions
    - Add triggers for automatic timestamp updates
    - Implement RLS policies for anonymous access

  4. Security
    - Enable RLS on all tables
    - Create policies for anonymous access
    - Add data integrity constraints
*/

-- Add missing columns to devices table
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS device_type TEXT CHECK (device_type IN ('console', 'phone')) DEFAULT 'phone',
ADD COLUMN IF NOT EXISTS is_host BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS joined_at BIGINT,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Rename is_leader to is_host for consistency (if is_leader exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_leader') THEN
        ALTER TABLE devices RENAME COLUMN is_leader TO is_host;
    END IF;
END $$;

-- Add processed column to webrtc_signals table
ALTER TABLE webrtc_signals 
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_devices_session_id ON devices(session_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_is_host ON devices(is_host);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_session_receiver ON webrtc_signals(session_id, receiver_device_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_processed ON webrtc_signals(processed);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_created_at ON webrtc_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_code_active ON sessions(code, is_active);

-- Enable Row Level Security (RLS) if not already enabled
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Allow anonymous access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anonymous access to devices" ON devices;
DROP POLICY IF EXISTS "Allow anonymous access to webrtc_signals" ON webrtc_signals;
DROP POLICY IF EXISTS "Allow anonymous users to create sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anonymous users to read sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anonymous users to update session controls" ON sessions;
DROP POLICY IF EXISTS "Allow anonymous users to create devices" ON devices;
DROP POLICY IF EXISTS "Allow anonymous users to delete their own devices" ON devices;
DROP POLICY IF EXISTS "Allow anonymous users to read devices" ON devices;
DROP POLICY IF EXISTS "Allow anonymous users to update device status" ON devices;
DROP POLICY IF EXISTS "Allow anonymous users to update their own devices" ON devices;
DROP POLICY IF EXISTS "Allow anonymous users to send WebRTC signals" ON webrtc_signals;
DROP POLICY IF EXISTS "Allow devices to receive WebRTC signals" ON webrtc_signals;
DROP POLICY IF EXISTS "Allow anonymous users to cleanup old WebRTC signals" ON webrtc_signals;

-- Create comprehensive RLS policies for anonymous access
CREATE POLICY "Allow anonymous access to sessions" ON sessions
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to devices" ON devices
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to webrtc_signals" ON webrtc_signals
FOR ALL TO anon USING (true) WITH CHECK (true);

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    -- Add devices session_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'devices_session_id_fkey' 
        AND table_name = 'devices'
    ) THEN
        ALTER TABLE devices 
        ADD CONSTRAINT devices_session_id_fkey 
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
    END IF;

    -- Add webrtc_signals session_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'webrtc_signals_session_id_fkey' 
        AND table_name = 'webrtc_signals'
    ) THEN
        ALTER TABLE webrtc_signals 
        ADD CONSTRAINT webrtc_signals_session_id_fkey 
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
    END IF;

    -- Add webrtc_signals sender_device_id foreign key (if not exists)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'webrtc_signals_sender_device_id_fkey' 
        AND table_name = 'webrtc_signals'
    ) THEN
        ALTER TABLE webrtc_signals 
        ADD CONSTRAINT webrtc_signals_sender_device_id_fkey 
        FOREIGN KEY (sender_device_id) REFERENCES devices(id) ON DELETE CASCADE;
    END IF;

    -- Add webrtc_signals receiver_device_id foreign key (if not exists)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'webrtc_signals_receiver_device_id_fkey' 
        AND table_name = 'webrtc_signals'
    ) THEN
        ALTER TABLE webrtc_signals 
        ADD CONSTRAINT webrtc_signals_receiver_device_id_fkey 
        FOREIGN KEY (receiver_device_id) REFERENCES devices(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Ensure unique session codes for active sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code_unique ON sessions(code) WHERE is_active = true;

-- Create function to cleanup old data automatically
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete processed signals older than 1 hour
    DELETE FROM webrtc_signals 
    WHERE processed = true 
    AND created_at < NOW() - INTERVAL '1 hour';
    
    -- Delete unprocessed signals older than 6 hours (likely stale)
    DELETE FROM webrtc_signals 
    WHERE processed = false 
    AND created_at < NOW() - INTERVAL '6 hours';
    
    -- Delete inactive sessions older than 24 hours
    DELETE FROM sessions 
    WHERE is_active = false 
    AND created_at < NOW() - INTERVAL '24 hours';
    
    -- Delete devices from inactive sessions
    DELETE FROM devices 
    WHERE session_id NOT IN (SELECT id FROM sessions WHERE is_active = true);
    
    -- Delete devices that haven't been seen in 2 hours
    DELETE FROM devices 
    WHERE last_seen < NOW() - INTERVAL '2 hours'
    AND device_type = 'phone'; -- Keep console devices longer
    
    RAISE NOTICE 'Old data cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last_seen automatically on device updates
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_device_last_seen ON devices;

-- Create the trigger
CREATE TRIGGER trigger_update_device_last_seen
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_device_last_seen();

-- Create function to automatically mark WebRTC signals as processed
CREATE OR REPLACE FUNCTION mark_signal_processed()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-mark signals as processed after 5 minutes
    UPDATE webrtc_signals 
    SET processed = true 
    WHERE created_at < NOW() - INTERVAL '5 minutes' 
    AND processed = false;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create function to update session activity
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS void AS $$
BEGIN
    -- Mark sessions as inactive if no devices have been active for 30 minutes
    UPDATE sessions 
    SET is_active = false 
    WHERE id IN (
        SELECT s.id 
        FROM sessions s
        LEFT JOIN devices d ON s.id = d.session_id
        WHERE s.is_active = true
        GROUP BY s.id
        HAVING MAX(d.last_seen) < NOW() - INTERVAL '30 minutes'
        OR COUNT(d.id) = 0
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to get session statistics
CREATE OR REPLACE FUNCTION get_session_stats(session_uuid UUID)
RETURNS TABLE(
    total_devices INTEGER,
    active_devices INTEGER,
    console_devices INTEGER,
    phone_devices INTEGER,
    host_devices INTEGER,
    pending_signals INTEGER,
    processed_signals INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(d.*)::INTEGER as total_devices,
        COUNT(CASE WHEN d.last_seen > NOW() - INTERVAL '5 minutes' THEN 1 END)::INTEGER as active_devices,
        COUNT(CASE WHEN d.device_type = 'console' THEN 1 END)::INTEGER as console_devices,
        COUNT(CASE WHEN d.device_type = 'phone' THEN 1 END)::INTEGER as phone_devices,
        COUNT(CASE WHEN d.is_host = true THEN 1 END)::INTEGER as host_devices,
        (SELECT COUNT(*) FROM webrtc_signals WHERE session_id = session_uuid AND processed = false)::INTEGER as pending_signals,
        (SELECT COUNT(*) FROM webrtc_signals WHERE session_id = session_uuid AND processed = true)::INTEGER as processed_signals
    FROM devices d
    WHERE d.session_id = session_uuid;
END;
$$ LANGUAGE plpgsql;

-- Create view for active sessions with device counts
CREATE OR REPLACE VIEW active_sessions_view AS
SELECT 
    s.*,
    COUNT(d.id) as device_count,
    COUNT(CASE WHEN d.device_type = 'phone' THEN 1 END) as phone_count,
    COUNT(CASE WHEN d.device_type = 'console' THEN 1 END) as console_count,
    MAX(d.last_seen) as last_activity
FROM sessions s
LEFT JOIN devices d ON s.id = d.session_id
WHERE s.is_active = true
GROUP BY s.id, s.code, s.created_at, s.is_active, s.is_locked, s.selected_editor;

-- Update existing data to set default values
UPDATE devices 
SET 
    device_type = CASE 
        WHEN name = 'Console' THEN 'console'::text 
        ELSE 'phone'::text 
    END,
    joined_at = EXTRACT(EPOCH FROM connected_at)::BIGINT * 1000,
    last_seen = COALESCE(connected_at, NOW())
WHERE device_type IS NULL OR joined_at IS NULL;

-- Update existing devices to set proper host status
UPDATE devices 
SET is_host = true 
WHERE device_type = 'console' AND is_host IS NOT true;

-- Ensure first phone device in each session is marked as host if no console exists
WITH first_phone_per_session AS (
    SELECT DISTINCT ON (session_id) 
        id, session_id
    FROM devices 
    WHERE device_type = 'phone'
    AND session_id NOT IN (
        SELECT session_id FROM devices WHERE device_type = 'console'
    )
    ORDER BY session_id, connected_at ASC
)
UPDATE devices 
SET is_host = true 
WHERE id IN (SELECT id FROM first_phone_per_session)
AND is_host IS NOT true;

-- Create notification for successful migration
DO $$
BEGIN
    RAISE NOTICE 'Database schema migration completed successfully!';
    RAISE NOTICE 'Enhanced features:';
    RAISE NOTICE '- Added device_type, is_host, joined_at, last_seen columns to devices';
    RAISE NOTICE '- Added processed column to webrtc_signals';
    RAISE NOTICE '- Created performance indexes';
    RAISE NOTICE '- Added data integrity constraints';
    RAISE NOTICE '- Created automated cleanup functions';
    RAISE NOTICE '- Added triggers for automatic updates';
    RAISE NOTICE '- Created session statistics functions';
    RAISE NOTICE '- Updated existing data with proper values';
END $$;