-- Additional database initialization
-- This file runs after PostgreSQL starts up

-- Ensure proper permissions
GRANT ALL PRIVILEGES ON DATABASE chat_app TO postgres;

-- Create messages table (assuming this is where the columns should be added)
-- This part is inferred from the provided Code Edit snippet, as the original document
-- did not contain a CREATE TABLE statement for messages.
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL,
    chat_id UUID NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    read_at TIMESTAMP,
    deleted_at TIMESTAMP,
    edited_at TIMESTAMP,
    reply_to_id UUID REFERENCES messages(id),
    is_forwarded BOOLEAN DEFAULT FALSE NOT NULL,
    forwarded_from VARCHAR(100),
    reactions JSONB DEFAULT '{}' NOT NULL,
    updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Reset postgres user password to 'postgres' in case it was changed
ALTER USER postgres PASSWORD 'postgres';

-- Set timezone if needed
-- SET timezone = 'UTC';
