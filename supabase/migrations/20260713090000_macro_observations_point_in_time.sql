-- Preserve macro release vintages so historical decisions cannot see later revisions.
ALTER TABLE public.macro_observations
  ADD COLUMN IF NOT EXISTS normalized_value DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS normalization_method TEXT,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vintage TEXT,
  ADD COLUMN IF NOT EXISTS revision_id TEXT,
  ADD COLUMN IF NOT EXISTS point_in_time_eligible BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.macro_observations
SET period_end = COALESCE(period_end, observed_at),
    ingested_at = COALESCE(ingested_at, created_at),
    revision_id = COALESCE(revision_id, 'legacy:' || id::TEXT)
WHERE period_end IS NULL OR ingested_at IS NULL OR revision_id IS NULL;

ALTER TABLE public.macro_observations
  ALTER COLUMN revision_id SET NOT NULL;

DROP INDEX IF EXISTS public.macro_obs_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS macro_obs_revision_unique_idx
  ON public.macro_observations (revision_id);
CREATE INDEX IF NOT EXISTS macro_obs_asof_idx
  ON public.macro_observations (series, period_end, available_at DESC)
  WHERE point_in_time_eligible = TRUE;

ALTER TABLE public.macro_observations
  DROP CONSTRAINT IF EXISTS macro_observations_release_order_check;
ALTER TABLE public.macro_observations
  ADD CONSTRAINT macro_observations_release_order_check
  CHECK (
    (available_at IS NULL OR released_at IS NULL OR available_at >= released_at)
    AND (ingested_at IS NULL OR available_at IS NULL OR ingested_at >= available_at)
  );
