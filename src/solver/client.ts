/**
 * Promise-based front end for the solver worker. If a Worker cannot be created
 * (old browser, restrictive sandbox), it falls back to running the same pipeline
 * on the main thread in small async steps, and says so in the status.
 */
import type { CubeState } from '../cube/state';
import type { SolveResult, SolveStage } from './solve';
import type { ScrambleTestItem, WorkerRequest, WorkerResponse } from './protocol';

export interface SolveCallbacks {
  onStage?: (s: SolveStage) => void;
  onProgress?: (length: number) => void;
}

type Pending = {
  resolve: (r: SolveResult) => void;
  reject: (e: Error) => void;
  cb: SolveCallbacks;
  onItem?: (i: ScrambleTestItem) => void;
  onDone?: (p: number, f: number) => void;
};

export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  readonly mode: 'worker' | 'main-thread';
  ready: Promise<void>;

  constructor() {
    let readyResolve!: () => void;
    this.ready = new Promise((r) => (readyResolve = r));
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        if (m.type === 'ready') return readyResolve();
        const p = this.pending.get(m.id);
        if (!p) return;
        if (m.type === 'stage') p.cb.onStage?.(m.stage);
        else if (m.type === 'progress') p.cb.onProgress?.(m.length);
        else if (m.type === 'result') {
          this.pending.delete(m.id);
          p.resolve(m.result);
        } else if (m.type === 'test-item') p.onItem?.(m.item);
        else if (m.type === 'test-done') {
          this.pending.delete(m.id);
          p.onDone?.(m.passed, m.failed);
        } else if (m.type === 'error') {
          this.pending.delete(m.id);
          p.reject(new Error(m.message));
        }
      };
      this.worker.onerror = () => this.failOver();
      this.mode = 'worker';
      this.post({ type: 'warmup' });
    } catch {
      this.worker = null;
      this.mode = 'main-thread';
      readyResolve();
    }
  }

  private failOver() {
    this.worker?.terminate();
    this.worker = null;
    (this as { mode: string }).mode = 'main-thread';
    for (const [, p] of this.pending) p.reject(new Error('The solver worker failed to start. Please retry; the solver will run on the main thread.'));
    this.pending.clear();
  }

  private post(m: WorkerRequest) {
    this.worker!.postMessage(m);
  }

  async solve(state: CubeState, timeLimitMs: number, cb: SolveCallbacks = {}): Promise<SolveResult> {
    if (this.worker) {
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, cb });
        this.post({ type: 'solve', id, rot: state.rot.slice(), timeLimitMs });
      });
    }
    // fallback: same pipeline, main thread (yield first so the status can paint)
    await new Promise((r) => setTimeout(r, 30));
    const { solveState } = await import('./solve');
    return solveState(state, { timeLimitMs: Math.min(timeLimitMs, 500), onImprovement: cb.onProgress }, cb.onStage);
  }

  async scrambleTest(count: number, length: number, seed: number, onItem: (i: ScrambleTestItem) => void): Promise<{ passed: number; failed: number }> {
    if (this.worker) {
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve: () => undefined, reject, cb: {}, onItem, onDone: (passed, failed) => resolve({ passed, failed }) });
        this.post({ type: 'scramble-test', id, count, length, seed });
      });
    }
    const { runScrambleTest } = await import('./selfTest');
    let passed = 0,
      failed = 0;
    for (let i = 0; i < count; i++) {
      await new Promise((r) => setTimeout(r, 0));
      const r = runScrambleTest(1, length, seed + i, (item) => onItem({ ...item, index: i + 1 }));
      passed += r.passed;
      failed += r.failed;
    }
    return { passed, failed };
  }
}

let shared: SolverClient | null = null;
/** One solver (and one worker) per page. */
export function getSolverClient(): SolverClient {
  if (!shared) shared = new SolverClient();
  return shared;
}
