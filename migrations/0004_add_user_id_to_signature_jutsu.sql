-- Add user_id column to signature_jutsu to match live D1 schema.
-- This column mirrors player_id and is populated with the same value.
ALTER TABLE signature_jutsu ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
