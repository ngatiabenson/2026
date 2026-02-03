import express from "express"
import { query } from "../utils/database.js"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()

// GET /api/cart - Get user's cart
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `
      SELECT c.id, c.quantity, c.created_at,
             p.id as product_id, p.name, p.description, p.price, p.cost_price, 
             p.product_code, p.cashback_rate, p.vat_rate, p.class,
             COALESCE(pi_primary.image_url, pi_first.image_url, p.image_url, '') as primary_image,
             cat.name as category_name, cat.slug as category_slug,
             sc.name as subcategory_name, sc.slug as subcategory_slug
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
      LEFT JOIN product_images pi_primary ON p.id = pi_primary.product_id AND pi_primary.is_primary = true
      LEFT JOIN product_images pi_first ON p.id = pi_first.product_id AND pi_first.id = (
        SELECT MIN(id) FROM product_images WHERE product_id = p.id
      )
      WHERE c.user_id = $1 AND p.is_active = true
      ORDER BY c.created_at DESC
    `,
      [userId],
    )

    const cartItems = result.rows.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: {
        id: item.product_id,
        name: item.name,
        description: item.description || '',
        price: Number.parseFloat(item.price || 0),
        costPrice: Number.parseFloat(item.cost_price || item.price || 0),
        productCode: item.product_code || '',
        itemCode: item.product_code || '',
        cashbackRate: Number.parseFloat(item.cashback_rate || 0),
        cashback_rate: Number.parseFloat(item.cashback_rate || 0),
        vatRate: Number.parseFloat(item.vat_rate || 16),
        class: item.class || 'Standard',
        imageUrl: item.primary_image || '',
        primaryImage: item.primary_image || '',
        image_url: item.primary_image || '',
        category: {
          name: item.category_name || 'Uncategorized',
          slug: item.category_slug || ''
        },
        subcategory: item.subcategory_name ? {
          name: item.subcategory_name,
          slug: item.subcategory_slug || ''
        } : null
      },
      subtotal: Number.parseFloat(item.price || 0) * item.quantity,
      createdAt: item.created_at,
    }))

    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0)

    res.json({
      success: true,
      cart: {
        items: cartItems,
        total: total,
        itemCount: cartItems.length,
      },
    })
  } catch (error) {
    console.error("Cart fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/cart - Add item to cart
router.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { productId, quantity = 1 } = req.body

    if (!productId || quantity < 1) {
      return res.status(400).json({ error: "Valid product ID and quantity are required" })
    }

    // Check if product exists and is active
    const productResult = await query(
      "SELECT id, name, price FROM products WHERE id = $1 AND is_active = true",
      [productId],
    )

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    const product = productResult.rows[0]

    // No hard stock check here; stock is governed by virtual stock + supplier fulfillment

    // Check if item already exists in cart
    const existingItem = await query("SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2", [
      userId,
      productId,
    ])

    if (existingItem.rows.length > 0) {
      // Do not increment if already exists; honor UI requirement
      return res.json({
        success: true,
        message: "Item already in cart",
      })
    } else {
      // Add new item
      await query("INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)", [userId, productId, quantity])
    }

    res.json({
      success: true,
      message: "Item added to cart successfully",
    })
  } catch (error) {
    console.error("Add to cart error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /api/cart/:id - UPDATE cart_items item quantity
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params
    const { quantity } = req.body

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: "Valid quantity is required" })
    }

    // Check if cart item belongs to user
    const cartResult = await query(
      "SELECT c.id, c.product_id FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.id = $1 AND c.user_id = $2",
      [id, userId],
    )

    if (cartResult.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" })
    }

    const cartItem = cartResult.rows[0]

    // No stock check at cart; validation occurs at order allocation and PO creation

    await query("UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [quantity, id])

    res.json({
      success: true,
      message: "Cart item updated successfully",
    })
  } catch (error) {
    console.error("Cart update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/cart/:id - Remove item FROM cart_items
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const result = await query("DELETE FROM cart_items_items WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" })
    }

    res.json({
      success: true,
      message: "Item removed FROM cart_items successfully",
    })
  } catch (error) {
    console.error("Cart item removal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/cart - Clear entire cart
router.delete("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    await query("DELETE FROM cart_items_items WHERE user_id = $1", [userId])

    res.json({
      success: true,
      message: "Cart cleared successfully",
    })
  } catch (error) {
    console.error("Cart clear error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
