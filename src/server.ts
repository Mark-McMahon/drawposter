// HTTP (static client) + WebSocket (game protocol) server.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

import { RoomManager } from './rooms';
import { Room } from './room';
import { buildStateView } from './views';
import { TokenBucket } from './ratelimit';
import { ClientMessage, ServerMessage } from './types';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------- abuse limits ----------
// A WS frame larger than this is rejected by `ws` before it reaches us, so a
// client can't force a giant JSON.parse. The game's biggest legit message is a
// stroke (<=1000 points); 64 KiB is comfortably above that.
const MAX_PAYLOAD = 64 * 1024;
// Per-connection token bucket: generous for real play (continuous voting +
// drawing), but a tight spam loop runs dry and its messages are dropped before
// they can mutate state or trigger a broadcast.
const RATE_CAPACITY = 40;
const RATE_REFILL_PER_SEC = 20;
// Consecutive dropped (over-limit) messages before we hang up a flooding socket
// so it stops costing us parse/CPU at all.
const MAX_STRIKES = 200;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

interface Conn {
  ws: WebSocket;
  code: string | null;
  playerId: string | null;
  bucket: TokenBucket;
  strikes: number;
}

/**
 * Builds the HTTP + WebSocket game server but does NOT start listening, so it
 * can be booted on an ephemeral port from tests. Call `.listen()` on the
 * returned `httpServer` to run it.
 */
export function createAppServer(): { httpServer: http.Server; manager: RoomManager } {

// ---------- static file server ----------

const httpServer = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  // prevent path traversal
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  // Confine to PUBLIC_DIR: require the separator so a sibling dir whose name
  // merely starts with "public" can't be served.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback to index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) {
          res.writeHead(404).end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(idx);
        }
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' }).end(data);
  });
});

// ---------- websocket game protocol ----------

const manager = new RoomManager();
const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD });

const conns = new Map<WebSocket, Conn>();
// reverse index so we can broadcast a room's state to all its sockets
const roomSockets = new Map<string, Set<WebSocket>>();

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function bindRoomBroadcast(room: Room) {
  room.setOnChange(() => broadcastRoom(room));
}

function broadcastRoom(room: Room) {
  const sockets = roomSockets.get(room.code);
  if (!sockets) return;
  for (const ws of sockets) {
    const c = conns.get(ws);
    if (!c || !c.playerId) continue;
    send(ws, buildStateView(room, c.playerId));
  }
}

function attachSocketToRoom(ws: WebSocket, room: Room) {
  let set = roomSockets.get(room.code);
  if (!set) {
    set = new Set();
    roomSockets.set(room.code, set);
  }
  set.add(ws);
}

function detachSocketFromRoom(ws: WebSocket, code: string) {
  const set = roomSockets.get(code);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) roomSockets.delete(code);
}

wss.on('connection', (ws) => {
  const conn: Conn = {
    ws,
    code: null,
    playerId: null,
    bucket: new TokenBucket(RATE_CAPACITY, RATE_REFILL_PER_SEC),
    strikes: 0,
  };
  conns.set(ws, conn);

  ws.on('message', (raw) => {
    // Rate-limit BEFORE parsing so a flood never reaches JSON.parse/broadcast.
    if (!conn.bucket.take()) {
      if (++conn.strikes > MAX_STRIKES) ws.terminate();
      return;
    }
    conn.strikes = 0;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    const c = conns.get(ws);
    if (c?.code && c.playerId) {
      const room = manager.get(c.code);
      if (room) {
        room.onDisconnect(c.playerId);
        detachSocketFromRoom(ws, c.code);
        if (room.isEmpty()) manager.delete(c.code);
      }
    } else if (c?.code) {
      detachSocketFromRoom(ws, c.code);
    }
    conns.delete(ws);
  });

  ws.on('error', () => {
    /* close handler does cleanup */
  });
});

