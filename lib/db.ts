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
    await client.query(`
      CREATE TABLE IF NOT EXISTS metadata (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS drivers (
          sap_id TEXT PRIMARY KEY,
          doi    TEXT NOT NULL,
          imported_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    initialized = true;
  } finally {
    client.release();
  }
}

export { db };
