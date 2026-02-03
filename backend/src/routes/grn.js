import express from "express"
import { query } from "../utils/database.js"
import { requireRole } from "../middleware/auth.js"
import { addSurplusToVirtualStock } from "../services/virtualStockService.js"
import { alertAdmin } from "../services/notificationsService.js"

const router = express.Router()

// POST /api/grn - Record a GRN for a PO with received items
// Body: { poId, items: [{ productId, orderedQty, receivedQty }] }
router.post("/", requireRole(["admin"]), async (req, res) => {
  try {
    const { poId, items } = req.body
    if (!poId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "poId and items are required" })
    }

    await query("BEGIN")
    try {
      const grnNumber = `GRN-${Date.now()}-${poId}`
      const grnIns = await query(
        `INSERT INTO grns (grn_number, purchase_order_id, status) VALUES ($1, $2, 'recorded') RETURNING id`,
        [grnNumber, poId],
      )
      const grnId = grnIns.rows[0].id

      for (const it of items) {
        const ordered = Number(it.orderedQty)
        const received = Number(it.receivedQty)
        await query(
          `INSERT INTO grn_items (grn_id, product_id, ordered_qty, received_qty) VALUES ($1, $2, $3, $4)`,
          [grnId, it.productId, ordered, received],
        )

        if (received > ordered) {
          const surplus = received - ordered
          await addSurplusToVirtualStock({ query }, it.productId, surplus, { poId, grnId })
          await alertAdmin({ query }, "over_delivery", { poId, grnId, productId: it.productId, surplus })
        } else if (received < ordered) {
          const shortfall = ordered - received
          await alertAdmin({ query }, "under_delivery", { poId, grnId, productId: it.productId, shortfall })
          // Shortfall can be logged for next PO via business rule; kept as notification for now
        }
      }

      await query("COMMIT")
      res.json({ success: true, grnId, grnNumber })
    } catch (err) {
      await query("ROLLBACK")
      throw err
    }
  } catch (err) {
    console.error("GRN create error:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router


