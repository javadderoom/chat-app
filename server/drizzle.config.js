require('dotenv').config();

module.exports = {
  schema: './db/schema.js',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || '46.245.77.82',
    port: parseInt(process.env.DB_PORT || '30994'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'inPrjKiQm45OYynACz6m',
    database: process.env.DB_NAME || 'databaseoce_db',
    ssl: false,
  },
};

