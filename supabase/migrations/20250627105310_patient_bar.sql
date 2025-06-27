/*
  # Database Schema Migration - Enhanced Gaming Platform

  1. Device Management
    - Add device_type, is_host, joined_at, last_seen columns to devices table
    - Update existing data with proper values
    - Add performance indexes

  2. WebRTC Enhancements
    - Add processed column to webrtc_signals table
    - Create cleanup functions and triggers

  3. Session Management
    - Create views for active sessions with device statistics
    - Add foreign key constraints for data integrity

  4. Security & Performance
    - Enable RLS with anonymous access policies
    - Create automated cleanup functions
    - Add performance indexes
*/

-- Step 1: Add missing columns to devices table
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS device_type TEXT CHECK (device_type IN ('console', 'phone')) DEFAULT 'phone',
ADD COLUMN IF NOT EXISTS is_host BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS joined_at BIGINT,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Handle is_leader to is_host rename safely
DO $$ 
BEGIN
    -- Check if is_leader exists and is_host doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_leader') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_host') THEN
        ALTER TABLE devices RENAME COLUMN is_leader TO is_host;
    -- If both exist, copy data and drop is_leader
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_leader') 
          AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_host') THEN
        UPDATE devices SET is_host = is_leader WHERE is_leader IS NOT NULL;
        ALTER TABLE devices DROP COLUMN is_leader;
    END IF;
END $$;

-- Step 3: Add processed column to webrtc_signals table
ALTER TABLE webrtc_signals 
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

-- Step 4: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_devices_session_id ON devices(session_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_is_host ON devices(is_host);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_session_receiver ON webrtc_signals(session_id, receiver_device_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_processed ON webrtc_signals(processed);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_created_at ON webrtc_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_code_active ON sessions(code, is_active);

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop existing policies to recreate them
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

-- Step 7: Create comprehensive RLS policies for anonymous access
CREATE POLICY "Allow anonymous access to sessions" ON sessions
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to devices" ON devices
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to webrtc_signals" ON webrtc_signals
FOR ALL TO anon USING (true) WITH CHECK (true);

-- Step 8: Add foreign key constraints safely
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

    -- Add webrtc_signals sender_device_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'webrtc_signals_sender_device_id_fkey' 
        AND table_name = 'webrtc_signals'
    ) THEN
        ALTER TABLE webrtc_signals 
        ADD CONSTRAINT webrtc_signals_sender_device_id_fkey 
        FOREIGN KEY (sender_device_id) REFERENCES devices(id) ON DELETE CASCADE;
    END IF;

    -- Add webrtc_signals receiver_device_id foreign key
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

-- Step 9: Ensure unique session codes for active sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code_unique ON sessions(code) WHERE is_active = true;

-- Step 10: Create utility functions
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

-- Step 11: Create trigger function to update last_seen automatically
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS trigger_update_device_last_seen ON devices;
CREATE TRIGGER trigger_update_device_last_seen
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_device_last_seen();

-- Step 12: Create function to automatically mark WebRTC signals as processed
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

-- Step 13: Create session management functions
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

-- Step 14: Create session statistics function
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

-- Step 15: Drop existing view if it exists and create new one
DROP VIEW IF EXISTS active_sessions_view;
CREATE VIEW active_sessions_view AS
SELECT 
    s.id,
    s.code,
    s.created_at,
    s.is_active,
    s.is_locked,
    s.selected_editor,
    COUNT(d.id) as device_count,
    COUNT(CASE WHEN d.device_type = 'phone' THEN 1 END) as phone_count,
    COUNT(CASE WHEN d.device_type = 'console' THEN 1 END) as console_count,
    MAX(d.last_seen) as last_activity
FROM sessions s
LEFT JOIN devices d ON s.id = d.session_id
WHERE s.is_active = true
GROUP BY s.id, s.code, s.created_at, s.is_active, s.is_locked, s.selected_editor;

-- Step 16: Update existing data with proper values
UPDATE devices 
SET 
    device_type = CASE 
        WHEN name = 'Console' THEN 'console'::text 
        ELSE 'phone'::text 
    END,
    joined_at = CASE 
        WHEN connected_at IS NOT NULL THEN EXTRACT(EPOCH FROM connected_at)::BIGINT * 1000
        ELSE EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
    END,
    last_seen = COALESCE(connected_at, NOW())
WHERE device_type IS NULL OR joined_at IS NULL OR last_seen IS NULL;

-- Step 17: Set proper host status for console devices
UPDATE devices 
SET is_host = true 
WHERE device_type = 'console' AND (is_host IS NULL OR is_host = false);

-- Step 18: Ensure first phone device in each session is marked as host if no console exists
WITH first_phone_per_session AS (
    SELECT DISTINCT ON (session_id) 
        id, session_id
    FROM devices 
    WHERE device_type = 'phone'
    AND session_id NOT IN (
        SELECT session_id FROM devices WHERE device_type = 'console'
    )
    ORDER BY session_id, connected_at ASC NULLS LAST, joined_at ASC NULLS LAST
)
UPDATE devices 
SET is_host = true 
WHERE id IN (SELECT id FROM first_phone_per_session)
AND (is_host IS NULL OR is_host = false);

-- Step 19: Create notification for successful migration
DO $$
BEGIN
    RAISE NOTICE '=== Database Schema Migration Completed Successfully! ===';
    RAISE NOTICE 'Enhanced features added:';
    RAISE NOTICE '✅ Device management: device_type, is_host, joined_at, last_seen columns';
    RAISE NOTICE '✅ WebRTC enhancements: processed column and cleanup functions';
    RAISE NOTICE '✅ Performance indexes for faster queries';
    RAISE NOTICE '✅ Data integrity constraints and foreign keys';
    RAISE NOTICE '✅ Automated cleanup functions and triggers';
    RAISE NOTICE '✅ Session statistics and management functions';
    RAISE NOTICE '✅ Active sessions view with device counts';
    RAISE NOTICE '✅ Updated existing data with proper values';
    RAISE NOTICE '✅ RLS policies configured for anonymous gaming access';
    RAISE NOTICE '=== Migration Complete - Ready for Gaming! ===';
END $$;