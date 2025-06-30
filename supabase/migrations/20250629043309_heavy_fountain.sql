/*
  # Update device_inputs input_type constraint

  1. Changes
    - Remove existing input_type check constraint
    - Add new constraint that includes 'voice' and 'canvas' input types
    
  2. Reason
    - EditorControlPanel component sends 'voice' and 'canvas' input types
    - Current constraint only allows: 'dpad', 'button', 'swipe', 'touch', 'accelerometer'
    - Need to expand allowed values to include: 'voice', 'canvas'
*/

-- Remove the existing constraint
ALTER TABLE public.device_inputs DROP CONSTRAINT IF EXISTS device_inputs_input_type_check;

-- Add the updated constraint with voice and canvas support
ALTER TABLE public.device_inputs ADD CONSTRAINT device_inputs_input_type_check 
  CHECK (input_type = ANY (ARRAY['dpad'::text, 'button'::text, 'swipe'::text, 'touch'::text, 'accelerometer'::text, 'voice'::text, 'canvas'::text]));