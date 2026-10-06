/**
 * Physical description of moves, for auditing the model against a real
 * Fischer Cube. Pure functions – used by the Physical Verification screen,
 * by tests and by tools/audit-report.ts (docs/PHYSICAL_AUDIT.md).
 *
 * Everything is described in the HOLDING FRAME of the standard hold:
 * white on top, the green|red vertical edge of the shell pointing at you.
 * Positions are fixed points in space, so they stay meaningful after a turn
 * changes the outer shape.
 */
import { CUBIE_CODE, CUBIE_TYPE, FACE_LONG_NAMES, FACE_NAMES, FACE_NORMALS, HOME, NUM_CUBIES, ROTATIONS } from './geometry';
import { COLOR_NAMES, fischerShell, NET_AXES, orientationVisible, pieceName, type Color, type Shell } from './fischerShell';
import { applyMove, inLayer, moveFace, moveName, moveTurns } from './moves';
import { occupancy, type CubeState } from './state';
import { toArrays } from './cubies';

type V = [number, number, number];
const mul = (m: readonly number[], v: readonly number[]): V => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Horizontal direction (x, z signs) → name of the side of the SOLVED Fischer shell / its vertical edges. */
function horizontalName(x: number, z: number): string {
  const key = `${Math.sign(x)},${Math.sign(z)}`;
  return (
    {
      '1,1': 'front-right',
      '-1,1': 'front-left',
      '1,-1': 'back-right',
      '-1,-1': 'back-left',
      '0,1': 'front',
      '0,-1': 'back',
      '1,0': 'right',
      '-1,0': 'left',
    } as Record<string, string>
  )[key];
}

/** Where a slot is on the solved Fischer Cube, as you hold it in the standard hold. */
export function slotWhere(slot: number): string {
  const [x, y, z] = HOME[slot];
  const level = y > 0 ? 'top' : y < 0 ? 'bottom' : 'middle';
  switch (CUBIE_TYPE[slot]) {
    case 'corner':
      return `${level} layer, middle of the ${level} edge of the ${horizontalName(x, z)} side`;
    case 'edge':
      return y !== 0 ? `${level} outer corner at the ${horizontalName(x, z)}` : `centre of the ${horizontalName(x, z)} side`;
    default:
      return y !== 0 ? `centre of the ${level}` : `middle of the ${horizontalName(x, z)} vertical edge`;
  }
}

/** Name of a direction in the holding frame, e.g. "up", "front-right", "up and back (slanted)". */
export function directionName(v: readonly number[]): string {
  const r = v.map((c) => (Math.abs(c) < 1e-6 ? 0 : Math.sign(c)));
  const vert = r[1] > 0 ? 'up' : r[1] < 0 ? 'down' : '';
  const hor = r[0] === 0 && r[2] === 0 ? '' : horizontalName(r[0], r[2]);
  if (vert && hor) return `${vert} and ${hor} (slanted)`;
  return vert || hor;
}

export interface StickerMove {
  color: Color;
  before: string;
  after: string;
  /** after the move, does this sticker lie flat on the outer surface of the SOLVED cube shape? */
  flushAfter: boolean;
}
export interface PieceChange {
  cubie: number;
  name: string;
  colors: Color[];
  type: 'corner' | 'edge' | 'center';
  fromSlot: number;
  toSlot: number;
  from: string;
  to: string;
  /** orientation value at the slot (corner twist 0-2, edge flip 0-1, centre quarter turns 0-3) */
  oriBefore: number;
  oriAfter: number;
  oriKind: 'twist' | 'flip' | 'rotation';
  oriVisible: boolean;
  stickers: StickerMove[];
}
export interface CentreInfo {
  face: string;
  colours: Color[];
  quarterTurns: number;
  visible: boolean;
}
export interface MoveEffect {
  move: number;
  notation: string;
  layer: string;
  layerColours: Color[];
  direction: string;
  pieces: PieceChange[];
  shapeBefore: boolean;
  shapeAfter: boolean;
  centresAfter: CentreInfo[];
  after: CubeState;
}

const isShellNormal = (n: readonly number[], shell: Shell) => shell.faces.some((f) => Math.hypot(...f.normal.map((x, i) => x - n[i])) < 1e-6);

/** Is the state cube-shaped (every sticker flush with a face of the solved shell)? */
export function isCubeShaped(s: CubeState, shell: Shell = fischerShell()): boolean {
  for (let c = 0; c < NUM_CUBIES; c++)
    for (const f of shell.polyhedron(c, 0).faces) if (f.kind === 'sticker' && !isShellNormal(mul(ROTATIONS[s.rot[c]], f.normal), shell)) return false;
  return true;
}

/** Colours of a side/top centre, ordered left → right as seen looking at that layer from outside. */
export function centreColours(face: number, shell: Shell = fischerShell()): Color[] {
  const right = NET_AXES[face][0];
  return shell
    .polyhedron(20 + face, 0)
    .faces.filter((f) => f.kind === 'sticker')
    .sort((a, b) => dot(a.normal, right) - dot(b.normal, right))
    .map((f) => f.color!);
}

export interface LayerInfo {
  face: string;
  longName: string;
  axis: string;
  centreColours: Color[];
  /** each centre sticker and the direction it faces */
  centreStickers: { color: Color; faces: string }[];
  /** solved-shell faces that this layer's pieces carry stickers of */
  outerColours: Color[];
  pieces: { slot: number; code: string; name: string; where: string }[];
}

