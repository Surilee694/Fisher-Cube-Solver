import { useState } from 'react';
import { CORNER_NAMES, EDGE_NAMES, FACE_NAMES } from '../cube/geometry';
import { toArrays } from '../cube/cubies';
import { decodeFacelets, faceletsOf } from '../cube/facelets';
import { fischerShell } from '../cube/fischerShell';
import { applyMoves, invertSequence } from '../cube/moves';
import { formatSequence, NotationError, parseSequence } from '../cube/notation';
import { isMechanismSolved, isSolved, looksSolved } from '../cube/solvedState';
import { deserializeState, occupancy, serializeState, statesEqual, type CubeState } from '../cube/state';
import { validateState } from '../cube/validation';
import type { SolverClient } from '../solver/client';
import type { ScrambleTestItem } from '../solver/protocol';

interface Props {
  cube: CubeState;
  view: number;
  history: number[];
  client: SolverClient | null;
  onApply: (moves: number[], view: number) => void;
  onLoad: (s: CubeState) => void;
}

export function DebugPanel({ cube, view, history, client, onApply, onLoad }: Props) {
  const [seq, setSeq] = useState("R U R' U'");
  const [log, setLog] = useState<string[]>([]);
  const [testN, setTestN] = useState(50);
  const [items, setItems] = useState<ScrambleTestItem[]>([]);
  const [testSummary, setTestSummary] = useState('');
  const [running, setRunning] = useState(false);
  const [stateText, setStateText] = useState('');
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 12));

  const ok = occupancy(cube).collisions.length === 0;
  const a = ok ? toArrays(cube) : null;
  const facelets = ok ? faceletsOf(cube).join('') : '(overlapping pieces)';
  const shell = fischerShell();

  const parse = () => {
    try {
      return parseSequence(seq, view);
    } catch (e) {
      say(e instanceof NotationError ? e.message : String(e));
      return null;
    }
  };

  const testMove = () => {
    const p = parse();
    if (!p) return;
    onApply(p.moves, p.view);
    say(`Applied ${formatSequence(p.moves) || '(no face moves)'} (puzzle frame).`);
  };
  const inverseTest = () => {
    const p = parse();
    if (!p) return;
    const back = applyMoves(applyMoves(cube, p.moves), invertSequence(p.moves));
    say(`Inverse test: S · M · M⁻¹ ${statesEqual(back, cube) ? '= S ✓ (exact, including centres)' : '≠ S ✗ — engine bug'}`);
  };
  const roundTrip = () => {
    const f = faceletsOf(cube);
    const d = decodeFacelets(f);
    const ok2 = d.state !== null && faceletsOf(d.state).every((x, i) => x === f[i]);
    say(`Round trip state → stickers → state → stickers: ${ok2 ? 'identical ✓' : 'MISMATCH ✗'}${d.notes.length ? ' (invisible orientations were chosen; see notes in Enter state)' : ''}`);
  };
  const scrambleTest = async () => {
    if (!client) return;
    setRunning(true);
    setItems([]);
    setTestSummary('');
    const t = Date.now();
    const r = await client.scrambleTest(testN, 25, Date.now() & 0xffff, (it) => setItems((xs) => [...xs, it]));
    setTestSummary(`${r.passed} / ${r.passed + r.failed} scrambles solved and verified by replay in ${((Date.now() - t) / 1000).toFixed(1)} s.`);
    setRunning(false);
  };

  return (
    <div className="debug">
      <section>
        <h3>State</h3>
        <dl className="kv">
          <dt>Physically solved</dt>
          <dd>{String(ok && isSolved(cube))}</dd>
          <dt>Stickers match solved</dt>
          <dd>{String(ok && looksSolved(cube))}</dd>
          <dt>Mechanism identity</dt>
          <dd>{String(isMechanismSolved(cube))}</dd>
          <dt>Validation</dt>
          <dd>{validateState(cube).map((i) => i.code).join(', ') || 'ok'}</dd>
        </dl>
        {a && (
          <table className="arrays">
            <tbody>
              <tr>
                <th>CP</th>
                {a.cp.map((c, i) => (
                  <td key={i} title={CORNER_NAMES[i]}>
                    {CORNER_NAMES[c]}
                  </td>
                ))}
              </tr>
              <tr>
                <th>CO</th>
                {a.co.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        {a && (
          <table className="arrays">
            <tbody>
              <tr>
                <th>EP</th>
                {a.ep.map((c, i) => (
                  <td key={i} title={EDGE_NAMES[i]}>
                    {EDGE_NAMES[c]}
                  </td>
                ))}
              </tr>
              <tr>
                <th>EO</th>
                {a.eo.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
              <tr>
                <th>Centres</th>
                {a.ctr.map((c, i) => (
                  <td key={i} colSpan={2}>
                    {FACE_NAMES[i]} {c * 90}°
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
        <div className="field-label">Stickers (96 cells, faces U R F D L B, {shell.samples.length / 6} each)</div>
        <code className="mono-block">{facelets.match(/.{1,16}/g)?.join(' ')}</code>
        <div className="field-label">Serialized state</div>
        <div className="btn-row">
          <input value={stateText} placeholder={serializeState(cube)} onChange={(e) => setStateText(e.target.value)} aria-label="Serialized state" />
          <button
            onClick={() => {
              try {
                onLoad(deserializeState(stateText.trim()));
                say('Loaded state.');
              } catch (e) {
                say(String(e));
              }
            }}
          >
            Load
          </button>
          <button onClick={() => navigator.clipboard?.writeText(serializeState(cube))}>Copy</button>
        </div>
        <div className="field-label">Moves applied so far (puzzle frame, including solution steps played)</div>
        <code className="mono-block">{formatSequence(history) || '—'}</code>
      </section>

      <section>
        <h3>Tests</h3>
        <div className="btn-row">
          <input value={seq} onChange={(e) => setSeq(e.target.value)} aria-label="Move sequence" />
        </div>
        <div className="btn-row">
          <button onClick={testMove}>Test move</button>
          <button onClick={inverseTest}>Inverse test</button>
          <button onClick={roundTrip}>Round-trip test</button>
        </div>
        <div className="btn-row">
          <label>
            Scramble test
            <input type="number" min={1} max={1000} value={testN} onChange={(e) => setTestN(Math.max(1, Math.min(1000, +e.target.value || 1)))} className="num" />
          </label>
          <button onClick={scrambleTest} disabled={running || !client}>
            {running ? `Running ${items.length}/${testN}…` : 'Run'}
          </button>
        </div>
        {testSummary && <p className={items.every((i) => i.ok) ? 'ok-text' : 'err-text'}>{testSummary}</p>}
        {items.some((i) => !i.ok) && (
          <ul className="fails">
            {items
              .filter((i) => !i.ok)
              .map((i) => (
                <li key={i.index}>
                  #{i.index}: {i.message} — {i.scramble}
                </li>
              ))}
          </ul>
        )}
        <ul className="log">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
