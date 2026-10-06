/**
 * Fischer two-phase search (Kociemba architecture, extended).
 *
 * Phase 1 (all 18 moves) reaches the subgroup
 *    G1 = { corners untwisted, edges unflipped, E-slice edges in the E slice,
 *           AND every side centre turned an even number of quarter turns }.
 * The last condition is the Fischer extension: phase 2 only turns side faces
 * by half turns, so the parity of each side centre must already be right.
 *
 * Phase 2 (<U, D, R2, L2, F2, B2>) solves corner permutation, U/D-edge
 * permutation, E-slice permutation AND the side centres' remaining half turns.
 *
 * The search keeps improving the solution until the time budget runs out, so
 * results are short but NOT claimed to be optimal.
 */
import { OPPOSITE_FACE } from '../cube/geometry';
import type { CubieArrays } from '../cube/cubies';
import {
  arraysMove,
  cbitsCoord,
  flipCoord,
  hbitsCoord,
  IS_P2_MOVE,
  N_CB,
  N_FLIP,
  N_PERM4,
  N_TWIST,
  P2_MOVES,
  permRank,
  sliceCoord,
  twistCoord,
} from './coordinates';
import { getTables, type Tables } from './pruning';

export interface SearchOptions {
  /** Keep improving until this many ms have elapsed (after a first solution exists). */
  timeLimitMs?: number;
  /** Give up entirely after this many ms. */
  hardLimitMs?: number;
  /** Stop immediately when a solution of this length or shorter is found. */
  targetLength?: number;
  maxLength?: number;
  onImprovement?: (length: number) => void;
}
export interface SearchResult {
  moves: number[];
  phase1Length: number;
  nodes: number;
  timeMs: number;
}

const MAX_P1 = 20;
const MAX_P2 = 24;
const FACE_OF = Array.from({ length: 18 }, (_, m) => (m / 3) | 0);
/** Avoid same-face repeats and fix an order for commuting opposite faces. */
const allowed = (prevFace: number, f: number) => prevFace < 0 || (f !== prevFace && !(f === OPPOSITE_FACE[prevFace] && f < prevFace));

export function twoPhaseSearch(start: CubieArrays, opts: SearchOptions = {}, T: Tables = getTables()): SearchResult | null {
  const t0 = Date.now();
  const soft = t0 + (opts.timeLimitMs ?? 1000);
  const hard = t0 + (opts.hardLimitMs ?? 60000);
  const target = opts.targetLength ?? 0;
  let bestLen = (opts.maxLength ?? 50) + 1;
  let best: number[] | null = null;
  let bestP1 = 0;
  let nodes = 0;
  let stop = false;
  const path1: number[] = [];
  const path2: number[] = [];

  const checkTime = () => {
    if ((++nodes & 4095) === 0) {
      const now = Date.now();
      if ((best && now > soft) || now > hard) stop = true;
    }
  };

  const h1 = (tw: number, fl: number, sl: number, cb: number) =>
    Math.max(T.p1SliceTwist[sl * N_TWIST + tw], T.p1SliceFlip[sl * N_FLIP + fl], T.p1FlipCb[fl * N_CB + cb], T.p1TwistCb[tw * N_CB + cb]);

  const h2 = (cp: number, ep: number, sp: number, hb: number) => {
    const a = T.p2CpSp[cp * N_PERM4 + sp],
      b = T.p2EpSp[ep * N_PERM4 + sp],
      c = T.p2CpHb[cp * N_CB + hb],
      d = T.p2EpHb[ep * N_CB + hb],
      e = T.p2SpHb[sp * N_CB + hb];
    if (a < 0 || b < 0 || c < 0 || d < 0 || e < 0) return -1;
    return Math.max(a, b, c, d, e);
  };

  function dfs2(cp: number, ep: number, sp: number, hb: number, togo: number, prevFace: number): boolean {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0 && hb === 0;
    for (let k = 0; k < 10; k++) {
      const m = P2_MOVES[k];
      const f = FACE_OF[m];
      if (!allowed(prevFace, f)) continue;
      const ncp = T.cp[cp * 18 + m],
        nep = T.udep[ep * 10 + k],
        nsp = T.sp[sp * 10 + k],
        nhb = T.hbits[hb * 10 + k];
      const h = h2(ncp, nep, nsp, nhb);
      if (h < 0 || h >= togo) continue;
      checkTime();
      path2.push(m);
      if (dfs2(ncp, nep, nsp, nhb, togo - 1, f)) return true;
      path2.pop();
      if (stop) return false;
    }
    return false;
  }

  function phase2(): void {
    const d1 = path1.length;
    if (d1 > 0 && IS_P2_MOVE[path1[d1 - 1]]) return; // a shorter phase-1 path already covers this
    let a = start;
    for (const m of path1) a = arraysMove(a, m);
    if ([1, 2, 4, 5].some((f) => a.ctr[f] % 2 !== 0)) throw new Error('phase-1 endpoint has odd side centre');
    const cp = permRank(a.cp),
      ep = permRank(a.ep.slice(0, 8)),
      sp = permRank(a.ep.slice(8).map((x) => x - 8)),
      hb = hbitsCoord(a.ctr);
    const h = h2(cp, ep, sp, hb);
    if (h < 0) return; // centre/slice invariant violated: unreachable within phase 2
    const maxD2 = Math.min(MAX_P2, bestLen - 1 - d1);
    const lastFace = d1 ? FACE_OF[path1[d1 - 1]] : -1;
    for (let d2 = h; d2 <= maxD2 && !stop; d2++) {
      path2.length = 0;
      if (dfs2(cp, ep, sp, hb, d2, lastFace)) {
        best = path1.concat(path2);
        bestLen = best.length;
        bestP1 = d1;
        opts.onImprovement?.(bestLen);
        if (bestLen <= target) stop = true;
        return;
      }
    }
  }

  function dfs1(tw: number, fl: number, sl: number, cb: number, togo: number, prevFace: number): void {
    if (togo === 0) {
      if (tw === 0 && fl === 0 && sl === 0 && cb === 0) phase2();
      return;
    }
    for (let m = 0; m < 18; m++) {
      const f = FACE_OF[m];
      if (!allowed(prevFace, f)) continue;
      const ntw = T.twist[tw * 18 + m],
        nfl = T.flip[fl * 18 + m],
        nsl = T.slice[sl * 18 + m],
        ncb = T.cbits[cb * 18 + m];
      if (h1(ntw, nfl, nsl, ncb) >= togo) continue;
      checkTime();
      path1.push(m);
      dfs1(ntw, nfl, nsl, ncb, togo - 1, f);
      path1.pop();
      if (stop) return;
    }
  }

  const tw = twistCoord(start.co),
    fl = flipCoord(start.eo),
    sl = sliceCoord(start.ep),
    cb = cbitsCoord(start.ctr);
  for (let d1 = h1(tw, fl, sl, cb); d1 <= MAX_P1 && d1 < bestLen && !stop; d1++) dfs1(tw, fl, sl, cb, d1, -1);

  if (!best) return null;
  return { moves: best, phase1Length: bestP1, nodes, timeMs: Date.now() - t0 };
}
