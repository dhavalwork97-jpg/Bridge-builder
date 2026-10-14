import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide, DynamicDrawUsage,
  Euler, Float32BufferAttribute, Fog, Group, HemisphereLight, InstancedMesh, Material, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PCFShadowMap, PlaneGeometry, Quaternion, Scene, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace,
  Sprite, SpriteMaterial, Vector3, WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MATERIALS, PHYSICS, VEHICLES } from '../config';
import { mixColor, rng } from '../math';
import { groundHeightAt } from '../sim/terrain';
import type { StageCamera } from '../game/stagecamera';
import type { LevelDef, VehicleDef, Vec2 } from '../types';
import { PALETTES, type Palette } from './palette';
import { heatColor, stressTint, type DrawBeam } from './entities';

/**
 * 2.5D world renderer. The simulation stays 2D in the plane z = 0; this class only draws it with depth:
 * extruded terrain, a two-plane truss with a wide deck, 3D vehicles, lighting, soft shadows, parallax scenery.
 * Nothing here feeds back into the simulation.
 */

// ---- depth layout (metres, plane z = 0 is the simulation plane) ----
const DECK_HALF = 0.95;       // road deck half-width
const TRUSS_Z = 1.1;          // structural members run in planes z = +/- TRUSS_Z
const TERRAIN_BACK = -6, TERRAIN_FRONT = 3.6;
const TERRAIN_FLOOR = -18;

const Z = new Vector3(0, 0, 1);
const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3(), _m = new Matrix4(), _c = new Color(), _e = new Euler();

export interface VehiclePose { x: number; y: number; angle: number; bodyOffset: number; spinRear: number; spinFront: number }
export interface StageNode { x: number; y: number; kind: 'anchor' | 'junction' }

class Inst {
  readonly mesh: InstancedMesh;
  n = 0;
  constructor(geo: BufferGeometry, mat: Material, private cap: number, shadow = true) {
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.instanceColor!.setUsage(DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow; this.mesh.receiveShadow = true;
  }
  reset(): void { this.n = 0; }
  add(m: Matrix4, color: Color): void {
    if (this.n >= this.cap) return;
    this.mesh.setMatrixAt(this.n, m); this.mesh.setColorAt(this.n, color); this.n++;
  }
  flush(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Matrix for a unit box stretched along a segment. `nOff` shifts the box sideways (perpendicular, to the left of A->B). */
function segBox(ax: number, ay: number, bx: number, by: number, thick: number, depth: number, zc: number, nOff = 0): Matrix4 {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-3;
  _p.set((ax + bx) / 2 - (dy / len) * nOff, (ay + by) / 2 + (dx / len) * nOff, zc);
  _q.setFromAxisAngle(Z, Math.atan2(dy, dx));
  _s.set(len, thick, depth);
  return _m.compose(_p, _q, _s);
}
/** Matrix for a unit cylinder (radius 1, height 1, axis +y) stretched along a segment. */
function segCyl(ax: number, ay: number, bx: number, by: number, radius: number, zc: number): Matrix4 {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-3;
  _p.set((ax + bx) / 2, (ay + by) / 2, zc);
  _q.setFromAxisAngle(Z, Math.atan2(dy, dx) - Math.PI / 2);
  _s.set(radius, len, radius);
  return _m.compose(_p, _q, _s);
}
function place(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotZ = 0, rotX = 0): Matrix4 {
  _p.set(x, y, z); _q.setFromEuler(_e.set(rotX, 0, rotZ)); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

function gradientTexture(top: string, bottom: string): CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, top); g.addColorStop(0.8, bottom); g.addColorStop(1, bottom);
  c.fillStyle = g; c.fillRect(0, 0, 4, 256);
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}
function radialTexture(inner: string, outer: string, size = 128): CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.3, inner); g.addColorStop(1, outer);
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}
function cloudTexture(): CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d')!;
  for (const [x, y, r] of [[70, 74, 40], [118, 56, 50], [170, 70, 44], [120, 84, 46], [205, 82, 28], [40, 84, 26]]) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.65, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}

