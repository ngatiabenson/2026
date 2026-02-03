import express from "express"
import { authenticateToken } from "../middleware/auth.js"
import { getFees, getPolicy } from "../services/configService.js"
import { getUserWallet, debitWalletPending, finalizePendingDebit } from "../services/walletService.js"
import { releaseDueCashbacks } from "../services/cashbackService.js"
import { initiateMpesaCharge, verifyTransaction } from "../services/paystackService.js"

const router = express.Router()

// PAYSTACK SERVICE CODE

//paystack initiate route
// POST /api/payments/paystack/initiate
router.post("/paystack/initiate", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { amount, phone } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" })
    }

    const formattedPhone = normalizeKenyanPhone(phone)

    // 1️⃣ Debit wallet as pending
    const { transactionId } = await debitWalletPending(
      userId,
      amount,
      "Paystack checkout"
    )

    // 2️⃣ Initiate Paystack STK
    const paystackData = await initiateMpesaCharge({
      email: req.user.email,
      amount,
      phone: formattedPhone,
      metadata: {
        userId,
        transactionId,
      },
    })

    res.json({
      success: true,
      reference: paystackData.reference,
    })
  } catch (err) {
    console.error("Paystack initiate error:", err.response?.data || err.message)
    res.status(500).json({ error: "Payment initiation failed" })
  }
})
// Paystack verify route
// POST /api/payments/paystack/verify
router.post("/paystack/verify", authenticateToken, async (req, res) => {
  try {
    const { reference } = req.body
    if (!reference) {
      return res.status(400).json({ error: "Reference required" })
    }

    const data = await verifyTransaction(reference)

    if (data.status !== "success") {
      return res.status(400).json({ error: "Payment not successful" })
    }

    const { transactionId } = data.metadata

    // 3️⃣ Finalize wallet debit
    await finalizePendingDebit(transactionId, true)

    res.json({ success: true })
  } catch (err) {
    console.error("Paystack verify error:", err.response?.data || err.message)
    res.status(500).json({ error: "Verification failed" })
  }
})
//end of paystack
// GET /api/payments/withdraw/quote?amount=1000
router.get("/withdraw/quote", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const amount = Number(req.query.amount || 0)
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" })

    const { balance } = await getUserWallet(userId)
    if (balance < amount) return res.status(400).json({ error: "Insufficient wallet balance" })

    // Read Lacasa withdrawal percent from business_policies so it can be updated without code changes
    // NOTE: This value comes from `business_policies` table so it can be updated without touching code.
    const lacasaPercent = Number(getPolicy("lacasa_withdrawal_percent", 1))

    // Read Safaricom fee bands from `payment_fees` table
    // NOTE: Fee bands are loaded from `payment_fees` to avoid hardcoding provider fees.
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

    res.json({
      success: true,
      quote: {
        amount,
        safaricomFee: safFee,
        lacasaFee,
        totalFees,
        netPayout,
      },
    })
  } catch (err) {
    console.error("Withdraw quote error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/payments/withdraw { amount, confirm }
router.post("/withdraw", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const amount = Number(req.body.amount || 0)
    const confirm = Boolean(req.body.confirm)
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" })
    if (!confirm) return res.status(400).json({ error: "Confirmation required" })

    // Calculate fees as in quote
    const lacasaPercent = Number(getPolicy("lacasa_withdrawal_percent", 1)) // NOTE: read from `business_policies`
    const feeBands = getFees("safaricom", "withdrawal") // NOTE: read from `payment_fees`
    const band = feeBands.find((f) => amount >= Number(f.min_amount || 0) && amount <= Number(f.max_amount || Infinity))
    const safFee = band
      ? band.fee_type === "percent"
        ? Math.round((Number(band.fee_value) * amount) / 100)
        : Number(band.fee_value)
      : 0
    const lacasaFee = Math.round((lacasaPercent * amount) / 100)
    const totalFees = safFee + lacasaFee
    const netPayout = Math.max(0, amount - totalFees)

    // Debit wallet as pending so we can rollback if B2C fails
    const { transactionId } = await debitWalletPending(
      userId,
      amount,
      `Withdrawal request: gross=${amount}, saf=${safFee}, lacasa=${lacasaFee}`,
    )

    // Trigger provider payout (placeholder; integrate adapter later)
    // On real integration, ensure idempotency and proper error mapping.
    const providerSuccess = true

    if (providerSuccess) {
      await finalizePendingDebit(transactionId, true)
      return res.json({ success: true, status: "completed", netPayout })
    } else {
      await finalizePendingDebit(transactionId, false, "b2c_failed")
      return res.status(502).json({ success: false, error: "Payout failed; funds restored" })
    }
  } catch (err) {
    console.error("Withdraw submit error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router

// Admin util to release due cashbacks (could be a cron job in production)
router.post("/cashback/release-due", async (req, res) => {
  try {
    const result = await releaseDueCashbacks()
    res.json({ success: true, ...result })
  } catch (err) {
    console.error("Cashback release error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})


