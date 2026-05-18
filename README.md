<div align="center">

```
 ██████╗██╗███╗   ██╗██████╗ ███████╗██████╗
██╔════╝██║████╗  ██║██╔══██╗██╔════╝██╔══██╗
██║     ██║██╔██╗ ██║██║  ██║█████╗  ██████╔╝
██║     ██║██║╚██╗██║██║  ██║██╔══╝  ██╔══██╗
╚██████╗██║██║ ╚████║██████╔╝███████╗██║  ██║
 ╚═════╝╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝
```

**Rooms live in memory. Messages arrive in real-time. When the room closes, it turns to ash.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=flat&logo=hono&logoColor=white)](https://hono.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

## What is Cinder?

Cinder is a **blazing-fast, ephemeral SSE chat microservice** built with [Hono](https://hono.dev) and [Bun](https://bun.sh). It's designed for scenarios where you need real-time messaging *right now* without the overhead of WebSockets, databases at runtime, or complex infrastructure.

- **No polling.** Pure [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).
- **No bloat.** State lives in-memory while the room is active.
- **No data loss.** Closing a room snapshots everything to PostgreSQL before the embers cool.

> Built for live events, game sessions, temporary collaboration rooms, and any use-case where the chat is the moment — not the archive.

---

## Features

- 🔥 **SSE streaming** — persistent HTTP connections, no WebSocket handshake overhead
- 🧠 **In-memory state** — zero-latency reads, rooms live and die fast
- 🗄️ **Optional PostgreSQL archiving** — full JSONB snapshot on room close
- 🔒 **API key auth** — `X-Api-Key` header guard on sensitive routes (timing-safe comparison)
- 🌐 **Configurable CORS** — single env var, no fuss
- ⚡ **Bun-native** — runs on [Bun](https://bun.sh), takes full advantage of its speed
- 🧪 **Fully tested** — unit + integration tests with zero external dependencies

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Hono](https://hono.dev) |
| Language | TypeScript |
| Streaming | Server-Sent Events (SSE) |
| Persistence | PostgreSQL via [postgres.js](https://github.com/porsager/postgres) |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/alew140/cinder.git
cd cinder

# 2. Install
bun install

# 3. Configure
cp .env.example .env
# Edit .env with your values

# 4. Run
bun run dev

# 5. Verify
curl http://localhost:3000/health
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `DATABASE_URL` | — | PostgreSQL connection string for room archiving |
| `API_KEY` | — | Secret key required in `X-Api-Key` header for protected routes |

```env
PORT=3000
CORS_ORIGIN=https://your-frontend.com
DATABASE_URL=postgresql://user:password@host:5432/dbname
API_KEY=your-secret-key
```

> **Note:** If `DATABASE_URL` is missing or invalid, `DELETE /api/salas/:id` will return an error and the room stays active in memory — no silent data loss.

---

## API Reference

### `GET /health`
Health check. Returns `200 OK` with `{ ok: true }`.

---

### `POST /api/salas`
> 🔒 Requires `X-Api-Key` header.

Create a room (if it doesn't exist) and register a user in it. Returns a UUID token used to authenticate SSE and message endpoints.

**Request:**
```json
{
  "sala_id": "room-42",
  "id": "user-1",
  "nombre": "Ana",
  "color": "#ffcc00"
}
```

**Response:**
```json
{
  "ok": true,
  "sala_id": "room-42",
  "uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### `GET /stream?sala=<id>&uuid=<uuid>`
Opens an SSE stream for the authenticated user. Keep this connection alive to receive real-time messages.

The server pushes events as:
```
data: {"nombre":"Ana","color":"#ffcc00","texto":"Hello!","timestamp":1700000000000}
```

---

### `POST /api/mensajes`
> 🔒 Requires `X-Api-Key` header.

Broadcast a message to all connected clients in a room.

**Request:**
```json
{
  "sala_id": "room-42",
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "texto": "Hello, world!"
}
```

**Response:**
```json
{ "ok": true }
```

---

### `DELETE /api/salas/:id`
> 🔒 Requires `X-Api-Key` header.

Archive the room to PostgreSQL, then disconnect all clients and free memory. **If archiving fails, the room is NOT deleted** — you can retry.

---

## How Archiving Works

When a room is closed, Cinder persists a complete snapshot to the `chat_room_archives` table before evicting anything from memory.

**Schema** (`schema.sql`):
```sql
CREATE TABLE IF NOT EXISTS chat_room_archives (
  archive_id BIGSERIAL PRIMARY KEY,
  sala_id    TEXT        NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot   JSONB       NOT NULL
);
```

**Snapshot structure:**
```jsonc
{
  "sala_id": "room-42",
  "archived_at": "2024-01-01T00:00:00Z",
  "usuarios": [{ "uuid": "...", "id": "user-1", "nombre": "Ana", "color": "#ffcc00" }],
  "mensajes": [{ "nombre": "Ana", "color": "#ffcc00", "texto": "Hello!", "timestamp": 1700000000000 }],
  "metadata": {
    "user_count": 1,
    "message_count": 1,
    "archived_from": "memory"
  }
}
```

---

## Typical Flow

```
Client A                  Cinder                  Client B
  │                          │                          │
  │── POST /api/salas ──────►│                          │
  │◄─ { uuid: "abc..." } ───│                          │
  │                          │                          │
  │── GET /stream?uuid=abc ─►│◄── GET /stream?uuid=xyz ─│
  │   (SSE connection open)  │   (SSE connection open)  │
  │                          │                          │
  │── POST /api/mensajes ───►│                          │
  │                          │──── event: message ─────►│
  │                          │                          │
  │── DELETE /api/salas/42 ─►│                          │
  │                          │── [archive to Postgres]  │
  │                          │── [disconnect clients] ──►│
```

---

## Development

```bash
bun run dev       # Start with hot reload
bun run build     # Build to dist/
bun run start     # Run built output
bun test          # Run all tests
```

---

## Project Structure

```
cinder/
├── src/
│   ├── index.ts           # Hono app, routes, SSE logic
│   └── archive-store.ts   # PostgreSQL archive persistence
├── test/
│   ├── api.test.ts              # Unit tests (no external deps)
│   └── api_integration.test.ts  # Integration tests
├── schema.sql             # PostgreSQL schema
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Contributing

Pull requests are welcome. For major changes, open an issue first.

1. Fork the repo
2. Create your branch: `git checkout -b feat/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feat/amazing-feature`
5. Open a Pull Request

---

## License

[MIT](./LICENSE) — do whatever you want, just don't blame us when the room burns down.

---

<div align="center">
  <sub>Built with 🔥 and <a href="https://bun.sh">Bun</a> + <a href="https://hono.dev">Hono</a></sub>
</div>
