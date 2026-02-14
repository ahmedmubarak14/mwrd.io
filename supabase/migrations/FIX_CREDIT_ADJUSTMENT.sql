-- ============================================================================
-- EMERGENCY FIX: Credit Limit Adjustment Function
-- This fixes the "column reference 'id' is ambiguous" error
-- ============================================================================

-- Drop the existing function completely
DROP FUNCTION IF EXISTS public.admin_adjust_client_credit_limit(UUID, TEXT, DECIMAL, TEXT);

-- Recreate with ALL column references fully qualified
CREATE FUNCTION public.admin_adjust_client_credit_limit(
  p_target_client_id UUID,
  p_adjustment_type TEXT,
  p_adjustment_amount DECIMAL(12, 2),
  p_adjustment_reason TEXT
)
RETURNS TABLE (
  adjustment_id UUID,
  adjustment_client_id UUID,
  adjustment_admin_id UUID,
  adjustment_type TEXT,
  adjustment_amount DECIMAL(12, 2),
  change_amount DECIMAL(12, 2),
  previous_limit DECIMAL(12, 2),
  new_limit DECIMAL(12, 2),
  reason TEXT,
  created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_role user_role;
  v_target_role user_role;
  v_previous_limit DECIMAL(12, 2);
  v_new_limit DECIMAL(12, 2);
  v_change_amount DECIMAL(12, 2);
  v_adjustment_type TEXT;
  v_reason TEXT;
BEGIN
  -- Verify admin role
  SELECT users.role
  INTO v_admin_role
  FROM public.users
  WHERE users.id = auth.uid();

  IF v_admin_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can adjust credit limits';
  END IF;

  -- Get target user info
  SELECT users.role, COALESCE(users.credit_limit, 0)
  INTO v_target_role, v_previous_limit
  FROM public.users
  WHERE users.id = p_target_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target_role IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'Credit limit adjustments are only allowed for clients';
  END IF;

  -- Validate adjustment type
  v_adjustment_type := UPPER(TRIM(COALESCE(p_adjustment_type, '')));
  IF v_adjustment_type NOT IN ('SET', 'INCREASE', 'DECREASE') THEN
    RAISE EXCEPTION 'Invalid adjustment type. Use SET, INCREASE, or DECREASE';
  END IF;

  IF p_adjustment_amount IS NULL OR p_adjustment_amount < 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be a non-negative number';
  END IF;

  IF v_adjustment_type IN ('INCREASE', 'DECREASE') AND p_adjustment_amount = 0 THEN
    RAISE EXCEPTION 'Increase/decrease amount must be greater than zero';
  END IF;

  -- Validate reason
  v_reason := TRIM(COALESCE(p_adjustment_reason, ''));
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

  -- Calculate new limit
  IF v_adjustment_type = 'SET' THEN
    v_new_limit := ROUND(p_adjustment_amount, 2);
  ELSIF v_adjustment_type = 'INCREASE' THEN
    v_new_limit := ROUND(v_previous_limit + p_adjustment_amount, 2);
  ELSE
    IF p_adjustment_amount > v_previous_limit THEN
      RAISE EXCEPTION 'Decrease amount exceeds current credit limit';
    END IF;
    v_new_limit := ROUND(v_previous_limit - p_adjustment_amount, 2);
  END IF;

  v_change_amount := ROUND(v_new_limit - v_previous_limit, 2);

  -- Update user's credit limit - FULLY QUALIFIED
  UPDATE public.users
  SET
    credit_limit = v_new_limit,
    updated_at = NOW()
  WHERE public.users.id = p_target_client_id;

  -- Insert audit record and return - RENAMED OUTPUT COLUMNS TO AVOID CONFLICT
  RETURN QUERY
  INSERT INTO public.credit_limit_adjustments (
    client_id,
    admin_id,
    adjustment_type,
    adjustment_amount,
    change_amount,
    previous_limit,
    new_limit,
    reason
  )
  VALUES (
    p_target_client_id,
    auth.uid(),
    v_adjustment_type,
    ROUND(p_adjustment_amount, 2),
    v_change_amount,
    v_previous_limit,
    v_new_limit,
    v_reason
  )
  RETURNING
    credit_limit_adjustments.id AS adjustment_id,
    credit_limit_adjustments.client_id AS adjustment_client_id,
    credit_limit_adjustments.admin_id AS adjustment_admin_id,
    credit_limit_adjustments.adjustment_type,
    credit_limit_adjustments.adjustment_amount,
    credit_limit_adjustments.change_amount,
    credit_limit_adjustments.previous_limit,
    credit_limit_adjustments.new_limit,
    credit_limit_adjustments.reason,
    credit_limit_adjustments.created_at;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.admin_adjust_client_credit_limit TO authenticated;
