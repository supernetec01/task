ALTER TABLE metric_batches ADD COLUMN storage_key text;
-- Runtime role should receive DML only; migration role owns these objects.
CREATE UNIQUE INDEX bigseller_line_unique ON records(company,(payload->>'external_id')) WHERE kind='BIGSELLER_OUTBOUND';
