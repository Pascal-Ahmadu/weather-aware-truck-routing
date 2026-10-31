import { ExclamationCircleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";

interface Props {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}

/**
 * Label + control + inline error. The label targets `id` (works for inputs and the
 * button-style controls); custom controls may also reference `${id}-label`.
 */
export function Field({ id, label, error, children }: Props) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label className="field-label" id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <span className="field-error" role="alert">
          <ExclamationCircleIcon className="error-icon" aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}
