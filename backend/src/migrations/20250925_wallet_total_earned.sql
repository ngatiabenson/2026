-- Add total_earned to wallets and triggers to keep it in sync on cashback credits
-- Rollback plan: ALTER TABLE wallets DROP COLUMN total_earned; DROP TRIGGERs and functions.

BEGIN;

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS total_earned NUMERIC(18,2) NOT NULL DEFAULT 0;

-- Function: increment total_earned when a cashback transaction completes
CREATE OR REPLACE FUNCTION fn_wallet_cashback_completed_increment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only count completed cashback credits towards total_earned
  IF (TG_OP = 'INSERT') THEN
    IF NEW.transaction_type = 'cashback' AND (NEW.status IS NULL OR NEW.status = 'completed') THEN
      UPDATE wallets SET total_earned = total_earned + NEW.amount, updated_at = NOW()
      WHERE user_id = NEW.user_id;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.transaction_type = 'cashback' AND OLD.status <> 'completed' AND NEW.status = 'completed' THEN
      UPDATE wallets SET total_earned = total_earned + NEW.amount, updated_at = NOW()
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger after insert on wallet_transactions
DROP TRIGGER IF EXISTS trg_wallet_tx_insert_cashback ON wallet_transactions;
CREATE TRIGGER trg_wallet_tx_insert_cashback
AFTER INSERT ON wallet_transactions
FOR EACH ROW EXECUTE FUNCTION fn_wallet_cashback_completed_increment();

-- Trigger after update of status on wallet_transactions
DROP TRIGGER IF EXISTS trg_wallet_tx_update_status_cashback ON wallet_transactions;
CREATE TRIGGER trg_wallet_tx_update_status_cashback
AFTER UPDATE OF status ON wallet_transactions
FOR EACH ROW EXECUTE FUNCTION fn_wallet_cashback_completed_increment();




COMMIT;



