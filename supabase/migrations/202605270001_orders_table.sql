-- 202605270001_orders_table.sql
-- Hardened order tracking with financial precision and multi-tenant isolation.

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC,
  order_type TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  raw_response JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index foreign keys and search columns
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_instrument_idx ON public.orders(instrument_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);

-- Security: Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Multi-tenant isolation: Users only see and create their own trades
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Ensure service_role (CLI/Gateway) has full control
GRANT ALL ON TABLE public.orders TO service_role;