/** Vertex-coloured, extruded landmass: front/back caps, grass top, end walls, with rock strata. */
function landmassGeometry(top: Vec2[], p: Palette, seed: number): BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [], idx: number[] = [];
  const r = rng(seed);
  const depths = [0, 0.5, 0.68, 2, 3.4, 5, 7, 9.5, 12, 16, 40];
  const rowColor = depths.map((_d, i) => {
    if (i === 0) return new Color(p.grassLight);
    if (i === 1) return new Color(p.grass);
    if (i === 2) return new Color('#6b4a2f');
    const base = new Color(p.rock).lerp(new Color(p.rockDark), Math.min(1, (i - 2) / 7));
    return base.multiplyScalar(i % 2 ? 0.93 : 1.04 + r() * 0.03);
  });
  const rowY = (j: number, i: number) => Math.max(TERRAIN_FLOOR, top[j].y - depths[i]);
  const n = top.length, R = depths.length;
  const addFace = (z: number, nz: number, flip: boolean) => {
    const base = pos.length / 3;
    for (let j = 0; j < n; j++) for (let i = 0; i < R; i++) {
      pos.push(top[j].x, rowY(j, i), z); nor.push(0, 0, nz);
      const c = rowColor[i]; col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < R - 1; i++) {
      const a = base + j * R + i, b = base + (j + 1) * R + i, c = base + (j + 1) * R + i + 1, d = base + j * R + i + 1;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
  };
  addFace(TERRAIN_FRONT, 1, true);
  addFace(TERRAIN_BACK, -1, false);
  // grass top ribbon
  {
    const base = pos.length / 3;
    for (let j = 0; j < n; j++) {
      const a = top[Math.max(0, j - 1)], b = top[Math.min(n - 1, j + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      for (const z of [TERRAIN_BACK, TERRAIN_FRONT]) {
        pos.push(top[j].x, top[j].y, z); nor.push(-dy / l, dx / l, 0);
        const c = rowColor[0]; col.push(c.r * 0.98, c.g * 0.98, c.b * 0.98);
      }
    }
    for (let j = 0; j < n - 1; j++) { const a = base + j * 2, b = base + (j + 1) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  // end walls (faces toward the gap)
  const wall = (j: number, nx: number) => {
    const base = pos.length / 3;
    for (const z of [TERRAIN_BACK, TERRAIN_FRONT]) for (let i = 0; i < R; i++) {
      pos.push(top[j].x, rowY(j, i), z); nor.push(nx, 0, 0);
      const c = i < 2 ? rowColor[2] : rowColor[i]; col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < R - 1; i++) {
      const a = base + i, b = base + i + 1, c = base + R + i + 1, d = base + R + i;
      if (nx > 0) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
    }
  };
  wall(0, -1); wall(n - 1, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Road surface laid on a landmass top: asphalt ribbon plus dashed centre line. */
function approachRoad(top: Vec2[]): { road: BufferGeometry; dashes: BufferGeometry } {
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j < top.length; j++) { pos.push(top[j].x, top[j].y + 0.03, -DECK_HALF, top[j].x, top[j].y + 0.03, DECK_HALF); }
  for (let j = 0; j < top.length - 1; j++) { const a = j * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const road = new BufferGeometry(); road.setAttribute('position', new Float32BufferAttribute(pos, 3)); road.setIndex(idx); road.computeVertexNormals();
  const dp: number[] = [], di: number[] = [];
  let acc = 0;
  for (let j = 0; j < top.length - 1; j++) {
    const a = top[j], b = top[j + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = 0; s < L; s += 0.25) {
      const phase = (acc + s) % 0.9;
      if (phase > 0.5 || s + 0.25 > L) continue;
      const t0 = s / L, t1 = Math.min(1, (s + 0.25) / L);
      const x0 = a.x + (b.x - a.x) * t0, y0 = a.y + (b.y - a.y) * t0 + 0.05, x1 = a.x + (b.x - a.x) * t1, y1 = a.y + (b.y - a.y) * t1 + 0.05;
      const k = dp.length / 3;
      dp.push(x0, y0, -0.05, x0, y0, 0.05, x1, y1, -0.05, x1, y1, 0.05); di.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    acc += L;
  }
  const dashes = new BufferGeometry(); dashes.setAttribute('position', new Float32BufferAttribute(dp, 3)); dashes.setIndex(di); dashes.computeVertexNormals();
  return { road, dashes };
}

export class Stage3D {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private level: LevelDef | null = null;
  private levelGroup = new Group();
  private dyn = new Group();
  private disposables: { dispose(): void }[] = [];
  private sun = new DirectionalLight('#fff4e0', 2.0);
  private hemi = new HemisphereLight('#bfdcff', '#7a6a55', 0.95);
  private water: Mesh | null = null;
  private waterBase: Float32Array | null = null;
  private flag: Mesh | null = null;
  private clouds: { s: Sprite; v: number; x0: number }[] = [];
  private center = 0;

  // dynamic structure
  private road!: Inst; private dash!: Inst; private wood!: Inst; private steel!: Inst; private cable!: Inst;
  private spheres!: Inst; private rods!: Inst; private anchors!: Inst;
  private vehicleGroup: Group | null = null;
  private wheels: Group[] = [];
  private chassis: Group | null = null;
  private vehicleKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.add(this.levelGroup, this.dyn, this.hemi, this.sun, this.sun.target, new AmbientLight('#ffffff', 0.08));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.buildDynamic();
  }

  private buildDynamic(): void {
    const box = new BoxGeometry(1, 1, 1), cyl = new CylinderGeometry(1, 1, 1, 10), sph = new SphereGeometry(1, 14, 10);
    const std = (color = '#ffffff', rough = 0.7, metal = 0.0) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.road = new Inst(box, std('#ffffff', 0.85), 260);
    this.dash = new Inst(box, new MeshStandardMaterial({ color: '#f2c94c', roughness: 0.6, emissive: '#3a3000' }), 2800, false);
    this.wood = new Inst(box, std('#ffffff', 0.9), 520);
    this.steel = new Inst(box, std('#ffffff', 0.35, 0.65), 520);
    this.cable = new Inst(cyl, std('#ffffff', 0.5, 0.3), 3000);
    this.spheres = new Inst(sph, std('#ffffff', 0.4, 0.2), 1000);
    this.rods = new Inst(cyl, std('#9aa3ad', 0.5, 0.5), 500);
    this.anchors = new Inst(cyl, std('#ffcf4a', 0.45, 0.35), 120);
    for (const i of [this.road, this.dash, this.wood, this.steel, this.cable, this.spheres, this.rods, this.anchors]) this.dyn.add(i.mesh);
  }

  resize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(w, h, false);
  }

  // ------------------------------------------------------------------ level scenery
  setLevel(level: LevelDef): void {
    if (this.level?.id === level.id) return;
    this.level = level;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.levelGroup.clear();
    this.clouds = []; this.water = null; this.flag = null;
    const p: Palette = PALETTES[level.tier];
    const track = <T extends { dispose(): void }>(o: T): T => { this.disposables.push(o); return o; };
    const add = (m: Mesh | Sprite | Group) => { this.levelGroup.add(m); return m; };
    const lm = level.landmasses;
    const xMin = lm[0].top[0].x, xMax = lm[lm.length - 1].top[lm[lm.length - 1].top.length - 1].x;
    this.center = (xMin + xMax) / 2;
    const r = rng(level.id * 977);

    // sky + atmosphere
    this.scene.background = track(gradientTexture(p.skyTop, p.skyBottom));
    this.scene.fog = new Fog(p.skyBottom, 90, 330);
    this.hemi.color.set(mixColor(p.skyTop, '#ffffff', 0.55));
    this.hemi.groundColor.set(p.rockDark);
    this.sun.color.set(mixColor(p.sun, '#ffffff', 0.6));

    const sunTex = track(radialTexture(p.sun, p.sun + '00', 256));
    const sunSprite = new Sprite(track(new SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false })));
    sunSprite.position.set(this.center - 40 + r() * 60, 30, -170); sunSprite.scale.set(130, 130, 1);
    add(sunSprite);

    // parallax mountain ranges
    const range = (zBack: number, base: number, amp: number, color: string, seed: number) => {
      const rr = rng(seed), pts: number[] = [];
      for (let i = 0; i <= 14; i++) pts.push(rr());
      const sh = new Shape(); const w = 520, x0 = this.center - w / 2;
      sh.moveTo(x0, base - 40);
      for (let x = 0; x <= w; x += 6) {
        const t = (x / w) * 14, i = Math.floor(t), f = t - i;
        const v = pts[i] * (1 - f) + pts[Math.min(14, i + 1)] * f;
        sh.lineTo(x0 + x, base + v * amp + Math.abs(Math.sin(x * 0.03 + seed)) * amp * 0.12);
      }
      sh.lineTo(x0 + w, base - 40); sh.closePath();
      const m = new Mesh(track(new ShapeGeometry(sh)), track(new MeshBasicMaterial({ color })));
      m.position.z = zBack; return add(m);
    };
    range(-150, -12, 70, p.mtnFar, level.id + 3);
    range(-95, -14, 46, p.mtnNear, level.id + 11);
    // rolling hills just behind the terrain
    range(-40, -13, 9, p.hill, level.id + 21);

    // clouds
    const cloudMat = track(new SpriteMaterial({ map: track(cloudTexture()), transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(cloudMat);
      const sc = 24 + r() * 26;
      s.scale.set(sc * 2, sc, 1);
      const x0 = this.center - 140 + r() * 280;
      s.position.set(x0, 20 + r() * 26, -70 - r() * 60);
      this.clouds.push({ s, v: 0.6 + r() * 1.4, x0 }); add(s);
    }

    // terrain
    const terrainMat = track(new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    lm.forEach((l, i) => {
      const g = track(landmassGeometry(l.top, p, level.id * 13 + i));
      const m = new Mesh(g, terrainMat); m.castShadow = true; m.receiveShadow = true; add(m);
    });
    const roadMat = track(new MeshStandardMaterial({ color: '#3d424c', roughness: 0.9 }));
    const dashMat = track(new MeshStandardMaterial({ color: '#f2c94c', roughness: 0.7, side: DoubleSide }));
    for (const l of [lm[0], lm[lm.length - 1]]) {
      const { road, dashes } = approachRoad(l.top);
      const rm = new Mesh(track(road), roadMat); rm.receiveShadow = true; add(rm);
      const dm = new Mesh(track(dashes), dashMat); dm.receiveShadow = true; add(dm);
    }

    // trees (behind and beside the road)
    const treeTrunk = track(new MeshStandardMaterial({ color: '#6b4a2f', roughness: 1 }));
    const trunkGeo = track(new CylinderGeometry(0.12, 0.18, 1.2, 6)), coneGeo = track(new CylinderGeometry(0, 1, 1, 8));
    const leaf = [track(new MeshStandardMaterial({ color: '#2e8b45', roughness: 0.9, flatShading: true })), track(new MeshStandardMaterial({ color: '#3aa655', roughness: 0.9, flatShading: true }))];
    const treeAt = (x: number, z: number) => {
      const gy = groundHeightAt(lm, x); if (gy === -Infinity) return;
      const sc = 0.8 + r() * 0.8, g = new Group();
      const t = new Mesh(trunkGeo, treeTrunk); t.position.y = 0.6; g.add(t);
      for (let k = 0; k < 3; k++) {
        const c = new Mesh(coneGeo, leaf[k % 2]); c.scale.set(0.95 - k * 0.15, 1.5 - k * 0.15, 0.95 - k * 0.15); c.position.y = 1.5 + k * 0.85; c.castShadow = true; g.add(c);
      }
      g.scale.setScalar(sc); g.position.set(x, gy, z); g.castShadow = true; add(g);
    };
    const first = lm[0].top, last = lm[lm.length - 1].top;
    for (let i = 0; i < 9; i++) {
      treeAt(first[0].x + 0.5 + r() * 14, -2.2 - r() * 3);
      treeAt(last[last.length - 1].x - 0.5 - r() * 14, -2.2 - r() * 3);
    }
    for (let i = 0; i < 3; i++) { treeAt(first[0].x + 2 + r() * 8, 2.4 + r() * 0.8); treeAt(last[last.length - 1].x - 2 - r() * 8, 2.4 + r() * 0.8); }

    // goal flag
    const gx = level.goalX + 1.5, gy = groundHeightAt(lm, level.goalX);
    const pole = new Mesh(track(new CylinderGeometry(0.06, 0.06, 3.4, 8)), track(new MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.4, roughness: 0.4 })));
    pole.position.set(gx, gy + 1.7, 1.5); pole.castShadow = true; add(pole);
    const clothGeo = track(new PlaneGeometry(1.7, 0.95, 10, 1));
    const cloth = new Mesh(clothGeo, track(new MeshStandardMaterial({ color: '#e8453c', roughness: 0.8, side: DoubleSide })));
    cloth.position.set(gx + 0.85, gy + 2.85, 1.5); cloth.castShadow = true; this.flag = cloth; add(cloth);

    // pylons for aerial anchors
    for (const a of level.anchors) {
      const g2 = groundHeightAt(lm, a.x);
      if (g2 === -Infinity || a.y <= g2 + 1) continue;
      this.pylon(a.x, g2, a.y, track, add);
    }

    // water (volume + animated surface)
    const waterDeep = track(new MeshStandardMaterial({ color: p.waterDeep, transparent: true, opacity: 0.95, roughness: 0.3 }));
    const body = new Mesh(track(new BoxGeometry(700, 14, 70)), waterDeep);
    body.receiveShadow = false;
    body.position.set(this.center, PHYSICS.waterY - 7, -10); add(body);
    const surfGeo = track(new PlaneGeometry(700, 70, 140, 10));
    surfGeo.rotateX(-Math.PI / 2);
    const surf = new Mesh(surfGeo, track(new MeshBasicMaterial({ color: p.water, transparent: true, opacity: 0.42, depthWrite: false })));
    surf.position.set(this.center, PHYSICS.waterY + 0.02, -10); surf.receiveShadow = false; this.water = surf; add(surf);
    this.waterBase = (surfGeo.attributes.position.array as Float32Array).slice();

    // shadow camera framing
    const half = (xMax - xMin) / 2 + 6;
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
    this.sun.position.set(this.center - 28, 46, 40);
    this.sun.target.position.set(this.center, 0, 0);
    this.sun.target.updateMatrixWorld();

    this.setVehicleModel(VEHICLES[level.vehicle]);
  }

  private pylon(x: number, gy: number, ay: number, track: <T extends { dispose(): void }>(o: T) => T, add: (m: Mesh | Sprite | Group) => unknown): void {
    const mat = track(new MeshStandardMaterial({ color: '#69727f', metalness: 0.6, roughness: 0.45 }));
    const geo = track(new CylinderGeometry(1, 1, 1, 6));
    const strut = (a: Vector3, b: Vector3, rad: number) => {
      const d = new Vector3().subVectors(b, a), m = new Mesh(geo, mat);
      m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(rad, d.length(), rad);
      m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()); m.castShadow = true; add(m);
    };
    const wB = 0.75, zB = 1.3, wT = 0.18, zT = 0.5;
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [new Vector3(x + sx * wB, gy, sz * zB), new Vector3(x + sx * wT, ay, sz * zT)]);
    for (const [a, b] of legs) strut(a, b, 0.07);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const at = (k: number, t: number) => new Vector3().lerpVectors(legs[k][0], legs[k][1], t);
      for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) { strut(at(a, t1), at(b, t1), 0.04); strut(at(a, t0), at(b, t1), 0.03); }
    }
  }

  // ------------------------------------------------------------------ vehicles
  private setVehicleModel(v: VehicleDef): void {
    const key = v.id;
    if (key === this.vehicleKey && this.vehicleGroup) return;
    this.vehicleKey = key;
    if (this.vehicleGroup) { this.dyn.remove(this.vehicleGroup); this.vehicleGroup.traverse((o) => { const m = o as Mesh; if (m.geometry) m.geometry.dispose(); }); }
    const width = { truck: 1.35, van: 1.45, bus: 1.6, dumper: 1.75 }[v.id];
    const g = new Group(), chassis = new Group();
    const mats = new Map<string, MeshStandardMaterial>();
    const mat = (c: string, rough = 0.5, metal = 0.15) => { const k = c + rough; if (!mats.has(k)) mats.set(k, new MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })); return mats.get(k)!; };
    const rise = v.wheelRadius * 0.55;
    const part = (x: number, y: number, w: number, h: number, color: string, depth = width, rot = 0, z = 0) => {
      const geo = new RoundedBoxGeometry(w, h, depth, 2, Math.min(w, h, depth) * 0.18);
      const m = new Mesh(geo, mat(color)); m.position.set(x + w / 2, y + h / 2, z); m.rotation.z = rot; m.castShadow = true; m.receiveShadow = true; chassis.add(m); return m;
    };
    const glass = (x: number, y: number, w: number, h: number) => { const m = part(x, y, w, h, '#bfe6ff', width + 0.05); m.material = new MeshStandardMaterial({ color: '#bfe6ff', roughness: 0.1, metalness: 0.5 }); };
    const L = v.bodyLength, H = v.bodyHeight, x0 = -L / 2 + 0.05 * L;
    if (v.id === 'truck') {
      part(x0, rise, L * 0.6, H * 0.55, '#8a5a35');
      part(x0 + 0.1, rise + H * 0.45, L * 0.55, H * 0.28, '#c58d57', width * 0.9);
      part(x0 + L * 0.58, rise, L * 0.4, H * 0.5, v.color);
      part(x0 + L * 0.58, rise + H * 0.3, L * 0.27, H * 0.7, v.color);
      glass(x0 + L * 0.62, rise + H * 0.58, L * 0.19, H * 0.32);
    } else if (v.id === 'van') {
      part(x0, rise, L * 0.95, H * 0.95, v.color);
      glass(x0 + L * 0.66, rise + H * 0.5, L * 0.26, H * 0.36);
      part(x0 + L * 0.05, rise + H * 0.3, L * 0.5, H * 0.1, '#f4f6f8', width + 0.03);
    } else if (v.id === 'bus') {
      part(x0, rise, L * 0.95, H, v.color);
      part(x0, rise + H * 0.26, L * 0.95, H * 0.08, '#5a4410', width + 0.03);
      for (let i = 0; i < 6; i++) glass(x0 + L * (0.07 + i * 0.13), rise + H * 0.55, L * 0.1, H * 0.3);
      glass(x0 + L * 0.84, rise + H * 0.55, L * 0.1, H * 0.34);
    } else {
      part(x0 + L * 0.03, rise + H * 0.15, L * 0.62, H * 0.7, '#6e4aaa', width, 0.06);
      part(x0 + L * 0.5, rise, L * 0.5, H * 0.55, v.color);
      part(x0 + L * 0.62, rise + H * 0.35, L * 0.34, H * 0.65, v.color);
      glass(x0 + L * 0.7, rise + H * 0.62, L * 0.2, H * 0.28);
    }
    const lamp = (x: number, y: number, color: string) => { const m = new Mesh(new SphereGeometry(0.1, 8, 6), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 })); m.position.set(x, y, width * 0.32); chassis.add(m); const m2 = m.clone(); m2.position.z = -width * 0.32; chassis.add(m2); };
    lamp(x0 + L * 0.98, rise + H * 0.22, '#fff3a0'); lamp(x0, rise + H * 0.2, '#e03131');
    g.add(chassis); this.chassis = chassis;
    // wheels
    this.wheels = [];
    const r = v.wheelRadius, hb = v.wheelBase / 2;
    const tire = new CylinderGeometry(r, r, 0.3, 22), hub = new CylinderGeometry(r * 0.55, r * 0.55, 0.32, 16), spoke = new BoxGeometry(r * 1.0, 0.07, 0.34);
    const tireMat = mat('#16181d', 0.9, 0), hubMat = mat('#9aa0aa', 0.4, 0.6), spokeMat = mat('#e1e5ea', 0.4, 0.5);
    for (const cx of [-hb, hb]) {
      const w = new Group();
      for (const side of [-1, 1]) {
        const wg = new Group(); wg.position.set(0, 0, side * (width / 2 - 0.12));
        const t = new Mesh(tire, tireMat); t.rotation.x = Math.PI / 2; t.castShadow = true; wg.add(t);
        const h = new Mesh(hub, hubMat); h.rotation.x = Math.PI / 2; wg.add(h);
        for (const a of [0, Math.PI / 2]) { const s = new Mesh(spoke, spokeMat); s.rotation.z = a; wg.add(s); }
        w.add(wg);
      }
      w.position.set(cx, 0, 0); g.add(w); this.wheels.push(w);
    }
    this.vehicleGroup = g; this.dyn.add(g);
  }

  setVehicle(def: VehicleDef, pose: VehiclePose): void {
    this.setVehicleModel(def);
    const g = this.vehicleGroup!;
    g.position.set(pose.x, pose.y, 0); g.rotation.z = pose.angle;
    this.chassis!.position.y = pose.bodyOffset;
    this.wheels[0].rotation.z = -pose.spinRear; this.wheels[1].rotation.z = -pose.spinFront;
  }

  // ------------------------------------------------------------------ structure
  setStructure(beams: DrawBeam[], count: number, nodes: StageNode[], stressView: boolean, time: number): void {
    for (const i of [this.road, this.dash, this.wood, this.steel, this.cable, this.spheres, this.rods, this.anchors]) i.reset();
    for (let k = 0; k < count; k++) {
      const b = beams[k], m = MATERIALS[b.material];
      const base = stressView ? heatColor(b.force, b.util) : stressTint(b.material === 'cable' ? '#2b2b33' : m.color, b.util);
      _c.set(base);
      if (b.util > 0.95 && !b.broken) _c.lerp(new Color('#ff3b30'), 0.35 + 0.35 * Math.sin(time * 30));
      let ax = b.ax, ay = b.ay, bx = b.bx, by = b.by;
      if (b.material === 'road') {
        if (bx < ax) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }
        this.road.add(segBox(ax, ay, bx, by, 0.3, DECK_HALF * 2, 0, -0.15), _c.clone());
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        _c.set('#ffffff');
        for (let s = 0.2; s + 0.4 < L; s += 0.85) {
          const t0 = s / L, t1 = (s + 0.4) / L;
          this.dash.add(segBox(ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1, 0.02, 0.1, 0, 0.012), _c);
        }
      } else if (b.material === 'wood' || b.material === 'steel') {
        const inst = b.material === 'wood' ? this.wood : this.steel;
        for (const z of [-TRUSS_Z, TRUSS_Z]) inst.add(segBox(ax, ay, bx, by, m.thickness * 1.15, 0.2, z), _c.clone());
      } else {
        const slack = b.len < b.rest * 0.9995;
        const sag = slack ? Math.sqrt(Math.max(0, b.rest * b.rest - b.len * b.len)) * 0.5 * 1.6 : 0;
        const segs = slack ? 8 : 1;
        for (const z of [-TRUSS_Z, TRUSS_Z]) {
          let px = ax, py = ay;
          for (let s = 1; s <= segs; s++) {
            const t = s / segs, qx = ax + (bx - ax) * t, qy = ay + (by - ay) * t - sag * 4 * t * (1 - t) * 0.5;
            this.cable.add(segCyl(px, py, qx, qy, Math.max(0.03, m.thickness * 0.5), z), _c.clone());
            px = qx; py = qy;
          }
        }
      }
    }
    const white = _c.set('#f4f6f8').clone(), yellow = new Color('#ffcf4a');
    for (const n of nodes) {
      if (n.kind === 'anchor') {
        for (const z of [-TRUSS_Z, TRUSS_Z]) this.anchors.add(place(n.x, n.y, z, 0.3, 0.55, 0.3, 0, Math.PI / 2), yellow);
        this.rods.add(place(n.x, n.y, 0, 0.1, 2.3, 0.1, 0, Math.PI / 2), white);
        continue;
      }
      for (const z of [-TRUSS_Z, TRUSS_Z]) this.spheres.add(place(n.x, n.y, z, 0.2, 0.2, 0.2), white);
      this.rods.add(place(n.x, n.y, 0, 0.07, 2.3, 0.07, 0, Math.PI / 2), white);
    }
    for (const i of [this.road, this.dash, this.wood, this.steel, this.cable, this.spheres, this.rods, this.anchors]) i.flush();
  }

  // ------------------------------------------------------------------ frame
  render(cam: StageCamera, time: number): void {
    if (!this.level) return;
    // keep fog behind the whole scene regardless of zoom
    const fog = this.scene.fog as Fog; fog.near = cam.distance * 1.6; fog.far = cam.distance * 5.5;
    for (const c of this.clouds) c.s.position.x = c.x0 + ((time * c.v) % 300);
    if (this.water && this.waterBase) {
      const a = this.water.geometry.attributes.position.array as Float32Array, b = this.waterBase;
      for (let i = 0; i < a.length; i += 3) a[i + 1] = Math.sin(b[i] * 0.35 + time * 1.6) * 0.1 + Math.sin(b[i] * 0.9 - time * 2.1 + b[i + 2] * 0.5) * 0.05;
      this.water.geometry.attributes.position.needsUpdate = true;
    }
    if (this.flag) {
      const a = this.flag.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) { const u = (a[i] + 0.85) / 1.7; a[i + 2] = Math.sin(time * 5 + u * 6) * 0.14 * u; }
      this.flag.geometry.attributes.position.needsUpdate = true;
    }
    this.renderer.render(this.scene, cam.three);
  }
}
