import { COLOR_HEX, COLOR_NAMES, type Color } from '../cube/fischerShell';

export function Swatch({ colors, size = 14 }: { colors: Color[]; size?: number }) {
  return (
    <span className="swatch" aria-label={colors.map((c) => COLOR_NAMES[c]).join(', ')}>
      {colors.map((c, i) => (
        <span key={i} style={{ background: COLOR_HEX[c], width: size, height: size }} />
      ))}
    </span>
  );
}
