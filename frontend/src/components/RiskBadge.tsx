import type { RiskLevelValue } from "../lib/api";
import { riskColor, riskLabel } from "../lib/risk";

interface Props {
  level: RiskLevelValue | null | undefined;
  detail?: string;
}

/** Tinted status chip: risk colour at low opacity behind darkened risk-colour text. */
export function RiskBadge({ level, detail }: Props) {
  const color = riskColor(level);
  return (
    <span
      className="badge-risk"
      style={{
        background: `color-mix(in srgb, ${color} 22%, white)`,
        color: `color-mix(in srgb, ${color} 70%, black)`,
      }}
    >
      <span className="dot" aria-hidden />
      {riskLabel(level)}
      {detail && <span className="badge-detail">· {detail}</span>}
    </span>
  );
}
