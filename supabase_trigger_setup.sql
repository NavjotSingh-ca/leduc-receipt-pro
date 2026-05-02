-- 1. Enable the HTTP Extension (if not already enabled)
-- This is required to make HTTP requests from Postgres
CREATE EXTENSION IF NOT EXISTS net SCHEMA extensions;

-- 2. Create the Webhook Trigger for Background Embeddings
-- This fires whenever a new receipt is inserted to trigger the AI embedding function
CREATE OR REPLACE FUNCTION trigger_generate_embedding()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM
    net.http_post(
      url := 'https://your-project-id.supabase.co/functions/v1/generate-embedding',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || 'YOUR_SERVICE_ROLE_KEY'
      ),
      body := jsonb_build_object('record', row_to_json(NEW))
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_receipt_inserted_embedding ON receipts;
CREATE TRIGGER trg_receipt_inserted_embedding
AFTER INSERT ON receipts
FOR EACH ROW
EXECUTE FUNCTION trigger_generate_embedding();

-- 💡 RECOMMENDATION:
-- If the SQL above still gives schema errors, use the Supabase Dashboard UI:
-- 1. Go to Database -> Webhooks -> "Enable Webhooks" (if not already enabled)
-- 2. Create a new Webhook:
--    - Name: "generate_embedding"
--    - Table: "receipts"
--    - Events: "INSERT"
--    - Target: "Supabase Function" -> Select "generate-embedding"
