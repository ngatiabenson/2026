-- Create tables for configurable business policies and provider payment fees
-- Rollback plan: DROP TABLE payment_fees; DROP TABLE business_policies;

BEGIN;

CREATE TABLE IF NOT EXISTS business_policies (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_fees (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  min_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(18,2) NOT NULL DEFAULT 999999999,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('fixed','percent')),
  fee_value NUMERIC(18,4) NOT NULL,
  effective_from TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Seeds
INSERT INTO business_policies (key, value, description) VALUES
  ('cashback_delay_days', '7', 'Days to unlock cashback after delivery'),
  ('lacasa_withdrawal_percent', '1', 'Lacasa withdrawal fee percent applied on gross amount')
ON CONFLICT (key) DO NOTHING;

-- Example Safaricom fee bands for withdrawals (KES)
INSERT INTO payment_fees (provider, transaction_type, min_amount, max_amount, fee_type, fee_value)
VALUES
  ('safaricom','withdrawal',100,500,'fixed',1),
  ('safaricom','withdrawal',501,1000,'fixed',1.8),
  ('safaricom','withdrawal',1001,2500,'fixed',2.5),
  ('safaricom','withdrawal',2501,5000,'fixed',5),
  ('safaricom','withdrawal',5001,10000,'fixed',10),
  ('safaricom','withdrawal',10001,999999999,'fixed',15);

COMMIT;


