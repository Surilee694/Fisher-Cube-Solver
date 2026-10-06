import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { solvedState, type CubeState } from './cube/state';
import { applyMove, applyMoves, inverseMove, moveInView, rotateView, type RotationAxis } from './cube/moves';
import { NotationError, parseSequence } from './cube/notation';
import { decodeFacelets, faceletsOf, blankFacelets, type FaceletColor } from './cube/facelets';
import { validateState, type Issue } from './cube/validation';
import { isSolved } from './cube/solvedState';
import { randomScrambleMoves } from './input/scramble';
import { getSolverClient } from './solver/client';
import type { SolveResult, SolveStage } from './solver/solve';
import type { CubeRenderer } from './renderer/cube3d';
import { CubeView, type CubeViewHandle } from './ui/CubeView';
import { ViewControls } from './ui/ViewControls';
import { SolutionPlayer } from './ui/SolutionPlayer';
import { PieceEditor } from './ui/PieceEditor';
import { StickerNet } from './ui/StickerNet';
import { DebugPanel } from './ui/DebugPanel';
import { PhysicalVerification } from './ui/PhysicalVerification';
import { moveText } from './ui/describe';

type Tab = 'solve' | 'enter' | 'dev';
type Entry = 'pieces' | 'stickers';
interface Snapshot {
  cube: CubeState;
  stickers: FaceletColor[];
  history: number[];
}
interface Solution {
  start: CubeState;
  result: SolveResult;
}

const STAGE_TEXT: Record<SolveStage, string> = {
  analyzing: 'Analyzing state…',
  tables: 'Preparing tables…',
  searching: 'Searching…',
  verifying: 'Verifying by replay…',
};
const BUDGETS = [
  { ms: 300, label: 'Quick' },
  { ms: 1500, label: 'Shorter' },
  { ms: 5000, label: 'Shortest' },
];

