-- C3. Missing RLS Policies on quote_items and system_settings
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- quote_items RLS: Suppliers can manage items for their own quotes, Clients can read items for their RFQs
CREATE POLICY "Suppliers can manage their own quote items" ON public.quote_items
FOR ALL TO authenticated
USING (
    quote_id IN (
        SELECT id FROM public.quotes WHERE supplier_id = auth.uid()
    )
)
WITH CHECK (
    quote_id IN (
        SELECT id FROM public.quotes WHERE supplier_id = auth.uid()
    )
);

CREATE POLICY "Clients can read quote items for their RFQs" ON public.quote_items
FOR SELECT TO authenticated
USING (
    quote_id IN (
        SELECT q.id FROM public.quotes q
        JOIN public.rfqs r ON q.rfq_id = r.id
        WHERE r.client_id = auth.uid()
    )
);

-- Admin full access
CREATE POLICY "Admins have full access to quote items" ON public.quote_items
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
);

-- system_settings RLS: Anyone can read, only Admins can write
CREATE POLICY "Anyone can read system settings" ON public.system_settings
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage system settings" ON public.system_settings
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
);

-- C4. Add WITH CHECK to RLS UPDATE policies for quotes to prevent Clients from modifying their own quotes
-- First, drop the overly permissive policy if it exists
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can update their own quotes" ON public.quotes;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Define read policy for quotes
CREATE POLICY "Users can read relevant quotes" ON public.quotes
FOR SELECT TO authenticated
USING (
    supplier_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.rfqs WHERE id = rfq_id AND client_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
    )
);

-- Define strict update policy for bounds checking (C4)
CREATE POLICY "Suppliers can update their own quotes" ON public.quotes
FOR UPDATE TO authenticated
USING (
    supplier_id = auth.uid()
)
WITH CHECK (
    supplier_id = auth.uid()
);

-- Allow clients ONLY to update status to ACCEPTED/REJECTED, nothing else
CREATE POLICY "Clients can accept or reject quotes" ON public.quotes
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.rfqs WHERE id = quotes.rfq_id AND client_id = auth.uid()
    )
)
WITH CHECK (
    -- Prevent clients from modifying price, margin, or supplier ID
    NOT (
        supplier_price IS DISTINCT FROM (SELECT supplier_price FROM public.quotes WHERE id = id) OR
        margin_percent IS DISTINCT FROM (SELECT margin_percent FROM public.quotes WHERE id = id) OR
        final_price IS DISTINCT FROM (SELECT final_price FROM public.quotes WHERE id = id) OR
        supplier_id IS DISTINCT FROM (SELECT supplier_id FROM public.quotes WHERE id = id)
    )
);
