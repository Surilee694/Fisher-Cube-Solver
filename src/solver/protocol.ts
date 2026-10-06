import type { SolveResult, SolveStage } from './solve';

export type WorkerRequest =
  | { type: 'warmup' }
  | { type: 'solve'; id: number; rot: number[]; timeLimitMs: number }
  | { type: 'scramble-test'; id: number; count: number; length: number; seed: number };

export interface ScrambleTestItem {
  index: number;
  scramble: string;
  ok: boolean;
  length: number;
  ms: number;
  message: string;
}

export type WorkerResponse =
  | { type: 'ready'; tableMs: number }
  | { type: 'stage'; id: number; stage: SolveStage }
  | { type: 'progress'; id: number; length: number }
  | { type: 'result'; id: number; result: SolveResult }
  | { type: 'test-item'; id: number; item: ScrambleTestItem }
  | { type: 'test-done'; id: number; passed: number; failed: number }
  | { type: 'error'; id: number; message: string };
