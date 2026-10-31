import type { ReactNode } from "react";

interface Props {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}

/** Label + control + inline error. Custom controls reference `${id}-label` via aria-labelledby. */
export function Field({ id, label, error, children }: Props) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      {children}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
