-- BLOCKER 2: Add payment reference uniqueness check
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_reference_unique UNIQUE (payment_reference);

-- H1: Explicitly deny DELETE operations on payments table (Postgres defaults to deny without a policy, but explicit is better)
CREATE POLICY "No direct payment deletes" ON public.payments FOR DELETE TO authenticated USING (false);

