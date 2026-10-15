/**
 * Structural + vehicle simulation.
 *
 * Model (see docs/PHYSICS.md): a pin-jointed truss solved with XPBD (extended position-based
 * dynamics) using many small substeps. Joints are point masses; members are distance
 * constraints with a compliance of L / EA (so stiffness k = EA / L). Cables are one-sided
 * (tension-only) constraints. Constraint multipliers give axial force: F = -lambda / h^2
 * (positive = tension, negative = compression). The vehicle is two wheel particles joined by
 * a rigid axle constraint; wheels collide with terrain segments and with drivable (road)
 * members, and contact corrections are distributed to the road's end joints by barycentric
 * weights, so the vehicle's weight loads the bridge and moves as it drives.
 */
import { MATERIALS, PHYSICS, VEHICLES } from '../config';
import { clamp, isFiniteNum } from '../math';
import type { BBeam, BNode, LevelDef, MaterialId, VehicleDef } from '../types';
import { groundHeightAt, terrainSegments, type Segment } from './terrain';

export interface SimNode { id: number; x: number; y: number; px: number; py: number; vx: number; vy: number; invMass: number; fixed: boolean }
export interface SimBeam {
  id: number; a: number; b: number; material: MaterialId;
  rest: number; len: number; compliance: number;
  tensionOnly: boolean; drivable: boolean; maxT: number; maxC: number; thickness: number;
  /** Frame-smoothed axial force (N): + tension, - compression. */
  force: number;
  /** |force| / limit, 0..>1 */
  util: number;
  damage: number;
  broken: boolean;
  lambda: number; forceAcc: number; contactLoad: number;
}
export interface SimWheel {
  x: number; y: number; px: number; py: number; vx: number; vy: number; invMass: number;
  spin: number;
  /** contact data for the current substep */
  contact: boolean; nx: number; ny: number; pen: number; beam: number; bt: number; terrain: boolean;
}

export type SimState = 'running' | 'won' | 'failed';
export type SimEvent =
  | { type: 'break'; beamId: number; x: number; y: number; material: MaterialId }
  | { type: 'splash'; x: number; y: number }
  | { type: 'win' }
  | { type: 'fail'; reason: string };

export class Simulation {
  nodes: SimNode[] = [];
  beams: SimBeam[] = [];
  wheels: [SimWheel, SimWheel];
  readonly vehicle: VehicleDef;
  readonly segments: Segment[];
  time = 0;
  state: SimState = 'running';
  failReason = '';
  events: SimEvent[] = [];
  peakUtil = 0;
  brokenCount = 0;
  numericError = false;
  /** Vehicle chassis visual state (suspension spring). */
  bodyOffset = 0;
  private bodyVel = 0;
  private lastVy = 0;
  stuckTimer = 0;
  flipTimer = 0;
  private splashed = false;
  private driveSpeed = 0;
  private braking = false;
  private nodeIndex = new Map<number, number>();

  constructor(public readonly level: LevelDef, nodes: BNode[], beams: BBeam[]) {
    this.vehicle = VEHICLES[level.vehicle];
    this.segments = terrainSegments(level.landmasses);
    this.build(nodes, beams);
    const v = this.vehicle;
    const mk = (x: number): SimWheel => {
      const gy = groundHeightAt(level.landmasses, x);
      const y = (gy === -Infinity ? 0 : gy) + v.wheelRadius + 0.02;
      const m = v.mass / 2;
      return { x, y, px: x, py: y, vx: 0, vy: 0, invMass: 1 / m, spin: 0, contact: false, nx: 0, ny: 1, pen: 0, beam: -1, bt: 0, terrain: false };
    };
    this.wheels = [mk(level.startX - v.wheelBase / 2), mk(level.startX + v.wheelBase / 2)];
  }

