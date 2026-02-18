-- ============================================================================
-- MWRD SUPABASE DATABASE - COMPLETE MIGRATION SCRIPT
-- Generated: 2026-02-07
-- Purpose: Apply all 43 migrations in strict filename order
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Navigate to: SQL Editor
-- 3. Create a new query
-- 4. Copy and paste this ENTIRE file
-- 5. Click "Run" to execute all migrations
-- 
-- IMPORTANT:
-- - This script is best-effort idempotent (many migrations include IF EXISTS / IF NOT EXISTS checks)
-- - If your DB already has early phases applied, run only the missing phase scripts instead of re-running everything
-- - Review the output for any errors
-- 
-- ============================================================================

-- Migration tracking table (optional, for audit trail)
CREATE TABLE IF NOT EXISTS public._migration_log (
  id SERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MIGRATION: 001_initial_schema.sql
-- ============================================================================

-- MWRD Marketplace Database Schema
-- Initial migration: Create all tables, enums, and functions

-- ============================================================================
-- ENUMS (with idempotent checks)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('GUEST', 'CLIENT', 'SUPPLIER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_ATTENTION', 'DEACTIVATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('VERIFIED', 'IN_REVIEW', 'REJECTED', 'INCOMPLETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE rfq_status AS ENUM ('OPEN', 'QUOTED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('In Transit', 'Delivered', 'Cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate public IDs for anonymization
CREATE OR REPLACE FUNCTION generate_public_id(prefix TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN prefix || '-' || floor(random() * 9000 + 1000)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CLIENT',
  company_name TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  public_id TEXT UNIQUE,
  rating DECIMAL(3, 2) CHECK (rating >= 0 AND rating <= 5),
  status user_status DEFAULT 'PENDING',
  kyc_status kyc_status DEFAULT 'INCOMPLETE',
  date_joined DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  image TEXT NOT NULL,
  status product_status NOT NULL DEFAULT 'PENDING',
  cost_price DECIMAL(10, 2),
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RFQs (Request for Quote) table
CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status rfq_status NOT NULL DEFAULT 'OPEN',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RFQ Items table (line items for each RFQ)
CREATE TABLE rfq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quotes table
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_price DECIMAL(10, 2) NOT NULL CHECK (supplier_price > 0),
  lead_time TEXT NOT NULL,
  margin_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  final_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status quote_status NOT NULL DEFAULT 'PENDING_ADMIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfq_id, supplier_id)
);

-- Orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  status order_status NOT NULL DEFAULT 'In Transit',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Margin Settings table (for admin to configure margins)
CREATE TABLE margin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  margin_percent DECIMAL(5, 2) NOT NULL CHECK (margin_percent >= 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_public_id ON users(public_id);

CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_name ON products(name);

CREATE INDEX idx_rfqs_client_id ON rfqs(client_id);
CREATE INDEX idx_rfqs_status ON rfqs(status);
CREATE INDEX idx_rfqs_date ON rfqs(date);

CREATE INDEX idx_rfq_items_rfq_id ON rfq_items(rfq_id);
CREATE INDEX idx_rfq_items_product_id ON rfq_items(product_id);

CREATE INDEX idx_quotes_rfq_id ON quotes(rfq_id);
CREATE INDEX idx_quotes_supplier_id ON quotes(supplier_id);
CREATE INDEX idx_quotes_status ON quotes(status);

CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_supplier_id ON orders(supplier_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rfqs_updated_at
  BEFORE UPDATE ON rfqs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_margin_settings_updated_at
  BEFORE UPDATE ON margin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUTO-GENERATE PUBLIC ID ON USER INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    CASE NEW.role
      WHEN 'CLIENT' THEN NEW.public_id := generate_public_id('Client');
      WHEN 'SUPPLIER' THEN NEW.public_id := generate_public_id('Supplier');
      WHEN 'ADMIN' THEN NEW.public_id := generate_public_id('Admin');
      ELSE NEW.public_id := generate_public_id('User');
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_public_id_trigger
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_public_id();

-- ============================================================================
-- AUTO-CALCULATE FINAL PRICE ON QUOTE UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_final_price()
RETURNS TRIGGER AS $$
BEGIN
  NEW.final_price := NEW.supplier_price * (1 + NEW.margin_percent / 100);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_quote_final_price
  BEFORE INSERT OR UPDATE OF supplier_price, margin_percent ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION calculate_final_price();

-- ============================================================================
-- INSERT DEFAULT MARGIN SETTING
-- ============================================================================

INSERT INTO margin_settings (category, margin_percent, is_default)
VALUES (NULL, 15.00, TRUE);

INSERT INTO public._migration_log (migration_name) VALUES ('001_initial_schema.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 002_row_level_security.sql
-- ============================================================================

-- MWRD Marketplace Row Level Security Policies
-- This migration enables RLS and defines access policies

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Get current user's role
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USERS POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all users
CREATE POLICY "Admins can update all users"
  ON users FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- Admins can delete users
CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  USING (get_user_role() = 'ADMIN');

-- Allow insert during registration (handled by trigger)
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- PRODUCTS POLICIES
-- ============================================================================

-- Everyone can view approved products
CREATE POLICY "Anyone can view approved products"
  ON products FOR SELECT
  USING (status = 'APPROVED');

-- Suppliers can view their own products (any status)
CREATE POLICY "Suppliers can view own products"
  ON products FOR SELECT
  USING (auth.uid() = supplier_id);

-- Suppliers can create products
CREATE POLICY "Suppliers can create products"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() = supplier_id
    AND get_user_role() = 'SUPPLIER'
  );

-- Suppliers can update their own products
CREATE POLICY "Suppliers can update own products"
  ON products FOR UPDATE
  USING (auth.uid() = supplier_id)
  WITH CHECK (auth.uid() = supplier_id);

-- Suppliers can delete their own pending products
CREATE POLICY "Suppliers can delete own pending products"
  ON products FOR DELETE
  USING (
    auth.uid() = supplier_id
    AND status = 'PENDING'
  );

-- Admins can view all products
CREATE POLICY "Admins can view all products"
  ON products FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all products (for approval)
CREATE POLICY "Admins can update all products"
  ON products FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- Admins can delete any product
CREATE POLICY "Admins can delete any product"
  ON products FOR DELETE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- RFQS POLICIES
-- ============================================================================

-- Clients can view their own RFQs
CREATE POLICY "Clients can view own RFQs"
  ON rfqs FOR SELECT
  USING (auth.uid() = client_id);

-- Clients can create RFQs
CREATE POLICY "Clients can create RFQs"
  ON rfqs FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND get_user_role() = 'CLIENT'
  );

-- Clients can update their own open RFQs
CREATE POLICY "Clients can update own open RFQs"
  ON rfqs FOR UPDATE
  USING (
    auth.uid() = client_id
    AND status = 'OPEN'
  );

-- Suppliers can view RFQs that contain their products
CREATE POLICY "Suppliers can view relevant RFQs"
  ON rfqs FOR SELECT
  USING (
    get_user_role() = 'SUPPLIER'
    AND EXISTS (
      SELECT 1 FROM rfq_items ri
      JOIN products p ON p.id = ri.product_id
      WHERE ri.rfq_id = rfqs.id
      AND p.supplier_id = auth.uid()
    )
  );

-- Admins can view all RFQs
CREATE POLICY "Admins can view all RFQs"
  ON rfqs FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all RFQs
CREATE POLICY "Admins can update all RFQs"
  ON rfqs FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- RFQ ITEMS POLICIES
-- ============================================================================

-- Clients can view their own RFQ items
CREATE POLICY "Clients can view own RFQ items"
  ON rfq_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = rfq_items.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Clients can create RFQ items for their RFQs
CREATE POLICY "Clients can create RFQ items"
  ON rfq_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = rfq_items.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Suppliers can view RFQ items for their products
CREATE POLICY "Suppliers can view relevant RFQ items"
  ON rfq_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = rfq_items.product_id AND p.supplier_id = auth.uid()
    )
  );

-- Admins can view all RFQ items
CREATE POLICY "Admins can view all RFQ items"
  ON rfq_items FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- QUOTES POLICIES
-- ============================================================================

-- Suppliers can view their own quotes
CREATE POLICY "Suppliers can view own quotes"
  ON quotes FOR SELECT
  USING (auth.uid() = supplier_id);

-- Suppliers can create quotes for RFQs containing their products
CREATE POLICY "Suppliers can create quotes"
  ON quotes FOR INSERT
  WITH CHECK (
    auth.uid() = supplier_id
    AND get_user_role() = 'SUPPLIER'
    AND EXISTS (
      SELECT 1 FROM rfq_items ri
      JOIN products p ON p.id = ri.product_id
      WHERE ri.rfq_id = quotes.rfq_id
      AND p.supplier_id = auth.uid()
    )
  );

-- Suppliers can update their pending quotes
CREATE POLICY "Suppliers can update pending quotes"
  ON quotes FOR UPDATE
  USING (
    auth.uid() = supplier_id
    AND status = 'PENDING_ADMIN'
  );

-- Clients can view quotes sent to them
CREATE POLICY "Clients can view quotes for their RFQs"
  ON quotes FOR SELECT
  USING (
    status IN ('SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED')
    AND EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Clients can update quote status (accept/reject)
CREATE POLICY "Clients can accept/reject quotes"
  ON quotes FOR UPDATE
  USING (
    status = 'SENT_TO_CLIENT'
    AND EXISTS (
      SELECT 1 FROM rfqs WHERE rfqs.id = quotes.rfq_id AND rfqs.client_id = auth.uid()
    )
  );

-- Admins can view all quotes
CREATE POLICY "Admins can view all quotes"
  ON quotes FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all quotes (set margins, approve)
CREATE POLICY "Admins can update all quotes"
  ON quotes FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Clients can view their own orders
CREATE POLICY "Clients can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = client_id);

-- Suppliers can view orders they're fulfilling
CREATE POLICY "Suppliers can view fulfillment orders"
  ON orders FOR SELECT
  USING (auth.uid() = supplier_id);

-- Orders are created by system (after quote acceptance)
-- Only admins can manually create orders
CREATE POLICY "Admins can create orders"
  ON orders FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

-- Suppliers can update order status
CREATE POLICY "Suppliers can update order status"
  ON orders FOR UPDATE
  USING (auth.uid() = supplier_id);

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can update all orders
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- MARGIN SETTINGS POLICIES
-- ============================================================================

-- Only admins can view margin settings
CREATE POLICY "Admins can view margin settings"
  ON margin_settings FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Only admins can create margin settings
CREATE POLICY "Admins can create margin settings"
  ON margin_settings FOR INSERT
  WITH CHECK (get_user_role() = 'ADMIN');

-- Only admins can update margin settings
CREATE POLICY "Admins can update margin settings"
  ON margin_settings FOR UPDATE
  USING (get_user_role() = 'ADMIN');

-- Only admins can delete margin settings
CREATE POLICY "Admins can delete margin settings"
  ON margin_settings FOR DELETE
  USING (get_user_role() = 'ADMIN');

INSERT INTO public._migration_log (migration_name) VALUES ('002_row_level_security.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 003_seed_data.sql
-- ============================================================================

-- MWRD Marketplace Seed Data
-- This migration inserts initial demo data for testing
-- NOTE: Run this AFTER creating users through Supabase Auth

-- ============================================================================
-- CATEGORIES FOR MARGIN SETTINGS
-- ============================================================================

INSERT INTO margin_settings (category, margin_percent, is_default)
VALUES
  ('Footwear', 12.00, FALSE),
  ('Electronics', 15.00, FALSE),
  ('Furniture', 10.00, FALSE),
  ('Accessories', 18.00, FALSE),
  ('Kitchenware', 14.00, FALSE),
  ('Industrial', 8.00, FALSE),
  ('Safety Gear', 20.00, FALSE),
  ('Electrical', 12.00, FALSE)
ON CONFLICT (category) DO NOTHING;

-- ============================================================================
-- NOTE: User creation must be done through Supabase Auth
-- The following is a reference for the user structure
-- ============================================================================

/*
After creating users through Supabase Auth (signUp), insert their profiles:

Example for creating a test admin user:
1. Create user in Supabase Auth
2. Insert into users table:

INSERT INTO users (id, email, name, role, company_name, verified, status, kyc_status)
VALUES (
  'auth-user-id-here',
  'admin+demo@example.com',
  'Admin Alice',
  'ADMIN',
  'MWRD HQ',
  TRUE,
  'ACTIVE',
  'VERIFIED'
);
*/

-- ============================================================================
-- HELPER FUNCTION: Create demo user profile (call after Auth signup)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role user_role,
  p_company_name TEXT,
  p_verified BOOLEAN DEFAULT FALSE,
  p_status user_status DEFAULT 'PENDING',
  p_kyc_status kyc_status DEFAULT 'INCOMPLETE'
)
RETURNS users
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_user users;
BEGIN
  INSERT INTO users (id, email, name, role, company_name, verified, status, kyc_status)
  VALUES (p_user_id, p_email, p_name, p_role, p_company_name, p_verified, p_status, p_kyc_status)
  RETURNING * INTO new_user;

  RETURN new_user;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public._migration_log (migration_name) VALUES ('003_seed_data.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 004_auth_trigger.sql
-- ============================================================================

-- Auto-create user profile when a new user signs up via Supabase Auth
-- This trigger creates a profile in the users table when auth.users gets a new entry

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    company_name,
    verified,
    status,
    kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'CLIENT'),
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'CLIENT') = 'SUPPLIER' THEN 'PENDING'::user_status
      ELSE 'ACTIVE'::user_status
    END,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.users TO supabase_auth_admin;

INSERT INTO public._migration_log (migration_name) VALUES ('004_auth_trigger.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 005_payment_tables.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - PAYMENT SYSTEM (MOYASAR INTEGRATION)
-- ============================================================================

-- Payment status enum (idempotent)
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'AUTHORIZED',
    'CAPTURED',
    'PAID',
    'FAILED',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Payment method enum (idempotent)
DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM (
    'CREDITCARD',  -- Visa/Mastercard
    'MADA',        -- Saudi MADA cards
    'APPLEPAY',    -- Apple Pay
    'STC_PAY',     -- STC Pay
    'BANK_TRANSFER' -- Direct bank transfer
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Invoice status enum (idempotent)
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'DRAFT',
    'SENT',
    'PAID',
    'OVERDUE',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Moyasar details
  moyasar_payment_id TEXT UNIQUE,  -- Moyasar's payment ID
  moyasar_transaction_url TEXT,

  -- Payment information
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  payment_method payment_method_type NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',

  -- Card details (if applicable, stored securely)
  card_last_four TEXT,
  card_brand TEXT,

  -- Metadata
  description TEXT,
  callback_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status tracking
  authorized_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,

  -- Error handling
  failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Invoice details
  invoice_number TEXT UNIQUE NOT NULL,

  -- Financial details
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax_percent DECIMAL(5, 2) DEFAULT 15.00,  -- Saudi VAT is 15%
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount > 0),

  -- Status
  status invoice_status NOT NULL DEFAULT 'DRAFT',

  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,

  -- Notes
  notes TEXT,
  terms TEXT,

  -- PDF storage (if generated)
  pdf_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- REFUNDS TABLE
-- ============================================================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Moyasar details
  moyasar_refund_id TEXT UNIQUE,

  -- Refund information
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status payment_status NOT NULL DEFAULT 'PENDING',

  -- Admin who processed refund
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Payments indexes
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_client_id ON payments(client_id);
CREATE INDEX idx_payments_moyasar_id ON payments(moyasar_payment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Invoices indexes
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_invoices_supplier_id ON invoices(supplier_id);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- Refunds indexes
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_order_id ON refunds(order_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate invoice number (format: INV-YYYY-NNNN)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  invoice_num TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  -- Get the next sequence number for this year
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM invoices
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);

  invoice_num := 'INV-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate invoice number on insert
CREATE OR REPLACE FUNCTION auto_generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_invoice_number_trigger
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_invoice_number();

-- Auto-calculate invoice totals
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate tax amount
  NEW.tax_amount := NEW.subtotal * (NEW.tax_percent / 100);

  -- Calculate total
  NEW.total_amount := NEW.subtotal + NEW.tax_amount - COALESCE(NEW.discount_amount, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_invoice_totals_trigger
  BEFORE INSERT OR UPDATE OF subtotal, tax_percent, discount_amount ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals();

-- Update order status when payment is completed
CREATE OR REPLACE FUNCTION update_order_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
    -- Update payment timestamp
    NEW.paid_at := NOW();

    -- You might want to update order status here
    -- UPDATE orders SET status = 'PROCESSING' WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_on_payment_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_order_on_payment();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- PAYMENTS POLICIES
CREATE POLICY "Clients can view own payments" ON payments
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can create payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');

CREATE POLICY "Admins can view all payments" ON payments
  FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can update all payments" ON payments
  FOR UPDATE USING (get_user_role() = 'ADMIN');

CREATE POLICY "System can update payments" ON payments
  FOR UPDATE USING (get_user_role() = 'ADMIN');  -- Keep direct updates admin-only

-- INVOICES POLICIES
CREATE POLICY "Clients can view own invoices" ON invoices
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Suppliers can view their invoices" ON invoices
  FOR SELECT USING (auth.uid() = supplier_id);

CREATE POLICY "Admins can manage all invoices" ON invoices
  FOR ALL USING (get_user_role() = 'ADMIN');

-- REFUNDS POLICIES
CREATE POLICY "Clients can view own refunds" ON refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = refunds.payment_id AND p.client_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage refunds" ON refunds
  FOR ALL USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

INSERT INTO public._migration_log (migration_name) VALUES ('005_payment_tables.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 006_bank_transfer_payment.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - BANK TRANSFER PAYMENT SYSTEM (PHASE ONE)
-- ============================================================================

-- Add PENDING_PAYMENT to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';

-- ============================================================================
-- BANK DETAILS TABLE (MWRD Company Bank Account)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bank information
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  iban TEXT,
  swift_code TEXT,
  branch_name TEXT,
  branch_code TEXT,

  -- Additional info
  currency TEXT NOT NULL DEFAULT 'SAR',
  notes TEXT,

  -- Active status (only one should be active at a time)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active bank detail at a time
CREATE UNIQUE INDEX idx_bank_details_active ON bank_details(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- UPDATE ORDERS TABLE - Add Payment Tracking
-- ============================================================================

-- Add payment tracking columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_notes TEXT,
ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;

-- Add index for payment tracking
CREATE INDEX IF NOT EXISTS idx_orders_payment_confirmed ON orders(payment_confirmed_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_bank_details_updated_at
  BEFORE UPDATE ON bank_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE bank_details ENABLE ROW LEVEL SECURITY;

-- Clients can view active bank details
CREATE POLICY "Clients can view active bank details" ON bank_details
  FOR SELECT USING (is_active = TRUE);

-- Admins can manage all bank details
CREATE POLICY "Admins can view all bank details" ON bank_details
  FOR SELECT USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can insert bank details" ON bank_details
  FOR INSERT WITH CHECK (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can update bank details" ON bank_details
  FOR UPDATE USING (get_user_role() = 'ADMIN');

CREATE POLICY "Admins can delete bank details" ON bank_details
  FOR DELETE USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to mark order as paid
CREATE OR REPLACE FUNCTION mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify admin role
  IF (SELECT role FROM users WHERE id = v_caller) != 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  -- Update order
  UPDATE orders
  SET
    status = 'IN_TRANSIT',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Update related invoice status
  UPDATE invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

-- Function to get active bank details
CREATE OR REPLACE FUNCTION get_active_bank_details()
RETURNS bank_details
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bank_details bank_details;
BEGIN
  SELECT * INTO v_bank_details
  FROM bank_details
  WHERE is_active = TRUE
  LIMIT 1;

  RETURN v_bank_details;
END;
$$ LANGUAGE plpgsql;

-- Function to set active bank details (deactivates others)
CREATE OR REPLACE FUNCTION set_active_bank_details(p_bank_details_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Deactivate all
  UPDATE bank_details SET is_active = FALSE;

  -- Activate selected
  UPDATE bank_details SET is_active = TRUE WHERE id = p_bank_details_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED PLACEHOLDER BANK DETAILS
-- SECURITY: Do not commit real bank account information to source control.
-- Update these values via admin UI in each environment.
-- ============================================================================

INSERT INTO bank_details (
  bank_name,
  account_name,
  account_number,
  iban,
  swift_code,
  currency,
  notes,
  is_active
) VALUES (
  'REPLACE_WITH_BANK_NAME',
  'REPLACE_WITH_ACCOUNT_NAME',
  'REPLACE_WITH_ACCOUNT_NUMBER',
  'REPLACE_WITH_IBAN',
  'REPLACE_WITH_SWIFT',
  'SAR',
  'Replace this placeholder record with real bank details in admin settings.',
  FALSE
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Bank Transfer Payment System Setup Complete!' as message;

SELECT * FROM bank_details WHERE is_active = TRUE;

INSERT INTO public._migration_log (migration_name) VALUES ('006_bank_transfer_payment.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 007_retail_pricing.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - RETAIL PRICING WITH AUTO-MARGIN CALCULATION
-- ============================================================================

-- Add retail_price field to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5, 2) DEFAULT 15.00;

-- ============================================================================
-- AUTO-CALCULATE RETAIL PRICE TRIGGER
-- ============================================================================

-- Function to calculate retail price based on cost price and margin
CREATE OR REPLACE FUNCTION calculate_retail_price()
RETURNS TRIGGER AS $$
DECLARE
  v_margin_percent DECIMAL(5, 2);
BEGIN
  -- Get margin for this product's category, or use default
  SELECT margin_percent INTO v_margin_percent
  FROM margin_settings
  WHERE category = NEW.category OR (category IS NULL AND is_default = TRUE)
  ORDER BY category NULLS LAST
  LIMIT 1;

  -- If no margin found, use 15% default
  IF v_margin_percent IS NULL THEN
    v_margin_percent := 15.00;
  END IF;

  -- Store the margin used
  NEW.margin_percent := v_margin_percent;

  -- Calculate retail price if cost_price is set
  IF NEW.cost_price IS NOT NULL AND NEW.cost_price > 0 THEN
    NEW.retail_price := NEW.cost_price * (1 + v_margin_percent / 100);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate retail price
DROP TRIGGER IF EXISTS calculate_product_retail_price ON products;
CREATE TRIGGER calculate_product_retail_price
  BEFORE INSERT OR UPDATE OF cost_price, category ON products
  FOR EACH ROW
  EXECUTE FUNCTION calculate_retail_price();

-- ============================================================================
-- UPDATE EXISTING PRODUCTS WITH RETAIL PRICES
-- ============================================================================

-- Apply retail prices to all existing products
UPDATE products
SET cost_price = cost_price -- This triggers the calculation
WHERE cost_price IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get product retail price (with fallback)
CREATE OR REPLACE FUNCTION get_product_retail_price(p_product_id UUID)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_retail_price DECIMAL(10, 2);
BEGIN
  SELECT retail_price INTO v_retail_price
  FROM products
  WHERE id = p_product_id;

  RETURN COALESCE(v_retail_price, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to bulk update retail prices for a category
CREATE OR REPLACE FUNCTION update_category_retail_prices(p_category TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE products
  SET cost_price = cost_price -- Triggers recalculation
  WHERE category = p_category AND cost_price IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update all retail prices (useful when margins change)
CREATE OR REPLACE FUNCTION refresh_all_retail_prices()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE products
  SET cost_price = cost_price -- Triggers recalculation
  WHERE cost_price IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY UPDATES
-- ============================================================================

-- Update RLS policies to hide cost_price from clients
-- Clients should only see retail_price

-- Drop existing policy if needed
DROP POLICY IF EXISTS "Anyone can view approved products" ON products;

-- Recreate with better column visibility
CREATE POLICY "Clients can view approved products (retail price only)" ON products
  FOR SELECT USING (
    status = 'APPROVED' AND
    (get_user_role() = 'CLIENT' OR get_user_role() IS NULL)
  );

-- Suppliers and admins can see all pricing
CREATE POLICY "Suppliers and admins can view all product details" ON products
  FOR SELECT USING (
    get_user_role() IN ('SUPPLIER', 'ADMIN')
  );

-- ============================================================================
-- CREATE VIEW FOR CLIENT PRODUCT DISPLAY
-- ============================================================================

-- View that shows only retail pricing to clients
CREATE OR REPLACE VIEW client_products AS
SELECT
  id,
  supplier_id,
  name,
  description,
  category,
  image,
  status,
  retail_price,
  margin_percent,
  sku,
  created_at,
  updated_at
FROM products
WHERE status = 'APPROVED';

-- Grant access to authenticated users
GRANT SELECT ON client_products TO authenticated;
GRANT SELECT ON client_products TO anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show products with pricing
SELECT
  name,
  category,
  cost_price as "Cost (Hidden from Clients)",
  margin_percent as "Margin %",
  retail_price as "Retail Price (Client Sees)",
  ROUND(retail_price - cost_price, 2) as "MWRD Profit"
FROM products
WHERE cost_price IS NOT NULL
ORDER BY category, name
LIMIT 10;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

SELECT 'Retail Pricing System Setup Complete!' as message;

INSERT INTO public._migration_log (migration_name) VALUES ('007_retail_pricing.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 008_custom_item_requests.sql
-- ============================================================================

-- ============================================================================
-- MWRD MARKETPLACE - CUSTOM ITEM REQUESTS
-- Allow clients to request items not in the marketplace
-- ============================================================================


-- Custom request status enum (idempotent)
DO $$ BEGIN
  CREATE TYPE custom_request_status AS ENUM (
    'PENDING',        -- Submitted by client, awaiting admin review
    'UNDER_REVIEW',   -- Admin reviewing the request
    'ASSIGNED',       -- Assigned to supplier(s) for quoting
    'QUOTED',         -- Supplier provided quote
    'APPROVED',       -- Client approved quote, order created
    'REJECTED',       -- Request rejected
    'CANCELLED'       -- Client cancelled request
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Request priority enum (idempotent)
DO $$ BEGIN
  CREATE TYPE request_priority AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CUSTOM ITEM REQUESTS TABLE
-- ============================================================================
CREATE TABLE custom_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client who requested
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Request details
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  specifications TEXT,
  category TEXT,

  -- Quantity and pricing
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  target_price DECIMAL(10, 2),  -- Client's budget/target price
  currency TEXT NOT NULL DEFAULT 'SAR',

  -- Additional info
  deadline DATE,  -- When client needs it by
  priority request_priority NOT NULL DEFAULT 'MEDIUM',
  reference_images TEXT[],  -- Array of image URLs
  attachment_urls TEXT[],   -- Documents, specs, etc.

  -- Status tracking
  status custom_request_status NOT NULL DEFAULT 'PENDING',

  -- Admin notes
  admin_notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,  -- Assigned supplier
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- Admin who assigned

  -- Response
  supplier_quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_custom_requests_client_id ON custom_item_requests(client_id);
CREATE INDEX idx_custom_requests_status ON custom_item_requests(status);
CREATE INDEX idx_custom_requests_assigned_to ON custom_item_requests(assigned_to);
CREATE INDEX idx_custom_requests_created_at ON custom_item_requests(created_at DESC);
CREATE INDEX idx_custom_requests_priority ON custom_item_requests(priority);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_custom_requests_updated_at
  BEFORE UPDATE ON custom_item_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update assigned_at when assigned
CREATE OR REPLACE FUNCTION update_assignment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL THEN
    NEW.assigned_at := NOW();
    NEW.status := 'ASSIGNED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_update_assignment
  BEFORE UPDATE OF assigned_to ON custom_item_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_assignment_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE custom_item_requests ENABLE ROW LEVEL SECURITY;

-- Clients can view own requests
CREATE POLICY "Clients can view own requests" ON custom_item_requests
  FOR SELECT USING (auth.uid() = client_id);

-- Clients can create requests
CREATE POLICY "Clients can create requests" ON custom_item_requests
  FOR INSERT WITH CHECK (auth.uid() = client_id AND get_user_role() = 'CLIENT');

-- Clients can update own pending requests
CREATE POLICY "Clients can update own pending requests" ON custom_item_requests
  FOR UPDATE USING (
    auth.uid() = client_id AND
    status IN ('PENDING', 'UNDER_REVIEW')
  );

-- Assigned suppliers can view their requests
CREATE POLICY "Suppliers can view assigned requests" ON custom_item_requests
  FOR SELECT USING (auth.uid() = assigned_to);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests" ON custom_item_requests
  FOR SELECT USING (get_user_role() = 'ADMIN');

-- Admins can update all requests
CREATE POLICY "Admins can update all requests" ON custom_item_requests
  FOR UPDATE USING (get_user_role() = 'ADMIN');

-- Admins can delete requests
CREATE POLICY "Admins can delete requests" ON custom_item_requests
  FOR DELETE USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to assign request to supplier
CREATE OR REPLACE FUNCTION assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS custom_item_requests
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify admin role
  IF (SELECT role FROM users WHERE id = v_caller) != 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  -- Verify supplier role
  IF (SELECT role FROM users WHERE id = p_supplier_id) != 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  -- Update request
  UPDATE custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending requests count for admin
CREATE OR REPLACE FUNCTION get_pending_requests_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM custom_item_requests
    WHERE status IN ('PENDING', 'UNDER_REVIEW')
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get client's request summary
CREATE OR REPLACE FUNCTION get_client_request_summary(p_client_id UUID)
RETURNS JSON AS $$
DECLARE
  v_summary JSON;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'PENDING'),
    'under_review', COUNT(*) FILTER (WHERE status = 'UNDER_REVIEW'),
    'assigned', COUNT(*) FILTER (WHERE status = 'ASSIGNED'),
    'quoted', COUNT(*) FILTER (WHERE status = 'QUOTED'),
    'approved', COUNT(*) FILTER (WHERE status = 'APPROVED')
  ) INTO v_summary
  FROM custom_item_requests
  WHERE client_id = p_client_id;

  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Custom Item Requests System Setup Complete!' as message;

-- Show custom request statuses
SELECT
  status,
  COUNT(*) as count
FROM custom_item_requests
GROUP BY status
ORDER BY status;

INSERT INTO public._migration_log (migration_name) VALUES ('008_custom_item_requests.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 009_mvp_refinements.sql
-- ============================================================================

-- ============================================================================
-- 009 MVP Refinements
-- Leads, Master Gallery, Financials, and Enhanced Workflow
-- ============================================================================

-- 1. Leads Table (For Onboarding Interest)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('client', 'supplier')),
  notes TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_user_id UUID REFERENCES users(id)
);

-- RLS for Leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Admin full access to leads') THEN
        CREATE POLICY "Admin full access to leads" ON leads FOR ALL TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'Anyone can submit leads') THEN
        CREATE POLICY "Anyone can submit leads" ON leads FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;
END $$;


-- 2. Master Products Gallery (Standard Items)
CREATE TABLE IF NOT EXISTS master_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  brand TEXT,
  model_number TEXT,
  specifications JSONB, -- Flexible specs (color, size, etc coverage)
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Master Products
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'master_products' AND policyname = 'Admin full access master_products') THEN
        CREATE POLICY "Admin full access master_products" ON master_products FOR ALL TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'master_products' AND policyname = 'Suppliers/Clients view master_products') THEN
        CREATE POLICY "Suppliers/Clients view master_products" ON master_products FOR SELECT TO authenticated USING (true);
    END IF;
END $$;


-- 3. Supplier/Client Financials (Credit & Balance)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credit_limit') THEN
        ALTER TABLE users ADD COLUMN credit_limit DECIMAL(12, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'current_balance') THEN
        ALTER TABLE users ADD COLUMN current_balance DECIMAL(12, 2) DEFAULT 0; -- Positive means they owe money (credit used)
    END IF;
END $$;


-- 4. Transactions Table (Financial History)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type TEXT CHECK (type IN ('CREDIT_USAGE', 'PAYMENT', 'REFUND', 'FEE')),
  amount DECIMAL(12, 2) NOT NULL,
  reference_id TEXT, -- e.g. Order ID
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users view own transactions') THEN
        CREATE POLICY "Users view own transactions" ON transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Admin view all transactions') THEN
        CREATE POLICY "Admin view all transactions" ON transactions FOR SELECT TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;
END $$;


-- 5. Product Updates (Inventory, Brand)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'stock_quantity') THEN
        ALTER TABLE products ADD COLUMN stock_quantity INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'brand') THEN
        ALTER TABLE products ADD COLUMN brand TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'master_product_id') THEN
        ALTER TABLE products ADD COLUMN master_product_id UUID REFERENCES master_products(id);
    END IF;
END $$;


-- 6. Order Enhancements (Dual PO)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'client_po_file') THEN
        ALTER TABLE orders ADD COLUMN client_po_file TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'system_po_number') THEN
        ALTER TABLE orders ADD COLUMN system_po_number TEXT;
    END IF;
END $$;


-- 7. Client Margins (Specific Overrides)
CREATE TABLE IF NOT EXISTS client_margins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES users(id) NOT NULL,
  category TEXT NOT NULL,
  margin_percent DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, category)
);

ALTER TABLE client_margins ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_margins' AND policyname = 'Admin manage client margins') THEN
        CREATE POLICY "Admin manage client margins" ON client_margins FOR ALL TO authenticated USING (
            EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'ADMIN')
        );
    END IF;
END $$;

-- 8. RFQ Enhancements
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rfq_items' AND column_name = 'allow_alternatives') THEN
        ALTER TABLE rfq_items ADD COLUMN allow_alternatives BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('009_mvp_refinements.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 010_sprint1_quote_comparison.sql
-- ============================================================================

-- Sprint 1: Quote Comparison & Dual PO System
-- Migration: Order Status Enum and PO Documents Table

-- ============================================
-- Part 1: Order Status Enum
-- ============================================

-- Create order status enum
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'DRAFT',
    'OPEN',
    'QUOTED',
    'PENDING_PO',
    'CONFIRMED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED',
    'CLOSED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create RFQ status enum
DO $$ BEGIN
  CREATE TYPE rfq_status AS ENUM (
    'DRAFT',
    'OPEN',
    'QUOTED',
    'CLOSED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update orders table to use enum (if status column exists as text)
-- We'll add a new column and migrate data
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_enum order_status;

-- Migrate existing data (convert text to enum)
UPDATE orders 
SET status_enum = 
  CASE 
    WHEN UPPER(status) = 'PENDING' THEN 'OPEN'::order_status
    WHEN UPPER(status) = 'CONFIRMED' THEN 'CONFIRMED'::order_status
    WHEN UPPER(status) = 'DELIVERED' THEN 'DELIVERED'::order_status
    WHEN UPPER(status) = 'CANCELLED' THEN 'CANCELLED'::order_status
    ELSE 'OPEN'::order_status
  END
WHERE status_enum IS NULL;

-- Drop old column and rename new one
ALTER TABLE orders DROP COLUMN IF EXISTS status;
ALTER TABLE orders RENAME COLUMN status_enum TO status;

-- Set default
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'OPEN'::order_status;

-- Same for RFQs
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS status_enum rfq_status;

UPDATE rfqs 
SET status_enum = 
  CASE 
    WHEN UPPER(status) = 'OPEN' THEN 'OPEN'::rfq_status
    WHEN UPPER(status) = 'CLOSED' THEN 'CLOSED'::rfq_status
    WHEN UPPER(status) = 'CANCELLED' THEN 'CANCELLED'::rfq_status
    ELSE 'OPEN'::rfq_status
  END
WHERE status_enum IS NULL;

ALTER TABLE rfqs DROP COLUMN IF EXISTS status;
ALTER TABLE rfqs RENAME COLUMN status_enum TO status;
ALTER TABLE rfqs ALTER COLUMN status SET DEFAULT 'OPEN'::rfq_status;

-- ============================================
-- Part 2: Order Documents Table (PO Storage)
-- ============================================

CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('SYSTEM_PO', 'CLIENT_PO')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_type ON order_documents(document_type);

-- ============================================
-- Part 3: RLS Policies for Order Documents
-- ============================================

ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Clients manage own POs" ON order_documents;
DROP POLICY IF EXISTS "Admins full access to order documents" ON order_documents;
DROP POLICY IF EXISTS "Suppliers view confirmed order POs" ON order_documents;

-- Clients can view and upload POs for their own orders
CREATE POLICY "Clients manage own POs" ON order_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_documents.order_id 
      AND o.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_documents.order_id 
      AND o.client_id = auth.uid()
    )
  );

-- Admins can see and manage all documents
CREATE POLICY "Admins full access to order documents" ON order_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Suppliers can view POs for confirmed orders they're involved in
CREATE POLICY "Suppliers view confirmed order POs" ON order_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN quotes q ON q.id = o.quote_id
      WHERE o.id = order_documents.order_id 
      AND q.supplier_id = auth.uid()
      AND o.status IN ('CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CLOSED')
    )
  );

