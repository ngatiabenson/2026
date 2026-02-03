"use client"

import { useState, useEffect, useCallback, createContext, useContext } from "react"
import { auth_api } from "../services/interceptor.js"
import toast from "react-hot-toast"

import { productsAPI, categoriesAPI, cmsAPI } from '../services/interceptor.js'


const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check if user is logged in on app start
  useEffect(() => {
  const token = localStorage.getItem("token")
  const userData =
    localStorage.getItem("user") ||
    localStorage.getItem("currentUser")

  if (token && userData) {
    try {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      setIsAuthenticated(true)
    } catch (error) {
      console.error("Error parsing user data:", error)
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      localStorage.removeItem("currentUser")
    }
  }

  setLoading(false)
}, [])


  const login = async (credentials) => {
    try {
      setLoading(true)
      const response = await auth_api.login(credentials)
      const { token, refreshToken, user } = response.data

      localStorage.setItem("token", token)
      localStorage.setItem("refreshToken", refreshToken)
      localStorage.setItem("user", JSON.stringify(user))
      localStorage.setItem("userRole", user.role)

      setUser(user)
      setIsAuthenticated(true)

      toast.success("Login successful!")
      return { success: true, user }
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Login failed"
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        if (message.includes("verification")) {
          toast.error("Please verify your email before logging in. Check your inbox for a verification email.")
        } else if (message.includes("deactivated")) {
          toast.error("Your account has been deactivated. Please contact support.")
        } else {
          toast.error("Invalid email or password")
        }
      } else if (error.response?.status === 423) {
        toast.error("Account temporarily locked due to multiple failed attempts. Please try again later.")
      } else {
        toast.error(message)
      }
      
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  const register = async (userData) => {
    try {
      setLoading(true)
      const response = await authAPI.register(userData)
      const { message, user } = response.data

      // Registration successful but user needs to verify email
      toast.success(message || "Registration successful! Please check your email to verify your account.")
      return { success: true, user, requiresVerification: true }
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Registration failed"
      
      // Handle specific error cases
      if (error.response?.status === 409) {
        if (message.includes("verification")) {
          toast.error("Account exists but email is not verified. Please check your email or request a new verification email.")
        } else {
          toast.error("An account with this email already exists")
        }
      } else if (error.response?.status === 400 && error.response?.data?.details) {
        toast.error("Password requirements not met: " + error.response.data.details.join(", "))
      } else {
        toast.error(message)
      }
      
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      localStorage.removeItem("token")
      localStorage.removeItem("refreshToken")
      localStorage.removeItem("user")
      setUser(null)
      setIsAuthenticated(false)
      toast.success("Logged out successfully")
    }
  }

  const updateProfile = async (profileData) => {
    try {
      const response = await authAPI.updateProfile(profileData)
      const updatedUser = response.data.data.user

      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)

      toast.success("Profile updated successfully!")
      return { success: true, user: updatedUser }
    } catch (error) {
      const message = error.response?.data?.message || "Profile update failed"
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const forgotPassword = async (email) => {
    try {
      await authAPI.forgotPassword(email)
      toast.success("Password reset email sent!")
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.message || "Failed to send reset email"
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const resetPassword = async (token, password) => {
    try {
      const response = await authAPI.resetPassword(token, password)
      const { message } = response.data

      toast.success(message || "Password reset successful! Please log in with your new password.")
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Password reset failed"
      
      if (error.response?.status === 400 && error.response?.data?.details) {
        toast.error("Password requirements not met: " + error.response.data.details.join(", "))
      } else {
        toast.error(message)
      }
      
      return { success: false, error: message }
    }
  }

  const verifyEmail = async (token) => {
    try {
      const response = await authAPI.verifyEmail(token)
      const { message } = response.data

      toast.success(message || "Email verified successfully!")
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Email verification failed"
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const resendVerification = async (email) => {
    try {
      const response = await authAPI.resendVerification(email)
      const { message } = response.data

      toast.success(message || "Verification email sent successfully!")
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.error || error.response?.data?.message || "Failed to resend verification email"
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const refreshToken = async () => {
    try {
      const refreshTokenValue = localStorage.getItem("refreshToken")
      if (!refreshTokenValue) {
        throw new Error("No refresh token available")
      }

      const response = await authAPI.refreshToken(refreshTokenValue)
      const { token } = response.data

      localStorage.setItem("token", token)
      return { success: true, token }
    } catch (error) {
      console.error("Token refresh failed:", error)
      // Clear all auth data on refresh failure
      localStorage.removeItem("token")
      localStorage.removeItem("refreshToken")
      localStorage.removeItem("user")
      setUser(null)
      setIsAuthenticated(false)
      return { success: false, error: "Session expired" }
    }
  }

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateProfile,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification,
    refreshToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom hook for data fetching with error handling
export const useApiData = (apiCall, dependencies = []) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiCall()
      setData(response.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data')
      console.error('API Error:', err)
    } finally {
      setLoading(false)
    }
  }, dependencies)

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

// Hook for products with caching
export const useProducts = (params = {}) => {
  return useApiData(() => productsAPI.getAll(params), [JSON.stringify(params)])
}

// Hook for categories
export const useCategories = () => {
  return useApiData(() => categoriesAPI.getAll())
}

// Hook for featured products
export const useFeaturedProducts = (section) => {
  return useApiData(() => cmsAPI.getFeaturedProducts({ section }), [section])
}

// Hook for CMS content
export const useCMSContent = (contentType) => {
  return useApiData(() => cmsAPI.getHomepageContent(), [contentType])
}

// Hook for navigation menus
export const useNavigationMenus = () => {
  return useApiData(() => cmsAPI.getNavigationMenus())
}