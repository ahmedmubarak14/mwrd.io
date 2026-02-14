-- =====================================================
-- Phase 5: Notification Infrastructure (Gap #15)
-- =====================================================

-- =====================================================
-- Create notification_templates Table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL UNIQUE,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_templates IS 
  'Email notification templates with variable placeholders like {{variable_name}}.';

-- =====================================================
-- Create notification_queue Table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  template_id UUID REFERENCES notification_templates(id),
  variables JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_queue IS 
  'Queue for pending email notifications. Processed by Edge Function or external service.';

-- =====================================================
-- Create notification_log Table
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES notification_queue(id),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notification_log IS 
  'Audit log for all notifications sent. Used for tracking and debugging.';

-- =====================================================
-- Create Indexes
-- =====================================================

-- notification_templates indexes
CREATE INDEX IF NOT EXISTS idx_notification_templates_event_type ON notification_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);

-- notification_queue indexes
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient_user_id ON notification_queue(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_event_type ON notification_queue(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_queue_created_at ON notification_queue(created_at DESC);

-- notification_log indexes
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_event_type ON notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at DESC);

-- =====================================================
-- Create updated_at Trigger for notification_templates
-- =====================================================

CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_notification_templates_updated_at ON notification_templates;

CREATE TRIGGER trg_update_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_templates_updated_at();

-- =====================================================
-- Seed Notification Templates
-- =====================================================

INSERT INTO notification_templates (event_type, subject_template, body_template, is_active) VALUES
  ('interest_form_submitted', 
   'New Interest Form Submission', 
   '<p>A new interest form has been submitted.</p><p><strong>Name:</strong> {{name}}</p><p><strong>Email:</strong> {{email}}</p><p><strong>Company:</strong> {{company}}</p>',
   TRUE),
  
  ('account_created', 
   'Welcome to MWRD - Account Created', 
   '<p>Hello {{name}},</p><p>Your MWRD account has been created successfully.</p><p><strong>Email:</strong> {{email}}</p><p><strong>Role:</strong> {{role}}</p><p>Please wait for admin approval to access the platform.</p>',
   TRUE),
  
  ('new_product_request', 
   'New Product Submitted for Review', 
   '<p>Hello {{supplier_name}},</p><p>Your product <strong>{{product_name}}</strong> has been submitted for admin review.</p><p>You will be notified once the review is complete.</p>',
   TRUE),
  
  ('product_approved', 
   'Product Approved', 
   '<p>Hello {{supplier_name}},</p><p>Congratulations! Your product <strong>{{product_name}}</strong> has been approved and is now live in the catalog.</p>',
   TRUE),
  
  ('product_rejected', 
   'Product Rejected', 
   '<p>Hello {{supplier_name}},</p><p>Your product <strong>{{product_name}}</strong> has been rejected.</p><p><strong>Reason:</strong> {{rejection_reason}}</p>',
   TRUE),
  
  ('rfq_submitted', 
   'RFQ Submitted Successfully', 
   '<p>Hello {{client_name}},</p><p>Your RFQ #{{rfq_number}} has been submitted successfully.</p><p><strong>Items:</strong> {{item_count}}</p><p>We will notify you when quotes are received.</p>',
   TRUE),
  
  ('auto_quote_generated', 
   'Auto-Quote Generated for Your RFQ', 
   '<p>Hello {{client_name}},</p><p>An automatic quote has been generated for your RFQ #{{rfq_number}}.</p><p><strong>Total:</strong> {{total_amount}} SAR</p><p>Please review and accept in your portal.</p>',
   TRUE),
  
  ('quote_received', 
   'New Quote Received', 
   '<p>Hello {{client_name}},</p><p>You have received a new quote for RFQ #{{rfq_number}}.</p><p><strong>Supplier:</strong> {{supplier_public_id}}</p><p><strong>Amount:</strong> {{quote_amount}} SAR</p><p>Please review in your portal.</p>',
   TRUE),
  
  ('quote_accepted', 
   'Quote Accepted - Order Created', 
   '<p>Hello {{supplier_name}},</p><p>Your quote for RFQ #{{rfq_number}} has been accepted!</p><p><strong>Order ID:</strong> {{order_id}}</p><p><strong>Amount:</strong> {{order_amount}} SAR</p><p>Please prepare the order for fulfillment.</p>',
   TRUE),
  
  ('quote_rejected', 
   'Quote Not Accepted', 
   '<p>Hello {{supplier_name}},</p><p>Your quote for RFQ #{{rfq_number}} was not accepted.</p><p>Thank you for your submission.</p>',
   TRUE),
  
  ('order_ready_for_pickup', 
   'Order Ready for Pickup', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} is ready for pickup.</p><p><strong>Pickup Location:</strong> {{pickup_location}}</p><p>Please schedule your pickup.</p>',
   TRUE),
  
  ('pickup_scheduled', 
   'Pickup Scheduled', 
   '<p>Hello {{client_name}},</p><p>Pickup has been scheduled for Order #{{order_id}}.</p><p><strong>Date:</strong> {{pickup_date}}</p><p><strong>Time:</strong> {{pickup_time}}</p>',
   TRUE),
  
  ('order_picked_up', 
   'Order Picked Up', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} has been picked up successfully.</p><p>Thank you for your business!</p>',
   TRUE),
  
  ('order_in_transit', 
   'Order In Transit', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} is now in transit.</p><p><strong>Tracking Number:</strong> {{tracking_number}}</p><p><strong>Estimated Delivery:</strong> {{estimated_delivery}}</p>',
   TRUE),
  
  ('order_delivered', 
   'Order Delivered', 
   '<p>Hello {{client_name}},</p><p>Order #{{order_id}} has been delivered.</p><p>Please rate your experience with this supplier.</p>',
   TRUE),
  
  ('review_submitted', 
   'New Review Received', 
   '<p>Hello {{supplier_name}},</p><p>You have received a new {{rating}}-star review.</p><p><strong>Comment:</strong> {{comment}}</p><p><strong>Your new average rating:</strong> {{new_avg_rating}}</p>',
   TRUE),
  
  ('payment_reminder', 
   'Payment Reminder', 
   '<p>Hello {{client_name}},</p><p>This is a reminder that payment for Order #{{order_id}} is due.</p><p><strong>Amount:</strong> {{amount}} SAR</p><p><strong>Due Date:</strong> {{due_date}}</p>',
   TRUE),
  
  ('payment_processed', 
   'Payment Processed', 
   '<p>Hello {{client_name}},</p><p>Your payment for Order #{{order_id}} has been processed successfully.</p><p><strong>Amount:</strong> {{amount}} SAR</p><p><strong>Payment Method:</strong> {{payment_method}}</p>',
   TRUE),
  
  ('account_frozen', 
   'Account Frozen', 
   '<p>Hello {{user_name}},</p><p>Your account has been frozen.</p><p><strong>Reason:</strong> {{freeze_reason}}</p><p>Please contact support for assistance.</p>',
   TRUE),
  
  ('account_unfrozen', 
   'Account Reactivated', 
   '<p>Hello {{user_name}},</p><p>Your account has been reactivated and is now active.</p><p>You can now access all platform features.</p>',
   TRUE)
