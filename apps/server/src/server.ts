import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './core/RoomManager';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev, restrict in prod
    methods: ["GET", "POST"]
  }
});

// Initialize the Game Manager
const roomManager = new RoomManager(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Game Server running on port ${PORT}`);
});
