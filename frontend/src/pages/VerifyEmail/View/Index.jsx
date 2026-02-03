import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert
} from '@mui/material'
import { authAPI } from '../../../services/interceptor'
import { createErrorNotification, createSuccessNotification } from '../../../utils/errorHandler'
import NotificationSnackbar from '../../../components/common/NotificationSnackbar'

const VerifyEmailPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState(false)
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' })

  useEffect(() => {
    if (token) {
      handleVerification()
    } else {
      setNotification({
        open: true,
        message: 'Invalid or missing verification token',
        severity: 'error'
      })
    }
  }, [token])

  const handleVerification = async () => {
    try {
      setLoading(true)
      await authAPI.verifyEmail(token)
      
      setVerified(true)
      setNotification(createSuccessNotification(
        'Email verified successfully! You can now log in to your account.'
      ))
      
      // Redirect to login after success
      setTimeout(() => {
        navigate('/login')
      }, 3000)
      
    } catch (error) {
      setNotification(createErrorNotification(error))
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    try {
      setLoading(true)
      // Get email from URL params or prompt user
      const email = searchParams.get('email')
      if (!email) {
        setNotification({
          open: true,
          message: 'Email address is required to resend verification',
          severity: 'error'
        })
        return
      }
      
      await authAPI.resendVerification(email)
      
      setNotification(createSuccessNotification(
        'Verification email sent successfully!'
      ))
      
    } catch (error) {
      setNotification(createErrorNotification(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container component="main" maxWidth="sm" sx={{ mt: 8, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
        <Box sx={{ mb: 3 }}>
          {loading ? (
            <CircularProgress size={60} sx={{ mb: 2 }} />
          ) : verified ? (
            <Typography variant="h4" color="success.main" gutterBottom>
              ✓ Email Verified!
            </Typography>
          ) : (
            <Typography variant="h4" color="error.main" gutterBottom>
              ✗ Verification Failed
            </Typography>
          )}
        </Box>

        <Typography variant="h5" gutterBottom>
          {verified ? 'Email Verification Successful' : 'Email Verification'}
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {verified 
            ? 'Your email has been successfully verified. You can now log in to your account.'
            : 'There was an issue verifying your email address. The link may have expired or been used already.'
          }
        </Typography>

        {verified ? (
          <Alert severity="success" sx={{ mb: 3 }}>
            You will be redirected to the login page shortly.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 3 }}>
            If you need a new verification email, you can request one to be sent to your email address.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            onClick={() => navigate('/login')}
            disabled={loading}
          >
            Go to Login
          </Button>
          
          {!verified && (
            <Button
              variant="outlined"
              onClick={handleResendVerification}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? 'Sending...' : 'Resend Verification Email'}
            </Button>
          )}
        </Box>
      </Paper>

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

export default VerifyEmailPage
