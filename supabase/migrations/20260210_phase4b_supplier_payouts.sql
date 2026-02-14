-- =====================================================
-- Phase 4b: Supplier Payouts (Gap #6a)
-- =====================================================

-- =====================================================
-- Create supplier_payouts Table
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED')),
  payment_method TEXT,
  reference_number TEXT,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE supplier_payouts IS 
  'Manual supplier payout tracking. Records when and how suppliers are paid for completed orders.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_supplier_payouts_supplier_id ON supplier_payouts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_order_id ON supplier_payouts(order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_status ON supplier_payouts(status);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_created_at ON supplier_payouts(created_at DESC);

-- =====================================================
-- Create updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_supplier_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_supplier_payouts_updated_at ON supplier_payouts;

CREATE TRIGGER trg_update_supplier_payouts_updated_at
  BEFORE UPDATE ON supplier_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_payouts_updated_at();

-- =====================================================
-- Enable RLS on supplier_payouts
-- =====================================================

ALTER TABLE supplier_payouts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for supplier_payouts
-- =====================================================

-- Policy: Suppliers can view their own payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Suppliers can view own payouts'
  ) THEN
    CREATE POLICY "Suppliers can view own payouts" ON supplier_payouts
    FOR SELECT
    USING (supplier_id = auth.uid());
  END IF;
END $$;

-- Policy: Admins can view all payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can view all payouts'
  ) THEN
    CREATE POLICY "Admins can view all payouts" ON supplier_payouts
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can insert payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can insert payouts'
  ) THEN
    CREATE POLICY "Admins can insert payouts" ON supplier_payouts
    FOR INSERT
    WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can update payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can update payouts'
  ) THEN
    CREATE POLICY "Admins can update payouts" ON supplier_payouts
    FOR UPDATE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete payouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'supplier_payouts' 
    AND policyname = 'Admins can delete payouts'
  ) THEN
    CREATE POLICY "Admins can delete payouts" ON supplier_payouts
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Admin Record Supplier Payout
-- =====================================================

CREATE OR REPLACE FUNCTION admin_record_supplier_payout(
  p_supplier_id UUID,
  p_order_id UUID,
  p_amount DECIMAL(12, 2),
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout_id UUID;
  v_order RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;
  
  -- Verify order exists and belongs to supplier
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND supplier_id = p_supplier_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or does not belong to this supplier';
  END IF;
  
  -- Insert payout record
  INSERT INTO supplier_payouts (
    supplier_id,
    order_id,
    amount,
    payment_method,
    reference_number,
    notes,
    created_by
  ) VALUES (
    p_supplier_id,
    p_order_id,
    p_amount,
    p_payment_method,
    p_reference_number,
    p_notes,
    auth.uid()
  ) RETURNING id INTO v_payout_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'payout_id', v_payout_id,
    'supplier_id', p_supplier_id,
    'order_id', p_order_id,
    'amount', p_amount,
    'payment_method', p_payment_method
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to record payout: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_record_supplier_payout(UUID, UUID, DECIMAL, TEXT, TEXT, TEXT) IS 
  'Records a supplier payout for an order. Admin-only. Creates payout in PENDING status.';

-- =====================================================
-- RPC: Update Payout Status
-- =====================================================

CREATE OR REPLACE FUNCTION admin_update_payout_status(
  p_payout_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate status
  IF p_status NOT IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED') THEN
    RAISE EXCEPTION 'Invalid status. Must be PENDING, PROCESSING, PAID, or FAILED';
  END IF;
  
  -- Get current payout
  SELECT * INTO v_payout
  FROM supplier_payouts
  WHERE id = p_payout_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;
  
  -- Update payout
  UPDATE supplier_payouts
  SET 
    status = p_status,
    paid_at = CASE WHEN p_status = 'PAID' THEN NOW() ELSE paid_at END,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE id = p_payout_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'payout_id', p_payout_id,
    'old_status', v_payout.status,
    'new_status', p_status
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update payout status: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_update_payout_status(UUID, TEXT, TEXT) IS 
  'Updates payout status. Sets paid_at timestamp when status changes to PAID. Admin-only.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'supplier_payouts') = 1,
    'supplier_payouts table not created';
END $$;

-- Verify indexes were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'supplier_payouts') >= 4,
    'Not all indexes created on supplier_payouts';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'supplier_payouts') = TRUE,
    'RLS not enabled on supplier_payouts';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'supplier_payouts') >= 5,
    'Not all RLS policies created for supplier_payouts';
END $$;

-- Verify RPCs were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_record_supplier_payout') = 1,
    'admin_record_supplier_payout function not created';
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_update_payout_status') = 1,
    'admin_update_payout_status function not created';
END $$;
