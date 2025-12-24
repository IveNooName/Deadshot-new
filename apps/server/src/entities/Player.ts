import * as CANNON from 'cannon-es';
import { PlayerState, Inputs } from '@deadshot/shared/src/types';

export class Player {
  public id: string;
  public body: CANNON.Body;
  
  // Gameplay stats
  public hp: number = 100;
  public state: 'IDLE' | 'RUN' | 'JUMP' | 'DEAD' = 'IDLE';

  // Config
  private speed: number = 5;

  constructor(id: string, world: CANNON.World) {
    this.id = id;

    // Create Physics Body (Capsule approximation: A sphere for now)
    const radius = 0.5;
    const shape = new CANNON.Sphere(radius);
    
    this.body = new CANNON.Body({
      mass: 60, // 60kg player
      fixedRotation: true, // Prevent player from tipping over
      position: new CANNON.Vec3(0, 5, 0), // Spawn in air
      shape: shape
    });
    
    // Damping (Air resistance)
    this.body.linearDamping = 0.9;

    world.addBody(this.body);
  }

  // Process inputs received from client
  public processInput(input: Inputs) {
    if (this.state === 'DEAD') return;

    // Simple movement logic (Authortative)
    // We modify velocity directly for responsiveness
    
    const velocity = this.body.velocity;

    // Calculate forward/right vectors based on Yaw (Y-rotation)
    // input.yaw is in radians
    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw); // Check sign depending on coordinate system

    // Apply movement
    // Note: This is a simplified movement model.
    // In Phase 5 we will make this robust against speed hacks.
    if (input.y !== 0 || input.x !== 0) {
      this.state = 'RUN';
      this.body.velocity.x = (forwardX * input.y + rightX * input.x) * this.speed;
      this.body.velocity.z = (forwardZ * input.y + rightZ * input.x) * this.speed;
    } else {
      this.state = 'IDLE';
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
    }

    // Jump
    if (input.jump && Math.abs(velocity.y) < 0.1) {
      this.state = 'JUMP';
      this.body.velocity.y = 5;
    }
  }

  // Serialize for network transmission
  public getSnapshot(): PlayerState {
    return {
      id: this.id,
      pos: [this.body.position.x, this.body.position.y, this.body.position.z],
      rot: [this.body.quaternion.x, this.body.quaternion.y, this.body.quaternion.z, this.body.quaternion.w],
      vel: [this.body.velocity.x, this.body.velocity.y, this.body.velocity.z],
      hp: this.hp,
      state: this.state,
      weaponIdx: 0
    };
  }

  public destroy(world: CANNON.World) {
    world.removeBody(this.body);
  }
}
