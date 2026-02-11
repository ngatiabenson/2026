import express from "express"
import { query } from "../utils/database.js"
import { 
  comparePassword, 
  generateToken, 
  generateRefreshToken,
  verifyRefreshToken,
  hashPassword, 
  validatePassword,
  incrementLoginAttempts,
  resetLoginAttempts,
  isAccountLocked,
  createUserSession,
  invalidateAllUserSessions,
  logUserAction
} from "../utils/auth.js"
import { authenticateToken } from "../middleware/auth.js"
import { absoluteImageUrl } from "../utils/url.js"
import emailService from "../services/emailService.js"

const router = express.Router()

// Helper function to get client IP
const getClientIP = (req) => {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
         (req.connection.socket ? req.connection.socket.remoteAddress : null)
}

// Helper function to get device info
const getDeviceInfo = (req) => {
  const userAgent = req.get("User-Agent") || ""
  return {
    userAgent,
    ip: getClientIP(req),
    timestamp: new Date().toISOString()
  }
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    // Find user by email (only active users)
    const result = await query(
      "SELECT id, email, password_hash, role, name, is_active, is_verified, login_attempts FROM users WHERE email = $1 AND deleted_at IS NULL", 
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const user = result.rows[0]

    // Check if account is locked
    const accountLocked = await isAccountLocked(user.id)
    if (accountLocked) {
      return res.status(423).json({ 
        error: "Account is temporarily locked due to multiple failed login attempts. Please try again later." 
      })
    }

    // Verify password
    if (!comparePassword(password, user.password_hash)) {
      // Increment login attempts
      await incrementLoginAttempts(user.id)
      
      // Log failed login attempt
      await logUserAction(
        user.id,
        "login_failed",
        { email, reason: "invalid_password" },
        getClientIP(req),
        req.get("User-Agent")
      )

      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Check if user is active
    if (!user.is_active) {
      await logUserAction(
        user.id,
        "login_failed",
        { email, reason: "account_inactive" },
        getClientIP(req),
        req.get("User-Agent")
      )
      return res.status(401).json({ error: "Account is deactivated" })
    }

    // Check if user is verified
    if (!user.is_verified) {
      await logUserAction(
        user.id,
        "login_failed",
        { email, reason: "email_not_verified" },
        getClientIP(req),
        req.get("User-Agent")
      )
      return res.status(401).json({ 
        error: "Email verification required. Please check your email and verify your account." 
      })
    }

    // Reset login attempts on successful login
    await resetLoginAttempts(user.id)

    // Update last login
    await query(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
      [user.id]
    )

    // Create user session
    const deviceInfo = getDeviceInfo(req)
    const sessionToken = await createUserSession(
      user.id,
      JSON.stringify(deviceInfo),
      getClientIP(req),
      req.get("User-Agent")
    )

    // Generate tokens
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    // Log successful login
    await logUserAction(
      user.id,
      "login_success",
      { email, session_token: sessionToken },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        avatar_url: null,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, first_name, last_name, name, phone, salesAgentId, registrationType } = req.body

    // Combine first_name and last_name if provided separately, otherwise use name
    const fullName = first_name && last_name ? `${first_name} ${last_name}` : name

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: "Email, password, and name are required" })
    }

    // Validate password strength
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: "Password does not meet requirements", 
        details: passwordValidation.errors 
      })
    }

    // Check if user already exists (only among active users)
    const existingUser = await query(
      "SELECT id, is_active, is_verified FROM users WHERE email = $1 AND deleted_at IS NULL", 
      [email]
    )

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0]
      if (user.is_active && user.is_verified) {
        return res.status(409).json({ error: "User already exists with this email" })
      } else if (user.is_active && !user.is_verified) {
        return res.status(409).json({ 
          error: "Account exists but email is not verified. Please check your email or request a new verification email." 
        })
      }
    }

    // Hash password
    const passwordHash = hashPassword(password)

    await query("BEGIN")

    try {
      // Create user
      const result = await query(
        `INSERT INTO users (email, password_hash, name, phone, role, is_active, is_verified) 
         VALUES ($1, $2, $3, $4, 'customer', true, false) 
         RETURNING id, email, name, role`,
        [email, passwordHash, fullName, phone || null],
      )

      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to create user")
      }

      const user = result.rows[0]

      // Create wallet for new user
      await query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0.00)", [user.id])

      if (salesAgentId && registrationType === "agent") {
        await query(
          "INSERT INTO customer_assignments (customer_id, sales_agent_id, assigned_at, is_active) VALUES ($1, $2, CURRENT_TIMESTAMP, true)",
          [user.id, salesAgentId],
        )
      }

      await query("COMMIT")

      // Send verification email
      try {
        await emailService.sendVerificationEmail(user.id, user.email, user.name)
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError)
        // Don't fail registration if email fails
      }

      // Log registration
      await logUserAction(
        user.id,
        "registration",
        { email, name: fullName },
        getClientIP(req),
        req.get("User-Agent")
      )

      res.status(201).json({
        success: true,
        message: "Registration successful! Please check your email to verify your account.",
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        },
      })
    } catch (error) {
      await query("ROLLBACK")
      throw error
    }
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/verify-email
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ error: "Verification token is required" })
    }

    // Verify token
    const tokenData = await emailService.verifyToken(token, "verification")
    if (!tokenData) {
      return res.status(400).json({ error: "Invalid or expired verification token" })
    }

    // Update user as verified
    await query(
      "UPDATE users SET is_verified = true WHERE id = $1",
      [tokenData.user_id]
    )

    // Mark token as used
    await emailService.markTokenAsUsed(token, "verification")

    // Log email verification
    await logUserAction(
      tokenData.user_id,
      "email_verified",
      { token },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "Email verified successfully! You can now log in to your account.",
    })
  } catch (error) {
    console.error("Email verification error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/resend-verification
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Find user
    const result = await query(
      "SELECT id, email, name, is_verified FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = result.rows[0]

    if (user.is_verified) {
      return res.status(400).json({ error: "Email is already verified" })
    }

    // Send verification email
    await emailService.sendVerificationEmail(user.id, user.email, user.name)

    // Log resend verification
    await logUserAction(
      user.id,
      "verification_resent",
      { email },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "Verification email sent successfully!",
    })
  } catch (error) {
    console.error("Resend verification error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Find user
    const result = await query(
      "SELECT id, email, name, is_active, is_verified FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email]
    )

    if (result.rows.length === 0) {
      // Don't reveal if user exists or not
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      })
    }

    const user = result.rows[0]

    if (!user.is_active) {
      return res.status(400).json({ error: "Account is deactivated" })
    }

    if (!user.is_verified) {
      return res.status(400).json({ error: "Email verification required first" })
    }

    // Send password reset email
    await emailService.sendPasswordResetEmail(user.id, user.email, user.name)

    // Log password reset request
    await logUserAction(
      user.id,
      "password_reset_requested",
      { email },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/reset-password/:token
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: "New password is required" })
    }

    // Validate password strength
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: "Password does not meet requirements", 
        details: passwordValidation.errors 
      })
    }

    // Verify token
    const tokenData = await emailService.verifyToken(token, "reset")
    if (!tokenData) {
      return res.status(400).json({ error: "Invalid or expired reset token" })
    }

    // Hash new password
    const passwordHash = hashPassword(password)

    // Update password
    await query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, tokenData.user_id]
    )

    // Mark token as used
    await emailService.markTokenAsUsed(token, "reset")

    // Invalidate all user sessions for security
    await invalidateAllUserSessions(tokenData.user_id)

    // Log password reset
    await logUserAction(
      tokenData.user_id,
      "password_reset_completed",
      { token },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "Password reset successfully! Please log in with your new password.",
    })
  } catch (error) {
    console.error("Password reset error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/refresh-token
router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" })
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken)
    if (!decoded) {
      return res.status(403).json({ error: "Invalid or expired refresh token" })
    }

    // Verify user is still active and verified
    const userResult = await query(
      "SELECT id, email, role, name, is_active, is_verified FROM users WHERE id = $1 AND deleted_at IS NULL",
      [decoded.id]
    )

    if (userResult.rows.length === 0) {
      return res.status(403).json({ error: "User not found" })
    }

    const user = userResult.rows[0]

    if (!user.is_active) {
      return res.status(403).json({ error: "Account is deactivated" })
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: "Email verification required" })
    }

    // Generate new access token
    const newToken = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    res.json({
      success: true,
      token: newToken,
    })
  } catch (error) {
    console.error("Token refresh error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/logout
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    // Invalidate all user sessions
    await invalidateAllUserSessions(userId)

    // Log logout
    await logUserAction(
      userId,
      "logout",
      {},
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "Logged out successfully",
    })
  } catch (error) {
    console.error("Logout error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/auth/profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      "SELECT id, email, name, phone, role, profile_image, created_at, last_login FROM users WHERE id = $1", 
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const row = result.rows[0]
    res.json({
      success: true,
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone,
        role: row.role,
        created_at: row.created_at,
        last_login: row.last_login,
        profile_image: absoluteImageUrl(req, row.profile_image || null),
        avatar_url: absoluteImageUrl(req, row.profile_image || null),
      },
    })
  } catch (error) {
    console.error("Profile fetch error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /api/auth/profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { name, phone } = req.body

    if (!name) {
      return res.status(400).json({ error: "Name is required" })
    }

    const result = await query(
      "UPDATE users SET name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, email, name, phone, role",
      [name, phone || null, userId],
    )

    // Log profile update
    await logUserAction(
      userId,
      "profile_updated",
      { name, phone },
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      user: result.rows[0],
      message: "Profile updated successfully",
    })
  } catch (error) {
    console.error("Profile update error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/auth/change-password and /api/auth/update-password
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { currentPassword, current_password, newPassword, new_password } = req.body

    const currentPwd = currentPassword || current_password
    const newPwd = newPassword || new_password

    if (!currentPwd || !newPwd) {
      return res.status(400).json({ error: "Current password and new password are required" })
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPwd)
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: "New password does not meet requirements", 
        details: passwordValidation.errors 
      })
    }

    // Get current password hash
    const userResult = await query("SELECT password_hash FROM users WHERE id = $1", [userId])

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const userPasswordHash = userResult.rows[0]?.password_hash
    if (!userPasswordHash) {
      return res.status(500).json({ error: "User password data is corrupted" })
    }

    // Verify current password
    if (!comparePassword(currentPwd, userPasswordHash)) {
      return res.status(401).json({ error: "Current password is incorrect" })
    }

    // Hash new password
    const newPasswordHash = hashPassword(newPwd)

    // Update password
    await query("UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
      newPasswordHash,
      userId,
    ])

    // Invalidate all user sessions for security
    await invalidateAllUserSessions(userId)

    // Log password change
    await logUserAction(
      userId,
      "password_changed",
      {},
      getClientIP(req),
      req.get("User-Agent")
    )

    res.json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    })
  } catch (error) {
    console.error("Password change error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Alias for update-password endpoint
router.patch("/update-password", authenticateToken, async (req, res) => {
  // Reuse the same logic as change-password
  req.url = "/change-password"
  req.method = "POST"
  return router.handle(req, res)
})

export default router