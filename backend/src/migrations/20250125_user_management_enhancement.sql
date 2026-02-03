-- User Management Enhancement Migration
-- Adds email verification, password reset, user anonymization, and archival features
-- Rollback plan: See rollback section at the end

BEGIN;

-- Add new columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP,
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS anonymized_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS anonymized_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS anonymized_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_is_verified ON users(is_verified);
CREATE INDEX IF NOT EXISTS idx_users_active_verified ON users(is_active, is_verified);

-- Create archive tables for historical data preservation
CREATE TABLE IF NOT EXISTS archived_orders (
    id SERIAL PRIMARY KEY,
    original_order_id INTEGER NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    user_id INTEGER NOT NULL, -- Keep original user_id for audit trail
    anonymized_user_email VARCHAR(255), -- Store anonymized email for reference
    total_amount DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(20) NOT NULL,
    payment_status VARCHAR(20) NOT NULL,
    shipping_address_id INTEGER,
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archive_reason VARCHAR(100) DEFAULT 'user_deletion'
);

CREATE TABLE IF NOT EXISTS archived_order_items (
    id SERIAL PRIMARY KEY,
    original_item_id INTEGER NOT NULL,
    order_id INTEGER REFERENCES archived_orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    product_name VARCHAR(255), -- Store product name at time of order
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS archived_wallet_transactions (
    id SERIAL PRIMARY KEY,
    original_transaction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL, -- Keep original user_id for audit trail
    anonymized_user_email VARCHAR(255),
    order_id INTEGER,
    amount DECIMAL(10,2) NOT NULL,
    type VARCHAR(20) NOT NULL,
    source VARCHAR(50),
    description VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archive_reason VARCHAR(100) DEFAULT 'user_deletion'
);

CREATE TABLE IF NOT EXISTS archived_user_wallets (
    id SERIAL PRIMARY KEY,
    original_wallet_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    anonymized_user_email VARCHAR(255),
    balance DECIMAL(10,2) NOT NULL,
    total_earned DECIMAL(10,2) NOT NULL,
    total_spent DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archive_reason VARCHAR(100) DEFAULT 'user_deletion'
);

-- Create indexes for archive tables
CREATE INDEX IF NOT EXISTS idx_archived_orders_user ON archived_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_archived_orders_original ON archived_orders(original_order_id);
CREATE INDEX IF NOT EXISTS idx_archived_order_items_order ON archived_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_archived_wallet_transactions_user ON archived_wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_archived_wallet_transactions_original ON archived_wallet_transactions(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_archived_user_wallets_user ON archived_user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_archived_user_wallets_original ON archived_user_wallets(original_wallet_id);

-- Create email verification tokens table for better token management
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for token tables
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- Create user sessions table for better session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info TEXT,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Create audit log table for user actions
CREATE TABLE IF NOT EXISTS user_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_user ON user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_action ON user_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_created ON user_audit_log(created_at);

-- Update existing users to be verified (for existing data)
UPDATE users SET is_verified = true WHERE is_verified IS NULL;

-- Add constraints
ALTER TABLE users 
ADD CONSTRAINT chk_verification_token_expires CHECK (verification_token_expires IS NULL OR verification_token_expires > created_at),
ADD CONSTRAINT chk_reset_token_expires CHECK (reset_token_expires IS NULL OR reset_token_expires > created_at),
ADD CONSTRAINT chk_locked_until CHECK (locked_until IS NULL OR locked_until > created_at),
ADD CONSTRAINT chk_login_attempts CHECK (login_attempts >= 0);

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    -- Clean up expired email verification tokens
    DELETE FROM email_verification_tokens 
    WHERE expires_at < NOW() AND used_at IS NULL;
    
    -- Clean up expired password reset tokens
    DELETE FROM password_reset_tokens 
    WHERE expires_at < NOW() AND used_at IS NULL;
    
    -- Clean up expired sessions
    DELETE FROM user_sessions 
    WHERE expires_at < NOW();
    
    -- Clean up old audit logs (keep last 2 years)
    DELETE FROM user_audit_log 
    WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- Create function to anonymize user data
CREATE OR REPLACE FUNCTION anonymize_user_data(user_id_param INTEGER)
RETURNS void AS $$
DECLARE
    user_record RECORD;
BEGIN
    -- Get user data
    SELECT email, name, phone INTO user_record
    FROM users 
    WHERE id = user_id_param;
    
    -- Anonymize user data
    UPDATE users 
    SET 
        anonymized_email = email,
        anonymized_name = name,
        anonymized_phone = phone,
        email = 'deleted_user_' || user_id_param || '@anonymized.local',
        name = 'Deleted User',
        phone = NULL,
        is_active = false,
        deleted_at = CURRENT_TIMESTAMP,
        verification_token = NULL,
        verification_token_expires = NULL,
        reset_token = NULL,
        reset_token_expires = NULL
    WHERE id = user_id_param;
    
    -- Archive wallet data
    INSERT INTO archived_user_wallets (
        original_wallet_id, user_id, anonymized_user_email, 
        balance, total_earned, total_spent, created_at, updated_at
    )
    SELECT 
        id, user_id, user_record.email,
        balance, total_earned, total_spent, created_at, updated_at
    FROM user_wallets 
    WHERE user_id = user_id_param;
    
    -- Archive wallet transactions
    INSERT INTO archived_wallet_transactions (
        original_transaction_id, user_id, anonymized_user_email,
        order_id, amount, type, source, description, created_at
    )
    SELECT 
        id, user_id, user_record.email,
        order_id, amount, type, source, description, created_at
    FROM wallet_transactions 
    WHERE user_id = user_id_param;
    
    -- Archive orders
    INSERT INTO archived_orders (
        original_order_id, order_number, user_id, anonymized_user_email,
        total_amount, tax_amount, discount_amount, status, payment_status,
        shipping_address_id, notes, created_at, updated_at
    )
    SELECT 
        id, order_number, user_id, user_record.email,
        total_amount, tax_amount, discount_amount, status, payment_status,
        shipping_address_id, notes, created_at, updated_at
    FROM orders 
    WHERE user_id = user_id_param;
    
    -- Archive order items
    INSERT INTO archived_order_items (
        original_item_id, order_id, product_id, product_name,
        quantity, price, total_price, created_at
    )
    SELECT 
        oi.id, ao.id, oi.product_id, p.name,
        oi.quantity, oi.price, oi.total_price, oi.created_at
    FROM order_items oi
    JOIN archived_orders ao ON ao.original_order_id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id IN (
        SELECT original_order_id FROM archived_orders WHERE user_id = user_id_param
    );
    
    -- Delete original data (cascade will handle related records)
    DELETE FROM user_wallets WHERE user_id = user_id_param;
    DELETE FROM wallet_transactions WHERE user_id = user_id_param;
    DELETE FROM orders WHERE user_id = user_id_param;
    DELETE FROM cart_items WHERE user_id = user_id_param;
    DELETE FROM addresses WHERE user_id = user_id_param;
    DELETE FROM user_sessions WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically clean up expired tokens
CREATE OR REPLACE FUNCTION trigger_cleanup_expired_tokens()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM cleanup_expired_tokens();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (runs daily)
CREATE OR REPLACE FUNCTION schedule_token_cleanup()
RETURNS void AS $$
BEGIN
    -- This would typically be set up as a cron job or scheduled task
    -- For now, we'll create a function that can be called manually
    PERFORM cleanup_expired_tokens();
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ROLLBACK INSTRUCTIONS:
-- To rollback this migration:
-- 1. DROP FUNCTION IF EXISTS anonymize_user_data(INTEGER);
-- 2. DROP FUNCTION IF EXISTS cleanup_expired_tokens();
-- 3. DROP FUNCTION IF EXISTS trigger_cleanup_expired_tokens();
-- 4. DROP FUNCTION IF EXISTS schedule_token_cleanup();
-- 5. DROP TABLE IF EXISTS user_audit_log;
-- 6. DROP TABLE IF EXISTS user_sessions;
-- 7. DROP TABLE IF EXISTS password_reset_tokens;
-- 8. DROP TABLE IF EXISTS email_verification_tokens;
-- 9. DROP TABLE IF EXISTS archived_user_wallets;
-- 10. DROP TABLE IF EXISTS archived_wallet_transactions;
-- 11. DROP TABLE IF EXISTS archived_order_items;
-- 12. DROP TABLE IF EXISTS archived_orders;
-- 13. ALTER TABLE users DROP COLUMN IF EXISTS is_verified;
-- 14. ALTER TABLE users DROP COLUMN IF EXISTS verification_token;
-- 15. ALTER TABLE users DROP COLUMN IF EXISTS verification_token_expires;
-- 16. ALTER TABLE users DROP COLUMN IF EXISTS reset_token;
-- 17. ALTER TABLE users DROP COLUMN IF EXISTS reset_token_expires;
-- 18. ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
-- 19. ALTER TABLE users DROP COLUMN IF EXISTS anonymized_email;
-- 20. ALTER TABLE users DROP COLUMN IF EXISTS anonymized_name;
-- 21. ALTER TABLE users DROP COLUMN IF EXISTS anonymized_phone;
-- 22. ALTER TABLE users DROP COLUMN IF EXISTS last_login;
-- 23. ALTER TABLE users DROP COLUMN IF EXISTS login_attempts;
-- 24. ALTER TABLE users DROP COLUMN IF EXISTS locked_until;
