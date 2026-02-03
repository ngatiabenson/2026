import React from 'react'
import { Snackbar, Alert } from '@mui/material'

/**
 * Reusable notification snackbar component
 * Consistent with the project's Material UI theme
 */
const NotificationSnackbar = ({ 
  open, 
  message, 
  severity = 'info', 
  onClose, 
  autoHideDuration = 6000,
  anchorOrigin = { vertical: 'top', horizontal: 'right' }
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
    >
      <Alert 
        onClose={onClose} 
        severity={severity} 
        sx={{ width: '100%' }}
        variant="filled"
      >
        {message}
      </Alert>
    </Snackbar>
  )
}

export default NotificationSnackbar
