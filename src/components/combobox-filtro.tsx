"use client";

import { useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";

/**
 * Combobox com busca para usar em forms de filtro `method="get"`.
 * Alimenta um input oculto com o valor escolhido; com `autoSubmit`,
 * envia o form assim que o usuário seleciona (telas de filtro único).
 */
export function ComboboxFiltro({
  name,
  options,
  defaultValue = "",
  placeholder = "Buscar...",
  todosLabel,
  autoSubmit,
  className,
}: {
  name: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  todosLabel?: string;
  autoSubmit?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input ref={ref} type="hidden" name={name} value={value} />
      <Combobox
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
      />
    </>
  );
}
