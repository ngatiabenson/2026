/*cloudinary production images upload*/
import express from "express";
import { upload, getImageUrl } from "../utils/uploads.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { query } from "../utils/database.js";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

// ===============================
// UPLOAD IMAGE (GENERIC)
// Supports type: profile | products | category
// ===============================
router.post("/image", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const type = req.body.type;
    const imageUrl = getImageUrl(req.file);

    // If profile, automatically update user record
    if (type === "profile" && req.user?.id) {
      await query(
        "UPDATE users SET profile_image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [imageUrl, req.user.id]
      );
    }

    res.json({ success: true, imageUrl, message: "Upload successful" });
  } catch (error) {
    console.error("Generic image upload error:", error);
    res.status(500).json({ success: false, error: "Upload failed" });
  }
});

// ===============================
// UPLOAD / UPDATE PROFILE IMAGE
// Convenience endpoint
// ===============================
router.post("/profile-image", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const userId = req.user.id;
    const imageUrl = getImageUrl(req.file);

    await query(
      "UPDATE users SET profile_image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [imageUrl, userId]
    );

    res.json({ success: true, imageUrl, message: "Profile image uploaded successfully" });
  } catch (error) {
    console.error("Profile image upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===============================
// DELETE PROFILE IMAGE
// ===============================
router.delete("/profile-picture", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current profile image
    const userResult = await query("SELECT profile_image FROM users WHERE id = $1", [userId]);
    if (!userResult.rows.length) return res.status(404).json({ error: "User not found" });

    const currentImage = userResult.rows[0].profile_image;

    // Remove from DB
    await query("UPDATE users SET profile_image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [userId]);

    // Delete from Cloudinary
    if (currentImage) {
      try {
        const publicId = currentImage.split("/upload/")[1].split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudErr) {
        console.warn("Cloudinary deletion failed:", cloudErr.message);
      }
    }

    res.json({ success: true, message: "Profile picture removed successfully" });
  } catch (error) {
    console.error("Profile picture deletion error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;


/*  
/static upload images
import multer from "multer"
import path from "path"
import fs from "fs"

// Ensure upload directories exist
const uploadDir = "public/uploads"
const productImagesDir = "public/uploads/products"
const profileImagesDir = "public/uploads/profiles"
const categoryImagesDir = "public/uploads/categories"
;[uploadDir, productImagesDir, profileImagesDir, categoryImagesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

// Configure multer for different file types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = productImagesDir

    if (req.body.type === "profile") {
      uploadPath = profileImagesDir
    } else if (req.body.type === "category") {
      uploadPath = categoryImagesDir
    }

    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith("image/")) {
    cb(null, true)
  } else {
    cb(new Error("Only image files are allowed!"), false)
  }
}

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
})

export function getImageUrl(filename, type = "products") {
  return `/uploads/${type}/${filename}`
}

export function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
  } catch (error) {
    console.error("Error deleting file:", error)
  }
  return false
}

// Helper function to validate image files
export function validateImageFile(file, maxSize = 5 * 1024 * 1024) {
  const errors = []

  if (!file) {
    errors.push("No file provided")
    return errors
  }

  if (!file.type || !file.type.startsWith("image/")) {
    errors.push("File must be an image")
  }

  if (file.size > maxSize) {
    errors.push(`File size must be less than ${maxSize / (1024 * 1024)}MB`)
  }

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
  if (!allowedTypes.includes(file.type)) {
    errors.push("File type not supported. Please use JPEG, PNG, GIF, or WebP")
  }

  return errors
}

// Helper function to generate unique filename
export function generateUniqueFilename(originalName, prefix = "") {
  const timestamp = Date.now()
  const randomSuffix = Math.round(Math.random() * 1e9)
  const fileExtension = path.extname(originalName)
  const baseName = path.basename(originalName, fileExtension)

  return `${prefix}${prefix ? "-" : ""}${baseName}-${timestamp}-${randomSuffix}${fileExtension}`
}
*/