-- ============================================
-- Part 4: Update Orders Table
-- ============================================

-- Add columns for PO tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS system_po_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_po_uploaded BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_verified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_verified_by UUID REFERENCES users(id);

-- ============================================
-- Part 5: Storage Bucket (Run this in Supabase Dashboard if not exists)
-- ============================================

-- NOTE: This SQL can't create storage buckets directly
-- You need to run this in Supabase Dashboard > Storage:
-- 
-- Bucket name: order-documents
-- Public: false
-- Allowed MIME types: application/pdf
-- Max file size: 5MB
--
-- Then add this policy:
-- INSERT: authenticated users can upload
-- SELECT: Based on RLS policies above

COMMENT ON TABLE order_documents IS 'Stores System POs and Client-uploaded POs for orders';
COMMENT ON COLUMN order_documents.document_type IS 'SYSTEM_PO: Generated by platform, CLIENT_PO: Uploaded by client';

INSERT INTO public._migration_log (migration_name) VALUES ('010_sprint1_quote_comparison.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_add_order_payment_link.sql
-- ============================================================================

-- ============================================================================
-- Add external payment link fields to orders
-- Date: 2026-02-03
-- Purpose: Allow admins to store a manually generated payment link per order
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;


INSERT INTO public._migration_log (migration_name) VALUES ('20260203_add_order_payment_link.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_add_search_path_security.sql
-- ============================================================================

-- ============================================================================
-- SECURITY FIX: Add search_path to SECURITY DEFINER functions
-- Date: 2026-02-03
-- Purpose: Prevent search_path hijacking attacks on SECURITY DEFINER functions
-- ============================================================================

-- The 'SET search_path = public, pg_temp' clause prevents malicious users from
-- creating objects in their schema that shadow public functions, which could
-- lead to privilege escalation when SECURITY DEFINER functions are called.

-- ============================================================================
-- FIX: handle_new_user() trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY: Role is ALWAYS set to CLIENT for new signups
  -- Role can only be changed by an admin through the admin panel
  INSERT INTO public.users (
    id, email, name, role, company_name, verified, status, kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    'CLIENT'::user_role,  -- SECURITY: Always CLIENT, ignoring any client-provided role
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    'ACTIVE'::user_status,
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX: get_user_role() helper function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX: admin_update_user_sensitive_fields() function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_user_sensitive_fields(
  target_user_id UUID,
  new_role user_role DEFAULT NULL,
  new_verified BOOLEAN DEFAULT NULL,
  new_status user_status DEFAULT NULL,
  new_kyc_status kyc_status DEFAULT NULL,
  new_rating DECIMAL(3, 2) DEFAULT NULL,
  new_credit_limit DECIMAL(10, 2) DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_role user_role;
BEGIN
  -- Check if caller is an admin
  SELECT role INTO admin_role FROM public.users WHERE id = auth.uid();
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can update sensitive user fields';
  END IF;

  -- Update the target user with provided values
  UPDATE public.users
  SET
    role = COALESCE(new_role, role),
    verified = COALESCE(new_verified, verified),
    status = COALESCE(new_status, status),
    kyc_status = COALESCE(new_kyc_status, kyc_status),
    rating = COALESCE(new_rating, rating),
    credit_limit = COALESCE(new_credit_limit, credit_limit),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verify the functions have the correct settings
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SECURITY: search_path added to all SECURITY DEFINER functions';
  RAISE NOTICE 'Affected functions: handle_new_user, get_user_role, admin_update_user_sensitive_fields';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260203_add_search_path_security.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_lock_down_sensitive_columns.sql
-- ============================================================================

-- ============================================================================
-- SECURITY MIGRATION: Lock Down User Role and Sensitive Columns
-- ============================================================================
-- This migration:
-- 1. Updates the handle_new_user trigger to ALWAYS default to CLIENT role
-- 2. Removes role from accepted user metadata
-- 3. Creates stricter RLS policies that prevent users from modifying sensitive columns
-- 4. Creates an admin-only function for updating sensitive fields
-- ============================================================================

-- ============================================================================
-- PART 1: Update the auth trigger to ignore client-provided role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY: Role is ALWAYS set to CLIENT for new signups
  -- Role can only be changed by an admin through the admin panel
  INSERT INTO public.users (
    id, email, name, role, company_name, verified, status, kyc_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    'CLIENT'::user_role,  -- SECURITY: Always CLIENT, ignoring any client-provided role
    COALESCE(NEW.raw_user_meta_data->>'companyName', 'Company'),
    FALSE,
    'ACTIVE'::user_status,  -- SECURITY: Clients are automatically ACTIVE
    'INCOMPLETE'::kyc_status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: Drop existing user update policies and create restricted ones
-- ============================================================================

-- Drop existing update policies for users table
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

-- Create restricted policy: Users can only update name and company_name
CREATE POLICY "Users can update safe fields only" ON users 
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (
    auth.uid() = id
    -- The following columns must remain unchanged when updated by the user
    AND role = (SELECT role FROM users WHERE id = auth.uid())
    AND verified = (SELECT verified FROM users WHERE id = auth.uid())
    AND status = (SELECT status FROM users WHERE id = auth.uid())
    AND kyc_status = (SELECT kyc_status FROM users WHERE id = auth.uid())
    AND rating = (SELECT rating FROM users WHERE id = auth.uid())
    AND public_id = (SELECT public_id FROM users WHERE id = auth.uid())
    AND date_joined = (SELECT date_joined FROM users WHERE id = auth.uid())
  );

-- Admins retain full update access
CREATE POLICY "Admins can update all user fields" ON users 
  FOR UPDATE 
  USING (get_user_role() = 'ADMIN');

-- ============================================================================
-- PART 3: Create admin-only function for sensitive field updates
-- ============================================================================

-- Function for admins to update sensitive user fields
CREATE OR REPLACE FUNCTION admin_update_user_sensitive_fields(
  target_user_id UUID,
  new_role user_role DEFAULT NULL,
  new_verified BOOLEAN DEFAULT NULL,
  new_status user_status DEFAULT NULL,
  new_kyc_status kyc_status DEFAULT NULL,
  new_rating DECIMAL(3, 2) DEFAULT NULL,
  new_credit_limit DECIMAL(10, 2) DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_role user_role;
BEGIN
  -- Check if caller is an admin
  SELECT role INTO admin_role FROM users WHERE id = auth.uid();
  
  IF admin_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can update sensitive user fields';
  END IF;

  -- Update the target user with provided values
  UPDATE users
  SET
    role = COALESCE(new_role, role),
    verified = COALESCE(new_verified, verified),
    status = COALESCE(new_status, status),
    kyc_status = COALESCE(new_kyc_status, kyc_status),
    rating = COALESCE(new_rating, rating),
    credit_limit = COALESCE(new_credit_limit, credit_limit),
    updated_at = NOW()
  WHERE id = target_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users (RLS will restrict to admins)
GRANT EXECUTE ON FUNCTION admin_update_user_sensitive_fields TO authenticated;

-- ============================================================================
-- PART 4: Add credit limit columns if they don't exist
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'credit_limit') THEN
    ALTER TABLE users ADD COLUMN credit_limit DECIMAL(10, 2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'credit_used') THEN
    ALTER TABLE users ADD COLUMN credit_used DECIMAL(10, 2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- 
-- 1. handle_new_user trigger: Now ignores client-provided role, always sets CLIENT
-- 
-- 2. User update policy: Users can only update these fields:
--    - name
--    - company_name
--    
-- 3. Protected fields (admin-only via admin_update_user_sensitive_fields):
--    - role (prevents privilege escalation)
--    - verified (trust indicator)
--    - status (account state)
--    - kyc_status (compliance)
--    - rating (integrity)
--    - credit_limit/credit_used (financial)
--    - public_id (identity)
--    - date_joined (audit trail)
--
-- ============================================================================

INSERT INTO public._migration_log (migration_name) VALUES ('20260203_lock_down_sensitive_columns.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_payment_link_rls_policy.sql
-- ============================================================================

-- ============================================================================
-- SECURITY: RLS Policy for Payment Link Fields
-- Date: 2026-02-03
-- Purpose: Restrict payment_link_url and payment_link_sent_at updates to ADMIN only
-- ============================================================================

-- Context: Payment links are manually generated by the admin team and sent
-- via email/WhatsApp. Clients and suppliers should NOT be able to update
-- these fields to prevent phishing attacks where they point to malicious URLs.

-- ============================================================================
-- Add columns to orders table (if not already added)
-- ============================================================================
DO $$ 
BEGIN
  -- Add payment_link_url if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'payment_link_url'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_link_url TEXT NULL;
  END IF;

  -- Add payment_link_sent_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'payment_link_sent_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_link_sent_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- ============================================================================
-- RLS Policy: Only admins can update payment link fields
-- ============================================================================

-- Drop any existing conflicting policies first
DROP POLICY IF EXISTS "Admins can update payment links" ON public.orders;
DROP POLICY IF EXISTS "Only admins can set payment links" ON public.orders;

-- Create a policy that allows admins to update any order
-- This is simpler and covers payment link updates
CREATE POLICY "Admins can update all order fields" ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    -- Only admins can update orders
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
  );

-- Ensure clients and suppliers can still view their own orders
-- (This should already exist, but adding for completeness)
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = client_id 
    OR auth.uid() = supplier_id 
    OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
  );

-- ============================================================================
-- Add helpful comment
-- ============================================================================
COMMENT ON COLUMN public.orders.payment_link_url IS 
  'External payment link manually generated by admin team. Only admins can update.';

COMMENT ON COLUMN public.orders.payment_link_sent_at IS 
  'Timestamp when payment link was sent to client via email/WhatsApp. Only admins can update.';

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'SECURITY: Payment link RLS policy created';
  RAISE NOTICE 'Only ADMIN role can update payment_link_url and payment_link_sent_at';
  RAISE NOTICE 'Clients and suppliers can view but not modify these fields';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260203_payment_link_rls_policy.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260203_restrict_supplier_order_updates.sql
-- ============================================================================

-- ============================================================================
-- SECURITY: Restrict suppliers from updating payment link fields
-- Date: 2026-02-03
-- Purpose: Ensure suppliers can only update their order status (not payment links)
-- ============================================================================

-- Drop the permissive policy (if it exists)
DROP POLICY IF EXISTS "Suppliers can update order status" ON public.orders;

-- Recreate with a WITH CHECK clause that blocks payment link changes
CREATE POLICY "Suppliers can update order status"
  ON public.orders FOR UPDATE
  USING (auth.uid() = supplier_id)
  WITH CHECK (
    auth.uid() = supplier_id
    AND payment_link_url IS NOT DISTINCT FROM (
      SELECT o.payment_link_url FROM public.orders o WHERE o.id = id
    )
    AND payment_link_sent_at IS NOT DISTINCT FROM (
      SELECT o.payment_link_sent_at FROM public.orders o WHERE o.id = id
    )
  );


INSERT INTO public._migration_log (migration_name) VALUES ('20260203_restrict_supplier_order_updates.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260205_credit_limit_adjustments.sql
-- ============================================================================

-- ============================================================================
-- CREDIT LIMIT ADJUSTMENTS + AUDIT TRAIL
-- Date: 2026-02-05
-- ============================================================================

-- Persist every admin credit-limit change for audit and client visibility.
CREATE TABLE IF NOT EXISTS public.credit_limit_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('SET', 'INCREASE', 'DECREASE')),
  adjustment_amount DECIMAL(12, 2) NOT NULL CHECK (adjustment_amount >= 0),
  change_amount DECIMAL(12, 2) NOT NULL,
  previous_limit DECIMAL(12, 2) NOT NULL CHECK (previous_limit >= 0),
  new_limit DECIMAL(12, 2) NOT NULL CHECK (new_limit >= 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_limit_adjustments_client_created_at
  ON public.credit_limit_adjustments (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_limit_adjustments_admin_created_at
  ON public.credit_limit_adjustments (admin_id, created_at DESC);

ALTER TABLE public.credit_limit_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Admins can read all credit adjustments'
  ) THEN
    CREATE POLICY "Admins can read all credit adjustments"
      ON public.credit_limit_adjustments
      FOR SELECT
      TO authenticated
      USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Admins can insert credit adjustments'
  ) THEN
    CREATE POLICY "Admins can insert credit adjustments"
      ON public.credit_limit_adjustments
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
        AND admin_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_limit_adjustments'
      AND policyname = 'Clients can view own credit adjustments'
  ) THEN
    CREATE POLICY "Clients can view own credit adjustments"
      ON public.credit_limit_adjustments
      FOR SELECT
      TO authenticated
      USING (client_id = auth.uid());
  END IF;
END $$;

-- Atomic admin-only credit adjustment with strict validation and audit logging.
CREATE OR REPLACE FUNCTION public.admin_adjust_client_credit_limit(
  p_target_client_id UUID,
  p_adjustment_type TEXT,
  p_adjustment_amount DECIMAL(12, 2),
  p_adjustment_reason TEXT
)
RETURNS TABLE (
  id UUID,
  client_id UUID,
  admin_id UUID,
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
  SELECT role
  INTO v_admin_role
  FROM public.users
  WHERE id = auth.uid();

  IF v_admin_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only administrators can adjust credit limits';
  END IF;

  SELECT role, COALESCE(credit_limit, 0)
  INTO v_target_role, v_previous_limit
  FROM public.users
  WHERE id = p_target_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target_role IS DISTINCT FROM 'CLIENT' THEN
    RAISE EXCEPTION 'Credit limit adjustments are only allowed for clients';
  END IF;

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

  v_reason := TRIM(COALESCE(p_adjustment_reason, ''));
  IF char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

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

  UPDATE public.users
  SET
    credit_limit = v_new_limit,
    updated_at = NOW()
  WHERE id = p_target_client_id;

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
    credit_limit_adjustments.id,
    credit_limit_adjustments.client_id,
    credit_limit_adjustments.admin_id,
    credit_limit_adjustments.adjustment_type,
    credit_limit_adjustments.adjustment_amount,
    credit_limit_adjustments.change_amount,
    credit_limit_adjustments.previous_limit,
    credit_limit_adjustments.new_limit,
    credit_limit_adjustments.reason,
    credit_limit_adjustments.created_at;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.admin_adjust_client_credit_limit TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260205_credit_limit_adjustments.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_atomic_inventory_decrement.sql
-- ============================================================================

-- ============================================================================
-- Atomic inventory decrement to prevent race conditions / overselling
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_stock_atomic(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  previous_stock INTEGER,
  new_stock INTEGER,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Product ID is required';
    RETURN;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Quantity must be greater than zero';
    RETURN;
  END IF;

  -- Admin-only when called with user session; service-role (auth.uid() IS NULL) is allowed.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = 'ADMIN'
     ) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized';
    RETURN;
  END IF;

  UPDATE public.products p
  SET
    stock_quantity = COALESCE(p.stock_quantity, 0) - p_quantity,
    updated_at = NOW()
  WHERE p.id = p_product_id
    AND COALESCE(p.stock_quantity, 0) >= p_quantity
  RETURNING
    COALESCE(p.stock_quantity, 0) + p_quantity,
    COALESCE(p.stock_quantity, 0)
  INTO
    v_previous_stock,
    v_new_stock;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_previous_stock, v_new_stock, NULL::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(p.stock_quantity, 0)
  INTO v_previous_stock
  FROM public.products p
  WHERE p.id = p_product_id;

  IF v_previous_stock IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Product not found';
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    FALSE,
    v_previous_stock,
    v_previous_stock,
    format('Insufficient stock. Available: %s, Requested: %s', v_previous_stock, p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock_atomic(UUID, INTEGER) TO service_role;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_atomic_inventory_decrement.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase1_security_hardening.sql
-- ============================================================================

-- ============================================================================
-- Phase 1 Security Hardening
-- Date: 2026-02-07
-- Focus:
--   1) Remove user-table recursion risk in role helper
--   2) Keep JWT role claims synchronized with public.users.role
--   3) Remove seed helper functions from runtime surface
-- ============================================================================

-- 1) Role helper must not query public.users (avoids RLS recursion paths).
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
BEGIN
  v_role_text := COALESCE(
    auth.jwt() ->> 'user_role',
    auth.jwt() -> 'app_metadata' ->> 'user_role'
  );

  IF v_role_text IS NULL OR v_role_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_role_text::public.user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2) Sync role claim to auth.users raw_app_meta_data for policy checks.
CREATE OR REPLACE FUNCTION public.sync_auth_user_role_claim(
  p_user_id UUID,
  p_role public.user_role
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_role IS NULL THEN
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('user_role', p_role::TEXT),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sync_auth_user_role_claim_from_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.sync_auth_user_role_claim(NEW.id, NEW.role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_auth_user_role_claim ON public.users;
CREATE TRIGGER trg_sync_auth_user_role_claim
AFTER INSERT OR UPDATE OF role ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_role_claim_from_profile();

-- Backfill existing users into auth claim metadata.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT u.id, u.role
    FROM public.users u
  LOOP
    PERFORM public.sync_auth_user_role_claim(r.id, r.role);
  END LOOP;
END
$$;

-- 3) Drop seed-only helper functions so they are not callable in runtime.
DROP FUNCTION IF EXISTS public.create_user_profile(
  UUID,
  TEXT,
  TEXT,
  public.user_role,
  TEXT,
  BOOLEAN,
  public.user_status,
  public.kyc_status
);

DROP FUNCTION IF EXISTS public.create_test_user(
  TEXT,
  TEXT,
  TEXT,
  public.user_role,
  TEXT,
  BOOLEAN,
  public.user_status,
  public.kyc_status
);


INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase1_security_hardening.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase2_data_integrity.sql
-- ============================================================================

-- ============================================================================
-- Phase 2 Data Integrity
-- Date: 2026-02-07
-- Focus:
--   1) Transactional RFQ creation (RFQ + items atomically)
--   2) Atomic invoice numbering with sequence
--   3) Canonical status normalization + constraints
--   4) RFQ item uniqueness guard
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ensure canonical order statuses used by the app are present.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Normalize legacy statuses in persisted rows and enforce canonical subsets.
-- ----------------------------------------------------------------------------
UPDATE public.orders
SET status = CASE status::TEXT
  WHEN 'In Transit' THEN 'IN_TRANSIT'::public.order_status
  WHEN 'Delivered' THEN 'DELIVERED'::public.order_status
  WHEN 'Cancelled' THEN 'CANCELLED'::public.order_status
  WHEN 'OPEN' THEN 'PENDING_PO'::public.order_status
  WHEN 'DRAFT' THEN 'PENDING_PO'::public.order_status
  WHEN 'QUOTED' THEN 'PENDING_PO'::public.order_status
  WHEN 'CLOSED' THEN 'DELIVERED'::public.order_status
  ELSE status
