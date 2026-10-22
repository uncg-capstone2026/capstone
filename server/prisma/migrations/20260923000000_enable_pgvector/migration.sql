-- pgvector, for the "embedding vector(768)" columns. Named to sort before
-- 20260923152218_init, so on a fresh database it runs first; on a database
-- that already has the extension (Neon), it does nothing.
CREATE EXTENSION IF NOT EXISTS vector;