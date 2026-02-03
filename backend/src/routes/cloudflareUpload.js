import express from "express"
import multer from "multer"
import { query } from "../utils/database.js"
import { authenticateToken, requireRole } from "../middleware/auth.js"
import cloudflareImages from "../utils/cloudflareImages.js"

const router = express.Router()

// Configure multer for memory storage (we'll upload directly to Cloudflare)
const storage = multer.memoryStorage()

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(file.originalname.toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"))
    }
  },
})

// POST /api/upload/cloudflare/product-image - Upload product image to Cloudflare
router.post("/cloudflare/product-image", requireRole(["admin"]), upload.single("image"), async (req, res) => {
  try {
    console.log("[Cloudflare] Product image upload request received")
    console.log("[Cloudflare] User from token:", req.user)

    if (!req.user) {
      console.log("[Cloudflare] No user found in request - authentication failed")
      return res.status(401).json({
        error: "Authentication required. Please log in as admin.",
        success: false,
      })
    }

    if (req.user.role !== "admin") {
      console.log("[Cloudflare] User role is not admin:", req.user.role)
      return res.status(403).json({
        error: "Admin access required. You must be signed in as admin to upload photo.",
        success: false,
        userRole: req.user.role,
      })
    }

    const file = req.file
    const { type = "product", productId } = req.body

    if (!file) {
      console.log("[Cloudflare] No file uploaded in request")
      return res.status(400).json({
        error: "No image uploaded",
        success: false,
      })
    }

    if (!cloudflareImages.isConfigured()) {
      console.log("[Cloudflare] Cloudflare Images not configured")
      return res.status(500).json({
        error: "Image upload service not configured",
        success: false,
      })
    }

    // Upload to Cloudflare Images
    const uploadResult = await cloudflareImages.uploadImage(
      file.buffer,
      file.originalname,
      { requireSignedURLs: false }
    )

    console.log("[Cloudflare] Image uploaded successfully:", uploadResult.url)

    let dbImage = null
    if (productId) {
      // If productId provided, record image in DB and set as primary if first
      const existingImages = await query(
        "SELECT COUNT(*) as count FROM product_images WHERE product_id = $1",
        [productId],
      )
      const isFirstImage = Number.parseInt(existingImages.rows?.[0]?.count || 0) === 0
      if (isFirstImage) {
        await query("UPDATE product_images SET is_primary = false WHERE product_id = $1", [productId])
      }
      const insertRes = await query(
        "INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, $3) RETURNING id, image_url, is_primary",
        [productId, uploadResult.url, isFirstImage],
      )
      dbImage = insertRes.rows?.[0] || null
      if (isFirstImage && dbImage) {
        await query("UPDATE products SET image_url = $1 WHERE id = $2", [dbImage.image_url, productId])
      }
    }

    res.json({
      success: true,
      imageUrl: uploadResult.url,
      imageId: uploadResult.id,
      filename: uploadResult.filename,
      image: dbImage,
      message: "Product image uploaded successfully to Cloudflare",
    })
  } catch (error) {
    console.error("[Cloudflare] Product image upload error:", error)
    res.status(500).json({
      error: "Internal server error",
      success: false,
      details: error.message,
    })
  }
})

// POST /api/upload/cloudflare/multiple-product-images - Upload multiple product images to Cloudflare
router.post("/cloudflare/multiple-product-images", requireRole(["admin"]), upload.array("images", 5), async (req, res) => {
  try {
    if (!req.user) {
      console.log("[Cloudflare] No user found in request - authentication failed")
      return res.status(401).json({
        error: "Authentication required. Please log in as admin.",
        success: false,
      })
    }

    if (req.user.role !== "admin") {
      console.log("[Cloudflare] User role is not admin:", req.user.role)
      return res.status(403).json({
        error: "Admin access required. You must be signed in as admin to upload photos.",
        success: false,
        userRole: req.user.role,
      })
    }

    const files = req.files
    const { productId } = req.body

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: "No images uploaded",
        success: false,
      })
    }

    if (!cloudflareImages.isConfigured()) {
      console.log("[Cloudflare] Cloudflare Images not configured")
      return res.status(500).json({
        error: "Image upload service not configured",
        success: false,
      })
    }

    const uploadedImages = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
        const uploadResult = await cloudflareImages.uploadImage(
          file.buffer,
          file.originalname,
          { requireSignedURLs: false }
        )

        uploadedImages.push({
          id: uploadResult.id,
          image_url: uploadResult.url,
          imageUrl: uploadResult.url,
          is_primary: i === 0,
          filename: uploadResult.filename,
        })
      } catch (error) {
        console.error(`[Cloudflare] Error uploading image ${i + 1}:`, error)
        // Continue with other images even if one fails
      }
    }

    console.log("[Cloudflare] Multiple images uploaded successfully:", uploadedImages.length)

    let dbImages = []
    if (productId && uploadedImages.length > 0) {
      const existingImages = await query(
        "SELECT COUNT(*) as count FROM product_images WHERE product_id = $1",
        [productId],
      )
      const hadExisting = Number.parseInt(existingImages.rows?.[0]?.count || 0) > 0
      if (!hadExisting) {
        await query("UPDATE product_images SET is_primary = false WHERE product_id = $1", [productId])
      }
      for (let i = 0; i < uploadedImages.length; i++) {
        const img = uploadedImages[i]
        const isPrimary = !hadExisting && i === 0
        const ins = await query(
          "INSERT INTO product_images (product_id, image_url, is_primary) VALUES ($1, $2, $3) RETURNING id, image_url, is_primary",
          [productId, img.image_url, isPrimary],
        )
        dbImages.push(ins.rows?.[0])
        if (isPrimary && ins.rows?.[0]) {
          await query("UPDATE products SET image_url = $1 WHERE id = $2", [ins.rows[0].image_url, productId])
        }
      }
    }

    res.json({
      success: true,
      images: uploadedImages,
      saved: dbImages,
      message: `${uploadedImages.length} image(s) uploaded successfully to Cloudflare`,
    })
  } catch (error) {
    console.error("[Cloudflare] Multiple product image upload error:", error)
    res.status(500).json({
      error: "Internal server error",
      success: false,
      details: error.message,
    })
  }
})

