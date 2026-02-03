import express from "express"
import { authenticateToken } from "../middleware/auth.js"
import { query } from "../utils/database.js"

const router = express.Router()

// GET /api/shipping/classes - List active shipping classes with fees
router.get("/classes", authenticateToken, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, name, description, base_fee, weight_limit, size_limit, is_active, created_at
       FROM shipping_classes
       WHERE is_active = true
       ORDER BY base_fee ASC, name ASC`,
    )
    res.json({ success: true, classes: rows.rows })
  } catch (err) {
    console.error("Shipping classes fetch error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/shipping/quote - Compute shipping fee from current user's cart or provided items
// Body: { items?: [{ productId, quantity }], deliveryOption?: 'pickup'|'delivery' }
router.post("/quote", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { items, destination, deliveryOption = "delivery" } = req.body || {}

    // Basic payload validation
    if (deliveryOption !== "pickup" && deliveryOption !== "delivery") {
      return res.status(400).json({ success: false, error: "deliveryOption must be 'pickup' or 'delivery'" })
    }

    if (deliveryOption === "pickup") {
      return res.json({ success: true, totalFee: 0, breakdown: [], currency: "KES", method: "pickup" })
    }

    // Resolve products either from explicit items or user's cart
    let productIds = []
    if (Array.isArray(items) && items.length) {
      // Validate items
      const invalid = items.find(
        (i) => !i || !Number(i.productId) || !Number(i.qty || i.quantity || 0) || Number(i.qty || i.quantity) <= 0,
      )
      if (invalid) return res.status(400).json({ success: false, error: "Invalid items: productId and qty required" })
      productIds = items.map((i) => Number(i.productId)).filter(Boolean)
    } else {
      const cart = await query(
        `SELECT p.id AS product_id
         FROM cart c
         JOIN products p ON p.id = c.product_id
         WHERE c.user_id = $1`,
        [userId],
      )
      productIds = cart.rows.map((r) => r.product_id)
    }

    if (!productIds.length) {
      return res.status(400).json({ success: false, error: "No items found to quote shipping" })
    }

    // Load classes for these products
    const productsRes = await query(
      `SELECT p.id, COALESCE(p.class, 'Standard') AS class
       FROM products p
       WHERE p.id = ANY($1::int[])`,
      [productIds],
    )

    const classes = productsRes.rows.map((r) => r.class)
    if (!classes.length) {
      return res.json({ success: true, fee: 0, method: "delivery", reason: "no classes found" })
    }

    // Determine the "highest" class fee by fee value
    const feesRes = await query(
      `SELECT name, base_fee
       FROM shipping_classes
       WHERE is_active = true`,
    )
    const feeMap = new Map(feesRes.rows.map((r) => [String(r.name), Number(r.base_fee)]))

    let maxFee = 0
    let selectedClass = "Standard"
    for (const cls of classes) {
      const fee = feeMap.get(String(cls))
      if (fee !== undefined && fee > maxFee) {
        maxFee = fee
        selectedClass = String(cls)
      }
    }

    // Build breakdown per item with class fee as indicative (not per-item proration for now)
    const breakdown = (items || []).map((i) => ({
      productId: i.productId,
      qty: Number(i.qty || i.quantity || 1),
      fee: 0,
    }))

    res.json({ success: true, totalFee: maxFee, breakdown, currency: "KES", selectedClass })
  } catch (err) {
    console.error("Shipping quote error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router


