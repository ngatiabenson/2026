-- Create shipping classes table and seed defaults (idempotent)
BEGIN;

CREATE TABLE IF NOT EXISTS shipping_classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  base_fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  weight_limit NUMERIC(18,2),
  size_limit VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
--drop table user_wallets as we use only one source of truth wallets

DROP TABLE user_wallets;

-- Ensure column on products exists for class
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'class'
  ) THEN
    ALTER TABLE products ADD COLUMN class VARCHAR(50) NOT NULL DEFAULT 'Standard';
  END IF;
END $$;

-- Seed default classes
INSERT INTO shipping_classes (name, description, base_fee, weight_limit, size_limit)
VALUES
  
  ('Medium', 'Medium items 1-5kg', 100.00, 5.00, '40x40x30 cm'),
  ('Large', 'Large items 5-15kg', 200.00, 15.00, '80x60x50 cm'),
  ('Heavy', 'Heavy items over 15kg', 500.00, 50.00, '100x80x60 cm'),
  ('Fragile', 'Fragile items requiring special handling', 500.00, 10.00, '60x40x40 cm'),
  ('Standard', 'Standard shipping for regular items', 75.00, 3.00, '30x30x20 cm')
ON CONFLICT (name) DO NOTHING;

COMMIT;


