import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context, Next } from 'hono';
import { randomUUID, timingSafeEqual } from 'crypto';
import { ArchiveStoreError, saveRoomArchive, type RoomArchive } from './archive-store';

// Tipos base
export type Mensaje = {
  nombre: string;
  color: string;
  texto: string;
  timestamp: number;
};

type SSEClient = { write: (data: string) => void; close: () => void };

type UsuarioSala = {
  uuid: string;
  id: string;
  nombre: string;
  color: string;
};

type SalaMem = {
  clientes: SSEClient[];
  mensajes: Mensaje[];
  usuarios: Map<string, UsuarioSala>; // uuid -> usuario
};

type RoomArchiveSaver = (roomArchive: RoomArchive) => Promise<void>;

export const salasActivas = new Map<string, SalaMem>();
let persistRoomArchive: RoomArchiveSaver = saveRoomArchive;

async function requireApiKey(c: Context, next: Next) {
  const serverKey = process.env.API_KEY;
  if (!serverKey) {
    return c.json({ ok: false, error: 'API_KEY no configurada en el servidor' }, 500);
  }
  const provided = c.req.header('X-Api-Key') ?? '';
  const same =
    provided.length === serverKey.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(serverKey));
  if (!same) {
    return c.json({ ok: false, error: 'API key inválida o ausente' }, 401);
  }
  await next();
}

export function setRoomArchiveSaverForTesting(roomArchiveSaver: RoomArchiveSaver) {
  persistRoomArchive = roomArchiveSaver;
}

export function resetRoomArchiveSaverForTesting() {
  persistRoomArchive = saveRoomArchive;
}


function construirArchivoSala(salaId: string, sala: SalaMem): RoomArchive {
  return {
    sala_id: salaId,
    archived_at: new Date(),
    usuarios: Array.from(sala.usuarios.values()).map((usuario) => ({ ...usuario })),
    mensajes: sala.mensajes.map((mensaje) => ({ ...mensaje })),
    metadata: {
      user_count: sala.usuarios.size,
      message_count: sala.mensajes.length,
      archived_from: 'memory',
    },
  };
}


function verificarUUID(uuid: string, salaId: string): UsuarioSala | null {
  const sala = salasActivas.get(salaId);
  if (!sala) return null;
  return sala.usuarios.get(uuid) || null;
}

export const app = new Hono();

app.use('*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Api-Key'],
  exposeHeaders: [],
  maxAge: 86400,
  credentials: false,
}));

app.get('/health', (c) => c.json({ ok: true }, 200));


// POST /api/salas (crear sala o unirse) — solo backend
app.post('/api/salas', requireApiKey, async (c) => {
  try {
    const { sala_id, id, nombre, color } = await c.req.json<{ sala_id: string; id: string; nombre: string; color: string }>();
    if (!sala_id || !id || !nombre || !color) {
      return c.json({ ok: false, error: 'Faltan datos' }, 400);
    }
    if (!salasActivas.has(sala_id)) {
      salasActivas.set(sala_id, { clientes: [], mensajes: [], usuarios: new Map() });
    }
    const sala = salasActivas.get(sala_id)!;
    // Generar UUID único para este usuario en esta sala
    const uuid = randomUUID();
    sala.usuarios.set(uuid, { uuid, id, nombre, color });
    return c.json({ ok: true, sala_id, uuid }, 201);
  } catch (e) {
    return c.json({ ok: false, error: 'Error de formato en el body' }, 400);
  }
});


