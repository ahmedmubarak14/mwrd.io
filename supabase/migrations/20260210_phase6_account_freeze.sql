-- =====================================================
-- Phase 6: Account Freeze Guards (Gap #22)
-- =====================================================

-- =====================================================
-- Add Freeze Columns to users Table
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'frozen_at'
  ) THEN
    ALTER TABLE users ADD COLUMN frozen_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'freeze_reason'
  ) THEN
    ALTER TABLE users ADD COLUMN freeze_reason TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'frozen_by'
  ) THEN
    ALTER TABLE users ADD COLUMN frozen_by UUID REFERENCES users(id);
  END IF;
END $$;

COMMENT ON COLUMN users.frozen_at IS 'Timestamp when account was frozen. NULL = active account.';
COMMENT ON COLUMN users.freeze_reason IS 'Admin-provided reason for account freeze.';
COMMENT ON COLUMN users.frozen_by IS 'Admin user who froze the account.';

-- =====================================================
-- RPC: Admin Freeze Account
-- =====================================================

CREATE OR REPLACE FUNCTION admin_freeze_account(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Freeze reason is required';
  END IF;
  
  -- Get user details
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if already frozen
  IF v_user.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is already frozen';
  END IF;
  
  -- Freeze account
  UPDATE users
  SET 
    frozen_at = NOW(),
    freeze_reason = p_reason,
    frozen_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Log to admin audit log (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_log') THEN
    INSERT INTO admin_audit_log (
      admin_id,
      action,
      target_type,
      target_id,
      details
    ) VALUES (
      auth.uid(),
      'FREEZE_ACCOUNT',
      'USER',
      p_user_id,
      jsonb_build_object(
        'user_email', v_user.email,
        'user_name', v_user.name,
        'reason', p_reason
      )
    );
  END IF;
  
  -- Optionally enqueue notification (if notification system is ready)
  BEGIN
    PERFORM enqueue_notification(
      p_user_id,
      'account_frozen',
      jsonb_build_object(
        'user_name', v_user.name,
        'freeze_reason', p_reason
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore notification errors, don't fail the freeze operation
      NULL;
  END;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'frozen_at', NOW(),
    'reason', p_reason
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to freeze account: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_freeze_account(UUID, TEXT) IS 
  'Freezes a user account, preventing RFQ creation and other actions. Logs to audit trail. Admin-only.';

-- =====================================================
-- RPC: Admin Unfreeze Account
-- =====================================================

CREATE OR REPLACE FUNCTION admin_unfreeze_account(p_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Get user details
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Check if frozen
  IF v_user.frozen_at IS NULL THEN
    RAISE EXCEPTION 'Account is not frozen';
  END IF;
  
  -- Unfreeze account
  UPDATE users
  SET 
    frozen_at = NULL,
    freeze_reason = NULL,
    frozen_by = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Log to admin audit log (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_log') THEN
    INSERT INTO admin_audit_log (
      admin_id,
      action,
      target_type,
      target_id,
      details
    ) VALUES (
      auth.uid(),
      'UNFREEZE_ACCOUNT',
      'USER',
      p_user_id,
      jsonb_build_object(
        'user_email', v_user.email,
        'user_name', v_user.name,
        'previous_freeze_reason', v_user.freeze_reason
      )
    );
  END IF;
  
  -- Optionally enqueue notification (if notification system is ready)
  BEGIN
    PERFORM enqueue_notification(
      p_user_id,
      'account_unfrozen',
      jsonb_build_object(
        'user_name', v_user.name
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore notification errors
      NULL;
  END;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'unfrozen_at', NOW()
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to unfreeze account: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_unfreeze_account(UUID) IS 
  'Unfreezes a user account, restoring full access. Logs to audit trail. Admin-only.';

-- =====================================================
-- Update create_rfq_with_items RPC to Check Freeze Status
-- =====================================================

-- Note: This assumes create_rfq_with_items exists. We'll create a wrapper or update it.
-- Since we don't have the full original function, we'll create a helper function
-- that can be called at the start of create_rfq_with_items

CREATE OR REPLACE FUNCTION check_account_not_frozen(p_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_frozen_at TIMESTAMPTZ;
  v_freeze_reason TEXT;
BEGIN
  SELECT frozen_at, freeze_reason
  INTO v_frozen_at, v_freeze_reason
  FROM users
  WHERE id = p_user_id;
  
  IF v_frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is frozen. Reason: %. Contact support for assistance.', 
      COALESCE(v_freeze_reason, 'No reason provided');
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_account_not_frozen(UUID) IS 
  'Helper function to check if account is frozen. Raises exception if frozen. Call at start of create_rfq_with_items.';

-- =====================================================
-- Example: Update create_rfq_with_items (if it exists)
-- =====================================================

-- This is a placeholder showing where to add the freeze check
-- The actual create_rfq_with_items function should call check_account_not_frozen(p_client_id)
-- at the beginning of the function, right after authorization checks

/*
CREATE OR REPLACE FUNCTION create_rfq_with_items(...)
RETURNS ...
AS $$
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- NEW: Check account not frozen
  PERFORM check_account_not_frozen(auth.uid());
  
  -- Rest of function logic...
END;
$$ LANGUAGE plpgsql;
*/

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify columns were added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('frozen_at', 'freeze_reason', 'frozen_by')) = 3,
    'Not all freeze columns added to users';
END $$;

-- Verify RPCs were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_freeze_account') = 1,
    'admin_freeze_account function not created';
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_unfreeze_account') = 1,
    'admin_unfreeze_account function not created';
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'check_account_not_frozen') = 1,
    'check_account_not_frozen function not created';
END $$;

-- =====================================================
-- Implementation Note
-- =====================================================

/*
IMPORTANT: To complete Gap #22, you must update the existing create_rfq_with_items function
to call check_account_not_frozen(p_client_id) at the beginning.

Add this line after the authorization check:
  PERFORM check_account_not_frozen(p_client_id);

This will prevent frozen accounts from creating new RFQs.
*/
