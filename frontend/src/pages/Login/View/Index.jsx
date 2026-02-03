// src/pages/Login/View/Index.jsx
"use client"

import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import api from "../../../api.js" // 🗂 Axios instance
import { authAPI } from "../../../services/interceptor"
import { createErrorNotification, createSuccessNotification, extractFieldErrors } from "../../../utils/errorHandler"
import NotificationSnackbar from "../../../components/common/NotificationSnackbar"
import ForgotPasswordDialog from "../../../components/auth/ForgotPasswordDialog"

import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  Link,
} from "@mui/material"

function LoginPage({ onLogin }) {
  const navigate = useNavigate()
  const location = useLocation()

  /* ---------------- state ---------------- */
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState("customer") // default
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' })

  /* ---- detect ?type=agent in URL ------- */
  useEffect(() => {
    const typeParam = new URLSearchParams(location.search).get("type")
    if (typeParam === "agent") setUserType("agent")
  }, [location])

  /* --------------- submit --------------- */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFieldErrors({})

    if (!email || !password) {
      setFieldErrors({
        email: !email ? "Email is required" : "",
        password: !password ? "Password is required" : ""
      })
      return
    }

    try {
      setLoading(true)

      /* 1️⃣  LOGIN */
      const { data } = await api.post("/auth/login", {
        email,
        password,
      })

      const { token, refreshToken, user } = data
      localStorage.setItem("token", token)
      localStorage.setItem("refreshToken", refreshToken)
      localStorage.setItem("currentUser", JSON.stringify(user))
      localStorage.setItem("user", JSON.stringify(user))
      localStorage.setItem("userRole", user.role)

      /* 2️⃣  FETCH FULL PROFILE via /users/:id/ */
      const profileRes = await api.get(`/users/${user.id}/`)
      const userProfile = profileRes.data // adapt if your backend returns { user: {...} }

      localStorage.setItem("userProfile", JSON.stringify(userProfile))

      /* 3️⃣  Optional callback for app‑level auth state */
      if (onLogin) onLogin(user)

      setNotification(createSuccessNotification("Login successful! Redirecting…"))

      /* 4️⃣  Updated role-based redirect logic to use consistent role field */
      setTimeout(() => {
        switch (user.role) {
          case "admin":
            navigate("/admin")
            break
          case "sales_agent":
            navigate("/sales-agent")
            break
          case "customer":
          default:
            navigate("/account")
            break
        }
      }, 1000)
    } catch (err) {
      console.error("Login error:", err)
      
      // Handle field-specific errors
      const backendErrors = extractFieldErrors(err)
      if (Object.keys(backendErrors).length > 0) {
        setFieldErrors(backendErrors)
      } else {
        setNotification(createErrorNotification(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field) => (e) => {
    const value = e.target.value
    if (field === 'email') setEmail(value)
    if (field === 'password') setPassword(value)
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  /* --------------- render --------------- */
  return (
    <Container component="main" maxWidth="xs" sx={{ py: 4 }}>
      <Paper elevation={0} sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Typography variant="h5" gutterBottom>
          Sign In
        </Typography>


        <form onSubmit={handleSubmit} style={{ width: "100%" }} noValidate>
          {/* role */}
          <FormControl component="fieldset" sx={{ width: "100%", mb: 2 }}>
            <FormLabel component="legend">Login as:</FormLabel>
            <RadioGroup
              row
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
              sx={{ justifyContent: "center" }}
            >
              <FormControlLabel value="customer" control={<Radio />} label="Customer" />
              <FormControlLabel value="sales_agent" control={<Radio />} label="Sales Agent" />
            </RadioGroup>
          </FormControl>

          <Divider sx={{ mb: 2 }} />

          <TextField
            label="Email Address"
            fullWidth
            margin="normal"
            type="email"
            value={email}
            onChange={handleInputChange('email')}
            error={!!fieldErrors.email}
            helperText={fieldErrors.email}
            disabled={loading}
            autoComplete="email"
          />
          <TextField
            label="Password"
            fullWidth
            margin="normal"
            type="password"
            value={password}
            onChange={handleInputChange('password')}
            error={!!fieldErrors.password}
            helperText={fieldErrors.password}
            disabled={loading}
            autoComplete="current-password"
          />

          <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: "#f5f5f5", borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Your credentials are sent securely to our server.
            </Typography>
          </Box>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            sx={{ mt: 1.5, py: 1.5 }}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>

          {/* Forgot Password Link */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Link
              component="button"
              variant="body2"
              onClick={() => setForgotPasswordOpen(true)}
              disabled={loading}
              sx={{ textDecoration: 'none' }}
            >
              Forgot Password?
            </Link>
          </Box>
        </form>
      </Paper>

      {/* Forgot Password Dialog */}
      <ForgotPasswordDialog
        open={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
      />

      {/* Notification Snackbar */}
      <NotificationSnackbar
        open={notification.open}
        message={notification.message}
        severity={notification.severity}
        onClose={() => setNotification({ ...notification, open: false })}
      />
    </Container>
  )
}

export default LoginPage
