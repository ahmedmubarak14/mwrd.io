-- =====================================================
-- Phase 7: RFQ Expiry Scheduler
-- Gap: RFQ Auto-Expiry Cron
-- =====================================================

-- Ensure pg_cron extension is available (best-effort in hosted environments)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension could not be created in this environment: %', SQLERRM;
END $$;

-- Schedule close_expired_rfqs every 15 minutes
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'mwrd-close-expired-rfqs-every-15m'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'mwrd-close-expired-rfqs-every-15m',
      '*/15 * * * *',
      'SELECT public.close_expired_rfqs();'
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Schedule close_expired_rfqs() manually.';
  END IF;
END $$;

-- Verification (only when pg_cron is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    ASSERT (
      SELECT COUNT(*)
      FROM cron.job
      WHERE jobname = 'mwrd-close-expired-rfqs-every-15m'
    ) = 1, 'RFQ expiry cron job was not scheduled';
  END IF;
END $$;

INSERT INTO public._migration_log (migration_name)
SELECT '20260210_phase7_rfq_expiry_cron.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;
