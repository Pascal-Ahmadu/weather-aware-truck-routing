import { MinusIcon, PlusIcon } from "@heroicons/react/20/solid";
import { useMap } from "react-leaflet";

/** Zoom buttons styled like the rest of the overlays (Leaflet's default control is disabled). */
export function ZoomControl() {
  const map = useMap();
  return (
    <div className="zoom-control" role="group" aria-label="Map zoom">
      <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in">
        <PlusIcon />
      </button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out">
        <MinusIcon />
      </button>
    </div>
  );
}
