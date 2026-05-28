-- 20260526133000_macro_observations_store.sql
-- Optimized storage for FRED/World Bank macro indicators.

CREATE TABLE IF NOT EXISTS public.macro_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family TEXT NOT NULL DEFAULT 'macro',
  series TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'fred',
  observed_at TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast time-series retrieval
CREATE INDEX IF NOT EXISTS macro_obs_series_time_idx ON public.macro_observations (series, observed_at DESC);

-- UNIQUE constraint to support high-performance UPSERTs
CREATE UNIQUE INDEX IF NOT EXISTS macro_obs_unique_idx ON public.macro_observations (family, series, observed_at);

-- Security: Row Level Security
ALTER TABLE public.macro_observations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read indicators
DROP POLICY IF EXISTS "macro_observations_read_all" ON public.macro_observations;
CREATE POLICY "macro_observations_read_all" ON public.macro_observations
  FOR SELECT TO authenticated USING (true);

-- Ensure service_role (CLI/Ingestor) has full control
GRANT ALL ON TABLE public.macro_observations TO service_role;
