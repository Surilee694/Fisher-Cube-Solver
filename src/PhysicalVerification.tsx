import { useEffect, useMemo, useRef, useState } from 'react';
import { COLOR_NAMES } from '../cube/fischerShell';
import { applyMoves, makeMove, MOVE_NAMES } from '../cube/moves';
import { NotationError, parseSequence } from '../cube/notation';
import { solvedState } from '../cube/state';
import { CUBIE_CODE } from '../cube/geometry';
import {
  colourList,
  describeMoveEffect,
  orientationText,
  PHYSICAL_TEST_SEQUENCE,
} from '../cube/physicalAudit';
import type { CubeRenderer } from '../renderer/cube3d';
import { CubeView } from './CubeView';
import { Swatch } from './Swatch';
import { moveLabel } from './describe';

const ROWS = [1, 2, 4, 5, 0, 3].map((f) => [1, 3, 2].map((t) => makeMove(f, t))); // R F L B U D, each X X' X2

/**
 * Developer screen for checking the model against a real puzzle:
 * BEFORE (3D) · MOVE · AFTER (3D) plus exactly which pieces moved and how.
 * Always in the standard hold, independent of the main view.
 */
export function PhysicalVerification({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'single' | 'sequence'>('single');
  const [single, setSingle] = useState(makeMove(1, 1));
  const [seqText, setSeqText] = useState(PHYSICAL_TEST_SEQUENCE);
  const [step, setStep] = useState(1);
  const [before3d, setBefore3d] = useState<CubeRenderer | null>(null);
  const [after3d, setAfter3d] = useState<CubeRenderer | null>(null);
  const [animating, setAnimating] = useState(false);

  const parsed = useMemo(() => {
    try {
      return { moves: parseSequence(seqText).moves, error: '' };
    } catch (e) {
      return { moves: [] as number[], error: e instanceof NotationError ? e.message : String(e) };
    }
  }, [seqText]);
  const seqMoves = parsed.moves;
  const k = Math.min(Math.max(step, 1), Math.max(seqMoves.length, 1));

  const { before, move } =
    mode === 'single' || !seqMoves.length
      ? { before: solvedState(), move: single }
      : { before: applyMoves(solvedState(), seqMoves.slice(0, k - 1)), move: seqMoves[k - 1] };
  const effect = useMemo(() => describeMoveEffect(before, move), [before, move]);

  // drive both 3D views from the engine's states
  useEffect(() => {
    if (!before3d || !after3d || animating) return;
    before3d.setState(before);
    before3d.highlightMove(move);
    after3d.setState(effect.after);
    after3d.highlightMove(null);
  }, [before3d, after3d, before, move, effect, animating]);

  // keep the two cameras looking from the same direction
  const syncing = useRef(false);
  useEffect(() => {
    if (!before3d || !after3d) return;
    const link = (a: CubeRenderer, b: CubeRenderer) => () => {
      if (syncing.current) return;
      syncing.current = true;
      b.camera.position.copy(a.camera.position);
      b.camera.lookAt(0, 0, 0);
      syncing.current = false;
    };
    const ab = link(before3d, after3d),
      ba = link(after3d, before3d);
    before3d.controls.addEventListener('change', ab);
    after3d.controls.addEventListener('change', ba);
    return () => {
      before3d.controls.removeEventListener('change', ab);
      after3d.controls.removeEventListener('change', ba);
    };
  }, [before3d, after3d]);

  const animate = async () => {
    if (!after3d || animating) return;
    setAnimating(true);
    after3d.setState(before);
    await new Promise((r) => setTimeout(r, 250));
    await after3d.animateMove(before, move, 900);
    setAnimating(false);
  };

  const ori = (p: (typeof effect.pieces)[number], v: number) => orientationText(p, v);

  return (
    <div className="verify" role="dialog" aria-label="Physical verification">
      <header className="verify-head">
        <h2>Physical verification</h2>
        <p className="muted small">
          Hold your puzzle with white on top and the green|red vertical edge pointing at you. Do the move on your puzzle and compare it with AFTER.
        </p>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="verify-picker">
        <div className="seg" role="radiogroup" aria-label="What to check">
          <button role="radio" aria-checked={mode === 'single'} className={mode === 'single' ? 'on' : ''} onClick={() => setMode('single')}>
            One move from solved
          </button>
          <button role="radio" aria-checked={mode === 'sequence'} className={mode === 'sequence' ? 'on' : ''} onClick={() => setMode('sequence')}>
            Test sequence
          </button>
        </div>
        {mode === 'single' ? (
          <div className="move-grid" role="radiogroup" aria-label="Move">
            {ROWS.map((row, i) => (
              <div key={i} className="move-trio">
                {row.map((m) => (
                  <button key={m} role="radio" aria-checked={m === single} className={'chip' + (m === single ? ' on' : '')} onClick={() => setSingle(m)}>
                    {moveLabel(m)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="seq-row">
            <input value={seqText} onChange={(e) => (setSeqText(e.target.value), setStep(1))} aria-label="Test sequence" spellCheck={false} />
            <button onClick={() => setStep(k - 1)} disabled={k <= 1}>
              Previous move
            </button>
            <span className="step-count">
              Move {k} of {seqMoves.length}
            </span>
            <button onClick={() => setStep(k + 1)} disabled={k >= seqMoves.length}>
              Next move
            </button>
            {parsed.error && <span className="err-text">{parsed.error}</span>}
          </div>
        )}
      </div>

      <div className="verify-stage">
        <figure className="verify-cube">
          <figcaption>
            BEFORE <span className="muted">{mode === 'single' ? 'solved' : k === 1 ? 'solved' : `after ${seqMoves.slice(0, k - 1).map((m) => MOVE_NAMES[m]).join(' ')}`}</span>
          </figcaption>
          <div className="verify-host">
            <CubeView onReady={setBefore3d} />
          </div>
        </figure>

        <div className="verify-move">
          <div className="move-big">{moveLabel(move)}</div>
          <p className="move-sentence">
            {effect.layer} layer, {effect.direction}
          </p>
          <p className="muted small">Its centre shows {colourList(effect.layerColours)}. The arrow on BEFORE shows the direction.</p>
          <p className={effect.shapeAfter === effect.shapeBefore ? 'small' : 'small strong'}>
            {effect.shapeAfter
              ? effect.shapeBefore
                ? 'Shape: stays a cube. Only colours move.'
                : 'Shape: returns to a cube.'
              : effect.shapeBefore
                ? 'Shape: changes. The turned layer now sits at 45° to the rest.'
                : 'Shape: not a cube (it was not one before either).'}
          </p>
          <button className="primary" onClick={animate} disabled={animating || !after3d}>
            {animating ? 'Turning…' : 'Play the move on AFTER'}
          </button>
        </div>

        <figure className="verify-cube">
          <figcaption>
            AFTER <span className="muted">{MOVE_NAMES[move]}</span>
          </figcaption>
          <div className="verify-host">
            <CubeView onReady={setAfter3d} />
          </div>
        </figure>
      </div>

      <section className="verify-tables">
        <h3>Pieces that moved ({effect.pieces.length})</h3>
        <div className="table-scroll">
          <table className="verify-table">
            <thead>
              <tr>
                <th>Piece</th>
                <th>From</th>
                <th>To</th>
                <th>Orientation</th>
                <th>Each sticker now faces</th>
              </tr>
            </thead>
            <tbody>
              {effect.pieces.map((p) => (
                <tr key={p.cubie}>
                  <td>
                    <Swatch colors={p.colors} size={12} /> {p.name}
                    <div className="muted small">piece {CUBIE_CODE[p.cubie]}</div>
                  </td>
                  <td>
                    {p.from}
                    <div className="muted small">slot {CUBIE_CODE[p.fromSlot]}</div>
                  </td>
                  <td>
                    {p.to}
                    <div className="muted small">slot {CUBIE_CODE[p.toSlot]}</div>
                  </td>
                  <td>
                    {ori(p, p.oriBefore)} → <strong>{ori(p, p.oriAfter)}</strong>
                  </td>
                  <td>
                    {p.stickers.map((s) => (
                      <div key={s.color}>
                        <Swatch colors={[s.color]} size={10} /> {COLOR_NAMES[s.color]}: {s.before} → <strong>{s.after}</strong>
                        {!s.flushAfter && <span className="muted"> · sticks out</span>}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Centres after the move</h3>
        <div className="centre-row">
          {effect.centresAfter.map((c) => (
            <div key={c.face} className="centre-cell">
              <Swatch colors={c.colours} size={12} />
              <span>
                <strong>{c.face}</strong> {c.visible ? `${c.quarterTurns * 90}°` : `${c.quarterTurns * 90}° (can't be seen)`}
              </span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Side centres turn with their layer; 180° means its two colours have swapped sides. Top and bottom centres are plain diamonds, so their rotation cannot be seen and never matters.
        </p>
      </section>
    </div>
  );
}