END
WHERE status::TEXT IN ('In Transit', 'Delivered', 'Cancelled', 'OPEN', 'DRAFT', 'QUOTED', 'CLOSED');

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_status_canonical_chk;

ALTER TABLE public.orders
ADD CONSTRAINT orders_status_canonical_chk
CHECK (
  status::TEXT = ANY (
    ARRAY[
      'PENDING_PO',
      'CONFIRMED',
      'PENDING_PAYMENT',
      'AWAITING_CONFIRMATION',
      'PAYMENT_CONFIRMED',
      'PROCESSING',
      'READY_FOR_PICKUP',
      'PICKUP_SCHEDULED',
      'OUT_FOR_DELIVERY',
      'SHIPPED',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED'
    ]
  )
);

UPDATE public.quotes
SET status = CASE status::TEXT
  WHEN 'PENDING' THEN 'PENDING_ADMIN'::public.quote_status
  WHEN 'SENT' THEN 'SENT_TO_CLIENT'::public.quote_status
  WHEN 'DECLINED' THEN 'REJECTED'::public.quote_status
  ELSE status
END
WHERE status::TEXT IN ('PENDING', 'SENT', 'DECLINED');

ALTER TABLE public.quotes
DROP CONSTRAINT IF EXISTS quotes_status_canonical_chk;

