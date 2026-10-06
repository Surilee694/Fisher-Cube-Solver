/**
 * ============================================================================
 *  THE FISCHER SHELL  –  the one place where Fischer-specific geometry lives.
 * ============================================================================
 *
 * A Fischer Cube is a 3×3×3 MECHANISM whose OUTER SHELL is a cube rotated
 * 45° about one mechanism axis (here: the vertical Y axis). Each piece is the
 * intersection of its mechanism cell with that rotated outer cube:
 *
 *     piece(c) = { p : p lies in c's slab region (cut planes at ±CUT) }
 *              ∩ { p : n_k · p ≤ OUTER for each of the 6 outer faces n_k }
 *
 * Consequences that are DERIVED below (never hard-coded elsewhere):
 *   • The outer side faces of the shell face the mechanism's diagonals, so each
 *     side-layer centre (R, F, L, B) sits on a vertical edge of the shell and
 *     carries TWO coloured stickers. Its orientation is visible (mod 4).
 *   • U/D centres are square diamonds with one colour: their rotation is invisible.
 *   • Corners carry 2 stickers (top/bottom + one side), U/D-layer edges carry 3,
 *     E-slice edges carry 1. An E-slice edge looks identical when flipped.
 *
 * To model a different shape mod or variant, change SHELL_CONFIG only; every
 * other module (stickers, symmetry, visibility, solved test, renderer) follows.
 */
import {
  CUBIE_TYPE,
  HOME,
  NUM_CUBIES,
  ROTATIONS,
  rotationsCarrying,
  slotOfPosition,
  transpose,
  type Vec3,
} from './geometry';

export type Color = 'W' | 'Y' | 'G' | 'R' | 'B' | 'O';
export const COLORS: readonly Color[] = ['W', 'Y', 'G', 'R', 'B', 'O'];
export const COLOR_NAMES: Record<Color, string> = {
  W: 'white',
  Y: 'yellow',
  G: 'green',
  R: 'red',
  B: 'blue',
  O: 'orange',
};
export const COLOR_HEX: Record<Color, string> = {
  W: '#f5f5f2',
  Y: '#ffd21f',
  G: '#00a35a',
  R: '#c8102e',
  B: '#1650c8',
  O: '#ff6a13',
};

type V = [number, number, number];

export interface ShellConfig {
  name: string;
  /** Mechanism cut planes at ±cut (cubie cells are unit cubes). */
  cut: number;
  /** Distance from the centre to each outer face of the shell. */
  outerHalf: number;
  /** The outer cube is the standard-coloured cube rotated by twistDegrees about twistAxis. */
  twistAxis: Vec3;
  twistDegrees: number;
  /** Outer face colours BEFORE the twist (standard scheme). */
  baseFaces: { normal: Vec3; color: Color }[];
}

const STANDARD_SCHEME: ShellConfig['baseFaces'] = [
  { normal: [0, 1, 0], color: 'W' },
  { normal: [0, -1, 0], color: 'Y' },
  { normal: [0, 0, 1], color: 'G' },
  { normal: [1, 0, 0], color: 'R' },
  { normal: [0, 0, -1], color: 'B' },
  { normal: [-1, 0, 0], color: 'O' },
];

/**
 * The Fischer convention used by this application.
 * Twisting the standard cube by -45° about Y puts the GREEN face at front-left
 * (normal (-1,0,1)/√2), RED at front-right ((1,0,1)/√2), BLUE at back-right and
 * ORANGE at back-left. The mechanism's F centre therefore sits on the
 * green|red vertical edge, R on red|blue, B on blue|orange, L on orange|green.
 */
export const FISCHER_CONFIG: ShellConfig = {
  name: 'Fischer Cube (shell rotated 45° about the vertical axis)',
  cut: 0.5,
  outerHalf: 1.5,
  twistAxis: [0, 1, 0],
  twistDegrees: -45,
  baseFaces: STANDARD_SCHEME,
};

/** An ordinary 3×3 with the same mechanism – used only for comparison tests. */
export const STANDARD_3X3_CONFIG: ShellConfig = { ...FISCHER_CONFIG, name: 'Standard 3×3', twistDegrees: 0 };