/** Which mechanism layer is which, derived from the shell geometry (nothing hard-coded). */
export function layerReport(shell: Shell = fischerShell()): LayerInfo[] {
  const AX = ['+Y (up)', '+X (right)', '+Z (towards you)', '−Y (down)', '−X (left)', '−Z (away from you)'];
  return FACE_NAMES.map((face, f) => {
    const slots = Array.from({ length: NUM_CUBIES }, (_, s) => s).filter((s) => dot(HOME[s], FACE_NORMALS[f]) === 1);
    const outer = new Set<Color>();
    for (const s of slots) for (const p of shell.polyhedron(s, 0).faces) if (p.kind === 'sticker') outer.add(p.color!);
    return {
      face,
      longName: FACE_LONG_NAMES[f],
      axis: AX[f],
      centreColours: centreColours(f, shell),
      centreStickers: shell
        .polyhedron(20 + f, 0)
        .faces.filter((p) => p.kind === 'sticker')
        .map((p) => ({ color: p.color!, faces: directionName(p.normal) })),
      outerColours: [...outer],
      pieces: slots.map((s) => ({ slot: s, code: CUBIE_CODE[s], name: pieceName(s, shell), where: slotWhere(s) })),
    };
  });
}

const DIR = (face: number, turns: number) => {
  const from = ['above', 'the right', 'the front', 'below', 'the left', 'the back'][face];
  return turns === 2 ? `half a turn (180°)` : `${turns === 1 ? 'clockwise' : 'counter-clockwise'} as seen from ${from}`;
};

/** Everything that physically happens when move m is applied to `before`. */
export function describeMoveEffect(before: CubeState, m: number, shell: Shell = fischerShell()): MoveEffect {
  const after = applyMove(before, m);
  const f = moveFace(m);
  const occB = occupancy(before).bySlot,
    occA = occupancy(after).bySlot;
  const aB = toArrays(before),
    aA = toArrays(after);
  const slotOf = (occ: (number | null)[], c: number) => occ.indexOf(c);
  const ori = (a: ReturnType<typeof toArrays>, c: number, slot: number) =>
    CUBIE_TYPE[c] === 'corner' ? a.co[slot] : CUBIE_TYPE[c] === 'edge' ? a.eo[slot - 8] : a.ctr[c - 20];
  const pieces: PieceChange[] = [];
  for (let c = 0; c < NUM_CUBIES; c++) {
    if (!inLayer(before, c, f)) continue;
    const fromSlot = slotOf(occB, c),
      toSlot = slotOf(occA, c);
    const stickers = shell
      .polyhedron(c, 0)
      .faces.filter((p) => p.kind === 'sticker')
      .map((p) => {
        const nb = mul(ROTATIONS[before.rot[c]], p.normal),
          na = mul(ROTATIONS[after.rot[c]], p.normal);
        return { color: p.color!, before: directionName(nb), after: directionName(na), flushAfter: isShellNormal(na, shell) };
      });
    pieces.push({
      cubie: c,
      name: pieceName(c, shell),
      colors: shell.pieceColors[c],
      type: CUBIE_TYPE[c],
      fromSlot,
      toSlot,
      from: slotWhere(fromSlot),
      to: slotWhere(toSlot),
      oriBefore: ori(aB, c, fromSlot),
      oriAfter: ori(aA, c, toSlot),
      oriKind: CUBIE_TYPE[c] === 'corner' ? 'twist' : CUBIE_TYPE[c] === 'edge' ? 'flip' : 'rotation',
      oriVisible: orientationVisible(c, shell),
      stickers,
    });
  }
  const order = { center: 0, corner: 1, edge: 2 };
  pieces.sort((a, b) => order[a.type] - order[b.type] || a.fromSlot - b.fromSlot);
  return {
    move: m,
    notation: moveName(m),
    layer: FACE_LONG_NAMES[f],
    layerColours: centreColours(f, shell),
    direction: DIR(f, moveTurns(m)),
    pieces,
    shapeBefore: isCubeShaped(before, shell),
    shapeAfter: isCubeShaped(after, shell),
    centresAfter: FACE_NAMES.map((name, k) => ({
      face: name,
      colours: centreColours(k, shell),
      quarterTurns: aA.ctr[k],
      visible: orientationVisible(20 + k, shell),
    })),
    after,
  };
}

export const colourList = (cs: readonly Color[]) => cs.map((c) => COLOR_NAMES[c]).join('–');

/** Human text for an orientation value, e.g. "twist 1 (↺⅓)", "flipped", "90°", "invisible". */
export function orientationText(p: Pick<PieceChange, 'oriKind' | 'oriVisible'>, v: number): string {
  if (!p.oriVisible) return `${p.oriKind === 'rotation' ? `${v * 90}°` : v ? 'flipped' : 'not flipped'} (can't be seen)`;
  if (p.oriKind === 'rotation') return `${v * 90}°`;
  if (p.oriKind === 'twist') return ['not twisted', 'twisted ↺ ⅓', 'twisted ↻ ⅓'][v];
  return v ? 'flipped' : 'not flipped';
}

/** The recommended physical test sequence (see docs/PHYSICAL_AUDIT.md, section 3). */
export const PHYSICAL_TEST_SEQUENCE = "F R2 U' F";
