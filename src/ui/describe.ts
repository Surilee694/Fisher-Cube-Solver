/** Human-facing names for moves, faces and pieces. */
import { CUBIE_CODE, FACE_LONG_NAMES, FACE_NAMES, ROT_COMPOSE, ROT_IDENTITY } from '../cube/geometry';
import { COLOR_NAMES, fischerShell } from '../cube/fischerShell';
import { moveFace, moveInView, moveTurns, puzzleFaceForViewerFace, rotateView, viewerFaceForPuzzleFace } from '../cube/moves';

const PRIME = '\u2032';
/** Typographic move label, e.g. R′ (the copyable form uses an apostrophe). */
export const moveLabel = (m: number) => FACE_NAMES[moveFace(m)] + (moveTurns(m) === 2 ? '2' : moveTurns(m) === 3 ? PRIME : '');
export const moveText = (m: number) => FACE_NAMES[moveFace(m)] + (moveTurns(m) === 2 ? '2' : moveTurns(m) === 3 ? "'" : '');

/** "red and blue" – the colours on the centre of puzzle face f (never change: centres stay put). */
export function centreColours(puzzleFace: number): string {
  const cols = fischerShell().pieceColors[20 + puzzleFace].map((c) => COLOR_NAMES[c]);
  return cols.length === 1 ? cols[0] : `${cols[0]} and ${cols[1]}`;
}

const SEEN_FROM = ['above', 'the right', 'the front', 'below', 'the left', 'the back'];
const LAYER_WORD = ['top layer', 'right layer', 'front layer', 'bottom layer', 'left layer', 'back layer'];

/**
 * Plain-language instruction for puzzle-frame move m, as the user holds the
 * puzzle (view). Returns the notation in the user's frame plus a sentence.
 */
export function describeMove(view: number, m: number): { label: string; text: string; sentence: string; detail: string } {
  const vm = moveInView(view, m);
  const vf = moveFace(vm);
  const t = moveTurns(vm);
  const dir = t === 1 ? 'clockwise' : t === 3 ? 'counter-clockwise' : 'half a turn (180°)';
  const sentence = `Turn the ${FACE_LONG_NAMES[vf]} face ${dir}`;
  const detail =
    `That is the ${LAYER_WORD[vf]}, whose centre shows ${centreColours(moveFace(m))}.` +
    (t === 2 ? ' Either direction works.' : ` ${t === 1 ? 'Clockwise' : 'Counter-clockwise'} as seen looking at it from ${SEEN_FROM[vf]}.`);
  return { label: moveLabel(vm), text: moveText(vm), sentence, detail };
}

/** View that puts puzzle face `top` up and puzzle face `front` towards the viewer (null if impossible). */
export function viewFor(top: number, front: number): number | null {
  for (let r = 0; r < 24; r++) if (viewerFaceForPuzzleFace(r, top) === 0 && viewerFaceForPuzzleFace(r, front) === 2) return r;
  return null;
}
export const topFace = (view: number) => puzzleFaceForViewerFace(view, 0);
export const frontFace = (view: number) => puzzleFaceForViewerFace(view, 2);

export const SLOT_DESCRIPTIONS: Record<string, string> = {
  URF: 'top-front-right corner',
  UFL: 'top-front-left corner',
  ULB: 'top-back-left corner',
  UBR: 'top-back-right corner',
  DFR: 'bottom-front-right corner',
  DLF: 'bottom-front-left corner',
  DBL: 'bottom-back-left corner',
  DRB: 'bottom-back-right corner',
  UR: 'top-right edge',
  UF: 'top-front edge',
  UL: 'top-left edge',
  UB: 'top-back edge',
  DR: 'bottom-right edge',
  DF: 'bottom-front edge',
  DL: 'bottom-left edge',
  DB: 'bottom-back edge',
  FR: 'middle front-right edge',
  FL: 'middle front-left edge',
  BL: 'middle back-left edge',
  BR: 'middle back-right edge',
  U: 'top centre',
  R: 'right centre',
  F: 'front centre',
  D: 'bottom centre',
  L: 'left centre',
  B: 'back centre',
};
export const slotDescription = (slot: number) => SLOT_DESCRIPTIONS[CUBIE_CODE[slot]];

export { rotateView, ROT_COMPOSE, ROT_IDENTITY };
