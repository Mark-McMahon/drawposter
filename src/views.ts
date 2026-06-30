// Builds the redacted state snapshot for a single recipient.
// CRITICAL: the imposter's client must never receive the secret word until the
// end-of-round reveal — that's the whole point of server-authoritative state.

import { Room } from './room';
import { categoryNames } from './words';
import { PlayerView, SelfView, StateView } from './types';

/** Returns [counts-per-target, validVote-per-voter] using only living players. */
function tallyViews(room: Room): { counts: Map<string, number>; validVote: Map<string, string> } {
  const counts = new Map<string, number>();
  const validVote = new Map<string, string>();
  for (const p of room.players) counts.set(p.id, 0);
  for (const [voterId, targetId] of room.votes) {
    const v = room.getPlayer(voterId);
    const t = room.getPlayer(targetId);
    if (!v || !v.alive || !v.connected) continue;
    if (!t || !t.alive || !t.connected) continue;
    validVote.set(voterId, targetId);
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }
  return { counts, validVote };
}

export function buildStateView(room: Room, recipientId: string): StateView {
  const me = room.getPlayer(recipientId);
  const revealing = room.phase === 'reveal';
  const { counts, validVote } = tallyViews(room);

  const players: PlayerView[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isHost: p.isHost,
    connected: p.connected,
    alive: p.alive,
    role: revealing ? p.role : null, // roles only public at reveal
    votesReceived: counts.get(p.id) ?? 0,
    votingFor: validVote.get(p.id) ?? null,
    score: p.score,
  }));

  const amImposter = me?.role === 'imposter';
  const self: SelfView = {
    id: recipientId,
    isHost: me?.isHost ?? false,
    role: me?.role ?? null, // you always know your own role
    // innocents (and everyone at reveal) get the word; imposters never do mid-round
    word: revealing ? room.secretWord : amImposter ? null : me?.role ? room.secretWord : null,
    decoy: amImposter && room.settings.decoy && !revealing ? room.decoyWord : null,
    category: amImposter && room.settings.hint && !revealing ? room.category : null,
    alive: me?.alive ?? false,
  };

  return {
    t: 'state',
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    settings: room.settings,
    self,
    players,
    strokes: room.strokes,
    currentTurnId: room.currentTurnId,
    turnEndsAt: room.turnEndsAt,
    livingCount: room.livingPlayers().length,
    threshold: room.threshold(),
    guessingId: room.guessingId,
    result: room.result,
    revealStrokes: room.revealStrokes,
    allCategories: categoryNames(),
  };
}
