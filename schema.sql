CREATE TABLE IF NOT EXISTS chat_room_archives (
  archive_id BIGSERIAL PRIMARY KEY,
  sala_id TEXT NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_room_archives_sala_id
  ON chat_room_archives (sala_id);