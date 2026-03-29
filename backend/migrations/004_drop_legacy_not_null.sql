-- Migration: Drop legacy NOT NULL constraints on unused columns
-- These columns exist in production but are no longer in the ORM models,
-- causing INSERT failures when SQLAlchemy doesn't set them.

-- ========== users table ==========
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

DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN mobility SET DEFAULT 0;
  ALTER TABLE users ALTER COLUMN mobility DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ========== run_player_stats table ==========
DO $$
DECLARE col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['avg_scoring', 'avg_offense', 'avg_defense', 'avg_overall', 'jordan_factor', 'mobility']
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE run_player_stats ALTER COLUMN %I SET DEFAULT 0', col);
      EXECUTE format('ALTER TABLE run_player_stats ALTER COLUMN %I DROP NOT NULL', col);
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END LOOP;
END $$;
