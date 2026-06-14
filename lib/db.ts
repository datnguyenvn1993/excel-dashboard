import { db } from "@vercel/postgres";

let initialized = false;

export async function initDB() {
  if (initialized) return;
  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id           SERIAL PRIMARY KEY,
        order_id     TEXT,
        status       TEXT,
        depot        TEXT,
        total_pay    NUMERIC(15,2) DEFAULT 0,
        pickup_city  TEXT,
        create_date  DATE,
        create_hour  SMALLINT,
        sap_profile_id TEXT,
        distance     TEXT,
        imported_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_date  ON orders(create_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_depot ON orders(depot)`);
    initialized = true;
  } finally {
    client.release();
  }
}

export { db };
