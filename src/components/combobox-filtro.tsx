"use client";

import { useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";

export function ComboboxFiltro({
  id,
  name,
  options,
  defaultValue = "",
  placeholder = "Buscar...",
  todosLabel,
  autoSubmit,
  className,
  inputClassName,
}: {
  /** Liga o campo ao `<label htmlFor>`. */
  id?: string;
  name: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  todosLabel?: string;
  autoSubmit?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input ref={ref} type="hidden" name={name} value={value} />
      <Combobox
        id={id}
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          if (autoSubmit) {
            // espera o input oculto atualizar antes de submeter
            requestAnimationFrame(() => ref.current?.form?.requestSubmit());
          }
        }}
        placeholder={placeholder}
        limparLabel={todosLabel}
        className={className}
        inputClassName={inputClassName}
      />
    </>
  );
}
