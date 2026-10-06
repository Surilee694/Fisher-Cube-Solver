import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { CubeRenderer } from '../renderer/cube3d';

export interface CubeViewHandle {
  get(): CubeRenderer | null;
}

/** Hosts the three.js renderer. All drawing decisions come from App via the handle. */
export const CubeView = forwardRef<CubeViewHandle, { onReady: (r: CubeRenderer) => void }>(function CubeView({ onReady }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const rend = useRef<CubeRenderer | null>(null);
  useImperativeHandle(ref, () => ({ get: () => rend.current }), []);
  useEffect(() => {
    let r: CubeRenderer | null = null;
    try {
      r = new CubeRenderer(host.current!);
    } catch {
      host.current!.innerHTML = '<p class="webgl-missing">3D view unavailable: this browser has WebGL turned off. Everything else still works.</p>';
      return;
    }
    rend.current = r;
    onReady(r);
    return () => {
      r?.dispose();
      rend.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="cube-host" ref={host} aria-label="3D Fischer Cube. Drag to orbit, scroll or pinch to zoom." role="img" />;
});
