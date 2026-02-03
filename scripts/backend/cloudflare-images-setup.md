# Cloudflare Images Setup Guide

This guide will help you set up Cloudflare Images for your e-commerce application to replace local image storage.

## Prerequisites

1. A Cloudflare account (free tier available)
2. Your domain added to Cloudflare (if you want custom delivery URLs)

## Step 1: Enable Cloudflare Images

1. Log in to your Cloudflare dashboard
2. Navigate to **Images** in the left sidebar
3. Click **Get Started** to enable Cloudflare Images
4. Note your **Account ID** (you'll need this later)

## Step 2: Create an API Token

1. In your Cloudflare dashboard, go to **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use the **Custom token** template
4. Configure the token with these settings:
   - **Token name**: `E-commerce Images API`
   - **Permissions**:
     - `Account:Cloudflare Images:Edit`
   - **Account Resources**:
     - `Include: [Your Account]`
5. Click **Continue to summary** then **Create Token**
6. **Copy the token immediately** (you won't see it again)

## Step 3: Configure Environment Variables

Add these variables to your backend `.env` file:

```env
# Cloudflare Images Configuration
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_DELIVERY_URL=https://imagedelivery.net

# Optional: Default image URLs for fallbacks
DEFAULT_AVATAR_URL=https://imagedelivery.net/default-avatar/public
DEFAULT_PRODUCT_IMAGE_URL=https://imagedelivery.net/default-product/public
```

## Step 4: Upload Default Images (Optional)

1. Upload default avatar and product images to Cloudflare Images
2. Note their image IDs
3. Update the default URLs in your environment variables

## Step 5: Test the Integration

The application now supports both local and Cloudflare image uploads:

### Local Upload Endpoints (existing):
- `POST /api/upload/product-image`
- `POST /api/upload/multiple-product-images`
- `POST /api/upload/profile-image`

### Cloudflare Upload Endpoints (new):
- `POST /api/upload/cloudflare/product-image`
- `POST /api/upload/cloudflare/multiple-product-images`
- `POST /api/upload/cloudflare/profile-image`

## Step 6: Update Frontend (Optional)

To use Cloudflare Images exclusively, update your frontend to use the `/cloudflare/` endpoints instead of the regular upload endpoints.

## Benefits of Cloudflare Images

1. **Global CDN**: Images are served from Cloudflare's global network
2. **Automatic Optimization**: Images are automatically optimized for different devices
3. **Transformations**: Built-in image transformations (resize, crop, etc.)
4. **No Storage Limits**: No local storage space concerns
5. **Better Performance**: Faster image loading worldwide

## Image URL Format

Cloudflare Images URLs follow this format:
```
https://imagedelivery.net/{image-id}/{variant}
```

Where:
- `{image-id}`: Unique identifier for the image
- `{variant}`: Image variant (e.g., `public`, `thumbnail`, `medium`)

## Troubleshooting

### Common Issues:

1. **"Cloudflare Images not configured" error**:
   - Check that `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set
   - Verify the API token has the correct permissions

2. **Upload failures**:
   - Check file size limits (default: 10MB)
   - Verify file format (JPEG, PNG, GIF, WebP supported)
   - Check API token permissions

3. **Image not displaying**:
   - Verify the image ID in the URL
   - Check if the image was deleted from Cloudflare
   - Ensure the delivery URL is correct

## Migration from Local Storage

To migrate existing local images to Cloudflare:

1. Export all image URLs from your database
2. Download the images from your local storage
3. Upload them to Cloudflare Images using the API
4. Update your database with the new Cloudflare URLs
5. Update your frontend to use Cloudflare endpoints

## Cost Considerations

- Cloudflare Images has a free tier with generous limits
- Paid plans offer additional features and higher limits
- Check Cloudflare's pricing page for current rates

## Security Notes

- Keep your API token secure and never commit it to version control
- Use environment variables for all sensitive configuration
- Consider using signed URLs for sensitive images if needed

