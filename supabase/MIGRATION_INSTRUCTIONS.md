# Running Database Migrations on Supabase

## Quick Start

I've created a consolidated migration file that combines all 9 phase migrations into a single file for easy execution.

### Option 1: Run via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your MWRD project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and Paste Migration**
   - Open the file: `supabase/APPLY_14_GAPS_MIGRATION.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Run the Migration**
   - Click "Run" button (or press Cmd+Enter)
   - Wait for completion (may take 30-60 seconds)

5. **Verify Success**
   - Check the output panel for any errors
   - All verification assertions should pass

### Option 2: Run via psql (If you have database credentials)

```bash
# Get your database connection string from Supabase Dashboard > Settings > Database
# It looks like: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Run the consolidated migration
psql "YOUR_DATABASE_URL" -f supabase/APPLY_14_GAPS_MIGRATION.sql
```

### Option 3: Run Individual Migrations

If you prefer to run migrations one at a time (for easier debugging):

```sql
-- In Supabase SQL Editor, run these in order:

-- 1. Phase 1: Core Columns
\i supabase/migrations/20260210_phase1_core_columns.sql

-- 2. Phase 2: quote_items Table
\i supabase/migrations/20260210_phase2_quote_items.sql

-- 3. Phase 3: Partial Quotes
\i supabase/migrations/20260210_phase3_partial_quotes.sql

-- 4. Phase 4a: Reviews
\i supabase/migrations/20260210_phase4a_reviews.sql

-- 5. Phase 4b: Supplier Payouts
\i supabase/migrations/20260210_phase4b_supplier_payouts.sql

-- 6. Phase 4c: Logistics
\i supabase/migrations/20260210_phase4c_logistics.sql

-- 7. Phase 4d: Categories
\i supabase/migrations/20260210_phase4d_categories.sql

-- 8. Phase 5: Notifications
\i supabase/migrations/20260210_phase5_notifications.sql

-- 9. Phase 6: Account Freeze
\i supabase/migrations/20260210_phase6_account_freeze.sql

-- 10. Phase 7: RFQ Expiry Cron Scheduler
\i supabase/migrations/20260210_phase7_rfq_expiry_cron.sql
```

## What Gets Created

### New Tables (10)
- `quote_items` - Per-item quote pricing
- `reviews` - Post-delivery ratings
- `supplier_payouts` - Payout tracking
- `logistics_providers` - Shipping providers
- `categories` - Dynamic category hierarchy
- `notification_templates` - Email templates
- `notification_queue` - Pending notifications
- `notification_log` - Notification audit trail

### New Enums (4)
- `payment_terms` - prepay, net_15, net_30, net_45
- `item_flexibility` - exact_match, open_to_equivalent, open_to_alternatives
- `product_availability` - available, limited_stock, out_of_stock

### New RPC Functions (12)
- `close_expired_rfqs()`
- `accept_quote_and_deduct_credit()` (updated)
- `submit_review()`
- `admin_record_supplier_payout()`
- `admin_update_payout_status()`
- `admin_reorder_categories()`
- `enqueue_notification()`
- `admin_freeze_account()`
- `admin_unfreeze_account()`
- `check_account_not_frozen()`

### New Columns (15+)
- Added to `users`, `orders`, `rfq_items`, `rfqs`, `products`, `quotes`, `shipments`

## Verification

After running the migration, verify success by running this query in SQL Editor:

```sql
-- Check all new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'quote_items', 'reviews', 'supplier_payouts', 
  'logistics_providers', 'categories', 
  'notification_templates', 'notification_queue', 'notification_log'
);

-- Should return 8 rows

-- Check all new enums exist
SELECT typname 
FROM pg_type 
WHERE typname IN (
  'payment_terms', 'item_flexibility', 'product_availability'
);

-- Should return 3 rows

-- Check categories were seeded
SELECT COUNT(*) FROM categories;

-- Should return 20 (5 top-level + 15 subcategories)

-- Check notification templates were seeded
SELECT COUNT(*) FROM notification_templates;

-- Should return 20
```

## Troubleshooting

### If you get errors:

1. **"relation already exists"**: The migration is idempotent, this is expected. The migration will skip existing objects.

2. **"permission denied"**: Make sure you're running as the postgres user (default in Supabase Dashboard).

3. **"function does not exist"**: Some migrations depend on existing functions like `get_user_role()`. Make sure previous migrations were run.

## Next Steps

After successful migration:

1. **Update create_rfq_with_items function** to include freeze check
2. **Test the new features** in your application
3. **Update frontend** to use new columns and features
4. **Set up Edge Function** for notification queue processing

## Edge Workers (Remaining Full-Stack Steps)

Deploy these worker functions after migrations:

```bash
supabase functions deploy process-auto-quotes
supabase functions deploy send-notification
```

Recommended schedules:

- `process-auto-quotes`: every 10-15 minutes
- `send-notification`: every 1-5 minutes

## Files

- **Consolidated Migration**: `supabase/APPLY_14_GAPS_MIGRATION.sql`
- **Individual Migrations**: `supabase/migrations/20260210_phase*.sql`
