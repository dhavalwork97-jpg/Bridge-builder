export interface Vec2 { x: number; y: number }

export type MaterialId = 'road' | 'wood' | 'steel' | 'cable';
export type VehicleId = 'truck' | 'van' | 'bus' | 'dumper';
export type NodeKind = 'anchor' | 'junction';

/** A joint in the player-built structure. World units are metres, +y is UP. */
export interface BNode { id: number; x: number; y: number; kind: NodeKind; fixed: boolean }
export interface BBeam { id: number; a: number; b: number; material: MaterialId }

export interface GraphSnapshot { nodes: BNode[]; beams: BBeam[]; nextNodeId: number; nextBeamId: number }

export interface MaterialDef {
  id: MaterialId;
  label: string;
  /** Currency per metre of member length. */
  costPerMeter: number;
  /** Mass per metre (kg/m). */
  density: number;
  /** Axial rigidity EA (N). Member stiffness k = EA / L. */
  ea: number;
  /** Max tensile force before failure (N). */
  maxTension: number;
  /** Max compressive force before failure (N). 0 => tension-only member. */
  maxCompression: number;
  /** Longest single member of this material (m). */
  maxLength: number;
  /** Rendered thickness in metres. */
  thickness: number;
  /** Whether wheels can drive on it. */
  drivable: boolean;
  color: string;
}

export interface VehicleDef {
  id: VehicleId;
  label: string;
  mass: number;
  wheelRadius: number;
  wheelBase: number;
  speed: number;
  bodyLength: number;
  bodyHeight: number;
  color: string;
}

export interface Landmass { top: Vec2[] }

export type Challenge =
  | { type: 'maxBeams'; value: number; text: string }
  | { type: 'noMaterial'; material: MaterialId; text: string }
  | { type: 'onlyMaterials'; materials: MaterialId[]; text: string }
  | { type: 'safety'; ratio: number; text: string };

export interface LevelDef {
  id: number;
  name: string;
  tier: 1 | 2 | 3 | 4;
  hint: string;
  landmasses: Landmass[];
  anchors: Vec2[];
  buildArea: { minX: number; maxX: number; minY: number; maxY: number };
  startX: number;
  goalX: number;
  budget: number;
  goldBudget: number;
  materials: MaterialId[];
  vehicle: VehicleId;
  challenge: Challenge;
}
