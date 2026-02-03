import React, { useState, useEffect } from "react"
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  List,
  ListItem,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from "@mui/material"
import { AccountBalanceWallet, ArrowUpward, History, Close, CheckCircle, Warning } from "@mui/icons-material"
import { useNavigate } from "react-router-dom"
import api from "../../../services/interceptor"

// Real API-backed wallet page: removes mock data and fetches statement/withdrawal quote

const WalletPage = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))
  const navigate = useNavigate()

  // State for wallet data
  const [cashbackBalance, setCashbackBalance] = useState(0)
  const [pendingBalance, setPendingBalance] = useState(0)
  const [totalEarned, setTotalEarned] = useState(0)
  const [statement, setStatement] = useState([])
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load wallet data and user profile
  useEffect(() => {
    let mounted = true
    const loadWalletData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch wallet balance
        const balanceRes = await api.get("/wallet/balance")
        if (balanceRes.data?.success) {
          const { available, pending, totalEarned: earned } = balanceRes.data
          if (mounted) {
            setCashbackBalance(Number(available || 0))
            setPendingBalance(Number(pending || 0))
            setTotalEarned(Number(earned || 0))
          }
        }

        // Fetch wallet statement
        const statementRes = await api.get("/wallet/statement?limit=50")
        if (statementRes.data?.success) {
          const transactions = statementRes.data.data || []
          if (mounted) setStatement(transactions)
        }

        // Fetch user profile for cashback phone
        const profileRes = await api.get("/users/profile")
        if (profileRes.data?.success) {
          if (mounted) setUserProfile(profileRes.data.data)
        }
      } catch (err) {
        console.error("[Wallet] Error loading data:", err)
        if (mounted) {
          setError("Failed to load wallet data. Please try again.")
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadWalletData()
    return () => (mounted = false)
  }, [])

  // State for dialogs
  const [withdrawDialog, setWithdrawDialog] = useState(false)

  // State for transaction history tab
  const [historyTab, setHistoryTab] = useState(0)

  // State for withdraw amount
  const [amount, setAmount] = useState("")
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  // State for success message
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!amount) {
      setErrorMessage("Please enter an amount")
      return
    }

    const withdrawAmount = Number.parseFloat(amount)

    if (withdrawAmount < 100) {
      setErrorMessage("Minimum withdrawal amount is KSH 100")
      return
    }

    if (withdrawAmount > cashbackBalance) {
      setErrorMessage("Insufficient balance")
      return
    }

    if (!userProfile?.phone_number) {
      setErrorMessage("No phone number found in your profile. Please update your profile first.")
      return
    }

    try {
      setErrorMessage("")
      setWithdrawLoading(true)
      
      // Create withdrawal request
      const withdrawRes = await api.post("/wallet/withdraw", {
        amount: withdrawAmount,
        destinationPhone: userProfile.phone_number
      })

      if (withdrawRes.data?.success) {
        setSuccessMessage(`Withdrawal request submitted successfully! Reference: ${withdrawRes.data.reference || 'N/A'}`)
        setTimeout(() => setSuccessMessage(""), 5000)
        setWithdrawDialog(false)
        setAmount("")
        
        // Refresh wallet data
        const balanceRes = await api.get("/wallet/balance")
        if (balanceRes.data?.success) {
          const { available, pending } = balanceRes.data
          setCashbackBalance(Number(available || 0))
          setPendingBalance(Number(pending || 0))
        }
      } else {
        throw new Error(withdrawRes.data?.error || "Withdrawal failed")
      }
    } catch (err) {
      console.error("[Wallet] Withdrawal error:", err)
      setErrorMessage(err.response?.data?.error || err.message || "Withdrawal failed")
      setTimeout(() => setErrorMessage(""), 5000)
    } finally {
      setWithdrawLoading(false)
    }
  }

  // Handle history tab change
  const handleHistoryTabChange = (event, newValue) => {
    setHistoryTab(newValue)
  }

  // Clear error message
  const clearErrorMessage = () => {
    setErrorMessage("")
  }

  // Calculate total withdrawn
  const totalWithdrawn = statement
    .filter((r) => r.type === "withdrawal" && r.status === "completed")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>Loading wallet data...</Typography>
        </Box>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Success Message */}
      {successMessage && (
        <Alert
          severity="success"
          sx={{ mb: 3 }}
          action={
            <IconButton aria-label="close" color="inherit" size="small" onClick={() => setSuccessMessage("")}>
              <Close fontSize="inherit" />
            </IconButton>
          }
        >
          {successMessage}
        </Alert>
      )}

      {/* Error Message */}
      {errorMessage && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <IconButton aria-label="close" color="inherit" size="small" onClick={clearErrorMessage}>
              <Close fontSize="inherit" />
            </IconButton>
          }
        >
          {errorMessage}
        </Alert>
      )}

      {/* General Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* E-Wallet Balance Section */}
        <Grid item xs={12} md={8}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
              borderRadius: 2,
              mb: 3,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: "white",
            }}
          >
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} sm={8}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <AccountBalanceWallet sx={{ fontSize: 40, mr: 2 }} />
                  <Typography variant="h5" component="h1">
                    E-Wallet Balance
                  </Typography>
                </Box>
                <Typography variant="h3" component="p" sx={{ mb: 1, fontWeight: "bold" }}>
                  {Math.round(cashbackBalance)}/= {/* Rounded to whole number */}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", mt: 2 }}>
                  <Chip
                    icon={<CheckCircle sx={{ color: "white !important" }} />}
                    label="Available for withdrawal"
                    sx={{
                      bgcolor: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      "& .MuiChip-icon": { color: "white" },
                    }}
                  />
                </Box>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Button
                    variant="contained"
                    type="button"
                    startIcon={<ArrowUpward />}
                    onClick={() => setWithdrawDialog(true)}
                    disabled={cashbackBalance < 100}
                    sx={{
                      bgcolor: "rgba(255, 255, 255, 0.9)",
                      color: theme.palette.primary.main,
                      "&:hover": {
                        bgcolor: "white",
                      },
                      "&.Mui-disabled": {
                        bgcolor: "rgba(255, 255, 255, 0.5)",
                        color: "rgba(0, 0, 0, 0.4)",
                      },
                    }}
                  >
                    Withdraw Cashback
                  </Button>
                  {cashbackBalance < 100 && (
                    <Typography variant="caption" sx={{ color: "white", textAlign: "center" }}>
                      Minimum withdrawal: KSH 100/=
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Paper>

          <Paper
            elevation={1}
            sx={{
              p: 3,
              borderRadius: 2,
              mb: 3,
              background: "white",
            }}
          >
            <Typography variant="h6" component="h2" gutterBottom>
              Cashback Dashboard
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: "#f0f7ff",
                    borderRadius: 2,
                    textAlign: "center",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Total Cashback Earned
                  </Typography>
                  <Typography variant="h4" color="primary.main" sx={{ fontWeight: "bold" }}>
                    {Math.round(totalEarned)}/=
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: "#e8f5e9",
                    borderRadius: 2,
                    textAlign: "center",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Pending cashback
                  </Typography>
                  <Typography variant="h4" color="success.main" sx={{ fontWeight: "bold" }}>
                    {Math.round(pendingBalance)}/=
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Cashback Summary:</strong> You've earned a total of {Math.round(totalEarned)}/= in cashback
                since you started shopping with FirstCraft. Keep shopping to earn more rewards!
              </Typography>
            </Box>
          </Paper>

          {/* Transaction History */}
          <Paper elevation={1} sx={{ p: 3, borderRadius: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" component="h2">
                Cashback History
              </Typography>
              <Chip icon={<History />} label="All transactions" color="primary" variant="outlined" size="small" />
            </Box>

            <Tabs
              value={historyTab}
              onChange={handleHistoryTabChange}
              sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
            >
              <Tab label="Cashback Earned" />
              <Tab label="Withdrawals" />
            </Tabs>

            {historyTab === 0 ? (
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size={isMobile ? "small" : "medium"}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                      <TableCell>Date</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statement.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{row.type}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell align="right">{row.amount}/=</TableCell>
                        <TableCell>{row.description}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ backgroundColor: "rgba(25, 118, 210, 0.08)" }}>
                      <TableCell colSpan={4} align="right" sx={{ fontWeight: "bold" }}>
                        Total Cashback (credits):
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold", color: "success.main" }}>
                        {Math.round(totalEarned)}/=
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size={isMobile ? "small" : "medium"}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                      <TableCell>Date</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="center">Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {statement.filter((r) => r.type === "withdrawal").map((w) => (
                      <TableRow key={w.id} hover>
                        <TableCell>{new Date(w.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{w.status}</TableCell>
                        <TableCell align="right">{w.amount}/=</TableCell>
                        <TableCell align="center">withdrawal</TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ backgroundColor: "rgba(76, 175, 80, 0.08)" }}>
                      <TableCell colSpan={2} align="right" sx={{ fontWeight: "bold" }}>
                        Total Withdrawn:
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        {Math.round(totalWithdrawn)}/=
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Mobile view for transaction history */}
            {isMobile && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Swipe horizontally to view all transaction details
                </Typography>
              </Box>
            )}

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Cashback Policy:</strong> Cashback is earned on all eligible purchases and can be withdrawn once
                you have accumulated a minimum of KSH 100/=.
              </Typography>
            </Alert>
          </Paper>
        </Grid>

        {/* Right Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Withdrawal Information */}
          <Paper elevation={1} sx={{ p: 3, borderRadius: 2, mb: 3 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Withdrawal Information
            </Typography>

            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2" fontWeight="bold">
                Minimum withdrawal amount: KSH 100/=
              </Typography>
            </Alert>

            <Box sx={{ mb: 3 }}>
              <Typography variant="body1" fontWeight="bold" gutterBottom>
                Available for Withdrawal
              </Typography>
              <Typography variant="h5" color="success.main">
                {Math.round(cashbackBalance)}/= {/* Rounded to whole number */}
              </Typography>
              {cashbackBalance < 100 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  You need {Math.round(100 - cashbackBalance)}/= more to reach the minimum withdrawal amount.
                </Typography>
              )}
            </Box>

            <Button
              variant="contained"
              fullWidth
              startIcon={<ArrowUpward />}
              onClick={() => setWithdrawDialog(true)}
              disabled={cashbackBalance < 100}
              sx={{ mb: 2 }}
            >
              Withdraw Cashback
            </Button>
          </Paper>

          {/* Cashback Information */}
          <Paper elevation={1} sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              About Cashback
            </Typography>

            <Typography variant="body2" paragraph>
              <strong>How Cashback Works:</strong>
            </Typography>

            <List sx={{ pl: 2 }}>
              <ListItem sx={{ display: "list-item", p: 0, mb: 1 }}>
                <Typography variant="body2">
                  Earn cashback on every eligible purchase based on the product's cashback percentage.
                </Typography>
              </ListItem>
              <ListItem sx={{ display: "list-item", p: 0, mb: 1 }}>
                <Typography variant="body2">
                  Cashback is calculated on the product price and added to your balance after purchase.
                </Typography>
              </ListItem>
              <ListItem sx={{ display: "list-item", p: 0, mb: 1 }}>
                <Typography variant="body2">
                  Withdraw your cashback once you've accumulated a minimum of KSH 100/=.
                </Typography>
              </ListItem>
              <ListItem sx={{ display: "list-item", p: 0 }}>
                <Typography variant="body2">Choose your preferred withdrawal method: M-Pesa.</Typography>
              </ListItem>
            </List>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                Need help with your cashback? Contact our support team at support@firstcraft.com
              </Typography>
            </Alert>
          </Paper>

          {/* M-Pesa Withdrawal Charges */}
          <Paper elevation={1} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              M-Pesa Withdrawal Charges
            </Typography>

            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Note:</strong> M-Pesa withdrawal charges will be borne by the client.
              </Typography>
            </Alert>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell>Amount Range (KSH)</TableCell>
                    <TableCell align="right">Charge (KSH)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>100 - 500</TableCell>
                    <TableCell align="right">1</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>501 - 1,000</TableCell>
                    <TableCell align="right">1.5</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>1,001 - 2,500</TableCell>
                    <TableCell align="right">2.5</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>2,501 - 5,000</TableCell>
                    <TableCell align="right">5</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>5,001 - 10,000</TableCell>
                    <TableCell align="right">10</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Above 10,000</TableCell>
                    <TableCell align="right">15</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              * Charges are subject to change based on Safaricom's policies.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialog} onClose={() => setWithdrawDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Withdraw Cashback
          <IconButton
            aria-label="close"
            onClick={() => setWithdrawDialog(false)}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
            }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph>
            Withdraw your cashback to your M-Pesa account.
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Available Balance
            </Typography>
            <Typography variant="h6" color="success.main">
              {Math.round(cashbackBalance)}/= {/* Rounded to whole number */}
            </Typography>
          </Box>

          <TextField
            label="Amount"
            type="number"
            fullWidth
            margin="normal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">KES</InputAdornment>,
            }}
            error={
              Number.parseFloat(amount) > cashbackBalance ||
              (Number.parseFloat(amount) > 0 && Number.parseFloat(amount) < 100)
            }
            helperText={
              Number.parseFloat(amount) > cashbackBalance
                ? "Amount exceeds available balance"
                : Number.parseFloat(amount) > 0 && Number.parseFloat(amount) < 100
                  ? "Minimum withdrawal amount is KSH 100/="
                  : ""
            }
          />

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Withdraw To
            </Typography>
            <Typography variant="h6" color="primary.main">
              M-Pesa ({userProfile?.phone_number || 'No phone number'})
            </Typography>
            {!userProfile?.phone_number && (
              <Typography variant="caption" color="error">
                Please update your profile with a phone number to enable withdrawals
              </Typography>
            )}
          </Box>

          <Alert severity="warning" sx={{ mt: 2 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start" }}>
              <Warning sx={{ mr: 1, mt: 0.5 }} fontSize="small" />
              <Typography variant="body2">
                <strong>Important:</strong> Minimum withdrawal amount is KSH 100/=. M-Pesa withdrawals are typically
                processed instantly. A maintenance charge of KSH 2 and M-Pesa withdrawal charges will apply.
              </Typography>
            </Box>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleWithdraw}
            disabled={!amount || Number.parseFloat(amount) > cashbackBalance || Number.parseFloat(amount) < 100 || !userProfile?.phone_number || withdrawLoading}
            startIcon={withdrawLoading ? <CircularProgress size={20} /> : null}
          >
            {withdrawLoading ? 'Processing...' : 'Withdraw'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

export default WalletPage
