-- Create wallet tables if missing and align with ledger rules
-- Rollback plan: DROP TABLE wallet_transactions; DROP TABLE wallets; (only if created by this migration)

BEGIN;

CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  pending_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
ALTER TABLE wallets
ADD COLUMN total_earned NUMERIC DEFAULT 0,
ADD COLUMN total_spent NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit','debit','cashback','withdrawal','refund')),
  source TEXT NULL,
  amount NUMERIC(18,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','void')),
  meta JSONB NULL,
  description TEXT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Optional backfill: if legacy user_wallets exists, copy balances into wallets where missing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='user_wallets') THEN
    INSERT INTO wallets (user_id, balance)
    SELECT uw.user_id, COALESCE(uw.balance,0)
    FROM user_wallets uw
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

COMMIT;


