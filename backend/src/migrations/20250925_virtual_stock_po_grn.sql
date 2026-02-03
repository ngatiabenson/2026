-- Virtual Stock, Supplier Mapping, Purchase Orders, and GRN schema
-- Rollback (manual order): DROP TABLE grn_items; DROP TABLE grns; DROP TABLE purchase_order_items; DROP TABLE purchase_orders; DROP TABLE supplier_product_overrides; DROP TABLE supplier_category_mappings; DROP TABLE suppliers; DROP TABLE virtual_stock_audit; DROP TABLE virtual_stock;

BEGIN;

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Virtual stock owned by the business (surplus from supplier packs)
CREATE TABLE IF NOT EXISTS virtual_stock (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id)
);

-- Audit trail for virtual stock allocations and adjustments
CREATE TABLE IF NOT EXISTS virtual_stock_audit (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id INTEGER NULL REFERENCES orders(id) ON DELETE SET NULL,
  delta NUMERIC(18,2) NOT NULL,
  reason TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Mapping of product categories/subcategories to default supplier
CREATE TABLE IF NOT EXISTS supplier_category_mappings (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  subcategory_id INTEGER NULL REFERENCES subcategories(id) ON DELETE SET NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Product-level override to default supplier
CREATE TABLE IF NOT EXISTS supplier_product_overrides (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id)
);

-- Purchase Orders master
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  batch_key TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','acknowledged','rejected','partial','fulfilled','cancelled')),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Items within POs
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Goods Received Notes (GRN)
CREATE TABLE IF NOT EXISTS grns (
  id SERIAL PRIMARY KEY,
  grn_number TEXT NOT NULL UNIQUE,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','reconciled')),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Items received in GRN
CREATE TABLE IF NOT EXISTS grn_items (
  id SERIAL PRIMARY KEY,
  grn_id INTEGER NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  ordered_qty NUMERIC(18,2) NOT NULL,
  received_qty NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

COMMIT;


