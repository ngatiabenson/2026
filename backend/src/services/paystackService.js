import axios from "axios"

const paystack = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
    "Content-Type": "application/json",
  },
})

export async function initiateMpesaCharge({ email, amount, phone, metadata }) {
  const res = await paystack.post("/charge", {
    email,
    amount: amount * 100,
    currency: "KES",
    mobile_money: {
      phone,
      provider: "mpesa",
    },
    metadata,
  })

  return res.data.data
}

export async function verifyTransaction(reference) {
  const res = await paystack.get(`/transaction/verify/${reference}`)
  return res.data.data
}
