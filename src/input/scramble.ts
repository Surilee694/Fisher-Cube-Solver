import { FACE_AXIS } from '../cube/geometry';
import { applyMoves, makeMove } from '../cube/moves';
import { solvedState, type CubeState } from '../cube/state';

/** Small seedable PRNG (mulberry32) so scrambles/tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random-move scramble. Never repeats a face back-to-back and never makes
 * three consecutive moves on one axis (e.g. R L R), so no move is wasted.
 */
export function randomScrambleMoves(length = 25, random: () => number = Math.random): number[] {
  const out: number[] = [];
  while (out.length < length) {
    const face = Math.floor(random() * 6);
    const n = out.length;
    const prev = n ? Math.floor(out[n - 1] / 3) : -1;
    const prev2 = n > 1 ? Math.floor(out[n - 2] / 3) : -1;
    if (face === prev) continue;
    if (prev >= 0 && prev2 >= 0 && FACE_AXIS[face] === FACE_AXIS[prev] && FACE_AXIS[prev] === FACE_AXIS[prev2]) continue;
    out.push(makeMove(face, 1 + Math.floor(random() * 3)));
  }
  return out;
}

/** Scramble = solved state + legal moves through the one move engine. */
export function scramble(length = 25, random: () => number = Math.random): { moves: number[]; state: CubeState } {
  const moves = randomScrambleMoves(length, random);
  return { moves, state: applyMoves(solvedState(), moves) };
}
