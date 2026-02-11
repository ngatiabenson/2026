"use client"

import { useState, useEffect } from "react"
import api from "../../../services/interceptor"
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useMediaQuery,
  useTheme,
  Chip,
  Collapse,
  Alert,
} from "@mui/material"
import { KeyboardArrowDown, ArrowBack, KeyboardArrowUp, DeleteOutline, ExpandMore, ExpandLess } from "@mui/icons-material"
import { useNavigate } from "react-router-dom"
import NewsletterSubscription from "../../../components/NewsLetter"
import { normalizeCartItem } from "../../../utils/cartUtils"

// Helper function to format numbers with commas
const formatNumberWithCommas = (number) => {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export default function Cart() {
  const navigate = useNavigate()

  // State for cart items
  const [cartItems, setCartItems] = useState([])
  const [cartTotals, setCartTotals] = useState({ subtotalExclVAT: 0, vatAmount: 0, total: 0, totalCashback: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedItems, setExpandedItems] = useState({})

  // Load cart items from backend
  useEffect(() => {
    let mounted = true
    const fetchCart = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const res = await api.get("/cart")
        const rows = res?.data?.cart?.items || []
        const totals = res?.data?.cart?.totals || null
        
        if (mounted) {
          // Normalize cart items using our utility
          const normalizedItems = rows.map(normalizeCartItem)
          setCartItems(normalizedItems)

          // Server-calculated totals (authoritative)
          if (totals) {
            setCartTotals({
              subtotalExclVAT: Number(totals.subtotal_excl_vat || 0),
              vatAmount: Number(totals.vat_amount || 0),
              total: Number(totals.total || 0),
              totalCashback: Number(totals.cashback_total || 0),
            })
          } else {
            setCartTotals({ subtotalExclVAT: 0, vatAmount: 0, total: 0, totalCashback: 0 })
          }
          
          // Log any missing fields for debugging
          normalizedItems.forEach((item, index) => {
            if (!item.itemCode) {
              console.warn(`[Cart] Item ${index} missing itemCode:`, item)
            }
            if (!item.primaryImage || item.primaryImage.includes('placeholder')) {
              console.warn(`[Cart] Item ${index} missing primaryImage:`, item)
            }
          })
        }
      } catch (err) {
        console.error("[Cart] Error fetching cart:", err)
        if (mounted) {
          setError("Failed to load cart items. Please try again.")
          setCartItems([])
          setCartTotals({ subtotalExclVAT: 0, vatAmount: 0, total: 0, totalCashback: 0 })
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchCart()
    return () => (mounted = false)
  }, [])

  // State for quantity selectors
  const [quantities, setQuantities] = useState({})

  // Initialize quantities from backend quantities
  useEffect(() => {
    const initialQuantities = {}
    cartItems.forEach((item) => {
      initialQuantities[item.id] = Number(item.quantity) || 1
    })
    setQuantities(initialQuantities)
  }, [cartItems])

  // Toggle item description expansion
  const toggleItemExpansion = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
  }

  // Add theme and isMobile detection
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "lg"))

  // New handlers for increasing and decreasing quantity
  const increaseQuantity = async (cartRowId) => {
    const newQty = (quantities[cartRowId] || 1) + 1
    try {
      await api.put(`/cart/${cartRowId}`, { quantity: newQty })
      // Re-fetch cart to reflect backend-calculated tier price, VAT, cashback, and totals
      const res = await api.get("/cart")
      const rows = res?.data?.cart?.items || []
      const totals = res?.data?.cart?.totals || null
      const normalizedItems = rows.map(normalizeCartItem)
      setCartItems(normalizedItems)
      if (totals) {
        setCartTotals({
          subtotalExclVAT: Number(totals.subtotal_excl_vat || 0),
          vatAmount: Number(totals.vat_amount || 0),
          total: Number(totals.total || 0),
          totalCashback: Number(totals.cashback_total || 0),
        })
      }
    } catch (_) {}
  }

  const decreaseQuantity = async (cartRowId) => {
    const current = quantities[cartRowId] || 1
    if (current <= 1) return
    const newQty = current - 1
    try {
      await api.put(`/cart/${cartRowId}`, { quantity: newQty })
      // Re-fetch cart to reflect backend-calculated tier price, VAT, cashback, and totals
      const res = await api.get("/cart")
      const rows = res?.data?.cart?.items || []
      const totals = res?.data?.cart?.totals || null
      const normalizedItems = rows.map(normalizeCartItem)
      setCartItems(normalizedItems)
      if (totals) {
        setCartTotals({
          subtotalExclVAT: Number(totals.subtotal_excl_vat || 0),
          vatAmount: Number(totals.vat_amount || 0),
          total: Number(totals.total || 0),
          totalCashback: Number(totals.cashback_total || 0),
        })
      }
    } catch (_) {}
  }

  // Handler for removing an item from the cart
  const removeItem = async (cartRowId) => {
    try {
      await api.delete(`/cart/${cartRowId}`)
      const res = await api.get("/cart")
      const rows = res?.data?.cart?.items || []
      const totals = res?.data?.cart?.totals || null
      const normalizedItems = rows.map(normalizeCartItem)
      setCartItems(normalizedItems)
      if (totals) {
        setCartTotals({
          subtotalExclVAT: Number(totals.subtotal_excl_vat || 0),
          vatAmount: Number(totals.vat_amount || 0),
          total: Number(totals.total || 0),
          totalCashback: Number(totals.cashback_total || 0),
        })
      }
    } catch (_) {}
  }

  // Totals are provided by backend /cart (authoritative)
  const { subtotalExclVAT, vatAmount, total, totalCashback } = cartTotals

  // Clear cart function
  const clearCart = async () => {
    try {
      await api.delete("/cart")
      setCartItems([])
      setCartTotals({ subtotalExclVAT: 0, vatAmount: 0, total: 0, totalCashback: 0 })
    } catch (_) {
    setCartItems([])
    setCartTotals({ subtotalExclVAT: 0, vatAmount: 0, total: 0, totalCashback: 0 })
    }
  }

  return (
    <Box
      sx={{
        px: { xs: 2, md: 3 },
        py: { xs: 3, md: 4 },
      }}
    >
      <Typography
        variant="h5"
        fontWeight="bold"
        gutterBottom
        sx={{
          fontSize: { xs: "1.5rem", md: "1.75rem" },
        }}
      >
        My cart ({cartItems.length})
      </Typography>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Cart Items */}
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ mb: 3 }}>
            {loading ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="h6" color="text.secondary">
                  Loading cart items...
                </Typography>
              </Box>
            ) : cartItems.length === 0 ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="h6" color="text.secondary">
                  Your cart is empty
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ArrowBack />}
                  sx={{
                    mt: 2,
                    textTransform: "none",
                    bgcolor: "#1976d2",
                    "&:hover": { bgcolor: "#1565c0" },
                  }}
                  onClick={() => navigate("/")}
                >
                  Continue Shopping
                </Button>
              </Box>
            ) : isMobile || isTablet ? (
              // Mobile view - Card layout
              <Box>
                {cartItems.map((item) => {
                  const quantity = quantities[item.id] || 1
                  const isExpanded = expandedItems[item.id]

                  return (
                    <Paper key={item.id} sx={{ mb: 2, p: 2 }}>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Box
                            component="img"
                            src={item.primaryImage}
                            alt={item.name}
                            sx={{
                              width: "100%",
                              height: "auto",
                              objectFit: "contain",
                            }}
                          />
                        </Grid>
                        <Grid item xs={8}>
                          <Typography variant="body1" fontWeight="medium" gutterBottom>
                            {item.name}
                          </Typography>
                          {/* Item Code Chip */}
                          <Chip
                            label={`Item Code: ${item.itemCode || "N/A"}`}
                            size="small"
                            sx={{
                              mb: 1,
                              fontSize: "0.85rem",
                              height: "24px",
                              backgroundColor: "#f0f7ff",
                              color: theme.palette.primary.main,
                            }}
                          />
                          {/* Short Description */}
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            {item.shortDescription}
                          </Typography>
                          {/* Expandable Long Description */}
                          {item.longerDescription && item.longerDescription.length > 100 && (
                            <Box>
                              <Button
                                size="small"
                                onClick={() => toggleItemExpansion(item.id)}
                                endIcon={isExpanded ? <ExpandLess /> : <ExpandMore />}
                                sx={{ p: 0, minWidth: 'auto', textTransform: 'none' }}
                              >
                                {isExpanded ? 'Show less' : 'Show more'}
                              </Button>
                              <Collapse in={isExpanded}>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                  {item.longerDescription}
                                </Typography>
                              </Collapse>
                            </Box>
                          )}
                        </Grid>

                        <Grid item xs={6}>
                          <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                              Qty:
                            </Typography>
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                border: "1px solid #c4c4c4",
                                borderRadius: "4px",
                                width: "100px",
                              }}
                            >
                              <IconButton
                                size="small"
                                onClick={() => decreaseQuantity(item.id)}
                                disabled={quantities[item.id] <= 1}
                                sx={{
                                  p: 1,
                                }}
                              >
                                <KeyboardArrowDown fontSize="small" />
                              </IconButton>
                              <Typography
                                variant="body2"
                                sx={{
                                  flex: 1,
                                  textAlign: "center",
                                  userSelect: "none",
                                  fontSize: "1rem",
                                }}
                              >
                                {quantity}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={() => increaseQuantity(item.id)}
                                sx={{
                                  p: 1,
                                }}
                              >
                                <KeyboardArrowUp fontSize="small" />
                              </IconButton>
                            </Box>
                          </Box>
                        </Grid>

                        <Grid item xs={6}>
                          <Typography variant="body1" fontWeight="bold" align="right" sx={{ fontSize: "1.1rem" }}>
                            {formatNumberWithCommas(Number(item.unitPrice || item.price || 0))}/=
                          </Typography>
                          <Typography variant="body2" color="text.secondary" align="right">
                            per item
                          </Typography>
                        </Grid>

                        <Grid item xs={6}>
                          <Typography variant="body2" color="success.main" sx={{ fontSize: "0.95rem" }}>
                            Cashback: {formatNumberWithCommas(Number(item.lineCashbackAmount || 0))}/=
                          </Typography>
                        </Grid>

                        <Grid item xs={6}>
                          <Typography variant="body1" fontWeight="bold" align="right" sx={{ fontSize: "1.1rem" }}>
                            Total: {formatNumberWithCommas(Number(item.lineTotal || 0))}/=
                          </Typography>
                        </Grid>

                        <Grid item xs={12}>
                          <Divider sx={{ my: 1 }} />
                          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              color="error"
                              onClick={() => removeItem(item.id)}
                              startIcon={<DeleteOutline />}
                              sx={{
                                borderRadius: 1,
                                textTransform: "none",
                                px: 2,
                                py: 1,
                                fontSize: "0.9rem",
                              }}
                            >
                              Remove
                            </Button>
                          </Box>
                        </Grid>
                      </Grid>
                    </Paper>
                  )
                })}
              </Box>
            ) : (
              // Desktop view - Table layout
              <TableContainer>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell colSpan={2}>Product</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="right">Unit Price</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Cashback</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cartItems.map((item) => {
                      const quantity = quantities[item.id] || 1

                      return (
                        <TableRow key={item.id}>
                          <TableCell sx={{ width: "80px", padding: "16px 8px" }}>
                            <Box
                              component="img"
                              src={item.primaryImage}
                              alt={item.name}
                              sx={{
                                width: "100%",
                                maxWidth: 70,
                                height: "auto",
                                objectFit: "contain",
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body1" fontWeight="medium" gutterBottom sx={{ fontSize: "1rem" }}>
                              {item.name}
                            </Typography>
                            {/* Item Code */}
                            <Chip
                              label={`Item Code: ${item.itemCode || "N/A"}`}
                              size="small"
                              sx={{
                                mb: 1,
                                fontSize: "0.85rem",
                                height: "24px",
                                backgroundColor: "#f0f7ff",
                                color: theme.palette.primary.main,
                              }}
                            />
                            {/* Short Description */}
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.95rem", mb: 1 }}>
                              {item.shortDescription}
                            </Typography>
                            {/* Expandable Long Description */}
                            {item.longerDescription && item.longerDescription.length > 100 && (
                              <Box>
                                <Button
                                  size="small"
                                  onClick={() => toggleItemExpansion(item.id)}
                                  endIcon={expandedItems[item.id] ? <ExpandLess /> : <ExpandMore />}
                                  sx={{ p: 0, minWidth: 'auto', textTransform: 'none', fontSize: '0.8rem' }}
                                >
                                  {expandedItems[item.id] ? 'Show less' : 'Show more'}
                                </Button>
                                <Collapse in={expandedItems[item.id]}>
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: "0.9rem" }}>
                                    {item.longerDescription}
                                  </Typography>
                                </Collapse>
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                border: "1px solid #c4c4c4",
                                borderRadius: "4px",
                                width: "70px",
                                margin: "0 auto",
                              }}
                            >
                              <IconButton size="small" onClick={() => increaseQuantity(item.id)} sx={{ p: 0.5 }}>
                                <KeyboardArrowUp fontSize="small" />
                              </IconButton>
                              <Typography
                                variant="body2"
                                sx={{
                                  textAlign: "center",
                                  userSelect: "none",
                                  py: 0.5,
                                  fontSize: "0.95rem",
                                }}
                              >
                                {quantity}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={() => decreaseQuantity(item.id)}
                                disabled={quantity <= 1}
                                sx={{ p: 0.5 }}
                              >
                                <KeyboardArrowDown fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                          {/* Price with /= and commas */}
                          <TableCell align="right" sx={{ fontSize: "1rem" }}>
                            {formatNumberWithCommas(Number(item.unitPrice || item.price || 0))}/=
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold", fontSize: "1rem" }}>
                            {formatNumberWithCommas(Number(item.lineTotal || 0))}/=
                          </TableCell>
                          <TableCell align="right" sx={{ color: "success.main", fontSize: "1rem" }}>
                            {formatNumberWithCommas(Number(item.lineCashbackAmount || 0))}/=
                          </TableCell>
                          <TableCell align="center">
                            <Stack direction="row" spacing={1} justifyContent="center">
                              <Button
                                variant="outlined"
                                size="small"
                                color="error"
                                onClick={() => removeItem(item.id)}
                                sx={{
                                  borderRadius: 1,
                                  textTransform: "none",
                                  minWidth: "auto",
                                  px: 1,
                                  fontSize: "0.9rem",
                                }}
                              >
                                <DeleteOutline fontSize="small" />
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          {cartItems.length > 0 && (
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                mb: 4,
                gap: 2,
              }}
            >
              <Button
                variant="contained"
                color="primary"
                startIcon={<ArrowBack />}
                fullWidth={isMobile}
                sx={{
                  textTransform: "none",
                  bgcolor: "#1976d2",
                  "&:hover": { bgcolor: "#1565c0" },
                  fontSize: "1rem",
                }}
                onClick={() => navigate("/")}
              >
                Back to shop
              </Button>

              <Button
                variant="text"
                color="primary"
                onClick={clearCart}
                fullWidth={isMobile}
                sx={{ textTransform: "none", fontSize: "1rem" }}
              >
                Remove all
              </Button>
            </Box>
          )}
        </Grid>

        {/* Order Summary */}
        <Grid item xs={12} md={4}>
          {/* Cashback Summary Box */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              mb: 3,
              bgcolor: "#f8f9fa",
              border: "1px solid #e0e0e0",
            }}
          >
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Cashback Summary
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="body1" sx={{ fontSize: "1.05rem" }}>
                Total Cashback Earned:
              </Typography>
              <Typography variant="body1" color="success.main" fontWeight="bold" sx={{ fontSize: "1.05rem" }}>
                {formatNumberWithCommas(totalCashback)}/=
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.95rem" }}>
              Cashback is calculated on the price excluding VAT and will be added to your e-wallet after purchase
              completion.
            </Typography>
          </Paper>

          {/* Order Summary Box */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              mb: 3,
              position: { xs: "static", lg: "sticky" },
              top: { lg: "20px" },
            }}
          >
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Order Summary
            </Typography>

            <Stack spacing={2} sx={{ mt: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontSize: "1.05rem" }}>
                  Subtotal (Excl. VAT):
                </Typography>
                <Typography variant="body1" sx={{ fontSize: "1.05rem" }}>
                  {formatNumberWithCommas(subtotalExclVAT)}/=
                </Typography>
              </Box>

              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontSize: "1.05rem" }}>
                  VAT:
                </Typography>
                <Typography variant="body1" color="primary" sx={{ fontSize: "1.05rem" }}>
                  + {formatNumberWithCommas(vatAmount)}/=
                </Typography>
              </Box>

              <Divider sx={{ my: 1 }} />

              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="h6" fontWeight="bold">
                  Total:
                </Typography>
                <Typography variant="h6" fontWeight="bold">
                  {formatNumberWithCommas(total)}/=
                </Typography>
              </Box>
            </Stack>

            <Button
              variant="contained"
              color="success"
              fullWidth
              size={isMobile ? "large" : "medium"}
              disabled={cartItems.length === 0}
              type="button"
              onClick={() => {
                navigate("/checkout")
              }}
              sx={{
                textTransform: "none",
                py: { xs: 1.8, md: 1.5 },
                fontSize: { xs: "1.1rem", md: "1rem" },
                bgcolor: "#00a152",
                "&:hover": { bgcolor: "#00873e" },
                mt: 3,
              }}
            >
              Checkout
            </Button>
          </Paper>
        </Grid>
      </Grid>
      <NewsletterSubscription />
    </Box>
  )
}
