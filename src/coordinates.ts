/**
 * Coordinates for the Fischer two-phase solver.
 *
 * Standard Kociemba coordinates, plus the Fischer-specific SIDE-CENTRE
 * coordinates:
 *   phase 1: cbits = the four side centres' quarter-turn counts mod 2  (16 values)
 *   phase 2: hbits = the four side centres' half-turn bits              (16 values)
 * U/D centres are not tracked: their rotation is invisible on a Fischer Cube.
 *
 * Array-level move "cubes" are derived from the geometric engine
 * (toArrays(applyMove(solved, m))), so the solver's notion of a move is
 * identical to the physical model by construction.
 */
import { toArrays, type CubieArrays } from '../cube/cubies';
import { applyMove, NUM_MOVES } from '../cube/moves';
import { solvedState } from '../cube/state';

export const MOVE_CUBES: readonly CubieArrays[] = Array.from({ length: NUM_MOVES }, (_, m) => toArrays(applyMove(solvedState(), m)));

/** Apply face move m to array-state a (Kociemba "replaced-by" multiplication). */
export function arraysMove(a: CubieArrays, m: number): CubieArrays {
  const M = MOVE_CUBES[m];
  return {
    cp: M.cp.map((p) => a.cp[p]),
    co: M.cp.map((p, i) => (a.co[p] + M.co[i]) % 3),
    ep: M.ep.map((p) => a.ep[p]),
    eo: M.ep.map((p, i) => (a.eo[p] + M.eo[i]) % 2),
    ctr: a.ctr.map((t, f) => (t + M.ctr[f]) % 4),
  };
}

/** Side faces in bit order: R, F, L, B (face indices 1, 2, 4, 5). */
export const SIDE_FACES = [1, 2, 4, 5] as const;
/** Phase-2 move set <U, D, R2, L2, F2, B2> as indices into the 18 moves. */
export const P2_MOVES = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16] as const;
export const IS_P2_MOVE: readonly boolean[] = Array.from({ length: NUM_MOVES }, (_, m) => (P2_MOVES as readonly number[]).includes(m));

export const N_TWIST = 2187,
  N_FLIP = 2048,
  N_SLICE = 495,
  N_CB = 16,
  N_PERM8 = 40320,
  N_PERM4 = 24;

// --- encoders -----------------------------------------------------------------
export function twistCoord(co: readonly number[]): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + co[i];
  return t;
}
export function twistDecode(t: number): number[] {
  const co = new Array(8).fill(0);
  let s = 0;
  for (let i = 6; i >= 0; i--) {
    co[i] = t % 3;
    s += co[i];
    t = Math.floor(t / 3);
  }
  co[7] = (3 - (s % 3)) % 3;
  return co;
}
export function flipCoord(eo: readonly number[]): number {
  let t = 0;
  for (let i = 0; i < 11; i++) t = t * 2 + eo[i];
  return t;
}
export function flipDecode(t: number): number[] {
  const eo = new Array(12).fill(0);
  let s = 0;
  for (let i = 10; i >= 0; i--) {
    eo[i] = t & 1;
    s += eo[i];
    t >>= 1;
  }
  eo[11] = s & 1;
  return eo;
}

const binom = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};
/** Which slots hold E-slice edges (pieces 8..11); 0 when they are all in the E slice. */
export function sliceCoord(ep: readonly number[]): number {
  let a = 0,
    x = 0;
  for (let j = 11; j >= 0; j--)
    if (ep[j] >= 8) {
      a += binom(11 - j, x + 1);
      x++;
    }
  return a;
}
const SLICE_DECODE: number[][] = (() => {
  const out: number[][] = new Array(N_SLICE);
  for (let m = 0; m < 1 << 12; m++) {
    const pos: number[] = [];
    for (let j = 0; j < 12; j++) if (m & (1 << j)) pos.push(j);
    if (pos.length !== 4) continue;
    const ep = new Array(12).fill(0);
    pos.forEach((p) => (ep[p] = 8));
    const c = sliceCoord(ep);
    if (out[c]) throw new Error('slice coordinate not injective');
    out[c] = pos;
  }
  return out;
})();
export function sliceDecode(c: number): number[] {
  const ep = new Array(12).fill(-1);
  SLICE_DECODE[c].forEach((p, k) => (ep[p] = 8 + k));
  let next = 0;
  for (let j = 0; j < 12; j++) if (ep[j] < 0) ep[j] = next++;
  return ep;
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
export function permRank(p: readonly number[]): number {
  const n = p.length;
  let r = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    r += smaller * FACT[n - 1 - i];
  }
  return r;
}
export function permUnrank(r: number, n: number): number[] {
  const avail = Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const k = Math.floor(r / f);
    r %= f;
    out.push(avail.splice(k, 1)[0]);
  }
  return out;
}
export const cbitsCoord = (ctr: readonly number[]) => SIDE_FACES.reduce((b, f, k) => b | ((ctr[f] & 1) << k), 0);
export const hbitsCoord = (ctr: readonly number[]) => SIDE_FACES.reduce((b, f, k) => b | (((ctr[f] >> 1) & 1) << k), 0);

