# 🗄️ Antigravity — MWRD Database/Backend Specialist Assignment

## Your Role
You are a **Database/Backend Specialist** working on the MWRD B2B Managed Marketplace Platform. Your job is to implement **14 specific database/backend gaps** identified in a product-code alignment analysis. You will write PostgreSQL migrations, RPC functions, RLS policies, triggers, and indexes for a **Supabase** (PostgreSQL) backend. You will NOT modify React components or frontend code — that work is handled by the frontend specialist (Codex).

---

## Project Context

### What is MWRD?
MWRD is a B2B managed marketplace SaaS platform acting as a broker between clients and suppliers:
- **Anonymity**: Clients see `Supplier-XXXX`, suppliers see `Client-XXXX`
- **Margin brokerage**: MWRD adds configurable margins to supplier prices
- **Three portals**: Client, Supplier, Admin
- **Currency**: SAR (Saudi Riyal), stored as `DECIMAL(12,2)`

### Database Tech Stack
- **Supabase** (managed PostgreSQL 15+)
- **Row Level Security (RLS)** on ALL tables
- **RPC functions** with `SECURITY DEFINER` for atomic multi-table operations
- **auth.uid()** and JWT claims for user identification
- **Enums** for status fields

### Current Schema Overview

#### Core Tables
```sql
-- users (extends auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CLIENT',     -- ENUM: GUEST, CLIENT, SUPPLIER, ADMIN
  company_name TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  public_id TEXT UNIQUE,                         -- Client-XXXX or Supplier-XXXX (auto-generated)
  rating DECIMAL(3, 2) CHECK (rating >= 0 AND rating <= 5),
  status user_status DEFAULT 'PENDING',          -- ENUM: ACTIVE, PENDING, APPROVED, REJECTED, REQUIRES_ATTENTION, DEACTIVATED
  kyc_status kyc_status DEFAULT 'INCOMPLETE',    -- ENUM: VERIFIED, IN_REVIEW, REJECTED, INCOMPLETE
  credit_limit DECIMAL(12, 2) DEFAULT 0,
  current_balance DECIMAL(12, 2) DEFAULT 0,
  client_margin DECIMAL(5, 2),                   -- Per-client margin override (nullable)
  date_joined DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  image TEXT NOT NULL,
  status product_status NOT NULL DEFAULT 'PENDING',  -- ENUM: PENDING, APPROVED, REJECTED
  cost_price DECIMAL(10, 2),
  sku TEXT,
  stock_quantity INTEGER DEFAULT 0,
  brand TEXT,
  master_product_id UUID REFERENCES master_products(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- rfqs (Request for Quotation)
CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status rfq_status NOT NULL DEFAULT 'OPEN',     -- ENUM: OPEN, QUOTED, CLOSED
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  auto_quote_triggered BOOLEAN DEFAULT FALSE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- rfq_items
CREATE TABLE rfq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  allow_alternatives BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- quotes (ONE quote per supplier per RFQ — currently aggregate pricing)
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_price DECIMAL(10, 2) NOT NULL CHECK (supplier_price > 0),
  lead_time TEXT NOT NULL,
  margin_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  final_price DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- Auto-calculated by trigger
  status quote_status NOT NULL DEFAULT 'PENDING_ADMIN',  -- ENUM: PENDING_ADMIN, SENT_TO_CLIENT, ACCEPTED, REJECTED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfq_id, supplier_id)
);

-- orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  status order_status NOT NULL,
  system_po_number TEXT,
  client_po_file TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_link_url TEXT,
  payment_link_sent_at TIMESTAMPTZ,
  shipment_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- margin_settings (global + per-category)
CREATE TABLE margin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT,
  margin_percent DECIMAL(5, 2) NOT NULL CHECK (margin_percent >= 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category)
);

-- Other existing tables: leads, master_products, transactions, client_margins,
-- credit_limit_adjustments, order_documents, payment_audit_logs, admin_audit_log,
-- shipments, payments, invoices, refunds, system_settings, login_attempts,
-- inventory_stock, custom_item_requests
```

