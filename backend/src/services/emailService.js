/*resend email for render*/
import dotenv from "dotenv"
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.local"
dotenv.config({ path: envFile })

import nodemailer from "nodemailer"
import { Resend } from "resend"
import { v4 as uuidv4 } from "uuid"
import { query } from "../utils/database.js"

class EmailService {
  constructor() {
    this.transporter = null
    this.resend = null
    this.isProduction = process.env.NODE_ENV === "production"

    if (this.isProduction && process.env.RESEND_API_KEY) {
      console.log("Using Resend (production email service)")
      this.resend = new Resend(process.env.RESEND_API_KEY)
    } else {
      this.initializeTransporter()
    }
  }

  initializeTransporter() {
    console.log("Using SMTP config:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      user: process.env.SMTP_USER,
    })

    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })

      this.transporter.verify((error) => {
        if (error) {
          console.error("SMTP configuration error:", error)
        } else {
          console.log("SMTP ready for local development")
        }
      })
    } catch (error) {
      console.error("Failed to initialize SMTP:", error)
    }
  }

  async sendEmail(to, subject, html, text = null) {
    const fromAddress =
      process.env.SMTP_FROM || "info@tambuaphish.store"

    try {
      // 🚀 Production → Resend
      if (this.isProduction && this.resend) {
        const response = await this.resend.emails.send({
          from: fromAddress,
          to,
          subject,
          html,
        })

        console.log("Email sent via Resend:", response?.id)
        return response
      }

      // 🛠 Local → SMTP
      if (!this.transporter) {
        throw new Error("Email service not initialized")
      }

      const result = await this.transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      })

      console.log("Email sent via SMTP:", result.messageId)
      return result
    } catch (error) {
      console.error("Failed to send email:", error)
      throw error
    }
  }

  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  async generateVerificationToken(userId) {
    const token = uuidv4()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await query(
      "INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [userId, token, expiresAt]
    )

    return token
  }

  async generatePasswordResetToken(userId) {
    const token = uuidv4()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [userId, token, expiresAt]
    )

    return token
  }

  async verifyToken(token, type = "verification") {
    const tableName =
      type === "verification"
        ? "email_verification_tokens"
        : "password_reset_tokens"

    const result = await query(
      `SELECT user_id, expires_at FROM ${tableName}
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [token]
    )

    return result.rows.length ? result.rows[0] : null
  }

  async markTokenAsUsed(token, type = "verification") {
    const tableName =
      type === "verification"
        ? "email_verification_tokens"
        : "password_reset_tokens"

    await query(
      `UPDATE ${tableName} SET used_at = NOW() WHERE token = $1`,
      [token]
    )
  }

  async sendVerificationEmail(userId, email, name) {
    const token = await this.generateVerificationToken(userId)
    const verificationUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/verify-email?token=${token}`

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif;">
<h2>Hello ${name},</h2>
<p>Thank you for registering with FirstCraft.</p>
<p><a href="${verificationUrl}">Verify Email Address</a></p>
<p>If the link doesn't work, copy and paste:</p>
<p>${verificationUrl}</p>
<p>This link expires in 24 hours.</p>
</body>
</html>`

    await this.sendEmail(
      email,
      "Verify Your Email Address - FirstCraft",
      html
    )

    return token
  }

  async sendPasswordResetEmail(userId, email, name) {
    const token = await this.generatePasswordResetToken(userId)
    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/reset-password?token=${token}`

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Password Reset</title>
</head>
<body style="font-family: Arial, sans-serif;">
<h2>Hello ${name},</h2>
<p>Click below to reset your password:</p>
<p><a href="${resetUrl}">Reset Password</a></p>
<p>This link expires in 1 hour.</p>
</body>
</html>`

    await this.sendEmail(
      email,
      "Reset Your Password - FirstCraft",
      html
    )

    return token
  }

  async sendOrderConfirmationEmail(email, name, orderData) {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
<h2>Hello ${name},</h2>
<p>Your order has been confirmed.</p>
<p><strong>Order:</strong> ${orderData.orderNumber}</p>
<p><strong>Total:</strong> $${orderData.totalAmount}</p>
<p><strong>Status:</strong> ${orderData.status}</p>
</body>
</html>`

    await this.sendEmail(
      email,
      `Order Confirmation - ${orderData.orderNumber}`,
      html
    )
  }

  async sendOrderStatusUpdateEmail(email, name, orderData) {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
<h2>Hello ${name},</h2>
<p>Your order status is now: ${orderData.status}</p>
<p><strong>Order:</strong> ${orderData.orderNumber}</p>
</body>
</html>`

    await this.sendEmail(
      email,
      `Order Update - ${orderData.orderNumber}`,
      html
    )
  }

  async sendWalletNotificationEmail(email, name, transactionData) {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
<h2>Hello ${name},</h2>
<p>Your wallet has a new transaction.</p>
<p><strong>Type:</strong> ${transactionData.type}</p>
<p><strong>Amount:</strong> $${transactionData.amount}</p>
</body>
</html>`

    await this.sendEmail(
      email,
      "Wallet Transaction - FirstCraft",
      html
    )
  }
}

