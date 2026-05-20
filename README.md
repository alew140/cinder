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

## API Contracts

### Authentication Matrix

| Endpoint | Requires `X-Api-Key` | Requires room `uuid` |
|---|---|---|
| `GET /health` | No | No |
| `POST /api/salas` | Yes | No |
| `GET /stream?sala=<id>&uuid=<uuid>` | No | Yes (query param) |
| `POST /api/mensajes` | No | Yes (body field) |
| `DELETE /api/salas/:id` | Yes | No |

> `X-Api-Key` is validated with timing-safe comparison against `API_KEY`.

### Common Error Format (JSON endpoints)

Most JSON endpoints return:

```json
{
  "ok": false,
  "error": "human-readable message"
}
```

`GET /stream` returns plain text errors instead of JSON.

---


### `GET /health`

Health check.

**Curl example:**

```sh
curl http://localhost:3000/health
```

**Success**

- `200`:

```json
{ "ok": true }
```

---


### `POST /api/salas`

Create (if needed) and join a room. Registers user identity and returns a per-room UUID token.

**Curl example:**

```sh
curl -X POST http://localhost:3000/api/salas \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -d '{
    "sala_id": "room-42",
    "id": "user-1",
    "nombre": "Ana",
    "color": "#ffcc00"
  }'
```

**Headers**

- `Content-Type: application/json`
- `X-Api-Key: <API_KEY>`

**Request body**

```json
{
  "sala_id": "room-42",
  "id": "user-1",
  "nombre": "Ana",
  "color": "#ffcc00"
}
```

**Success**

- `201`:

```json
{
  "ok": true,
  "sala_id": "room-42",
  "uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Errors**

- `400`: missing required fields (`Faltan datos`) or invalid JSON (`Error de formato en el body`)
- `401`: invalid or missing API key
- `500`: `API_KEY` not configured on server

---


### `GET /stream?sala=<id>&uuid=<uuid>`

Open SSE stream for a previously registered room user.

**Curl example:**

```sh
curl -N "http://localhost:3000/stream?sala=room-42&uuid=<uuid>"
```

**Query params**

- `sala`: room id
- `uuid`: token returned by `POST /api/salas`

**Success**

- `200` with SSE headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`

Message frame format:

```text
data: {"nombre":"Ana","color":"#ffcc00","texto":"Hello!","timestamp":1700000000000}

```

**Errors (plain text)**

- `401`: missing credentials (`Faltan credenciales`) or invalid room UUID
- `404`: room does not exist (`Sala no existe`)
- `500`: unexpected stream error

---


### `POST /api/mensajes`

Broadcast message to connected clients in the room.

**Curl example:**

```sh
curl -X POST http://localhost:3000/api/mensajes \
  -H "Content-Type: application/json" \
  -d '{
    "sala_id": "room-42",
    "uuid": "<uuid>",
    "texto": "Hello, world!"
  }'
```

**Headers**

- `Content-Type: application/json`

**Request body**

```json
{
  "sala_id": "room-42",
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "texto": "Hello, world!"
}
```

**Success**

- `200`:

```json
{ "ok": true, "msg": "Mensaje recibido" }
```

**Errors**

- `400`: missing fields (`Faltan datos o uuid`) or invalid JSON (`Error de formato en el body`)
- `401`: invalid UUID for room (`No autorizado`)
- `404`: room does not exist (`Sala no existe`)

---


### `DELETE /api/salas/:id`

Archive room snapshot to PostgreSQL and then close active SSE clients.

**Curl example:**

```sh
curl -X DELETE http://localhost:3000/api/salas/room-42 \
  -H "X-Api-Key: $API_KEY"
```

**Headers**

- `X-Api-Key: <API_KEY>`

**Path params**

- `id`: room id

**Success**

- `200`:

```json
{
  "ok": true,
  "msg": "Sala archivada, eliminada y clientes desconectados"
}
```

**Errors**

- `400`: missing room id
- `401`: invalid or missing API key
- `404`: room not found
- `503`: archive storage unavailable (for example invalid or missing `DATABASE_URL`)
- `500`: archive failure or unexpected server error

**Behavior guarantee**

- Room is deleted from memory only after successful archiving.
- If archiving fails, room remains active and can be retried.

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

## Production Deployment

### Initial setup (Ubuntu / Debian VM)

```bash
# 1. Clone and install
git clone https://github.com/alew140/cinder.git /opt/bingo-chat
cd /opt/bingo-chat
bun install --frozen-lockfile --production

# 2. Configure environment
cp .env.example .env
nano .env  # set PORT, API_KEY, CORS_ORIGIN, DATABASE_URL

# 3. Install and configure Nginx reverse proxy
sudo bash setup-nginx-proxy.sh

# 4. Install TLS certificate (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### Updating the app

```bash
sudo bash update-app.sh   # git pull + bun install + systemctl restart
```

### SSE / Cloudflare notes

- **Gzip disabled** on the proxy location — compression buffers SSE data and breaks streaming.
- **Heartbeat every 25 s** — the server sends a bare SSE comment (`:\n\n`, 3 bytes) to keep the connection alive through Cloudflare's 100 s idle timeout.
- **`proxy_http_version 1.1`** — required so nginx keeps the upstream connection alive.
- **`idleTimeout: 180`** on `Bun.serve` — prevents Bun from closing idle SSE connections after the default 10 s.

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
├── setup-nginx-proxy.sh   # Nginx install + config for SSE proxying
├── update-app.sh          # Pull + reinstall + restart helper
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
