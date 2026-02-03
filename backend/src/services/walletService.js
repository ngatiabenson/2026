import { query, transaction } from "../utils/database.js"

// Ensure every balance change is accompanied by a wallet_transactions record

export const getUserWallet = async (userId) => {
  // Support both legacy `user_wallets` and current `wallets` table naming
  const res = await query(
    "SELECT balance, pending_balance, COALESCE(total_earned,0) AS total_earned FROM wallets WHERE user_id = $1",
    [userId],
  ).catch(async () => {
    const legacy = await query(
      "SELECT balance FROM user_wallets WHERE user_id = $1",
      [userId],
    )
    return legacy
  })
  const row = res.rows[0] || {}
  const balance = row.balance != null ? Number.parseFloat(row.balance) : 0
  const pending = row.pending_balance != null ? Number.parseFloat(row.pending_balance) : 0
  const totalEarned = row.total_earned != null ? Number.parseFloat(row.total_earned) : 0
  return { balance, pending, totalEarned }
}

export const creditWallet = async (userId, amount, description = "Credit") => {
  if (amount <= 0) throw new Error("Amount must be positive")
  return await transaction(async (client) => {
    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + EXCLUDED.balance`,
      [userId, amount],
    )

    await client.query(
      `INSERT INTO wallet_transactions (user_id, transaction_type, amount, description)
       VALUES ($1, 'credit', $2, $3)`,
      [userId, amount, description],
    )
  })
}

export const debitWalletPending = async (userId, amount, description = "Debit - pending") => {
  if (amount <= 0) throw new Error("Amount must be positive")
  return await transaction(async (client) => {
    // Hold funds by moving out of balance immediately, record pending status
    const balRes = await client.query("SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE", [userId])
    const current = balRes.rows.length ? Number.parseFloat(balRes.rows[0].balance) : 0
    if (current < amount) throw new Error("Insufficient wallet balance")

    await client.query("UPDATE wallets SET balance = balance - $1 WHERE user_id = $2", [amount, userId])

    const trx = await client.query(
      `INSERT INTO wallet_transactions (user_id, transaction_type, amount, status, description)
       VALUES ($1, 'debit', $2, 'pending', $3)
       RETURNING id`,
      [userId, amount, description],
    )
    return { transactionId: trx.rows[0].id }
  })
}

export const finalizePendingDebit = async (transactionId, success, failureReason = null) => {
  return await transaction(async (client) => {
    const res = await client.query(
      `SELECT id, user_id, amount, status FROM wallet_transactions WHERE id = $1 FOR UPDATE`,
      [transactionId],
    )
    if (!res.rows.length) throw new Error("Transaction not found")
    const trx = res.rows[0]
    if (trx.status !== "pending") return { id: trx.id, status: trx.status }

    if (success) {
      await client.query(
        `UPDATE wallet_transactions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [transactionId],
      )
      return { id: transactionId, status: "completed" }
    } else {
      // rollback wallet debit
      await client.query("UPDATE wallets SET balance = balance + $1 WHERE user_id = $2", [trx.amount, trx.user_id])
      await client.query(
        `UPDATE wallet_transactions SET status = 'failed', description = COALESCE(description,'') || ' | rollback: ' || $2, updated_at = NOW() WHERE id = $1`,
        [transactionId, failureReason || "provider_failed"],
      )
      return { id: transactionId, status: "failed" }
    }
  })
}


