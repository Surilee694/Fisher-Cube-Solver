import { FACE_NAMES } from '../cube/geometry';
import type { RotationAxis } from '../cube/moves';
import { centreColours, frontFace, topFace, viewFor } from './describe';

interface Props {
  view: number;
  onRotate: (axis: RotationAxis, turns: number) => void;
  onSetView: (v: number) => void;
  onResetCamera: () => void;
  onZoom: (f: number) => void;
}

const faceOption = (f: number) => `${centreColours(f)} centre (${FACE_NAMES[f]})`;

/** Whole-puzzle rotations: they change how you hold the puzzle, never its state. */
export function ViewControls({ view, onRotate, onSetView, onResetCamera, onZoom }: Props) {
  const top = topFace(view),
    front = frontFace(view);
  const setTop = (t: number) => {
    const fronts = [front, ...[0, 1, 2, 3, 4, 5]];
    for (const f of fronts) {
      const v = viewFor(t, f);
      if (v !== null) return onSetView(v);
    }
  };
  const setFront = (f: number) => {
    const v = viewFor(top, f);
    if (v !== null) onSetView(v);
  };
  return (
    <div className="view-controls">
      <div className="rot-buttons" role="group" aria-label="Rotate the whole puzzle">
        {(['x', 'y', 'z'] as RotationAxis[]).map((a) => (
          <span key={a} className="rot-pair">
            <button className="chip" onClick={() => onRotate(a, 1)} title={`Rotate whole puzzle ${a}`}>
              {a}
            </button>
            <button className="chip" onClick={() => onRotate(a, 3)} title={`Rotate whole puzzle ${a}′`}>
              {a}′
            </button>
          </span>
        ))}
      </div>
      <div className="hold-row">
        <label>
          Top
          <select value={top} onChange={(e) => setTop(+e.target.value)}>
            {[0, 1, 2, 3, 4, 5].map((f) => (
              <option key={f} value={f}>
                {faceOption(f)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Front
          <select value={front} onChange={(e) => setFront(+e.target.value)}>
            {[0, 1, 2, 3, 4, 5]
              .filter((f) => viewFor(top, f) !== null)
              .map((f) => (
                <option key={f} value={f}>
                  {faceOption(f)}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="cam-row">
        <button className="ghost" onClick={() => onSetView(0)}>
          Standard hold
        </button>
        <button className="ghost" onClick={onResetCamera}>
          Reset camera
        </button>
        <button className="ghost icon" onClick={() => onZoom(0.85)} aria-label="Zoom in">
          +
        </button>
        <button className="ghost icon" onClick={() => onZoom(1.18)} aria-label="Zoom out">
          −
        </button>
      </div>
    </div>
  );
}
