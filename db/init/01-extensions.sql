-- Runs automatically on first boot of the postgres container
-- (via /docker-entrypoint-initdb.d). Idempotent.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
