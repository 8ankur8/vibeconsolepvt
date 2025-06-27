/*
  # Database Schema Enhancement Migration

  1. Device Management
    - Add device_type, is_host, joined_at, last_seen columns
    - Update existing data with proper values
    - Add performance indexes

  2. WebRTC Improvements
    - Add processed column for signal tracking
    - Create cleanup functions

  3. Session Management
    - Enhanced views and statistics
    - Automated cleanup triggers

  4. Security & Performance
    - RLS policies for anonymous access
    - Foreign key constraints
    - Optimized indexes
*/

-- Step 1: Drop existing views that might conflict
DROP VIEW IF EXISTS active_sessions_view CASCADE;
DROP VIEW IF EXISTS session_recent_inputs CASCADE;

-- Step 2: Add missing columns to devices table
DO $$
BEGIN
    -- Add device_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'device_type') THEN
        ALTER TABLE devices ADD COLUMN device_type TEXT CHECK (device_type IN ('console', 'phone')) DEFAULT 'phone';
    END IF;

    -- Add is_host column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_host') THEN
        ALTER TABLE devices ADD COLUMN is_host BOOLEAN DEFAULT false;
    END IF;

    -- Add joined_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'joined_at') THEN
        ALTER TABLE devices ADD COLUMN joined_at BIGINT;
    END IF;

    -- Add last_seen column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'last_seen') THEN
        ALTER TABLE devices ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add update_at column if it doesn't exist (for tracking last input)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'update_at') THEN
        ALTER TABLE devices ADD COLUMN update_at DATE;
    END IF;
END $$;

-- Step 3: Handle is_leader to is_host migration
DO $$ 
BEGIN
    -- If is_leader exists, copy its values to is_host and drop it
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'is_leader') THEN
        UPDATE devices SET is_host = is_leader WHERE is_leader IS NOT NULL;
        ALTER TABLE devices DROP COLUMN is_leader;
    END IF;
END $$;

-- Step 4: Add processed column to webrtc_signals table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'webrtc_signals' AND column_name = 'processed') THEN
        ALTER TABLE webrtc_signals ADD COLUMN processed BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Step 5: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_devices_session_id ON devices(session_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_type ON devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_is_host ON devices(is_host);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_session_receiver ON webrtc_signals(session_id, receiver_device_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_processed ON webrtc_signals(processed);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_created_at ON webrtc_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_code_active ON sessions(code, is_active);

-- Step 6: Ensure unique session codes for active sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_code_unique ON sessions(code) WHERE is_active = true;

-- Step 7: Enable Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Step 8: Drop existing policies to recreate them
DROP POLICY IF EXISTS "Allow anonymous access to sessions" ON sessions;
DROP POLICY IF EXISTS "Allow anonymous access to devices" ON devices;
DROP POLICY IF EXISTS "Allow anonymous access to webrtc_signals" ON webrtc_signals;

-- Step 9: Create comprehensive RLS policies for anonymous access
CREATE POLICY "Allow anonymous access to sessions" ON sessions
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to devices" ON devices
FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous access to webrtc_signals" ON webrtc_signals
FOR ALL TO anon USING (true) WITH CHECK (true);

-- Step 10: Add foreign key constraints
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

-- Step 11: Create utility functions
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Create trigger for automatic last_seen updates
DROP TRIGGER IF EXISTS trigger_update_device_last_seen ON devices;
CREATE TRIGGER trigger_update_device_last_seen
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_device_last_seen();

-- Step 13: Create function to get session statistics
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

-- Step 14: Create cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete processed signals older than 1 hour
    DELETE FROM webrtc_signals 
    WHERE processed = true 
    AND created_at < NOW() - INTERVAL '1 hour';
    
    -- Delete unprocessed signals older than 6 hours
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
    
    -- Delete devices that haven't been seen in 2 hours (except console)
    DELETE FROM devices 
    WHERE last_seen < NOW() - INTERVAL '2 hours'
    AND device_type = 'phone';
    
    RAISE NOTICE 'Old data cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Step 15: Create function to update device with last input data
CREATE OR REPLACE FUNCTION update_device_last_input(
    device_uuid UUID,
    input_data JSONB
)
RETURNS void AS $$
BEGIN
    UPDATE devices 
    SET 
        update_at = CURRENT_DATE,
        last_seen = NOW()
    WHERE id = device_uuid;
    
    -- Optionally store the input data in the sessions table for quick access
    UPDATE sessions 
    SET selected_editor = input_data::TEXT
    WHERE id = (SELECT session_id FROM devices WHERE id = device_uuid);
END;
$$ LANGUAGE plpgsql;

-- Step 16: Recreate views with proper column names
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

-- Step 17: Create view for session recent inputs (if device_inputs table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_inputs') THEN
        EXECUTE '
        CREATE VIEW session_recent_inputs AS
        SELECT 
            di.*,
            d.name as device_name,
            d.device_type,
            s.code as session_code
        FROM device_inputs di
        JOIN devices d ON di.device_id = d.id
        JOIN sessions s ON di.session_id = s.id
        WHERE di.created_at > NOW() - INTERVAL ''1 hour''
        ORDER BY di.timestamp DESC;
        ';
    END IF;
END $$;

-- Step 18: Update existing data with proper values
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
    last_seen = COALESCE(connected_at, NOW()),
    update_at = CURRENT_DATE
WHERE device_type IS NULL OR joined_at IS NULL;

-- Step 19: Set proper host status
UPDATE devices 
SET is_host = true 
WHERE device_type = 'console' AND (is_host IS NULL OR is_host = false);

-- Step 20: Ensure first phone device in each session is marked as host if no console exists
WITH first_phone_per_session AS (
    SELECT DISTINCT ON (session_id) 
        id, session_id
    FROM devices 
    WHERE device_type = 'phone'
    AND session_id NOT IN (
        SELECT session_id FROM devices WHERE device_type = 'console'
    )
    ORDER BY session_id, connected_at ASC NULLS LAST
)
UPDATE devices 
SET is_host = true 
WHERE id IN (SELECT id FROM first_phone_per_session)
AND (is_host IS NULL OR is_host = false);

-- Step 21: Create notification for successful migration
DO $$
BEGIN
    RAISE NOTICE '=== Database Migration Completed Successfully! ===';
    RAISE NOTICE 'Enhanced Features Added:';
    RAISE NOTICE '✅ Device Management: device_type, is_host, joined_at, last_seen, update_at';
    RAISE NOTICE '✅ WebRTC Improvements: processed column for signal tracking';
    RAISE NOTICE '✅ Performance: Optimized indexes for faster queries';
    RAISE NOTICE '✅ Data Integrity: Foreign key constraints added';
    RAISE NOTICE '✅ Automation: Triggers for last_seen updates';
    RAISE NOTICE '✅ Analytics: Session statistics functions';
    RAISE NOTICE '✅ Cleanup: Automated old data removal functions';
    RAISE NOTICE '✅ Views: Active sessions and recent inputs views';
    RAISE NOTICE '✅ Security: RLS policies for anonymous access';
    RAISE NOTICE '=== Migration Complete - Database Ready! ===';
END $$;