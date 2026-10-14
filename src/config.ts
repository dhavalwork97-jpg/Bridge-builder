import type { MaterialDef, MaterialId, VehicleDef, VehicleId } from './types';

/** ---- All gameplay balance lives here. ---- */

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  road:  { id: 'road',  label: 'Road',  costPerMeter: 80,  density: 30,  ea: 3.0e5, maxTension: 70000, maxCompression: 90000, maxLength: 8.5, thickness: 0.28, drivable: true,  color: '#4a4f5a' },
  wood:  { id: 'wood',  label: 'Wood',  costPerMeter: 50,  density: 18,  ea: 1.8e5, maxTension: 26000, maxCompression: 20000, maxLength: 7.5, thickness: 0.2,  drivable: false, color: '#b9803f' },
  steel: { id: 'steel', label: 'Steel', costPerMeter: 120, density: 40, ea: 6.0e5, maxTension: 120000, maxCompression: 100000, maxLength: 8.5, thickness: 0.2,  drivable: false, color: '#5b8bb8' },
  cable: { id: 'cable', label: 'Cable', costPerMeter: 35,  density: 4,  ea: 4.0e5, maxTension: 90000, maxCompression: 0,     maxLength: 13, thickness: 0.07, drivable: false, color: '#2b2b33' },
};
export const MATERIAL_ORDER: MaterialId[] = ['road', 'wood', 'steel', 'cable'];

export const VEHICLES: Record<VehicleId, VehicleDef> = {
  truck:  { id: 'truck',  label: 'Pickup Truck', mass: 1500, wheelRadius: 0.45, wheelBase: 2.6, speed: 3.2, bodyLength: 3.6, bodyHeight: 1.3, color: '#e8553d' },
  van:    { id: 'van',    label: 'Delivery Van', mass: 2600, wheelRadius: 0.48, wheelBase: 2.8, speed: 3.0, bodyLength: 4.0, bodyHeight: 1.7, color: '#3d9be8' },
  bus:    { id: 'bus',    label: 'City Bus',     mass: 5200, wheelRadius: 0.55, wheelBase: 4.4, speed: 2.8, bodyLength: 5.8, bodyHeight: 1.9, color: '#f2b84b' },
  dumper: { id: 'dumper', label: 'Dump Truck',   mass: 9000, wheelRadius: 0.7,  wheelBase: 4.0, speed: 2.5, bodyLength: 5.4, bodyHeight: 2.0, color: '#8a63d2' },
};

export const BUILD = {
  gridStep: 0.5,
  minBeamLength: 0.9,
  /** A new endpoint within this distance of an existing node reuses that node. */
  nodeSnapRadius: 0.45,
  /** On-screen node pick radius in CSS pixels (generous for touch). */
  pickRadiusPx: 26,
  beamPickRadiusPx: 14,
  maxBeams: 220,
};

export const PHYSICS = {
  gravity: 9.81,
  fixedDt: 1 / 60,
  subSteps: 10,
  iterations: 2,
  minNodeMass: 25,
  linearDamping: 0.35,
  beamAxialDamping: 30,
  /** Smoothing time constant (s) for beam force readings. */
  forceSmoothing: 0.05,
  /** Seconds a beam must be overloaded (utilisation > 1) before it snaps. */
  overloadTime: 0.12,
  /** Gravity ramps in over this many seconds so the structure settles without a dynamic shock. */
  gravityRamp: 0.8,
  /** Fraction of the vehicle's traction force reacted back into the road (1 = fully). */
  tractionReaction: 1,
  brakeDeceleration: 6,
  /** Wheel traction fades out between these contact-normal heights (cos of slope angle): ~21 deg full, ~37 deg none. */
  slopeFullGrip: 0.93,
  slopeNoGrip: 0.8,
  vehicleStartDelay: 1.0,
  driveAcceleration: 3.5,
  maxSpeedClamp: 60,
  killY: -16,
  waterY: -9,
  timeout: 75,
  stuckTime: 5,
  flipAngle: 1.75,
  flipTime: 1.2,
};

export const SCORING = {
  /** Safe-bridge requirement for the 2nd star: no member may have broken. */
  requireNoBreakForCostStar: true,
};

export const GAME = {
  title: 'BRIDGE BUILDER: BUILD & CROSS',
  saveKey: 'bridge-builder-build-and-cross',
  saveVersion: 1,
};