// GET /stream?sala&uuid
app.get('/stream', async (c) => {
  try {
    const { sala, uuid } = c.req.query();
    if (!sala || !uuid) {
      return c.text('Faltan credenciales', 401);
    }
    const salaActual = salasActivas.get(sala);
    if (!salaActual) {
      return c.text('Sala no existe', 404);
    }
    const user = verificarUUID(uuid, sala);
    if (!user) {
      return c.text('UUID inválido o acceso denegado a esta sala', 401);
    }
    // SSE headers
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const removeClient = () => {
          salaActual.clientes = salaActual.clientes.filter((cli) => cli !== client);
        };
        const safeClose = () => {
          if (closed) {
            return;
          }

          closed = true;
          removeClient();

          try {
            controller.close();
          } catch {
            // El stream puede estar cerrado por el consumidor antes del cierre de la sala.
          }
        };
        const client: SSEClient = {
          write: (data: string) => {
            if (closed) {
              return;
            }

            try {
              controller.enqueue(encoder.encode(data));
            } catch {
              safeClose();
            }
          },
          close: () => safeClose(),
        };
        salaActual.clientes.push(client);
        c.req.raw.signal.addEventListener('abort', safeClose);
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return c.text('Error inesperado en el stream', 500);
  }
});


// POST /api/mensajes
app.post('/api/mensajes', async (c) => {
  try {
    const { sala_id, texto, uuid } = await c.req.json<{ sala_id: string; texto: string; uuid: string }>();
    if (!sala_id || !texto || !uuid) {
      return c.json({ ok: false, error: 'Faltan datos o uuid' }, 400);
    }
    const salaActual = salasActivas.get(sala_id);
    if (!salaActual) {
      return c.json({ ok: false, error: 'Sala no existe' }, 404);
    }
    const user = verificarUUID(uuid, sala_id);
    if (!user) {
      return c.json({ ok: false, error: 'No autorizado' }, 401);
    }
    // Solo nombre y color para broadcast
    const nuevoMensaje = {
      nombre: user.nombre,
      color: user.color,
      texto,
      timestamp: Date.now(),
    };
    salaActual.mensajes.push(nuevoMensaje);
    // Broadcast a clientes conectados (SSE)
    const payload = `data: ${JSON.stringify(nuevoMensaje)}\n\n`;
    salaActual.clientes.forEach((cli) => cli.write(payload));

    return c.json({ ok: true, msg: 'Mensaje recibido' }, 200);
  } catch (e) {
    return c.json({ ok: false, error: 'Error de formato en el body' }, 400);
  }
});

// DELETE /api/salas/:id  (ruta admin — requiere X-Api-Key)

app.delete('/api/salas/:id', requireApiKey, async (c) => {
  try {
    const sala_id = c.req.param('id');
    if (!sala_id) {
      return c.json({ ok: false, error: 'ID de sala requerido' }, 400);
    }
    const salaActual = salasActivas.get(sala_id);
    if (!salaActual) {
      return c.json({ ok: false, error: 'Sala no encontrada' }, 404);
    }
    const archivoSala = construirArchivoSala(sala_id, salaActual);

    try {
      await persistRoomArchive(archivoSala);
    } catch (error) {
      if (error instanceof ArchiveStoreError) {
        const status = error.statusCode === 503 ? 503 : 500;
        return c.json({ ok: false, error: error.message }, status);
      }

      return c.json({ ok: false, error: 'No se pudo archivar la sala' }, 500);
    }

    // Notificar a los clientes y cerrar conexiones
    const cierrePayload = `data: ${JSON.stringify({ tipo: 'SISTEMA', texto: 'Chat cerrado por el servidor' })}\n\n`;
    salaActual.clientes.forEach((cli) => {
      cli.write(cierrePayload);
      cli.close();
    });
    salaActual.clientes = [];
    // Eliminar sala de memoria (incluye usuarios)
    salasActivas.delete(sala_id);

    return c.json({ ok: true, msg: 'Sala archivada, eliminada y clientes desconectados' }, 200);
  } catch (e) {
    return c.json({ ok: false, error: 'Error inesperado al eliminar sala' }, 500);
  }
});

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  Bun.serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Server running on http://localhost:${port}`);
// Documentación OpenAPI YAML
app.get('/docs', async (c) => {
  const yaml = await Bun.file('openapi.yaml').text();
  return c.text(yaml, 200, { 'Content-Type': 'text/yaml; charset=utf-8' });
});

if (import.meta.main) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  Bun.serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Server running on http://localhost:${port}`);
}





