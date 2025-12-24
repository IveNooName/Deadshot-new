import { Server, Socket } from 'socket.io';
import { WorldState, Inputs } from '@deadshot/shared/src/types';
import { PhysicsWorld } from './PhysicsWorld';
import { Player } from '../entities/Player';

const TICK_RATE = 60;
const TICK_TIME = 1000 / TICK_RATE;

export class GameLoop {
  private roomId: string;
  private io: Server;
  private interval: NodeJS.Timeout | null = null;
  
  // Sub-systems
  private physics: PhysicsWorld;
  private players: Map<string, Player> = new Map();
  
  // State
  private tickCount: number = 0;
  
  constructor(roomId: string, io: Server) {
    this.roomId = roomId;
    this.io = io;
    this.physics = new PhysicsWorld();
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

  public addPlayer(socketId: string) {
    const player = new Player(socketId, this.physics.world);
    this.players.set(socketId, player);
    
    // Tell everyone a new player exists
    this.io.to(this.roomId).emit('joined', player.getSnapshot());

    // Listen for inputs specifically from this player
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
        socket.on('input', (data: Inputs) => {
            if (this.players.has(socketId)) {
                this.players.get(socketId)!.processInput(data);
            }
        });
    }
  }

  public removePlayer(id: string) {
    const player = this.players.get(id);
    if (player) {
      player.destroy(this.physics.world);
      this.players.delete(id);
      this.io.to(this.roomId).emit('left', id);
    }
  }

  private update() {
    this.tickCount++;

    // 1. Step Physics
    // We advance the physics world by the delta time
    this.physics.step(TICK_TIME / 1000);

    // 2. Prepare Network Snapshot
    const serializedPlayers: Record<string, any> = {};
    
    this.players.forEach((player) => {
      // Check if player fell off map
      if (player.body.position.y < -10) {
        player.body.position.set(0, 5, 0); // Respawn
        player.body.velocity.set(0,0,0);
      }
      serializedPlayers[player.id] = player.getSnapshot();
    });

    const worldState: WorldState = {
      tick: this.tickCount,
      players: serializedPlayers,
      events: []
    };

    // 3. Broadcast to Room
    // Volatile means "if the client misses this packet, don't retry".
    // This reduces latency for real-time movement.
    this.io.to(this.roomId).volatile.emit('tick', worldState);
  }
}