  private build(nodes: BNode[], beams: BBeam[]): void {
    const mass: number[] = [];
    nodes.forEach((n, i) => {
      this.nodeIndex.set(n.id, i);
      this.nodes.push({ id: n.id, x: n.x, y: n.y, px: n.x, py: n.y, vx: 0, vy: 0, invMass: 0, fixed: n.fixed });
      mass.push(0);
    });
    for (const bb of beams) {
      const ia = this.nodeIndex.get(bb.a), ib = this.nodeIndex.get(bb.b);
      if (ia === undefined || ib === undefined) continue;
      const m = MATERIALS[bb.material];
      const A = this.nodes[ia], B = this.nodes[ib];
      const L = Math.hypot(B.x - A.x, B.y - A.y);
      if (L < 1e-6) continue;
      mass[ia] += (m.density * L) / 2;
      mass[ib] += (m.density * L) / 2;
      this.beams.push({
        id: bb.id, a: ia, b: ib, material: bb.material, rest: L, len: L, compliance: L / m.ea,
        tensionOnly: m.maxCompression === 0, drivable: m.drivable, maxT: m.maxTension, maxC: m.maxCompression, thickness: m.thickness,
        force: 0, util: 0, damage: 0, broken: false, lambda: 0, forceAcc: 0, contactLoad: 0,
      });
    }
    this.nodes.forEach((n, i) => { n.invMass = n.fixed ? 0 : 1 / Math.max(PHYSICS.minNodeMass, mass[i]); });
  }

  /** Advance by one fixed frame (dt must be PHYSICS.fixedDt; callers accumulate real time). */
  step(dt: number = PHYSICS.fixedDt): void {
    if (this.numericError) return;
    const N = PHYSICS.subSteps;
    const h = dt / N;
    const gScale = clamp(this.time / PHYSICS.gravityRamp, 0, 1);
    const g = PHYSICS.gravity * gScale * gScale * (3 - 2 * gScale) || 0;
    const gAct = this.time >= PHYSICS.gravityRamp ? PHYSICS.gravity : g;

    const driving = this.state === 'running' && this.time >= PHYSICS.vehicleStartDelay;
    const targetSpeed = driving ? this.vehicle.speed : 0;
    // smooth throttle so the traction impulse is not instantaneous
    this.driveSpeed += clamp(targetSpeed - this.driveSpeed, -PHYSICS.brakeDeceleration * dt, PHYSICS.driveAcceleration * dt);
    this.braking = this.state !== 'running';

    for (const b of this.beams) { b.forceAcc = 0; b.contactLoad = 0; }
    const damp = Math.max(0, 1 - PHYSICS.linearDamping * h);
    const vmax = PHYSICS.maxSpeedClamp;

    for (let s = 0; s < N; s++) {
      // integrate
      for (const n of this.nodes) {
        if (n.fixed) continue;
        n.px = n.x; n.py = n.y;
        n.vy -= gAct * h;
        n.vx *= damp; n.vy *= damp;
        n.x += n.vx * h; n.y += n.vy * h;
      }
      for (const w of this.wheels) {
        w.px = w.x; w.py = w.y;
        w.vy -= gAct * h;
        w.x += w.vx * h; w.y += w.vy * h;
        w.contact = false; w.pen = 0; w.beam = -1; w.terrain = false;
      }
      for (const b of this.beams) b.lambda = 0;

      for (let it = 0; it < PHYSICS.iterations; it++) {
        this.solveBeams(h, it % 2 === 1);
        this.solveAxle();
        this.solveContacts();
      }

      // velocities
      for (const n of this.nodes) {
        if (n.fixed) continue;
        n.vx = clamp((n.x - n.px) / h, -vmax, vmax);
        n.vy = clamp((n.y - n.py) / h, -vmax, vmax);
      }
      for (const w of this.wheels) {
        w.vx = clamp((w.x - w.px) / h, -vmax, vmax);
        w.vy = clamp((w.y - w.py) / h, -vmax, vmax);
      }
      this.beamDamping(h);
      this.motor(h);
      for (const b of this.beams) if (!b.broken) b.forceAcc += -b.lambda / (h * h);
    }
    this.time += dt;
    this.afterStep(dt, N);
  }

