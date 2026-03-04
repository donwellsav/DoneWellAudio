-- Kill The Ring: Session history tables
-- sessions: one row per analysis run
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  mode        TEXT NOT NULL,
  fft_size    INTEGER NOT NULL,
  label       TEXT  -- optional user label
);

-- session_events: individual log entries per session
CREATE TABLE IF NOT EXISTS session_events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type  TEXT NOT NULL,          -- issue_detected | analysis_started | etc.
  frequency   DOUBLE PRECISION,       -- nullable, only for issue_detected
  amplitude   DOUBLE PRECISION,
  severity    TEXT,
  classification TEXT,
  q_factor    DOUBLE PRECISION,
  bandwidth   DOUBLE PRECISION,
  growth_rate DOUBLE PRECISION,
  metadata    JSONB                   -- catch-all for other event types
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_occurred_at ON session_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(session_id, event_type);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
