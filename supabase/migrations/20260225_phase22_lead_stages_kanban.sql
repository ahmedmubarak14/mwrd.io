-- ============================================================================
-- Phase 22 - Lead stage model for admin Kanban view
-- ============================================================================

-- Replace legacy status constraint with stage-oriented statuses.
ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
ALTER COLUMN status SET DEFAULT 'NEW';

-- Normalize historical lead statuses to the new stage pipeline.
UPDATE public.leads
SET status = 'NEW'
WHERE status = 'PENDING';

UPDATE public.leads
SET status = 'ONBOARDED'
WHERE status = 'CONVERTED';

ALTER TABLE public.leads
ADD CONSTRAINT leads_status_check
CHECK (status IN ('NEW', 'CONTACTED', 'KYC', 'ONBOARDED', 'REJECTED'));
