-- Harden ingest auth/rate limiting and support ML export query shape.

-- Match the training export query:
--   WHERE user_feedback IS NOT NULL
--     AND algo_msd IS NOT NULL
--   ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_spectral_snapshots_training_export
  ON spectral_snapshots (created_at DESC)
  WHERE user_feedback IS NOT NULL
    AND algo_msd IS NOT NULL;

-- Shared rate-limit state for the ingest Edge Function.
CREATE TABLE IF NOT EXISTS ingest_rate_limits (
  bucket_key    TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_rate_limits_expires_at
  ON ingest_rate_limits (expires_at);

ALTER TABLE ingest_rate_limits ENABLE ROW LEVEL SECURITY;

-- No public policies - only the service role used by the Edge Function may access.
REVOKE ALL ON TABLE ingest_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ingest_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION check_ingest_rate_limit(
  p_bucket_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires_at TIMESTAMPTZ := v_now + make_interval(secs => p_window_seconds);
  v_request_count INTEGER;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 THEN
    RAISE EXCEPTION 'p_bucket_key is required';
  END IF;

  IF p_max_requests <= 0 THEN
    RAISE EXCEPTION 'p_max_requests must be positive';
  END IF;

  IF p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be positive';
  END IF;

  INSERT INTO ingest_rate_limits AS rl (bucket_key, request_count, expires_at, updated_at)
  VALUES (p_bucket_key, 1, v_expires_at, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
  SET request_count = CASE
        WHEN rl.expires_at <= EXCLUDED.updated_at THEN 1
        ELSE rl.request_count + 1
      END,
      expires_at = CASE
        WHEN rl.expires_at <= EXCLUDED.updated_at THEN EXCLUDED.expires_at
        ELSE rl.expires_at
      END,
      updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_request_count;

  WITH stale_keys AS (
    SELECT bucket_key
    FROM ingest_rate_limits
    WHERE expires_at < v_now - interval '1 day'
    ORDER BY expires_at
    LIMIT 100
  )
  DELETE FROM ingest_rate_limits AS rl
  USING stale_keys
  WHERE rl.bucket_key = stale_keys.bucket_key;

  RETURN v_request_count > p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION check_ingest_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_ingest_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
