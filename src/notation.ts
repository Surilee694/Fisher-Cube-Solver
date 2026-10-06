import { FACE_NAMES, ROT_IDENTITY } from './geometry';
import { makeMove, moveName, puzzleFaceForViewerFace, rotateView, type RotationAxis } from './moves';

export interface ParsedSequence {
  /** Face moves expressed in the PUZZLE frame (ready for applyMove). */
  moves: number[];
  /** Viewing orientation after all whole-cube rotations in the sequence. */
  view: number;
}

export class NotationError extends Error {}

/**
 * Parse standard notation, e.g. "R U R' U' F2 x y2 z'".
 * Face letters are interpreted relative to the current viewing orientation;
 * x/y/z only change that orientation (they never alter the puzzle state).
 * Accepts ’ ′ as primes and "2'" as a half turn.
 */
export function parseSequence(text: string, startView: number = ROT_IDENTITY): ParsedSequence {
  const cleaned = text.replace(/[’′`]/g, "'").replace(/[()[\],]/g, ' ').trim();
  const moves: number[] = [];
  let view = startView;
  if (!cleaned) return { moves, view };
  for (const tok of cleaned.split(/\s+/)) {
    const m = /^([URFDLBxyz])(2'?|'2?|3|1)?$/.exec(tok);
    if (!m) throw new NotationError(`Unrecognised move "${tok}". Use U R F D L B (plus ' or 2) and x y z.`);
    const suffix = m[2] ?? '';
    const turns = suffix.startsWith('2') || suffix === "'2" ? 2 : suffix === "'" || suffix === '3' ? 3 : 1;
    const letter = m[1];
    if (letter === 'x' || letter === 'y' || letter === 'z') {
      view = rotateView(view, letter as RotationAxis, turns);
    } else {
      const viewerFace = FACE_NAMES.indexOf(letter as (typeof FACE_NAMES)[number]);
      moves.push(makeMove(puzzleFaceForViewerFace(view, viewerFace), turns));
    }
  }
  return { moves, view };
}

export const formatSequence = (ms: readonly number[]) => ms.map(moveName).join(' ');
