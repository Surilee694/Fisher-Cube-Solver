/**
 * Pruning tables: exact BFS distances in projections of the search space.
 * Every table is a lower bound on the true distance (admissible heuristic).
 *
 * A value of -1 means the projected state is UNREACHABLE. This matters for the
 * Fischer extension: inside the phase-2 group <U,D,R2,L2,F2,B2> the side-centre
 * half-turn bits are not free – their XOR always equals the parity of the
 * E-slice permutation (each of R2/L2/F2/B2 toggles one bit and swaps two
 * E-slice edges). The `spHb` table captures exactly this invariant
 * (group-order computation: the extended phase-2 group is 8×, not 16×, the
 * cubie group), so dead-end phase-1 endpoints are rejected instantly.
 */
import { buildMoveTables, N_CB, N_FLIP, N_PERM4, N_PERM8, N_SLICE, N_TWIST, type MoveTables } from './coordinates';

function bfs(n1: number, n2: number, t1: ArrayLike<number>, w1: number, t2: ArrayLike<number>, w2: number, moves: readonly number[], moves2: readonly number[]): Int8Array {
  const N = n1 * n2;
  const dist = new Int8Array(N).fill(-1);
  dist[0] = 0;
  let filled = 1,
    depth = 0;
  while (filled < N) {
    let changed = 0;
    for (let i = 0; i < N; i++) {
      if (dist[i] !== depth) continue;
      const a = (i / n2) | 0,
        b = i - a * n2;
      for (let k = 0; k < moves.length; k++) {
        const j = t1[a * w1 + moves[k]] * n2 + t2[b * w2 + moves2[k]];
        if (dist[j] === -1) {
          dist[j] = depth + 1;
          changed++;
        }
      }
    }
    if (!changed) break; // remaining entries are unreachable
    filled += changed;
    depth++;
  }
  return dist;
}

export interface Tables extends MoveTables {
  p1SliceTwist: Int8Array;
  p1SliceFlip: Int8Array;
  p1FlipCb: Int8Array;
  p1TwistCb: Int8Array;
  p2CpSp: Int8Array;
  p2EpSp: Int8Array;
  p2CpHb: Int8Array;
  p2EpHb: Int8Array;
  p2SpHb: Int8Array;
  buildMs: number;
}

const ALL18 = Array.from({ length: 18 }, (_, i) => i);
const P2IDX = Array.from({ length: 10 }, (_, i) => i);
const P2_AS_18 = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];

let cached: Tables | null = null;
export function getTables(): Tables {
  if (cached) return cached;
  const t0 = Date.now();
  const mt = buildMoveTables();
  cached = {
    ...mt,
    p1SliceTwist: bfs(N_SLICE, N_TWIST, mt.slice, 18, mt.twist, 18, ALL18, ALL18),
    p1SliceFlip: bfs(N_SLICE, N_FLIP, mt.slice, 18, mt.flip, 18, ALL18, ALL18),
    p1FlipCb: bfs(N_FLIP, N_CB, mt.flip, 18, mt.cbits, 18, ALL18, ALL18),
    p1TwistCb: bfs(N_TWIST, N_CB, mt.twist, 18, mt.cbits, 18, ALL18, ALL18),
    // phase 2: cp table is 18 wide (indexed by the real move), the others 10 wide
    p2CpSp: bfs(N_PERM8, N_PERM4, mt.cp, 18, mt.sp, 10, P2_AS_18, P2IDX),
    p2EpSp: bfs(N_PERM8, N_PERM4, mt.udep, 10, mt.sp, 10, P2IDX, P2IDX),
    p2CpHb: bfs(N_PERM8, N_CB, mt.cp, 18, mt.hbits, 10, P2_AS_18, P2IDX),
    p2EpHb: bfs(N_PERM8, N_CB, mt.udep, 10, mt.hbits, 10, P2IDX, P2IDX),
    p2SpHb: bfs(N_PERM4, N_CB, mt.sp, 10, mt.hbits, 10, P2IDX, P2IDX),
    buildMs: 0,
  };
  cached.buildMs = Date.now() - t0;
  return cached;
}
export const tablesReady = () => cached !== null;
