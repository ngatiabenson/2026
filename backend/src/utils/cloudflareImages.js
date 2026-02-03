import FormData from 'form-data';
import fetch from 'node-fetch';

class CloudflareImagesService {
  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.deliveryUrl = process.env.CLOUDFLARE_DELIVERY_URL || 'https://imagedelivery.net';
    
   
  }

  isConfigured() {
    return !!(this.accountId && this.apiToken);
  }

  async uploadImage(buffer, filename, metadata = {}) {
    if (!this.isConfigured()) {
      throw new Error('Cloudflare Images not configured');
    }

    try {
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: filename,
        contentType: this.getContentType(filename)
      });

      // Add metadata if provided
      if (metadata.requireSignedURLs !== undefined) {
        formData.append('requireSignedURLs', metadata.requireSignedURLs);
      }

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            ...formData.getHeaders()
          },
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Cloudflare API error: ${response.status} ${errorData}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(`Cloudflare API error: ${result.errors?.map(e => e.message).join(', ') || 'Unknown error'}`);
      }

      return {
        id: result.result.id,
        filename: result.result.filename,
        uploaded: result.result.uploaded,
        variants: result.result.variants,
        url: `${this.deliveryUrl}/${result.result.id}/public`
      };
    } catch (error) {
      console.error('Cloudflare Images upload error:', error);
      throw error;
    }
  }

  async deleteImage(imageId) {
    if (!this.isConfigured()) {
      throw new Error('Cloudflare Images not configured');
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1/${imageId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Cloudflare API error: ${response.status} ${errorData}`);
      }

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Cloudflare Images delete error:', error);
      throw error;
    }
  }

  getImageUrl(imageId, variant = 'public') {
    if (!imageId) return null;
    return `${this.deliveryUrl}/${imageId}/${variant}`;
  }

  getContentType(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml'
    };
    return contentTypes[ext] || 'image/jpeg';
  }

  // Helper method to extract image ID from URL
  extractImageId(url) {
    if (!url) return null;
    const match = url.match(/\/([a-f0-9-]+)\/(?:public|variant)/);
    return match ? match[1] : null;
  }
}

export default new CloudflareImagesService();

