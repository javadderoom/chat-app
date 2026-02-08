-- Additional database initialization
-- This file runs after PostgreSQL starts up

-- Ensure proper permissions
GRANT ALL PRIVILEGES ON DATABASE chat_app TO postgres;

-- Reset postgres user password to 'postgres' in case it was changed
ALTER USER postgres PASSWORD 'postgres';

-- Set timezone if needed
-- SET timezone = 'UTC';
