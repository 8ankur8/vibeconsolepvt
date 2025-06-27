/*
  # Add updated_at column to sessions table

  1. Schema Changes
    - Add `updated_at` column to `sessions` table with default value of current timestamp
    - Create a trigger function to automatically update the `updated_at` column on row modifications
    - Create a trigger on the `sessions` table to call the update function

  2. Security
    - No changes to existing RLS policies needed
    - The `updated_at` column will inherit the same security model as the table

  3. Notes
    - The trigger will automatically set `updated_at` to the current timestamp whenever a row is updated
    - Existing rows will have their `updated_at` set to the current timestamp when the migration runs
*/

-- Add updated_at column to sessions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE sessions ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create or replace the trigger function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger on sessions table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_sessions_updated_at'
  ) THEN
    CREATE TRIGGER update_sessions_updated_at
      BEFORE UPDATE ON sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Update existing rows to have the current timestamp
UPDATE sessions SET updated_at = now() WHERE updated_at IS NULL;