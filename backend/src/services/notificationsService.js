import { query } from "../utils/database.js"

// Minimal notification stubs to be replaced with real email/SMS integrations

export const notifySupplierPo = async (client, poId) => {
  // TODO: integrate email provider; for now, just insert an audit/notification record if such table exists
  try {
    await client.query(`INSERT INTO system_notifications (type, ref_id, payload) VALUES ('supplier_po_created', $1, NULL)`, [poId])
  } catch (_) {
    // table may not exist; ignore silently
  }
}

export const alertAdmin = async (client, type, payload = null) => {
  try {
    await client.query(`INSERT INTO system_notifications (type, ref_id, payload) VALUES ($1, NULL, $2)`, [type, payload])
  } catch (_) {
    // ignore if not present
  }
}