  private solveBeams(h: number, reverse: boolean): void {
    const bs = this.beams, n = bs.length, nodes = this.nodes;
    const h2 = h * h;
    for (let k = 0; k < n; k++) {
      const b = bs[reverse ? n - 1 - k : k];
      if (b.broken) continue;
      const A = nodes[b.a], B = nodes[b.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      b.len = len;
      if (len < 1e-9) continue;
      const wsum = A.invMass + B.invMass;
      if (wsum === 0) continue;
      const alpha = b.compliance / h2;
      const C = len - b.rest;
      let dl = (-C - alpha * b.lambda) / (wsum + alpha);
      if (b.tensionOnly) {
        const nl = Math.min(0, b.lambda + dl); // lambda <= 0 means tension
        dl = nl - b.lambda;
      }
      b.lambda += dl;
      const nx = dx / len, ny = dy / len;
      A.x -= A.invMass * dl * nx; A.y -= A.invMass * dl * ny;
      B.x += B.invMass * dl * nx; B.y += B.invMass * dl * ny;
    }
  }

  private solveAxle(): void {
    const [w0, w1] = this.wheels;
    const dx = w1.x - w0.x, dy = w1.y - w0.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const C = len - this.vehicle.wheelBase;
    const wsum = w0.invMass + w1.invMass;
    const nx = dx / len, ny = dy / len;
    const s = C / wsum;
    w0.x += w0.invMass * s * nx; w0.y += w0.invMass * s * ny;
    w1.x -= w1.invMass * s * nx; w1.y -= w1.invMass * s * ny;
  }

  private solveContacts(): void {
    const r = this.vehicle.wheelRadius;
    const nodes = this.nodes;
    for (const w of this.wheels) {
      // terrain (static)
      for (const sg of this.segments) {
        const ex = sg.bx - sg.ax, ey = sg.by - sg.ay;
        const l2 = ex * ex + ey * ey;
        if (l2 < 1e-12) continue;
        const t = clamp(((w.x - sg.ax) * ex + (w.y - sg.ay) * ey) / l2, 0, 1);
        const cx = sg.ax + ex * t, cy = sg.ay + ey * t;
        const dx = w.x - cx, dy = w.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const pen = r - d;
        const nx = dx / d, ny = dy / d;
        w.x += nx * pen; w.y += ny * pen;
        if (pen > w.pen - 1e-9) { w.contact = true; w.nx = nx; w.ny = ny; w.pen = pen; w.beam = -1; w.terrain = true; }
      }
      // drivable beams
      for (let bi = 0; bi < this.beams.length; bi++) {
        const b = this.beams[bi];
        if (b.broken || !b.drivable) continue;
        const A = nodes[b.a], B = nodes[b.b];
        const ex = B.x - A.x, ey = B.y - A.y;
        const l2 = ex * ex + ey * ey;
        if (l2 < 1e-12) continue;
        const L = Math.sqrt(l2);
        let upx = -ey / L, upy = ex / L;
        if (upy < 0) { upx = -upx; upy = -upy; }
        if (upy < 0.5) continue;
        const side = (w.x - A.x) * upx + (w.y - A.y) * upy;
        if (side < -0.05) continue;
        const t = clamp(((w.x - A.x) * ex + (w.y - A.y) * ey) / l2, 0, 1);
        const cx = A.x + ex * t, cy = A.y + ey * t;
        const dx = w.x - cx, dy = w.y - cy;
        const d = Math.hypot(dx, dy);
        const R = r + b.thickness / 2;
        if (d >= R || d < 1e-9) continue;
        b.contactLoad = Math.max(b.contactLoad, (1 / w.invMass) * PHYSICS.gravity);
        const pen = R - d;
        const nx = dx / d, ny = dy / d;
        const wa = (1 - t) * (1 - t) * A.invMass, wb = t * t * B.invMass;
        const total = w.invMass + wa + wb;
        if (total <= 0) continue;
        const s = pen / total;
        w.x += nx * s * w.invMass; w.y += ny * s * w.invMass;
        A.x -= nx * s * (1 - t) * A.invMass; A.y -= ny * s * (1 - t) * A.invMass;
        B.x -= nx * s * t * B.invMass; B.y -= ny * s * t * B.invMass;
        if (pen > w.pen - 1e-9) { w.contact = true; w.nx = nx; w.ny = ny; w.pen = pen; w.beam = bi; w.bt = t; w.terrain = false; }
      }
    }
  }

  private beamDamping(h: number): void {
    const f = Math.min(0.5, PHYSICS.beamAxialDamping * h);
    for (const b of this.beams) {
      if (b.broken) continue;
      const A = this.nodes[b.a], B = this.nodes[b.b];
      const wsum = A.invMass + B.invMass;
      if (wsum === 0) continue;
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      if (b.tensionOnly && len < b.rest) continue; // slack cables exert no force, so no damping either
      const nx = dx / len, ny = dy / len;
      const vr = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      const j = (f * vr) / wsum;
      A.vx += A.invMass * j * nx; A.vy += A.invMass * j * ny;
      B.vx -= B.invMass * j * nx; B.vy -= B.invMass * j * ny;
    }
  }

  /** Drive / brake wheels along the contact tangent and react the traction into the road. */
  private motor(h: number): void {
    for (const w of this.wheels) {
      if (!w.contact || w.ny < 0.2) continue;
      const tx = w.ny, ty = -w.nx;
      let gvx = 0, gvy = 0;
      let A: SimNode | undefined, B: SimNode | undefined;
      if (w.beam >= 0) {
        const b = this.beams[w.beam];
        A = this.nodes[b.a]; B = this.nodes[b.b];
        gvx = A.vx * (1 - w.bt) + B.vx * w.bt;
        gvy = A.vy * (1 - w.bt) + B.vy * w.bt;
      }
      const vt = (w.vx - gvx) * tx + (w.vy - gvy) * ty;
      const grip = clamp((w.ny - PHYSICS.slopeNoGrip) / (PHYSICS.slopeFullGrip - PHYSICS.slopeNoGrip), 0, 1);
      const maxA = (this.braking ? PHYSICS.brakeDeceleration * 2 : PHYSICS.driveAcceleration * 1.5) * h * grip;
      const dv = clamp(this.driveSpeed - vt, -maxA, maxA);
      w.vx += tx * dv; w.vy += ty * dv;
      w.spin += (vt + dv) * h / this.vehicle.wheelRadius;
      if (A && B && PHYSICS.tractionReaction > 0) {
        const j = (dv / w.invMass) * PHYSICS.tractionReaction;
        A.vx -= tx * j * A.invMass * (1 - w.bt); A.vy -= ty * j * A.invMass * (1 - w.bt);
        B.vx -= tx * j * B.invMass * w.bt; B.vy -= ty * j * B.invMass * w.bt;
      }
    }
  }

  private afterStep(dt: number, substeps: number): void {
    // sanitise numerics
    for (const n of this.nodes) if (!isFiniteNum(n.x) || !isFiniteNum(n.y)) { this.numericError = true; }
    for (const w of this.wheels) if (!isFiniteNum(w.x) || !isFiniteNum(w.y)) { this.numericError = true; }
    if (this.numericError) { this.fail('numeric'); return; }

    const roadAdj = new Map<number, number[]>(), braced = new Set<number>(), nonRoadDegree = new Map<number, number>(), nonRoadStrength = new Map<number, number>(), cableNodes = new Set<number>();
    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i]; if (beam.broken) continue;
      if (beam.drivable) {
        roadAdj.set(beam.a, [...(roadAdj.get(beam.a) ?? []), i]);
        roadAdj.set(beam.b, [...(roadAdj.get(beam.b) ?? []), i]);
      } else {
        braced.add(beam.a); braced.add(beam.b);
        nonRoadDegree.set(beam.a, (nonRoadDegree.get(beam.a) ?? 0) + 1);
        nonRoadDegree.set(beam.b, (nonRoadDegree.get(beam.b) ?? 0) + 1);
        const supportStrength = Math.max(beam.maxT, beam.maxC);
        nonRoadStrength.set(beam.a, (nonRoadStrength.get(beam.a) ?? 0) + supportStrength);
        nonRoadStrength.set(beam.b, (nonRoadStrength.get(beam.b) ?? 0) + supportStrength);
        if (beam.material === 'cable') { cableNodes.add(beam.a); cableNodes.add(beam.b); }
      }
    }
    const spanLengths = new Map<number, number>(), visited = new Set<number>();
    for (let i = 0; i < this.beams.length; i++) {
      const first = this.beams[i]; if (!first.drivable || first.broken || visited.has(i)) continue;
      const component: number[] = [], componentNodes = new Set<number>(), queue = [i];
      visited.add(i); let spanLength = 0;
      while (queue.length) {
        const bi = queue.pop()!, road = this.beams[bi]; component.push(bi);
        componentNodes.add(road.a); componentNodes.add(road.b); spanLength += road.len;
        for (const n of [road.a, road.b]) {
          if (this.nodes[n].fixed || braced.has(n)) continue;
          for (const next of roadAdj.get(n) ?? []) if (!visited.has(next)) { visited.add(next); queue.push(next); }
        }
      }
      // A single low-strength brace must not make an entire road run immune to bending.
      // Multiple members, a cable stay, or one sufficiently strong support can brace a joint.
      const supported = [...componentNodes].some(n => !this.nodes[n].fixed &&
        (((roadAdj.get(n) ?? []).length >= 2 &&
          ((nonRoadDegree.get(n) ?? 0) >= 2 || (nonRoadStrength.get(n) ?? 0) >= 60000)) ||
          cableNodes.has(n)));
      if (!supported) for (const bi of component) spanLengths.set(this.beams[bi].id, spanLength);
    }

