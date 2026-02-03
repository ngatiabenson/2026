import { query } from "../utils/database.js"
import { logUserAction, invalidateAllUserSessions } from "../utils/auth.js"
import emailService from "./emailService.js"

class UserManagementService {
  /**
   * Anonymize user data and archive historical records
   * @param {number} userId - The user ID to anonymize
   * @param {string} reason - Reason for anonymization
   * @param {number} adminUserId - ID of admin performing the action (optional)
   */
  async anonymizeUser(userId, reason = "user_deletion", adminUserId = null) {
    try {
      await query("BEGIN")

      // Get user data before anonymization
      const userResult = await query(
        "SELECT email, name, phone, role FROM users WHERE id = $1 AND deleted_at IS NULL",
        [userId]
      )

      if (userResult.rows.length === 0) {
        throw new Error("User not found")
      }

      const user = userResult.rows[0]

      // Archive wallet data
      await this.archiveWalletData(userId, user.email)

      // Archive wallet transactions
      await this.archiveWalletTransactions(userId, user.email)

      // Archive orders and order items
      await this.archiveOrders(userId, user.email)

      // Archive addresses
      await this.archiveAddresses(userId, user.email)

      // Archive cart items
      await this.archiveCartItems(userId, user.email)

      // Anonymize user data
      await query(
        `UPDATE users 
         SET 
           anonymized_email = email,
           anonymized_name = name,
           anonymized_phone = phone,
           email = 'deleted_user_' || id || '@anonymized.local',
           name = 'Deleted User',
           phone = NULL,
           is_active = false,
           deleted_at = CURRENT_TIMESTAMP,
           verification_token = NULL,
           verification_token_expires = NULL,
           reset_token = NULL,
           reset_token_expires = NULL
         WHERE id = $1`,
        [userId]
      )

      // Invalidate all user sessions
      await invalidateAllUserSessions(userId)

      // Log the anonymization
      await logUserAction(
        adminUserId || userId,
        "user_anonymized",
        {
          target_user_id: userId,
          original_email: user.email,
          original_name: user.name,
          reason,
          anonymized_at: new Date().toISOString()
        },
        null,
        null
      )

      await query("COMMIT")

      return {
        success: true,
        message: "User data has been anonymized and historical records archived",
        originalEmail: user.email,
        originalName: user.name
      }
    } catch (error) {
      await query("ROLLBACK")
      console.error("User anonymization error:", error)
      throw error
    }
  }

  /**
   * Archive wallet data
   */
  async archiveWalletData(userId, originalEmail) {
    const walletResult = await query(
      "SELECT * FROM user_wallets WHERE user_id = $1",
      [userId]
    )

    if (walletResult.rows.length > 0) {
      const wallet = walletResult.rows[0]
      await query(
        `INSERT INTO archived_user_wallets (
          original_wallet_id, user_id, anonymized_user_email,
          balance, total_earned, total_spent, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          wallet.id,
          userId,
          originalEmail,
          wallet.balance,
          wallet.total_earned,
          wallet.total_spent,
          wallet.created_at,
          wallet.updated_at
        ]
      )

      // Delete original wallet
      await query("DELETE FROM user_wallets WHERE id = $1", [wallet.id])
    }
  }

  /**
   * Archive wallet transactions
   */
  async archiveWalletTransactions(userId, originalEmail) {
    const transactionsResult = await query(
      "SELECT * FROM wallet_transactions WHERE user_id = $1",
      [userId]
    )

    for (const transaction of transactionsResult.rows) {
      await query(
        `INSERT INTO archived_wallet_transactions (
          original_transaction_id, user_id, anonymized_user_email,
          order_id, amount, type, source, description, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          transaction.id,
          userId,
          originalEmail,
          transaction.order_id,
          transaction.amount,
          transaction.type,
          transaction.source,
          transaction.description,
          transaction.created_at
        ]
      )
    }

    // Delete original transactions
    await query("DELETE FROM wallet_transactions WHERE user_id = $1", [userId])
  }

  /**
   * Archive orders and order items
   */
  async archiveOrders(userId, originalEmail) {
    const ordersResult = await query(
      "SELECT * FROM orders WHERE user_id = $1",
      [userId]
    )

    for (const order of ordersResult.rows) {
      // Archive the order
      const archivedOrderResult = await query(
        `INSERT INTO archived_orders (
          original_order_id, order_number, user_id, anonymized_user_email,
          total_amount, tax_amount, discount_amount, status, payment_status,
          shipping_address_id, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          order.id,
          order.order_number,
          userId,
          originalEmail,
          order.total_amount,
          order.tax_amount,
          order.discount_amount,
          order.status,
          order.payment_status,
          order.shipping_address_id,
          order.notes,
          order.created_at,
          order.updated_at
        ]
      )

      const archivedOrderId = archivedOrderResult.rows[0].id

      // Archive order items
      const orderItemsResult = await query(
        `SELECT oi.*, p.name as product_name 
         FROM order_items oi 
         LEFT JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = $1`,
        [order.id]
      )

      for (const item of orderItemsResult.rows) {
        await query(
          `INSERT INTO archived_order_items (
            original_item_id, order_id, product_id, product_name,
            quantity, price, total_price, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.id,
            archivedOrderId,
            item.product_id,
            item.product_name,
            item.quantity,
            item.price,
            item.total_price,
            item.created_at
          ]
        )
      }

      // Delete original order items
      await query("DELETE FROM order_items WHERE order_id = $1", [order.id])
    }

