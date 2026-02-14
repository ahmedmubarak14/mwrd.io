-- Add auto_quote_triggered to rfqs if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rfqs' AND column_name = 'auto_quote_triggered') THEN
        ALTER TABLE rfqs ADD COLUMN auto_quote_triggered BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add notes and shipping_cost to quotes if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'notes') THEN
        ALTER TABLE quotes ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'shipping_cost') THEN
        ALTER TABLE quotes ADD COLUMN shipping_cost NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'tax') THEN
        ALTER TABLE quotes ADD COLUMN tax NUMERIC;
    END IF;
END $$;

-- Add flexibility and title to rfqs if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rfqs' AND column_name = 'flexibility') THEN
        ALTER TABLE rfqs ADD COLUMN flexibility TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rfqs' AND column_name = 'title') THEN
        ALTER TABLE rfqs ADD COLUMN title TEXT;
    END IF;
END $$;