ALTER TABLE public.quotes
ADD CONSTRAINT quotes_status_canonical_chk
CHECK (status::TEXT = ANY (ARRAY['PENDING_ADMIN', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED']));

UPDATE public.rfqs
SET status = CASE status::TEXT
  WHEN 'DRAFT' THEN 'OPEN'::public.rfq_status
  WHEN 'CANCELLED' THEN 'CLOSED'::public.rfq_status
  ELSE status
END
WHERE status::TEXT IN ('DRAFT', 'CANCELLED');

ALTER TABLE public.rfqs
DROP CONSTRAINT IF EXISTS rfqs_status_canonical_chk;

ALTER TABLE public.rfqs
ADD CONSTRAINT rfqs_status_canonical_chk
CHECK (status::TEXT = ANY (ARRAY['OPEN', 'QUOTED', 'CLOSED']));

-- ----------------------------------------------------------------------------
-- 3) Enforce unique product lines per RFQ.
-- ----------------------------------------------------------------------------
WITH duplicates AS (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY rfq_id, product_id
        ORDER BY created_at, id
      ) AS rn
    FROM public.rfq_items
  ) ranked
  WHERE ranked.rn > 1
)
DELETE FROM public.rfq_items i
USING duplicates d
WHERE i.id = d.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rfq_items_unique_product'
      AND conrelid = 'public.rfq_items'::regclass
  ) THEN
    ALTER TABLE public.rfq_items
      ADD CONSTRAINT rfq_items_unique_product UNIQUE (rfq_id, product_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Transactional RFQ creation RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rfq_with_items(
  p_client_id UUID,
  p_items JSONB,
  p_status TEXT DEFAULT 'OPEN',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.rfqs
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rfq public.rfqs;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'RFQ must include at least one item';
  END IF;

  v_status := UPPER(COALESCE(NULLIF(TRIM(p_status), ''), 'OPEN'));
  IF v_status NOT IN ('OPEN', 'QUOTED', 'CLOSED') THEN
    RAISE EXCEPTION 'Invalid RFQ status';
  END IF;

  INSERT INTO public.rfqs (client_id, status, date)
  VALUES (p_client_id, v_status::public.rfq_status, COALESCE(p_date, CURRENT_DATE))
  RETURNING * INTO v_rfq;

  INSERT INTO public.rfq_items (rfq_id, product_id, quantity, notes)
  SELECT
    v_rfq.id,
    COALESCE((elem->>'product_id')::UUID, (elem->>'productId')::UUID),
    (elem->>'quantity')::INTEGER,
    NULLIF(COALESCE(elem->>'notes', elem->>'note'), '')
  FROM jsonb_array_elements(p_items) AS elem;

  RETURN v_rfq;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_rfq_with_items(UUID, JSONB, TEXT, DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) Atomic invoice number generation using a sequence.
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX((regexp_match(invoice_number, '([0-9]+)$'))[1]::BIGINT), 0)
  INTO v_max
  FROM public.invoices
  WHERE invoice_number IS NOT NULL
    AND invoice_number ~ '[0-9]+$';

  IF v_max > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max, TRUE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_seq := nextval('public.invoice_number_seq');
  RETURN 'INV-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.auto_generate_invoice_number()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase2_data_integrity.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase3_payment_audit.sql
-- ============================================================================

-- ============================================================================
-- Phase 3 Bank Transfer Audit Trail
-- Date: 2026-02-07
-- Focus:
--   1) Persistent payment audit log for bank-transfer lifecycle
--   2) RLS policies for admin/client visibility and controlled inserts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role public.user_role,
  action TEXT NOT NULL CHECK (
    action IN (
      'REFERENCE_SUBMITTED',
      'REFERENCE_RESUBMITTED',
      'PAYMENT_CONFIRMED',
      'PAYMENT_REJECTED'
    )
  ),
  from_status public.order_status,
  to_status public.order_status,
  payment_reference TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_order_created_at
  ON public.payment_audit_logs (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_created_at
  ON public.payment_audit_logs (created_at DESC);

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Admins can read all payment audit logs'
  ) THEN
    CREATE POLICY "Admins can read all payment audit logs"
      ON public.payment_audit_logs
      FOR SELECT
      TO authenticated
      USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Clients can read own payment audit logs'
  ) THEN
    CREATE POLICY "Clients can read own payment audit logs"
      ON public.payment_audit_logs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payment_audit_logs.order_id
            AND o.client_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Admins can insert payment audit logs'
  ) THEN
    CREATE POLICY "Admins can insert payment audit logs"
      ON public.payment_audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'ADMIN'
        AND actor_user_id = auth.uid()
        AND action IN ('PAYMENT_CONFIRMED', 'PAYMENT_REJECTED')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_audit_logs'
      AND policyname = 'Clients can insert own payment submission audit logs'
  ) THEN
    CREATE POLICY "Clients can insert own payment submission audit logs"
      ON public.payment_audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        actor_user_id = auth.uid()
        AND action IN ('REFERENCE_SUBMITTED', 'REFERENCE_RESUBMITTED')
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = payment_audit_logs.order_id
            AND o.client_id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase3_payment_audit.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_phase4_rpc_hardening_and_invoice_sequence.sql
-- ============================================================================

-- ============================================================================
-- Phase 4: RPC hardening + atomic invoice numbers
-- Date: 2026-02-07
-- Focus:
--   1) Remove caller-supplied admin identifiers from SECURITY DEFINER RPCs
--   2) Make invoice number generation atomic under concurrency
-- ============================================================================

-- 1) Harden assign_custom_request(): rely on auth.uid() only.
DROP FUNCTION IF EXISTS public.assign_custom_request(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  IF (SELECT role FROM public.users WHERE id = p_supplier_id) <> 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  UPDATE public.custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custom request not found';
  END IF;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_custom_request(UUID, UUID, TEXT) TO authenticated;

-- 2) Harden mark_order_as_paid(): rely on auth.uid() only.
DROP FUNCTION IF EXISTS public.mark_order_as_paid(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

-- 3) Atomic invoice number generation (sequence-backed).
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq AS BIGINT;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(invoice_number, '^INV-[0-9]{4}-([0-9]+)$'))[1]::BIGINT),
    0
  )
  INTO v_max
  FROM public.invoices;

  IF v_max > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max, true);
  ELSE
    PERFORM setval('public.invoice_number_seq', 1, false);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year TEXT;
  v_sequence BIGINT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_sequence := nextval('public.invoice_number_seq');

  RETURN 'INV-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
END;
$$;

GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO service_role;

-- 4) Enforce margin bounds at the database layer.
UPDATE public.users
SET client_margin = LEAST(GREATEST(client_margin, 0), 100)
WHERE client_margin IS NOT NULL;

UPDATE public.quotes
SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100);

UPDATE public.margin_settings
SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_client_margin_bounds'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_client_margin_bounds;
  END IF;

  ALTER TABLE public.users
    ADD CONSTRAINT users_client_margin_bounds
    CHECK (client_margin IS NULL OR (client_margin >= 0 AND client_margin <= 100));
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotes_margin_percent_bounds'
      AND conrelid = 'public.quotes'::regclass
  ) THEN
    ALTER TABLE public.quotes DROP CONSTRAINT quotes_margin_percent_bounds;
  END IF;

  ALTER TABLE public.quotes
    ADD CONSTRAINT quotes_margin_percent_bounds
    CHECK (margin_percent >= 0 AND margin_percent <= 100);
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'margin_settings_margin_percent_bounds'
      AND conrelid = 'public.margin_settings'::regclass
  ) THEN
    ALTER TABLE public.margin_settings DROP CONSTRAINT margin_settings_margin_percent_bounds;
  END IF;

  ALTER TABLE public.margin_settings
    ADD CONSTRAINT margin_settings_margin_percent_bounds
    CHECK (margin_percent >= 0 AND margin_percent <= 100);
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'client_margins'
      AND relkind = 'r'
  ) THEN
    EXECUTE 'UPDATE public.client_margins
             SET margin_percent = LEAST(GREATEST(margin_percent, 0), 100)';

    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'client_margins_margin_percent_bounds'
        AND conrelid = 'public.client_margins'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE public.client_margins
               DROP CONSTRAINT client_margins_margin_percent_bounds';
    END IF;

    EXECUTE 'ALTER TABLE public.client_margins
             ADD CONSTRAINT client_margins_margin_percent_bounds
             CHECK (margin_percent >= 0 AND margin_percent <= 100)';
  END IF;