function handleMessage(ws: WebSocket, msg: ClientMessage) {
  const c = conns.get(ws);
  if (!c) return;

  switch (msg.t) {
    case 'ping':
      send(ws, { t: 'pong' });
      return;

    case 'create': {
      // Guard: one room per socket. Without this, a socket can spam `create`
      // and orphan a fresh Room on every call (only its latest room is ever
      // cleaned up on close), leaking memory unboundedly.
      if (c.code) {
        send(ws, { t: 'error', message: 'Already in a room.' });
        return;
      }
      const room = manager.create();
      bindRoomBroadcast(room);
      const player = room.addPlayer(msg.name);
      c.code = room.code;
      c.playerId = player.id;
      attachSocketToRoom(ws, room);
      send(ws, { t: 'joined', code: room.code, playerId: player.id });
      send(ws, buildStateView(room, player.id));
      return;
    }

    case 'join': {
      if (c.code) {
        send(ws, { t: 'error', message: 'Already in a room.' });
        return;
      }
      const room = manager.get(String(msg.code).trim());
      if (!room) {
        send(ws, { t: 'error', message: 'No room with that code.' });
        return;
      }
      if (room.players.filter((p) => p.connected).length >= 12) {
        send(ws, { t: 'error', message: 'Room is full (12 players).' });
        return;
      }
      const player = room.addPlayer(msg.name);
      c.code = room.code;
      c.playerId = player.id;
      attachSocketToRoom(ws, room);
      send(ws, { t: 'joined', code: room.code, playerId: player.id });
      send(ws, buildStateView(room, player.id));
      return;
    }

    default:
      break;
  }

  // remaining messages require an active room + player
  if (!c.code || !c.playerId) {
    send(ws, { t: 'error', message: 'Not in a room.' });
    return;
  }
  const room = manager.get(c.code);
  if (!room) {
    send(ws, { t: 'error', message: 'Room no longer exists.' });
    return;
  }
  const pid = c.playerId;

  switch (msg.t) {
    case 'settings':
      room.applySettings(pid, msg.settings ?? {});
      break;
    case 'start': {
      const err = room.startRound(pid);
      if (err) send(ws, { t: 'error', message: err });
      break;
    }
    case 'stroke': {
      const err = room.handleStroke(pid, msg.points);
      if (err) send(ws, { t: 'error', message: err });
      break;
    }
    case 'vote': {
      const err = room.handleVote(pid, msg.target ?? null);
      if (err) send(ws, { t: 'error', message: err });
      break;
    }
    case 'guess': {
      const err = room.handleGuess(pid, msg.word ?? '');
      if (err) send(ws, { t: 'error', message: err });
      break;
    }
    case 'guessSkip': {
      const err = room.handleGuessSkip(pid);
      if (err) send(ws, { t: 'error', message: err });
      break;
    }
    case 'kick': {
      const target = msg.playerId;
      // notify the kicked socket if present
      const err = room.kick(pid, target);
      if (err) {
        send(ws, { t: 'error', message: err });
      } else {
        for (const sock of roomSockets.get(room.code) ?? []) {
          const cc = conns.get(sock);
          if (cc?.playerId === target) {
            send(sock, { t: 'kicked' });
            cc.code = null;
            cc.playerId = null;
            detachSocketFromRoom(sock, room.code);
          }
        }
      }
      break;
    }
    case 'leave': {
      room.onDisconnect(pid);
      detachSocketFromRoom(ws, room.code);
      if (room.isEmpty()) manager.delete(room.code);
      c.code = null;
      c.playerId = null;
      break;
    }
    default:
      break;
  }
}

  return { httpServer, manager };
}

// Boot only when run directly (`node dist/server.js`), not when imported by tests.
if (require.main === module) {
  const { httpServer } = createAppServer();
  httpServer.listen(PORT, () => {
    console.log(`drawposter listening on http://localhost:${PORT}`);
  });
}
