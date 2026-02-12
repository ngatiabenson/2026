// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import configureCors from "./src/middleware/cors.js";
import { loadPoliciesAndFees, getConfigSnapshot } from "./src/services/configService.js";

// Pick the correct env file depending on NODE_ENV
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.local";

dotenv.config({ path: envFile });
console.log(`🌍 Loaded environment from: ${envFile}`);

const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

const app = express();

// ✅ Dynamically pick a safe port
const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || (isProduction ? 10000 : 3000);

// ✅ Apply global middlewares
app.use(configureCors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ✅ Health check (helpful for Render)
app.get("/", (req, res) => {
  res.json({
    message: `Backend running with proper CORS ✅ (${isProduction ? "production" : "development"})`,
  });
});

// ✅ Serve static files
//app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Import and mount all routes
import authRoutes from "./src/routes/auth.js";
import userRoutes from "./src/routes/users.js";
import productRoutes from "./src/routes/products.js";
import categoryRoutes from "./src/routes/categories.js";
import cartRoutes from "./src/routes/cart.js";
import orderRoutes from "./src/routes/orders.js";
import adminRoutes from "./src/routes/admin.js";
import salesAgentRoutes from "./src/routes/sales-agent.js";
import uploadRoutes from "./src/routes/upload.js";
import cloudflareUploadRoutes from "./src/routes/cloudflareUpload.js";
import walletRoutes from "./src/routes/wallet.js";
import paymentsRoutes from "./src/routes/payments.js";
import shippingRoutes from "./src/routes/shipping.js";

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/sales-agent", salesAgentRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/upload", cloudflareUploadRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/shipping", shippingRoutes);

// ✅ Health endpoints
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ✅ Config observability
app.get("/api/config/snapshot", (req, res) => {
  res.json({ success: true, ...getConfigSnapshot() });
});

app.post("/api/config/reload", async (req, res) => {
  try {
    const out = await loadPoliciesAndFees();
    res.json({ success: true, ...out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ✅ 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ✅ Load configs once, then start server only ONCE
(async () => {
  try {
    await loadPoliciesAndFees();
    await getConfigSnapshot();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} (${isProduction ? "production" : "development"})`);
    });
  } catch (err) {
    console.error("❌ Failed to load initial configs:", err);
  }
})();
