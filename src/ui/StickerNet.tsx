import { useRef } from 'react';
import { COLORS, COLOR_HEX, COLOR_NAMES, fischerShell, type Color } from '../cube/fischerShell';
import { FACE_NAMES } from '../cube/geometry';
import type { FaceletColor } from '../cube/facelets';
import { centreColours } from './describe';

interface Props {
  stickers: FaceletColor[];
  paint: FaceletColor;
  badSlots: number[];
  activeFace: number | null;
  onPaint: (c: FaceletColor) => void;
  onCell: (index: number) => void;
  onFace: (f: number | null) => void;
}

const CELL = 26;
const GAP = 12;
const FACE = CELL * 3;
// cross layout: U above F; L F R B in a row; D below F
const ORIGIN: [number, number][] = [
  [1, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 1],
  [3, 1],
];

/**
 * The mechanism net. Look straight at each layer of the puzzle; a cell that
 * is split shows two colours because one Fischer piece can carry two
 * stickers on that side.
 */
export function StickerNet({ stickers, paint, badSlots, activeFace, onPaint, onCell, onFace }: Props) {
  const shell = fischerShell();
  const dragging = useRef(false);
  const W = 4 * FACE + 3 * GAP,
    H = 3 * FACE + 2 * GAP + 14;
  return (
    <div className="sticker-net">
      <div className="palette" role="radiogroup" aria-label="Paint colour">
        {[...COLORS, '?' as const].map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={paint === c}
            className={'paint' + (paint === c ? ' on' : '')}
            style={{ background: c === '?' ? 'repeating-linear-gradient(45deg,#cfd4db 0 4px,#e8ebef 4px 8px)' : COLOR_HEX[c as Color] }}
            onClick={() => onPaint(c)}
            title={c === '?' ? 'Eraser' : COLOR_NAMES[c as Color]}
            aria-label={c === '?' ? 'Eraser' : COLOR_NAMES[c as Color]}
          />
        ))}
      </div>
      <svg
        viewBox={`-2 -2 ${W + 4} ${H + 4}`}
        className="net-svg"
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => (dragging.current = false)}
      >
        {ORIGIN.map(([gx, gy], f) => {
          const x = gx * (FACE + GAP),
            y = gy * (FACE + GAP) + 14;
          return (
            <g key={f}>
              <text x={x} y={y - 4} className={'net-label' + (activeFace === f ? ' on' : '')} onClick={() => onFace(activeFace === f ? null : f)}>
                {FACE_NAMES[f]} {centreColours(f).replace(' and ', '/')}
              </text>
              <rect x={x - 2} y={y - 2} width={FACE + 4} height={FACE + 4} rx={4} className={'net-face' + (activeFace === f ? ' on' : '')} onClick={() => onFace(f)} />
            </g>
          );
        })}
        {shell.samples.map((s) => {
          const [gx, gy] = ORIGIN[s.face];
          const x = gx * (FACE + GAP) + s.col * CELL + s.sub[0] * CELL,
            y = gy * (FACE + GAP) + 14 + s.row * CELL + s.sub[1] * CELL;
          const w = (s.sub[2] - s.sub[0]) * CELL,
            h = (s.sub[3] - s.sub[1]) * CELL;
          const c = stickers[s.index];
          return (
            <rect
              key={s.index}
              x={x + 1}
              y={y + 1}
              width={w - 2}
              height={h - 2}
              rx={2}
              className={'net-cell' + (badSlots.includes(s.slot) ? ' bad' : '') + (c === '?' ? ' blank' : '')}
              style={{ fill: c === '?' ? undefined : COLOR_HEX[c] }}
              onPointerDown={(e) => {
                (e.target as Element).releasePointerCapture?.(e.pointerId);
                dragging.current = true;
                onCell(s.index);
              }}
              onPointerEnter={() => dragging.current && onCell(s.index)}
            >
              <title>{`${FACE_NAMES[s.face]} layer, ${c === '?' ? 'blank' : COLOR_NAMES[c]}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
