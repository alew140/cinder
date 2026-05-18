import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ArchiveStoreError, type RoomArchive } from '../src/archive-store';
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

describe('Edge Chat SSE API', () => {
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

  it('POST /api/salas crea sala y usuario', async () => {
    const res = await postJson('/api/salas', {
      sala_id: 'test',
      id: 'u1',
      nombre: 'Ana',
      color: '#ffcc00',
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.sala_id).toBe('test');
    expect(json.uuid).toBeDefined();
  });

  it('POST /api/mensajes acepta un uuid valido', async () => {
    const salaRes = await postJson('/api/salas', {
      sala_id: 'test2',
      id: 'u2',
      nombre: 'Beto',
      color: '#00ccff',
    });
    const { uuid } = await salaRes.json() as { uuid: string };

    const res = await postJson('/api/mensajes', {
      sala_id: 'test2',
      uuid,
      texto: 'hola',
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.msg).toContain('Mensaje recibido');
  });

  it('DELETE /api/salas/:id archiva la sala antes de eliminarla', async () => {
    const salaRes = await postJson('/api/salas', {
      sala_id: 'test-delete',
      id: 'u3',
      nombre: 'Carla',
      color: '#33cc99',
    });
    const { uuid } = await salaRes.json() as { uuid: string };

    await postJson('/api/mensajes', {
      sala_id: 'test-delete',
      uuid,
      texto: 'mensaje para archivar',
    });

    const res = await app.request('/api/salas/test-delete', {
      method: 'DELETE',
      headers: { 'X-Api-Key': 'test-api-key' },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.msg).toContain('Sala archivada');
    expect(archivedRooms).toHaveLength(1);
    expect(archivedRooms[0]?.sala_id).toBe('test-delete');
    expect(archivedRooms[0]?.metadata.message_count).toBe(1);
    expect(archivedRooms[0]?.metadata.user_count).toBe(1);
    expect(salasActivas.has('test-delete')).toBe(false);
  });

  it('no elimina la sala si el archivado falla', async () => {
    setRoomArchiveSaverForTesting(async () => {
      throw new ArchiveStoreError('DATABASE_URL no configurada para archivar la sala', 503);
    });

    await postJson('/api/salas', {
      sala_id: 'test-archive-error',
      id: 'u4',
      nombre: 'Dani',
      color: '#6633ff',
    });

    const res = await app.request('/api/salas/test-archive-error', {
      method: 'DELETE',
      headers: { 'X-Api-Key': 'test-api-key' },
    });
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error).toContain('DATABASE_URL');
    expect(salasActivas.has('test-archive-error')).toBe(true);
  });

  it('DELETE /api/salas/:id rechaza sin API key', async () => {
    await postJson('/api/salas', {
      sala_id: 'test-unauth',
      id: 'u5',
      nombre: 'Eve',
      color: '#ff0000',
    });

    const res = await app.request('/api/salas/test-unauth', { method: 'DELETE' });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(salasActivas.has('test-unauth')).toBe(true);
  });

  it('DELETE /api/salas/:id rechaza con API key incorrecta', async () => {
    await postJson('/api/salas', {
      sala_id: 'test-wrong-key',
      id: 'u6',
      nombre: 'Frank',
      color: '#0000ff',
    });

    const res = await app.request('/api/salas/test-wrong-key', {
      method: 'DELETE',
      headers: { 'X-Api-Key': 'wrong-key' },
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(salasActivas.has('test-wrong-key')).toBe(true);
  });
});
