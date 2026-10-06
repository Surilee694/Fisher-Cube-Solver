import * as THREE from 'three';
import { FACE_NORMALS } from '../cube/geometry';

/** Curved arrow around a face's axis, pointing in the clockwise (seen from outside) direction. */
export function makeArrow(face: number, turns: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f5bea, emissive: 0x2f5bea, emissiveIntensity: 0.35, roughness: 0.4 });
  const R = 2.05;
  const sweep = turns === 2 ? Math.PI * 1.1 : Math.PI * 0.62;
  const start = Math.PI * 0.62;
  // clockwise seen from +Z means decreasing angle
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = start - (sweep * i) / 40;
    pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.055, 10, false), mat));
  const addHead = (p: THREE.Vector3, tangent: THREE.Vector3) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 18), mat);
    cone.position.copy(p);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
    g.add(cone);
  };
  addHead(pts[pts.length - 1], pts[pts.length - 1].clone().sub(pts[pts.length - 2]));
  if (turns === 2) addHead(pts[0], pts[0].clone().sub(pts[1]));
  // counter-clockwise: mirror the arc
  if (turns === 3) g.scale.set(-1, 1, 1);
  const n = new THREE.Vector3(...FACE_NORMALS[face]);
  const holder = new THREE.Group();
  holder.add(g);
  g.position.z = 0; // arc lies in the plane z = 0 of the holder
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  // outside the shell: side layers reach 1.5·√2 ≈ 2.12 along their own axis on a Fischer Cube
  holder.position.copy(n.clone().multiplyScalar(face === 0 || face === 3 ? 1.75 : 2.3));
  return holder;
}