export default new EmailService()



/*
/nodemailer & smtp local development
import dotenv from 'dotenv'
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.local"
dotenv.config({ path: envFile })

import nodemailer from "nodemailer"
import { v4 as uuidv4 } from "uuid"
import { query } from "../utils/database.js"

class EmailService {
  constructor() {
    this.transporter = null
    this.initializeTransporter()
  }

  initializeTransporter() {
    console.log("Using SMTP config:", {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
      secure: true, 
    user: process.env.SMTP_USER,
  })
    try {
      // Configure email transporter based on environment
     if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "development") {
  // Use real SMTP in both prod & dev
  this.transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true, // Zoho works fine with STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
} else {
  // Fallback to Ethereal
  this.transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "ethereal.user@ethereal.email",
      pass: "ethereal.pass",
    },
  })
}


      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          console.error("Email service configuration error:", error)
        } else {
          console.log("Email service is ready to send messages")
        }
      })
    } catch (error) {
      console.error("Failed to initialize email service:", error)
    }
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      throw new Error("Email service not initialized")
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || "info@tambuaphish.store",
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      }

      const result = await this.transporter.sendMail(mailOptions)
      console.log("Email sent successfully:", result.messageId)
      return result
    } catch (error) {
      console.error("Failed to send email:", error)
      throw error
    }
  }

  htmlToText(html) {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  async generateVerificationToken(userId) {
    const token = uuidv4()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    try {
      console.log(`Generating verification token for user ${userId}: ${token}`)
      
      // Store token in database
      await query(
        "INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [userId, token, expiresAt]
      )

      console.log(`Verification token stored successfully for user ${userId}`)
      return token
    } catch (error) {
      console.error("Failed to generate verification token:", error)
      throw error
    }
  }

  async generatePasswordResetToken(userId) {
    const token = uuidv4()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    try {
      // Store token in database
      await query(
        "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [userId, token, expiresAt]
      )

      return token
    } catch (error) {
      console.error("Failed to generate password reset token:", error)
      throw error
    }
  }

  async verifyToken(token, type = "verification") {
    try {
      const tableName = type === "verification" ? "email_verification_tokens" : "password_reset_tokens"
      console.log(`Verifying ${type} token: ${token}`)
      
      const result = await query(
        `SELECT user_id, expires_at FROM ${tableName} 
         WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
        [token]
      )

      console.log(`Token verification result:`, result.rows)

      if (result.rows.length === 0) {
        console.log(`No valid token found for ${token}`)
        return null
      }

      return result.rows[0]
    } catch (error) {
      console.error("Failed to verify token:", error)
      throw error
    }
  }

  async markTokenAsUsed(token, type = "verification") {
    try {
      const tableName = type === "verification" ? "email_verification_tokens" : "password_reset_tokens"
      await query(
        `UPDATE ${tableName} SET used_at = NOW() WHERE token = $1`,
        [token]
      )
    } catch (error) {
      console.error("Failed to mark token as used:", error)
      throw error
    }
  }

  async sendVerificationEmail(userId, email, name) {
    try {
      const token = await this.generateVerificationToken(userId)
      const verificationUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/verify-email?token=${token}`

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verify Your Email</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to FirstCraft!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>Thank you for registering with FirstCraft. To complete your registration and start shopping, please verify your email address by clicking the button below:</p>
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p><a href="${verificationUrl}">${verificationUrl}</a></p>
              <p>This verification link will expire in 24 hours.</p>
              <p>If you didn't create an account with FirstCraft, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>© 2024 FirstCraft. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `

      await this.sendEmail(email, "Verify Your Email Address - FirstCraft", html)
      return token
    } catch (error) {
      console.error("Failed to send verification email:", error)
      throw error
    }
  }

  async sendPasswordResetEmail(userId, email, name) {
    try {
      const token = await this.generatePasswordResetToken(userId)
      const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${token}`

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reset Your Password</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 12px 24px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>We received a request to reset your password for your FirstCraft account. If you made this request, click the button below to reset your password:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
              <p><a href="${resetUrl}">${resetUrl}</a></p>
              <div class="warning">
                <strong>Important:</strong> This password reset link will expire in 1 hour for security reasons.
              </div>
              <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            </div>
            <div class="footer">
              <p>© 2024 FirstCraft. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `

      await this.sendEmail(email, "Reset Your Password - FirstCraft", html)
      return token
    } catch (error) {
      console.error("Failed to send password reset email:", error)
      throw error
    }
  }

  async sendOrderConfirmationEmail(email, name, orderData) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Order Confirmation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .order-details { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Confirmed!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>Thank you for your order! We've received your order and it's being processed.</p>
              <div class="order-details">
                <h3>Order Details:</h3>
                <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
                <p><strong>Total Amount:</strong> $${orderData.totalAmount}</p>
                <p><strong>Status:</strong> ${orderData.status}</p>
                <p><strong>Order Date:</strong> ${new Date(orderData.createdAt).toLocaleDateString()}</p>
              </div>
              <p>You can track your order status in your account dashboard.</p>
            </div>
            <div class="footer">
              <p>© 2024 FirstCraft. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `

      await this.sendEmail(email, `Order Confirmation - ${orderData.orderNumber}`, html)
    } catch (error) {
      console.error("Failed to send order confirmation email:", error)
      throw error
    }
  }

  async sendOrderStatusUpdateEmail(email, name, orderData) {
    try {
      const statusMessages = {
        processing: "Your order is being processed",
        shipped: "Your order has been shipped",
        delivered: "Your order has been delivered",
        cancelled: "Your order has been cancelled",
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Order Status Update</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .order-details { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Status Update</h1>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>${statusMessages[orderData.status] || "Your order status has been updated"}.</p>
              <div class="order-details">
                <h3>Order Details:</h3>
                <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
                <p><strong>Status:</strong> ${orderData.status}</p>
                <p><strong>Updated:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              <p>You can track your order status in your account dashboard.</p>
            </div>
            <div class="footer">
              <p>© 2024 FirstCraft. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `

      await this.sendEmail(email, `Order Update - ${orderData.orderNumber}`, html)
    } catch (error) {
      console.error("Failed to send order status update email:", error)
      throw error
    }
  }

  async sendWalletNotificationEmail(email, name, transactionData) {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Wallet Transaction</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .transaction-details { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Wallet Transaction</h1>
            </div>
            <div class="content">
              <h2>Hello ${name},</h2>
              <p>Your wallet has been updated with a new transaction.</p>
              <div class="transaction-details">
                <h3>Transaction Details:</h3>
                <p><strong>Type:</strong> ${transactionData.type}</p>
                <p><strong>Amount:</strong> $${transactionData.amount}</p>
                <p><strong>Description:</strong> ${transactionData.description}</p>
                <p><strong>Date:</strong> ${new Date(transactionData.createdAt).toLocaleDateString()}</p>
              </div>
              <p>You can view your wallet balance and transaction history in your account dashboard.</p>
            </div>
            <div class="footer">
              <p>© 2024 FirstCraft. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `

      await this.sendEmail(email, "Wallet Transaction - FirstCraft", html)
    } catch (error) {
      console.error("Failed to send wallet notification email:", error)
      throw error
    }
  }
}

export default new EmailService()
*/