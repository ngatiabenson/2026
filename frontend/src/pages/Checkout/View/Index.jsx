// src/pages/Checkout.jsx
"use client"

import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../../../services/interceptor"
import NotificationSnackbar from "../../../components/common/NotificationSnackbar"
import { createErrorNotification, createSuccessNotification } from "../../../utils/errorHandler"
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  Stepper,
  Step,
  StepLabel,
  Checkbox,
  Alert,
  useMediaQuery,
  useTheme,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
} from "@mui/material"
import { ArrowBack, ArrowForward, CheckCircle, LocalShipping, Payment, Receipt } from "@mui/icons-material"

// ---------- Helpers ----------
const formatNumberWithCommas = (n) => (Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
// Delivery fee table (example amounts are in KES)
const DELIVERY_FEES = { Standard: 20, Medium: 30, Large: 60 , Fragile:100}
const steps = ["Shipping Information", "Payment Method", "Order Confirmation"]

// ---------- Component ----------
export default function Checkout() {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))

  const [loading, setLoading] = useState(true)
  const [activeStep, setActiveStep] = useState(0)
  const [cartItems, setCartItems] = useState([])
  const [cartTotals, setCartTotals] = useState({ subtotal_excl_vat: 0, vat_amount: 0, total: 0, cashback_total: 0 })
  const [orderComplete, setOrderComplete] = useState(false)
  const [orderNumber, setOrderNumber] = useState("")

  // Delivery option
  const [deliveryOption, setDeliveryOption] = useState("pickup")

  // Shipping
  const [shippingInfo, setShippingInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    country: "Kenya",
  })

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("mpesa")
  const [mpesaPhone, setMpesaPhone] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Wallet
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletInput, setWalletInput] = useState("") // user string input
  const [notification, setNotification] = useState({ open: false, message: "", severity: "info" })

  // Bootstrap: health, cart, wallet
  useEffect(() => {
    let mounted = true
    const bootstrap = async () => {
      try {
        // Health check
        await api.get("/health")

        // Fetch cart (authoritative)
        const cartRes = await api.get("/cart")
        const rawItems = Array.isArray(cartRes?.data?.cart?.items) ? cartRes.data.cart.items : []
        const totals = cartRes?.data?.cart?.totals || { subtotal_excl_vat: 0, vat_amount: 0, total: 0, cashback_total: 0 }

        const items = rawItems.map((ci) => ({
          cartRowId: ci.id,
          productId: ci.product?.id,
          name: ci.product?.name || "",
          unitPrice: Number(ci.unit_price || 0),
          quantity: Number(ci.quantity) || 1,
          lineTotal: Number(ci.line_total || 0),
          lineCashback: Number(ci.line_cashback_amount || 0),
          deliveryClass: ci.product?.shippingClass || ci.product?.class || "Standard",
          image: ci.product?.imageUrl || ci.product?.image_url || ci.product?.primaryImage || "",
          vatRate: Number(ci.product?.vat_rate ?? ci.product?.vatRate ?? 0),
          cashbackRate: Number(ci.product?.cashback_rate ?? ci.product?.cashbackRate ?? 0),
        }))

        if (mounted) {
          setCartItems(items)
          setCartTotals({
            subtotal_excl_vat: Number(totals.subtotal_excl_vat || 0),
            vat_amount: Number(totals.vat_amount || 0),
            total: Number(totals.total || 0),
            cashback_total: Number(totals.cashback_total || 0),
          })
        }

        // Wallet concise balance
        try {
          const walletRes = await api.get("/wallet/balance")
          if (mounted) setWalletBalance(Number(walletRes?.data?.available || 0))
        } catch (_) {
          if (mounted) setWalletBalance(0)
        }
      } catch (err) {
        setNotification(createErrorNotification(err, "Failed to initialize checkout. Redirecting to cart."))
        navigate("/cart")
        return
      } finally {
        if (mounted) setLoading(false)
      }
    }
    bootstrap()
    return () => (mounted = false)
  }, [navigate])

  // ---------- Totals & fees ----------
  // Totals are provided by backend /cart (authoritative). Frontend treats them as display-only.
  const subtotalExclVAT = Number(cartTotals.subtotal_excl_vat || 0)
  const vatAmount = Number(cartTotals.vat_amount || 0)
  const itemsTotalIncVAT = Number(cartTotals.total || 0)

  // DB-driven shipping fee via backend quote
  const [deliveryFee, setDeliveryFee] = useState(0)
  useEffect(() => {
    let mounted = true
    const quote = async () => {
      try {
        const res = await api.post("/shipping/quote", {
          deliveryOption,
          items: cartItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
        })
        const fee = Number(res?.data?.totalFee || 0)
        if (mounted) setDeliveryFee(fee)
      } catch (err) {
        if (mounted) setDeliveryFee(0)
      }
    }
    quote()
    return () => (mounted = false)
  }, [deliveryOption, cartItems])

  const grandTotal = itemsTotalIncVAT + deliveryFee

  const totalCashback = Number(cartTotals.cashback_total || 0)

  // wallet: client-side applied amount (server enforces again)
  const walletRequested = Math.max(0, Number(walletInput) || 0)
  const walletApplied = Math.min(walletRequested, walletBalance, grandTotal)
  const mpesaPayable = Math.max(0, grandTotal - walletApplied)

  // ---------- Navigation handlers ----------
  const handleNext = () => {
    if (activeStep === 0) {
      if (deliveryOption === "delivery") {
        const required = ["firstName", "lastName", "email", "phone", "address", "city"]
        const ok = required.every((f) => (shippingInfo[f] || "").trim() !== "")
        if (!ok) {
          alert("Please fill in all required fields for delivery.")
          return
        }
      }
    }

    if (activeStep === 1) {
      if (paymentMethod === "mpesa" && mpesaPayable > 0 && mpesaPhone.trim() === "") {
        alert("Please enter your M-Pesa phone number (required to pay the remaining amount).")
        return
      }
      if (!termsAccepted) {
        alert("Please accept the terms and conditions.")
        return
      }
    }

    setActiveStep((s) => s + 1)
  }

  const handleBack = () => setActiveStep((s) => s - 1)

  // ---------- Place order ----------
  const handlePlaceOrder = async () => {
    const payload = {
      // Backend reads cart_items from DB; these are for compatibility only.
      items: cartItems.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      shippingAddress: deliveryOption === "delivery" ? shippingInfo?.address : null,
      walletApplied,
    }
    try {
      const res = await api.post("/orders", payload)
      const order = res?.data?.order
      setOrderNumber(order?.orderNumber || order?.id || "")
      setOrderComplete(true)
      setNotification(createSuccessNotification("Order created successfully"))
      // Refresh wallet balance after order
      try {
        const w = await api.get("/wallet/balance")
        setWalletBalance(Number(w?.data?.available || 0))
      } catch (_) {}
    } catch (err) {
      setNotification(createErrorNotification(err, "Checkout failed"))
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (orderComplete) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 }, textAlign: "center" }}>
        <CheckCircle sx={{ fontSize: 80, color: "success.main", mb: 2 }} />
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Order Confirmed!
        </Typography>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Order Number: {orderNumber}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Wallet used: {formatNumberWithCommas(walletApplied)}/=
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Paid via M-Pesa: {formatNumberWithCommas(mpesaPayable)}/=
        </Typography>
        <Typography variant="body2" color="success.main" sx={{ mb: 4 }}>
          Cashback of {formatNumberWithCommas(totalCashback)}/= will be credited (after delivery/return window).
        </Typography>
        <Button variant="contained" onClick={() => navigate("/")} sx={{ mr: 2, textTransform: "none" }}>
          Continue Shopping
        </Button>
        <Button variant="outlined" onClick={() => navigate("/account")} sx={{ textTransform: "none" }}>
          View Orders
        </Button>
      </Box>
    )
  }

  // ---------- UI ----------
  return (
    <>
    <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Checkout
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label, index) => (
          <Step key={label}>
            <StepLabel
              StepIconComponent={({ active, completed }) => {
                const icons = [LocalShipping, Payment, Receipt]
                const Icon = icons[index]
                return <Icon sx={{ color: completed ? "success.main" : active ? "primary.main" : "text.disabled" }} />
              }}
            >
              {!isMobile && label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Grid container spacing={3}>
        {/* Left column */}
        <Grid item xs={12} md={8}>
          {/* STEP 0 */}
          {activeStep === 0 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Delivery Option
              </Typography>

              <ToggleButtonGroup
                value={deliveryOption}
                exclusive
                onChange={(_, v) => v && setDeliveryOption(v)}
                sx={{ mb: 2 }}
              >
                <ToggleButton value="pickup">Pickup (Free)</ToggleButton>
                <ToggleButton value="delivery">Delivery (Fee based on items)</ToggleButton>
              </ToggleButtonGroup>

              {deliveryOption === "delivery" ? (
                <>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Delivery fee is based on the highest delivery class in your cart.
                  </Alert>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="First Name *" value={shippingInfo.firstName} onChange={(e) => setShippingInfo({ ...shippingInfo, firstName: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Last Name *" value={shippingInfo.lastName} onChange={(e) => setShippingInfo({ ...shippingInfo, lastName: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Email *" type="email" value={shippingInfo.email} onChange={(e) => setShippingInfo({ ...shippingInfo, email: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Phone Number *" value={shippingInfo.phone} onChange={(e) => setShippingInfo({ ...shippingInfo, phone: e.target.value })} />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField fullWidth label="Address *" value={shippingInfo.address} onChange={(e) => setShippingInfo({ ...shippingInfo, address: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="City *" value={shippingInfo.city} onChange={(e) => setShippingInfo({ ...shippingInfo, city: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Postal Code" value={shippingInfo.postalCode} onChange={(e) => setShippingInfo({ ...shippingInfo, postalCode: e.target.value })} />
                    </Grid>
                  </Grid>
                </>
              ) : (
                <Alert severity="success">Pickup selected — no delivery fee and no address required.</Alert>
              )}
            </Paper>
          )}

          {/* STEP 1 */}
          {activeStep === 1 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Payment Method
              </Typography>
              <FormControl component="fieldset">
                <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <FormControlLabel value="mpesa" control={<Radio />} label="M-Pesa Mobile Money" />
                  <FormControlLabel value="card" control={<Radio />} label="Credit/Debit Card" disabled />
                  <FormControlLabel value="bank" control={<Radio />} label="Bank Transfer" disabled />
                </RadioGroup>
              </FormControl>

              {paymentMethod === "mpesa" && mpesaPayable > 0 && (
                <Box sx={{ mt: 2 }}>
                  <TextField fullWidth label="M-Pesa Phone Number" placeholder="07XXXXXXXX" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} sx={{ mb: 2 }} />
                  <Alert severity="info">You will receive an M-Pesa prompt to pay the remaining balance after wallet is applied.</Alert>
                </Box>
              )}

              <Divider sx={{ my: 3 }} />

              <Typography variant="subtitle1" fontWeight="bold">Wallet</Typography>
              <Typography variant="body2" color="text.secondary">Wallet Balance: {formatNumberWithCommas(walletBalance)}/=</Typography>

              <TextField fullWidth type="number" inputProps={{ min: 0 }} label="Amount to use from wallet" value={walletInput} onChange={(e) => setWalletInput(e.target.value)} sx={{ mt: 2 }} />

              <Box sx={{ mt: 3 }}>
                <FormControlLabel control={<Checkbox checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />} label="I accept the terms and conditions and privacy policy" />
              </Box>
            </Paper>
          )}

          {/* STEP 2 */}
          {activeStep === 2 && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Order Confirmation</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>Please review your order details before placing the order.</Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">Delivery:</Typography>
                <Typography variant="body2">{deliveryOption === "pickup" ? "Pickup" : "Delivery"}</Typography>
                {deliveryOption === "delivery" && (
                  <>
                    <Typography variant="body2">{shippingInfo.firstName} {shippingInfo.lastName}</Typography>
                    <Typography variant="body2">{shippingInfo.phone}</Typography>
                    <Typography variant="body2">{shippingInfo.address}, {shippingInfo.city}</Typography>
                  </>
                )}
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">Payment:</Typography>
                <Typography variant="body2">{paymentMethod === "mpesa" ? `M-Pesa (${mpesaPhone || "not set"})` : paymentMethod}</Typography>
              </Box>
            </Paper>
          )}

          {/* nav */}
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
            <Button onClick={() => navigate("/cart")} startIcon={<ArrowBack />} sx={{ textTransform: "none" }}>Back to Cart</Button>
            <Box>
              {activeStep > 0 && <Button onClick={handleBack} sx={{ mr: 1, textTransform: "none" }}>Back</Button>}
              {activeStep < steps.length - 1 ? <Button variant="contained" onClick={handleNext} endIcon={<ArrowForward />} sx={{ textTransform: "none" }}>Next</Button> : <Button variant="contained" color="success" onClick={handlePlaceOrder} sx={{ textTransform: "none" }}>Place Order</Button>}
            </Box>
          </Box>
        </Grid>

        {/* Right summary */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, position: "sticky", top: 20 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Order Summary</Typography>

            {cartItems.map((item) => (
              <Box key={item.cartRowId || item.productId} sx={{ display: "flex", mb: 2 }}>
                <Box component="img" src={item.image} alt={item.name} sx={{ width: 50, height: 50, objectFit: "contain", mr: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight="medium">{item.name}</Typography>
                  <Typography variant="body2" color="text.secondary">Qty: {item.quantity || 1}</Typography>
                </Box>
                <Typography variant="body2" fontWeight="bold">{formatNumberWithCommas(Number(item.lineTotal || 0))}/=</Typography>
              </Box>
            ))}

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography>Subtotal (Excl. VAT):</Typography>
              <Typography>{formatNumberWithCommas(subtotalExclVAT)}/=</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography>VAT:</Typography>
              <Typography>{formatNumberWithCommas(vatAmount)}/=</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography>Delivery Fee:</Typography>
              <Typography>{formatNumberWithCommas(deliveryFee)}/=</Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="h6" fontWeight="bold">Order Total:</Typography>
              <Typography variant="h6" fontWeight="bold">{formatNumberWithCommas(grandTotal)}/=</Typography>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography>Wallet Applied:</Typography>
              <Typography>-{formatNumberWithCommas(walletApplied)}/=</Typography>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography color="success.main">Cashback Earned:</Typography>
              <Typography color="success.main">{formatNumberWithCommas(totalCashback)}/=</Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="h6" fontWeight="bold">Pay via M-Pesa:</Typography>
              <Typography variant="h6" fontWeight="bold">{formatNumberWithCommas(mpesaPayable)}/=</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
    <NotificationSnackbar
      open={notification.open}
      message={notification.message}
      severity={notification.severity}
      onClose={() => setNotification({ ...notification, open: false })}
    />
    </>
  )
}