    const k = 1 - Math.exp(-dt / PHYSICS.forceSmoothing);
    for (const b of this.beams) {
      if (b.broken) continue;
      const f = b.forceAcc / substeps;
      b.force += (f - b.force) * k;
      const axialUtil = b.force >= 0 ? b.force / b.maxT : b.maxC > 0 ? -b.force / b.maxC : 0;
      // The pin-jointed solver does not model bending. Apply a bending proxy to unsupported
      // road spans, but leave members integrated into a braced truss to be judged by axial load.
      // Shorter unsupported spans naturally tolerate more load. This is a game approximation,
      // not a full beam-bending / finite-element solver.
      const spanLength = b.drivable ? spanLengths.get(b.id) ?? 0 : 0;
      const bendingCapacity = b.maxT * b.thickness * 0.6;
      const bendingUtil = b.drivable && b.contactLoad > 0 && bendingCapacity > 0
        ? (b.contactLoad * spanLength) / (4 * bendingCapacity) : 0;
      b.util = Math.max(axialUtil, bendingUtil);
      if (this.time > PHYSICS.gravityRamp) this.peakUtil = Math.max(this.peakUtil, b.util);
      if (b.util > 1) b.damage += dt / PHYSICS.overloadTime;
      else b.damage = Math.max(0, b.damage - dt * 0.5);
      if (b.damage >= 1) this.breakBeam(b);
    }

