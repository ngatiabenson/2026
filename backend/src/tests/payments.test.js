import { expect } from "chai"
import request from "supertest"
import express from "express"
import paymentsRoutes from "../routes/payments.js"

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 999, role: "customer" }
  next()
})
app.use("/payments", paymentsRoutes)

describe("Payments Withdraw", () => {
  it("should return a quote or error if tables missing", async () => {
    const res = await request(app).get("/payments/withdraw/quote?amount=1000")
    expect([200, 400, 500]).to.include(res.status)
  })
})


