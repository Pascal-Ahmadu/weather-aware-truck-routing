import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet used on phones so the map keeps the whole screen. */
export function PlanSheet({ open, onClose, children }: Props) {
  return (
    <Dialog open={open} onClose={onClose} className="dialog">
      <DialogBackdrop transition className="dialog-backdrop" />
      <div className="dialog-scroll sheet-scroll">
        <DialogPanel transition className="dialog-panel sheet">
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            <XMarkIcon aria-hidden />
          </button>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
