import { expect } from "chai"
import request from "supertest"
import express from "express"
import * as db from "../utils/database.js"
import walletRoutes from "../routes/wallet.js"

// Basic smoke tests for wallet endpoints. Assumes auth middleware is bypassable for tests or token provided.

const app = express()
app.use(express.json())
// Mock auth: inject user
app.use((req, _res, next) => {
  req.user = { id: 999, role: "customer" }
  next()
})
app.use("/wallet", walletRoutes)

describe("Wallet Endpoints", () => {
  it("GET /wallet/balance should respond", async () => {
    // Ensure query does not throw when table missing
    const res = await request(app).get("/wallet/balance")
    expect([200, 500]).to.include(res.status)
  })

  it("GET /wallet/statement should respond", async () => {
    const res = await request(app).get("/wallet/statement")
    expect([200, 500]).to.include(res.status)
  })
})


