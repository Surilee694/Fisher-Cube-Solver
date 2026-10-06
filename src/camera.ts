import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Default camera: slightly above, looking at the green|red front edge (the iconic Fischer view). */
export const DEFAULT_CAMERA_POS = new THREE.Vector3(1.4, 4.7, 9.1);

export function createCamera(aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(32, aspect, 0.1, 100);
  cam.position.copy(DEFAULT_CAMERA_POS);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function createControls(cam: THREE.PerspectiveCamera, el: HTMLElement): OrbitControls {
  const c = new OrbitControls(cam, el);
  c.enableDamping = true;
  c.dampingFactor = 0.12;
  c.enablePan = false;
  c.minDistance = 7;
  c.maxDistance = 18;
  c.rotateSpeed = 0.9;
  return c;
}
