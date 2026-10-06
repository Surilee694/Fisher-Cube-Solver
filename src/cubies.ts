/**
 * Permutation / orientation arrays derived from the geometric state.
 *
 *   cp[slot] = corner cubie in that corner slot       (0..7)
 *   co[slot] = its twist                               (0..2)
 *   ep[slot] = edge cubie (0..11, i.e. id - 8) in that edge slot
 *   eo[slot] = its flip                                (0..1)
 *   ctr[f]   = clockwise quarter turns of centre f     (0..3)
 *
 * ORIENTATION DEFINITIONS (all purely geometric):
 *  • Corner twist: every corner has one U/D-facing facet in its solved pose
 *    (its "reference facet"). At a slot, the three facet directions are listed
 *    in a fixed cyclic order starting with the slot's ±Y facet, chosen so the
 *    ordered triple is right-handed. Twist = index of the cubie's reference
 *    facet in that list. A proper rotation always maps a right-handed list onto
 *    a cyclic shift of another, so twists add: co' = co + δ(move, slot).
 *  • Edge flip: reference facet = the ±Y facet for U/D-layer slots and the ±Z
 *    facet for E-slice slots. flip = 0 iff the cubie's own reference facet lies
 *    on the slot's reference facet. (Only F and B quarter turns flip edges.)
 *  • Centre orientation: number of clockwise quarter turns about its own axis.
 */
import {
  CORNER_IDS,
  EDGE_IDS,
  CENTER_IDS,
  FACE_NORMALS,
  FACE_QUARTER_ROT,
  HOME,
  NUM_CUBIES,
  ROT_COMPOSE,
  ROT_IDENTITY,
  rotApply,
  rotationsCarrying,
  vecEq,
  dot,
  cross,
  type Vec3,
} from './geometry';
import { occupancy, type CubeState } from './state';

export interface CubieArrays {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
  ctr: number[];
}

function cornerFacetOrder(slot: number): Vec3[] {
  const q = HOME[slot];
  const Y: Vec3 = [0, q[1], 0],
    X: Vec3 = [q[0], 0, 0],
    Z: Vec3 = [0, 0, q[2]];
  return dot(Y, cross(X, Z)) > 0 ? [Y, X, Z] : [Y, Z, X];
}
const CORNER_ORDER = CORNER_IDS.map(cornerFacetOrder);
const edgeRef = (id: number): Vec3 => {
  const h = HOME[id];
  return h[1] !== 0 ? [0, h[1], 0] : [0, 0, h[2]];
};

export function cornerTwist(cubie: number, slot: number, r: number): number {
  const ref = rotApply(r, [0, HOME[cubie][1], 0]);
  const i = CORNER_ORDER[slot].findIndex((v) => vecEq(v, ref));
  if (i < 0) throw new Error('corner reference facet not on slot');
  return i;
}
export const edgeFlip = (cubie: number, slot: number, r: number) => (vecEq(rotApply(r, edgeRef(cubie)), edgeRef(slot)) ? 0 : 1);
export function centerTurns(face: number, r: number): number {
  let q = ROT_IDENTITY;
  for (let k = 0; k < 4; k++) {
    if (q === r) return k;
    q = ROT_COMPOSE[FACE_QUARTER_ROT[face]][q];
  }
  throw new Error('centre rotation is not about its own axis');
}

/** ROT_FOR[cubie][slot][ori] = the unique rotation placing `cubie` in `slot` with orientation `ori`. */
const ROT_FOR: number[][][] = Array.from({ length: NUM_CUBIES }, (_, c) =>
  Array.from({ length: NUM_CUBIES }, (_, s) => {
    const rs = rotationsCarrying(c, s);
    if (rs.length === 0 || (c >= 20 && c !== s)) return []; // centres never change slot
    const out: number[] = [];
    for (const r of rs) {
      const o = c < 8 ? cornerTwist(c, s, r) : c < 20 ? edgeFlip(c, s, r) : centerTurns(c - 20, r);
      out[o] = r;
    }
    return out;
  }),
);
export const rotationFor = (cubie: number, slot: number, ori: number) => ROT_FOR[cubie][slot][ori];

/** Requires a state where every slot holds exactly one cubie (see validation). */
export function toArrays(s: CubeState): CubieArrays {
  const { bySlot, collisions } = occupancy(s);
  if (collisions.length) throw new Error('state has overlapping cubies');
  const cp: number[] = [],
    co: number[] = [],
    ep: number[] = [],
    eo: number[] = [];
  for (const slot of CORNER_IDS) {
    const c = bySlot[slot]!;
    cp.push(c);
    co.push(cornerTwist(c, slot, s.rot[c]));
  }
  for (const slot of EDGE_IDS) {
    const c = bySlot[slot]!;
    ep.push(c - 8);
    eo.push(edgeFlip(c, slot, s.rot[c]));
  }
  const ctr = CENTER_IDS.map((c, f) => centerTurns(f, s.rot[c]));
  return { cp, co, ep, eo, ctr };
}

export function fromArrays(a: CubieArrays): CubeState {
  const rot = new Array<number>(NUM_CUBIES).fill(ROT_IDENTITY);
  a.cp.forEach((c, i) => (rot[c] = ROT_FOR[c][CORNER_IDS[i]][a.co[i]]));
  a.ep.forEach((e, i) => (rot[e + 8] = ROT_FOR[e + 8][EDGE_IDS[i]][a.eo[i]]));
  a.ctr.forEach((t, f) => (rot[20 + f] = ROT_FOR[20 + f][20 + f][((t % 4) + 4) % 4]));
  return { rot };
}

export const cloneArrays = (a: CubieArrays): CubieArrays => ({
  cp: a.cp.slice(),
  co: a.co.slice(),
  ep: a.ep.slice(),
  eo: a.eo.slice(),
  ctr: a.ctr.slice(),
});

export function permutationParity(p: readonly number[]): number {
  const seen = new Array(p.length).fill(false);
  let parity = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true;
      len++;
    }
    parity ^= (len - 1) & 1;
  }
  return parity;
}

export { FACE_NORMALS };
