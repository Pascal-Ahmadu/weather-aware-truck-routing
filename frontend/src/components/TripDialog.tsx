import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";

import type { ApiError, PlanRequest } from "../lib/api";
import { TripForm, type TripPreset } from "./TripForm";

interface Props {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  error: ApiError | null;
  preset: TripPreset | null;
  onSubmit: (request: PlanRequest) => void;
}

/** The trip form in a centred modal so the sidebar never has to scroll past it. */
export function TripDialog({ open, onClose, isPending, error, preset, onSubmit }: Props) {
  return (
    <Dialog open={open} onClose={onClose} className="dialog">
      <DialogBackdrop transition className="dialog-backdrop" />
      <div className="dialog-scroll">
        <DialogPanel transition className="dialog-panel">
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            <XMarkIcon aria-hidden />
          </button>
          <TripForm isPending={isPending} error={error} preset={preset} onSubmit={onSubmit} />
        </DialogPanel>
      </div>
    </Dialog>
  );
}