    // chassis suspension spring driven by vertical acceleration
    const [w0, w1] = this.wheels;
    const vy = (w0.vy + w1.vy) / 2;
    const ay = (vy - this.lastVy) / dt;
    this.lastVy = vy;
    const kS = 260, cS = 22;
    this.bodyVel += (-kS * this.bodyOffset - cS * this.bodyVel - ay * 0.012) * dt;
    this.bodyOffset = clamp(this.bodyOffset + this.bodyVel * dt, -0.2, 0.2);

    this.evaluateOutcome(dt);
  }

  private breakBeam(b: SimBeam): void {
    b.broken = true; b.lambda = 0; b.force = 0; b.util = 0;
    this.brokenCount++;
    const A = this.nodes[b.a], B = this.nodes[b.b];
    this.events.push({ type: 'break', beamId: b.id, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, material: b.material });
  }

  get rearWheel(): SimWheel { return this.wheels[0]; }
  get frontWheel(): SimWheel { return this.wheels[1]; }
  get vehicleAngle(): number {
    return Math.atan2(this.wheels[1].y - this.wheels[0].y, this.wheels[1].x - this.wheels[0].x);
  }
  get progress(): number {
    return clamp((this.wheels[0].x - this.level.startX) / (this.level.goalX - this.level.startX), 0, 1);
  }

  private fail(reason: string): void {
    if (this.state !== 'running') return;
    this.state = 'failed';
    this.failReason = reason;
    this.events.push({ type: 'fail', reason });
  }

  private evaluateOutcome(dt: number): void {
    if (this.state !== 'running') return;
    const [w0, w1] = this.wheels;
    for (const w of this.wheels) {
      if (!this.splashed && w.y < PHYSICS.waterY) {
        this.splashed = true;
        this.events.push({ type: 'splash', x: w.x, y: PHYSICS.waterY });
      }
      if (w.y < PHYSICS.killY) { this.fail('fell'); return; }
    }
    if (w0.x >= this.level.goalX && w0.terrain && w1.x >= this.level.goalX - 0.5) {
      this.state = 'won';
      this.events.push({ type: 'win' });
      return;
    }
    const speed = Math.abs(w0.vx + w1.vx) / 2;
    if (this.time > PHYSICS.vehicleStartDelay + 1 && speed < 0.08) this.stuckTimer += dt; else this.stuckTimer = 0;
    if (this.stuckTimer > PHYSICS.stuckTime) { this.fail('stuck'); return; }
    if (Math.abs(this.vehicleAngle) > PHYSICS.flipAngle) this.flipTimer += dt; else this.flipTimer = 0;
    if (this.flipTimer > PHYSICS.flipTime) { this.fail('flipped'); return; }
    if (this.time > PHYSICS.timeout) this.fail('timeout');
  }
}
