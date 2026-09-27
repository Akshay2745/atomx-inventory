// ============ Database connection ============

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to your .env file.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });


// Run one SQL command and return the result
async function query(text, params) {
  return pool.query(text, params);
}


// Run several SQL commands as one all-or-nothing change
async function transaction(work) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


// Create the tables if they don't exist yet
async function runSchema() {
  const sql = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf-8");
  await pool.query(sql);
}


async function close() {
  await pool.end();
}


module.exports = {
  query: query,
  transaction: transaction,
  runSchema: runSchema,
  close: close
};