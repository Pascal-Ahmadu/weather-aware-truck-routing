import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";

import type { PlanResponse } from "../lib/api";
import { worstRiskAtEta } from "../lib/explain";
import { formatDateTime } from "../lib/format";
import { RiskBadge } from "./RiskBadge";
import { RouteList } from "./RouteList";

interface Props {
  open: boolean;
  result: PlanResponse;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Ranked routes in a centred modal; picking one selects it on the map and closes. */
export function ResultsDialog({ open, result, selectedId, onSelect, onClose }: Props) {
  const recommended = result.routes.find((r) => r.recommended) ?? null;

  return (
    <Dialog open={open} onClose={onClose} className="dialog">
      <DialogBackdrop transition className="dialog-backdrop" />
      <div className="dialog-scroll">
        <DialogPanel transition className="dialog-panel dialog-panel-wide">
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            <XMarkIcon aria-hidden />
          </button>
          <div className="card-header">
            <DialogTitle className="card-title">
              {result.routes.length} route{result.routes.length === 1 ? "" : "s"} found
            </DialogTitle>
            <p className="card-desc">
              {result.query.origin.name.split(",")[0]} → {result.query.destination.name.split(",")[0]} ·{" "}
              {formatDateTime(result.query.departure_time)} · {result.query.load_weight_lb.toLocaleString()} lb
              {result.routing.profile === "driving-hgv" && result.routing.gross_weight_lb !== null
                ? ` · truck routing at ${result.routing.gross_weight_lb.toLocaleString()} lb gross`
                : " · car routing"}
            </p>
            {recommended && (
              <div className="results-worst">
                <RiskBadge level={worstRiskAtEta(recommended)} detail="worst checkpoint on the recommended route" />
              </div>
            )}
          </div>
          <div className="card-body">
            <RouteList
              routes={result.routes}
              selectedId={selectedId}
              onSelect={(id) => {
                onSelect(id);
                onClose();
              }}
            />
            <p className="ranking-note">
              Ranked by fewest No Travel miles, then Severe miles, High miles, lowest average risk, shortest time.
              Pick a route to see it on the map.
            </p>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
