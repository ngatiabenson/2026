// Image URL utility functions
// Handles both local uploads and Cloudflare Images

/**
 * Check if an image URL is a Cloudflare Images URL
 * @param {string} url - The image URL to check
 * @returns {boolean} - True if it's a Cloudflare Images URL
 */
export const isCloudflareImage = (url) => {
  if (!url) return false;
  return url.includes('imagedelivery.net') || url.includes('cloudflare.com');
};

/**
 * Get the appropriate image URL with fallback
 * @param {string} imageUrl - The primary image URL
 * @param {string} fallbackUrl - Fallback URL if primary is not available
 * @param {string} defaultUrl - Default placeholder URL
 * @returns {string} - The final image URL to use
 */
export const getImageUrl = (imageUrl, fallbackUrl = '', defaultUrl = '/placeholder.svg') => {
  if (imageUrl && imageUrl.trim() !== '') {
    return imageUrl;
  }
  
  if (fallbackUrl && fallbackUrl.trim() !== '') {
    return fallbackUrl;
  }
  
  return defaultUrl;
};

/**
 * Get Cloudflare image URL with variant
 * @param {string} imageId - The Cloudflare image ID
 * @param {string} variant - The image variant (default: 'public')
 * @param {string} deliveryUrl - The delivery URL (default: 'https://imagedelivery.net')
 * @returns {string} - The complete Cloudflare image URL
 */
export const getCloudflareImageUrl = (imageId, variant = 'public', deliveryUrl = 'https://imagedelivery.net') => {
  if (!imageId) return '';
  return `${deliveryUrl}/${imageId}/${variant}`;
};

/**
 * Extract image ID from Cloudflare URL
 * @param {string} url - The Cloudflare image URL
 * @returns {string|null} - The image ID or null if not found
 */
export const extractCloudflareImageId = (url) => {
  if (!url || !isCloudflareImage(url)) return null;
  
  const match = url.match(/\/([a-f0-9-]+)\/(?:public|variant)/);
  return match ? match[1] : null;
};

/**
 * Get optimized image URL for different use cases
 * @param {string} imageUrl - The original image URL
 * @param {Object} options - Optimization options
 * @param {string} options.variant - Cloudflare variant (public, thumbnail, medium, large)
 * @param {number} options.width - Desired width
 * @param {number} options.height - Desired height
 * @param {string} options.quality - Image quality (auto, 75, 80, 85, 90, 95)
 * @param {string} options.format - Image format (auto, webp, avif, jpeg, png)
 * @returns {string} - The optimized image URL
 */
export const getOptimizedImageUrl = (imageUrl, options = {}) => {
  if (!imageUrl) return '';
  
  const {
    variant = 'public',
    width,
    height,
    quality = 'auto',
    format = 'auto'
  } = options;
  
  // If it's a Cloudflare image, we can add transformations
  if (isCloudflareImage(imageUrl)) {
    const imageId = extractCloudflareImageId(imageUrl);
    if (imageId) {
      let url = `https://imagedelivery.net/${imageId}/${variant}`;
      
      // Add transformation parameters
      const params = [];
      if (width) params.push(`w=${width}`);
      if (height) params.push(`h=${height}`);
      if (quality !== 'auto') params.push(`q=${quality}`);
      if (format !== 'auto') params.push(`f=${format}`);
      
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }
      
      return url;
    }
  }
  
  // For non-Cloudflare images, return as-is
  return imageUrl;
};

/**
 * Get avatar image URL with fallback
 * @param {string} avatarUrl - The user's avatar URL
 * @param {string} defaultAvatar - Default avatar URL
 * @returns {string} - The avatar URL to display
 */
export const getAvatarUrl = (avatarUrl, defaultAvatar = '/default-avatar.png') => {
  return getImageUrl(avatarUrl, '', defaultAvatar);
};

/**
 * Get product image URL with fallback
 * @param {string} imageUrl - The product's image URL
 * @param {string} fallbackUrl - Fallback image URL
 * @param {string} defaultImage - Default product image URL
 * @returns {string} - The product image URL to display
 */
export const getProductImageUrl = (imageUrl, fallbackUrl = '', defaultImage = '/default-product.png') => {
  return getImageUrl(imageUrl, fallbackUrl, defaultImage);
};

/**
 * Get thumbnail URL for product listings
 * @param {string} imageUrl - The product's image URL
 * @param {number} size - Thumbnail size (default: 200)
 * @returns {string} - The thumbnail URL
 */
export const getThumbnailUrl = (imageUrl, size = 200) => {
  return getOptimizedImageUrl(imageUrl, {
    variant: 'thumbnail',
    width: size,
    height: size,
    quality: 80,
    format: 'webp'
  });
};

/**
 * Get medium-sized image URL for product details
 * @param {string} imageUrl - The product's image URL
 * @param {number} width - Image width (default: 600)
 * @returns {string} - The medium image URL
 */
export const getMediumImageUrl = (imageUrl, width = 600) => {
  return getOptimizedImageUrl(imageUrl, {
    variant: 'medium',
    width: width,
    quality: 85,
    format: 'webp'
  });
};

/**
 * Get large image URL for full-size display
 * @param {string} imageUrl - The product's image URL
 * @param {number} width - Image width (default: 1200)
 * @returns {string} - The large image URL
 */
export const getLargeImageUrl = (imageUrl, width = 1200) => {
  return getOptimizedImageUrl(imageUrl, {
    variant: 'large',
    width: width,
    quality: 90,
    format: 'webp'
  });
};

export default {
  isCloudflareImage,
  getImageUrl,
  getCloudflareImageUrl,
  extractCloudflareImageId,
  getOptimizedImageUrl,
  getAvatarUrl,
  getProductImageUrl,
  getThumbnailUrl,
  getMediumImageUrl,
  getLargeImageUrl
};

