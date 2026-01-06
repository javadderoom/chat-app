const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'chat_app',
  ssl: false,
  max: 10, 
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 2000,
});

const db = drizzle(pool);

module.exports = { db, pool };

