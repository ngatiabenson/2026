import jwt from "jsonwebtoken"
import { verifyToken, validateUserSession, logUserAction } from "../utils/auth.js"
import { query } from "../utils/database.js"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null

  if (!token) {
    return res.status(401).json({ error: "Access token required" })
  }

  try {
    const decoded = verifyToken(token)
    if (!decoded) {
      return res.status(403).json({ error: "Invalid or expired token" })
    }

    // Verify user is still active and verified
    const userResult = await query(
      "SELECT id, email, role, name, is_active, is_verified FROM users WHERE id = $1",
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

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      is_active: user.is_active,
      is_verified: user.is_verified,
    }

    // Log the API access
    await logUserAction(
      user.id,
      "api_access",
      { endpoint: req.path, method: req.method },
      req.ip,
      req.get("User-Agent")
    )

    next()
  } catch (error) {
    console.error("Token verification error:", error)
    return res.status(403).json({ error: "Invalid or expired token" })
  }
}

export const requireRole = (roles) => {
  return async (req, res, next) => {
    // First authenticate the token
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null

    if (!token) {
      return res.status(401).json({ error: "Access token required" })
    }

    try {
      const decoded = verifyToken(token)
      if (!decoded) {
        return res.status(403).json({ error: "Invalid or expired token" })
      }

      // Verify user is still active and verified
      const userResult = await query(
        "SELECT id, email, role, name, is_active, is_verified FROM users WHERE id = $1",
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

      // Check if user has required role
      if (!roles.includes(user.role)) {
        return res.status(403).json({
          error: "Insufficient permissions",
          required: roles,
          current: user.role,
        })
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        is_active: user.is_active,
        is_verified: user.is_verified,
      }

      // Log the API access
      await logUserAction(
        user.id,
        "api_access",
        { endpoint: req.path, method: req.method, required_role: roles },
        req.ip,
        req.get("User-Agent")
      )

      next()
    } catch (error) {
      console.error("Token verification error:", error)
      return res.status(403).json({ error: "Invalid or expired token" })
    }
  }
}

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = decoded
    } catch (error) {
      // Token is invalid but we don't fail the request
      req.user = null
    }
  } else {
    req.user = null
  }

  next()
}

export const requireAdmin = requireRole(["admin"])

export const requireSalesAgent = requireRole(["sales_agent", "admin"])

export const requireCustomer = requireRole(["customer", "sales_agent", "admin"])
