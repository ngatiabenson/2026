// Tests for image handling utilities
import { processImageUrl, normalizeProductImages, processAvatarImage } from '../imageHandler'

describe('Image Handler', () => {
  describe('processImageUrl', () => {
    it('should return default image for empty URL', () => {
      const result = processImageUrl('')
      expect(result).toBe('/placeholder.svg?height=200&width=200&query=product image')
    })

    it('should return default image for null URL', () => {
      const result = processImageUrl(null)
      expect(result).toBe('/placeholder.svg?height=200&width=200&query=product image')
    })

    it('should make relative uploads path absolute', () => {
      const result = processImageUrl('/uploads/products/test.jpg')
      expect(result).toContain('/uploads/products/test.jpg')
      expect(result).toContain('http')
    })

    it('should return full URLs as-is', () => {
      const result = processImageUrl('https://example.com/image.jpg')
      expect(result).toBe('https://example.com/image.jpg')
    })

    it('should return public folder paths as-is', () => {
      const result = processImageUrl('/assets/logo.png')
      expect(result).toBe('/assets/logo.png')
    })
  })

  describe('normalizeProductImages', () => {
    it('should normalize product with image_url', () => {
      const product = {
        id: 1,
        name: 'Test Product',
        image_url: '/uploads/products/test.jpg'
      }

      const result = normalizeProductImages(product)
      
      expect(result.image).toBeDefined()
      expect(result.imageUrl).toBeDefined()
      expect(result.primaryImage).toBeDefined()
      expect(result.image_url).toBeDefined()
      expect(result.image).toBe(result.imageUrl)
      expect(result.image).toBe(result.primaryImage)
      expect(result.image).toBe(result.image_url)
    })

    it('should normalize product with primaryImage', () => {
      const product = {
        id: 1,
        name: 'Test Product',
        primaryImage: 'https://example.com/image.jpg'
      }

      const result = normalizeProductImages(product)
      
      expect(result.image).toBe('https://example.com/image.jpg')
      expect(result.imageUrl).toBe('https://example.com/image.jpg')
      expect(result.primaryImage).toBe('https://example.com/image.jpg')
    })

    it('should handle product with no images', () => {
      const product = {
        id: 1,
        name: 'Test Product'
      }

      const result = normalizeProductImages(product)
      
      expect(result.image).toContain('placeholder.svg')
    })
  })

  describe('processAvatarImage', () => {
    it('should return default avatar for empty URL', () => {
      const result = processAvatarImage('')
      expect(result).toBe('/default-avatar.png')
    })

    it('should process avatar with uploads path', () => {
      const result = processAvatarImage('/uploads/avatars/user.jpg')
      expect(result).toContain('/uploads/avatars/user.jpg')
      expect(result).toContain('http')
    })

    it('should return full URLs as-is', () => {
      const result = processAvatarImage('https://example.com/avatar.jpg')
      expect(result).toBe('https://example.com/avatar.jpg')
    })
  })
})
