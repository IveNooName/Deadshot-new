# Deadshot-new

## PHASE 1: THE BLUEPRINT

```
/project-deadshot-ultima
├── package.json (Workspaces: client, server, shared)
├── /packages
│   └── /shared
│       ├── package.json
│       ├── /src
│       │   ├── types.ts       (Socket events, Player interfaces)
│       │   ├── constants.ts   (Tick rate, physics config, map bounds)
│       │   └── weapons.ts     (Weapon stats: damage, recoil, fire rate)
├── /apps
│   ├── /server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── /src
│   │   │   ├── server.ts      (Entry point, Socket.io setup)
│   │   │   ├── /core
│   │   │   │   ├── GameLoop.ts    (Fixed timestep loop - 60Hz)
│   │   │   │   ├── World.ts       (Physics world instance - Rapier/Cannon)
│   │   │   │   └── RoomManager.ts (Lobby logic)
│   │   │   ├── /entities
│   │   │   │   ├── Player.ts      (Server-side player logic)
│   │   │   │   └── Projectile.ts  (Hitscan/Projectile logic)
│   │   │   ├── /systems
│   │   │   │   └── InputQueue.ts  (Buffer for client inputs)
│   │   │   └── /utils
│   │   │       └── SupabaseAdmin.ts (Admin privileges)
│   └── /client
│       ├── package.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── /src
│       │   ├── /assets        (GLB models, textures)
│       │   ├── /components    (React UI: HUD, Menu, Leaderboard)
│       │   ├── /game
│       │   │   ├── /engine    (R3F Canvas, Physics sync)
│       │   │   ├── /controllers (Input handling, WASD)
│       │   │   ├── /network   (Socket manager, interpolation logic)
│       │   │   └── /state     (Zustand stores: useAuth, useGame)
│       │   ├── App.tsx
│       │   └── main.tsx
```

#### 2\. Implementation Roadmap

Do not deviate from this order. Frontend visuals mean nothing if the backend loop isn't stable.

1.  **Phase 2: The Heartbeat**
    *   Initialize the Monorepo.
    *   Setup `apps/server` with a 60Hz `setInterval` loop.
    *   Implement the `packages/shared` types.
    *   Create the basic Socket.io entry point handling connections and disconnection.
2.  **Phase 3: The Physics & Movement (Hardest Part)**
    *   Integrate `cannon-es` (or Rapier) on the SERVER.
    *   Implement Client-Side Prediction (Client moves immediately).
    *   Implement Server Reconciliation (Server corrects Client if they drift).
    *   _Result:_ A red cube moving on a gray plane that feels instant but is secure.
3.  **Phase 4: Visuals & R3F**
    *   Setup React Three Fiber in `apps/client`.
    *   Map the `PlayerState` to a visual model (Capsule or GLB).
    *   Implement the Camera Controller (First Person).
4.  **Phase 5: Combat & Netcode**
    *   Implement Raycasting on the Server (verify hits).
    *   Implement Lag Compensation (Rollback world state to when the player shot).
    *   Add Health/Death logic.
5.  **Phase 6: The "Studio" Features**
    *   Supabase Integration (Login/Sign up).
    *   Lobby/Room creation logic.
    *   Leaderboards and UI overlay.

**Action Required:** Confirm you have reviewed this blueprint. If approved, I will begin **Phase 2** (Server Setup & Core Loop) in the next response. Note that I will generate the code assuming you have created the folders `server`, `client`, and `shared`.



---
Powered by [Gemini Exporter](https://www.ai-chat-exporter.com)


```bash 
npm run dev:server
```