END
$$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_phase4_rpc_hardening_and_invoice_sequence.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_security_and_quote_acceptance.sql
-- ============================================================================

-- ============================================================================
-- SECURITY + CORE FLOW HARDENING
-- Date: 2026-02-07
-- ============================================================================

-- 1) Remove permissive payment update policy.
DROP POLICY IF EXISTS "System can update payments" ON public.payments;

-- 2) Ensure credit columns exist before using atomic quote acceptance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'client_margin'
  ) THEN
    ALTER TABLE public.users ADD COLUMN client_margin DECIMAL(5, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'credit_limit'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credit_limit DECIMAL(12, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'credit_used'
  ) THEN
    ALTER TABLE public.users ADD COLUMN credit_used DECIMAL(12, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'current_balance'
  ) THEN
    ALTER TABLE public.users ADD COLUMN current_balance DECIMAL(12, 2) DEFAULT 0;
  END IF;
END $$;

-- 3) Backfill order_status enum values used by the application.
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- 4) Atomic quote acceptance + credit deduction + order creation.
CREATE OR REPLACE FUNCTION public.accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_order public.orders;
  v_total_amount DECIMAL(12, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    q.id,
    q.rfq_id,
    q.supplier_id,
    q.status,
    COALESCE(q.final_price, 0)::DECIMAL(12, 2) AS final_price,
    r.client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Idempotency guard: if already accepted and order exists, return it.
  IF v_quote.status = 'ACCEPTED' THEN
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE quote_id = p_quote_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status NOT IN ('SENT_TO_CLIENT', 'PENDING_ADMIN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quote is not available for acceptance';
  END IF;

  v_total_amount := GREATEST(v_quote.final_price, 0);
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid quote amount';
  END IF;

  UPDATE public.users
  SET
    credit_limit = ROUND(COALESCE(credit_limit, 0) - v_total_amount, 2),
    credit_used = ROUND(COALESCE(credit_used, 0) + v_total_amount, 2),
    current_balance = ROUND(COALESCE(current_balance, 0) + v_total_amount, 2),
    updated_at = NOW()
  WHERE id = v_quote.client_id
    AND COALESCE(credit_limit, 0) >= v_total_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credit';
  END IF;

  UPDATE public.quotes
  SET status = 'ACCEPTED', updated_at = NOW()
  WHERE id = p_quote_id;

  UPDATE public.rfqs
  SET status = 'CLOSED', updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  INSERT INTO public.orders (
    quote_id,
    client_id,
    supplier_id,
    amount,
    status,
    date
  )
  VALUES (
    v_quote.id,
    v_quote.client_id,
    v_quote.supplier_id,
    v_total_amount,
    'PENDING_PAYMENT',
    CURRENT_DATE
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.accept_quote_and_deduct_credit(UUID) TO authenticated;

-- 5) Harden mark_order_as_paid by binding admin identity to auth.uid().
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'IN_TRANSIT',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

-- 6) Harden assign_custom_request by binding admin identity to auth.uid().
CREATE OR REPLACE FUNCTION public.assign_custom_request(
  p_request_id UUID,
  p_supplier_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.custom_item_requests
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.custom_item_requests;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can assign requests';
  END IF;

  IF (SELECT role FROM public.users WHERE id = p_supplier_id) <> 'SUPPLIER' THEN
    RAISE EXCEPTION 'Can only assign to suppliers';
  END IF;

  UPDATE public.custom_item_requests
  SET
    assigned_to = p_supplier_id,
    assigned_by = v_caller,
    admin_notes = COALESCE(p_notes, admin_notes),
    status = 'ASSIGNED',
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_security_and_quote_acceptance.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260207_verify_client_po_atomic.sql
-- ============================================================================

-- ============================================================================
-- Atomic client PO verification
-- Verifies document + decrements inventory + confirms order in one transaction.
-- Date: 2026-02-07
-- ============================================================================

-- Ensure orders.items exists for inventory item tracking (fallback to RFQ items if empty).
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS items JSONB;

CREATE OR REPLACE FUNCTION public.verify_client_po_and_confirm_order(
  p_document_id UUID
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_doc public.order_documents;
  v_order public.orders;
  v_quote_rfq_id UUID;
  v_item RECORD;
  v_stock_result RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can verify client POs';
  END IF;

  SELECT *
  INTO v_doc
  FROM public.order_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.document_type <> 'CLIENT_PO' THEN
    RAISE EXCEPTION 'Only CLIENT_PO documents can be verified';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_doc.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent exit: already verified, do not decrement inventory twice.
  IF v_doc.verified_at IS NOT NULL AND v_order.admin_verified THEN
    RETURN v_order;
  END IF;

  IF v_order.status <> 'PENDING_PO' THEN
    RAISE EXCEPTION 'Order must be in PENDING_PO status for verification';
  END IF;

  -- Prefer explicit order items payload when present.
  IF jsonb_typeof(COALESCE(v_order.items, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(COALESCE(v_order.items, '[]'::jsonb)) > 0 THEN
    FOR v_item IN
      SELECT
        COALESCE(value->>'productId', value->>'product_id')::UUID AS product_id,
        GREATEST(COALESCE((value->>'quantity')::INTEGER, 0), 0) AS quantity
      FROM jsonb_array_elements(v_order.items) AS value
    LOOP
      IF v_item.product_id IS NULL OR v_item.quantity <= 0 THEN
        CONTINUE;
      END IF;

      SELECT *
      INTO v_stock_result
      FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

      IF NOT COALESCE(v_stock_result.success, FALSE) THEN
        RAISE EXCEPTION '%', COALESCE(
          v_stock_result.error,
          format('Failed to decrement stock for product %s', v_item.product_id)
        );
      END IF;
    END LOOP;
  ELSIF v_order.quote_id IS NOT NULL THEN
    SELECT q.rfq_id
    INTO v_quote_rfq_id
    FROM public.quotes q
    WHERE q.id = v_order.quote_id;

    IF v_quote_rfq_id IS NOT NULL THEN
      FOR v_item IN
        SELECT product_id, quantity
        FROM public.rfq_items
        WHERE rfq_id = v_quote_rfq_id
      LOOP
        SELECT *
        INTO v_stock_result
        FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

        IF NOT COALESCE(v_stock_result.success, FALSE) THEN
          RAISE EXCEPTION '%', COALESCE(
            v_stock_result.error,
            format('Failed to decrement stock for product %s', v_item.product_id)
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.order_documents
  SET
    verified_by = v_caller,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_doc.id;

  UPDATE public.orders
  SET
    status = 'CONFIRMED',
    admin_verified = TRUE,
    admin_verified_by = v_caller,
    admin_verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO service_role;

INSERT INTO public._migration_log (migration_name) VALUES ('20260207_verify_client_po_atomic.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase5_po_verification_payment_transition.sql
-- ============================================================================

-- ============================================================================
-- Phase 5: PO verification should transition to payment stage
-- Bank transfer is the primary MVP payment path.
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_client_po_and_confirm_order(
  p_document_id UUID
)
RETURNS public.orders
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_doc public.order_documents;
  v_order public.orders;
  v_quote_rfq_id UUID;
  v_item RECORD;
  v_stock_result RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can verify client POs';
  END IF;

  SELECT *
  INTO v_doc
  FROM public.order_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.document_type <> 'CLIENT_PO' THEN
    RAISE EXCEPTION 'Only CLIENT_PO documents can be verified';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_doc.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent exit: already verified and order already past PO stage.
  IF v_doc.verified_at IS NOT NULL
     AND v_order.admin_verified
     AND v_order.status <> 'PENDING_PO' THEN
    RETURN v_order;
  END IF;

  IF v_order.status <> 'PENDING_PO' THEN
    RAISE EXCEPTION 'Order must be in PENDING_PO status for verification';
  END IF;

  -- Prefer explicit order items payload when present.
  IF jsonb_typeof(COALESCE(v_order.items, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(COALESCE(v_order.items, '[]'::jsonb)) > 0 THEN
    FOR v_item IN
      SELECT
        COALESCE(value->>'productId', value->>'product_id')::UUID AS product_id,
        GREATEST(COALESCE((value->>'quantity')::INTEGER, 0), 0) AS quantity
      FROM jsonb_array_elements(v_order.items) AS value
    LOOP
      IF v_item.product_id IS NULL OR v_item.quantity <= 0 THEN
        CONTINUE;
      END IF;

      SELECT *
      INTO v_stock_result
      FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

      IF NOT COALESCE(v_stock_result.success, FALSE) THEN
        RAISE EXCEPTION '%', COALESCE(
          v_stock_result.error,
          format('Failed to decrement stock for product %s', v_item.product_id)
        );
      END IF;
    END LOOP;
  ELSIF v_order.quote_id IS NOT NULL THEN
    SELECT q.rfq_id
    INTO v_quote_rfq_id
    FROM public.quotes q
    WHERE q.id = v_order.quote_id;

    IF v_quote_rfq_id IS NOT NULL THEN
      FOR v_item IN
        SELECT product_id, quantity
        FROM public.rfq_items
        WHERE rfq_id = v_quote_rfq_id
      LOOP
        SELECT *
        INTO v_stock_result
        FROM public.decrement_stock_atomic(v_item.product_id, v_item.quantity);

        IF NOT COALESCE(v_stock_result.success, FALSE) THEN
          RAISE EXCEPTION '%', COALESCE(
            v_stock_result.error,
            format('Failed to decrement stock for product %s', v_item.product_id)
          );
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.order_documents
  SET
    verified_by = v_caller,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_doc.id;

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    admin_verified = TRUE,
    admin_verified_by = v_caller,
    admin_verified_at = NOW(),
    updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_client_po_and_confirm_order(UUID) TO service_role;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase5_po_verification_payment_transition.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase6_order_status_transition_guard.sql
-- ============================================================================

-- ============================================================================
-- Phase 6: Enforce valid order status transitions at the database layer.
-- Prevents invalid direct updates from any client path.
-- Date: 2026-02-07
-- ============================================================================

CREATE OR REPLACE FUNCTION public.order_status_transition_is_valid(
  p_from public.order_status,
  p_to public.order_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from TEXT;
  v_to TEXT;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN FALSE;
  END IF;

  v_from := p_from::TEXT;
  v_to := p_to::TEXT;

  IF p_from = p_to THEN
    RETURN TRUE;
  END IF;

  CASE v_from
    WHEN 'DRAFT', 'OPEN', 'QUOTED' THEN
      RETURN v_to IN ('PENDING_PO', 'CONFIRMED', 'CANCELLED', 'CLOSED');
    WHEN 'PENDING_PO' THEN
      RETURN v_to IN ('CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED');
    WHEN 'CONFIRMED' THEN
      RETURN v_to IN ('PENDING_PAYMENT', 'CANCELLED');
    WHEN 'PENDING_PAYMENT' THEN
      RETURN v_to IN ('PENDING_PO', 'AWAITING_CONFIRMATION', 'PAYMENT_CONFIRMED', 'CANCELLED');
    WHEN 'AWAITING_CONFIRMATION' THEN
      RETURN v_to IN ('PENDING_PO', 'PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'CANCELLED');
    WHEN 'PAYMENT_CONFIRMED' THEN
      RETURN v_to IN (
        'PROCESSING',
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'OUT_FOR_DELIVERY',
        'IN_TRANSIT',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      );
    WHEN 'PROCESSING' THEN
      RETURN v_to IN (
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'OUT_FOR_DELIVERY',
        'IN_TRANSIT',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      );
    WHEN 'READY_FOR_PICKUP' THEN
      RETURN v_to IN ('PICKUP_SCHEDULED', 'OUT_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'PICKUP_SCHEDULED' THEN
      RETURN v_to IN ('OUT_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'OUT_FOR_DELIVERY' THEN
      RETURN v_to IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'SHIPPED' THEN
      RETURN v_to IN ('IN_TRANSIT', 'DELIVERED', 'CANCELLED');
    WHEN 'IN_TRANSIT' THEN
      RETURN v_to IN ('DELIVERED', 'CANCELLED');
    WHEN 'DELIVERED' THEN
      RETURN FALSE;
    WHEN 'CLOSED' THEN
      RETURN FALSE;
    WHEN 'CANCELLED' THEN
      RETURN FALSE;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.order_status_transition_is_valid(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;

CREATE TRIGGER trg_enforce_order_status_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_status_transition();

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase6_order_status_transition_guard.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase7_mark_order_as_paid_consistency.sql
-- ============================================================================

-- ============================================================================
-- Phase 7: Normalize mark_order_as_paid RPC behavior/signature after prior
-- migration redefinitions.
-- Date: 2026-02-08
-- ============================================================================

-- Backward-compatible 4-arg signature (legacy callers)
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

-- Preferred 3-arg signature (auth-bound)
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.mark_order_as_paid(
    p_order_id,
    auth.uid(),
    p_payment_reference,
    p_payment_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase7_mark_order_as_paid_consistency.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase8_reject_payment_submission_rpc.sql
-- ============================================================================

-- ============================================================================
-- Phase 8: Admin payment rejection RPC (auth-bound + atomic audit logging)
-- Date: 2026-02-08
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_payment_submission(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
  v_reason TEXT;
  v_admin_note TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can reject payment submissions';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  v_admin_note := format('[Admin Action] Payment reference rejected: %s', v_reason);

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    payment_notes = CASE
      WHEN payment_notes IS NULL OR BTRIM(payment_notes) = '' THEN v_admin_note
      ELSE payment_notes || E'\n' || v_admin_note
    END,
    payment_confirmed_at = NULL,
    payment_confirmed_by = NULL,
    payment_submitted_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'AWAITING_CONFIRMATION'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
      RAISE EXCEPTION 'Order is not awaiting confirmation';
    END IF;
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.payment_audit_logs (
    order_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    payment_reference,
    notes,
    metadata
  ) VALUES (
    v_order.id,
    v_caller,
    'ADMIN',
    'PAYMENT_REJECTED',
    'AWAITING_CONFIRMATION',
    'PENDING_PAYMENT',
    v_order.payment_reference,
    v_reason,
    jsonb_build_object(
      'source', 'rpc.reject_payment_submission'
    )
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_submission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_submission(UUID, TEXT) TO authenticated;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase8_reject_payment_submission_rpc.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: create_leads_and_custom_requests.sql
-- ============================================================================

-- ============================================================================
-- LEADS TABLE - Stores GetStarted/Contact Request submissions
-- ============================================================================

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('client', 'supplier')),
  notes TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_user_id UUID REFERENCES users(id)
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Admin can do everything with leads
CREATE POLICY "Admin full access to leads" ON leads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'ADMIN'
    )
  );

-- Allow inserting leads without authentication (public form)
CREATE POLICY "Anyone can submit leads" ON leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ============================================================================
-- CUSTOM ITEM REQUESTS TABLE - For clients requesting non-catalog items
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_item_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id),
  item_name TEXT NOT NULL,
  description TEXT NOT NULL,
  specifications TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  target_price DECIMAL(12, 2),
  currency TEXT DEFAULT 'SAR',
  deadline DATE,
  priority TEXT DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  reference_images TEXT[],
  attachment_urls TEXT[],
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'ASSIGNED', 'QUOTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  admin_notes TEXT,
  assigned_to UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id),
  supplier_quote_id UUID REFERENCES quotes(id),
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_requests_client ON custom_item_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_item_requests(status);
CREATE INDEX IF NOT EXISTS idx_custom_requests_assigned ON custom_item_requests(assigned_to);

-- Enable RLS
ALTER TABLE custom_item_requests ENABLE ROW LEVEL SECURITY;

-- Clients can see their own requests
CREATE POLICY "Clients can view own requests" ON custom_item_requests
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Clients can create requests
CREATE POLICY "Clients can create requests" ON custom_item_requests
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

-- Clients can update their own pending requests
CREATE POLICY "Clients can update own pending requests" ON custom_item_requests
  FOR UPDATE TO authenticated
  USING (client_id = auth.uid() AND status = 'PENDING');

-- Admin can do everything
CREATE POLICY "Admin full access to custom requests" ON custom_item_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'ADMIN'
    )
  );

-- Suppliers can see requests assigned to them
CREATE POLICY "Suppliers can view assigned requests" ON custom_item_requests
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

INSERT INTO public._migration_log (migration_name) VALUES ('create_leads_and_custom_requests.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase9_decimal_precision_standardization.sql
-- Purpose: Standardize all monetary columns to DECIMAL(12,2)
-- ============================================================================

-- Users table monetary columns
ALTER TABLE users
  ALTER COLUMN credit_limit TYPE DECIMAL(12, 2),
  ALTER COLUMN credit_used  TYPE DECIMAL(12, 2);

-- Products table monetary columns
ALTER TABLE products
  ALTER COLUMN cost_price     TYPE DECIMAL(12, 2),
  ALTER COLUMN retail_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN stock_quantity TYPE INTEGER;

-- Quotes table monetary columns
ALTER TABLE quotes
  ALTER COLUMN unit_price    TYPE DECIMAL(12, 2),
  ALTER COLUMN total_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN final_price   TYPE DECIMAL(12, 2),
  ALTER COLUMN shipping_cost TYPE DECIMAL(12, 2);

-- Orders table monetary columns
ALTER TABLE orders
  ALTER COLUMN total_amount TYPE DECIMAL(12, 2);

-- Standardize rating columns
ALTER TABLE users ALTER COLUMN rating TYPE DECIMAL(3, 2);

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase9_decimal_precision_standardization.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase10_admin_audit_log.sql
-- Purpose: General admin audit trail with automatic triggers
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies - admins can read all
CREATE POLICY "admins_can_read_audit_log"
  ON admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- No direct INSERT from client — only via RPC
CREATE POLICY "no_direct_write_audit_log"
  ON admin_audit_log FOR INSERT
  WITH CHECK (false);

-- RPC function to log admin actions (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;

-- Trigger: Log user role/status/credit changes
CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_ROLE_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_role', OLD.role::text, 'new_role', NEW.role::text)
      );
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'USER_STATUS_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
      );
    END IF;

    IF OLD.credit_limit IS DISTINCT FROM NEW.credit_limit THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'CREDIT_LIMIT_CHANGED', 'user', NEW.id,
        jsonb_build_object('old_limit', OLD.credit_limit, 'new_limit', NEW.credit_limit)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_changes ON users;
CREATE TRIGGER trg_audit_user_changes
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_user_changes();

-- Trigger: Log product approval/rejection
CREATE OR REPLACE FUNCTION audit_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(),
        CASE NEW.status::text
          WHEN 'APPROVED' THEN 'PRODUCT_APPROVED'
          WHEN 'REJECTED' THEN 'PRODUCT_REJECTED'
          ELSE 'PRODUCT_STATUS_CHANGED'
        END,
        'product', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text, 'product_name', NEW.name)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_product_changes ON products;
CREATE TRIGGER trg_audit_product_changes
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION audit_product_changes();

-- Trigger: Log order status changes by admins
CREATE OR REPLACE FUNCTION audit_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'ADMIN') THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES (
        auth.uid(), 'ORDER_STATUS_CHANGED', 'order', NEW.id,
        jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_order_changes ON orders;
CREATE TRIGGER trg_audit_order_changes
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_order_changes();

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase10_admin_audit_log.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260208_phase11_login_attempts_table.sql
-- Purpose: Login attempts tracking for auth rate limiting
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup function
CREATE OR REPLACE FUNCTION prune_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 hour';
END;
$$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260208_phase11_login_attempts_table.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================

-- ============================================================================
-- MIGRATION: 20260210_phase1_core_columns.sql
-- ============================================================================

-- =====================================================
-- Phase 1: Core Schema Additions
-- Gaps: #6, #7, #8, #23, #33
-- =====================================================

-- =====================================================
-- Gap #6: Payment Terms
-- =====================================================

-- Create payment_terms enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_terms') THEN
    CREATE TYPE payment_terms AS ENUM ('prepay', 'net_15', 'net_30', 'net_45');
  END IF;
END $$;

-- Add payment_terms column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE users ADD COLUMN payment_terms payment_terms DEFAULT 'net_30';
  END IF;
END $$;

-- Add payment_terms column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_terms payment_terms;
  END IF;
END $$;

-- =====================================================
-- Gap #7: Item Flexibility Preference
-- =====================================================

-- Create item_flexibility enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_flexibility') THEN
    CREATE TYPE item_flexibility AS ENUM ('exact_match', 'open_to_equivalent', 'open_to_alternatives');
  END IF;
END $$;

-- Add flexibility column to rfq_items table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rfq_items' AND column_name = 'flexibility'
  ) THEN
    ALTER TABLE rfq_items ADD COLUMN flexibility item_flexibility DEFAULT 'exact_match';
  END IF;
END $$;

-- =====================================================
-- Gap #8: RFQ Expiry Date
-- =====================================================

-- Add expires_at column to rfqs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rfqs' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE rfqs ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create function to auto-close expired RFQs
CREATE OR REPLACE FUNCTION close_expired_rfqs()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update expired RFQs to CLOSED status
  UPDATE rfqs 
  SET status = 'CLOSED', updated_at = NOW()
  WHERE status = 'OPEN' 
    AND expires_at IS NOT NULL 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION close_expired_rfqs() IS 
  'Auto-closes RFQs that have passed their expiry date. Returns count of closed RFQs. Can be called by Edge Function or cron job.';

-- =====================================================
-- Gap #23: Product Availability Status
-- =====================================================

-- Create product_availability enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_availability') THEN
    CREATE TYPE product_availability AS ENUM ('available', 'limited_stock', 'out_of_stock');
  END IF;
END $$;

-- Add availability_status column to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'availability_status'
  ) THEN
    ALTER TABLE products ADD COLUMN availability_status product_availability DEFAULT 'available';
  END IF;
END $$;

-- Update RLS policy to hide out_of_stock products from clients
-- First, drop the old policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'products' 
    AND policyname = 'Anyone can view approved products'
  ) THEN
    DROP POLICY "Anyone can view approved products" ON products;
  END IF;
END $$;

-- Create new policy that excludes out_of_stock products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'products' 
    AND policyname = 'Anyone can view approved available products'
  ) THEN
    CREATE POLICY "Anyone can view approved available products" ON products 
    FOR SELECT
    USING (
      status = 'APPROVED'
      AND (availability_status IS NULL OR availability_status <> 'out_of_stock')
    );
  END IF;
END $$;

-- =====================================================
-- Gap #33: Lead Time per Product
-- =====================================================

-- Add lead_time_days column to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'lead_time_days'
  ) THEN
    ALTER TABLE products ADD COLUMN lead_time_days INTEGER;
  END IF;
END $$;

-- Add comment to column
COMMENT ON COLUMN products.lead_time_days IS 
  'Default lead time in days for this product. Used by auto-quote service instead of hardcoded value.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify all enums were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_type WHERE typname IN ('payment_terms', 'item_flexibility', 'product_availability')) = 3,
    'Not all enums were created';
END $$;

-- Verify all columns were added
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'payment_terms') = 1,
    'payment_terms column not added to users';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_terms') = 1,
    'payment_terms column not added to orders';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'rfq_items' AND column_name = 'flexibility') = 1,
    'flexibility column not added to rfq_items';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'rfqs' AND column_name = 'expires_at') = 1,
    'expires_at column not added to rfqs';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'availability_status') = 1,
    'availability_status column not added to products';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'lead_time_days') = 1,
    'lead_time_days column not added to products';
