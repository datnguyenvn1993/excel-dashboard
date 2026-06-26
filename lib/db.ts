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
        cancel_by    TEXT,
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders_summary (
        id               SERIAL PRIMARY KEY,
        create_date      DATE NOT NULL,
        create_hour      SMALLINT NOT NULL,
        depot            TEXT NOT NULL DEFAULT '',
        region           TEXT NOT NULL DEFAULT '',
        doi              TEXT NOT NULL DEFAULT '',
        order_count      INT DEFAULT 0,
        complete_count   INT DEFAULT 0,
        cancel_count     INT DEFAULT 0,
        processing_count INT DEFAULT 0,
        gmv              NUMERIC(15,2) DEFAULT 0,
        driver_active    INT DEFAULT 0,
        UNIQUE(create_date, create_hour, depot, region, doi)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_summary_date ON orders_summary(create_date)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_hourly_summary (
        id SERIAL PRIMARY KEY,
        create_date DATE NOT NULL,
        create_hour SMALLINT NOT NULL,
        doi TEXT NOT NULL DEFAULT '',
        gmv NUMERIC(15,2) DEFAULT 0,
        driver_active INT DEFAULT 0,
        trip_complete INT DEFAULT 0,
        UNIQUE(create_date, create_hour, doi)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_team_hourly_date ON team_hourly_summary(create_date)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS depot_hourly_summary (
        id SERIAL PRIMARY KEY,
        create_date DATE NOT NULL,
        create_hour SMALLINT NOT NULL,
        depot_group TEXT NOT NULL DEFAULT '',
        gmv NUMERIC(15,2) DEFAULT 0,
        driver_active INT DEFAULT 0,
        trip_complete INT DEFAULT 0,
        UNIQUE(create_date, create_hour, depot_group)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_depot_hourly_date ON depot_hourly_summary(create_date)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS compression_log (
        create_date    DATE PRIMARY KEY,
        status         TEXT NOT NULL DEFAULT 'raw',
        compressed_at  TIMESTAMPTZ,
        raw_row_count  INT,
        summary_rows   INT
      )
    `);

    // PBKDF2: 100000 iterations, SHA-256, 32 bytes salt, 64 bytes hash
    const adminRes = await client.query(`SELECT COUNT(*) FROM users`);
    const brokenHash = "ee2e1ba9ea215b2e9ccf7ed6cc8fcbcf958fbc502f6ae64d8aab47ca05fc58c7:a9f4ffc06fcc316ff7ec9945df84b80693a1c31afcc5531d27dbbe5ca3d387ae4c6d4dbd2ae4c9e422f28edfd4075b9ca8de36e9ac870c9eb77b07dcf7da011b";
    const correctHash = "7ef13430c5d0933c57edc1db48700ebab1ef9153d413487aa7ef037af2bbf147:b8775cbef853ba75dac0a2c75bec208a1bbf067de9bee6d9901b0e759db75b3e077702ed7ccb4a2ef3749a99d216f2bb5dcd3dff0a4bfe17242bb3e6d2b1d577";

    if (parseInt(adminRes.rows[0].count) === 0) {
      await client.query(
        `INSERT INTO users (username, password_hash, role, display_name) VALUES ($1, $2, $3, $4)`,
        ['admin', correctHash, 'admin', 'Administrator']
      );
    } else {
      // Auto-fix the broken hash if it was already seeded
      await client.query(
        `UPDATE users SET password_hash = $1 WHERE username = 'admin' AND password_hash = $2`,
        [correctHash, brokenHash]
      );
    }

    initialized = true;
  } finally {
    client.release();
  }
}

export { db };
