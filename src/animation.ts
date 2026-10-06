import { moveTurns } from '../cube/moves';

/** Small tween helper driven by the renderer's frame loop. */
export interface Tween {
  start: number;
  duration: number;
  update: (t: number) => void;
  done: () => void;
}
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export function stepTween(tw: Tween, now: number): boolean {
  const t = Math.min(1, (now - tw.start) / Math.max(1, tw.duration));
  tw.update(easeInOut(t));
  if (t >= 1) {
    tw.done();
    return true;
  }
  return false;
}

/**
 * Signed angle (radians) of move m about its face's OUTWARD normal.
 * Clockwise as seen from outside = negative angle (right-hand rule).
 */
export function moveAngle(m: number): number {
  const t = moveTurns(m);
  return t === 3 ? Math.PI / 2 : (-Math.PI / 2) * t;
}
