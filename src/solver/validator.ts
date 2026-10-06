import { applyMove } from '../cube/moves';
import type { CubeState } from '../cube/state';
import { isSolved, looksSolved, unsolvedReasons } from '../cube/solvedState';
import { fischerShell, type Shell } from '../cube/fischerShell';

export interface Verification {
  ok: boolean;
  /** cubie-level check: every piece home with an undetectable rotation */
  physicallySolved: boolean;
  /** independent sticker-level check: the 96 sticker cells equal the solved picture */
  stickersSolved: boolean;
  reasons: string[];
  movesReplayed: number;
}

/**
 * Replay every move from the ORIGINAL entered state through the move engine
 * and check the result two independent ways. A solution is only shown to the
 * user when this passes.
 */
export function verifySolution(start: CubeState, moves: readonly number[], shell: Shell = fischerShell()): Verification {
  let s = start;
  for (const m of moves) s = applyMove(s, m);
  const physicallySolved = isSolved(s, shell);
  const stickersSolved = looksSolved(s, shell);
  return {
    ok: physicallySolved && stickersSolved,
    physicallySolved,
    stickersSolved,
    reasons: physicallySolved ? [] : unsolvedReasons(s, shell),
    movesReplayed: moves.length,
  };
}
