import { FACE_AXIS } from '../cube/geometry';
import { makeMove, moveFace, moveTurns } from '../cube/moves';

/**
 * Merge turns of the same face, including across a turn of the OPPOSITE face
 * (opposite faces commute exactly: R L R = R2 L). Turn counts are summed mod 4,
 * which is exact on a Fischer Cube as well: four quarter turns of a face return
 * every piece AND its centre to the same physical pose. Nothing is ever moved
 * across a turn on a different axis.
 */
export function simplify(moves: readonly number[]): number[] {
  const out: number[] = [];
  for (const m of moves) {
    const f = moveFace(m);
    let merged = false;
    for (let i = out.length - 1; i >= 0 && FACE_AXIS[moveFace(out[i])] === FACE_AXIS[f]; i--) {
      if (moveFace(out[i]) === f) {
        const t = (moveTurns(out[i]) + moveTurns(m)) % 4;
        if (t === 0) out.splice(i, 1);
        else out[i] = makeMove(f, t);
        merged = true;
        break;
      }
    }
    if (!merged) out.push(m);
  }
  return out;
}
