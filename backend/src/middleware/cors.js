// middleware/cors.js
import cors from "cors";

export default function configureCors() {
  const allowedOrigins = [
    process.env.FRONTEND_URL,   // Production frontend (from Render/Vercel env)
    process.env.CORS_ORIGIN,    // Optional fallback (also from env)
    "http://localhost:5173",    // Vite dev server
    "http://localhost:3000",    // CRA or local backend testing
  ].filter(Boolean); // Removes any undefined/null

  console.log("✅ Allowed Origins:", allowedOrigins);

  return cors({
    origin: (origin, callback) => {
      console.log("🌐 Request Origin:", origin);
      if (!origin) return callback(null, true); // allow tools like Postman

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 200, // handles older browsers
  });
}
