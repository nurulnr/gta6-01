// Mara Solis on foot: a simple stylised figure with swinging limbs, walk and
// run speeds, a punch, and getting in and out of cars. The same figure
// builder makes the pedestrians, so the whole city shares one look.
import * as THREE from 'three';
import { clamp } from './random.js';

export function makePedMesh(shirtColor, skinColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor ?? 0xc98a5a });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x1a1210 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), hairMat);
  hair.position.y = 1.74;
  hair.scale.set(1, 0.7, 1);
  g.add(hair);

  // Legs and arms pivot at the top: each geometry is translated down so the
  // mesh origin sits at the hip / shoulder and rotation.x swings the limb.
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.26), pants);
  legL.geometry.translate(0, -0.36, 0);
  legL.position.set(-0.16, 0.72, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legL);
  g.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.geometry.translate(0, -0.28, 0);
  armL.position.set(-0.42, 1.42, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armL);
  g.add(armR);

  g.userData = { legL, legR, armL, armR, head, torso };
  return g;
}

export class Player {
  constructor(scene) {
    // Mara: red jacket, easy to spot in a crowd.
    this.mesh = makePedMesh(0xff5a3c, 0xc98a5a);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.onFoot = true;
    this.car = null;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.walkPhase = 0;
    this.radius = 0.55;
  }

  reset(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading ?? 0;
    this.health = 100;
    this.onFoot = true;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // axes: {x: strafe, y: forward}, measured against the camera yaw; run is
  // Shift. The figure turns toward its travel direction and its limbs swing.
  walk(axes, run, cameraYaw, dt) {
    const targetSpeed = run ? 8.5 : 4.2;
    const moving = Math.abs(axes.x) > 0.01 || Math.abs(axes.y) > 0.01;
    if (moving) {
      // Forward is -Z of the camera yaw; right is forward rotated -90° about Y.
      const fx = -Math.sin(cameraYaw);
      const fz = -Math.cos(cameraYaw);
      const rx = -fz;
      const rz = fx;
      const dx = fx * axes.y + rx * axes.x;
      const dz = fz * axes.y + rz * axes.x;
      const len = Math.hypot(dx, dz) || 1;
      this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
      this.pos.x += (dx / len) * this.speed * dt;
      this.pos.z += (dz / len) * this.speed * dt;
      const want = Math.atan2(dx, dz);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 12);
      this.walkPhase += this.speed * dt * 1.6;
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 10);
    }
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      // The right arm snaps forward through the punch.
      u.armR.rotation.x = -1.6 * Math.sin((this.punchTimer / 0.28) * Math.PI);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  punch() {
    if (this.punchCooldown > 0) return false;
    this.punchTimer = 0.28;
    this.punchCooldown = 0.45;
    return true;
  }

  enterCar(car) {
    this.car = car;
    this.onFoot = false;
    this.mesh.visible = false;
    car.stolen = true;
    car.playerDriven = true;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.playerDriven = false;
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    // Step out on the driver's side, clear of the car body.
    const side = Math.cos(car.heading) >= 0 ? 1 : -1;
    this.pos.set(
      car.pos.x + Math.cos(car.heading) * 2.6 * side,
      0,
      car.pos.z - Math.sin(car.heading) * 2.6 * side,
    );
    this.heading = car.heading;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Returns true when the hit puts Mara down.
  hurt(amount) {
    this.health = clamp(this.health - amount, 0, 100);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, 100);
  }
}
