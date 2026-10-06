import { CUBIE_CODE, EDGE_IDS, HOME, NUM_CUBIES, ROT_COMPOSE, vecEq } from './geometry';
import { fischerShell, orientationVisible, pieceName, type Shell } from './fischerShell';
import { occupancy, positionOf, type CubeState } from './state';
import { edgeFlip, permutationParity, toArrays } from './cubies';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  slots?: number[];
}

/**
 * Validate a physical state. Errors mean the state cannot exist on a real
 * (unmodified, unbroken) Fischer Cube and MUST NOT be solved.
 *
 * Reachability on the Fischer Cube (proved by group order computation, see docs):
 *   reachable ⟺ (pieces form a permutation, centres unmoved)
 *              ∧ Σ corner twist ≡ 0 (mod 3)
 *              ∧ parity(corner perm) = parity(edge perm)
 * Edge-flip parity is NOT a constraint you can observe: E-slice edges look the
 * same when flipped, so any flip parity is resolved by an invisible E-edge flip.
 * Side-centre orientations are free: the invisible U/D centres absorb the
 * supercube centre parity.
 */
export function validateState(s: CubeState, shell: Shell = fischerShell()): Issue[] {
  const issues: Issue[] = [];
  if (s.rot.length !== NUM_CUBIES || s.rot.some((r) => !Number.isInteger(r) || r < 0 || r > 23)) {
    return [{ severity: 'error', code: 'malformed', message: 'The state data is malformed.' }];
  }
  for (let c = 20; c < NUM_CUBIES; c++)
    if (!vecEq(positionOf(s, c), HOME[c]))
      issues.push({ severity: 'error', code: 'center-moved', message: `The ${pieceName(c, shell)} has left its position – centres are fixed to the core.` });
  if (issues.length) return issues;

  const { collisions } = occupancy(s);
  for (const [slot, ...cs] of collisions)
    issues.push({
      severity: 'error',
      code: 'duplicate',
      message: `Position ${CUBIE_CODE[slot]} is claimed by ${cs.length} pieces (${cs.map((c) => pieceName(c, shell)).join(', ')}).`,
      slots: [slot],
    });
  if (issues.length) return issues;

  const a = toArrays(s);
  const twist = a.co.reduce((x, y) => x + y, 0) % 3;
  if (twist !== 0)
    issues.push({
      severity: 'error',
      code: 'corner-twist',
      message: `This corner orientation is physically impossible: the corner twists add up to ${twist === 1 ? 'one' : 'two'} third${twist === 1 ? '' : 's'} of a turn. Exactly one corner is probably twisted the wrong way – re-check the white/yellow sticker on each corner.`,
    });
  const cpar = permutationParity(a.cp),
    epar = permutationParity(a.ep);
  if (cpar !== epar)
    issues.push({
      severity: 'error',
      code: 'parity',
      message: 'Impossible permutation parity: the state needs a single swap of two pieces. Two pieces of the same kind (two corners or two edges) are probably entered in each other’s places.',
    });
  const flip = a.eo.reduce((x, y) => x + y, 0) % 2;
  if (flip !== 0) {
    const absorbable = EDGE_IDS.some((c) => !orientationVisible(c, shell));
    issues.push(
      absorbable
        ? {
            severity: 'info',
            code: 'hidden-flip',
            message: 'The visible edge flips have odd parity. On a Fischer Cube this is fine: one of the single-colour E-slice edges is invisibly flipped, and the solver accounts for it.',
          }
        : { severity: 'error', code: 'edge-flip', message: 'Impossible edge orientation: exactly one edge is flipped.' },
    );
  }
  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error');

/**
 * Resolve degrees of freedom that are physically INVISIBLE so the state becomes
 * a consistent mechanism state. Only rotations from a cubie's own symmetry
 * group are used, so the outer appearance is unchanged (verified by tests).
 * Returns notes describing every choice made – nothing is changed silently.
 */
export function resolveHidden(s: CubeState, shell: Shell = fischerShell()): { state: CubeState; notes: string[] } {
  const notes: string[] = [];
  const rot = s.rot.slice();
  const a = toArrays(s);
  if (a.eo.reduce((x, y) => x + y, 0) % 2 === 1) {
    // pick an edge whose flip is invisible and apply its flip symmetry
    for (const c of EDGE_IDS) {
      const flipSym = shell.symmetries[c].find((r) => r !== 0);
      if (flipSym === undefined) continue;
      const slot = EDGE_IDS.find((sl) => vecEq(HOME[sl], positionOf(s, c)))!;
      const before = edgeFlip(c, slot, rot[c]);
      rot[c] = ROT_COMPOSE[rot[c]][flipSym]; // turn the piece by its own symmetry (in its home frame)
      if (edgeFlip(c, slot, rot[c]) === before) throw new Error('symmetry did not flip edge');
      notes.push(`Assumed the ${pieceName(c, shell)} is flipped internally (this cannot be seen from outside).`);
      break;
    }
  }
  return { state: { rot }, notes };
}
