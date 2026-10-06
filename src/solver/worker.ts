/// <reference lib="webworker" />
/**
 * Web Worker: builds the pruning tables once and runs every search off the UI
 * thread. The main thread never runs a search while a worker is available.
 */
import { getTables } from './pruning';
import { solveState } from './solve';
import { runScrambleTest } from './selfTest';
import type { WorkerRequest, WorkerResponse } from './protocol';

const post = (m: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'warmup') {
      post({ type: 'ready', tableMs: getTables().buildMs });
    } else if (req.type === 'solve') {
      const result = solveState(
        { rot: req.rot },
        { timeLimitMs: req.timeLimitMs, hardLimitMs: 60_000, onImprovement: (length) => post({ type: 'progress', id: req.id, length }) },
        (stage) => post({ type: 'stage', id: req.id, stage }),
      );
      post({ type: 'result', id: req.id, result });
    } else if (req.type === 'scramble-test') {
      const { passed, failed } = runScrambleTest(req.count, req.length, req.seed, (item) => post({ type: 'test-item', id: req.id, item }));
      post({ type: 'test-done', id: req.id, passed, failed });
    }
  } catch (e) {
    post({ type: 'error', id: 'id' in req ? req.id : 0, message: e instanceof Error ? e.message : String(e) });
  }
};