#### Existing Key Functions
```sql
-- Role-checking helper (used in ALL RLS policies)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ ... $$;

-- Auto-generate public IDs (Client-XXXX / Supplier-XXXX)
CREATE OR REPLACE FUNCTION auto_generate_public_id() RETURNS TRIGGER;

-- Auto-calculate final_price on quote insert/update
CREATE OR REPLACE FUNCTION calculate_final_price() RETURNS TRIGGER;
-- NEW.final_price := NEW.supplier_price * (1 + NEW.margin_percent / 100);

-- Atomic quote acceptance with credit deduction
CREATE OR REPLACE FUNCTION accept_quote_and_deduct_credit(p_quote_id UUID) RETURNS JSONB;

-- Atomic RFQ creation with items
CREATE OR REPLACE FUNCTION create_rfq_with_items(...) RETURNS JSONB;

-- Admin credit limit adjustment
CREATE OR REPLACE FUNCTION admin_adjust_client_credit_limit(...) RETURNS TABLE;
```

#### RLS Pattern (used on ALL tables)
```sql
-- Standard pattern:
ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;

-- Users see their own data
CREATE POLICY "Users can view own data" ON tablename FOR SELECT
  USING (auth.uid() = user_id_column);

-- Admins see everything
CREATE POLICY "Admins can view all" ON tablename FOR SELECT
  USING (get_user_role() = 'ADMIN');

-- Admins can modify everything
CREATE POLICY "Admins can update all" ON tablename FOR UPDATE
  USING (get_user_role() = 'ADMIN');
```

---

## Critical Patterns You MUST Follow

### 1. Migration File Naming
```
supabase/migrations/YYYYMMDD_descriptive_name.sql
-- Example: 20260210_add_quote_items_table.sql
```

### 2. RPC Function Pattern
```sql
CREATE OR REPLACE FUNCTION function_name(p_param1 UUID, p_param2 TEXT)
RETURNS return_type
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_variable RECORD;
BEGIN
  -- Authorization check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Role check (if admin-only)
  IF get_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Business logic...

  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

### 3. Idempotent Migrations (use DO blocks for safety)
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'tablename' AND column_name = 'new_column') THEN
    ALTER TABLE tablename ADD COLUMN new_column TYPE DEFAULT value;
  END IF;
END $$;
```

### 4. RLS Policy Idempotent Creation
```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mytable' AND policyname = 'Policy name') THEN
    CREATE POLICY "Policy name" ON mytable FOR SELECT TO authenticated
      USING (condition);
  END IF;
END $$;
```

### 5. Trigger Pattern
```sql
CREATE OR REPLACE FUNCTION trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  -- Logic
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to ensure idempotency
DROP TRIGGER IF EXISTS trigger_name ON tablename;
CREATE TRIGGER trigger_name
  BEFORE INSERT OR UPDATE ON tablename
  FOR EACH ROW
  EXECUTE FUNCTION trigger_function();
```

---

## Your Assigned Gaps (14 Items)

### GAP #1 (Schema Part): Per-item Quote Pricing — `quote_items` Table
**Priority**: Critical
**What to build**: A `quote_items` table that stores per-item pricing for multi-item RFQ quotes.
**Current state**: Quotes have a single `supplier_price` and `final_price` on the `quotes` table (aggregate for entire RFQ). There is no per-item breakdown.
**Requirements**:
```sql
CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  rfq_item_id UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  unit_price DECIMAL(12, 2) NOT NULL CHECK (unit_price >= 0),   -- Supplier's cost per unit
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total DECIMAL(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  margin_percent DECIMAL(5, 2),                                   -- Per-item margin (nullable, inherits from quote)
  final_unit_price DECIMAL(12, 2),                                -- Unit price + margin (calculated by trigger)
  final_line_total DECIMAL(12, 2),                                -- final_unit_price * quantity (calculated by trigger)
  alternative_product_id UUID REFERENCES products(id),            -- If supplier offered alternative
  is_quoted BOOLEAN NOT NULL DEFAULT TRUE,                        -- FALSE = supplier skipped this item
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- Add indexes on `quote_id`, `rfq_item_id`, `product_id`
- Add RLS: Suppliers see their own quote items, clients see quote items for quotes sent to them, admins see all
- Create a trigger to calculate `final_unit_price` and `final_line_total` when margin is set
- **IMPORTANT**: The existing `quotes` table `supplier_price` and `final_price` should become the SUM of all `quote_items`. Create a trigger or update the RPC to keep them in sync.
- Add a `type` column to `quotes` table: `ALTER TABLE quotes ADD COLUMN type TEXT DEFAULT 'custom' CHECK (type IN ('auto', 'custom'));`
**Deliverables**: Migration file, RLS policies, indexes, triggers

### GAP #2 (Schema Part): Partial Quote Support
**Priority**: Critical
**What to build**: Support for suppliers quoting only some items in an RFQ.
**Requirements**:
- The `quote_items.is_quoted` field (from Gap #1) handles this
- When a supplier submits a partial quote, `is_quoted = FALSE` for skipped items
- Modify the `accept_quote_and_deduct_credit` RPC to handle partial quotes:
  - Calculate total from only `is_quoted = TRUE` items
  - Pass the partial flag through to the order
- Add `is_partial BOOLEAN DEFAULT FALSE` to `quotes` table
**Deliverables**: RPC update, quote table alteration

### GAP #6: Payment Terms per Client
**Priority**: Critical
**What to build**: Per-client payment terms field.
**Requirements**:
```sql
-- Create enum
CREATE TYPE payment_terms AS ENUM ('prepay', 'net_15', 'net_30', 'net_45');

