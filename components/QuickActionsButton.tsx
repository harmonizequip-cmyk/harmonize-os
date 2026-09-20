"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import NovaTarefaModal from "@/app/(app)/funil/NovaTarefaModal";
import NovoLeadModal from "@/app/(app)/funil/NovoLeadModal";
import NovoLancamentoModal from "@/app/(app)/financeiro/NovoLancamentoModal";
import NovoEventoModal from "@/app/(app)/agenda/NovoEventoModal";

interface ClientOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

type ActionKey = "tarefa" | "lancamento" | "lead" | "evento";

// Cada atalho aponta pro módulo de permissão que já governa a tela
// equivalente (mesma regra que Sidebar/BottomNav usam), pra um funcionário
// sem aquele acesso não ver a opção aqui também.
const ACTIONS: { key: ActionKey; label: string; emoji: string; module: string }[] = [
  { key: "tarefa", label: "Nova tarefa", emoji: "🗒️", module: "clientes" },
  { key: "lancamento", label: "Novo lançamento financeiro", emoji: "💰", module: "financeiro" },
  { key: "lead", label: "Novo lead/cliente", emoji: "🧲", module: "clientes" },
  { key: "evento", label: "Novo evento na agenda", emoji: "📅", module: "agenda" },
];

// Botão "+" único, disponível em toda tela (fica no layout, não em cada
// página). Reaproveita os mesmos formulários que já existem em Funil,
// Financeiro e Agenda — não duplica lógica de criação, só dá um atalho pra
// abrir qualquer um deles de onde a pessoa estiver.
export default function QuickActionsButton({
  permissions,
  isAdmin,
}: {
  permissions: Record<string, boolean>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActionKey | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const visibleActions = ACTIONS.filter((a) => isAdmin || permissions?.[a.module]);

  // Busca clientes e categorias de novo a cada vez que o menu abre, em vez
  // de guardar em cache — assim os dropdowns de cliente (tarefa, lançamento,
  // evento) sempre refletem um lead recém-criado em outra tela, sem
  // depender de recarregar a página inteira.
  async function openMenu() {
    setMenuOpen(true);
    const [clientsRes, categoriesRes] = await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("categories").select("id, name, type").eq("scope", "harmonize").order("name"),
    ]);
    setClients(clientsRes.data ?? []);
    setCategories(categoriesRes.data ?? []);
  }

  function handlePick(key: ActionKey) {
    setMenuOpen(false);
    setActiveModal(key);
  }

  function handleCreated() {
    setActiveModal(null);
    router.refresh();
  }

  if (visibleActions.length === 0) return null;

  return (
    <>
      <button
        onClick={openMenu}
        aria-label="Criar"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow-teal transition hover:brightness-110 active:scale-95 md:bottom-6"
      >
        <Plus size={26} strokeWidth={2} />
      </button>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white/95 p-4 pb-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Criar rápido</p>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="space-y-1">
              {visibleActions.map((a) => (
                <button
                  key={a.key}
                  onClick={() => handlePick(a.key)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <span className="text-lg">{a.emoji}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeModal === "tarefa" && (
        <NovaTarefaModal leads={clients} onClose={() => setActiveModal(null)} onCreated={handleCreated} />
      )}
      {activeModal === "lead" && <NovoLeadModal onClose={() => setActiveModal(null)} onCreated={handleCreated} />}
      {activeModal === "lancamento" && (
        <NovoLancamentoModal
          categories={categories}
          clients={clients}
          onClose={() => setActiveModal(null)}
          onCreated={handleCreated}
        />
      )}
      {activeModal === "evento" && (
        <NovoEventoModal clients={clients} onClose={() => setActiveModal(null)} onCreated={handleCreated} />
      )}
    </>
  );
}
