-- ============================================================================
-- Production Schema Migration: Sync Supabase with latest models
-- ============================================================================
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- This is idempotent - safe to run multiple times.
-- ============================================================================

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO "users" TABLE
-- ============================================================================
DO $$ BEGIN
    -- Rating columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avg_offense') THEN
        ALTER TABLE users ADD COLUMN avg_offense FLOAT DEFAULT 3.0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avg_defense') THEN
        ALTER TABLE users ADD COLUMN avg_defense FLOAT DEFAULT 3.0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avg_overall') THEN
        ALTER TABLE users ADD COLUMN avg_overall FLOAT DEFAULT 3.0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='jordan_factor') THEN
        ALTER TABLE users ADD COLUMN jordan_factor FLOAT DEFAULT 0.5;
    END IF;

    -- Aggregate stat columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='games_played') THEN
        ALTER TABLE users ADD COLUMN games_played INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='games_won') THEN
        ALTER TABLE users ADD COLUMN games_won INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mvp_count') THEN
        ALTER TABLE users ADD COLUMN mvp_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='shaqtin_count') THEN
        ALTER TABLE users ADD COLUMN shaqtin_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='xfactor_count') THEN
        ALTER TABLE users ADD COLUMN xfactor_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- 2. ADD MISSING COLUMNS TO "runs" TABLE
-- ============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='runs' AND column_name='start_date') THEN
        ALTER TABLE runs ADD COLUMN start_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='runs' AND column_name='end_date') THEN
        ALTER TABLE runs ADD COLUMN end_date DATE;
    END IF;
END $$;

-- ============================================================================
-- 3. ADD MISSING COLUMNS TO "run_memberships" TABLE
-- ============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_memberships' AND column_name='notify_email') THEN
        ALTER TABLE run_memberships ADD COLUMN notify_email BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_memberships' AND column_name='notify_sms') THEN
        ALTER TABLE run_memberships ADD COLUMN notify_sms BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- ============================================================================
-- 4. CREATE "run_player_stats" TABLE (per-run player statistics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS run_player_stats (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    jordan_factor FLOAT NOT NULL DEFAULT 0.5,
    avg_offense FLOAT NOT NULL DEFAULT 3.0,
    avg_defense FLOAT NOT NULL DEFAULT 3.0,
    avg_overall FLOAT NOT NULL DEFAULT 3.0,
    mvp_count INTEGER NOT NULL DEFAULT 0,
    shaqtin_count INTEGER NOT NULL DEFAULT 0,
    xfactor_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (run_id, user_id)
);

-- ============================================================================
-- 5. CREATE "notifications" TABLE
-- ============================================================================
DO $$ BEGIN
    -- Create the notification type enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notificationtype') THEN
        CREATE TYPE notificationtype AS ENUM (
            'game_invite', 'dropin_available', 'rsvp_reminder',
            'teams_published', 'registration_approved', 'registration_denied',
            'awards_announced', 'voting_open', 'game_cancelled',
            'game_updated', 'game_completed', 'status_changed',
            'general', 'player_suggested', 'suggestion_accepted',
            'suggestion_declined'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
    type notificationtype NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    sms_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 6. CREATE "player_suggestions" TABLE
-- ============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestionstatus') THEN
        CREATE TYPE suggestionstatus AS ENUM ('pending', 'accepted', 'declined');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS player_suggestions (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    suggested_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggested_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message VARCHAR(500),
    status suggestionstatus NOT NULL DEFAULT 'pending',
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 7. CREATE "player_ratings" TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS player_ratings (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rater_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offense FLOAT NOT NULL,
    defense FLOAT NOT NULL,
    overall FLOAT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (run_id, player_id, rater_id)
);

-- ============================================================================
-- 8. CREATE "team_assignments" TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_assignments (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team VARCHAR(20) NOT NULL,
    team_name VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 9. CREATE "game_results" and "team_scores" TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_results (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
    notes VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_scores (
    id SERIAL PRIMARY KEY,
    game_result_id INTEGER NOT NULL REFERENCES game_results(id) ON DELETE CASCADE,
    team VARCHAR(20) NOT NULL,
    team_name VARCHAR(100) NOT NULL DEFAULT '',
    wins INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- 10. CREATE "game_votes" TABLE
-- ============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'votetype') THEN
        CREATE TYPE votetype AS ENUM ('mvp', 'shaqtin', 'xfactor');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS game_votes (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nominee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type votetype NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (game_id, voter_id, vote_type)
);

-- ============================================================================
-- 11. ADD USEFUL INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_run_player_stats_run_id ON run_player_stats(run_id);
CREATE INDEX IF NOT EXISTS ix_player_ratings_run_player ON player_ratings(run_id, player_id);
CREATE INDEX IF NOT EXISTS ix_team_assignments_game_id ON team_assignments(game_id);

-- ============================================================================
-- DONE! Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================================
