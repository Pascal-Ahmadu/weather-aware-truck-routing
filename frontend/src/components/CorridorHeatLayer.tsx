import { Pane, Polyline } from "react-leaflet";

import type { CorridorSegment } from "../lib/corridor";
import { riskColor } from "../lib/risk";

interface Props {
  segments: CorridorSegment[];
  hour: number;
  visible: boolean;
}

/**
 * Weather heatmap along the corridor: each stretch of road between checkpoints is
 * painted in the exact risk colour for the selected forecast hour. A blurred,
 * semi-transparent pane gives the heat look without additive blending, so a
 * Low corridor can never accumulate into a Severe-looking one.
 */
export function CorridorHeatLayer({ segments, hour, visible }: Props) {
  return (
    <Pane name="corridor" style={{ zIndex: 350, filter: "blur(9px)", opacity: visible ? 0.85 : 0 }}>
      {visible &&
        segments.map((segment) => {
          const level = segment.checkpoint.forecast?.risk[hour] ?? null;
          return (
            <Polyline
              key={segment.key}
              positions={segment.positions}
              interactive={false}
              pathOptions={{
                color: riskColor(level),
                weight: 26,
                opacity: level == null ? 0.35 : 0.75,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          );
        })}
    </Pane>
  );
}
