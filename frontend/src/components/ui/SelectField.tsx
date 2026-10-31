import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import type { ComponentType, SVGProps } from "react";

export interface SelectOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  labelId?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  compact?: boolean;
}

export function SelectField<T extends string | number>({ value, options, onChange, labelId, icon: Icon, compact }: Props<T>) {
  const selected = options.find((option) => option.value === value);
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className={`control${compact ? " compact" : ""}`} aria-labelledby={labelId}>
        {Icon && <Icon className="input-icon" aria-hidden />}
        <span className="control-value">{selected?.label}</span>
        <ChevronUpDownIcon className="control-chevron" aria-hidden />
      </ListboxButton>
      <ListboxOptions anchor={{ to: "bottom start", gap: 4 }} className="listbox-options">
        {options.map((option) => (
          <ListboxOption key={String(option.value)} value={option.value} className="listbox-option">
            <span>{option.label}</span>
            <CheckIcon className="option-check" aria-hidden />
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}
