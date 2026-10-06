import { describeMove, moveLabel } from './describe';
import { moveInView } from '../cube/moves';

export interface PlayerProps {
  moves: number[];
  step: number; // number of moves already applied
  view: number;
  playing: boolean;
  busy: boolean;
  speed: number;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSeek: (step: number) => void;
  onSpeed: (s: number) => void;
  onClose: () => void;
}

/** Step-by-step guide through a verified solution. */
export function SolutionPlayer(p: PlayerProps) {
  const total = p.moves.length;
  const done = p.step >= total;
  const cur = done ? null : describeMove(p.view, p.moves[p.step]);
  return (
    <section className="player" aria-label="Solution steps">
      <div className="player-main">
        <div className="move-big" aria-live="polite">
          {cur ? cur.label : '✓'}
        </div>
        <div className="move-words">
          <div className="step-count">
            {done ? `All ${total} moves done` : `Step ${p.step + 1} / ${total}`}
          </div>
          <div className="move-sentence">{cur ? cur.sentence : 'The puzzle is solved.'}</div>
          <div className="move-detail">{cur ? cur.detail : 'Every piece is back in place and turned the right way.'}</div>
        </div>
      </div>

      <div className="player-controls">
        <button className="ghost icon" onClick={() => p.onSeek(0)} disabled={p.step === 0 || p.busy} aria-label="Back to start">
          ⏮
        </button>
        <button className="ghost" onClick={p.onPrev} disabled={p.step === 0 || p.busy}>
          Previous
        </button>
        <button className="primary play" onClick={p.onTogglePlay} disabled={done && !p.playing}>
          {p.playing ? 'Pause' : p.step === 0 ? 'Play' : 'Resume'}
        </button>
        <button className="ghost" onClick={p.onNext} disabled={done || p.busy}>
          Next
        </button>
        <button className="ghost icon" onClick={() => p.onSeek(total)} disabled={done || p.busy} aria-label="Jump to end">
          ⏭
        </button>
        <input
          className="progress"
          type="range"
          min={0}
          max={total}
          value={p.step}
          onChange={(e) => p.onSeek(+e.target.value)}
          aria-label="Solution progress"
        />
        <label className="speed">
          Speed
          <select value={p.speed} onChange={(e) => p.onSpeed(+e.target.value)}>
            <option value={0.5}>Slow</option>
            <option value={1}>Normal</option>
            <option value={2}>Fast</option>
          </select>
        </label>
        <button className="ghost" onClick={p.onClose}>
          Close
        </button>
      </div>

      <ol className="move-strip" aria-label="All moves">
        {p.moves.map((m, i) => (
          <li key={i}>
            <button
              className={i === p.step ? 'cur' : i < p.step ? 'past' : ''}
              onClick={() => p.onSeek(i)}
              aria-label={`Go to step ${i + 1}`}
              aria-current={i === p.step ? 'step' : undefined}
            >
              {moveLabel(moveInView(p.view, m))}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
