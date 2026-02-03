// Comprehensive image handling utility
// Handles both local uploads and Cloudflare Images with proper fallbacks

import { getOptimizedImageUrl, isCloudflareImage } from './imageUtils'

/**
 * Get the API base URL for local uploads
 * @returns {string} - The API base URL without /api suffix
 */
export const getApiBaseUrl = () => {
  return (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api$/, '')
}

/**
 * Normalize and process product images
 * @param {Object} product - Product object with various image fields
 * @param {Object} options - Image processing options
 * @returns {Object} - Normalized product with proper image URLs
 */
export const normalizeProductImages = (product, options = {}) => {
  const {
    variant = 'thumbnail',
    width = 200,
    height = 200,
    quality = 80,
    format = 'webp'
  } = options

  // Get the primary image from various possible fields
  const primaryImage = product.image_url || product.primaryImage || product.imageUrl || product.image || ''
  
  // Process the primary image
  const processedImage = processImageUrl(primaryImage, { variant, width, height, quality, format })
  
  // Get additional images if available
  const additionalImages = product.images || product.product_images || []
  const processedAdditionalImages = additionalImages.map(img => {
    const imageUrl = img.image_url || img.url || img.imageUrl || ''
    return {
      ...img,
      image_url: processImageUrl(imageUrl, { variant, width, height, quality, format }),
      url: processImageUrl(imageUrl, { variant, width, height, quality, format })
    }
  })

  return {
    ...product,
    // Primary image fields (all pointing to the same processed image)
    image: processedImage,
    imageUrl: processedImage,
    primaryImage: processedImage,
    image_url: processedImage,
    // Additional images
    images: processedAdditionalImages,
    product_images: processedAdditionalImages
  }
}

/**
 * Process a single image URL with proper fallbacks and optimization
 * @param {string} imageUrl - The original image URL
 * @param {Object} options - Image processing options
 * @returns {string} - Processed image URL
 */
export const processImageUrl = (imageUrl, options = {}) => {
  if (!imageUrl || imageUrl.trim() === '') {
    return getDefaultImageUrl(options)
  }

  // If it's already a Cloudflare image, optimize it
  if (isCloudflareImage(imageUrl)) {
    return getOptimizedImageUrl(imageUrl, options)
  }

  // If it's a relative path starting with /uploads, make it absolute
  if (imageUrl.startsWith('/uploads')) {
    return `${getApiBaseUrl()}${imageUrl}`
  }

  // If it's already a full URL, return as-is
  if (imageUrl.startsWith('http')) {
    return imageUrl
  }

  // If it's a relative path not starting with /uploads, assume it's from the public folder
  if (imageUrl.startsWith('/')) {
    return imageUrl
  }

  // Fallback to default image
  return getDefaultImageUrl(options)
}

/**
 * Get default placeholder image URL
 * @param {Object} options - Image options
 * @returns {string} - Default image URL
 */
export const getDefaultImageUrl = (options = {}) => {
  const { width = 200, height = 200 } = options
  return `/placeholder.svg?height=${height}&width=${width}&query=product image`
}

/**
 * Process avatar images for user profiles
 * @param {string} avatarUrl - User's avatar URL
 * @param {Object} options - Image processing options
 * @returns {string} - Processed avatar URL
 */
export const processAvatarImage = (avatarUrl, options = {}) => {
  const {
    variant = 'thumbnail',
    width = 100,
    height = 100,
    quality = 85,
    format = 'webp'
  } = options

  if (!avatarUrl || avatarUrl.trim() === '') {
    return '/default-avatar.png'
  }

  // If it's a Cloudflare image, optimize it
  if (isCloudflareImage(avatarUrl)) {
    return getOptimizedImageUrl(avatarUrl, { variant, width, height, quality, format })
  }

  // If it's a relative path starting with /uploads, make it absolute
  if (avatarUrl.startsWith('/uploads')) {
    return `${getApiBaseUrl()}${avatarUrl}`
  }

  // If it's already a full URL, return as-is
  if (avatarUrl.startsWith('http')) {
    return avatarUrl
  }

  // Fallback to default avatar
  return '/default-avatar.png'
}

/**
 * Process category images
 * @param {string} categoryImage - Category image URL
 * @param {Object} options - Image processing options
 * @returns {string} - Processed category image URL
 */
export const processCategoryImage = (categoryImage, options = {}) => {
  const {
    variant = 'medium',
    width = 300,
    height = 200,
    quality = 80,
    format = 'webp'
  } = options

  if (!categoryImage || categoryImage.trim() === '') {
    return '/placeholder.svg?height=200&width=300&query=category image'
  }

  // If it's a Cloudflare image, optimize it
  if (isCloudflareImage(categoryImage)) {
    return getOptimizedImageUrl(categoryImage, { variant, width, height, quality, format })
  }

  // If it's a relative path starting with /uploads, make it absolute
  if (categoryImage.startsWith('/uploads')) {
    return `${getApiBaseUrl()}${categoryImage}`
  }

  // If it's already a full URL, return as-is
  if (categoryImage.startsWith('http')) {
    return categoryImage
  }

  // Fallback to default category image
  return '/placeholder.svg?height=200&width=300&query=category image'
}

/**
 * Get image dimensions from URL (for Cloudflare images)
 * @param {string} imageUrl - Image URL
 * @returns {Object} - Width and height if available
 */
export const getImageDimensions = (imageUrl) => {
  if (!imageUrl) return { width: null, height: null }

  // Try to extract dimensions from Cloudflare image URL
  if (isCloudflareImage(imageUrl)) {
    const widthMatch = imageUrl.match(/w=(\d+)/)
    const heightMatch = imageUrl.match(/h=(\d+)/)
    
    return {
      width: widthMatch ? parseInt(widthMatch[1]) : null,
      height: heightMatch ? parseInt(heightMatch[1]) : null
    }
  }

  return { width: null, height: null }
}

/**
 * Create responsive image URLs for different screen sizes
 * @param {string} imageUrl - Base image URL
 * @param {Object} breakpoints - Breakpoint configurations
 * @returns {Object} - Responsive image URLs
 */
export const createResponsiveImages = (imageUrl, breakpoints = {}) => {
  const defaultBreakpoints = {
    mobile: { width: 200, height: 200, variant: 'thumbnail' },
    tablet: { width: 400, height: 300, variant: 'medium' },
    desktop: { width: 600, height: 400, variant: 'large' }
  }

  const config = { ...defaultBreakpoints, ...breakpoints }
  const responsive = {}

  Object.keys(config).forEach(breakpoint => {
    const options = config[breakpoint]
    responsive[breakpoint] = processImageUrl(imageUrl, options)
  })

  return responsive
}

export default {
  getApiBaseUrl,
  normalizeProductImages,
  processImageUrl,
  processAvatarImage,
  processCategoryImage,
  getImageDimensions,
  createResponsiveImages,
  getDefaultImageUrl
}
