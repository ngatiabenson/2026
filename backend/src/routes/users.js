import express from "express"
import { query } from "../utils/database.js"
import { authenticateToken, requireRole } from "../middleware/auth.js"
import { logUserAction, invalidateAllUserSessions } from "../utils/auth.js"

const router = express.Router()

// Helper function to get client IP
const getClientIP = (req) => {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
         (req.connection.socket ? req.connection.socket.remoteAddress : null)
}

// GET /api/users/profile - Get current user's profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

  const result = await query(
  `SELECT id, name, email, phone, role, is_active, is_verified, created_at, updated_at, last_login,
          profile_image AS "imageUrl"
   FROM users WHERE id = $1 AND deleted_at IS NULL`,
  [userId]
)


    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = result.rows[0]

    // Split name into first_name and last_name for frontend compatibility
    const nameParts = user.name ? user.name.split(" ") : ["", ""]
    const profileData = {
      ...user,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      phone_number: user.phone, // Frontend expects phone_number
    }

    res.json({
      success: true,
      data: profileData,
    })
  } catch (error) {
    console.error("Profile fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /api/users/profile - Update current user's profile
/*
/router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { first_name, last_name, name, phone, phone_number } = req.body

    // Handle both name formats - combine first_name/last_name or use name directly
    const fullName = first_name && last_name ? `${first_name} ${last_name}` : name
    const phoneValue = phone_number || phone // Handle both field names

    if (!fullName) {
      return res.status(400).json({ error: "Name is required" })
    }

    const result = await query(
      `UPDATE users SET name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id, name, email, phone, role, updated_at`,
      [fullName, phoneValue || null, userId],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = result.rows[0]
    const nameParts = user.name ? user.name.split(" ") : ["", ""]
    const profileData = {
      ...user,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      phone_number: user.phone,
    }

    // Log profile update
    await logUserAction(
      userId,
      "profile_updated",
      { name: fullName, phone: phoneValue },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      data: profileData,
      message: "Profile updated successfully",
    })
  } catch (error) {
    console.error("Profile update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})
*/
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { first_name, last_name, name, phone, phone_number, avatar_url } = req.body

    // Combine first_name + last_name if provided
    let fullName = first_name && last_name ? `${first_name} ${last_name}` : name

    // Only validate name if user is trying to update it
    if ((name || first_name || last_name) && !fullName) {
      return res.status(400).json({ error: "Name is required" })
    }

    const phoneValue = phone_number || phone

    const result = await query(
      `UPDATE users 
       SET 
         name = COALESCE($1, name), 
         phone = COALESCE($2, phone),
         profile_image = COALESCE($3, profile_image),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND deleted_at IS NULL
       RETURNING id, name, email, phone, profile_image as imageUrl, role, updated_at`,
      [fullName || null, phoneValue || null, avatar_url || null, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = result.rows[0]

    const nameParts = user.name ? user.name.split(" ") : ["", ""]
    const profileData = {
      ...user,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      phone_number: user.phone,
    }

    await logUserAction(
      userId,
      "profile_updated",
      { name: fullName, phone: phoneValue, avatar_url },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      data: profileData,
      message: "Profile updated successfully",
    })
  } catch (error) {
    console.error("Profile update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/users/account - Anonymize and archive user account
router.delete("/account", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { confirmation } = req.body

    if (confirmation !== "DELETE") {
      return res.status(400).json({ error: "Invalid confirmation. Please type 'DELETE' to confirm." })
    }

    // Get user data before anonymization
    const userResult = await query(
      "SELECT email, name, phone FROM users WHERE id = $1 AND deleted_at IS NULL",
      [userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = userResult.rows[0]

    // Use the anonymize_user_data function from the migration
    await query("SELECT anonymize_user_data($1)", [userId])

    // Log account deletion
    await logUserAction(
      userId,
      "account_deleted",
      { 
        original_email: user.email, 
        original_name: user.name,
        anonymized_at: new Date().toISOString()
      },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "Account has been permanently deleted and all personal data has been anonymized. Historical transaction data has been preserved for audit purposes.",
    })
  } catch (error) {
    console.error("Account deletion error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/users - Get all users (admin only)
router.get("/", requireRole(["admin"]), async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search, include_deleted = false } = req.query
    const offset = (page - 1) * limit

    let whereClause = "WHERE 1=1"
    const params = []

    if (!include_deleted) {
      whereClause += " AND deleted_at IS NULL"
    }

    if (role) {
      whereClause += " AND role = $" + (params.length + 1)
      params.push(role)
    }

    if (search) {
      whereClause += " AND (name ILIKE $" + (params.length + 1) + " OR email ILIKE $" + (params.length + 2) + ")"
      params.push(`%${search}%`, `%${search}%`)
    }

    const result = await query(
      `SELECT id, name, email, phone, role, is_active, is_verified, created_at, updated_at, last_login, deleted_at
       FROM users ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    )

    const countResult = await query(`SELECT COUNT(*) as total FROM users ${whereClause}`, params)

    res.json({
      success: true,
      users: result.rows,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: Number.parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    })
  } catch (error) {
    console.error("Users fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/users/:id - Get user by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    // Users can only access their own data unless they're admin
    if (req.user.role !== "admin" && req.user.id !== Number.parseInt(id)) {
      return res.status(403).json({ error: "Access denied" })
    }

    const result = await query(
      "SELECT id, name, email, phone, role, is_active, is_verified, created_at, updated_at, last_login, deleted_at FROM users WHERE id = $1",
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      success: true,
      user: result.rows[0],
    })
  } catch (error) {
    console.error("User fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /api/users/:id - Update user
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, is_active, is_verified } = req.body

    // Users can only update their own data unless they're admin
    if (req.user.role !== "admin" && req.user.id !== Number.parseInt(id)) {
      return res.status(403).json({ error: "Access denied" })
    }

    // Regular users can only update name and phone
    if (req.user.role !== "admin") {
      if (!name) {
        return res.status(400).json({ error: "Name is required" })
      }

      const result = await query(
        "UPDATE users SET name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND deleted_at IS NULL RETURNING id, name, email, phone, role, updated_at",
        [name, phone || null, id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" })
      }

      // Log profile update
      await logUserAction(
        req.user.id,
        "profile_updated",
        { name, phone, target_user_id: id },
        getClientIP(req),
        req.get("User-Agent")
      )

      res.json({
        success: true,
        user: result.rows[0],
        message: "Profile updated successfully",
      })
    } else {
      // Admin can update all fields
      if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required" })
      }

      // Check if email is already taken by another user
      const existingUser = await query("SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL", [email, id])

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: "Email already taken" })
      }

      const result = await query(
        "UPDATE users SET name = $1, email = $2, phone = $3, is_active = $4, is_verified = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 AND deleted_at IS NULL RETURNING id, name, email, phone, role, is_active, is_verified, updated_at",
        [name, email, phone || null, is_active !== undefined ? is_active : true, is_verified !== undefined ? is_verified : false, id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" })
      }

      // Log admin user update
      await logUserAction(
        req.user.id,
        "admin_user_update",
        { 
          target_user_id: id, 
          name, 
          email, 
          phone, 
          is_active, 
          is_verified 
        },
        getClientIP(req),
        req.get("User-Agent")
      )

      res.json({
        success: true,
        user: result.rows[0],
        message: "User updated successfully",
      })
    }
  } catch (error) {
    console.error("User update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/users/:id - Anonymize user (admin only)
router.delete("/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    // Prevent admin from deleting themselves
    if (req.user.id === Number.parseInt(id)) {
      return res.status(400).json({ error: "You cannot delete your own account" })
    }

    // Get user data before anonymization
    const userResult = await query(
      "SELECT email, name, phone FROM users WHERE id = $1 AND deleted_at IS NULL",
      [id]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = userResult.rows[0]

    // Use the anonymize_user_data function from the migration
    await query("SELECT anonymize_user_data($1)", [id])

    // Log admin user deletion
    await logUserAction(
      req.user.id,
      "admin_user_deletion",
      { 
        target_user_id: id,
        original_email: user.email, 
        original_name: user.name,
        anonymized_at: new Date().toISOString()
      },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "User account has been permanently deleted and all personal data has been anonymized. Historical transaction data has been preserved for audit purposes.",
    })
  } catch (error) {
    console.error("User deletion error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/users/:id/deactivate - Deactivate user (admin only)
router.post("/:id/deactivate", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    // Prevent admin from deactivating themselves
    if (req.user.id === Number.parseInt(id)) {
      return res.status(400).json({ error: "You cannot deactivate your own account" })
    }

    const result = await query(
      "UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, email",
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    // Invalidate all user sessions
    await invalidateAllUserSessions(id)

    // Log user deactivation
    await logUserAction(
      req.user.id,
      "user_deactivated",
      { 
        target_user_id: id,
        reason: reason || "No reason provided"
      },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "User deactivated successfully",
    })
  } catch (error) {
    console.error("User deactivation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/users/:id/reactivate - Reactivate user (admin only)
router.post("/:id/reactivate", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      "UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, email",
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    // Log user reactivation
    await logUserAction(
      req.user.id,
      "user_reactivated",
      { target_user_id: id },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "User reactivated successfully",
    })
  } catch (error) {
    console.error("User reactivation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/users/:id/audit-log - Get user audit log (admin only)
router.get("/:id/audit-log", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params
    const { page = 1, limit = 50 } = req.query
    const offset = (page - 1) * limit

    const result = await query(
      `SELECT action, details, ip_address, user_agent, created_at
       FROM user_audit_log 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    )

    const countResult = await query(
      "SELECT COUNT(*) as total FROM user_audit_log WHERE user_id = $1",
      [id]
    )

    res.json({
      success: true,
      audit_log: result.rows,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total: Number.parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    })
  } catch (error) {
    console.error("Audit log fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/users/:id/sessions - Get user sessions (admin only)
router.get("/:id/sessions", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      `SELECT session_token, device_info, ip_address, user_agent, expires_at, created_at, last_activity
       FROM user_sessions 
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [id]
    )

    res.json({
      success: true,
      sessions: result.rows.map(session => ({
        ...session,
        device_info: JSON.parse(session.device_info || '{}')
      })),
    })
  } catch (error) {
    console.error("User sessions fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/users/:id/sessions - Invalidate all user sessions (admin only)
router.delete("/:id/sessions", requireRole(["admin"]), async (req, res) => {
  try {
    const { id } = req.params

    await invalidateAllUserSessions(id)

    // Log session invalidation
    await logUserAction(
      req.user.id,
      "user_sessions_invalidated",
      { target_user_id: id },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "All user sessions have been invalidated",
    })
  } catch (error) {
    console.error("Session invalidation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router