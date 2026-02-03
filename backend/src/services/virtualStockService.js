import { query } from "../utils/database.js"

// Virtual Stock Allocation and Audit helpers

// Allocates from virtual stock first for given order items.
// items: [{ productId, quantity }]
// Returns: { consumed: [{productId, qty}], remainingForSupplier: [{productId, qty}], adminPoItems: [{productId, qty}] }
export const allocateFromVirtualStock = async (client, orderId, items) => {
  const consumed = []
  const remainingForSupplier = []
  const adminPoItems = []

  for (const item of items) {
    const { productId, quantity } = item
    const vsRes = await client.query("SELECT quantity FROM virtual_stock WHERE product_id = $1 FOR UPDATE", [productId])
    const available = vsRes.rows.length ? Number.parseFloat(vsRes.rows[0].quantity) : 0

    const consumeQty = Math.min(available, quantity)
    const supplierQty = Math.max(0, quantity - consumeQty)

    if (consumeQty > 0) {
      await client.query(
        `INSERT INTO virtual_stock_audit (product_id, order_id, delta, reason, meta) VALUES ($1,$2,$3,$4,$5)`,
        [productId, orderId, -consumeQty, "consume_for_order", null],
      )

      if (available > 0) {
        await client.query(
          `INSERT INTO virtual_stock (product_id, quantity) VALUES ($1, GREATEST(0, $2 - $3))
           ON CONFLICT (product_id) DO UPDATE SET quantity = GREATEST(0, virtual_stock.quantity - EXCLUDED.quantity), updated_at = NOW()`,
          [productId, available, consumeQty],
        )
      }

      consumed.push({ productId, qty: consumeQty })
      adminPoItems.push({ productId, qty: consumeQty })
    }

    if (supplierQty > 0) {
      remainingForSupplier.push({ productId, qty: supplierQty })
    }
  }

  return { consumed, remainingForSupplier, adminPoItems }
}

// Add surplus to virtual stock from GRN over-delivery (supplier pack rounding)
export const addSurplusToVirtualStock = async (client, productId, surplusQty, meta = null) => {
  if (surplusQty <= 0) return
  await client.query(
    `INSERT INTO virtual_stock (product_id, quantity) VALUES ($1, $2)
     ON CONFLICT (product_id) DO UPDATE SET quantity = virtual_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
    [productId, surplusQty],
  )
  await client.query(
    `INSERT INTO virtual_stock_audit (product_id, order_id, delta, reason, meta) VALUES ($1, NULL, $2, 'surplus_from_grn', $3)`,
    [productId, surplusQty, meta],
  )
}


