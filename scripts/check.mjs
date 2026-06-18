import postgres from "@vercel/postgres";
async function run() {
    const client = await postgres.db.connect();
    const res = await client.query("SELECT DISTINCT depot FROM orders LIMIT 20");
    console.log("DEPOT VALUES:", res.rows);
    client.release();
}
run();
