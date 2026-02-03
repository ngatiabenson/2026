import { query, transaction } from "../utils/database.js"
import { getPolicy } from "./configService.js"

// Release pending cashback after policy delay if order delivered and not refunded
export const releaseDueCashbacks = async () => {
  const delayDays = Number(getPolicy("cashback_delay_days", 7))
  const now = new Date()

  return await transaction(async (client) => {
    // Find wallet cashback transactions that are pending release based on created_at + delayDays and associated orders delivered
    const res = await client.query(
      `SELECT wt.id, wt.user_id, wt.amount
       FROM wallet_transactions wt
       JOIN orders o ON (wt.meta->>'order_id')::INT = o.id
       WHERE wt.transaction_type = 'cashback'
         AND wt.status = 'pending'
         AND o.status = 'delivered'
         AND wt.created_at <= NOW() - INTERVAL '${delayDays} days'
      `,
    )

    for (const row of res.rows) {
      await client.query(`UPDATE wallets SET balance = balance + $1, pending_balance = GREATEST(0, pending_balance - $1), updated_at = NOW() WHERE user_id = $2`, [row.amount, row.user_id])
      await client.query(`UPDATE wallet_transactions SET status = 'completed', updated_at = NOW() WHERE id = $1`, [row.id])
    }

    return { releasedCount: res.rows.length }
  })
}

// Reverse cashback if refund processed within window (simple hook; actual refund flow not shown here)
export const reverseCashbackForOrder = async (client, orderId) => {
  const txs = await client.query(`SELECT id, user_id, amount, status FROM wallet_transactions WHERE transaction_type = 'cashback' AND (meta->>'order_id')::INT = $1`, [orderId])
  for (const t of txs.rows) {
    if (t.status === 'completed') {
      // Subtract from balance and total_earned is managed by trigger only on completed credits; reversal should not re-increment
      await client.query(`UPDATE wallets SET balance = GREATEST(0, balance - $1), updated_at = NOW() WHERE user_id = $2`, [t.amount, t.user_id])
    } else if (t.status === 'pending') {
      await client.query(`UPDATE wallets SET pending_balance = GREATEST(0, pending_balance - $1), updated_at = NOW() WHERE user_id = $2`, [t.amount, t.user_id])
    }
    await client.query(`UPDATE wallet_transactions SET status = 'void', updated_at = NOW() WHERE id = $1`, [t.id])
  }
}


