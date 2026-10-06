import {
  CUBIE_TYPE,
  HOME,
  NUM_CUBIES,
  ROT_IDENTITY,
  rotApply,
  slotOfPosition,
  type CubieType,
  type Vec3,
} from './geometry';

/**
 * The physical puzzle state.
 *
 * `rot[c]` is the rotation (index into ROTATIONS) of cubie c relative to its
 * solved pose. Identity of every cubie is its index; its current position is
 * `ROTATIONS[rot[c]] · HOME[c]`; its orientation is the rotation itself.
 *
 * This answers directly: "which physical cubie is here, and how is it turned
 * relative to its solved orientation?" Stickers and the 3D shell are derived
 * from this, never stored independently.
 */
export interface CubeState {
  readonly rot: readonly number[];
}

export function solvedState(): CubeState {
  return { rot: new Array(NUM_CUBIES).fill(ROT_IDENTITY) };
}

export const positionOf = (s: CubeState, cubie: number): Vec3 => rotApply(s.rot[cubie], HOME[cubie]);

export function statesEqual(a: CubeState, b: CubeState): boolean {
  for (let i = 0; i < NUM_CUBIES; i++) if (a.rot[i] !== b.rot[i]) return false;
  return true;
}

/**
 * slot -> cubie occupying it. Returns null entries for empty slots and lists
 * any slot claimed by more than one cubie (only possible for hand-built,
 * inconsistent states).
 */
export function occupancy(s: CubeState): { bySlot: (number | null)[]; collisions: number[][] } {
  const bySlot: (number | null)[] = new Array(NUM_CUBIES).fill(null);
  const claims: number[][] = Array.from({ length: NUM_CUBIES }, () => []);
  for (let c = 0; c < NUM_CUBIES; c++) claims[slotOfPosition(positionOf(s, c))].push(c);
  const collisions: number[][] = [];
  claims.forEach((cs, slot) => {
    if (cs.length === 1) bySlot[slot] = cs[0];
    if (cs.length > 1) collisions.push([slot, ...cs]);
  });
  return { bySlot, collisions };
}

export interface CubieView {
  id: number;
  type: CubieType;
  home: Vec3;
  position: Vec3;
  slot: number;
  rotation: number;
}
/** Explicit per-cubie description (identity, position, orientation). */
export function describeCubies(s: CubeState): CubieView[] {
  return s.rot.map((r, id) => {
    const position = positionOf(s, id);
    return { id, type: CUBIE_TYPE[id], home: HOME[id], position, slot: slotOfPosition(position), rotation: r };
  });
}

export const serializeState = (s: CubeState): string => s.rot.map((r) => r.toString(36)).join('');
export function deserializeState(str: string): CubeState {
  if (str.length !== NUM_CUBIES) throw new Error('bad state string');
  return { rot: str.split('').map((ch) => parseInt(ch, 36)) };
}
