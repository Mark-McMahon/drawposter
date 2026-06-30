// HTTP (static client) + WebSocket (game protocol) server.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

import { RoomManager } from './rooms';
import { Room } from './room';
import { buildStateView } from './views';
import { ClientMessage, ServerMessage } from './types';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// ---------- static file server ----------

const httpServer = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  // prevent path traversal
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
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
const wss = new WebSocketServer({ server: httpServer });

interface Conn {
  ws: WebSocket;
  code: string | null;
  playerId: string | null;
}

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
  conns.set(ws, { ws, code: null, playerId: null });

  ws.on('message', (raw) => {
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

httpServer.listen(PORT, () => {
  console.log(`drawposter listening on http://localhost:${PORT}`);
});
