"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toUpperTrim } from "@/lib/format";

export interface ClientOption {
  id: string;
  name: string;
}

// Combobox com busca por nome, usado em todo formulário que pede um
// cliente (agendar evento, reservar HIPRO etc). Além de filtrar a lista
// enquanto digita, tem o atalho "+ Cadastrar novo" pra criar cliente ou
// lead sem sair do formulário — pede só nome e WhatsApp pra não travar
// o fluxo; o resto (cidade, origem, observação...) fica pra completar
// depois no cadastro completo em Clientes ou Funil.
export default function ClientPicker({
  clients,
  value,
  onChange,
  onClientCreated,
  label = "Cliente",
  optional = false,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  onClientCreated: (client: ClientOption) => void;
  label?: string;
  optional?: boolean;
}) {
  const supabase = createClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newStage, setNewStage] = useState<"cliente" | "lead">("cliente");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = clients.find((c) => c.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : clients.slice(0, 8);

  function selectClient(c: ClientOption) {
    onChange(c.id);
    setQuery("");
    setOpen(false);
    setCreating(false);
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Informe o nome.");
      return;
    }
    setSaving(true);
    setCreateError(null);
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: toUpperTrim(newName),
        whatsapp: newWhatsapp || null,
        stage: newStage,
        is_client: newStage === "cliente",
      })
      .select("id, name")
      .single();
    setSaving(false);
    if (error || !data) {
      setCreateError("Não foi possível cadastrar. Tente novamente.");
      return;
    }
    onClientCreated(data);
    onChange(data.id);
    setCreating(false);
    setOpen(false);
    setQuery("");
    setNewName("");
    setNewWhatsapp("");
    setNewStage("cliente");
  }

  return (
    <div ref={containerRef}>
      <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label} {optional && <span className="text-neutral-400">(opcional)</span>}
      </label>

      <input
        value={open ? query : (selected?.name ?? "")}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder="Buscar por nome..."
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
      />

      {open && (
        <div className="mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {!creating ? (
            <>
              <div className="max-h-52 overflow-y-auto">
                {optional && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setQuery("");
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-700"
                  >
                    Nenhum
                  </button>
                )}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-sm text-neutral-400">Ninguém encontrado.</p>
                )}
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectClient(c)}
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  setNewName(query.trim());
                }}
                className="block w-full border-t border-neutral-200 px-3 py-2 text-left text-sm font-medium text-brand-teal hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700"
              >
                + Cadastrar novo cliente/lead
              </button>
            </>
          ) : (
            <div className="space-y-2 p-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome"
                autoFocus
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <input
                value={newWhatsapp}
                onChange={(e) => setNewWhatsapp(e.target.value)}
                placeholder="WhatsApp (opcional)"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setNewStage("cliente")}
                  className={`flex-1 rounded-lg border py-1.5 font-medium ${
                    newStage === "cliente"
                      ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setNewStage("lead")}
                  className={`flex-1 rounded-lg border py-1.5 font-medium ${
                    newStage === "lead"
                      ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  Lead
                </button>
              </div>
              {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setCreateError(null);
                  }}
                  className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-brand-gradient py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Salvar e usar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
