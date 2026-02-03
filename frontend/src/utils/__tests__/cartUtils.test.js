// Tests for cart utility functions
import { calculateDisplayedCashback, calculateTotalCashback, calculateOrderSummary } from '../cartUtils'

describe('Cart Utils', () => {
  describe('calculateDisplayedCashback', () => {
    it('should calculate cashback correctly', () => {
      const item = {
        basePrice: 1000,
        vatRate: 16,
        cashbackPercent: 5,
        quantity: 2
      }

      const result = calculateDisplayedCashback(item)
      
      // Price excl VAT = 1000 / 1.16 = 862.07
      // Cashback = (862.07 * 2 * 5) / 100 = 86.21
      // Rounded = 86
      expect(result).toBe(86)
    })

    it('should return 0 for zero cashback percent', () => {
      const item = {
        basePrice: 1000,
        vatRate: 16,
        cashbackPercent: 0,
        quantity: 1
      }

      const result = calculateDisplayedCashback(item)
      expect(result).toBe(0)
    })

    it('should return 0 for zero quantity', () => {
      const item = {
        basePrice: 1000,
        vatRate: 16,
        cashbackPercent: 5,
        quantity: 0
      }

      const result = calculateDisplayedCashback(item)
      expect(result).toBe(0)
    })

    it('should handle missing fields gracefully', () => {
      const item = {}

      const result = calculateDisplayedCashback(item)
      expect(result).toBe(0)
    })
  })

  describe('calculateTotalCashback', () => {
    it('should calculate total cashback for multiple items', () => {
      const cartItems = [
        {
          basePrice: 1000,
          vatRate: 16,
          cashbackPercent: 5,
          quantity: 1
        },
        {
          basePrice: 2000,
          vatRate: 16,
          cashbackPercent: 10,
          quantity: 2
        }
      ]

      const result = calculateTotalCashback(cartItems)
      
      // Item 1: (1000/1.16 * 1 * 5) / 100 = 43.10 -> 43
      // Item 2: (2000/1.16 * 2 * 10) / 100 = 344.83 -> 345
      // Total: 43 + 345 = 388
      expect(result).toBe(388)
    })

    it('should return 0 for empty cart', () => {
      const result = calculateTotalCashback([])
      expect(result).toBe(0)
    })
  })

  describe('calculateOrderSummary', () => {
    it('should calculate order summary correctly', () => {
      const cartItems = [
        {
          price: 1000, // VAT inclusive
          quantity: 2
        },
        {
          price: 2000, // VAT inclusive
          quantity: 1
        }
      ]

      const result = calculateOrderSummary(cartItems)
      
      // Item 1: 1000/1.16 * 2 = 1724.14
      // Item 2: 2000/1.16 * 1 = 1724.14
      // Subtotal excl VAT: 1724.14 + 1724.14 = 3448.28 -> 3448
      // VAT: 3448 * 0.16 = 551.68 -> 552
      // Total: 3448 + 552 = 4000
      expect(result.subtotalExclVAT).toBe(3448)
      expect(result.vatAmount).toBe(552)
      expect(result.total).toBe(4000)
      expect(result.itemCount).toBe(2)
    })

    it('should handle empty cart', () => {
      const result = calculateOrderSummary([])
      
      expect(result.subtotalExclVAT).toBe(0)
      expect(result.vatAmount).toBe(0)
      expect(result.total).toBe(0)
      expect(result.itemCount).toBe(0)
    })
  })
})
