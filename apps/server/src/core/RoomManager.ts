import { Server, Socket } from 'socket.io';
import { GameLoop } from './GameLoop';

export class RoomManager {
  private io: Server;
  private games: Map<string, GameLoop> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.setupGlobalHandlers();
    
    // For now, auto-create a default 'FFA' room
    this.createRoom('default-room');
  }

  private setupGlobalHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Player connected: ${socket.id}`);

      // Auto-join the default room for Phase 2 testing
      this.joinRoom(socket, 'default-room');

      socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        // Logic to remove player from their specific game instance will go here
      });
    });
  }

  public createRoom(roomId: string) {
    if (this.games.has(roomId)) return;
    
    console.log(`Creating room: ${roomId}`);
    const game = new GameLoop(roomId, this.io);
    this.games.set(roomId, game);
    game.start();
  }

  public joinRoom(socket: Socket, roomId: string) {
    const game = this.games.get(roomId);
    if (!game) return;

    socket.join(roomId);
    game.addPlayer(socket.id);
  }
}
