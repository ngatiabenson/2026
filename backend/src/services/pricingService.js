/**
 * Calculate the unit price for a product based on quantity and pricing tiers
 * @param {Object} client - Database client (with query method)
 * @param {number} productId - Product ID
 * @param {number} quantity - Quantity to calculate price for
 * @returns {Promise<number>} - Unit price (VAT-inclusive)
 */
export const calculateUnitPrice = async (client, productId, quantity) => {
  // Get product base price and pricing tiers
  const productRes = await client.query(
    `SELECT p.price, p.cost_price, p.vat_rate,
            array_agg(
              jsonb_build_object(
                'min_quantity', ppt.min_quantity,
                'max_quantity', ppt.max_quantity,
                'selling_price', ppt.selling_price
              ) ORDER BY ppt.min_quantity ASC
            ) FILTER (WHERE ppt.id IS NOT NULL) as pricing_tiers
     FROM products p
     LEFT JOIN product_pricing_tiers ppt ON p.id = ppt.product_id
     WHERE p.id = $1 AND p.is_active = true
     GROUP BY p.id, p.price, p.cost_price, p.vat_rate`,
    [productId],
  )

  if (!productRes.rows.length) {
    throw new Error(`Product ${productId} not found or inactive`)
  }

  const product = productRes.rows[0]
  const basePrice = Number.parseFloat(product.price || product.cost_price || 0)
  const pricingTiers = product.pricing_tiers || []

  // If no tiers, return base price
  if (!pricingTiers.length) {
    return basePrice
  }

  // Find matching tier based on quantity
  // Tiers are sorted by min_quantity ASC
  let matchedTier = null
  for (const tier of pricingTiers) {
    const minQty = tier.min_quantity || 0
    const maxQty = tier.max_quantity || Number.MAX_SAFE_INTEGER
    if (quantity >= minQty && quantity <= maxQty) {
      matchedTier = tier
      break
    }
  }

  // If no tier matches, use base price
  // Otherwise use tier selling_price
  if (matchedTier && matchedTier.selling_price) {
    return Number.parseFloat(matchedTier.selling_price)
  }

  return basePrice
}

/**
 * Resolve tier unit price from already-loaded pricing tiers (no DB calls).
 * pricingTiers can be objects with either snake_case or camelCase keys.
 */
export const resolveTierUnitPrice = ({ basePrice, pricingTiers = [], quantity }) => {
  const q = Number(quantity) || 0
  const base = Number.parseFloat(basePrice || 0)
  if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) return base

  // Assume tiers are sorted by min_quantity ASC, but handle unsorted safely.
  const tiers = [...pricingTiers].sort((a, b) => {
    const amin = Number(a?.min_quantity ?? a?.minQuantity ?? 0)
    const bmin = Number(b?.min_quantity ?? b?.minQuantity ?? 0)
    return amin - bmin
  })

  for (const t of tiers) {
    const minQty = Number(t?.min_quantity ?? t?.minQuantity ?? 0)
    const maxRaw = t?.max_quantity ?? t?.maxQuantity
    const maxQty = maxRaw === null || maxRaw === undefined ? Number.POSITIVE_INFINITY : Number(maxRaw)
    if (q >= minQty && q <= maxQty) {
      const sp = t?.selling_price ?? t?.sellingPrice
      if (sp !== null && sp !== undefined && sp !== "") return Number.parseFloat(sp)
      return base
    }
  }

  return base
}

/**
 * Calculate VAT + cashback + totals from already-known rates (no DB calls).
 * All returned numbers are rounded to 2dp.
 */
export const calculateLineTotals = ({ unitPrice, quantity, vatRatePercent = 0, cashbackRatePercent = 0 }) => {
  const qty = Number(quantity) || 0
  const unit = Number.parseFloat(unitPrice || 0)
  const vatPct = Number.parseFloat(vatRatePercent || 0)
  const cashbackPct = Number.parseFloat(cashbackRatePercent || 0)

  const lineTotal = unit * qty
  const vatRate = vatPct > 0 ? vatPct / 100 : 0
  const lineSubtotalExclVAT = vatRate > 0 ? lineTotal / (1 + vatRate) : lineTotal
  const lineVatAmount = lineTotal - lineSubtotalExclVAT
  const lineCashbackAmount = cashbackPct > 0 ? (lineSubtotalExclVAT * cashbackPct) / 100 : 0

  return {
    unitPrice: Number.parseFloat(unit.toFixed(2)),
    lineTotal: Number.parseFloat(lineTotal.toFixed(2)),
    lineSubtotalExclVAT: Number.parseFloat(lineSubtotalExclVAT.toFixed(2)),
    lineVatAmount: Number.parseFloat(lineVatAmount.toFixed(2)),
    lineCashbackAmount: Number.parseFloat(lineCashbackAmount.toFixed(2)),
  }
}

/**
 * Calculate order item totals with VAT and cashback
 * @param {Object} client - Database client
 * @param {number} productId - Product ID
 * @param {number} quantity - Quantity
 * @param {number} unitPrice - Unit price (VAT-inclusive)
 * @returns {Promise<Object>} - { unitPrice, subtotalExclVAT, vatAmount, subtotalInclVAT, cashbackAmount }
 */
export const calculateItemTotals = async (client, productId, quantity, unitPrice) => {
  // Get product VAT and cashback rates
  const productRes = await client.query(
    "SELECT vat_rate, cashback_rate FROM products WHERE id = $1",
    [productId],
  )

  if (!productRes.rows.length) {
    throw new Error(`Product ${productId} not found`)
  }

  const product = productRes.rows[0]
  const vatRate = Number.parseFloat(product.vat_rate || 16) / 100
  const cashbackRate = Number.parseFloat(product.cashback_rate || 0) / 100

  // Calculate subtotal (VAT-inclusive)
  const subtotalInclVAT = unitPrice * quantity

  // Calculate subtotal excluding VAT
  const subtotalExclVAT = Math.round(subtotalInclVAT / (1 + vatRate))

  // Calculate VAT amount
  const vatAmount = subtotalInclVAT - subtotalExclVAT

  // Calculate cashback on VAT-exclusive subtotal (selling price), using product cashback_rate (%)
  const cashbackAmount = Number.parseFloat((subtotalExclVAT * cashbackRate).toFixed(2))

  return {
    unitPrice,
    subtotalExclVAT: Number.parseFloat(subtotalExclVAT.toFixed(2)),
    vatAmount: Number.parseFloat(vatAmount.toFixed(2)),
    subtotalInclVAT: Number.parseFloat(subtotalInclVAT.toFixed(2)),
    cashbackAmount,
  }
}

