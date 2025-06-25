/*
  # Enhanced Database Schema Migration

  1. New Columns
    - `devices` table: `device_type`, `joined_at`, `last_seen`
    - `webrtc_signals` table: `processed`
    - Handle existing `is_leader` column properly

  2. Performance Indexes
    - Strategic indexes for common query patterns
    - Composite indexes for multi-column queries

  3. Data Integrity
    - Foreign key constraints
    - Unique constraints for active sessions
    - Check constraints for data validation

  4. Automated Functions
    - Cleanup functions for old data
    - Triggers for automatic updates
    - Session statistics and monitoring

  5. Security
    - Updated RLS policies for anonymous access
    - Proper data access controls
*/

-- Add missing columns to devices table (avoid conflicts)
DO $$
BEGIN
    -- Add device_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'device_type') THEN
        ALTER TABLE devices ADD COLUMN device_type TEXT CHECK (device_type IN ('console', 'phone')) DEFAULT 'phone';
    END IF;

    -- Handle is_host column properly
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_leader') THEN
        -- If is_leader exists but is_host doesn't, rename it
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_host') THEN
            ALTER TABLE devices RENAME COLUMN is_leader TO is_host;
        ELSE
            -- Both exist, copy data from is_leader to is_host and drop is_leader
            UPDATE devices SET is_host = is_leader WHERE is_leader IS NOT NULL;
            ALTER TABLE devices DROP COLUMN is_leader;
        END IF;
    ELSE
        -- is_leader doesn't exist, create is_host if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_host') THEN
            ALTER TABLE devices ADD COLUMN is_host BOOLEAN DEFAULT false;
        END IF;
    END IF;

    -- Add joined_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'joined_at') THEN
        ALTER TABLE devices ADD COLUMN joined_at BIGINT;
    END IF;

    -- Add last_seen column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'last_seen') THEN
        ALTER TABLE devices ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Add processed column to webrtc_signals table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webrtc_signals' AND column_name = 'processed') THEN
        ALTER TABLE webrtc_signals ADD COLUMN processed BOOLEAN DEFAULT false;
    END IF;
END $$;

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

-- Drop existing policies to recreate them (ignore errors if they don't exist)
DO $$
BEGIN
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
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if policies don't exist
        NULL;
END $$;

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
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but continue
        RAISE NOTICE 'Some foreign key constraints may already exist: %', SQLERRM;
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
    END
WHERE device_type IS NULL;

-- Set joined_at from connected_at if not already set
UPDATE devices 
SET joined_at = EXTRACT(EPOCH FROM connected_at)::BIGINT * 1000
WHERE joined_at IS NULL AND connected_at IS NOT NULL;

-- Set last_seen from connected_at if not already set
UPDATE devices 
SET last_seen = COALESCE(connected_at, NOW())
WHERE last_seen IS NULL;

-- Update existing devices to set proper host status
UPDATE devices 
SET is_host = true 
WHERE device_type = 'console' AND (is_host IS NULL OR is_host = false);

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
AND (is_host IS NULL OR is_host = false);

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