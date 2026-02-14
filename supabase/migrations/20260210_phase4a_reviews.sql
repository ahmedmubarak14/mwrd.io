-- =====================================================
-- Phase 4a: Reviews System (Gap #12)
-- =====================================================

-- =====================================================
-- Create reviews Table
-- =====================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) UNIQUE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  supplier_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reviews IS 
  'Post-delivery ratings and reviews. One review per order, submitted by the client.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_reviews_supplier_id ON reviews(supplier_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- =====================================================
-- Enable RLS on reviews
-- =====================================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for reviews
-- =====================================================

-- Policy: Clients can view all reviews (for supplier selection)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Clients can view all reviews'
  ) THEN
    CREATE POLICY "Clients can view all reviews" ON reviews
    FOR SELECT
    USING (get_user_role() = 'CLIENT');
  END IF;
END $$;

-- Policy: Suppliers can view reviews about them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Suppliers can view own reviews'
  ) THEN
    CREATE POLICY "Suppliers can view own reviews" ON reviews
    FOR SELECT
    USING (supplier_id = auth.uid());
  END IF;
END $$;

-- Policy: Admins can view all reviews
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Admins can view all reviews'
  ) THEN
    CREATE POLICY "Admins can view all reviews" ON reviews
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete reviews
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Admins can delete reviews'
  ) THEN
    CREATE POLICY "Admins can delete reviews" ON reviews
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Submit Review
-- =====================================================

CREATE OR REPLACE FUNCTION submit_review(
  p_order_id UUID,
  p_rating INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_client_id UUID;
  v_supplier_id UUID;
  v_review_id UUID;
  v_new_avg_rating DECIMAL(3, 2);
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  
  -- Get order details
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  v_client_id := v_order.client_id;
  v_supplier_id := v_order.supplier_id;
  
  -- Verify caller is the order's client
  IF auth.uid() <> v_client_id THEN
    RAISE EXCEPTION 'Only the order client can submit a review';
  END IF;
  
  -- Verify order status is DELIVERED or COMPLETED
  IF v_order.status NOT IN ('DELIVERED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Can only review delivered or completed orders. Current status: %', v_order.status;
  END IF;
  
  -- Check if review already exists
  IF EXISTS (SELECT 1 FROM reviews WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Review already exists for this order';
  END IF;
  
  -- Insert review
  INSERT INTO reviews (
    order_id,
    reviewer_id,
    supplier_id,
    rating,
    comment
  ) VALUES (
    p_order_id,
    v_client_id,
    v_supplier_id,
    p_rating,
    p_comment
  ) RETURNING id INTO v_review_id;
  
  -- Recalculate supplier's average rating
  SELECT AVG(rating)::DECIMAL(3, 2)
  INTO v_new_avg_rating
  FROM reviews
  WHERE supplier_id = v_supplier_id;
  
  -- Update supplier's rating
  UPDATE users
  SET rating = v_new_avg_rating,
      updated_at = NOW()
  WHERE id = v_supplier_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'order_id', p_order_id,
    'rating', p_rating,
    'supplier_new_avg_rating', v_new_avg_rating
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to submit review: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION submit_review(UUID, INTEGER, TEXT) IS 
  'Submits a review for a delivered/completed order. Recalculates supplier average rating. Client-only.';

-- =====================================================
-- Trigger: Update supplier rating on review delete
-- =====================================================

CREATE OR REPLACE FUNCTION recalculate_supplier_rating_on_delete()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_avg_rating DECIMAL(3, 2);
BEGIN
  -- Recalculate supplier's average rating after deletion
  SELECT AVG(rating)::DECIMAL(3, 2)
  INTO v_new_avg_rating
  FROM reviews
  WHERE supplier_id = OLD.supplier_id;
  
  -- Update supplier's rating (NULL if no reviews left)
  UPDATE users
  SET rating = v_new_avg_rating,
      updated_at = NOW()
  WHERE id = OLD.supplier_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_recalculate_rating_on_delete ON reviews;

CREATE TRIGGER trg_recalculate_rating_on_delete
  AFTER DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_supplier_rating_on_delete();

COMMENT ON FUNCTION recalculate_supplier_rating_on_delete() IS 
  'Recalculates supplier average rating when a review is deleted (admin action).';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'reviews') = 1,
    'reviews table not created';
END $$;

-- Verify indexes were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'reviews') >= 4,
    'Not all indexes created on reviews';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'reviews') = TRUE,
    'RLS not enabled on reviews';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'reviews') >= 4,
    'Not all RLS policies created for reviews';
END $$;

-- Verify submit_review function was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'submit_review') = 1,
    'submit_review function not created';
END $$;
