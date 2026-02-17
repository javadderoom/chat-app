const { db, pool } = require('./db/index');
const { chats } = require('./db/schema');
const { eq } = require('drizzle-orm');
const fs = require('fs');
const path = require('path');

async function testDatabaseConnection(maxRetries = 10, retryDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Testing database connection (attempt ${attempt}/${maxRetries})...`);
      const result = await pool.query('SELECT NOW()');
      console.log('Database connection successful');
      console.log('  Database time:', result.rows[0].now);

      try {
        const countResult = await pool.query('SELECT COUNT(*) FROM messages');
        console.log('Database tables are accessible');
        console.log('  Current message count:', countResult.rows[0].count);
      } catch (tableError) {
        console.error('Database tables not found:', tableError.message);
        console.error('  Please ensure database schema is initialized');
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Database connection failed (attempt ${attempt}/${maxRetries}):`, error.message);

      if (attempt === maxRetries) {
        console.error('  Max retries reached. Please check:');
        console.error('  - PostgreSQL container is running');
        console.error('  - Database credentials are correct');
        console.error('  - Network connectivity between containers');
        return false;
      }

      console.log(`  Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  return false;
}

async function runMigrations() {
  try {
    console.log('Running database migrations...');

    await pool.query(`
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false NOT NULL
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_dm BOOLEAN DEFAULT false NOT NULL
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        role VARCHAR(20) DEFAULT 'member' NOT NULL,
        joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(chat_id, user_id)
      )
    `).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        delivered_at TIMESTAMP DEFAULT NOW() NOT NULL,
        seen_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(message_id, user_id)
      )
    `).catch(() => {});
    await pool.query(`
      DELETE FROM message_receipts mr
      USING (
        SELECT ctid
        FROM (
          SELECT
            ctid,
            ROW_NUMBER() OVER (
              PARTITION BY message_id, user_id
              ORDER BY created_at DESC, id DESC
            ) AS rn
          FROM message_receipts
        ) ranked
        WHERE ranked.rn > 1
      ) dup
      WHERE mr.ctid = dup.ctid
    `).catch(() => {});
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_message_receipts_message_user_unique
      ON message_receipts(message_id, user_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chats_pinned_message_id ON chats(pinned_message_id)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_receipts_message_id ON message_receipts(message_id)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_receipts_user_id ON message_receipts(user_id)
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_receipts_seen_at ON message_receipts(seen_at)
    `).catch(() => {});
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_created_not_deleted
      ON messages (chat_id, created_at DESC)
      WHERE is_deleted = false
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_created_not_deleted
      ON messages (created_at DESC)
      WHERE is_deleted = false
    `).catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
      ON messages USING GIN (content gin_trgm_ops)
    `).catch(() => {});

    console.log('Migrations completed');
  } catch (error) {
    console.warn('Migration warning:', error.message);
  }
}

async function ensureDefaultGlobalChat() {
  try {
    const existingChats = await db.select().from(chats).limit(1);
    if (existingChats.length === 0) {
      console.log('Creating default Global chat...');
      const [newChat] = await db.insert(chats).values({
        name: 'Global',
        description: 'The combined frequency of all transmissions.'
      }).returning();
      await pool.query(
        `
        INSERT INTO chat_members (chat_id, user_id, role)
        SELECT $1::uuid, u.id, 'admin'
        FROM users u
        ON CONFLICT (chat_id, user_id) DO NOTHING
        `,
        [newChat.id]
      );
    }
  } catch (error) {
    console.warn('Could not create default chat. It might already exist or table not ready.', error.message);
  }
}

function validateUploadDirectory(uploadRoot) {
  const resolvedUploadRoot = path.resolve(uploadRoot);
  const categories = ['images', 'videos', 'audio', 'voice'];

  try {
    fs.mkdirSync(resolvedUploadRoot, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create upload root "${resolvedUploadRoot}": ${error.message}`);
  }

  try {
    fs.accessSync(resolvedUploadRoot, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    throw new Error(`Upload root is not readable/writable "${resolvedUploadRoot}": ${error.message}`);
  }

  for (const category of categories) {
    const categoryPath = path.join(resolvedUploadRoot, category);
    try {
      fs.mkdirSync(categoryPath, { recursive: true });
      fs.accessSync(categoryPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw new Error(`Upload category is not ready "${categoryPath}": ${error.message}`);
    }
  }

  const probePath = path.join(resolvedUploadRoot, `.write-test-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(probePath, 'ok');
    fs.unlinkSync(probePath);
  } catch (error) {
    throw new Error(`Upload root write test failed "${resolvedUploadRoot}": ${error.message}`);
  }

  return resolvedUploadRoot;
}

module.exports = {
  testDatabaseConnection,
  runMigrations,
  ensureDefaultGlobalChat,
  validateUploadDirectory,
  pool
};
