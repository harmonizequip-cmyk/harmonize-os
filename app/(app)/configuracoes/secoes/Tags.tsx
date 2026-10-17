"use client";

// Tags dos clientes: criar, renomear, trocar a cor e apagar.

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { Bloco } from "../ui";

export const TAG_PALETTE = [
  { name: "Teal", hex: "#3DBFB8" },
  { name: "Rosa", hex: "#E8789A" },
  { name: "Azul", hex: "#7EC8E3" },
  { name: "Lilás", hex: "#B8A0D0" },
  { name: "Âmbar", hex: "#F59E0B" },
  { name: "Vermelho", hex: "#EF4444" },
  { name: "Verde", hex: "#10B981" },
  { name: "Cinza", hex: "#6B7280" },
];

export interface TagRow {
  id: string;
  name: string;
  color: string;
  is_automatic: boolean;
}

function Cores({ valor, onChange }: { valor: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAG_PALETTE.map((c) => (
        <button
          key={c.hex}
          type="button"
          onClick={() => onChange(c.hex)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white transition active:scale-90"
          style={{ backgroundColor: c.hex, boxShadow: valor === c.hex ? `0 0 0 2px white, 0 0 0 4px ${c.hex}` : undefined }}
          aria-label={c.name}
        >
          {valor === c.hex && <Check size={14} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

export default function Tags({ iniciais }: { iniciais: TagRow[] }) {
  const supabase = createClient();
  const [tags, setTags] = useState<TagRow[]>(iniciais);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(TAG_PALETTE[0].hex);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState(TAG_PALETTE[0].hex);

  const ordenar = (l: TagRow[]) => [...l].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  async function criar() {
    const n = nome.trim();
    if (!n) return;
    setCriando(true);
    const { data, error } = await supabase.from("tags").insert({ name: n, color: cor }).select("id, name, color, is_automatic").single();
    setCriando(false);
    if (error) {
      avisar(error.code === "23505" ? "Já existe uma tag com esse nome." : "Não foi possível criar a tag.", "erro");
      return;
    }
    if (data) {
      setTags((p) => ordenar([...p, data]));
      setNome("");
      setCor(TAG_PALETTE[0].hex);
      avisar(`Tag "${data.name}" criada.`);
    }
  }

  async function salvarEdicao(id: string) {
    const n = editNome.trim();
    if (!n) return;
    const { error } = await supabase.from("tags").update({ name: n, color: editCor }).eq("id", id);
    if (error) {
      avisar(error.code === "23505" ? "Já existe uma tag com esse nome." : "Não foi possível salvar.", "erro");
      return;
    }
    setTags((p) => ordenar(p.map((t) => (t.id === id ? { ...t, name: n, color: editCor } : t))));
    setEditando(null);
  }

  async function apagar(tag: TagRow) {
    const ok = await confirmar({
      titulo: `Apagar a tag "${tag.name}"?`,
      texto: "Ela sai de todos os clientes que a usam.",
      confirmar: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("tags").delete().eq("id", tag.id);
    if (error) {
      avisar("Não foi possível apagar. Tente de novo.", "erro");
      return;
    }
    setTags((p) => p.filter((t) => t.id !== tag.id));
  }

  return (
    <div className="space-y-4">
      <Bloco titulo="Nova tag">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criar()}
              placeholder="Ex.: VIP, Indicação, Parceira"
              className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-brand-teal"
            />
            <button
              type="button"
              onClick={criar}
              disabled={criando || !nome.trim()}
              className="flex items-center gap-1 rounded-xl bg-brand-gradient px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus size={16} /> Criar
            </button>
          </div>
          <Cores valor={cor} onChange={setCor} />
          {nome.trim() && (
            <p className="text-xs text-neutral-500">
              Vai ficar assim:{" "}
              <span className="ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: cor }}>
                {nome.trim()}
              </span>
            </p>
          )}
        </div>
      </Bloco>

      <Bloco titulo={`Tags (${tags.length})`}>
        {tags.length === 0 && <p className="py-3 text-center text-sm text-neutral-400">Nenhuma tag ainda.</p>}
        <ul className="space-y-2">
          {tags.map((tag) =>
            editando === tag.id ? (
              <li key={tag.id} className="space-y-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-brand-teal/40">
                <input
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  autoFocus
                />
                <Cores valor={editCor} onChange={setEditCor} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditando(null)} className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200">
                    <X size={14} /> Cancelar
                  </button>
                  <button type="button" onClick={() => salvarEdicao(tag.id)} className="rounded-xl bg-brand-gradient px-4 py-2 text-xs font-bold text-white">
                    Salvar
                  </button>
                </div>
              </li>
            ) : (
              <li key={tag.id} className="flex items-center justify-between gap-2 rounded-2xl bg-neutral-50 py-1.5 pl-3 pr-1.5">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: tag.color }}>
                  {tag.name}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(tag.id);
                      setEditNome(tag.name);
                      setEditCor(tag.color);
                    }}
                    className="rounded-xl p-2 text-neutral-400 active:bg-neutral-200"
                    aria-label={`Editar ${tag.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button type="button" onClick={() => apagar(tag)} className="rounded-xl p-2 text-neutral-400 active:bg-rose-50 active:text-rose-600" aria-label={`Apagar ${tag.name}`}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      </Bloco>
    </div>
  );
}
