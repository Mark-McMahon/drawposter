// Room registry: 6-digit codes -> Room, plus connection bookkeeping.

import { Room } from './room';

export class RoomManager {
  private rooms = new Map<string, Room>();

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  /** Number of live rooms (used to assert no room leak under abuse). */
  size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(): Room {
    const code = this.freshCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  delete(code: string) {
    const room = this.rooms.get(code);
    if (room) {
      room.dispose();
      this.rooms.delete(code);
    }
  }

  private freshCode(): string {
    let code = '';
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.rooms.has(code));
    return code;
  }
}
