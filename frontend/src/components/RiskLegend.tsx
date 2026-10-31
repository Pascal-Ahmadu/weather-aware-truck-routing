import { RISK_LEVELS, UNKNOWN_RISK_COLOR } from "../lib/risk";

export function RiskLegend() {
  return (
    <ul className="risk-legend" aria-label="Risk levels">
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
