import postgres from 'postgres';

export type RoomArchiveUser = {
  uuid: string;
  id: string;
  nombre: string;
  color: string;
};

export type RoomArchiveMessage = {
  nombre: string;
  color: string;
  texto: string;
  timestamp: number;
};

export type RoomArchive = {
  sala_id: string;
  archived_at: Date;
  usuarios: RoomArchiveUser[];
  mensajes: RoomArchiveMessage[];
  metadata: {
    user_count: number;
    message_count: number;
    archived_from: 'memory';
  };
};

type ArchiveStoreStatusCode = 500 | 503;

export class ArchiveStoreError extends Error {
  constructor(message: string, readonly statusCode: ArchiveStoreStatusCode) {
    super(message);
    this.name = 'ArchiveStoreError';
  }
}

let sqlClient: ReturnType<typeof postgres> | null = null;

function getArchiveClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new ArchiveStoreError('DATABASE_URL no configurada para archivar la sala', 503);
  }

  if (sqlClient) {
    return sqlClient;
  }

  try {
    new URL(databaseUrl);
    sqlClient = postgres(databaseUrl);
    return sqlClient;
  } catch {
    throw new ArchiveStoreError('DATABASE_URL invalida para archivar la sala', 503);
  }
}

export async function saveRoomArchive(roomArchive: RoomArchive) {
  const sql = getArchiveClient();
  const snapshot = JSON.stringify(roomArchive);

  try {
    await sql`
      INSERT INTO chat_room_archives (sala_id, archived_at, snapshot)
      VALUES (${roomArchive.sala_id}, ${roomArchive.archived_at}, ${snapshot}::jsonb)
    `;
  } catch {
    throw new ArchiveStoreError('No se pudo archivar la sala en la base de datos', 500);
  }
}