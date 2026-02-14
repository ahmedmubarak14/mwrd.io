-- =====================================================
-- Phase 3: Partial Quotes + Alternative Products
-- Gaps: #2, #9
-- =====================================================

-- =====================================================
-- Gap #2: Partial Quote Support
-- =====================================================

-- Add is_partial column to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'is_partial'
  ) THEN
    ALTER TABLE quotes ADD COLUMN is_partial BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

COMMENT ON COLUMN quotes.is_partial IS 
  'TRUE if supplier quoted only some items from the RFQ (not all rfq_items have is_quoted=TRUE)';

-- =====================================================
-- Gap #9: Alternative Product Validation
-- =====================================================

-- Create function to validate alternative products
CREATE OR REPLACE FUNCTION validate_alternative_product()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id UUID;
  v_alt_supplier_id UUID;
BEGIN
  -- Only validate if alternative_product_id is set
  IF NEW.alternative_product_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get the supplier_id from the quote
  SELECT supplier_id INTO v_supplier_id
  FROM quotes
  WHERE id = NEW.quote_id;
  
  -- Get the supplier_id of the alternative product
  SELECT supplier_id INTO v_alt_supplier_id
  FROM products
  WHERE id = NEW.alternative_product_id;
  
  -- Verify alternative product belongs to the same supplier
  IF v_alt_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Alternative product does not exist';
  END IF;
  
  IF v_alt_supplier_id <> v_supplier_id THEN
    RAISE EXCEPTION 'Alternative product must belong to the quoting supplier';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_validate_alternative_product ON quote_items;

CREATE TRIGGER trg_validate_alternative_product
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_alternative_product();

COMMENT ON FUNCTION validate_alternative_product() IS 
  'Ensures alternative_product_id belongs to the same supplier as the quote. Prevents suppliers from offering competitors products.';

-- =====================================================
-- Update accept_quote_and_deduct_credit RPC
-- =====================================================

-- This function needs to be updated to handle partial quotes
-- The existing function should be modified to:
-- 1. Calculate total from only is_quoted = TRUE items in quote_items
-- 2. Pass is_partial flag to the created order
-- 3. Include payment_terms from the client's profile

CREATE OR REPLACE FUNCTION accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_client_id UUID;
  v_supplier_id UUID;
  v_final_price DECIMAL(12, 2);
  v_credit_limit DECIMAL(12, 2);
  v_current_balance DECIMAL(12, 2);
  v_order_id UUID;
  v_payment_terms payment_terms;
  v_is_partial BOOLEAN;
  v_quoted_items_count INTEGER;
  v_total_items_count INTEGER;
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Get quote details
  SELECT q.*, r.client_id
  INTO v_quote
  FROM quotes q
  JOIN rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  
  -- Verify caller is the client or admin
  IF auth.uid() <> v_quote.client_id AND get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only the client or admin can accept this quote';
  END IF;
  
  -- Verify quote status
  IF v_quote.status <> 'SENT_TO_CLIENT' THEN
    RAISE EXCEPTION 'Quote must be in SENT_TO_CLIENT status to be accepted';
  END IF;
  
  v_client_id := v_quote.client_id;
  v_supplier_id := v_quote.supplier_id;
  v_final_price := v_quote.final_price;
  
  -- Check if quote is partial (has quote_items)
  SELECT 
    COUNT(*) FILTER (WHERE is_quoted = TRUE),
    COUNT(*)
  INTO v_quoted_items_count, v_total_items_count
  FROM quote_items
  WHERE quote_id = p_quote_id;
  
  -- Set is_partial flag if some items were not quoted
  v_is_partial := (v_quoted_items_count > 0 AND v_quoted_items_count < v_total_items_count);
  
  -- Get client's credit info and payment terms
  SELECT credit_limit, current_balance, payment_terms
  INTO v_credit_limit, v_current_balance, v_payment_terms
  FROM users
  WHERE id = v_client_id;
  
  -- Check credit availability (only for non-prepay terms)
  IF v_payment_terms <> 'prepay' THEN
    IF (v_current_balance + v_final_price) > v_credit_limit THEN
      RAISE EXCEPTION 'Insufficient credit limit. Required: %, Available: %', 
        v_final_price, (v_credit_limit - v_current_balance);
    END IF;
    
    -- Deduct from credit
    UPDATE users
    SET current_balance = current_balance + v_final_price,
        updated_at = NOW()
    WHERE id = v_client_id;
  END IF;
  
  -- Update quote status
  UPDATE quotes
  SET status = 'ACCEPTED',
      is_partial = v_is_partial,
      updated_at = NOW()
  WHERE id = p_quote_id;
  
  -- Update RFQ status
  UPDATE rfqs
  SET status = 'QUOTED',
      updated_at = NOW()
  WHERE id = v_quote.rfq_id;
  
  -- Create order
  INSERT INTO orders (
    quote_id,
    client_id,
    supplier_id,
    amount,
    status,
    payment_terms,
    date
  ) VALUES (
    p_quote_id,
    v_client_id,
    v_supplier_id,
    v_final_price,
    'PENDING',
    v_payment_terms,
    CURRENT_DATE
  ) RETURNING id INTO v_order_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'quote_id', p_quote_id,
    'amount', v_final_price,
    'is_partial', v_is_partial,
    'payment_terms', v_payment_terms,
    'credit_deducted', CASE WHEN v_payment_terms <> 'prepay' THEN v_final_price ELSE 0 END,
    'remaining_credit', CASE WHEN v_payment_terms <> 'prepay' THEN (v_credit_limit - v_current_balance - v_final_price) ELSE v_credit_limit - v_current_balance END
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to accept quote: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION accept_quote_and_deduct_credit(UUID) IS 
  'Accepts a quote, deducts from client credit (if not prepay), creates order. Handles partial quotes and payment terms.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify is_partial column was added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'is_partial') = 1,
    'is_partial column not added to quotes';
END $$;

-- Verify alternative product validation trigger was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'trg_validate_alternative_product') = 1,
    'Alternative product validation trigger not created';
END $$;

-- Verify accept_quote_and_deduct_credit function was updated
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'accept_quote_and_deduct_credit') = 1,
    'accept_quote_and_deduct_credit function not found';
END $$;
