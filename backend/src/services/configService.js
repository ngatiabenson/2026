import { query } from "../utils/database.js"

// Simple in-memory cache with manual reload capability
let cachedPolicies = null
let cachedFees = null
let lastLoadedAt = null

export const loadPoliciesAndFees = async () => {
  // Load business policies and payment fees from DB so they are configurable without code changes
  // NOTE: If the tables are missing (first run), we tolerate errors and fall back to defaults.
  try {
    const policiesRes = await query(
      "SELECT key, value FROM business_policies ORDER BY updated_at DESC",
    )
    cachedPolicies = Object.fromEntries(
      (policiesRes.rows || []).map((r) => [r.key, r.value]),
    )
  } catch (_) {
    // Table may not exist yet; use defaults
    cachedPolicies = {}
  }

  try {
    const feesRes = await query(
      "SELECT id, provider, transaction_type, min_amount, max_amount, fee_type, fee_value, effective_from FROM payment_fees ORDER BY effective_from DESC",
    )
    cachedFees = feesRes.rows || []
  } catch (_) {
    cachedFees = []
  }

  lastLoadedAt = new Date()
  return { policies: cachedPolicies, fees: cachedFees, lastLoadedAt }
}

export const getPolicy = (key, defaultValue = null) => {
  if (!cachedPolicies) return defaultValue
  const raw = cachedPolicies[key]
  if (raw === undefined || raw === null) return defaultValue
  // Try parse JSON; fallback to string/number
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const getFees = (provider, transactionType) => {
  if (!cachedFees) return []
  return cachedFees.filter(
    (f) => f.provider === provider && f.transaction_type === transactionType,
  )
}

export const reloadConfigs = async () => {
  return await loadPoliciesAndFees()
}

export const getConfigSnapshot = () => ({
  policies: cachedPolicies || {},
  fees: cachedFees || [],
  lastLoadedAt,
})