ON CONFLICT (event_type) DO NOTHING;

-- =====================================================
-- Enable RLS on All Tables
-- =====================================================

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for notification_templates
-- =====================================================

-- Policy: Admins can view all templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_templates' 
    AND policyname = 'Admins can view all templates'
  ) THEN
    CREATE POLICY "Admins can view all templates" ON notification_templates
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can modify templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_templates' 
    AND policyname = 'Admins can modify templates'
  ) THEN
    CREATE POLICY "Admins can modify templates" ON notification_templates
    FOR ALL
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RLS Policies for notification_queue
-- =====================================================

-- Policy: Admins can view all queue items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_queue' 
    AND policyname = 'Admins can view all queue items'
  ) THEN
    CREATE POLICY "Admins can view all queue items" ON notification_queue
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can modify queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_queue' 
    AND policyname = 'Admins can modify queue'
  ) THEN
    CREATE POLICY "Admins can modify queue" ON notification_queue
    FOR ALL
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RLS Policies for notification_log
-- =====================================================

-- Policy: Users can view their own notification log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_log' 
    AND policyname = 'Users can view own notification log'
  ) THEN
    CREATE POLICY "Users can view own notification log" ON notification_log
    FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Policy: Admins can view all logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notification_log' 
    AND policyname = 'Admins can view all logs'
  ) THEN
    CREATE POLICY "Admins can view all logs" ON notification_log
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Enqueue Notification
-- =====================================================

CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id UUID,
  p_event_type TEXT,
  p_variables JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template RECORD;
  v_user RECORD;
  v_queue_id UUID;
BEGIN
  -- Get template by event_type
  SELECT * INTO v_template
  FROM notification_templates
  WHERE event_type = p_event_type AND is_active = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active template found for event_type: %', p_event_type;
  END IF;
  
  -- Get user email
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
  
  -- Insert into queue
  INSERT INTO notification_queue (
    recipient_user_id,
    recipient_email,
    event_type,
    template_id,
    variables
  ) VALUES (
    p_user_id,
    v_user.email,
    p_event_type,
    v_template.id,
    p_variables
  ) RETURNING id INTO v_queue_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'event_type', p_event_type,
    'recipient_email', v_user.email
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to enqueue notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enqueue_notification(UUID, TEXT, JSONB) IS 
  'Enqueues a notification for sending. Looks up template and user email automatically.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify tables were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('notification_templates', 'notification_queue', 'notification_log')) = 3,
    'Not all notification tables created';
END $$;

-- Verify templates were seeded
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM notification_templates) >= 20,
    'Notification templates not seeded';
END $$;

-- Verify RLS is enabled on all tables
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_class WHERE relname IN ('notification_templates', 'notification_queue', 'notification_log') AND relrowsecurity = TRUE) = 3,
    'RLS not enabled on all notification tables';
END $$;

-- Verify enqueue_notification function was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'enqueue_notification') = 1,
    'enqueue_notification function not created';
END $$;