// ---------------------------------------------------------------------------
const dotf = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossf = (a: readonly number[], b: readonly number[]): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mulMV = (m: readonly number[], v: readonly number[]): V => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
function rotateAbout(axis: Vec3, deg: number, v: Vec3): V {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t),
    s = Math.sin(t);
  const k = axis;
  const kv = crossf(k, v);
  const kd = dotf(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c)) as V;
}

export interface OuterFace {
  normal: V;
  color: Color;
}
export interface Polygon {
  vertices: V[];
  normal: V;
  kind: 'sticker' | 'inner';
  color?: Color;
}
export interface Polyhedron {
  vertices: V[];
  faces: Polygon[];
}
/**
 * A sticker sample: one cell (or sub-cell) of the 6×9 mechanism-facelet net.
 * It records the colour you see looking straight at mechanism face `face`
 * at a specific spot of the piece occupying `slot`.
 */
export interface Sample {
  index: number;
  face: number; // mechanism face 0..5 (U R F D L B)
  row: number;
  col: number;
  /** sub-rectangle inside the cell, in cell units [x0, y0, x1, y1], y pointing down. */
  sub: [number, number, number, number];
  slot: number;
  point: V;
  dir: Vec3;
}

/** Net viewing axes for each mechanism face, as seen from outside: [right, up]. */
export const NET_AXES: readonly [Vec3, Vec3][] = [
  [
    [1, 0, 0],
    [0, 0, -1],
  ], // U  (F at the bottom)
  [
    [0, 0, -1],
    [0, 1, 0],
  ], // R
  [
    [1, 0, 0],
    [0, 1, 0],
  ], // F
  [
    [1, 0, 0],
    [0, 0, 1],
  ], // D  (F at the top)
  [
    [0, 0, 1],
    [0, 1, 0],
  ], // L
  [
    [-1, 0, 0],
    [0, 1, 0],
  ], // B
];

export interface Shell {
  config: ShellConfig;
  faces: OuterFace[];
  rayColor(p: readonly number[], d: readonly number[]): Color;
  polyhedron(cubie: number, gap?: number): Polyhedron;
  samples: Sample[];
  samplesBySlot: number[][];
  /** Colours shown at the samples of `slot` when cubie `c` sits there with rotation r. */
  expectedColors(slot: number, cubie: number, r: number): Color[];
  /** Rotations that map cubie c onto itself with no visible change (shape AND colours). */
  symmetries: number[][];
  /** Size of the stabiliser of each cubie's home (corners 3, edges 2, centres 4). */
  stabilizerSize: number[];
  pieceColors: Color[][];
  solvedFacelets: Color[];
}

const SAMPLE_DEPTH = 1.0; // along a slot's non-zero axes
const SAMPLE_SUB = 0.25; // offset for split (sub-)cells
const EPS = 1e-7;