// --- move tables ----------------------------------------------------------------
export interface MoveTables {
  twist: Uint16Array; // [N_TWIST * 18]
  flip: Uint16Array; // [N_FLIP * 18]
  slice: Uint16Array; // [N_SLICE * 18]
  cbits: Uint8Array; // [16 * 18]
  cp: Uint16Array; // [N_PERM8 * 18]
  udep: Uint16Array; // [N_PERM8 * 10]  (phase-2 moves only)
  sp: Uint8Array; // [24 * 10]
  hbits: Uint8Array; // [16 * 10]
}

const ID8 = [0, 1, 2, 3, 4, 5, 6, 7];
const blank = (): CubieArrays => ({ cp: ID8.slice(), co: new Array(8).fill(0), ep: Array.from({ length: 12 }, (_, i) => i), eo: new Array(12).fill(0), ctr: new Array(6).fill(0) });

export function buildMoveTables(): MoveTables {
  const twist = new Uint16Array(N_TWIST * 18);
  for (let t = 0; t < N_TWIST; t++) {
    const a = { ...blank(), co: twistDecode(t) };
    for (let m = 0; m < 18; m++) twist[t * 18 + m] = twistCoord(arraysMove(a, m).co);
  }
  const flip = new Uint16Array(N_FLIP * 18);
  for (let t = 0; t < N_FLIP; t++) {
    const a = { ...blank(), eo: flipDecode(t) };
    for (let m = 0; m < 18; m++) flip[t * 18 + m] = flipCoord(arraysMove(a, m).eo);
  }
  const slice = new Uint16Array(N_SLICE * 18);
  for (let t = 0; t < N_SLICE; t++) {
    const a = { ...blank(), ep: sliceDecode(t) };
    for (let m = 0; m < 18; m++) slice[t * 18 + m] = sliceCoord(arraysMove(a, m).ep);
  }
  const cbits = new Uint8Array(N_CB * 18);
  const ctrOfBits = (b: number, half: boolean) => {
    const ctr = new Array(6).fill(0);
    [1, 2, 4, 5].forEach((f, k) => (ctr[f] = (b >> k) & 1 ? (half ? 2 : 1) : 0));
    return ctr;
  };
  for (let b = 0; b < N_CB; b++) {
    const a = { ...blank(), ctr: ctrOfBits(b, false) };
    for (let m = 0; m < 18; m++) cbits[b * 18 + m] = cbitsCoord(arraysMove(a, m).ctr);
  }
  const cp = new Uint16Array(N_PERM8 * 18);
  for (let t = 0; t < N_PERM8; t++) {
    const a = { ...blank(), cp: permUnrank(t, 8) };
    for (let m = 0; m < 18; m++) cp[t * 18 + m] = permRank(arraysMove(a, m).cp);
  }
  const udep = new Uint16Array(N_PERM8 * 10);
  for (let t = 0; t < N_PERM8; t++) {
    const a = { ...blank(), ep: [...permUnrank(t, 8), 8, 9, 10, 11] };
    P2_MOVES.forEach((m, k) => {
      const e = arraysMove(a, m).ep;
      if (e.slice(0, 8).some((x) => x >= 8)) throw new Error('phase-2 move left the U/D edge set');
      udep[t * 10 + k] = permRank(e.slice(0, 8));
    });
  }
  const sp = new Uint8Array(N_PERM4 * 10);
  for (let t = 0; t < N_PERM4; t++) {
    const a = { ...blank(), ep: [...ID8, ...permUnrank(t, 4).map((x) => x + 8)] };
    P2_MOVES.forEach((m, k) => (sp[t * 10 + k] = permRank(arraysMove(a, m).ep.slice(8).map((x) => x - 8))));
  }
  const hbits = new Uint8Array(N_CB * 10);
  for (let b = 0; b < N_CB; b++) {
    const a = { ...blank(), ctr: ctrOfBits(b, true) };
    P2_MOVES.forEach((m, k) => (hbits[b * 10 + k] = hbitsCoord(arraysMove(a, m).ctr)));
  }
  return { twist, flip, slice, cbits, cp, udep, sp, hbits };
}
