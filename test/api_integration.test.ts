import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { RoomArchive } from '../src/archive-store';
import {
  app,
  resetRoomArchiveSaverForTesting,
  salasActivas,
  setRoomArchiveSaverForTesting,
} from '../src/index';

async function postJson(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readSseChunk(response: Response, timeoutMs = 1000) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('No reader');
  }

  const result = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('SSE timeout')), timeoutMs);
    }),
  ]);

  const text = new TextDecoder().decode(result.value);
  await reader.cancel();
  return text;
}

describe('Integración API Edge Chat', () => {
  let archivedRooms: RoomArchive[];

  beforeEach(() => {
    salasActivas.clear();
    archivedRooms = [];
    process.env.API_KEY = 'test-api-key';
    setRoomArchiveSaverForTesting(async (roomArchive) => {
      archivedRooms.push(roomArchive);
    });
  });

  afterEach(() => {
    resetRoomArchiveSaverForTesting();
    salasActivas.clear();
    delete process.env.API_KEY;
  });

  it('cubre el flujo completo con UUID, SSE y archivado', async () => {
    const salaId = `sala-test-${Date.now()}`;

    const salaRes = await postJson('/api/salas', {
      sala_id: salaId,
      id: 'user-123',
      nombre: 'Ana',
      color: '#ffaa00',
    });
    expect(salaRes.status).toBe(201);

    const salaData = await salaRes.json() as { ok: boolean; uuid: string; sala_id: string };
    expect(salaData.ok).toBe(true);
    expect(salaData.sala_id).toBe(salaId);

    const sseRes = await app.request(`/stream?sala=${salaId}&uuid=${salaData.uuid}`);
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');

    const msgRes = await postJson('/api/mensajes', {
      sala_id: salaId,
      uuid: salaData.uuid,
      texto: 'Hola Mundo',
    });
    expect(msgRes.status).toBe(200);

    const sseText = await readSseChunk(sseRes);
    expect(sseText).toContain('Hola Mundo');
    expect(sseText).toContain('Ana');

    const deleteRes = await app.request(`/api/salas/${salaId}`, {
      method: 'DELETE',
      headers: { 'X-Api-Key': 'test-api-key' },
    });
    expect(deleteRes.status).toBe(200);

    const deleteData = await deleteRes.json() as { ok: boolean };
    expect(deleteData.ok).toBe(true);
    expect(archivedRooms).toHaveLength(1);
    expect(archivedRooms[0]?.sala_id).toBe(salaId);
    expect(archivedRooms[0]?.mensajes).toHaveLength(1);

    const msgAfterClose = await postJson('/api/mensajes', {
      sala_id: salaId,
      uuid: salaData.uuid,
      texto: '¿Hay alguien?',
    });
    expect(msgAfterClose.status).toBe(404);
  });
});