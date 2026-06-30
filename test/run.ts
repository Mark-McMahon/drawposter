// Lightweight test runner (no framework). Run with: npm test
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { Room, Scheduler } from '../src/room';
import { matchGuess } from '../src/fuzzy';
import { TokenBucket } from '../src/ratelimit';
import { createAppServer } from '../src/server';
import { Player } from '../src/types';

// ---- tiny assert harness ----
let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${label}`); }
}
function eq<T>(a: T, b: T, label: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
function section(name: string) { console.log(`\n${name}`); }

// ---- controllable scheduler ----
class FakeScheduler implements Scheduler {
  t = 0;
  private nextId = 1;
  private pending: { id: number; fn: () => void; time: number }[] = [];
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = this.nextId++; this.pending.push({ id, fn, time: this.t + ms }); return id; }
  clearTimeout(h: unknown) { this.pending = this.pending.filter((p) => p.id !== h); }
  advance(ms: number) {
    this.t += ms;
    const due = this.pending.filter((p) => p.time <= this.t).sort((a, b) => a.time - b.time);
    this.pending = this.pending.filter((p) => p.time > this.t);
    for (const d of due) d.fn();
  }
}

function makeRoom(n: number, imposterCount: 1 | 2 = 1) {
  const sched = new FakeScheduler();
  let i = 0;
  const room = new Room('123456', { scheduler: sched, rng: Math.random, idGen: () => `P${i++}` });
  const players: Player[] = [];
  for (let k = 0; k < n; k++) players.push(room.addPlayer(`P${k}`));
  room.applySettings(room.hostId, { imposterCount });
  return { room, sched, players };
}

function imposters(room: Room) { return room.players.filter((p) => p.role === 'imposter'); }
function innocents(room: Room) { return room.players.filter((p) => p.role === 'innocent'); }

/** Cast exactly `threshold` votes against target from other living players. */
function voteOut(room: Room, targetId: string) {
  const voters = room.livingPlayers().filter((p) => p.id !== targetId);
  const need = room.threshold();
  for (let k = 0; k < need && k < voters.length; k++) {
    room.handleVote(voters[k].id, targetId);
  }
}

// ============================================================
section('fuzzy matcher');
ok(matchGuess('cat', 'cat'), 'exact');
ok(matchGuess('Cats', 'cat'), 'plural');
ok(matchGuess('berries', 'berry'), 'ies plural');
ok(matchGuess('Guitar!', 'guitar'), 'punctuation/case');
ok(matchGuess('gitar', 'guitar'), 'typo within tolerance');
ok(matchGuess('the apple', 'apple'), 'article stripped');
ok(matchGuess('sofa', 'couch'), 'synonym');
ok(!matchGuess('dog', 'cat'), 'different words reject');
ok(!matchGuess('', 'cat'), 'empty rejects');
ok(!matchGuess('elephant', 'ant'), 'substring is not a match');

// ============================================================
section('threshold math');
{
  const { room } = makeRoom(4);
  room.startRound(room.hostId);
  eq(room.threshold(), 3, '4 living -> threshold 3');
}
{
  const { room } = makeRoom(3);
  room.startRound(room.hostId);
  eq(room.threshold(), 2, '3 living -> threshold 2');
}

// ============================================================
section('execute innocent -> imposters win');
{
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const victim = innocents(room)[0];
  voteOut(room, victim.id);
  eq(room.phase, 'reveal', 'phase reveal');
  eq(room.result?.winner, 'imposters', 'imposters win on wrong kill');
  ok(!room.getPlayer(victim.id)!.alive, 'victim dead');
}

// ============================================================
section('execute imposter -> guessing -> wrong -> innocents win');
{
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const imp = imposters(room)[0];
  voteOut(room, imp.id);
  eq(room.phase, 'guessing', 'enters guessing');
  eq(room.guessingId, imp.id, 'caught imposter guesses');
  room.handleGuessSkip(imp.id);
  eq(room.phase, 'reveal', 'reveal after skip');
  eq(room.result?.winner, 'innocents', 'innocents win');
}

// ============================================================
section('execute imposter -> correct guess steals win');
{
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const imp = imposters(room)[0];
  voteOut(room, imp.id);
  room.handleGuess(imp.id, room.secretWord!);
  eq(room.phase, 'reveal', 'reveal');
  eq(room.result?.winner, 'imposters', 'correct guess steals');
}

// ============================================================
section('2 imposters: catch both -> innocents win');
{
  const { room } = makeRoom(5, 2);
  room.startRound(room.hostId);
  const imps = imposters(room);
  eq(imps.length, 2, 'two imposters assigned');
  voteOut(room, imps[0].id);
  eq(room.phase, 'guessing', 'first catch -> guessing');
  room.handleGuessSkip(imps[0].id);
  eq(room.phase, 'playing', 'continues after first wrong guess');
  ok(!room.getPlayer(imps[0].id)!.alive, 'first imposter removed');
  voteOut(room, imps[1].id);
  eq(room.phase, 'guessing', 'second catch -> guessing');
  room.handleGuessSkip(imps[1].id);
  eq(room.phase, 'reveal', 'reveal after both caught');
  eq(room.result?.winner, 'innocents', 'innocents win catching both');
}

// ============================================================
section('2 imposters: first correct guess steals immediately');
{
  const { room } = makeRoom(5, 2);
  room.startRound(room.hostId);
  const imps = imposters(room);
  voteOut(room, imps[0].id);
  room.handleGuess(imps[0].id, room.secretWord!);
  eq(room.phase, 'reveal', 'reveal');
  eq(room.result?.winner, 'imposters', 'team steals even with one imposter free');
  ok(room.getPlayer(imps[1].id)!.alive, 'second imposter never caught');
}

// ============================================================
section('disconnect guard: lowering threshold does not auto-execute');
{
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const imp = imposters(room)[0];
  const inns = innocents(room); // 3 innocents
  const victim = inns[0];
  const leaver = inns[1];
  // two votes on victim (threshold is 3, not enough)
  const livingOthers = room.livingPlayers().filter((p) => p.id !== victim.id && p.id !== leaver.id);
  room.handleVote(livingOthers[0].id, victim.id);
  room.handleVote(livingOthers[1].id, victim.id);
  eq(room.phase, 'playing', 'still playing with 2/3 votes');
  // leaver disconnects -> living drops to 3, threshold 2; existing 2 votes now meet it
  room.onDisconnect(leaver.id);
  eq(room.threshold(), 2, 'threshold recomputed to 2');
  eq(room.phase, 'playing', 'GUARD: no auto-execute on disconnect');
  ok(room.getPlayer(victim.id)!.alive, 'victim still alive after disconnect');
  ok(imp.role === 'imposter' && room.getPlayer(imp.id)!.alive, 'imposter still alive (no population end)');
  // a fresh vote now crosses the lowered threshold
  room.handleVote(livingOthers[0].id, victim.id);
  eq(room.phase, 'reveal', 'fresh vote executes');
}

// ============================================================
section('turns: timer expiry auto-passes, stroke advances');
{
  const { room, sched } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const first = room.currentTurnId!;
  sched.advance(20_000); // turn timer
  ok(room.currentTurnId !== first, 'turn advanced after timeout');
  // active player draws -> advances; non-active draw is rejected
  const active = room.currentTurnId!;
  const notActive = room.livingPlayers().find((p) => p.id !== active)!.id;
  ok(room.handleStroke(notActive, [{ x: 0.5, y: 0.5 }]) !== null, 'non-active draw rejected');
  eq(room.handleStroke(active, [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]), null, 'active draw accepted');
  eq(room.strokes.length, 1, 'stroke recorded');
  ok(room.currentTurnId !== active, 'turn advanced after stroke');
}

// ============================================================
section('scoring');
{
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const imp = imposters(room)[0];
  const survivingInnocents = innocents(room);
  voteOut(room, imp.id);
  room.handleGuessSkip(imp.id); // innocents win
  ok(survivingInnocents.every((p) => room.getPlayer(p.id)!.score === 1), 'surviving innocents +1');
  eq(room.getPlayer(imp.id)!.score, 0, 'caught imposter scores 0');
}
{
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const victim = innocents(room)[0];
  const imp = imposters(room)[0];
  voteOut(room, victim.id); // imposters win
  eq(room.getPlayer(imp.id)!.score, 1, 'imposter +1 on win');
}

// ============================================================
section("secret word is never on the imposter's view");
{
  // (redaction lives in views.ts; verify the room exposes role so views can redact)
  const { room } = makeRoom(4, 1);
  room.startRound(room.hostId);
  const imp = imposters(room)[0];
  ok(imp.role === 'imposter', 'imposter role set server-side');
  ok(typeof room.secretWord === 'string' && room.secretWord.length > 0, 'word lives on server only');
}

// ============================================================
section('rate limiter: token bucket');
{
  let clock = 0;
  const bucket = new TokenBucket(5, 10, () => clock); // cap 5, refill 10/sec
  let allowed = 0;
  for (let k = 0; k < 5; k++) if (bucket.take()) allowed++;
  eq(allowed, 5, 'first 5 within capacity allowed');
  ok(!bucket.take(), '6th over capacity blocked');
  clock += 100; // 0.1s -> +1 token
  ok(bucket.take(), 'one token refilled after 0.1s');
  ok(!bucket.take(), 'and immediately empty again');
  clock += 10_000; // long idle
  let burst = 0;
  for (let k = 0; k < 10; k++) if (bucket.take()) burst++;
  eq(burst, 5, 'refill is capped at capacity (no unbounded accrual)');
}

// ============================================================
// Integration: transport-level guards in server.ts. Boot a real server on an
// ephemeral port and drive it with a ws client.
async function integrationTests() {
  section('server guard: repeated create does not leak rooms');
  const { httpServer, manager } = createAppServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: any[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });

  const waitFor = (pred: () => boolean) =>
    new Promise<void>((resolve) => {
      const tick = () => (pred() ? resolve() : setTimeout(tick, 10));
      tick();
    });

  ws.send(JSON.stringify({ t: 'create', name: 'Host' }));
  await waitFor(() => messages.some((m) => m.t === 'joined'));
  eq(manager.size(), 1, 'one room after first create');

  // Second create on the same socket must be rejected, not leak a room.
  ws.send(JSON.stringify({ t: 'create', name: 'Host' }));
  await waitFor(() => messages.some((m) => m.t === 'error'));
  const err = messages.find((m) => m.t === 'error');
  eq(err.message, 'Already in a room.', 'second create rejected');
  eq(manager.size(), 1, 'GUARD: still one room (no leak)');

  // Disconnect cleans the room up.
  ws.close();
  await waitFor(() => manager.size() === 0);
  eq(manager.size(), 0, 'room cleaned up on disconnect');

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  // --- origin lock (the Cloudflare bypass guard) ---
  section('server guard: origin secret blocks Cloudflare bypass');
  process.env.ORIGIN_SECRET = 'test-secret';
  const srv2 = createAppServer();
  await new Promise<void>((resolve) => srv2.httpServer.listen(0, '127.0.0.1', resolve));
  const p2 = (srv2.httpServer.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${p2}`;

  const status = async (path: string, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, { headers });
    await r.text();
    return r.status;
  };
  eq(await status('/healthz'), 200, 'health check exempt (no header needed)');
  eq(await status('/'), 403, 'HTTP without secret is forbidden');
  eq(await status('/', { 'x-origin-secret': 'wrong' }), 403, 'wrong secret forbidden');
  eq(await status('/', { 'x-origin-secret': 'test-secret' }), 200, 'correct secret allowed');

  // WS upgrade without the secret must be rejected.
  const wsBlocked = new WebSocket(`ws://127.0.0.1:${p2}`);
  const blockedClosed = await new Promise<boolean>((resolve) => {
    wsBlocked.on('open', () => resolve(false)); // should NOT open cleanly
    wsBlocked.on('close', () => resolve(true));
    wsBlocked.on('error', () => resolve(true));
  });
  ok(blockedClosed, 'WS upgrade without secret is rejected');

  // WS upgrade WITH the secret connects.
  const wsOk = new WebSocket(`ws://127.0.0.1:${p2}`, { headers: { 'x-origin-secret': 'test-secret' } });
  const okOpened = await new Promise<boolean>((resolve) => {
    wsOk.on('open', () => resolve(true));
    wsOk.on('error', () => resolve(false));
  });
  ok(okOpened, 'WS upgrade with secret connects');
  wsOk.close();

  delete process.env.ORIGIN_SECRET;
  await new Promise<void>((resolve) => srv2.httpServer.close(() => resolve()));
}

// ============================================================
(async () => {
  await integrationTests();
  console.log(`\n${failed === 0 ? '✓ all green' : '✗ failures'}: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
