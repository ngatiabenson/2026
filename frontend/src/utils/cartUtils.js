// Cart utility functions for normalizing cart item data
// Ensures consistent field mapping between product pages and cart

import { processImageUrl } from './imageHandler'

/**
 * Normalize cart item data to ensure consistent field names
 * @param {Object} cartItem - Raw cart item from API
 * @returns {Object} - Normalized cart item with consistent field names
 */
export const normalizeCartItem = (cartItem) => {
  const product = cartItem.product || {}
  
  // Process image URLs using the image handler
  const getImageUrl = (imageUrl) => {
    return processImageUrl(imageUrl, {
      variant: 'thumbnail',
      width: 200,
      height: 200,
      quality: 80,
      format: 'webp'
    })
  }

  return {
    id: cartItem.id,
    productId: product.id,
    name: product.name || 'Unnamed Product',
    description: product.description || '',
    shortDescription: (product.description || '').substring(0, 100) + (product.description?.length > 100 ? '...' : ''),
    longerDescription: product.description || '',
    // Pricing (authoritative values are provided by backend /cart)
    price: Number.parseFloat(cartItem.unit_price ?? product.price ?? 0),
    unitPrice: Number.parseFloat(cartItem.unit_price ?? product.price ?? 0),
    lineTotal: Number.parseFloat(cartItem.line_total ?? 0),
    lineSubtotalExclVAT: Number.parseFloat(cartItem.line_subtotal_excl_vat ?? 0),
    lineVatAmount: Number.parseFloat(cartItem.line_vat_amount ?? 0),
    lineCashbackAmount: Number.parseFloat(cartItem.line_cashback_amount ?? 0),
    // legacy fields (keep, but do not compute pricing client-side)
    basePrice: Number.parseFloat(product.costPrice || product.cost_price || product.price || 0),
    costPrice: Number.parseFloat(product.costPrice || product.cost_price || product.price || 0),
    // Normalize item code fields
    itemCode: product.itemCode || product.productCode || product.product_code || '',
    productCode: product.productCode || product.product_code || '',
    // Normalize cashback fields
    cashbackPercent: Number.parseFloat(product.cashbackRate || product.cashback_rate || 0),
    cashbackRate: Number.parseFloat(product.cashbackRate || product.cashback_rate || 0),
    // Normalize image fields
    image: getImageUrl(product.imageUrl || product.primaryImage || product.image_url),
    primaryImage: getImageUrl(product.primaryImage || product.imageUrl || product.image_url),
    imageUrl: getImageUrl(product.imageUrl || product.primaryImage || product.image_url),
    // Other fields
    quantity: Number.parseInt(cartItem.quantity || 1),
    vatRate: Number.parseFloat(product.vatRate || product.vat_rate || 0),
    class: product.class || 'Standard',
    category: product.category || { name: 'Uncategorized', slug: '' },
    subcategory: product.subcategory || null,
    // Legacy fields for backward compatibility
    size: product.size || 'N/A',
    color: product.color || 'N/A', 
    material: product.material || 'N/A',
    seller: product.seller || 'FirstCraft',
    createdAt: cartItem.createdAt || cartItem.created_at
  }
}

/**
 * Calculate cashback for a cart item
 * @param {Object} item - Normalized cart item
 * @param {number} quantity - Quantity (defaults to item.quantity)
 * @returns {number} - Calculated cashback amount
 */
export const calculateDisplayedCashback = (item, quantity = null) => {
  const qty = quantity || item.quantity || 1
  const cashbackPercent = item.cashbackPercent || item.cashbackRate || 0
  
  if (cashbackPercent <= 0) return 0
  
  // Use base price (cost price) for cashback calculation, excluding VAT
  const basePrice = item.basePrice || item.costPrice || item.price || 0
  const vatRate = item.vatRate || 16
  const priceExclVAT = Math.round(basePrice / (1 + vatRate / 100))
  
  return Math.round((priceExclVAT * qty * cashbackPercent) / 100)
}

/**
 * Calculate total cashback for multiple cart items
 * @param {Array} cartItems - Array of normalized cart items
 * @returns {number} - Total cashback amount
 */
export const calculateTotalCashback = (cartItems) => {
  return cartItems.reduce((total, item) => {
    return total + calculateDisplayedCashback(item)
  }, 0)
}

/**
 * Calculate order summary with VAT and cashback
 * @param {Array} cartItems - Array of normalized cart items
 * @returns {Object} - Order summary with subtotal, VAT, total, and cashback
 */
export const calculateOrderSummary = (cartItems) => {
  const VAT_RATE = 0.16
  
  const subtotalExclVAT = cartItems.reduce((sum, item) => {
    const priceExclVAT = Math.round(item.price / (1 + VAT_RATE))
    return sum + (priceExclVAT * item.quantity)
  }, 0)
  
  const vatAmount = Math.round(subtotalExclVAT * VAT_RATE)
  const total = subtotalExclVAT + vatAmount
  const totalCashback = calculateTotalCashback(cartItems)
  
  return {
    subtotalExclVAT,
    vatAmount,
    total,
    totalCashback,
    itemCount: cartItems.length
  }
}

export default {
  normalizeCartItem,
  calculateDisplayedCashback,
  calculateTotalCashback,
  calculateOrderSummary
}