-- Add column to users
ALTER TABLE users ADD COLUMN payment_terms payment_terms DEFAULT 'net_30';
```
- Admin should be able to set this via existing user update flow
- The `accept_quote_and_deduct_credit` RPC should include `payment_terms` in the created order
- Add `payment_terms` column to `orders` table as well:
  `ALTER TABLE orders ADD COLUMN payment_terms payment_terms;`
**Deliverables**: Migration with enum, column additions, RPC update

### GAP #6a: Supplier Payout System
**Priority**: Critical
**What to build**: Manual supplier payout tracking system.
**Requirements**:
```sql
CREATE TABLE supplier_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED')),
  payment_method TEXT,                                -- e.g., 'bank_transfer', 'check'
  reference_number TEXT,                              -- Bank transfer reference
  paid_at TIMESTAMPTZ,                                -- When payout was completed
  created_by UUID REFERENCES users(id),               -- Admin who created the entry
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- RLS: Suppliers can view their own payouts. Admins can CRUD all.
- Index on `supplier_id`, `order_id`, `status`
- Create RPC: `admin_record_supplier_payout(p_supplier_id, p_order_id, p_amount, p_payment_method, p_reference_number, p_notes)` — admin-only
- Add updated_at trigger
**Deliverables**: Table, RLS, indexes, RPC, trigger

### GAP #7: RFQ Item Flexibility Preference
**Priority**: High
**What to build**: Flexibility preference field on RFQ items.
**Requirements**:
```sql
CREATE TYPE item_flexibility AS ENUM ('exact_match', 'open_to_equivalent', 'open_to_alternatives');

ALTER TABLE rfq_items ADD COLUMN flexibility item_flexibility DEFAULT 'exact_match';
```
- Update the `create_rfq_with_items` RPC to accept and persist `flexibility` per item
- No RLS changes needed (rfq_items inherits from rfqs)
**Deliverables**: Enum, column addition, RPC update

### GAP #8: RFQ Expiry Date
**Priority**: High
**What to build**: RFQ expiry timestamp and auto-close mechanism.
**Requirements**:
```sql
ALTER TABLE rfqs ADD COLUMN expires_at TIMESTAMPTZ;
```
- Update `create_rfq_with_items` RPC to accept `p_expires_at` parameter
- Create a function to auto-close expired RFQs:
```sql
CREATE OR REPLACE FUNCTION close_expired_rfqs()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE rfqs SET status = 'CLOSED'
  WHERE status = 'OPEN' AND expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```
- This function can be called periodically by a Supabase Edge Function or cron job
**Deliverables**: Column addition, RPC update, auto-close function

### GAP #9: Alternative Product Offering (Schema)
**Priority**: High
**What to build**: Support for suppliers offering alternative products in quotes.
**Requirements**:
- Already handled in Gap #1's `quote_items.alternative_product_id` column
- Add a constraint: alternative_product_id must be a product owned by the same supplier
- Create validation in the quote submission RPC:
```sql
-- When inserting a quote_item with alternative_product_id:
-- Verify the alternative product belongs to the same supplier
IF v_alt_product.supplier_id <> p_supplier_id THEN
  RAISE EXCEPTION 'Alternative product must belong to the quoting supplier';
END IF;
```
**Deliverables**: Constraint, validation in RPC

