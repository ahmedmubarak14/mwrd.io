-- ============================================================================
-- Phase 23 - Hotfix for leads.status check constraints
-- Safely migrates any legacy status checks to the new Kanban stages.
-- ============================================================================

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  -- Drop any existing CHECK constraints that reference leads.status
  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'leads'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE public.leads
ALTER COLUMN status SET DEFAULT 'NEW';

UPDATE public.leads
SET status = 'NEW'
WHERE status = 'PENDING';

UPDATE public.leads
SET status = 'ONBOARDED'
WHERE status = 'CONVERTED';

ALTER TABLE public.leads
ADD CONSTRAINT leads_status_check
CHECK (status IN ('NEW', 'CONTACTED', 'KYC', 'ONBOARDED', 'REJECTED'));
