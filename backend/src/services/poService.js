import { query } from "../utils/database.js"

// Derive supplier for a product via product override else category mapping
export const getSupplierForProduct = async (client, productId) => {
  const ovr = await client.query(
    `SELECT supplier_id FROM supplier_product_overrides WHERE product_id = $1`,
    [productId],
  )
  if (ovr.rows.length) return ovr.rows[0].supplier_id

  const map = await client.query(
    `SELECT scm.supplier_id
     FROM products p
     JOIN categories c ON p.category_id = c.id
     LEFT JOIN subcategories s ON p.subcategory_id = s.id
     JOIN supplier_category_mappings scm
       ON scm.category_id = p.category_id AND (scm.subcategory_id IS NULL OR scm.subcategory_id = p.subcategory_id)
     WHERE p.id = $1 AND scm.is_active = TRUE
     LIMIT 1`,
    [productId],
  )
 if (map.rows.length) return map.rows[0].supplier_id

// TEMPORARY FALLBACK: allow checkout without supplier mapping
const adminSupplierId = await getOrCreateAdminSupplierId(client)
return adminSupplierId

}

// Group items by supplier: returns Map<supplierId, [{productId, qty}]>
export const groupItemsBySupplier = async (client, items) => {
  const map = new Map()
  for (const item of items) {
    const supplierId = await getSupplierForProduct(client, item.productId)
    if (!map.has(supplierId)) map.set(supplierId, [])
    map.get(supplierId).push({ productId: item.productId, qty: item.qty })
  }
  return map
}

// Create PO master and items
export const createPurchaseOrders = async (client, supplierToItems, batchKey = null) => {
  const created = []
  for (const [supplierId, items] of supplierToItems.entries()) {
    const poNumber = `PO-${Date.now()}-${supplierId}-${Math.floor(Math.random() * 1000)}`
    const po = await client.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, batch_key, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id, po_number`,
      [poNumber, supplierId, batchKey],
    )
    const poId = po.rows[0].id
    for (const it of items) {
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity) VALUES ($1, $2, $3)`,
        [poId, it.productId, it.qty],
      )
    }
    created.push({ id: poId, poNumber, supplierId })
  }
  return created
}

export const getOrCreateAdminSupplierId = async (client) => {
  const name = "ADMIN_INTERNAL"
  const found = await client.query(`SELECT id FROM suppliers WHERE name = $1`, [name])
  if (found.rows.length) return found.rows[0].id
  const ins = await client.query(`INSERT INTO suppliers (name, email, phone) VALUES ($1, NULL, NULL) RETURNING id`, [name])
  return ins.rows[0].id
   if (found.rows.length) return found.rows[0].id

  throw new Error("ADMIN_INTERNAL supplier missing. Seed it in DB first.")
}

export const createAdminPoForVirtualConsumption = async (client, items, batchKey = null) => {
  if (!items.length) return null
  const supplierId = await getOrCreateAdminSupplierId(client)
  const map = new Map()
  map.set(supplierId, items.map((i) => ({ productId: i.productId, qty: i.qty })))
  const res = await createPurchaseOrders(client, map, batchKey)
  return res[0] || null
}


