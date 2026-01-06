const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please set the following environment variables:');
  missingVars.forEach(varName => console.error(`  ${varName}`));
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || undefined, // Allow empty password for trust auth
  database: process.env.DB_NAME,
  ssl: false,
  // Improved connection pooling settings
  max: 20, // Increase max connections
  min: 2, // Minimum connections to maintain
  idleTimeoutMillis: 60000, // Increase idle timeout
  connectionTimeoutMillis: 10000, // Increase connection timeout
  acquireTimeoutMillis: 60000, // Increase acquire timeout
  // Retry logic
  retryOnExit: true,
  allowExitOnIdle: true,
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err);
  // Don't exit process, just log the error
});

// Handle pool connection events
pool.on('connect', (client) => {
  console.log('New database connection established');
});

pool.on('remove', (client) => {
  console.log('Database connection removed from pool');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing database pool...');
  await pool.end();
  console.log('Database pool closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing database pool...');
  await pool.end();
  console.log('Database pool closed');
  process.exit(0);
});

const db = drizzle(pool);

module.exports = { db, pool };

