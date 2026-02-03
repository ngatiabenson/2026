import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { v4 as uuidv4 } from "uuid"
import { query } from "./database.js"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key"

export const hashPassword = (password) => {
  return bcrypt.hashSync(password, 12)
}

export const comparePassword = (password, hash) => {
  return bcrypt.compareSync(password, hash)
}

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" }) // Reduced to 1 hour for security
}

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: "7d" })
}

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return null
  }
}

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET)
  } catch (error) {
    return null
  }
}

export const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7)
  }
  return null
}

export const authenticateUser = async (req) => {
  const token = getTokenFromRequest(req)
  if (!token) {
    return null
  }

  const decoded = verifyToken(token)
  if (!decoded) {
    return null
  }

  return decoded
}

export const refreshToken = (user) => {
  return generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  })
}

export const validatePassword = (password) => {
  const minLength = 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  const errors = []

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`)
  }
  if (!hasUpperCase) {
    errors.push("Password must contain at least one uppercase letter")
  }
  if (!hasLowerCase) {
    errors.push("Password must contain at least one lowercase letter")
  }
  if (!hasNumbers) {
    errors.push("Password must contain at least one number")
  }
  if (!hasSpecialChar) {
    errors.push("Password must contain at least one special character")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// Session management functions
export const createUserSession = async (userId, deviceInfo, ipAddress, userAgent) => {
  try {
    const sessionToken = uuidv4()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await query(
      `INSERT INTO user_sessions (user_id, session_token, device_info, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, sessionToken, deviceInfo, ipAddress, userAgent, expiresAt]
    )

    return sessionToken
  } catch (error) {
    console.error("Failed to create user session:", error)
    throw error
  }
}

export const validateUserSession = async (sessionToken) => {
  try {
    const result = await query(
      `SELECT us.*, u.id, u.email, u.role, u.name, u.is_active, u.is_verified
       FROM user_sessions us
       JOIN users u ON us.user_id = u.id
       WHERE us.session_token = $1 AND us.expires_at > NOW()`,
      [sessionToken]
    )

    if (result.rows.length === 0) {
      return null
    }

    const session = result.rows[0]
    
    // Update last activity
    await query(
      "UPDATE user_sessions SET last_activity = NOW() WHERE session_token = $1",
      [sessionToken]
    )

    return session
  } catch (error) {
    console.error("Failed to validate user session:", error)
    throw error
  }
}

export const invalidateUserSession = async (sessionToken) => {
  try {
    await query(
      "DELETE FROM user_sessions WHERE session_token = $1",
      [sessionToken]
    )
  } catch (error) {
    console.error("Failed to invalidate user session:", error)
    throw error
  }
}

export const invalidateAllUserSessions = async (userId) => {
  try {
    await query(
      "DELETE FROM user_sessions WHERE user_id = $1",
      [userId]
    )
  } catch (error) {
    console.error("Failed to invalidate all user sessions:", error)
    throw error
  }
}

// Account lockout functions
export const incrementLoginAttempts = async (userId) => {
  try {
    const result = await query(
      `UPDATE users 
       SET login_attempts = login_attempts + 1,
           locked_until = CASE 
             WHEN login_attempts >= 4 THEN NOW() + INTERVAL '15 minutes'
             ELSE locked_until
           END
       WHERE id = $1
       RETURNING login_attempts, locked_until`,
      [userId]
    )

    return result.rows[0]
  } catch (error) {
    console.error("Failed to increment login attempts:", error)
    throw error
  }
}

export const resetLoginAttempts = async (userId) => {
  try {
    await query(
      "UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1",
      [userId]
    )
  } catch (error) {
    console.error("Failed to reset login attempts:", error)
    throw error
  }
}

export const isAccountLocked = async (userId) => {
  try {
    const result = await query(
      "SELECT locked_until FROM users WHERE id = $1",
      [userId]
    )

    if (result.rows.length === 0) {
      return false
    }

    const lockedUntil = result.rows[0].locked_until
    return lockedUntil && new Date(lockedUntil) > new Date()
  } catch (error) {
    console.error("Failed to check account lock status:", error)
    return false
  }
}

// Audit logging
export const logUserAction = async (userId, action, details, ipAddress, userAgent) => {
  try {
    await query(
      `INSERT INTO user_audit_log (user_id, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, JSON.stringify(details), ipAddress, userAgent]
    )
  } catch (error) {
    console.error("Failed to log user action:", error)
    // Don't throw error for audit logging failures
  }
}
