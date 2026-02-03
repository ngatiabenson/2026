import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  IconButton,
  CircularProgress
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import { authAPI } from '../../services/interceptor'
import { createErrorNotification, createSuccessNotification } from '../../utils/errorHandler'
import NotificationSnackbar from '../common/NotificationSnackbar' // ✅ Correct import


const ForgotPasswordDialog = ({ open, onClose }) => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' })

  const handleClose = () => {
    setEmail('')
    setLoading(false)
    setNotification({ open: false, message: '', severity: 'info' })
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email) {
      setNotification({
        open: true,
        message: 'Please enter your email address',
        severity: 'warning'
      })
      return
    }

    try {
      setLoading(true)
      await authAPI.forgotPassword(email)
      
      setNotification(createSuccessNotification(
        'If an account with that email exists, a password reset link has been sent.'
      ))
      
      // Close dialog after a short delay to show success message
      setTimeout(() => {
        handleClose()
      }, 2000)
      
    } catch (error) {
      setNotification(createErrorNotification(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '8px',
            maxHeight: '90vh',
            width: { xs: '95%', sm: '90%', md: '500px' },
            margin: { xs: '10px', sm: 'auto' },
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, bgcolor: 'primary.main', color: 'white' }}>
          Reset Password
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: 'white',
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers sx={{ p: 3 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Enter your email address and we'll send you a link to reset your password.
          </Typography>
          
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              disabled={loading}
              autoFocus
              autoComplete="email"
            />
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading || !email}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <NotificationSnackbar
        open={notification.open}
        message={notification.message}
        severity={notification.severity}
        onClose={() => setNotification({ ...notification, open: false })}
      />
    </>
  )
}

export default ForgotPasswordDialog