### GAP #12: Rating/Review System
**Priority**: High
**What to build**: Reviews table for post-delivery ratings.
**Requirements**:
```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) UNIQUE,  -- One review per order
  reviewer_id UUID NOT NULL REFERENCES users(id),        -- The client
  supplier_id UUID NOT NULL REFERENCES users(id),        -- The supplier being rated
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- RLS: Clients can create reviews for their delivered orders. Clients and suppliers can view reviews. Admins can view/delete.
- Create RPC `submit_review(p_order_id, p_rating, p_comment)`:
  - Verify order status is DELIVERED or COMPLETED
  - Verify caller is the order's client
  - Verify no existing review for this order
  - Insert review
  - Update supplier's average rating in `users.rating`:
    ```sql
    UPDATE users SET rating = (
      SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE supplier_id = v_supplier_id
    ) WHERE id = v_supplier_id;
    ```
- Index on `supplier_id`, `order_id`
**Deliverables**: Table, RLS, RPC, indexes, rating recalculation

### GAP #15: Email Notification Infrastructure
**Priority**: Medium
**What to build**: Database tables to support email notifications.
**Requirements**:
```sql
-- Notification templates
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL UNIQUE,  -- e.g., 'rfq_submitted', 'quote_received', 'order_delivered'
  subject_template TEXT NOT NULL,   -- Subject with {{variables}}
  body_template TEXT NOT NULL,      -- HTML body with {{variables}}
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification queue
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  template_id UUID REFERENCES notification_templates(id),
  variables JSONB NOT NULL DEFAULT '{}',  -- Template variables
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification log (for audit)
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES notification_queue(id),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',  -- email, in_app, sms (future)
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- RLS: Admins can CRUD all. Users can view their own notification_log entries.
- Indexes on queue status, recipient, event_type
- Seed the notification_templates with the ~20 events from the PRD notification matrix:
  - `interest_form_submitted`, `account_created`, `new_product_request`, `product_approved`, `product_rejected`, `rfq_submitted`, `auto_quote_generated`, `quote_received`, `quote_accepted`, `quote_rejected`, `order_ready_for_pickup`, `pickup_scheduled`, `order_picked_up`, `order_in_transit`, `order_delivered`, `review_submitted`, `payment_reminder`, `payment_processed`, `account_frozen`
- Create RPC `enqueue_notification(p_user_id, p_event_type, p_variables)`:
  - Looks up template by event_type
  - Inserts into notification_queue
  - Returns queue entry ID
**Deliverables**: 3 tables, RLS, indexes, template seed data, RPC

### GAP #16: Logistics Provider CRUD
**Priority**: Medium
**What to build**: Logistics providers management table.
**Requirements**:
```sql
CREATE TABLE logistics_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  service_areas TEXT[],          -- Array of area names
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- Add `logistics_provider_id UUID REFERENCES logistics_providers(id)` to `shipments` table (or `orders` table depending on where shipment data lives)
- RLS: Admin-only CRUD
- updated_at trigger
**Deliverables**: Table, column addition, RLS, trigger

### GAP #19: Dynamic Category Hierarchy
**Priority**: Medium
**What to build**: Replace hardcoded categories with a database-driven hierarchy.
**Requirements**:
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id),    -- NULL = top-level category
  icon TEXT,                                     -- Material icon name
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- Seed with current hardcoded categories (Office, IT Supplies, Breakroom, Janitorial, Maintenance) and their subcategories
- RLS: Everyone can read active categories. Admins can CRUD.
- Index on `parent_id`, `sort_order`
- Create RPC `admin_reorder_categories(p_category_ids UUID[], p_sort_orders INTEGER[])` for drag-drop reorder
**Deliverables**: Table, seed data, RLS, RPC

### GAP #22: Account Suspend/Freeze with Guards
**Priority**: Medium
**What to build**: Account freeze mechanism that blocks RFQ creation.
**Requirements**:
```sql
ALTER TABLE users ADD COLUMN frozen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN freeze_reason TEXT;
ALTER TABLE users ADD COLUMN frozen_by UUID REFERENCES users(id);
```
- Modify `create_rfq_with_items` RPC to check:
```sql
SELECT frozen_at INTO v_frozen FROM users WHERE id = p_client_id;
IF v_frozen IS NOT NULL THEN
  RAISE EXCEPTION 'Account is frozen. Contact support.';
END IF;
```
- Create RPC `admin_freeze_account(p_user_id, p_reason)` and `admin_unfreeze_account(p_user_id)`:
  - Sets/clears `frozen_at`, `freeze_reason`, `frozen_by`
  - Logs action to `admin_audit_log`
  - Optionally enqueues notification (if notification system is ready)
**Deliverables**: Column additions, RPCs, RFQ guard update, audit logging

### GAP #23: Availability Status Toggle
**Priority**: Medium
**What to build**: Manual availability status per product (beyond stock quantity).
**Requirements**:
```sql
CREATE TYPE product_availability AS ENUM ('available', 'limited_stock', 'out_of_stock');