export default function App() {
  const viewRef = useRef<CubeViewHandle>(null);
  const [renderer, setRenderer] = useState<CubeRenderer | null>(null);
  const client = useMemo(() => getSolverClient(), []);
  const [tablesReady, setTablesReady] = useState(false);

  const [cube, setCube] = useState<CubeState>(solvedState);
  const [view, setView] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [stickers, setStickers] = useState<FaceletColor[]>(() => faceletsOf(solvedState()));
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  const [tab, setTab] = useState<Tab>('solve');
  const [verifying, setVerifying] = useState(false);
  const [entry, setEntry] = useState<Entry>('pieces');
  const [selected, setSelected] = useState<number | null>(null);
  const [paint, setPaint] = useState<FaceletColor>('W');
  const [activeFace, setActiveFace] = useState<number | null>(null);
  const [checked, setChecked] = useState<Issue[] | null>(null);

  const [scrambleText, setScrambleText] = useState('');
  const [inputError, setInputError] = useState('');
  const [budget, setBudget] = useState(1500);
  const [solving, setSolving] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SolveResult | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    client?.ready.then(() => setTablesReady(true));
  }, [client]);

  const stickerMode = tab === 'enter' && entry === 'stickers';
  const decoded = useMemo(() => (stickerMode ? decodeFacelets(stickers) : null), [stickerMode, stickers]);

  // ---- keep the 3D view in sync with the single source of truth ------------
  useEffect(() => {
    if (!renderer || busy) return;
    if (stickerMode && decoded) {
      renderer.setAssignments(decoded.assignments.map((a, slot) => ({ slot, cubie: a?.cubie ?? null, rot: a?.rot ?? 0 })));
      renderer.highlightLayer(activeFace);
      renderer.select(null);
      return;
    }
    renderer.setState(cube);
    if (solution && tab !== 'enter' && step < solution.result.moves.length) renderer.highlightMove(solution.result.moves[step]);
    else renderer.highlightMove(null);
    renderer.select(tab === 'enter' ? selected : null);
  }, [renderer, cube, busy, stickerMode, decoded, activeFace, solution, step, selected, tab]);

  useEffect(() => {
    renderer?.setView(view);
  }, [renderer, view]);

  useEffect(() => {
    if (!renderer) return;
    renderer.onPick = (slot) => {
      if (tab !== 'enter' || entry !== 'pieces') return;
      setSelected((s) => (s === slot ? null : slot));
    };
  }, [renderer, tab, entry]);

  // ---- editing with undo/redo ---------------------------------------------------
  const snapshot = (): Snapshot => ({ cube, stickers, history });
  const commit = (next: Partial<Snapshot>) => {
    setPast((p) => [...p.slice(-99), snapshot()]);
    setFuture([]);
    if (next.cube) setCube(next.cube);
    if (next.stickers) setStickers(next.stickers);
    if (next.history) setHistory(next.history);
    stopSolution();
    setOutcome(null);
    setChecked(null);
  };
  const restore = (s: Snapshot) => {
    setCube(s.cube);
    setStickers(s.stickers);
    setHistory(s.history);
    stopSolution();
    setOutcome(null);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [snapshot(), ...f]);
    restore(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, snapshot()]);
    restore(future[0]);
    setFuture((f) => f.slice(1));
  };
  function stopSolution() {
    setSolution(null);
    setStep(0);
    setPlaying(false);
  }

  const setPieceState = (s: CubeState) => commit({ cube: s, stickers: faceletsOf(s), history: [] });
  const paintCell = (i: number) => {
    if (stickers[i] === paint) return;
    const next = stickers.slice();
    next[i] = paint;
    const d = decodeFacelets(next);
    commit({ stickers: next, ...(d.state ? { cube: d.state, history: [] } : {}) });
  };

  // ---- moves, scrambles ------------------------------------------------------------
  const applyText = () => {
    try {
      const p = parseSequence(scrambleText, view);
      setInputError('');
      commit({ cube: applyMoves(cube, p.moves), stickers: faceletsOf(applyMoves(cube, p.moves)), history: [...history, ...p.moves] });
      setView(p.view);
    } catch (e) {
      setInputError(e instanceof NotationError ? e.message : String(e));
    }
  };
  const randomScramble = () => {
    const ms = randomScrambleMoves(25);
    const s = applyMoves(solvedState(), ms);
    setScrambleText(ms.map((m) => moveText(moveInView(view, m))).join(' '));
    setInputError('');
    commit({ cube: s, stickers: faceletsOf(s), history: ms });
  };
  const resetSolved = () => commit({ cube: solvedState(), stickers: faceletsOf(solvedState()), history: [] });
  const rotate = (axis: RotationAxis, turns: number) => setView((v) => rotateView(v, axis, turns));

  // ---- solving -----------------------------------------------------------------------
  const solve = async () => {
    if (!client || solving) return;
    if (stickerMode && decoded && !decoded.state) {
      setChecked(decoded.issues); // stay here: the problems are listed under the net
      return;
    }
    const start = cube;
    stopSolution();
    setOutcome(null);
    setSolving(tablesReady ? STAGE_TEXT.analyzing : STAGE_TEXT.tables);
    try {
      const res = await client.solve(start, budget, {
        onStage: (s) => setSolving(STAGE_TEXT[s]),
        onProgress: (n) => setSolving(`Searching… best so far ${n} moves`),
      });
      setOutcome(res);
      if (res.status === 'solved') {
        setSolution({ start, result: res });
        setStep(0);
      }
    } catch (e) {
      setOutcome({
        status: 'internal-error',
        issues: [],
        notes: [],
        rawMoves: [],
        moves: [],
        verification: null,
        stats: { searchMs: 0, tableMs: 0, nodes: 0, phase1Length: 0 },
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSolving(null);
      setTab('solve');
    }
  };

  // ---- solution player ------------------------------------------------------------------
  const moveMs = 420 / speed;
  const next = useCallback(async () => {
    if (!solution || busy || step >= solution.result.moves.length) return;
    const m = solution.result.moves[step];
    setBusy(true);
    renderer?.highlightMove(null);
    if (renderer) await renderer.animateMove(cube, m, moveMs);
    setCube(applyMove(cube, m));
    setStep(step + 1);
    setBusy(false);
  }, [solution, busy, step, renderer, cube, moveMs]);
  const prev = useCallback(async () => {
    if (!solution || busy || step === 0) return;
    const m = inverseMove(solution.result.moves[step - 1]);
    setBusy(true);
    renderer?.highlightMove(null);
    if (renderer) await renderer.animateMove(cube, m, moveMs);
    setCube(applyMove(cube, m));
    setStep(step - 1);
    setBusy(false);
  }, [solution, busy, step, renderer, cube, moveMs]);
  const seek = (k: number) => {
    if (!solution || busy) return;
    setPlaying(false);
    setCube(applyMoves(solution.start, solution.result.moves.slice(0, k)));
    setStep(k);
  };
  useEffect(() => {
    if (!playing || busy || !solution) return;
    if (step >= solution.result.moves.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, 260 / speed);
    return () => clearTimeout(t);
  }, [playing, busy, step, solution, next, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (solution) {
        if (e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') prev();
        else if (e.key === ' ') {
          e.preventDefault();
          setPlaying((p) => !p);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const solved = isSolved(cube);
  const liveIssues = tab === 'enter' ? (stickerMode ? decoded?.issues ?? [] : validateState(cube)) : [];

  return (
    <div className="app">
      <header className="topbar">
        <h1>Fischer Cube Solver</h1>
        <span className="status-dot" data-ok={tablesReady}>
          {tablesReady ? 'Solver ready' : 'Preparing solver tables…'}
        </span>
      </header>

      <main className="stage">
        <div className="viewport">
          <div className="cube-area">
            <CubeView ref={viewRef} onReady={setRenderer} />
            <div className="viewport-badge" data-solved={solved && !stickerMode}>
              {stickerMode ? (decoded?.state ? 'Stickers decoded' : 'Sticker entry in progress') : solved ? 'Solved' : 'Not solved'}
            </div>
          </div>
          <ViewControls
            view={view}
            onRotate={rotate}
            onSetView={setView}
            onResetCamera={() => renderer?.resetCamera()}
            onZoom={(f) => renderer?.zoom(f)}
          />
        </div>

        {solution && tab !== 'enter' && (
          <SolutionPlayer
            moves={solution.result.moves}
            step={step}
            view={view}
            playing={playing}
            busy={busy}
            speed={speed}
            onPrev={prev}
            onNext={next}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSeek={seek}
            onSpeed={setSpeed}
            onClose={stopSolution}
          />
        )}

        <aside className="panel">
          <nav className="tabs" role="tablist">
            {(
              [
                ['solve', 'Solve'],
                ['enter', 'Enter state'],
                ['dev', 'Developer'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'on' : ''}
                onClick={() => {
                  if (t === 'enter' && entry === 'stickers') setStickers(faceletsOf(cube));
                  setTab(t);
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === 'solve' && (
            <div className="tab-body">
              <section>
                <h2>Scramble</h2>
                <p className="muted small">Type moves in standard notation, as you hold the puzzle. x, y and z turn the whole puzzle and change only how you hold it.</p>
                <textarea
                  value={scrambleText}
                  onChange={(e) => setScrambleText(e.target.value)}
                  placeholder="R U R' U' F2 …"
                  rows={2}
                  spellCheck={false}
                  aria-label="Move sequence"
                />
                {inputError && <p className="err-text">{inputError}</p>}
                <div className="btn-row">
                  <button onClick={applyText} disabled={!scrambleText.trim()}>
                    Apply moves
                  </button>
                  <button onClick={randomScramble}>Random scramble</button>
                  <button className="ghost" onClick={resetSolved}>
                    Reset to solved
                  </button>
                </div>
              </section>

              <section>
                <h2>Solve</h2>
                <div className="seg" role="radiogroup" aria-label="Search time">
                  {BUDGETS.map((b) => (
                    <button key={b.ms} role="radio" aria-checked={budget === b.ms} className={budget === b.ms ? 'on' : ''} onClick={() => setBudget(b.ms)}>
                      {b.label}
                    </button>
                  ))}
                </div>
                <button className="primary wide" onClick={solve} disabled={!!solving}>
                  {solving ?? 'Solve this state'}
                </button>
                <Outcome outcome={outcome} view={view} />
              </section>
            </div>
          )}

          {tab === 'enter' && (
            <div className="tab-body">
              <div className="seg" role="radiogroup" aria-label="Entry method">
                <button
                  role="radio"
                  aria-checked={entry === 'pieces'}
                  className={entry === 'pieces' ? 'on' : ''}
                  onClick={() => setEntry('pieces')}
                >
                  By piece
                </button>
                <button
                  role="radio"
                  aria-checked={entry === 'stickers'}
                  className={entry === 'stickers' ? 'on' : ''}
                  onClick={() => {
                    setStickers(faceletsOf(cube));
                    setEntry('stickers');
                  }}
                >
                  By sticker
                </button>
              </div>
              <div className="btn-row tight">
                <button onClick={undo} disabled={!past.length}>
                  Undo
                </button>
                <button onClick={redo} disabled={!future.length}>
                  Redo
                </button>
                <button onClick={resetSolved}>Solved</button>
                {entry === 'stickers' && <button onClick={() => commit({ stickers: blankFacelets() })}>Clear</button>}
                <button onClick={() => setChecked(stickerMode ? decoded?.issues ?? [] : validateState(cube))}>Validate</button>
                <button className="primary" onClick={solve} disabled={!!solving}>
                  Solve
                </button>
              </div>

              {entry === 'pieces' ? (
                <PieceEditor cube={cube} selected={selected} onSelect={setSelected} onChange={setPieceState} />
              ) : (
                <>
                  <p className="muted small">
                    Look straight at each layer of the mechanism and paint what you see. Split cells exist because one Fischer piece can show two colours on that side. Entering by piece is usually quicker.
                  </p>
                  <StickerNet
                    stickers={stickers}
                    paint={paint}
                    badSlots={decoded?.badSlots ?? []}
                    activeFace={activeFace}
                    onPaint={setPaint}
                    onCell={paintCell}
                    onFace={setActiveFace}
                  />
                  {decoded?.notes.map((n, i) => (
                    <p key={i} className="note small">
                      {n}
                    </p>
                  ))}
                </>
              )}
              <IssueList issues={checked ?? liveIssues} checked={checked !== null} />
            </div>
          )}

          {tab === 'dev' && (
            <div className="tab-body">
              <section>
                <h3>Physical verification</h3>
                <p className="muted small">Check each face turn against your real puzzle: before, the move, after, and exactly which pieces moved.</p>
                <button onClick={() => setVerifying(true)}>Open physical verification</button>
              </section>
              <DebugPanel
                cube={cube}
                view={view}
                history={solution ? [...history, ...solution.result.moves.slice(0, step)] : history}
                client={client}
                onApply={(ms, v) => {
                  commit({ cube: applyMoves(cube, ms), stickers: faceletsOf(applyMoves(cube, ms)), history: [...history, ...ms] });
                  setView(v);
                }}
                onLoad={(s) => {
                  const iss = validateState(s);
                  if (iss.some((i) => i.code === 'malformed' || i.code === 'center-moved' || i.code === 'duplicate')) throw new Error(iss[0].message);
                  commit({ cube: s, stickers: faceletsOf(s), history: [] });
                }}
              />
            </div>
          )}
        </aside>
      </main>
      {verifying && <PhysicalVerification onClose={() => setVerifying(false)} />}
    </div>
  );
}

function IssueList({ issues, checked }: { issues: Issue[]; checked: boolean }) {
  if (!issues.length)
    return checked ? <p className="ok-text">This is a valid Fischer Cube state.</p> : null;
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k} className={i.severity}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

function Outcome({ outcome, view }: { outcome: SolveResult | null; view: number }) {
  if (!outcome) return null;
  const text = outcome.moves.map((m) => moveText(moveInView(view, m))).join(' ');
  if (outcome.status === 'solved')
    return (
      <div className="outcome ok">
        <p className="headline">{outcome.message}</p>
        <p className="muted small">
          Search returned {outcome.rawMoves.length} moves; after merging turns {outcome.moves.length} remain. Verified: replaying them on your state leaves every piece in place and turned correctly.
          {outcome.stats.searchMs ? ` Search time ${(outcome.stats.searchMs / 1000).toFixed(2)} s.` : ''}
        </p>
        <code className="mono-block selectable">{text}</code>
        <button className="ghost small-btn" onClick={() => navigator.clipboard?.writeText(text)}>
          Copy moves
        </button>
        {outcome.notes.map((n, i) => (
          <p key={i} className="note small">
            {n}
          </p>
        ))}
      </div>
    );
  if (outcome.status === 'already-solved') return <div className="outcome ok"><p className="headline">{outcome.message}</p></div>;
  return (
    <div className="outcome err">
      <p className="headline">{outcome.message}</p>
      <IssueList issues={outcome.issues.filter((i) => i.severity === 'error')} checked={false} />
      {outcome.status === 'internal-error' && outcome.verification && (
        <ul className="issues">
          {outcome.verification.reasons.map((r, i) => (
            <li key={i} className="error">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

