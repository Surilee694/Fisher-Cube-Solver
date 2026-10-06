/**
 * Sticker representation of a Fischer Cube.
 *
 * Because Fischer pieces change the outer shape when they move, a flat
 * "6 faces × 9 stickers of the outer cube" picture only exists for cube-shaped
 * states. Instead we use the MECHANISM net: look straight at each of the six
 * mechanism faces (U, D, and the four vertical edges R, F, L, B) and record the
 * colour of each piece there. Edge cells are split into two halves and centre
 * cells into four quarters, because a single Fischer piece can show two
 * colours on one mechanism facet (e.g. the R centre is red on its front half
 * and blue on its back half). That gives 96 cells, 16 of each colour, and it
 * describes EVERY reachable shape unambiguously (up to invisible rotations).
 */
import { CUBIE_CODE, CUBIE_TYPE, NUM_CUBIES, rotationsCarrying } from './geometry';
import { COLORS, COLOR_NAMES, fischerShell, pieceName, type Color, type Shell } from './fischerShell';
import { occupancy, type CubeState } from './state';
import { centerTurns, cornerTwist, edgeFlip } from './cubies';
import type { Issue } from './validation';

export type FaceletColor = Color | '?';

export function faceletsOf(s: CubeState, shell: Shell = fischerShell()): Color[] {
  const { bySlot, collisions } = occupancy(s);
  if (collisions.length) throw new Error('cannot draw a state with overlapping cubies');
  const out = new Array<Color>(shell.samples.length);
  for (let slot = 0; slot < NUM_CUBIES; slot++) {
    const c = bySlot[slot]!;
    const cols = shell.expectedColors(slot, c, s.rot[c]);
    shell.samplesBySlot[slot].forEach((i, k) => (out[i] = cols[k]));
  }
  return out;
}

const orientationValue = (c: number, slot: number, r: number) =>
  c < 8 ? cornerTwist(c, slot, r) : c < 20 ? edgeFlip(c, slot, r) : centerTurns(c - 20, r);

export interface DecodeResult {
  state: CubeState | null;
  issues: Issue[];
  /** slots whose colours match no piece (for highlighting in the editor) */
  badSlots: number[];
  /** invisible choices that had to be made (reported, never silent) */
  notes: string[];
  /** per slot: the uniquely identified piece and rotation, or null (for partial 3D display) */
  assignments: ({ cubie: number; rot: number } | null)[];
}

export function decodeFacelets(f: readonly FaceletColor[], shell: Shell = fischerShell()): DecodeResult {
  const issues: Issue[] = [];
  const notes: string[] = [];
  if (f.length !== shell.samples.length) {
    return { state: null, issues: [{ severity: 'error', code: 'malformed', message: 'Wrong number of stickers.' }], badSlots: [], notes, assignments: [] };
  }
  const unknown = f.filter((x) => x === '?').length;
  if (unknown) {
    issues.push({ severity: 'error', code: 'incomplete', message: `${unknown} sticker cell${unknown > 1 ? 's are' : ' is'} still blank.` });
  }
  const perColor = shell.samples.length / COLORS.length;
  const counts = COLORS.map((c) => f.filter((x) => x === c).length);
  const wrong = COLORS.filter((_, i) => counts[i] !== perColor);
  if (!unknown && wrong.length) {
    issues.push({
      severity: 'error',
      code: 'sticker-count',
      message: `Impossible sticker counts: every colour must appear exactly ${perColor} times, but ${wrong
        .map((c) => `${COLOR_NAMES[c]} appears ${counts[COLORS.indexOf(c)]}`)
        .join(', ')}.`,
    });
  }

  const badSlots: number[] = [];
  const hidden: number[] = [];
  const assigned: { cubie: number; rot: number }[] = new Array(NUM_CUBIES);
  for (let slot = 0; slot < NUM_CUBIES; slot++) {
    const seen = shell.samplesBySlot[slot].map((i) => f[i]);
    if (seen.includes('?')) continue;
    const matches: { cubie: number; rot: number }[] = [];
    for (let c = 0; c < NUM_CUBIES; c++) {
      if (CUBIE_TYPE[c] !== CUBIE_TYPE[slot]) continue;
      if (CUBIE_TYPE[c] === 'center' && c !== slot) continue; // centres never move
      for (const r of rotationsCarrying(c, slot)) {
        const exp = shell.expectedColors(slot, c, r);
        if (exp.every((x, k) => x === seen[k])) matches.push({ cubie: c, rot: r });
      }
    }
    if (matches.length === 0) {
      badSlots.push(slot);
      issues.push({
        severity: 'error',
        code: 'no-piece',
        message: `The colours at ${CUBIE_CODE[slot]} (${seen.map((x) => COLOR_NAMES[x as Color]).join(', ')}) do not match any ${CUBIE_TYPE[slot]} piece in any orientation.`,
        slots: [slot],
      });
      continue;
    }
    const cubies = [...new Set(matches.map((m) => m.cubie))];
    if (cubies.length > 1) {
      badSlots.push(slot);
      issues.push({ severity: 'error', code: 'ambiguous', message: `The colours at ${CUBIE_CODE[slot]} fit more than one piece.`, slots: [slot] });
      continue;
    }
    // Several rotations look identical -> the difference is invisible. Prefer orientation 0.
    const best = matches.find((m) => orientationValue(m.cubie, slot, m.rot) === 0) ?? matches[0];
    if (matches.length > 1 && CUBIE_TYPE[best.cubie] !== 'center') hidden.push(best.cubie);
    assigned[slot] = best;
  }

  if (hidden.length)
    notes.push(
      `${hidden.length === 1 ? `The ${pieceName(hidden[0], shell)} looks` : `${hidden.length} single-colour middle edges look`} the same flipped or unflipped; ${hidden.length === 1 ? 'it was' : 'they were'} taken as unflipped. This cannot affect the solution.`,
    );

  // duplicates / missing pieces
  const where = new Map<number, number[]>();
  assigned.forEach((a, slot) => a && where.set(a.cubie, [...(where.get(a.cubie) ?? []), slot]));
  for (const [c, slots] of where)
    if (slots.length > 1)
      issues.push({
        severity: 'error',
        code: 'duplicate',
        message: `The entered state contains ${slots.length} copies of the ${pieceName(c, shell)} (at ${slots.map((s) => CUBIE_CODE[s]).join(' and ')}).`,
        slots,
      });
  const complete = assigned.filter(Boolean).length === NUM_CUBIES;
  if (complete) {
    const missing = Array.from({ length: NUM_CUBIES }, (_, c) => c).filter((c) => !where.has(c));
    for (const c of missing) issues.push({ severity: 'error', code: 'missing', message: `The ${pieceName(c, shell)} is missing.` });
  }

  const assignments = Array.from({ length: NUM_CUBIES }, (_, slot) => assigned[slot] ?? null);
  if (issues.some((i) => i.severity === 'error') || !complete) return { state: null, issues, badSlots, notes, assignments };
  const rot = new Array<number>(NUM_CUBIES);
  assigned.forEach((a) => (rot[a.cubie] = a.rot));
  return { state: { rot }, issues, badSlots, notes, assignments };
}

export const blankFacelets = (shell: Shell = fischerShell()): FaceletColor[] => shell.samples.map(() => '?');
