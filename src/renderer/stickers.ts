/**
 * Mesh construction for Fischer pieces. Every piece is built from the exact
 * polyhedron produced by the centralized shell module (cube/fischerShell), so
 * what you see IS the mathematical piece: body (dark plastic) + inset stickers.
 */
import * as THREE from 'three';
import { COLOR_HEX, type Color, type Polygon, type Shell } from '../cube/fischerShell';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Fan-triangulated, flat-shaded geometry from convex polygons. */
function polygonsGeometry(polys: { vertices: V[]; normal: V }[], offset = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of polys) {
    const n = p.normal;
    const vs = p.vertices.map((v) => [v[0] + n[0] * offset, v[1] + n[1] * offset, v[2] + n[2] * offset]);
    for (let i = 1; i + 1 < vs.length; i++)
      for (const v of [vs[0], vs[i], vs[i + 1]]) {
        pos.push(...v);
        nor.push(...n);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * Inset a convex polygon (vertices CCW seen from outside) by distance d inside
 * its plane. Returns null if the polygon is too small to carry a sticker.
 */
export function insetPolygon(vertices: V[], normal: V, d: number): V[] | null {
  const n = vertices.length;
  const lines: { p: V; dir: V }[] = [];
  for (let i = 0; i < n; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % n];
    const dir = norm(sub(b, a));
    const inward = cross(normal, dir); // CCW polygon: normal × edge points inside
    lines.push({ p: [a[0] + inward[0] * d, a[1] + inward[1] * d, a[2] + inward[2] * d], dir });
  }
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i + n - 1) % n],
      L2 = lines[i];
    // intersect p1 + s*d1 with p2 + t*d2 (coplanar)
    const w = sub(L2.p, L1.p);
    const c = cross(L1.dir, L2.dir);
    const cc = dot(c, c);
    if (cc < 1e-12) return null;
    const s = dot(cross(w, L2.dir), c) / cc;
    out.push([L1.p[0] + L1.dir[0] * s, L1.p[1] + L1.dir[1] * s, L1.p[2] + L1.dir[2] * s]);
  }
  // reject if orientation flipped (polygon collapsed)
  let area = 0;
  for (let i = 1; i + 1 < n; i++) area += dot(cross(sub(out[i], out[0]), sub(out[i + 1], out[0])), normal);
  return area > 0.02 ? out : null;
}

export const BODY_COLOR = 0x1c1f26;
const stickerMaterials = new Map<string, THREE.MeshStandardMaterial>();
export function stickerMaterial(color: Color | '?'): THREE.MeshStandardMaterial {
  let m = stickerMaterials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: color === '?' ? 0x8a919c : COLOR_HEX[color],
      roughness: 0.42,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    stickerMaterials.set(color, m);
  }
  return m;
}

export interface PieceTemplate {
  group: THREE.Group;
}

/** Build one piece (in its solved pose) for cubie c. `blank` = grey stickers (unknown piece). */
export function buildPiece(shell: Shell, cubie: number, blank = false): THREE.Group {
  const poly = shell.polyhedron(cubie, 0.03);
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    polygonsGeometry(poly.faces as unknown as { vertices: V[]; normal: V }[]),
    new THREE.MeshStandardMaterial({ color: blank ? 0x3a3f49 : BODY_COLOR, roughness: 0.55, metalness: 0.05 }),
  );
  body.userData.role = 'body';
  group.add(body);
  for (const f of poly.faces as Polygon[]) {
    if (f.kind !== 'sticker' || !f.color) continue;
    const inset = insetPolygon(f.vertices as V[], f.normal as V, 0.075);
    if (!inset) continue;
    const mesh = new THREE.Mesh(polygonsGeometry([{ vertices: inset, normal: f.normal as V }], 0.004), stickerMaterial(blank ? '?' : f.color));
    mesh.userData.role = 'sticker';
    mesh.userData.color = f.color;
    group.add(mesh);
  }
  group.userData.cubie = cubie;
  group.traverse((o) => (o.userData.cubie = cubie));
  return group;
}

/** 3×3 row-major rotation → quaternion. */
export function quaternionOfRotation(m: readonly number[]): THREE.Quaternion {
  const M = new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(M);
}