    // Delete original orders
    await query("DELETE FROM orders WHERE user_id = $1", [userId])
  }

  /**
   * Archive addresses
   */
  async archiveAddresses(userId, originalEmail) {
    // For addresses, we'll just delete them as they contain personal information
    // and are not typically needed for audit purposes
    await query("DELETE FROM addresses WHERE user_id = $1", [userId])
  }

  /**
   * Archive cart items
   */
  async archiveCartItems(userId, originalEmail) {
    // Cart items are temporary and don't need to be archived
    await query("DELETE FROM cart_items WHERE user_id = $1", [userId])
  }

  /**
   * Check if email can be reused for registration
   */
  async canReuseEmail(email) {
    const result = await query(
      "SELECT id, is_active, deleted_at FROM users WHERE email = $1",
      [email]
    )

    if (result.rows.length === 0) {
      return { canReuse: true, reason: "Email not found" }
    }

    const user = result.rows[0]

    if (user.deleted_at) {
      return { canReuse: true, reason: "User was previously deleted" }
    }

    if (!user.is_active) {
      return { canReuse: false, reason: "User account is inactive" }
    }

    return { canReuse: false, reason: "Active user exists with this email" }
  }

  /**
   * Get user statistics for admin dashboard
   */
  async getUserStatistics() {
    try {
      const stats = await query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_active = true AND deleted_at IS NULL THEN 1 END) as active_users,
          COUNT(CASE WHEN is_verified = true AND deleted_at IS NULL THEN 1 END) as verified_users,
          COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted_users,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' AND deleted_at IS NULL THEN 1 END) as new_users_30_days,
          COUNT(CASE WHEN last_login >= CURRENT_DATE - INTERVAL '7 days' AND deleted_at IS NULL THEN 1 END) as active_users_7_days
        FROM users
      `)

      const roleStats = await query(`
        SELECT 
          role,
          COUNT(*) as count
        FROM users 
        WHERE deleted_at IS NULL
        GROUP BY role
      `)

      return {
        total: stats.rows[0],
        byRole: roleStats.rows
      }
    } catch (error) {
      console.error("Failed to get user statistics:", error)
      throw error
    }
  }

  /**
   * Clean up expired tokens and sessions
   */
  async cleanupExpiredData() {
    try {
      await query("SELECT cleanup_expired_tokens()")
      console.log("Expired tokens and sessions cleaned up successfully")
    } catch (error) {
      console.error("Failed to cleanup expired data:", error)
      throw error
    }
  }

  /**
   * Send notification emails for user actions
   */
  async sendUserNotification(userId, notificationType, data) {
    try {
      const userResult = await query(
        "SELECT email, name FROM users WHERE id = $1 AND deleted_at IS NULL",
        [userId]
      )

      if (userResult.rows.length === 0) {
        throw new Error("User not found")
      }

      const user = userResult.rows[0]

      switch (notificationType) {
        case "account_deleted":
          await emailService.sendEmail(
            user.email,
            "Account Deletion Confirmation - FirstCraft",
            `
              <h2>Account Deletion Confirmed</h2>
              <p>Hello ${user.name},</p>
              <p>Your account has been successfully deleted from FirstCraft.</p>
              <p>All your personal information has been anonymized, but your historical transaction data has been preserved for audit and compliance purposes.</p>
              <p>If you wish to create a new account in the future, you can register again with the same email address.</p>
              <p>Thank you for being a valued customer.</p>
            `
          )
          break

        case "account_deactivated":
          await emailService.sendEmail(
            user.email,
            "Account Deactivated - FirstCraft",
            `
              <h2>Account Deactivated</h2>
              <p>Hello ${user.name},</p>
              <p>Your account has been deactivated by an administrator.</p>
              <p>If you believe this is an error, please contact our support team.</p>
            `
          )
          break

        case "account_reactivated":
          await emailService.sendEmail(
            user.email,
            "Account Reactivated - FirstCraft",
            `
              <h2>Account Reactivated</h2>
              <p>Hello ${user.name},</p>
              <p>Your account has been reactivated and you can now log in again.</p>
              <p>Welcome back to FirstCraft!</p>
            `
          )
          break

        default:
          console.log(`Unknown notification type: ${notificationType}`)
      }
    } catch (error) {
      console.error("Failed to send user notification:", error)
      // Don't throw error for notification failures
    }
  }
}

export default new UserManagementService()