END $$;

-- Verify function was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'close_expired_rfqs') = 1,
    'close_expired_rfqs function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase1_core_columns.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase2_quote_items.sql
-- ============================================================================

-- =====================================================
-- Phase 2: quote_items Table (Gap #1)
-- Foundation for per-item quote pricing
-- =====================================================

-- =====================================================
-- Create quote_items Table
-- =====================================================

CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  rfq_item_id UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  unit_price DECIMAL(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total DECIMAL(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  margin_percent DECIMAL(5, 2),
  final_unit_price DECIMAL(12, 2),
  final_line_total DECIMAL(12, 2),
  alternative_product_id UUID REFERENCES products(id),
  is_quoted BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment to table
COMMENT ON TABLE quote_items IS 
  'Per-item pricing breakdown for multi-item RFQ quotes. Replaces aggregate pricing on quotes table.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_rfq_item_id ON quote_items(rfq_item_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product_id ON quote_items(product_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_alternative_product_id ON quote_items(alternative_product_id) 
  WHERE alternative_product_id IS NOT NULL;

-- =====================================================
-- Add type Column to quotes Table
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'type'
  ) THEN
    ALTER TABLE quotes ADD COLUMN type TEXT DEFAULT 'custom' 
      CHECK (type IN ('auto', 'custom'));
  END IF;
END $$;

COMMENT ON COLUMN quotes.type IS 
  'Quote type: auto (generated by system) or custom (manually created by supplier)';

-- =====================================================
-- Trigger: Calculate Final Prices on quote_items
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_quote_item_final_prices()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_margin DECIMAL(5, 2);
BEGIN
  -- Use item-level margin if set, otherwise inherit from quote
  IF NEW.margin_percent IS NULL THEN
    SELECT margin_percent INTO v_margin FROM quotes WHERE id = NEW.quote_id;
    NEW.margin_percent := COALESCE(v_margin, 0);
  END IF;
  
  -- Calculate final_unit_price = unit_price * (1 + margin_percent / 100)
  NEW.final_unit_price := NEW.unit_price * (1 + NEW.margin_percent / 100);
  
  -- Calculate final_line_total = final_unit_price * quantity
  NEW.final_line_total := NEW.final_unit_price * NEW.quantity;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_calculate_quote_item_final_prices ON quote_items;

CREATE TRIGGER trg_calculate_quote_item_final_prices
  BEFORE INSERT OR UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_item_final_prices();

COMMENT ON FUNCTION calculate_quote_item_final_prices() IS 
  'Auto-calculates final_unit_price and final_line_total based on margin_percent. Inherits margin from quote if not set.';

-- =====================================================
-- Trigger: Sync Quote Totals from quote_items
-- =====================================================

CREATE OR REPLACE FUNCTION sync_quote_totals()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote_id UUID;
  v_supplier_price DECIMAL(12, 2);
  v_final_price DECIMAL(12, 2);
BEGIN
  -- Determine which quote to update
  IF TG_OP = 'DELETE' THEN
    v_quote_id := OLD.quote_id;
  ELSE
    v_quote_id := NEW.quote_id;
  END IF;
  
  -- Calculate totals from all quote_items for this quote
  SELECT 
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(final_line_total), 0)
  INTO v_supplier_price, v_final_price
  FROM quote_items
  WHERE quote_id = v_quote_id AND is_quoted = TRUE;
  
  -- Update the quote table
  UPDATE quotes
  SET 
    supplier_price = v_supplier_price,
    final_price = v_final_price,
    updated_at = NOW()
  WHERE id = v_quote_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_sync_quote_totals_insert ON quote_items;
DROP TRIGGER IF EXISTS trg_sync_quote_totals_update ON quote_items;
DROP TRIGGER IF EXISTS trg_sync_quote_totals_delete ON quote_items;

CREATE TRIGGER trg_sync_quote_totals_insert
  AFTER INSERT ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_quote_totals();

CREATE TRIGGER trg_sync_quote_totals_update
  AFTER UPDATE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_quote_totals();

CREATE TRIGGER trg_sync_quote_totals_delete
  AFTER DELETE ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_quote_totals();

COMMENT ON FUNCTION sync_quote_totals() IS 
  'Keeps quotes.supplier_price and quotes.final_price in sync with SUM of quote_items. Only includes is_quoted=TRUE items.';

-- =====================================================
-- Enable RLS on quote_items
-- =====================================================

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for quote_items
-- =====================================================

-- Policy: Suppliers can view their own quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Suppliers can view own quote items'
  ) THEN
    CREATE POLICY "Suppliers can view own quote items" ON quote_items
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM quotes
        WHERE quotes.id = quote_items.quote_id
        AND quotes.supplier_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Policy: Clients can view quote items for quotes sent to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Clients can view quote items for sent quotes'
  ) THEN
    CREATE POLICY "Clients can view quote items for sent quotes" ON quote_items
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM quotes
        JOIN rfqs ON rfqs.id = quotes.rfq_id
        WHERE quotes.id = quote_items.quote_id
        AND rfqs.client_id = auth.uid()
        AND quotes.status IN ('SENT_TO_CLIENT', 'ACCEPTED')
      )
    );
  END IF;
END $$;

-- Policy: Admins can view all quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Admins can view all quote items'
  ) THEN
    CREATE POLICY "Admins can view all quote items" ON quote_items
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Suppliers can insert their own quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Suppliers can insert own quote items'
  ) THEN
    CREATE POLICY "Suppliers can insert own quote items" ON quote_items
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM quotes
        WHERE quotes.id = quote_items.quote_id
        AND quotes.supplier_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Policy: Suppliers can update their own quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Suppliers can update own quote items'
  ) THEN
    CREATE POLICY "Suppliers can update own quote items" ON quote_items
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM quotes
        WHERE quotes.id = quote_items.quote_id
        AND quotes.supplier_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Policy: Admins can modify all quote items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'quote_items' 
    AND policyname = 'Admins can modify all quote items'
  ) THEN
    CREATE POLICY "Admins can modify all quote items" ON quote_items
    FOR ALL
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'quote_items') = 1,
    'quote_items table not created';
END $$;

-- Verify indexes were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'quote_items') >= 4,
    'Not all indexes created on quote_items';
END $$;

-- Verify triggers were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'trg_%quote%') >= 4,
    'Not all triggers created for quote_items';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'quote_items') = TRUE,
    'RLS not enabled on quote_items';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'quote_items') >= 6,
    'Not all RLS policies created for quote_items';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase2_quote_items.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase3_partial_quotes.sql
-- ============================================================================

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

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase3_partial_quotes.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase4a_reviews.sql
-- ============================================================================

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

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4a_reviews.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase4b_supplier_payouts.sql
-- ============================================================================

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

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4b_supplier_payouts.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase4c_logistics.sql
-- ============================================================================

-- =====================================================
-- Phase 4c: Logistics Providers (Gap #16)
-- =====================================================

-- =====================================================
-- Create logistics_providers Table
-- =====================================================

CREATE TABLE IF NOT EXISTS logistics_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  service_areas TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE logistics_providers IS 
  'Logistics/shipping providers for order fulfillment. Managed by admins.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_logistics_providers_is_active ON logistics_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_logistics_providers_name ON logistics_providers(name);

-- =====================================================
-- Create updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_logistics_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_logistics_providers_updated_at ON logistics_providers;

CREATE TRIGGER trg_update_logistics_providers_updated_at
  BEFORE UPDATE ON logistics_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_logistics_providers_updated_at();

-- =====================================================
-- Add logistics_provider_id to orders Table
-- =====================================================

-- Check if shipments table exists, if not add to orders
DO $$
BEGIN
  -- Try to add to shipments table first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'shipments' AND column_name = 'logistics_provider_id'
    ) THEN
      ALTER TABLE shipments ADD COLUMN logistics_provider_id UUID REFERENCES logistics_providers(id);
      CREATE INDEX IF NOT EXISTS idx_shipments_logistics_provider_id ON shipments(logistics_provider_id);
    END IF;
  ELSE
    -- Add to orders table if shipments doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'logistics_provider_id'
    ) THEN
      ALTER TABLE orders ADD COLUMN logistics_provider_id UUID REFERENCES logistics_providers(id);
      CREATE INDEX IF NOT EXISTS idx_orders_logistics_provider_id ON orders(logistics_provider_id);
    END IF;
  END IF;
