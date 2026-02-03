/**
 * Error handling utilities for authentication and form validation
 * Provides consistent error handling across the application
 */

/**
 * Extract error message from Axios error response
 * @param {Error} error - Axios error object
 * @returns {string} - Formatted error message
 */
export const extractErrorMessage = (error) => {
  if (error.response?.data?.error) {
    return error.response.data.error
  }
  if (error.response?.data?.message) {
    return error.response.data.message
  }
  if (error.message) {
    return error.message
  }
  return "An unexpected error occurred"
}

/**
 * Extract field-specific validation errors from backend response
 * @param {Error} error - Axios error object
 * @returns {Object} - Object with field names as keys and error messages as values
 */
export const extractFieldErrors = (error) => {
  const fieldErrors = {}
  
  if (error.response?.data?.details && Array.isArray(error.response.data.details)) {
    // Handle password validation details array
    error.response.data.details.forEach((detail, index) => {
      fieldErrors[`password_${index}`] = detail
    })
    // Also set a general password error
    fieldErrors.password = error.response.data.details.join(", ")
  }
  
  if (error.response?.data?.field_errors) {
    Object.assign(fieldErrors, error.response.data.field_errors)
  }
  
  return fieldErrors
}

/**
 * Check if error is a validation error (400 status)
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isValidationError = (error) => {
  return error.response?.status === 400
}

/**
 * Check if error is an authentication error (401 status)
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isAuthError = (error) => {
  return error.response?.status === 401
}

/**
 * Check if error is a conflict error (409 status)
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isConflictError = (error) => {
  return error.response?.status === 409
}

/**
 * Check if error is a server error (500+ status)
 * @param {Error} error - Axios error object
 * @returns {boolean}
 */
export const isServerError = (error) => {
  return error.response?.status >= 500
}

/**
 * Get appropriate severity for error type
 * @param {Error} error - Axios error object
 * @returns {string} - Material UI Alert severity
 */
export const getErrorSeverity = (error) => {
  if (isValidationError(error)) return "warning"
  if (isAuthError(error)) return "error"
  if (isConflictError(error)) return "warning"
  if (isServerError(error)) return "error"
  return "error"
}

/**
 * Format error message for display
 * @param {Error} error - Axios error object
 * @returns {string} - User-friendly error message
 */
export const formatErrorMessage = (error) => {
  const message = extractErrorMessage(error)
  
  // Handle specific error cases
  if (message.includes("verification")) {
    return "Please verify your email before logging in. Check your inbox for a verification email."
  }
  if (message.includes("deactivated")) {
    return "Your account has been deactivated. Please contact support."
  }
  if (message.includes("locked")) {
    return "Account temporarily locked due to multiple failed attempts. Please try again later."
  }
  if (message.includes("already exists")) {
    return "An account with this email already exists."
  }
  if (message.includes("not verified")) {
    return "Account exists but email is not verified. Please check your email or request a new verification email."
  }
  
  return message
}

/**
 * Create notification object for Material UI Snackbar
 * @param {Error} error - Axios error object
 * @param {string} customMessage - Optional custom message
 * @returns {Object} - Notification object with open, message, and severity
 */
export const createErrorNotification = (error, customMessage = null) => {
  return {
    open: true,
    message: customMessage || formatErrorMessage(error),
    severity: getErrorSeverity(error)
  }
}

/**
 * Create success notification object
 * @param {string} message - Success message
 * @returns {Object} - Notification object
 */
export const createSuccessNotification = (message) => {
  return {
    open: true,
    message,
    severity: "success"
  }
}

/**
 * Create info notification object
 * @param {string} message - Info message
 * @returns {Object} - Notification object
 */
export const createInfoNotification = (message) => {
  return {
    open: true,
    message,
    severity: "info"
  }
}
