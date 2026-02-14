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
