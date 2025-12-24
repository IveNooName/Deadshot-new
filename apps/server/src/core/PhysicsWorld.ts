import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  public world: CANNON.World;
  
  // Material for the ground and players to control friction
  private defaultMaterial: CANNON.Material;
  private defaultContactMaterial: CANNON.ContactMaterial;

  constructor() {
    this.world = new CANNON.World();
    
    // 1. Gravity (standard Earth gravity)
    this.world.gravity.set(0, -9.82, 0);

    // 2. Materials (prevent sliding like ice)
    this.defaultMaterial = new CANNON.Material('default');
    this.defaultContactMaterial = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.0, // Frictionless for FPS movement (we handle friction manually)
        restitution: 0.0, // No bouncing
      }
    );
    this.world.addContactMaterial(this.defaultContactMaterial);

    // 3. Create a static ground plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0, // Mass 0 = Static (immovable)
      material: this.defaultMaterial,
    });
    // Rotate plane to be flat (Cannon planes face +Z by default)
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
  }

  public step(dt: number) {
    this.world.step(1 / 60, dt, 3);
  }
}
