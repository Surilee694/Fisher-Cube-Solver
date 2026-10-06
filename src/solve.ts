import type { CubeState } from '../cube/state';
import { hasErrors, resolveHidden, validateState, type Issue } from '../cube/validation';
import { toArrays } from '../cube/cubies';
import { isSolved } from '../cube/solvedState';
import { twoPhaseSearch, type SearchOptions } from './search';
import { simplify } from './optimizer';
import { verifySolution, type Verification } from './validator';
import { getTables } from './pruning';

export interface SolveResult {
  status: 'solved' | 'already-solved' | 'invalid' | 'not-found' | 'internal-error';
  issues: Issue[];
  notes: string[];
  rawMoves: number[];
  moves: number[];
  verification: Verification | null;
  stats: { searchMs: number; tableMs: number; nodes: number; phase1Length: number };
  message: string;
}

export type SolveStage = 'tables' | 'analyzing' | 'searching' | 'verifying';

/**
 * The full pipeline. Pure and synchronous – run it inside the Web Worker.
 *  1. validate the physical state (refuse impossible states)
 *  2. resolve invisible degrees of freedom (reported in `notes`)
 *  3. convert to cubie coordinates and run the Fischer two-phase search
 *  4. simplify the move sequence
 *  5. replay BOTH the raw and simplified sequences on the ORIGINAL state and
 *     confirm isSolved(); otherwise report an internal error, never a solution
 */
export function solveState(state: CubeState, opts: SearchOptions = {}, onStage?: (s: SolveStage) => void): SolveResult {
  const empty = { searchMs: 0, tableMs: 0, nodes: 0, phase1Length: 0 };
  onStage?.('analyzing');
  const issues = validateState(state);
  if (hasErrors(issues))
    return { status: 'invalid', issues, notes: [], rawMoves: [], moves: [], verification: null, stats: empty, message: 'The state is not a reachable Fischer Cube state.' };
  if (isSolved(state))
    return { status: 'already-solved', issues, notes: [], rawMoves: [], moves: [], verification: verifySolution(state, []), stats: empty, message: 'The puzzle is already solved.' };

  const { state: resolved, notes } = resolveHidden(state);
  onStage?.('tables');
  const T = getTables();
  onStage?.('searching');
  const res = twoPhaseSearch(toArrays(resolved), opts, T);
  if (!res)
    return { status: 'not-found', issues, notes, rawMoves: [], moves: [], verification: null, stats: { ...empty, tableMs: T.buildMs }, message: 'No solution was found within the time limit.' };

  onStage?.('verifying');
  const moves = simplify(res.moves);
  const rawCheck = verifySolution(state, res.moves);
  const verification = verifySolution(state, moves);
  const stats = { searchMs: res.timeMs, tableMs: T.buildMs, nodes: res.nodes, phase1Length: res.phase1Length };
  if (!rawCheck.ok || !verification.ok)
    return {
      status: 'internal-error',
      issues,
      notes,
      rawMoves: res.moves,
      moves,
      verification,
      stats,
      message: 'Internal solver/state-model error: the generated sequence did not solve the puzzle on replay. It is not shown as a solution.',
    };
  return { status: 'solved', issues, notes, rawMoves: res.moves, moves, verification, stats, message: `Solution found: ${moves.length} moves` };
}
