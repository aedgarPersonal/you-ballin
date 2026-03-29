-- Migration: Add position column to users table
-- Default value is 'Mascot' for all existing and new players

ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(20) NOT NULL DEFAULT 'Mascot';
