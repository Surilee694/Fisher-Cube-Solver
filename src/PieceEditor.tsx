import { CORNER_IDS, CUBIE_CODE, CUBIE_TYPE, EDGE_IDS, NUM_CUBIES } from '../cube/geometry';
import { fischerShell, orientationVisible, pieceName } from '../cube/fischerShell';
import { fromArrays, toArrays } from '../cube/cubies';
import { occupancy, type CubeState } from '../cube/state';
import { Swatch } from './Swatch';
import { slotDescription } from './describe';

interface Props {
  cube: CubeState;
  selected: number | null;
  onSelect: (slot: number | null) => void;
  onChange: (s: CubeState) => void;
}

const GROUPS: { title: string; slots: number[] }[] = [
  { title: 'Corners', slots: CORNER_IDS },
  { title: 'Top and bottom edges', slots: EDGE_IDS.slice(0, 8) },
  { title: 'Middle edges', slots: EDGE_IDS.slice(8) },
  { title: 'Centres', slots: [20, 21, 22, 23, 24, 25] },
];

/**
 * Cubie-based entry: pick a position (in 3D or in the list), say which piece
 * is there, and turn it until it matches. The state stays a valid arrangement
 * of the 26 real pieces at all times, so counting errors cannot happen here.
 */
export function PieceEditor({ cube, selected, onSelect, onChange }: Props) {
  const shell = fischerShell();
  const { bySlot } = occupancy(cube);
  const a = toArrays(cube);

  const edit = (fn: (arr: ReturnType<typeof toArrays>) => void) => {
    const arr = toArrays(cube);
    fn(arr);
    onChange(fromArrays(arr));
  };
  const place = (slot: number, piece: number) =>
    edit((arr) => {
      if (slot < 8) {
        const t = arr.cp.indexOf(piece);
        [arr.cp[slot], arr.cp[t]] = [arr.cp[t], arr.cp[slot]];
      } else {
        const t = arr.ep.indexOf(piece - 8);
        [arr.ep[slot - 8], arr.ep[t]] = [arr.ep[t], arr.ep[slot - 8]];
      }
    });

  const slot = selected;
  const piece = slot === null ? null : bySlot[slot]!;
  const type = slot === null ? null : CUBIE_TYPE[slot];

  return (
    <div className="piece-editor">
      <div className="slot-groups">
        {GROUPS.map((g) => (
          <div key={g.title} className="slot-group">
            <div className="group-title">{g.title}</div>
            <div className="slot-grid">
              {g.slots.map((s) => (
                <button key={s} className={'slot-btn' + (s === slot ? ' on' : '')} onClick={() => onSelect(s === slot ? null : s)} title={slotDescription(s)}>
                  <span className="code">{CUBIE_CODE[s]}</span>
                  <Swatch colors={shell.pieceColors[bySlot[s]!]} size={9} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {slot === null || piece === null ? (
        <p className="hint">Click a piece on the 3D puzzle, or pick a position above. Then tell the editor which piece is there and turn it until the screen matches your puzzle.</p>
      ) : (
        <div className="slot-editor">
          <h3>
            {CUBIE_CODE[slot]} <span className="muted">{slotDescription(slot)}</span>
          </h3>
          {type !== 'center' ? (
            <>
              <div className="field-label">Piece in this position</div>
              <div className="piece-picker">
                {Array.from({ length: NUM_CUBIES }, (_, c) => c)
                  .filter((c) => CUBIE_TYPE[c] === type)
                  .map((c) => (
                    <button key={c} className={'piece-btn' + (c === piece ? ' on' : '')} onClick={() => c !== piece && place(slot, c)} title={pieceName(c)}>
                      <Swatch colors={shell.pieceColors[c]} size={12} />
                    </button>
                  ))}
              </div>
              <p className="muted small">Choosing a piece swaps it with wherever it was, so every piece is always used exactly once.</p>
            </>
          ) : (
            <p className="muted small">Centres are fixed to the core. Only their rotation can change.</p>
          )}

          <div className="field-label">Orientation</div>
          {type === 'corner' && (
            <div className="btn-row">
              <button onClick={() => edit((arr) => (arr.co[slot] = (arr.co[slot] + 2) % 3))}>Twist ↻</button>
              <button onClick={() => edit((arr) => (arr.co[slot] = (arr.co[slot] + 1) % 3))}>Twist ↺</button>
              <span className="muted small">{['top/bottom colour faces up or down', 'turned ↺ one third', 'turned ↻ one third'][a.co[slot]]}</span>
            </div>
          )}
          {type === 'edge' &&
            (orientationVisible(piece) ? (
              <div className="btn-row">
                <button onClick={() => edit((arr) => (arr.eo[slot - 8] ^= 1))}>Flip</button>
                <span className="muted small">{a.eo[slot - 8] ? 'flipped' : 'not flipped'}</span>
              </div>
            ) : (
              <p className="muted small">Middle-layer edges show a single colour, so a flipped one looks exactly the same. Nothing to set.</p>
            ))}
          {type === 'center' &&
            (orientationVisible(piece) ? (
              <div className="btn-row">
                <button onClick={() => edit((arr) => (arr.ctr[slot - 20] = (arr.ctr[slot - 20] + 1) % 4))}>Rotate ↻ 90°</button>
                <button onClick={() => edit((arr) => (arr.ctr[slot - 20] = (arr.ctr[slot - 20] + 3) % 4))}>Rotate ↺ 90°</button>
                <span className="muted small">{a.ctr[slot - 20] * 90}°</span>
              </div>
            ) : (
              <p className="muted small">The top and bottom centres are plain squares of one colour: their rotation cannot be seen and does not matter.</p>
            ))}
        </div>
      )}
    </div>
  );
}
