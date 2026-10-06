import { applyMoves } from '../cube/moves';
import { formatSequence } from '../cube/notation';
import { isSolved, looksSolved } from '../cube/solvedState';
import { rng, scramble } from '../input/scramble';
import { solveState } from './solve';
import type { ScrambleTestItem } from './protocol';

/** scramble → solve → replay → isSolved, N times (used by the Developer panel). */
export function runScrambleTest(count: number, length: number, seed: number, onItem: (i: ScrambleTestItem) => void) {
  const random = rng(seed);
  let passed = 0,
    failed = 0;
  for (let i = 0; i < count; i++) {
    const t = Date.now();
    const sc = scramble(length, random);
    const res = solveState(sc.state, { timeLimitMs: 100, hardLimitMs: 30_000 });
    const end = applyMoves(sc.state, res.moves);
    const ok = res.status === 'solved' && isSolved(end) && looksSolved(end);
    if (ok) passed++;
    else failed++;
    onItem({ index: i + 1, scramble: formatSequence(sc.moves), ok, length: res.moves.length, ms: Date.now() - t, message: res.message });
  }
  return { passed, failed };
}
