// --- NETWORKING ---

export interface Inputs {
  seq: number;       // Sequence number for reconciliation
  x: number;         // x-axis movement (1, 0, -1)
  y: number;         // z-axis movement (forward/back)
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  shoot: boolean;
  yaw: number;       // Camera angle Y
  pitch: number;     // Camera angle X
  dt: number;        // Delta time since last frame
}

export interface PlayerState {
  id: string;
  pos: [number, number, number]; // Array is smaller than {x,y,z} for JSON
  rot: [number, number, number, number]; // Quaternion
  vel: [number, number, number];
  hp: number;
  state: 'IDLE' | 'RUN' | 'JUMP' | 'DEAD';
  weaponIdx: number;
}

export interface WorldState {
  tick: number;
  players: Record<string, PlayerState>;
  events: GameEvent[]; // Instant events (shots, hits)
}

// --- WEAPONS ---

export interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  fireRate: number; // ms between shots
  spread: number;
  range: number;
  ammoCapacity: number;
  reloadTime: number;
}

// --- SOCKET EVENTS MAP ---

export interface ServerToClientEvents {
  init: (data: { id: string; state: WorldState }) => void;
  tick: (data: WorldState) => void;
  joined: (player: PlayerState) => void;
  left: (id: string) => void;
  killed: (data: { killer: string; victim: string }) => void;
}

export interface ClientToServerEvents {
  join: (data: { token?: string; name?: string }) => void; // Token for auth users
  input: (data: Inputs) => void;
  ping: (fn: (serverTime: number) => void) => void; // Latency check
}