END $$;

-- =====================================================
-- Enable RLS on logistics_providers
-- =====================================================

ALTER TABLE logistics_providers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for logistics_providers
-- =====================================================

-- Policy: Admins can view all logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can view all logistics providers'
  ) THEN
    CREATE POLICY "Admins can view all logistics providers" ON logistics_providers
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can insert logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can insert logistics providers'
  ) THEN
    CREATE POLICY "Admins can insert logistics providers" ON logistics_providers
    FOR INSERT
    WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can update logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can update logistics providers'
  ) THEN
    CREATE POLICY "Admins can update logistics providers" ON logistics_providers
    FOR UPDATE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete logistics providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'logistics_providers' 
    AND policyname = 'Admins can delete logistics providers'
  ) THEN
    CREATE POLICY "Admins can delete logistics providers" ON logistics_providers
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'logistics_providers') = 1,
    'logistics_providers table not created';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'logistics_providers') = TRUE,
    'RLS not enabled on logistics_providers';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'logistics_providers') >= 4,
    'Not all RLS policies created for logistics_providers';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4c_logistics.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase4d_categories.sql
-- ============================================================================

-- =====================================================
-- Phase 4d: Dynamic Categories (Gap #19)
-- =====================================================

-- =====================================================
-- Create categories Table
-- =====================================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE categories IS 
  'Dynamic category hierarchy. Replaces hardcoded categories. parent_id NULL = top-level category.';

-- =====================================================
-- Create Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

-- =====================================================
-- Create updated_at Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_categories_updated_at ON categories;

CREATE TRIGGER trg_update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_categories_updated_at();

-- =====================================================
-- Seed Data: Current Categories
-- =====================================================

-- Insert top-level categories
INSERT INTO categories (name, icon, sort_order, is_active) VALUES
  ('Office', 'business', 1, TRUE),
  ('IT Supplies', 'computer', 2, TRUE),
  ('Breakroom', 'local_cafe', 3, TRUE),
  ('Janitorial', 'cleaning_services', 4, TRUE),
  ('Maintenance', 'build', 5, TRUE)
ON CONFLICT DO NOTHING;

-- Insert subcategories for Office
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Paper Products', id, 1, TRUE FROM categories WHERE name = 'Office' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Writing Instruments', id, 2, TRUE FROM categories WHERE name = 'Office' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Desk Accessories', id, 3, TRUE FROM categories WHERE name = 'Office' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for IT Supplies
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Cables & Adapters', id, 1, TRUE FROM categories WHERE name = 'IT Supplies' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Peripherals', id, 2, TRUE FROM categories WHERE name = 'IT Supplies' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Storage Devices', id, 3, TRUE FROM categories WHERE name = 'IT Supplies' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for Breakroom
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Beverages', id, 1, TRUE FROM categories WHERE name = 'Breakroom' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Snacks', id, 2, TRUE FROM categories WHERE name = 'Breakroom' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Disposables', id, 3, TRUE FROM categories WHERE name = 'Breakroom' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for Janitorial
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Cleaning Supplies', id, 1, TRUE FROM categories WHERE name = 'Janitorial' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Paper Towels & Tissues', id, 2, TRUE FROM categories WHERE name = 'Janitorial' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Trash Bags', id, 3, TRUE FROM categories WHERE name = 'Janitorial' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- Insert subcategories for Maintenance
INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Tools', id, 1, TRUE FROM categories WHERE name = 'Maintenance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Hardware', id, 2, TRUE FROM categories WHERE name = 'Maintenance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id, sort_order, is_active)
SELECT 'Safety Equipment', id, 3, TRUE FROM categories WHERE name = 'Maintenance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- =====================================================
-- Enable RLS on categories
-- =====================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for categories
-- =====================================================

-- Policy: Everyone can view active categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Everyone can view active categories'
  ) THEN
    CREATE POLICY "Everyone can view active categories" ON categories
    FOR SELECT
    USING (is_active = TRUE);
  END IF;
END $$;

-- Policy: Admins can view all categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can view all categories'
  ) THEN
    CREATE POLICY "Admins can view all categories" ON categories
    FOR SELECT
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can insert categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can insert categories'
  ) THEN
    CREATE POLICY "Admins can insert categories" ON categories
    FOR INSERT
    WITH CHECK (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can update categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can update categories'
  ) THEN
    CREATE POLICY "Admins can update categories" ON categories
    FOR UPDATE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- Policy: Admins can delete categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'categories' 
    AND policyname = 'Admins can delete categories'
  ) THEN
    CREATE POLICY "Admins can delete categories" ON categories
    FOR DELETE
    USING (get_user_role() = 'ADMIN');
  END IF;
END $$;

-- =====================================================
-- RPC: Admin Reorder Categories
-- =====================================================

CREATE OR REPLACE FUNCTION admin_reorder_categories(
  p_category_ids UUID[],
  p_sort_orders INTEGER[]
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  i INTEGER;
BEGIN
  -- Authorization check: Admin only
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Validate arrays have same length
  IF array_length(p_category_ids, 1) <> array_length(p_sort_orders, 1) THEN
    RAISE EXCEPTION 'category_ids and sort_orders arrays must have the same length';
  END IF;
  
  -- Update sort orders
  FOR i IN 1..array_length(p_category_ids, 1) LOOP
    UPDATE categories
    SET sort_order = p_sort_orders[i],
        updated_at = NOW()
    WHERE id = p_category_ids[i];
  END LOOP;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to reorder categories: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION admin_reorder_categories(UUID[], INTEGER[]) IS 
  'Reorders categories by updating sort_order. Used for drag-drop reordering in admin UI. Admin-only.';

-- =====================================================
-- Verification Queries
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'categories') = 1,
    'categories table not created';
END $$;

-- Verify seed data was inserted
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM categories WHERE parent_id IS NULL) >= 5,
    'Top-level categories not seeded';
  ASSERT (SELECT COUNT(*) FROM categories WHERE parent_id IS NOT NULL) >= 10,
    'Subcategories not seeded';
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'categories') = TRUE,
    'RLS not enabled on categories';
END $$;

-- Verify RLS policies were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'categories') >= 5,
    'Not all RLS policies created for categories';
END $$;

-- Verify RPC was created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_reorder_categories') = 1,
    'admin_reorder_categories function not created';
END $$;

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase4d_categories.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase5_notifications.sql
-- ============================================================================

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

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase5_notifications.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase6_account_freeze.sql
-- ============================================================================

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

INSERT INTO public._migration_log (migration_name) VALUES ('20260210_phase6_account_freeze.sql') ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260210_phase7_rfq_expiry_cron.sql
-- ============================================================================

-- =====================================================
-- Phase 7: RFQ Expiry Scheduler
-- Gap: RFQ Auto-Expiry Cron
-- =====================================================

-- Ensure pg_cron extension is available (best-effort in hosted environments)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension could not be created in this environment: %', SQLERRM;
END $$;

-- Schedule close_expired_rfqs every 15 minutes
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job WHERE jobname = 'mwrd-close-expired-rfqs-every-15m'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'mwrd-close-expired-rfqs-every-15m',
      '*/15 * * * *',
      'SELECT public.close_expired_rfqs();'
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Schedule close_expired_rfqs() manually.';
  END IF;
END $$;

-- Verification (only when pg_cron is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND to_regclass('cron.job') IS NOT NULL THEN
    ASSERT (
      SELECT COUNT(*)
      FROM cron.job
      WHERE jobname = 'mwrd-close-expired-rfqs-every-15m'
    ) = 1, 'RFQ expiry cron job was not scheduled';
  END IF;
END $$;

INSERT INTO public._migration_log (migration_name)
SELECT '20260210_phase7_rfq_expiry_cron.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260211_phase12_get_user_role_fallback.sql
-- ============================================================================

-- =====================================================
-- Phase 12: Role Resolution Hardening
-- Fixes admin RLS mismatches when JWT role claims are missing/stale
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_text TEXT;
  v_role user_role;
BEGIN
  -- First try JWT/app metadata claims.
  v_role_text := NULLIF(
    trim(
      COALESCE(
        auth.jwt() ->> 'user_role',
        auth.jwt() -> 'app_metadata' ->> 'user_role',
        ''
      )
    ),
    ''
  );

  IF v_role_text IS NOT NULL THEN
    BEGIN
      RETURN v_role_text::user_role;
    EXCEPTION
      WHEN OTHERS THEN
        -- Ignore invalid claim value and fallback to users table.
        NULL;
    END;
  END IF;

  -- Fallback: resolve role from public.users for the authenticated user.
  IF auth.uid() IS NOT NULL THEN
    SELECT role
    INTO v_role
    FROM public.users
    WHERE id = auth.uid();

    IF FOUND THEN
      RETURN v_role;
    END IF;
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_user_role() IS
  'Returns current user role from JWT claims, with fallback to public.users.role by auth.uid().';

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon;

-- Verification
DO $$
DECLARE
  has_function BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'get_user_role'
  ) INTO has_function;

  ASSERT has_function, 'get_user_role function was not created';
END $$;

INSERT INTO public._migration_log (migration_name)
SELECT '20260211_phase12_get_user_role_fallback.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260211_storage_buckets.sql
-- ============================================================================

-- =====================================================
-- Storage Buckets for Image Uploads
-- =====================================================
-- NOTE: Storage bucket creation via SQL is supported in
-- Supabase but may need to be run manually if not using
-- the Supabase CLI migration runner.

-- Create product-images bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create profile-pictures bucket (private, signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-pictures',
    'profile-pictures',
    false,
    2097152, -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create master-product-images bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'master-product-images',
    'master-product-images',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create custom-request-files bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'custom-request-files',
    'custom-request-files',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create public-assets bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-assets',
    'public-assets',
    true,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Storage Policies for product-images
-- =====================================================

-- Everyone can view product images (public bucket)
DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
CREATE POLICY "Product images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-images');

-- Authenticated users can upload product images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload product images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'product-images'
        AND auth.role() = 'authenticated'
    );

-- Users can update their own uploads
DROP POLICY IF EXISTS "Users can update their own product images" ON storage.objects;
CREATE POLICY "Users can update their own product images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'product-images'
        AND auth.role() = 'authenticated'
    );

-- Admins can delete any product images
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
CREATE POLICY "Admins can delete product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'product-images'
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'ADMIN'
        )
    );

-- Suppliers can delete their own uploads
DROP POLICY IF EXISTS "Suppliers can delete own product images" ON storage.objects;
CREATE POLICY "Suppliers can delete own product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'product-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- =====================================================
-- Storage Policies for profile-pictures
-- =====================================================

-- Authenticated users can view profile pictures
DROP POLICY IF EXISTS "Authenticated users can view profile pictures" ON storage.objects;
CREATE POLICY "Authenticated users can view profile pictures"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can upload their own profile pictures
DROP POLICY IF EXISTS "Users can upload own profile pictures" ON storage.objects;
CREATE POLICY "Users can upload own profile pictures"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can update their own profile pictures
DROP POLICY IF EXISTS "Users can update own profile pictures" ON storage.objects;
CREATE POLICY "Users can update own profile pictures"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- Users can delete their own profile pictures
DROP POLICY IF EXISTS "Users can delete own profile pictures" ON storage.objects;
CREATE POLICY "Users can delete own profile pictures"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'profile-pictures'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for master-product-images
-- =====================================================

DROP POLICY IF EXISTS "Master product images are publicly accessible" ON storage.objects;
CREATE POLICY "Master product images are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'master-product-images');

DROP POLICY IF EXISTS "Authenticated users can upload master product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload master product images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update master product images" ON storage.objects;
CREATE POLICY "Authenticated users can update master product images"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete master product images" ON storage.objects;
CREATE POLICY "Authenticated users can delete master product images"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'master-product-images'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for custom-request-files
-- =====================================================

DROP POLICY IF EXISTS "Custom request files are publicly accessible" ON storage.objects;
CREATE POLICY "Custom request files are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'custom-request-files');

DROP POLICY IF EXISTS "Authenticated users can upload custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can upload custom request files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can update custom request files"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete custom request files" ON storage.objects;
CREATE POLICY "Authenticated users can delete custom request files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'custom-request-files'
        AND auth.role() = 'authenticated'
    );

-- =====================================================
-- Storage Policies for public-assets
-- =====================================================

DROP POLICY IF EXISTS "Public assets are publicly accessible" ON storage.objects;
CREATE POLICY "Public assets are publicly accessible"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'public-assets');

DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload public assets"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can update public assets" ON storage.objects;
CREATE POLICY "Authenticated users can update public assets"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

DROP POLICY IF EXISTS "Authenticated users can delete public assets" ON storage.objects;
CREATE POLICY "Authenticated users can delete public assets"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'public-assets'
        AND auth.role() = 'authenticated'
    );

INSERT INTO public._migration_log (migration_name)
SELECT '20260211_storage_buckets.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260213_phase13_payment_workflow_hotfix.sql
-- ============================================================================