ALTER TABLE products ADD COLUMN availability_status product_availability DEFAULT 'available';
```
- Update product RLS: Clients should NOT see `out_of_stock` products:
```sql
-- Modify the existing "Anyone can view approved products" policy:
DROP POLICY IF EXISTS "Anyone can view approved products" ON products;
CREATE POLICY "Anyone can view approved available products" ON products FOR SELECT
  USING (
    status = 'APPROVED'
    AND (availability_status IS NULL OR availability_status <> 'out_of_stock')
  );
```
- Keep existing supplier/admin policies unchanged (they can see all their products)
**Deliverables**: Enum, column addition, RLS policy update

### GAP #33: Lead Time per Product
**Priority**: Low
**What to build**: Default lead time field on products.
**Requirements**:
```sql
ALTER TABLE products ADD COLUMN lead_time_days INTEGER;
```
- This value should be used by the auto-quote service as default lead time instead of hardcoded "3 Days"
- No RLS changes needed (inherits from products table)
**Deliverables**: Column addition

---

## Boundaries

### DO:
- Write all SQL as idempotent migrations (use `IF NOT EXISTS`, `DO $$ BEGIN ... END $$`)
- Follow the existing naming conventions: `snake_case` for all database objects
- Add appropriate indexes for all foreign keys and frequently queried columns
- Set `SECURITY DEFINER` and `SET search_path = public, pg_temp` on ALL RPC functions
- Add `updated_at` triggers on all new tables with timestamp columns
- Test that RLS policies don't break existing functionality
- Wrap multi-statement operations in transactions where needed

### DO NOT:
- Do NOT modify React/TypeScript code
- Do NOT change existing enum values (only ADD new values if needed)
- Do NOT drop existing tables or columns
- Do NOT modify existing RPC functions UNLESS explicitly listed in your assignments
- Do NOT remove existing RLS policies (only add new ones or modify as specified)
- Do NOT change the `auth.users` table structure

### Enum Modification Safety
When adding values to existing enums:
```sql
-- Safe way to add enum values
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PENDING_ADMIN_CONFIRMATION';
```

---

## Migration Delivery Order (Suggested Sequence)

1. **Phase 1**: Core schema additions (Gaps #6, #7, #8, #23, #33) — simple column additions
2. **Phase 2**: `quote_items` table (Gap #1) — foundational for other features
3. **Phase 3**: Partial quotes + alternatives (Gaps #2, #9) — builds on quote_items
4. **Phase 4**: New tables: reviews, supplier_payouts, logistics_providers, categories (Gaps #12, #6a, #16, #19)
5. **Phase 5**: Notification infrastructure (Gap #15)
6. **Phase 6**: Account freeze guards (Gap #22)

Each migration file should be self-contained and runnable independently.

---

## Deliverables Checklist
- [ ] Gap #1: `quote_items` table + type column on quotes + triggers + RLS
- [ ] Gap #2: Partial quote fields + RPC update
- [ ] Gap #6: `payment_terms` enum + columns on users and orders
- [ ] Gap #6a: `supplier_payouts` table + RLS + RPC
- [ ] Gap #7: `item_flexibility` enum + rfq_items column + RPC update
- [ ] Gap #8: `expires_at` column + auto-close function + RPC update
- [ ] Gap #9: Alternative product constraint + RPC validation
- [ ] Gap #12: `reviews` table + RLS + submit_review RPC + rating recalculation
- [ ] Gap #15: Notification tables (templates, queue, log) + seed data + enqueue RPC
- [ ] Gap #16: `logistics_providers` table + FK on shipments + RLS
- [ ] Gap #19: `categories` table + seed data + reorder RPC
- [ ] Gap #22: Freeze columns + freeze/unfreeze RPCs + RFQ guard
- [ ] Gap #23: `product_availability` enum + column + RLS update
- [ ] Gap #33: `lead_time_days` column on products

## Quality Standards
1. All migrations must be idempotent (safe to run multiple times)
2. All new tables must have RLS enabled with appropriate policies
3. All RPC functions must include authorization checks
4. All decimal money fields must use `DECIMAL(12, 2)`
5. All timestamp fields should use `TIMESTAMPTZ`
6. Add comments to complex SQL logic
7. No raw string concatenation in SQL (use parameterized queries)
8. All foreign keys must have corresponding indexes
