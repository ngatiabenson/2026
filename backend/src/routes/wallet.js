import express from "express"
import { query } from "../utils/database.js"
import { authenticateToken } from "../middleware/auth.js"
import { getUserWallet, debitWalletPending, finalizePendingDebit } from "../services/walletService.js"
import { getFees, getPolicy } from "../services/configService.js"

const router = express.Router()

// GET /api/wallet/balance - concise balances
router.get("/balance", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { balance, pending, totalEarned } = await getUserWallet(userId)
    // NOTE: totalEarned is maintained via DB triggers so it can change without code edits
    // Provide both camelCase and snake_case for frontend compatibility
    res.json({ success: true, available: balance, available_balance: balance, pending: pending || 0, pending_balance: pending || 0, totalEarned, total_earned: totalEarned })
  } catch (error) {
    console.error("Wallet balance error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/wallet/statement - paginated ledger
router.get("/statement", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 10, type, status, from, to } = req.query
    const offset = (page - 1) * limit

    const params = [userId]
    const where = ["user_id = $1"]
    if (type) {
      params.push(type)
      where.push(`transaction_type = $${params.length}`)
    }
    if (status) {
      params.push(status)
      where.push(`status = $${params.length}`)
    }
    if (from) {
      params.push(from)
      where.push(`created_at >= $${params.length}`)
    }
    if (to) {
      params.push(to)
      where.push(`created_at <= $${params.length}`)
    }

    const base = `FROM wallet_transactions WHERE ${where.join(" AND ")}`
    const dataRes = await query(
      `SELECT id, transaction_type, amount, status, description, created_at ${base} ORDER BY created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    )
    const countRes = await query(`SELECT COUNT(*) AS total ${base}`, params)

    res.json({
      success: true,
      data: dataRes.rows.map((r) => ({
        id: r.id,
        type: r.transaction_type,
        amount: Number.parseFloat(r.amount),
        status: r.status || "completed",
        description: r.description,
        createdAt: r.created_at,
      })),
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: Number.parseInt(countRes.rows[0].total),
        pages: Math.ceil(countRes.rows[0].total / limit),
      },
    })
  } catch (error) {
    console.error("Wallet statement error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/wallet - Get user's wallet balance and transactions
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 10 } = req.query
    const offset = (page - 1) * limit

    // Get wallet balance (supports legacy table names via service)
    const { balance } = await getUserWallet(userId)

    // Get transaction history
    const transactionsResult = await query(
      `
      SELECT id, transaction_type, amount, description, created_at
      FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset],
    )

    const countResult = await query("SELECT COUNT(*) as total FROM wallet_transactions WHERE user_id = $1", [userId])

    res.json({
      success: true,
      wallet: {
        balance,
        transactions: transactionsResult.rows.map((transaction) => ({
          id: transaction.id,
          type: transaction.transaction_type,
          amount: Number.parseFloat(transaction.amount),
          description: transaction.description,
          createdAt: transaction.created_at,
        })),
      },
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: Number.parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    })
  } catch (error) {
    console.error("Wallet fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/wallet/add-funds - Add funds to wallet
router.post("/add-funds", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" })
    }

    await query("BEGIN")

    try {
      // Create or update wallet
      await query(
        `
        INSERT INTO wallets (user_id, balance) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + $2
      `,
        [userId, amount],
      )

      // Record transaction
      await query(
        "INSERT INTO wallet_transactions (user_id, transaction_type, amount, description) VALUES ($1, 'credit', $2, 'Funds added to wallet')",
        [userId, amount],
      )

      await query("COMMIT")

      res.json({
        success: true,
        message: "Funds added successfully",
      })
    } catch (error) {
      await query("ROLLBACK")
      throw error
    }
  } catch (error) {
    console.error("Add funds error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/wallet/withdraw - Withdraw cashback to M-Pesa
router.post("/withdraw", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { amount, destinationPhone } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" })
    }

    if (!destinationPhone) {
      return res.status(400).json({ error: "Destination phone number is required" })
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^(\+254|0)[0-9]{9}$/
    if (!phoneRegex.test(destinationPhone)) {
      return res.status(400).json({ error: "Invalid phone number format. Use +254XXXXXXXXX or 0XXXXXXXXX" })
    }

    // Check wallet balance
    const { balance } = await getUserWallet(userId)
    if (balance < amount) {
      return res.status(400).json({ error: "Insufficient wallet balance" })
    }

    // Get user's phone from profile to verify it matches
    const userResult = await query("SELECT phone FROM users WHERE id = $1", [userId])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const userPhone = userResult.rows[0].phone
    if (!userPhone || userPhone !== destinationPhone) {
      return res.status(400).json({ error: "Withdrawal phone must match your registered phone number" })
    }

    // Calculate fees
    const lacasaPercent = Number(getPolicy("lacasa_withdrawal_percent", 1))
    const feeBands = getFees("safaricom", "withdrawal")
    const band = feeBands.find((f) => amount >= Number(f.min_amount || 0) && amount <= Number(f.max_amount || Infinity))
    
    const safFee = band
      ? band.fee_type === "percent"
        ? Math.round((Number(band.fee_value) * amount) / 100)
        : Number(band.fee_value)
      : 0
    const lacasaFee = Math.round((lacasaPercent * amount) / 100)
    const totalFees = safFee + lacasaFee
    const netPayout = Math.max(0, amount - totalFees)

    // Generate withdrawal reference
    const reference = `WD-${Date.now()}-${userId}`

    // Debit wallet as pending
    const { transactionId } = await debitWalletPending(
      userId,
      amount,
      `Withdrawal to ${destinationPhone}: gross=${amount}, saf=${safFee}, lacasa=${lacasaFee}, net=${netPayout}`
    )

    // Create withdrawal transaction record
    await query(
      "INSERT INTO wallet_transactions (user_id, transaction_type, amount, description, status, external_reference) VALUES ($1, 'withdrawal', $2, $3, 'pending', $4)",
      [userId, amount, `Withdrawal to ${destinationPhone}`, reference]
    )

    // Simulate M-Pesa B2C (in real implementation, integrate with M-Pesa API)
    // For now, we'll mark it as completed after a short delay
    setTimeout(async () => {
      try {
        await finalizePendingDebit(transactionId, true)
        await query(
          "UPDATE wallet_transactions SET status = 'completed' WHERE external_reference = $1",
          [reference]
        )
        console.log(`[Wallet] Withdrawal completed: ${reference}`)
      } catch (err) {
        console.error(`[Wallet] Failed to finalize withdrawal ${reference}:`, err)
        await finalizePendingDebit(transactionId, false, "b2c_failed")
        await query(
          "UPDATE wallet_transactions SET status = 'failed', description = description || ' - FAILED' WHERE external_reference = $1",
          [reference]
        )
      }
    }, 2000) // 2 second delay to simulate processing

    res.json({
      success: true,
      message: "Withdrawal request submitted successfully",
      reference,
      amount,
      netPayout,
      fees: {
        safaricom: safFee,
        lacasa: lacasaFee,
        total: totalFees
      }
    })
  } catch (error) {
    console.error("Wallet withdrawal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
