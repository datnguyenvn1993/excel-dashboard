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
    await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          display_name TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

    // Default admin passwordHash for 'admin123'
    // PBKDF2: 100000 iterations, SHA-256, 32 bytes salt, 64 bytes hash
    // Format: salt:hash (hex encoded)
    const adminRes = await client.query(`SELECT COUNT(*) FROM users`);
    if (parseInt(adminRes.rows[0].count) === 0) {
      // Pre-computed hash for 'admin123' to avoid importing crypto here
      const defaultHash = "ee2e1ba9ea215b2e9ccf7ed6cc8fcbcf958fbc502f6ae64d8aab47ca05fc58c7:a9f4ffc06fcc316ff7ec9945df84b80693a1c31afcc5531d27dbbe5ca3d387ae4c6d4dbd2ae4c9e422f28edfd4075b9ca8de36e9ac870c9eb77b07dcf7da011b";
      await client.query(
        `INSERT INTO users (username, password_hash, role, display_name) VALUES ($1, $2, $3, $4)`,
        ['admin', defaultHash, 'admin', 'Administrator']
      );
    }

    initialized = true;
  } finally {
    client.release();
  }
}

export { db };
