const { pgTable, pgEnum, text, timestamp, uuid, varchar, integer, boolean } = require('drizzle-orm/pg-core');

// Message type enum
const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'audio', 'video', 'file']);

// Users table
const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Messages table with multimedia support
const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  username: varchar('username', { length: 100 }).notNull(),

  // Message type enum
  messageType: messageTypeEnum('message_type').default('text').notNull(),

  // Text content (optional for media-only messages)
  content: text('content'),

  // Media fields
  mediaUrl: text('media_url'),              // URL or path to the media file
  mediaType: varchar('media_type', { length: 100 }),  // MIME type (e.g., 'image/png', 'audio/mp3')
  mediaDuration: integer('media_duration'), // Duration in seconds (for audio/video)
  mediaThumbnail: text('media_thumbnail'),  // Thumbnail URL for images/videos
  fileName: varchar('file_name', { length: 255 }),    // Original file name
  fileSize: integer('file_size'),           // File size in bytes

  isDeleted: boolean('is_deleted').default(false).notNull(),
  updatedAt: timestamp('updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

module.exports = { users, messages, messageTypeEnum };

