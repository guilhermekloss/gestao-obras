"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check } from "lucide-react";

export type ComboboxOption = {
  value: string;
  label: string;
  descricao?: string | null;
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function Combobox({
  id,
  options,
  value,
  onChange,
  onBlur,
  placeholder = "Buscar...",
  vazio = "Nenhum resultado encontrado",
  erro,
  mensagemErro = "Selecione uma opção",
  limparLabel,
  aoSelecionar,
  className,
  inputClassName,
}: {
  /** Liga o campo ao `<label htmlFor>`. */
  id?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  vazio?: string;
  erro?: boolean;
  mensagemErro?: string;
  limparLabel?: string;
  aoSelecionar?: (opt: ComboboxOption | null) => void;
  className?: string;
  inputClassName?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const listaId = useId();

  const selecionado = options.find((o) => o.value === value) ?? null;

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    const digitos = busca.replace(/\D/g, "");
    if (!termo) return options.slice(0, 50);
    return options
      .filter((o) => {
        const alvo = normalizar(`${o.label} ${o.descricao ?? ""}`);
        if (termo.split(/\s+/).every((p) => alvo.includes(p))) return true;
        if (digitos.length > 0) {
          const alvoDigitos = `${o.label}${o.descricao ?? ""}`.replace(/\D/g, "");
          if (alvoDigitos.includes(digitos)) return true;
        }
        return false;
      })
      .slice(0, 50);
  }, [busca, options]);

  const lista = useMemo<ComboboxOption[]>(() => {
    if (limparLabel && !normalizar(busca)) {
      return [{ value: "", label: limparLabel }, ...filtrados];
    }
    return filtrados;
  }, [filtrados, limparLabel, busca]);

  // a lista fica num portal: clicar nela não conta como "fora"
  useEffect(() => {
    function handler(e: MouseEvent) {
      const alvo = e.target as Node;
      const dentro =
        containerRef.current?.contains(alvo) || listaRef.current?.contains(alvo);
      if (!dentro) {
        setAberto(false);
        setBusca("");
        onBlur?.();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onBlur]);

  useEffect(() => {
    if (!aberto) return;
    function medir() {
      const el = campoRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [aberto]);

  function buscar(texto: string) {
    setBusca(texto);
    setDestaque(0);
    setAberto(true);
  }

  function selecionar(opt: ComboboxOption) {
    onChange(opt.value);
    setAberto(false);
    setBusca("");
    inputRef.current?.blur();
    aoSelecionar?.(opt.value ? opt : null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto && (e.key === "ArrowDown" || e.key === "Enter")) {
      setAberto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, lista.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = lista[destaque];
      if (opt) selecionar(opt);
    } else if (e.key === "Escape") {
      setAberto(false);
      setBusca("");
    }
  }

  const mostrarErro = erro && !aberto;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div ref={campoRef} className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={aberto ? busca : selecionado?.label ?? ""}
          placeholder={placeholder}
          onFocus={() => {
            setAberto(true);
            setBusca("");
          }}
          onChange={(e) => buscar(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn("pr-8", mostrarErro && "border-destructive focus-visible:ring-destructive", inputClassName)}
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={aberto ? listaId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={aberto && lista[destaque] ? `${listaId}-${destaque}` : undefined}
          aria-invalid={mostrarErro}
        />
        {selecionado && !aberto ? (
          <Check className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-estado-no-prazo-fg" />
        ) : (
          <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      {mostrarErro && <p className="mt-1 text-xs text-destructive">{mensagemErro}</p>}

      {aberto &&
        coords &&
        createPortal(
          <ul
            ref={listaRef}
            id={listaId}
            role="listbox"
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
            className="z-50 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          >
            {lista.length === 0 ? (
              <li role="presentation" className="px-2 py-2 text-muted-foreground">{vazio}</li>
            ) : (
              lista.map((o, i) => {
                const ativo = !!o.value && o.value === value;
                return (
                  <li key={o.value || "__limpar__"} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listaId}-${i}`}
                      aria-selected={i === destaque}
                      tabIndex={-1}
                      onMouseEnter={() => setDestaque(i)}
                      onMouseDown={(e) => {
                        // evita o blur do input antes do clique registrar
                        e.preventDefault();
                        selecionar(o);
                      }}
                      className={cn(
                        "flex min-h-9 w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground pointer-coarse:min-h-12 pointer-coarse:px-3 pointer-coarse:text-base",
                        i === destaque && "bg-accent text-accent-foreground",
                        ativo && "font-medium",
                        !o.value && "text-muted-foreground",
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {o.label}
                          {ativo && <span className="ml-2 text-xs text-primary">• selecionado</span>}
                        </span>
                        {o.descricao && (
                          <span className="truncate text-xs text-muted-foreground">{o.descricao}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