export function createShell(config: ShellConfig): Shell {
  const faces: OuterFace[] = config.baseFaces.map((f) => ({
    normal: rotateAbout(config.twistAxis, config.twistDegrees, f.normal),
    color: f.color,
  }));

  function rayColor(p: readonly number[], d: readonly number[]): Color {
    let best = Infinity,
      second = Infinity,
      color: Color | null = null;
    for (const f of faces) {
      const nd = dotf(f.normal, d);
      if (nd <= EPS) continue;
      const t = (config.outerHalf - dotf(f.normal, p)) / nd;
      if (t < best) {
        second = best;
        best = t;
        color = f.color;
      } else if (t < second) second = t;
    }
    if (color === null || best <= 0) throw new Error('sample ray does not exit the shell properly');
    if (second - best < 1e-6) throw new Error('sample ray hits a shell edge (ambiguous colour)');
    return color;
  }

  // --- piece polyhedra ------------------------------------------------------
  function polyhedron(c: number, gap = 0): Polyhedron {
    const h = HOME[c];
    type HS = { n: V; d: number; kind: 'sticker' | 'inner'; color?: Color };
    const hs: HS[] = [];
    for (let i = 0; i < 3; i++) {
      const e: V = [0, 0, 0];
      e[i] = 1;
      const ne: V = [-e[0], -e[1], -e[2]];
      if (h[i] === 1) hs.push({ n: ne, d: -(config.cut + gap), kind: 'inner' });
      else if (h[i] === -1) hs.push({ n: e, d: -(config.cut + gap), kind: 'inner' });
      else {
        hs.push({ n: e, d: config.cut - gap, kind: 'inner' });
        hs.push({ n: ne, d: config.cut - gap, kind: 'inner' });
      }
    }
    for (const f of faces) hs.push({ n: f.normal, d: config.outerHalf, kind: 'sticker', color: f.color });

    const verts: V[] = [];
    const inside = (p: V) => hs.every((q) => dotf(q.n, p) <= q.d + 1e-9);
    for (let a = 0; a < hs.length; a++)
      for (let b = a + 1; b < hs.length; b++)
        for (let k = b + 1; k < hs.length; k++) {
          const A = hs[a].n,
            B = hs[b].n,
            C = hs[k].n;
          const det = dotf(A, crossf(B, C));
          if (Math.abs(det) < 1e-12) continue;
          const bc = crossf(B, C),
            ca = crossf(C, A),
            ab = crossf(A, B);
          const p: V = [0, 1, 2].map((i) => (hs[a].d * bc[i] + hs[b].d * ca[i] + hs[k].d * ab[i]) / det) as V;
          if (inside(p) && !verts.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]) < 1e-7)) verts.push(p);
        }

    const polys: Polygon[] = [];
    for (const q of hs) {
      const on = verts.filter((v) => Math.abs(dotf(q.n, v) - q.d) < 1e-7);
      if (on.length < 3) continue;
      const cen: V = [0, 1, 2].map((i) => on.reduce((s, v) => s + v[i], 0) / on.length) as V;
      const ref: V = Math.abs(q.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = crossf(ref, q.n);
      const ul = Math.hypot(...u);
      const uu: V = [u[0] / ul, u[1] / ul, u[2] / ul];
      const w = crossf(q.n, uu); // uu × w = n  -> CCW seen from outside
      const sorted = on
        .map((v) => {
          const r = [v[0] - cen[0], v[1] - cen[1], v[2] - cen[2]];
          return { v, a: Math.atan2(dotf(r, w), dotf(r, uu)) };
        })
        .sort((x, y) => x.a - y.a)
        .map((x) => x.v);
      // area check (skip degenerate)
      let area = 0;
      for (let i = 1; i + 1 < sorted.length; i++) {
        const e1 = sorted[i].map((x, j) => x - sorted[0][j]);
        const e2 = sorted[i + 1].map((x, j) => x - sorted[0][j]);
        area += Math.hypot(...crossf(e1, e2)) / 2;
      }
      if (area < 1e-6) continue;
      polys.push({ vertices: sorted, normal: q.n, kind: q.kind, color: q.color });
    }
    return { vertices: verts, faces: polys };
  }

  // --- sticker samples (the 96-cell mechanism-facelet net) -------------------
  const samples: Sample[] = [];
  for (let f = 0; f < 6; f++) {
    const n = [0, 1, 2].map((i) => (i === [1, 0, 2, 1, 0, 2][f] ? [1, 1, 1, -1, -1, -1][f] : 0)) as unknown as Vec3;
    const [r, u] = NET_AXES[f];
    const cells: { row: number; col: number; slot: number; a: number; b: number }[] = [];
    for (let s = 0; s < NUM_CUBIES; s++) {
      const q = HOME[s];
      if (dotf(q, n) !== 1) continue;
      const a = dotf(q, r),
        b = dotf(q, u);
      cells.push({ row: 1 - b, col: a + 1, slot: s, a, b });
    }
    cells.sort((x, y) => x.row - y.row || x.col - y.col);
    for (const cell of cells) {
      const us = cell.b === 0 ? [1, -1] : [cell.b];
      const rs = cell.a === 0 ? [-1, 1] : [cell.a];
      for (const su of us)
        for (const sr of rs) {
          const ro = cell.a !== 0 ? cell.a * SAMPLE_DEPTH : sr * SAMPLE_SUB;
          const uo = cell.b !== 0 ? cell.b * SAMPLE_DEPTH : su * SAMPLE_SUB;
          const point = [0, 1, 2].map((i) => n[i] * config.cut + r[i] * ro + u[i] * uo) as V;
          const x0 = cell.a === 0 ? (sr < 0 ? 0 : 0.5) : 0;
          const x1 = cell.a === 0 ? (sr < 0 ? 0.5 : 1) : 1;
          const y0 = cell.b === 0 ? (su > 0 ? 0 : 0.5) : 0;
          const y1 = cell.b === 0 ? (su > 0 ? 0.5 : 1) : 1;
          samples.push({ index: samples.length, face: f, row: cell.row, col: cell.col, sub: [x0, y0, x1, y1], slot: cell.slot, point, dir: n });
        }
    }
  }
  const samplesBySlot: number[][] = Array.from({ length: NUM_CUBIES }, () => []);
  for (const s of samples) samplesBySlot[s.slot].push(s.index);

  const cache = new Map<number, Color[]>();
  function expectedColors(slot: number, c: number, r: number): Color[] {
    const key = (slot * NUM_CUBIES + c) * 24 + r;
    let out = cache.get(key);
    if (out) return out;
    const inv = transpose(ROTATIONS[r]);
    out = samplesBySlot[slot].map((i) => rayColor(mulMV(inv, samples[i].point), mulMV(inv, samples[i].dir)));
    cache.set(key, out);
    return out;
  }

  // --- piece symmetries: rotations that are physically undetectable --------
  const stabilizerSize: number[] = [];
  const symmetries: number[][] = [];
  for (let c = 0; c < NUM_CUBIES; c++) {
    const stab = rotationsCarrying(c, c);
    stabilizerSize.push(stab.length);
    const base = expectedColors(c, c, 0);
    const poly = polyhedron(c, 0);
    symmetries.push(
      stab.filter((r) => {
        const cols = expectedColors(c, c, r);
        if (cols.some((x, i) => x !== base[i])) return false;
        const M = ROTATIONS[r];
        // shape: the rotated vertex set must coincide with the original
        if (!poly.vertices.every((v) => poly.vertices.some((w) => Math.hypot(...mulMV(M, v).map((x, i) => x - w[i])) < 1e-6)))
          return false;
        // colours of sticker polygons must map onto same-coloured polygons
        return poly.faces
          .filter((p) => p.kind === 'sticker')
          .every((p) => {
            const nn = mulMV(M, p.normal);
            const target = poly.faces.find((q) => q.kind === 'sticker' && Math.hypot(...nn.map((x, i) => x - q.normal[i])) < 1e-6);
            return target !== undefined && target.color === p.color;
          });
      }),
    );
  }

  const solvedFacelets = samples.map((s) => expectedColors(s.slot, s.slot, 0)[samplesBySlot[s.slot].indexOf(s.index)]);
  const pieceColors = Array.from({ length: NUM_CUBIES }, (_, c) => {
    const poly = polyhedron(c, 0);
    const out: Color[] = [];
    for (const p of poly.faces) if (p.kind === 'sticker' && p.color && !out.includes(p.color)) out.push(p.color);
    // order: U/D colour first, then the rest in solved-sample order
    const sampleOrder = expectedColors(c, c, 0);
    return out.sort((a, b) => {
      const ud = (x: Color) => (x === 'W' || x === 'Y' ? 0 : 1);
      return ud(a) - ud(b) || sampleOrder.indexOf(a) - sampleOrder.indexOf(b);
    });
  });

  return {
    config,
    faces,
    rayColor,
    polyhedron,
    samples,
    samplesBySlot,
    expectedColors,
    symmetries,
    stabilizerSize,
    pieceColors,
    solvedFacelets,
  };
}

let fischer: Shell | null = null;
/** The shell used throughout the app (lazy singleton). */
export function fischerShell(): Shell {
  if (!fischer) fischer = createShell(FISCHER_CONFIG);
  return fischer;
}

/** Human-friendly name of a piece, e.g. "white–red–blue edge". */
export function pieceName(c: number, shell: Shell = fischerShell()): string {
  return `${shell.pieceColors[c].map((x) => COLOR_NAMES[x]).join('–')} ${CUBIE_TYPE[c]}`;
}

/** Does the orientation of cubie c show at all? (false: every orientation looks the same) */
export const orientationVisible = (c: number, shell: Shell = fischerShell()) => shell.symmetries[c].length < shell.stabilizerSize[c];

export { slotOfPosition };
