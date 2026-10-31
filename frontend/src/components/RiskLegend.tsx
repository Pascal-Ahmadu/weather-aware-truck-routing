import { RISK_LEVELS, UNKNOWN_RISK_COLOR } from "../lib/risk";

/** Colour key. `compact` lays the entries out in a wrapping row for narrow overlays. */
export function RiskLegend({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={`risk-legend${compact ? " compact" : ""}`} aria-label="Risk levels">
      {RISK_LEVELS.map((meta) => (
        <li key={meta.level}>
          <span className="swatch" style={{ background: meta.color }} />
          {meta.label}
        </li>
      ))}
      <li>
        <span className="swatch" style={{ background: UNKNOWN_RISK_COLOR }} />
        Unknown
      </li>
    </ul>
  );
}
