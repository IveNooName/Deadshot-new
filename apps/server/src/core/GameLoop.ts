import { Server } from 'socket.io';
import { WorldState, PlayerState } from '@deadshot/shared/src/types';

const TICK_RATE = 60;
const TICK_TIME = 1000 / TICK_RATE;

export class GameLoop {
  private roomId: string;
  private io: Server;
  private interval: NodeJS.Timeout | null = null;
  
  // Game State
  private tick: number = 0;
  private players: Record<string, PlayerState> = {};
  
  constructor(roomId: string, io: Server) {
    this.roomId = roomId;
    this.io = io;
  }

  public start() {
    if (this.interval) return;
    
    console.log(`Starting game loop for room: ${this.roomId}`);
    this.interval = setInterval(() => {
      this.update();
    }, TICK_TIME);
  }

  public stop() {
    if (this.interval) clearInterval(this.interval);
  }

  public addPlayer(id: string) {
    // Basic init state
    this.players[id] = {
      id,
      pos: [0, 5, 0],
      rot: [0, 0, 0, 1],
      vel: [0, 0, 0],
      hp: 100,
      state: 'IDLE',
      weaponIdx: 0
    };
    
    // Notify client of their own join
    // Note: We emit to the specific socket in the room
    this.io.to(this.roomId).emit('joined', this.players[id]);
  }

  public removePlayer(id: string) {
    delete this.players[id];
    this.io.to(this.roomId).emit('left', id);
  }

  private update() {
    this.tick++;

    // 1. Process Input Queues (To be implemented in Phase 3)
    
    // 2. Run Physics Step (To be implemented in Phase 3)

    // 3. Broadcast State
    // We don't send the full state every tick in production (too much bandwidth),
    // but for Phase 2/3 dev, we will to ensure sync.
    const worldState: WorldState = {
      tick: this.tick,
      players: this.players,
      events: [] // Snapshot events
    };

    this.io.to(this.roomId).emit('tick', worldState);
  }
}
