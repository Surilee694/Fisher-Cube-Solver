import {
  FACE_AXIS,
  FACE_NAMES,
  FACE_NORMALS,
  FACE_QUARTER_ROT,
  FACE_SIGN,
  HOME,
  NUM_CUBIES,
  ROT_COMPOSE,
  ROT_IDENTITY,
  ROT_INVERSE,
  rotApply,
  clockwiseQuarterAbout,
  rotIndexOf,
  faceOfNormal,
} from './geometry';
import type { CubeState } from './state';

/**
 * A face move is encoded as an integer m = face * 3 + (turns - 1), where
 * face ∈ {0..5} = U R F D L B and turns ∈ {1, 2, 3} clockwise quarter turns
 * (3 = counter-clockwise). 18 moves in total.
 */
export const NUM_MOVES = 18;
export const moveFace = (m: number) => Math.floor(m / 3);
export const moveTurns = (m: number) => (m % 3) + 1;
export function makeMove(face: number, turns: number): number {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) throw new Error('a move of 0 (mod 4) turns is the identity, not a move');
  return face * 3 + t - 1;
}
export const inverseMove = (m: number) => makeMove(moveFace(m), 4 - moveTurns(m));

const SUFFIX = ['', '2', "'"];
export const moveName = (m: number) => FACE_NAMES[moveFace(m)] + SUFFIX[m % 3];
export const MOVE_NAMES = Array.from({ length: NUM_MOVES }, (_, m) => moveName(m));

/** Rotation applied to every cubie in the turning layer for move m. */
export const MOVE_ROT: readonly number[] = Array.from({ length: NUM_MOVES }, (_, m) => {
  let r = ROT_IDENTITY;
  for (let i = 0; i < moveTurns(m); i++) r = ROT_COMPOSE[FACE_QUARTER_ROT[moveFace(m)]][r];
  return r;
});

/** Is cubie c (in state s) in the layer turned by `face`? */
export function inLayer(s: CubeState, c: number, face: number): boolean {
  return rotApply(s.rot[c], HOME[c])[FACE_AXIS[face]] === FACE_SIGN[face];
}

/** Apply one face move. Pure: returns a new state. */
export function applyMove(s: CubeState, m: number): CubeState {
  const f = moveFace(m);
  const R = MOVE_ROT[m];
  const rot = s.rot.slice();
  for (let c = 0; c < NUM_CUBIES; c++) if (inLayer(s, c, f)) rot[c] = ROT_COMPOSE[R][rot[c]];
  return { rot };
}

export function applyMoves(s: CubeState, ms: readonly number[]): CubeState {
  let cur = s;
  for (const m of ms) cur = applyMove(cur, m);
  return cur;
}

export const invertSequence = (ms: readonly number[]) => ms.slice().reverse().map(inverseMove);

// ---------------------------------------------------------------------------
// Whole-cube rotations (x, y, z). These NEVER change the puzzle state. They
// change the viewing frame: `view` is the rotation that carries puzzle-frame
// vectors into the viewer's frame. x turns like R, y like U, z like F.
// ---------------------------------------------------------------------------
export const ROTATION_AXES = ['x', 'y', 'z'] as const;
export type RotationAxis = (typeof ROTATION_AXES)[number];
const AXIS_FACE: Record<RotationAxis, number> = { x: 1, y: 0, z: 2 };

export function wholeCubeRotation(axis: RotationAxis, turns: number): number {
  const q = rotIndexOf(clockwiseQuarterAbout(FACE_NORMALS[AXIS_FACE[axis]]));
  let r = ROT_IDENTITY;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) r = ROT_COMPOSE[q][r];
  return r;
}

/** Apply a whole-cube rotation to a view orientation. */
export const rotateView = (view: number, axis: RotationAxis, turns: number) =>
  ROT_COMPOSE[wholeCubeRotation(axis, turns)][view];

/** The puzzle face that appears as viewer face `viewerFace` under `view`. */
export const puzzleFaceForViewerFace = (view: number, viewerFace: number) =>
  faceOfNormal(rotApply(ROT_INVERSE[view], FACE_NORMALS[viewerFace]));
/** The viewer face on which puzzle face `puzzleFace` appears under `view`. */
export const viewerFaceForPuzzleFace = (view: number, puzzleFace: number) =>
  faceOfNormal(rotApply(view, FACE_NORMALS[puzzleFace]));

/** Translate a puzzle-frame move into the name the user should use under `view`. */
export const moveInView = (view: number, m: number) => makeMove(viewerFaceForPuzzleFace(view, moveFace(m)), moveTurns(m));
