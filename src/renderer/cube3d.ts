/**
 * Three.js view of the puzzle.
 *
 * ONE SOURCE OF TRUTH: the renderer never owns puzzle state. It is told
 * "show this CubeState" and every piece pose is set from that state's
 * rotation matrices. A move animation is only an interpolation between
 * `state` and `applyMove(state, m)` – both computed by the move engine – and it
 * always ends by displaying the engine's result.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FACE_NORMALS, HOME, NUM_CUBIES, ROTATIONS, rotApply, slotOfPosition } from '../cube/geometry';
import { fischerShell } from '../cube/fischerShell';
import { applyMove, inLayer, moveFace, moveTurns } from '../cube/moves';
import { statesEqual, type CubeState } from '../cube/state';
import { buildPiece, quaternionOfRotation } from './stickers';
import { createCamera, createControls, DEFAULT_CAMERA_POS } from './camera';
import { moveAngle, prefersReducedMotion, stepTween, type Tween } from './animation';
import { makeArrow } from './arrow';

export interface SlotAssignment {
  slot: number;
  cubie: number | null;
  rot: number;
}

const ROT_QUATS = ROTATIONS.map(quaternionOfRotation);

export class CubeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Rotated by the viewing orientation (x/y/z). Never touches puzzle state. */
  private viewRoot = new THREE.Group();
  private pieceRoot = new THREE.Group();
  private partialRoot = new THREE.Group();
  private pieces: THREE.Group[] = [];
  private templates: THREE.Group[] = [];
  private blanks: THREE.Group[] = [];
  private arrow: THREE.Group | null = null;
  private state: CubeState | null = null;
  private tweens: Tween[] = [];
  private raf = 0;
  private resizeObs: ResizeObserver;
  private highlighted = new Set<number>();
  private selected: number | null = null;
  private viewQuat = new THREE.Quaternion();
  onPick: ((cubie: number) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.camera = createCamera(1);
    this.controls = createControls(this.camera, this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 6);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-6, -2, -4);
    this.scene.add(key, fill);
    this.scene.add(this.viewRoot);
    this.viewRoot.add(this.pieceRoot, this.partialRoot);

    const shell = fischerShell();
    for (let c = 0; c < NUM_CUBIES; c++) {
      const g = buildPiece(shell, c);
      this.templates.push(g);
      const p = g.clone(true);
      this.cloneBodyMaterial(p);
      this.pieces.push(p);
      this.pieceRoot.add(p);
      const b = buildPiece(shell, c, true);
      this.blanks.push(b);
    }

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.installPicking();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tweens = this.tweens.filter((tw) => !stepTween(tw, now));
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private cloneBodyMaterial(g: THREE.Object3D) {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.role === 'body') o.material = (o.material as THREE.Material).clone();
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize() {
    const w = this.host.clientWidth || 1,
      h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // keep the whole puzzle in frame on narrow screens
    this.camera.fov = w / h < 0.9 ? 44 : 32;
    this.camera.updateProjectionMatrix();
  }

  private installPicking() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !this.onPick) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.pieceRoot.visible ? this.pieceRoot.children : this.partialRoot.children, true)[0];
      if (hit && typeof hit.object.userData.slot === 'number') this.onPick(hit.object.userData.slot);
      else if (hit && typeof hit.object.userData.cubie === 'number') this.onPick(hit.object.userData.cubie);
    });
  }

  // ---------------------------------------------------------------- state ---
  /** Display a physical state (cancels any running move animation). */
  setState(s: CubeState) {
    if (this.state && statesEqual(this.state, s) && this.pieceRoot.visible && this.tweens.length === 0) return;
    this.tweens = [];
    this.state = s;
    this.pieceRoot.visible = true;
    this.partialRoot.visible = false;
    for (let c = 0; c < NUM_CUBIES; c++) this.pieces[c].quaternion.copy(ROT_QUATS[s.rot[c]]);
    this.applyTints();
  }

  /** Display a partially decoded sticker entry: unknown slots show as grey placeholders. */
  setAssignments(list: SlotAssignment[]) {
    this.tweens = [];
    this.state = null;
    this.pieceRoot.visible = false;
    this.partialRoot.visible = true;
    this.partialRoot.clear();
    for (const a of list) {
      const g = a.cubie === null ? this.blanks[a.slot].clone(true) : this.templates[a.cubie].clone(true);
      if (a.cubie !== null) g.quaternion.copy(ROT_QUATS[a.rot]);
      g.traverse((o) => (o.userData.slot = a.slot));
      this.cloneBodyMaterial(g);
      this.partialRoot.add(g);
    }
    this.applyTints();
  }

  /** Animate move m starting from `from`; resolves once applyMove(from, m) is displayed. */
  animateMove(from: CubeState, m: number, duration = 380): Promise<void> {
    this.setState(from);
    const to = applyMove(from, m);
    const face = moveFace(m),
      turns = moveTurns(m);
    const axis = new THREE.Vector3(...FACE_NORMALS[face]);
    const angle = moveAngle(m);
    const layer = Array.from({ length: NUM_CUBIES }, (_, c) => c).filter((c) => inLayer(from, c, face));
    const base = layer.map((c) => ROT_QUATS[from.rot[c]].clone());
    const dur = prefersReducedMotion() ? 0 : duration * (turns === 2 ? 1.35 : 1);
    return new Promise((resolve) => {
      const q = new THREE.Quaternion();
      this.tweens.push({
        start: performance.now(),
        duration: dur,
        update: (t) => {
          q.setFromAxisAngle(axis, angle * t);
          layer.forEach((c, i) => this.pieces[c].quaternion.copy(q).multiply(base[i]));
        },
        done: () => {
          this.state = null;
          this.setState(to); // the engine's state is what ends up on screen
          resolve();
        },
      });
    });
  }

  // ------------------------------------------------------------- emphasis ---
  /** Tint the pieces of a turning layer and show a direction arrow (face, turns) or clear (null). */
  highlightMove(m: number | null) {
    if (this.arrow) {
      this.viewRoot.remove(this.arrow);
      this.arrow = null;
    }
    this.highlighted.clear();
    if (m !== null && this.state) {
      const face = moveFace(m);
      for (let c = 0; c < NUM_CUBIES; c++) if (inLayer(this.state, c, face)) this.highlighted.add(c);
      this.arrow = makeArrow(face, moveTurns(m));
      this.viewRoot.add(this.arrow);
    }
    this.applyTints();
  }

  /** Highlight a whole mechanism layer (used while entering stickers). */
  highlightLayer(face: number | null) {
    if (this.arrow) {
      this.viewRoot.remove(this.arrow);
      this.arrow = null;
    }
    this.highlighted.clear();
    if (face !== null) {
      const n = FACE_NORMALS[face];
      for (let slot = 0; slot < NUM_CUBIES; slot++) {
        const h = HOME[slot];
        if (h[0] * n[0] + h[1] * n[1] + h[2] * n[2] === 1) this.highlighted.add(slot);
      }
    }
    this.applyTints();
  }

  /** Mark the selected slot (piece editor). */
  select(slot: number | null) {
    this.selected = slot;
    this.applyTints();
  }

  private applyTints() {
    const tint = (g: THREE.Object3D, hl: boolean, sel: boolean) =>
      g.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.role === 'body') {
          const mat = o.material as THREE.MeshStandardMaterial;
          mat.emissive.setHex(sel || hl ? 0x2f5bea : 0x000000);
          mat.emissiveIntensity = sel ? 0.7 : hl ? 0.2 : 0;
        }
      });
    if (this.pieceRoot.visible && this.state) {
      for (let c = 0; c < NUM_CUBIES; c++) {
        const slotHere = slotOfCubie(this.state, c);
        tint(this.pieces[c], this.highlighted.has(c) || (this.highlightIsSlots && this.highlighted.has(slotHere)), this.selected === slotHere);
      }
    } else {
      for (const g of this.partialRoot.children) {
        const slot = g.userData.slot as number;
        tint(g, this.highlightIsSlots && this.highlighted.has(slot), this.selected === slot);
      }
    }
  }
  private get highlightIsSlots() {
    return this.arrow === null;
  }

  // ----------------------------------------------------------------- view ---
  /** Set the viewing orientation (rotation index); animated. Puzzle state is untouched. */
  setView(view: number, animate = true) {
    const target = ROT_QUATS[view].clone();
    if (!animate || prefersReducedMotion()) {
      this.viewQuat.copy(target);
      this.viewRoot.quaternion.copy(target);
      return;
    }
    const from = this.viewRoot.quaternion.clone();
    this.tweens.push({
      start: performance.now(),
      duration: 420,
      update: (t) => this.viewRoot.quaternion.slerpQuaternions(from, target, t),
      done: () => this.viewQuat.copy(target),
    });
  }

  resetCamera() {
    this.camera.position.copy(DEFAULT_CAMERA_POS);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  zoom(factor: number) {
    const d = this.camera.position.length();
    const nd = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, d * factor));
    this.camera.position.multiplyScalar(nd / d);
  }
}

// helpers -----------------------------------------------------------------------
const slotOfCubie = (s: CubeState, c: number) => slotOfPosition(rotApply(s.rot[c], HOME[c]));