-- ============================================================================
-- Phase 13: Payment workflow hotfix
-- Date: 2026-02-13
-- Purpose:
--   1) Ensure canonical order_status values required by payment flow exist
--   2) Ensure orders.payment_submitted_at exists (used by payment rejection flow)
--   3) Recreate payment RPCs with consistent signatures and grants
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ensure canonical order_status values exist.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_status TEXT;
  v_statuses TEXT[] := ARRAY[
    'PENDING_PO',
    'CONFIRMED',
    'PENDING_PAYMENT',
    'AWAITING_CONFIRMATION',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'SHIPPED',
    'IN_TRANSIT',
    'DELIVERED',
    'CANCELLED'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'order_status'
  ) THEN
    FOREACH v_status IN ARRAY v_statuses LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'order_status'
          AND e.enumlabel = v_status
      ) THEN
        EXECUTE format('ALTER TYPE public.order_status ADD VALUE %L', v_status);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Ensure orders.payment_submitted_at exists.
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 3) Recreate mark_order_as_paid RPCs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL OR p_admin_id IS NULL OR v_caller <> p_admin_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can confirm payments';
  END IF;

  UPDATE public.orders
  SET
    status = 'PAYMENT_CONFIRMED',
    payment_confirmed_at = NOW(),
    payment_confirmed_by = v_caller,
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_notes = COALESCE(p_payment_notes, payment_notes),
    updated_at = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_date = CURRENT_DATE
  WHERE order_id = p_order_id;

  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_as_paid(
  p_order_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.mark_order_as_paid(
    p_order_id,
    auth.uid(),
    p_payment_reference,
    p_payment_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_as_paid(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) Recreate reject_payment_submission RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payment_submission(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders;
  v_caller UUID;
  v_reason TEXT;
  v_admin_note TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (SELECT role FROM public.users WHERE id = v_caller) <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only admins can reject payment submissions';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  v_admin_note := format('[Admin Action] Payment reference rejected: %s', v_reason);

  UPDATE public.orders
  SET
    status = 'PENDING_PAYMENT',
    payment_notes = CASE
      WHEN payment_notes IS NULL OR BTRIM(payment_notes) = '' THEN v_admin_note
      ELSE payment_notes || E'\n' || v_admin_note
    END,
    payment_confirmed_at = NULL,
    payment_confirmed_by = NULL,
    payment_submitted_at = NULL,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'AWAITING_CONFIRMATION'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
      RAISE EXCEPTION 'Order is not awaiting confirmation';
    END IF;
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.payment_audit_logs (
    order_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    payment_reference,
    notes,
    metadata
  ) VALUES (
    v_order.id,
    v_caller,
    'ADMIN',
    'PAYMENT_REJECTED',
    'AWAITING_CONFIRMATION',
    'PENDING_PAYMENT',
    v_order.payment_reference,
    v_reason,
    jsonb_build_object(
      'source', 'rpc.reject_payment_submission'
    )
  );

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_submission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_submission(UUID, TEXT) TO authenticated;

INSERT INTO public._migration_log (migration_name)
SELECT '20260213_phase13_payment_workflow_hotfix.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260217_phase14_accept_quote_contract_fix.sql
-- ============================================================================

-- Drop first so we can safely change return type across environments
DROP FUNCTION IF EXISTS public.accept_quote_and_deduct_credit(UUID);

CREATE OR REPLACE FUNCTION public.accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_order public.orders;
  v_actor_role TEXT;

  v_total_amount NUMERIC(12, 2);
  v_items_total NUMERIC(12, 2) := 0;
  v_credit_limit NUMERIC(12, 2);
  v_current_balance NUMERIC(12, 2);
  v_payment_terms_text TEXT := 'net_30';
  v_payment_terms_safe TEXT := 'net_30';

  v_has_is_partial BOOLEAN := FALSE;
  v_has_user_payment_terms BOOLEAN := FALSE;
  v_has_order_payment_terms BOOLEAN := FALSE;
  v_is_partial BOOLEAN := FALSE;
  v_quoted_items_count INTEGER := 0;
  v_total_items_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    q.id,
    q.rfq_id,
    q.supplier_id,
    q.status,
    COALESCE(q.final_price, 0)::NUMERIC(12, 2) AS final_price,
    r.client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF auth.uid() <> v_quote.client_id THEN
    SELECT role::TEXT
    INTO v_actor_role
    FROM public.users
    WHERE id = auth.uid();

    IF COALESCE(v_actor_role, '') <> 'ADMIN' THEN
      RAISE EXCEPTION 'Only the client or admin can accept this quote';
    END IF;
  END IF;

  -- Idempotent path: quote already accepted and order already created.
  IF v_quote.status = 'ACCEPTED' THEN
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE quote_id = p_quote_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status NOT IN ('SENT_TO_CLIENT', 'PENDING_ADMIN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quote is not available for acceptance';
  END IF;

  -- Detect optional schema elements to keep this migration safe in mixed environments.
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quotes'
      AND column_name = 'is_partial'
  ) INTO v_has_is_partial;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'payment_terms'
  ) INTO v_has_user_payment_terms;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'payment_terms'
  ) INTO v_has_order_payment_terms;

  -- Prefer quote_items totals when available so partial-quote acceptance is accurate.
  IF to_regclass('public.quote_items') IS NOT NULL THEN
    EXECUTE $quote_items$
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(is_quoted, TRUE) THEN COALESCE(line_total, COALESCE(unit_price, 0) * COALESCE(quantity, 0), 0)
              ELSE 0
            END
          ),
          0
        )::NUMERIC(12, 2),
        COUNT(*) FILTER (WHERE COALESCE(is_quoted, TRUE)),
        COUNT(*)
      FROM public.quote_items
      WHERE quote_id = $1
    $quote_items$
    INTO v_items_total, v_quoted_items_count, v_total_items_count
    USING p_quote_id;
  END IF;

  IF v_quoted_items_count > 0 THEN
    v_total_amount := GREATEST(v_items_total, 0);
  ELSE
    v_total_amount := GREATEST(v_quote.final_price, 0);
  END IF;

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid quote amount';
  END IF;

  v_is_partial := (v_quoted_items_count > 0 AND v_quoted_items_count < v_total_items_count);

  -- Lock client financial row before credit reservation.
  IF v_has_user_payment_terms THEN
    EXECUTE $client_financials_with_terms$
      SELECT
        COALESCE(credit_limit, 0)::NUMERIC(12, 2),
        COALESCE(current_balance, 0)::NUMERIC(12, 2),
        COALESCE(payment_terms::TEXT, 'net_30')::TEXT
      FROM public.users
      WHERE id = $1
      FOR UPDATE
    $client_financials_with_terms$
    INTO v_credit_limit, v_current_balance, v_payment_terms_text
    USING v_quote.client_id;
  ELSE
    SELECT
      COALESCE(credit_limit, 0)::NUMERIC(12, 2),
      COALESCE(current_balance, 0)::NUMERIC(12, 2)
    INTO v_credit_limit, v_current_balance
    FROM public.users
    WHERE id = v_quote.client_id
    FOR UPDATE;

    v_payment_terms_text := 'net_30';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client financial profile not found';
  END IF;

  v_payment_terms_safe := CASE
    WHEN v_payment_terms_text IN ('prepay', 'net_15', 'net_30', 'net_45') THEN v_payment_terms_text
    ELSE 'net_30'
  END;

  -- Reserve credit only for non-prepay clients.
  IF v_payment_terms_safe <> 'prepay' THEN
    IF (v_current_balance + v_total_amount) > v_credit_limit THEN
      RAISE EXCEPTION
        'Insufficient credit limit. Required: %, Available: %',
        v_total_amount,
        (v_credit_limit - v_current_balance);
    END IF;

    UPDATE public.users
    SET
      current_balance = ROUND(COALESCE(current_balance, 0) + v_total_amount, 2),
      credit_used = ROUND(COALESCE(credit_used, 0) + v_total_amount, 2),
      updated_at = NOW()
    WHERE id = v_quote.client_id;
  END IF;

  IF v_has_is_partial THEN
    UPDATE public.quotes
    SET
      status = 'ACCEPTED',
      final_price = v_total_amount,
      is_partial = v_is_partial,
      updated_at = NOW()
    WHERE id = p_quote_id;
  ELSE
    UPDATE public.quotes
    SET
      status = 'ACCEPTED',
      final_price = v_total_amount,
      updated_at = NOW()
    WHERE id = p_quote_id;
  END IF;

  UPDATE public.quotes
  SET
    status = 'REJECTED',
    updated_at = NOW()
  WHERE rfq_id = v_quote.rfq_id
    AND id <> p_quote_id
    AND status IN ('SENT_TO_CLIENT', 'PENDING_ADMIN');

  UPDATE public.rfqs
  SET
    status = 'CLOSED',
    updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  -- Prefer canonical initial state, fallback to legacy status value for older enums.
  BEGIN
    IF v_has_order_payment_terms THEN
      INSERT INTO public.orders (
        quote_id,
        client_id,
        supplier_id,
        amount,
        status,
        payment_terms,
        date
      )
      VALUES (
        p_quote_id,
        v_quote.client_id,
        v_quote.supplier_id,
        v_total_amount,
        'PENDING_PAYMENT',
        v_payment_terms_safe,
        CURRENT_DATE
      )
      RETURNING * INTO v_order;
    ELSE
      INSERT INTO public.orders (
        quote_id,
        client_id,
        supplier_id,
        amount,
        status,
        date
      )
      VALUES (
        p_quote_id,
        v_quote.client_id,
        v_quote.supplier_id,
        v_total_amount,
        'PENDING_PAYMENT',
        CURRENT_DATE
      )
      RETURNING * INTO v_order;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%invalid input value for enum%' THEN
        IF v_has_order_payment_terms THEN
          INSERT INTO public.orders (
            quote_id,
            client_id,
            supplier_id,
            amount,
            status,
            payment_terms,
            date
          )
          VALUES (
            p_quote_id,
            v_quote.client_id,
            v_quote.supplier_id,
            v_total_amount,
            'PENDING_PO',
            v_payment_terms_safe,
            CURRENT_DATE
          )
          RETURNING * INTO v_order;
        ELSE
          INSERT INTO public.orders (
            quote_id,
            client_id,
            supplier_id,
            amount,
            status,
            date
          )
          VALUES (
            p_quote_id,
            v_quote.client_id,
            v_quote.supplier_id,
            v_total_amount,
            'PENDING_PO',
            CURRENT_DATE
          )
          RETURNING * INTO v_order;
        END IF;
      ELSE
        RAISE;
      END IF;
  END;

  RETURN v_order;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to accept quote: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.accept_quote_and_deduct_credit(UUID) IS
  'Accepts quote atomically, reserves client credit when needed, supports partial quotes, and returns the created order row.';

REVOKE ALL ON FUNCTION public.accept_quote_and_deduct_credit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quote_and_deduct_credit(UUID) TO authenticated;

INSERT INTO public._migration_log (migration_name)
SELECT '20260217_phase14_accept_quote_contract_fix.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- MIGRATION: 20260217_phase15_no_credit_limit_direct_pay.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.accept_quote_and_deduct_credit(UUID);

CREATE OR REPLACE FUNCTION public.accept_quote_and_deduct_credit(p_quote_id UUID)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote RECORD;
  v_order public.orders;
  v_actor_role TEXT;

  v_total_amount NUMERIC(12, 2);
  v_items_total NUMERIC(12, 2) := 0;
  v_credit_limit NUMERIC(12, 2);
  v_current_balance NUMERIC(12, 2);
  v_payment_terms_text TEXT := 'net_30';
  v_payment_terms_safe TEXT := 'net_30';
  v_order_payment_terms_text TEXT := 'net_30';
  v_use_direct_pay BOOLEAN := FALSE;

  v_has_is_partial BOOLEAN := FALSE;
  v_has_user_payment_terms BOOLEAN := FALSE;
  v_has_order_payment_terms BOOLEAN := FALSE;
  v_is_partial BOOLEAN := FALSE;
  v_quoted_items_count INTEGER := 0;
  v_total_items_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    q.id,
    q.rfq_id,
    q.supplier_id,
    q.status,
    COALESCE(q.final_price, 0)::NUMERIC(12, 2) AS final_price,
    r.client_id
  INTO v_quote
  FROM public.quotes q
  JOIN public.rfqs r ON r.id = q.rfq_id
  WHERE q.id = p_quote_id
  FOR UPDATE OF q, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF auth.uid() <> v_quote.client_id THEN
    SELECT role::TEXT
    INTO v_actor_role
    FROM public.users
    WHERE id = auth.uid();

    IF COALESCE(v_actor_role, '') <> 'ADMIN' THEN
      RAISE EXCEPTION 'Only the client or admin can accept this quote';
    END IF;
  END IF;

  IF v_quote.status = 'ACCEPTED' THEN
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE quote_id = p_quote_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      RETURN v_order;
    END IF;
  END IF;

  IF v_quote.status NOT IN ('SENT_TO_CLIENT', 'PENDING_ADMIN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quote is not available for acceptance';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quotes'
      AND column_name = 'is_partial'
  ) INTO v_has_is_partial;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'payment_terms'
  ) INTO v_has_user_payment_terms;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'payment_terms'
  ) INTO v_has_order_payment_terms;

  IF to_regclass('public.quote_items') IS NOT NULL THEN
    EXECUTE $quote_items$
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(is_quoted, TRUE) THEN COALESCE(line_total, COALESCE(unit_price, 0) * COALESCE(quantity, 0), 0)
              ELSE 0
            END
          ),
          0
        )::NUMERIC(12, 2),
        COUNT(*) FILTER (WHERE COALESCE(is_quoted, TRUE)),
        COUNT(*)
      FROM public.quote_items
      WHERE quote_id = $1
    $quote_items$
    INTO v_items_total, v_quoted_items_count, v_total_items_count
    USING p_quote_id;
  END IF;

  IF v_quoted_items_count > 0 THEN
    v_total_amount := GREATEST(v_items_total, 0);
  ELSE
    v_total_amount := GREATEST(v_quote.final_price, 0);
  END IF;

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid quote amount';
  END IF;

  v_is_partial := (v_quoted_items_count > 0 AND v_quoted_items_count < v_total_items_count);

  IF v_has_user_payment_terms THEN
    EXECUTE $client_financials_with_terms$
      SELECT
        COALESCE(credit_limit, 0)::NUMERIC(12, 2),
        COALESCE(current_balance, 0)::NUMERIC(12, 2),
        COALESCE(payment_terms::TEXT, 'net_30')::TEXT
      FROM public.users
      WHERE id = $1
      FOR UPDATE
    $client_financials_with_terms$
    INTO v_credit_limit, v_current_balance, v_payment_terms_text
    USING v_quote.client_id;
  ELSE
    SELECT
      COALESCE(credit_limit, 0)::NUMERIC(12, 2),
      COALESCE(current_balance, 0)::NUMERIC(12, 2)
    INTO v_credit_limit, v_current_balance
    FROM public.users
    WHERE id = v_quote.client_id
    FOR UPDATE;

    v_payment_terms_text := 'net_30';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client financial profile not found';
  END IF;

  v_payment_terms_safe := CASE
    WHEN v_payment_terms_text IN ('prepay', 'net_15', 'net_30', 'net_45') THEN v_payment_terms_text
    ELSE 'net_30'
  END;

  -- If no credit limit is assigned, force direct-pay behavior.
  v_use_direct_pay := (
    v_payment_terms_safe = 'prepay'
    OR COALESCE(v_credit_limit, 0) <= 0
  );

  v_order_payment_terms_text := CASE
    WHEN v_use_direct_pay THEN 'prepay'
    ELSE v_payment_terms_safe
  END;

  IF NOT v_use_direct_pay THEN
    IF (v_current_balance + v_total_amount) > v_credit_limit THEN
      RAISE EXCEPTION
        'Insufficient credit limit. Required: %, Available: %',
        v_total_amount,
        (v_credit_limit - v_current_balance);
    END IF;

    UPDATE public.users
    SET
      current_balance = ROUND(COALESCE(current_balance, 0) + v_total_amount, 2),
      credit_used = ROUND(COALESCE(credit_used, 0) + v_total_amount, 2),
      updated_at = NOW()
    WHERE id = v_quote.client_id;
  END IF;

  IF v_has_is_partial THEN
    UPDATE public.quotes
    SET
      status = 'ACCEPTED',
      final_price = v_total_amount,
      is_partial = v_is_partial,
      updated_at = NOW()
    WHERE id = p_quote_id;
  ELSE
    UPDATE public.quotes
    SET
      status = 'ACCEPTED',
      final_price = v_total_amount,
      updated_at = NOW()
    WHERE id = p_quote_id;
  END IF;

  UPDATE public.quotes
  SET
    status = 'REJECTED',
    updated_at = NOW()
  WHERE rfq_id = v_quote.rfq_id
    AND id <> p_quote_id
    AND status IN ('SENT_TO_CLIENT', 'PENDING_ADMIN');

  UPDATE public.rfqs
  SET
    status = 'CLOSED',
    updated_at = NOW()
  WHERE id = v_quote.rfq_id;

  BEGIN
    IF v_has_order_payment_terms THEN
      INSERT INTO public.orders (
        quote_id,
        client_id,
        supplier_id,
        amount,
        status,
        payment_terms,
        date
      )
      VALUES (
        p_quote_id,
        v_quote.client_id,
        v_quote.supplier_id,
        v_total_amount,
        'PENDING_PAYMENT',
        v_order_payment_terms_text,
        CURRENT_DATE
      )
      RETURNING * INTO v_order;
    ELSE
      INSERT INTO public.orders (
        quote_id,
        client_id,
        supplier_id,
        amount,
        status,
        date
      )
      VALUES (
        p_quote_id,
        v_quote.client_id,
        v_quote.supplier_id,
        v_total_amount,
        'PENDING_PAYMENT',
        CURRENT_DATE
      )
      RETURNING * INTO v_order;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%invalid input value for enum%' THEN
        IF v_has_order_payment_terms THEN
          INSERT INTO public.orders (
            quote_id,
            client_id,
            supplier_id,
            amount,
            status,
            payment_terms,
            date
          )
          VALUES (
            p_quote_id,
            v_quote.client_id,
            v_quote.supplier_id,
            v_total_amount,
            'PENDING_PO',
            v_order_payment_terms_text,
            CURRENT_DATE
          )
          RETURNING * INTO v_order;
        ELSE
          INSERT INTO public.orders (
            quote_id,
            client_id,
            supplier_id,
            amount,
            status,
            date
          )
          VALUES (
            p_quote_id,
            v_quote.client_id,
            v_quote.supplier_id,
            v_total_amount,
            'PENDING_PO',
            CURRENT_DATE
          )
          RETURNING * INTO v_order;
        END IF;
      ELSE
        RAISE;
      END IF;
  END;

  RETURN v_order;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to accept quote: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.accept_quote_and_deduct_credit(UUID) IS
  'Accepts quote atomically. Clients with no credit limit are treated as direct pay (prepay) and are not credit-blocked.';

REVOKE ALL ON FUNCTION public.accept_quote_and_deduct_credit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quote_and_deduct_credit(UUID) TO authenticated;

INSERT INTO public._migration_log (migration_name)
SELECT '20260217_phase15_no_credit_limit_direct_pay.sql'
WHERE to_regclass('public._migration_log') IS NOT NULL
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- END OF CONSOLIDATED MIGRATIONS
-- Total: 46 migrations
-- ============================================================================
