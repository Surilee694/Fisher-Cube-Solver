import { CUBIE_TYPE, NUM_CUBIES, CUBIE_CODE, HOME, vecEq } from './geometry';
import { fischerShell, pieceName, type Shell } from './fischerShell';
import { positionOf, type CubeState } from './state';
import { faceletsOf } from './facelets';

/**
 * PHYSICALLY solved Fischer Cube: every cubie is in its home slot and its
 * rotation is one of its own symmetries (a rotation that changes neither its
 * shape nor any sticker). For the Fischer shell this means:
 *   • all corners, all U/D-layer edges and the four side centres: exact pose;
 *   • E-slice edges: home, either flip (a flip is physically undetectable);
 *   • U/D centres: any rotation (undetectable).
 * "Every face shows one colour" is NOT the criterion – see the tests.
 */
export function isSolved(s: CubeState, shell: Shell = fischerShell()): boolean {
  for (let c = 0; c < NUM_CUBIES; c++) if (!shell.symmetries[c].includes(s.rot[c])) return false;
  return true;
}

/** Strict mechanism identity (every cubie at rotation 0). Stronger than isSolved. */
export const isMechanismSolved = (s: CubeState) => s.rot.every((r) => r === 0);

/** Does the outer surface look exactly like the solved puzzle? (independent check via stickers) */
export function looksSolved(s: CubeState, shell: Shell = fischerShell()): boolean {
  const f = faceletsOf(s, shell);
  return f.every((x, i) => x === shell.solvedFacelets[i]);
}

/** Human-readable list of what is still wrong. */
export function unsolvedReasons(s: CubeState, shell: Shell = fischerShell()): string[] {
  const out: string[] = [];
  for (let c = 0; c < NUM_CUBIES; c++) {
    if (shell.symmetries[c].includes(s.rot[c])) continue;
    const home = vecEq(positionOf(s, c), HOME[c]);
    const t = CUBIE_TYPE[c];
    const what = !home ? 'is out of place' : t === 'corner' ? 'is twisted' : t === 'edge' ? 'is flipped' : 'is rotated';
    out.push(`The ${pieceName(c, shell)} (${CUBIE_CODE[c]}) ${what}.`);
  }
  return out;
}
