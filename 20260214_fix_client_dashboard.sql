-- Migration to fix Client Dashboard and Admin Visibility
-- Created: 2026-02-14

-- 1. Fix Credit Increase Requests Table
CREATE TABLE IF NOT EXISTS credit_increase_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  requested_limit NUMERIC NOT NULL,
  current_limit NUMERIC NOT NULL,
  current_used NUMERIC NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE credit_increase_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Clients can view their own credit requests" ON credit_increase_requests;
DROP POLICY IF EXISTS "Clients can insert their own credit requests" ON credit_increase_requests;
DROP POLICY IF EXISTS "Admins can view all credit requests" ON credit_increase_requests;
DROP POLICY IF EXISTS "Admins can update credit requests" ON credit_increase_requests;

-- Create Policies
CREATE POLICY "Clients can view their own credit requests"
  ON credit_increase_requests FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can insert their own credit requests"
  ON credit_increase_requests FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Admins can view all credit requests"
  ON credit_increase_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

CREATE POLICY "Admins can update credit requests"
  ON credit_increase_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- 2. Fix RFQ Visibility for Admins
DROP POLICY IF EXISTS "Admins view all rfqs" ON rfqs;
CREATE POLICY "Admins view all rfqs"
  ON rfqs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- 3. Fix Quote Visibility
-- Admin needs to see all quotes
DROP POLICY IF EXISTS "Admins view all quotes" ON quotes;
CREATE POLICY "Admins view all quotes"
  ON quotes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'ADMIN'
    )
  );

-- Client needs to see quotes for their RFQs (Critical for Auto-Quotes)
DROP POLICY IF EXISTS "Clients view quotes for their RFQs" ON quotes;
CREATE POLICY "Clients view quotes for their RFQs"
  ON quotes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rfqs
      WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- 4. Fix PO Generation Permissions (if needed)
-- Ensure Clients can update their own orders (e.g. for PO upload status)
DROP POLICY IF EXISTS "Clients can update their own orders" ON orders;
CREATE POLICY "Clients can update their own orders"
  ON orders FOR UPDATE
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

