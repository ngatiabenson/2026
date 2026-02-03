import express from "express"
import { query } from "../utils/database.js"
import { authenticateToken, requireRole } from "../middleware/auth.js"
import { absoluteImageUrl } from "../utils/url.js"
import { debitWalletPending } from "../services/walletService.js"
import { allocateFromVirtualStock } from "../services/virtualStockService.js"
import { groupItemsBySupplier, createPurchaseOrders, createAdminPoForVirtualConsumption } from "../services/poService.js"
import { getCurrentBatchKey } from "../services/batchService.js"
import { notifySupplierPo } from "../services/notificationsService.js"

const router = express.Router()

// GET /api/orders/my-orders - Get current user's orders (customer view)
router.get("/my-orders", authenticateToken, async (req, res) => {
  try {
    const { page = 1, per_page = 10, sort_by = "created_at", sort_order = "desc", status } = req.query
    const limit = Number.parseInt(per_page)
    const offset = (Number.parseInt(page) - 1) * limit
    const userId = req.user.id

    let whereClause = "WHERE o.user_id = $1"
    const params = [userId]

    if (status) {
      whereClause += " AND o.status = $" + (params.length + 1)
      params.push(status)
    }

    // Validate sort parameters
    const validSortColumns = ["created_at", "total_amount", "status", "order_number"]
    const validSortOrders = ["asc", "desc"]
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : "created_at"
    const sortDirection = validSortOrders.includes(sort_order.toLowerCase()) ? sort_order.toUpperCase() : "DESC"

    const result = await query(
      `SELECT o.id, o.order_number, o.total_amount, o.status, o.created_at,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id, o.order_number, o.total_amount, o.status, o.created_at
      ORDER BY o.${sortColumn} ${sortDirection}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    )

    const countResult = await query(`SELECT COUNT(DISTINCT o.id) as total FROM orders o ${whereClause}`, params)

    if (!countResult.rows || countResult.rows.length === 0) {
      return res.status(500).json({ error: "Failed to get order count" })
    }

    const totalCount = Number.parseInt(countResult.rows[0].total)
    const totalPages = Math.ceil(totalCount / limit)

    res.json({
      success: true,
      data: {
        data: result.rows.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          total_amount: Number.parseFloat(order.total_amount),
          status: order.status,
          item_count: Number.parseInt(order.item_count),
          created_at: order.created_at,
        })),
        pagination: {
          current_page: Number.parseInt(page),
          total_pages: totalPages,
          total_count: totalCount,
          per_page: limit,
        },
      },
    })
  } catch (error) {
    console.error("My orders fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/orders - Get user's orders or all orders (admin)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query
    const offset = (page - 1) * limit
    const userId = req.user.id
    const isAdmin = req.user.role === "admin"

    let whereClause = "WHERE 1=1"
    const params = []

    if (!isAdmin) {
      whereClause += " AND o.user_id = $" + (params.length + 1)
      params.push(userId)
    }

    if (status) {
      whereClause += " AND o.status = $" + (params.length + 1)
      params.push(status)
    }

    const result = await query(
      `SELECT o.id, o.order_number, o.total_amount, o.status, o.created_at,
             u.name as customer_name, u.email as customer_email,
             COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id, o.order_number, o.total_amount, o.status, o.created_at, u.name, u.email
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    )

    const countResult = await query(
      `SELECT COUNT(DISTINCT o.id) as total FROM orders o JOIN users u ON o.user_id = u.id ${whereClause}`,
      params,
    )

    if (!countResult.rows || countResult.rows.length === 0) {
      return res.status(500).json({ error: "Failed to get order count" })
    }

    res.json({
      success: true,
      orders: result.rows.map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        totalAmount: Number.parseFloat(order.total_amount),
        status: order.status,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        itemCount: Number.parseInt(order.item_count),
        createdAt: order.created_at,
      })),
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: Number.parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    })
  } catch (error) {
    console.error("Orders fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/orders/:id - Get order details
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const isAdmin = req.user.role === "admin"

    let whereClause = "WHERE o.id = $1"
    const params = [id]

    if (!isAdmin) {
      whereClause += " AND o.user_id = $2"
      params.push(userId)
    }

    const orderResult = await query(
      `SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ${whereClause}`,
      params,
    )

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" })
    }

    const order = orderResult.rows[0]

    // Get order items
    const itemsResult = await query(
      `SELECT oi.*, p.name as product_name, pi.image_url
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = true
      WHERE oi.order_id = $1
      ORDER BY oi.id`,
      [id],
    )

    res.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        totalAmount: Number.parseFloat(order.total_amount),
        status: order.status,
        customer: {
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone,
        },
        items: itemsResult.rows.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
          price: Number.parseFloat(item.price),
          subtotal: Number.parseFloat(item.price) * item.quantity,
          imageUrl: absoluteImageUrl(req, item.image_url || null),
        })),
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
    })
  } catch (error) {
    console.error("Order fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/orders - Create new order
// POST /api/orders - Create new order
router.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { items, shippingAddress, walletApplied = 0, cashback_total = 0 } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order items are required" })
    }

    // Start transaction
    await query("BEGIN")

    try {
      // 1️⃣ Validate items & calculate total
      let totalAmount = 0
      const validatedItems = []

      for (const item of items) {
        const productRes = await query(
          "SELECT id, name, price FROM products WHERE id = $1 AND is_active = true",
          [item.productId]
        )
        if (!productRes.rows.length) throw new Error(`Product ${item.productId} not found`)
        const product = productRes.rows[0]
        const itemTotal = Number.parseFloat(product.price) * item.quantity
        totalAmount += itemTotal
        validatedItems.push({
          productId: product.id,
          quantity: item.quantity,
          price: product.price,
        })
      }

      // 2️⃣ Generate order number
      const orderNumber = `ORD-${Date.now()}-${userId}`

      // 3️⃣ Insert order
      const orderRes = await query(
        "INSERT INTO orders (user_id, order_number, total_amount, status, shipping_address_id, cashback_total) VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id",
        [userId, orderNumber, totalAmount, shippingAddress || null, cashback_total]
      )
      const orderId = orderRes.rows[0].id

      // 4️⃣ Debit wallet if applicable
      if (walletApplied > 0) {
        await debitWalletPending(userId, walletApplied, `Order ${orderNumber} wallet usage (pending)`)
      }

    // 5️⃣ Insert order_items first
for (const item of validatedItems) {
  const totalPrice = Number.parseFloat(item.price) * item.quantity
  const insertRes = await query(
    "INSERT INTO order_items (order_id, product_id, quantity, price, total_price) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [orderId, item.productId, item.quantity, item.price, totalPrice]
  )
  console.log("Inserted order_item:", insertRes.rows[0])
}

// 6️⃣ Now allocate virtual stock
const basicItems = validatedItems.map((i) => ({ productId: i.productId, quantity: i.quantity }))
const alloc = await allocateFromVirtualStock({ query }, orderId, basicItems)


      //  Generate POs (admin & supplier)
      const batchKey = getCurrentBatchKey()
      if (alloc.adminPoItems.length) {
        const adminPo = await createAdminPoForVirtualConsumption({ query }, alloc.adminPoItems, batchKey)
        if (adminPo?.id) await notifySupplierPo({ query }, adminPo.id)
      }
      if (alloc.remainingForSupplier.length) {
        const grouped = await groupItemsBySupplier({ query }, alloc.remainingForSupplier)
        const supplierPos = await createPurchaseOrders({ query }, grouped, batchKey)
        for (const po of supplierPos) await notifySupplierPo({ query }, po.id)
      }

      // 7️⃣ Clear cart
      await query("DELETE FROM cart_items WHERE user_id = $1", [userId])

      // 8️⃣ Insert pending cashback (credited after refund window)
      if (cashback_total > 0) {
        await query(
          "INSERT INTO wallet_transactions (user_id, transaction_type, amount, description, status) VALUES ($1, 'cashback', $2, $3, 'pending')",
          [userId, cashback_total, `Cashback from order ${orderNumber} (pending return window)`]
        )
      }

      // 9️⃣ Delay sales agent commission to same time as cashback
      const customerRes = await query(
        "SELECT sales_agent_id FROM customer_assignments WHERE customer_id = $1 AND is_active = true ORDER BY assigned_at DESC LIMIT 1",
        [userId]
      )
      const salesAgentId = customerRes.rows?.[0]?.sales_agent_id || null
      if (salesAgentId && cashback_total > 0) {
        const orderCountRes = await query("SELECT COUNT(*) as order_count FROM orders WHERE user_id = $1", [userId])
        const orderCount = Number.parseInt(orderCountRes.rows[0].order_count)
        if (orderCount <= 3) {
          const commissionRate = 5.0
          const commissionAmount = (totalAmount * commissionRate) / 100
          await query(
            "INSERT INTO commissions (sales_agent_id, order_id, commission_rate, commission_amount, status) VALUES ($1, $2, $3, $4, 'pending')",
            [salesAgentId, orderId, commissionRate, commissionAmount]
          )
        }
      }

      // 10️⃣ Commit transaction
      await query("COMMIT")

      res.status(201).json({
        success: true,
        order: { id: orderId, orderNumber, totalAmount, status: "pending" },
        message: "Order created successfully",
      })
    } catch (error) {
      await query("ROLLBACK")
      throw error
    }
  } catch (error) {
    console.error("Order creation error:", error)
    res.status(500).json({ error: error.message || "Internal server error" })
  }
})


// PUT /api/orders/:id/status - Update order status (admin only)
router.put("/:id/status", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }

    const result = await query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, order_number, status",
      [status, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" })
    }

    res.json({
      success: true,
      order: result.rows[0],
      message: "Order status updated successfully",
    })
  } catch (error) {
    console.error("Order status update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
