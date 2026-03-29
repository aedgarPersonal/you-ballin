-- Migration: Drop legacy NOT NULL constraints on unused user columns
-- These columns exist in production but are no longer in the User model,
-- causing INSERT failures when SQLAlchemy doesn't set them.

ALTER TABLE users ALTER COLUMN avg_scoring SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN avg_scoring DROP NOT NULL;

ALTER TABLE users ALTER COLUMN avg_offense SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN avg_offense DROP NOT NULL;

ALTER TABLE users ALTER COLUMN avg_defense SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN avg_defense DROP NOT NULL;

ALTER TABLE users ALTER COLUMN avg_overall SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN avg_overall DROP NOT NULL;

ALTER TABLE users ALTER COLUMN jordan_factor SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN jordan_factor DROP NOT NULL;

-- Also handle mobility if it exists
DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN mobility SET DEFAULT 0;
  ALTER TABLE users ALTER COLUMN mobility DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
