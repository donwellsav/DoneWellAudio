-- Spectral Snapshots table for anonymous ML training data
-- Privacy: no IP, no device ID, no geolocation, no phase data
-- Session IDs are random UUIDs, never linked to user accounts

CREATE TABLE IF NOT EXISTS spectral_snapshots (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id      UUID NOT NULL,
  captured_at     TIMESTAMPTZ NOT NULL,
  fft_size        SMALLINT NOT NULL CHECK (fft_size IN (4096, 8192, 16384)),
  sample_rate     INTEGER NOT NULL CHECK (sample_rate BETWEEN 8000 AND 96000),
  bins_per_snapshot SMALLINT NOT NULL DEFAULT 512,

  -- Feedback event metadata
  event_frequency_hz  REAL NOT NULL,
  event_amplitude_db  REAL NOT NULL,
  event_severity      TEXT NOT NULL,
  event_confidence    REAL NOT NULL CHECK (event_confidence BETWEEN 0 AND 1),
  event_content_type  TEXT NOT NULL DEFAULT 'unknown',

  -- Snapshot data (JSONB array of {t: number, s: base64_string})
  snapshot_count  SMALLINT NOT NULL,
  snapshots       JSONB NOT NULL,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for ML training queries: fetch by session or time range
CREATE INDEX idx_spectral_snapshots_session ON spectral_snapshots (session_id);
CREATE INDEX idx_spectral_snapshots_captured ON spectral_snapshots (captured_at);
CREATE INDEX idx_spectral_snapshots_severity ON spectral_snapshots (event_severity);

-- RLS: only service role can insert/read (no anon access)
ALTER TABLE spectral_snapshots ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role key (from Edge Function) can access
-- This ensures the table is inaccessible from client-side Supabase calls