// POST /api/upload/cloudflare/profile-image - Upload profile image to Cloudflare
router.post("/cloudflare/profile-image", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const userId = req.user.id
    const file = req.file

    if (!file) {
      return res.status(400).json({ error: "No image uploaded" })
    }

    if (!cloudflareImages.isConfigured()) {
      console.log("[Cloudflare] Cloudflare Images not configured")
      return res.status(500).json({
        error: "Image upload service not configured",
        success: false,
      })
    }

    // Upload to Cloudflare Images
    const uploadResult = await cloudflareImages.uploadImage(
      file.buffer,
      file.originalname,
      { requireSignedURLs: false }
    )

    // Update user's profile image with Cloudflare URL
    await query("UPDATE users SET profile_image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
      uploadResult.url,
      userId,
    ])

    res.json({
      success: true,
      imageUrl: uploadResult.url,
      imageId: uploadResult.id,
      message: "Profile image uploaded successfully to Cloudflare",
    })
  } catch (error) {
    console.error("[Cloudflare] Profile image upload error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/upload/cloudflare/product-image/:id - Delete product image from Cloudflare
router.delete("/cloudflare/product-image/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Get image info from database
    const result = await query("SELECT image_url, product_id, is_primary FROM product_images WHERE id = $1", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Image not found" })
    }

    const { image_url, product_id, is_primary } = result.rows[0]

    // Extract Cloudflare image ID from URL
    const cloudflareImageId = cloudflareImages.extractImageId(image_url)

    // Delete from Cloudflare if we have an image ID
    if (cloudflareImageId && cloudflareImages.isConfigured()) {
      try {
        await cloudflareImages.deleteImage(cloudflareImageId)
        console.log("[Cloudflare] Image deleted from Cloudflare:", cloudflareImageId)
      } catch (error) {
        console.error("[Cloudflare] Error deleting from Cloudflare:", error)
        // Continue with database deletion even if Cloudflare deletion fails
      }
    }

    // Delete the image record from database
    await query("DELETE FROM product_images WHERE id = $1", [id])

    // If this was the primary image, set another image as primary
    if (is_primary) {
      const remainingImages = await query(
        "SELECT id FROM product_images WHERE product_id = $1 ORDER BY created_at ASC LIMIT 1",
        [product_id],
      )

      if (remainingImages.rows.length > 0) {
        await query("UPDATE product_images SET is_primary = true WHERE id = $1", [remainingImages.rows[0].id])
      }
    }

    res.json({
      success: true,
      message: "Image deleted successfully",
    })
  } catch (error) {
    console.error("[Cloudflare] Image deletion error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/upload/cloudflare/profile-image - Remove profile image from Cloudflare
router.delete("/cloudflare/profile-image", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Get current profile image
    const userResult = await query("SELECT profile_image FROM users WHERE id = $1", [userId])

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const currentImageUrl = userResult.rows[0].profile_image

    // Extract Cloudflare image ID and delete from Cloudflare
    if (currentImageUrl) {
      const cloudflareImageId = cloudflareImages.extractImageId(currentImageUrl)
      
      if (cloudflareImageId && cloudflareImages.isConfigured()) {
        try {
          await cloudflareImages.deleteImage(cloudflareImageId)
          console.log("[Cloudflare] Profile image deleted from Cloudflare:", cloudflareImageId)
        } catch (error) {
          console.error("[Cloudflare] Error deleting profile image from Cloudflare:", error)
          // Continue with database update even if Cloudflare deletion fails
        }
      }
    }

    // Remove profile image from database
    await query("UPDATE users SET profile_image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [userId])

    res.json({
      success: true,
      message: "Profile picture removed successfully",
    })
  } catch (error) {
    console.error("[Cloudflare] Profile picture removal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router

