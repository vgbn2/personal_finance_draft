-- 202605280001_risk_alert_trigger.sql
-- Wires the risk-alert Edge Function to the orders table.

-- Function to invoke the edge function via net.http_post
CREATE OR REPLACE FUNCTION public.notify_risk_rejection()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Only trigger on risk_rejected status
  IF (NEW.status = 'risk_rejected') THEN
    payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)::jsonb
    );

    -- NOTE: Requires the 'pg_net' extension to be enabled in Supabase
    -- In a real Supabase environment, you would use:
    -- PERFORM net.http_post(
    --   url := 'https://' || current_setting('request.headers')::jsonb->>'host' || '/functions/v1/risk-alert',
    --   headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('request.headers')::jsonb->>'authorization'),
    --   body := payload
    -- );
    
    -- For documentation/local simulation purposes, we log it
    RAISE NOTICE 'Risk Rejection Detected: %', payload;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS tr_notify_risk_rejection ON public.orders;
CREATE TRIGGER tr_notify_risk_rejection
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_risk_rejection();
