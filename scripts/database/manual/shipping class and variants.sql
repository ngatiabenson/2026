-- =========================================
-- SAFE Migration: Class + Product Variants
-- Can be re-run without errors
-- =========================================

--Add class column ONLY if it does not exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'products'
        AND column_name = 'class'
    ) THEN
        ALTER TABLE products
        ADD COLUMN class VARCHAR(50) NOT NULL DEFAULT 'Standard';

        ALTER TABLE products
        ADD CONSTRAINT products_class_check
        CHECK (class IN ('Medium', 'Large', 'Heavy', 'Fragile', 'Standard'));
    END IF;
END $$;

--Create product_variants table if missing
CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    variant_type VARCHAR(50) NOT NULL,
    variant_value VARCHAR(100) NOT NULL,
    variant_code VARCHAR(50),
    price_adjustment DECIMAL(10,2) DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, variant_type, variant_value)
);

--Create shipping_classes table if missing
CREATE TABLE IF NOT EXISTS shipping_classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    base_fee DECIMAL(10,2) DEFAULT 0.00,
    weight_limit DECIMAL(8,2),
    size_limit VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--Insert default shipping classes (avoid duplicates)
INSERT INTO shipping_classes (name, description, base_fee, weight_limit, size_limit)
VALUES
('Medium', 'Medium items 1-5kg', 100.00, 5.00, '40x40x30 cm'),
('Large', 'Large items 5-15kg', 200.00, 15.00, '80x60x50 cm'),
('Heavy', 'Heavy items over 15kg', 500.00, 50.00, '100x80x60 cm'),
('Fragile', 'Fragile items requiring special handling', 500.00, 10.00, '60x40x40 cm'),
('Standard', 'Standard shipping for regular items', 200.00, 3.00, '30x30x20 cm')
ON CONFLICT (name) DO NOTHING;

-- Indexes (safe)
CREATE INDEX IF NOT EXISTS idx_products_class ON products(class);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_type ON product_variants(variant_type);
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(is_active);
CREATE INDEX IF NOT EXISTS idx_shipping_classes_active ON shipping_classes(is_active);

--Ensure no NULL classes exist
UPDATE products
SET class = 'Standard'
WHERE class IS NULL;

--Documentation comments
COMMENT ON COLUMN products.class IS
'Shipping class for delivery fee calculation: Medium, Large, Heavy, Fragile, Standard';

COMMENT ON TABLE product_variants IS
'Product variations like colors, sizes, materials with individual pricing and stock';

COMMENT ON TABLE shipping_classes IS
'Shipping class definitions with fees and restrictions';
--drop table user_wallets as we use only one source of truth wallets

DROP TABLE user_wallets;