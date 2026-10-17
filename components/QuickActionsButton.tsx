"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";
import { Banknote, CalendarDays, CalendarPlus, ClipboardList, ListChecks, type LucideIcon, Mic, Plus, Tag, Target, UserPlus, Wallet, X } from "lucide-react";
import { IconeChip, type CorVisual } from "@/components/ui/Visual";
import { createClient } from "@/lib/supabase/client";
import NovaTarefaModal from "@/app/(app)/funil/NovaTarefaModal";
import NovoLeadModal from "@/app/(app)/funil/NovoLeadModal";
import NovoLancamentoModal from "@/app/(app)/financeiro/NovoLancamentoModal";
import NovoEventoModal from "@/app/(app)/agenda/NovoEventoModal";
import ReservarHiproModal from "@/app/(app)/agenda/ReservarHiproModal";
import CalculadoraLocacaoModal from "@/components/CalculadoraLocacaoModal";
import TabelaPrecosModal from "@/components/TabelaPrecosModal";
import ReceberPagamentoModal from "@/components/ReceberPagamentoModal";
import type { PricingConfig } from "@/lib/rental-pricing";

interface ClientOption {
  id: string;
  name: string;
  whatsapp?: string | null;
  // Usado só pela CalculadoraLocacaoModal (mode "create"), pra decidir se
  // oferece "cobrar taxa de reserva agora": parceiro nunca paga, é a
  // mesma regra do gatilho do banco (calendar_events_definir_taxa).
  parceiro?: boolean | null;
}

interface CategoryOption {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

type ActionKey =
  | "tarefa"
  | "lancamento"
  | "lead"
  | "evento"
  | "locacao"
  | "locacao_disparos"
  | "receber"
  | "despesa_voz"
  | "tabela"
  | "planejador";

// Cada atalho aponta pro módulo de permissão que já governa a tela
// equivalente (mesma regra que Sidebar/BottomNav usam), pra um funcionário
// sem aquele acesso não ver a opção aqui também.
// Ícone e cor de cada atalho (padrão visual: ícone em quadradinho, sem emoji).
const VISUAL_ACAO: Record<ActionKey, { icone: LucideIcon; cor: CorVisual }> = {
  receber: { icone: Banknote, cor: "verde" },
  locacao: { icone: CalendarPlus, cor: "teal" },
  locacao_disparos: { icone: Target, cor: "teal" },
  evento: { icone: CalendarDays, cor: "azul" },
  planejador: { icone: ClipboardList, cor: "roxo" },
  lancamento: { icone: Wallet, cor: "ambar" },
  despesa_voz: { icone: Mic, cor: "ambar" },
  lead: { icone: UserPlus, cor: "rosa" },
  tarefa: { icone: ListChecks, cor: "verde" },
  tabela: { icone: Tag, cor: "roxo" },
};

// Em grupos e em blocos de duas colunas, como o Menu (pedido do dono,
// 17/10/2026). Receber pagamento, o mais usado, vem em destaque no topo.
const GRUPOS_ACAO = ["Agenda", "Dinheiro", "Clientes"] as const;
const ACTIONS: { key: ActionKey; label: string; dica: string; emoji: string; module: string; grupo: (typeof GRUPOS_ACAO)[number] | "destaque" }[] = [
  { key: "receber", label: "Receber pagamento", dica: "Aluguel ou taxa de reserva", emoji: "💵", module: "financeiro", grupo: "destaque" },
  // Pedido 1 da auditoria: lançar disparos direto pelo "+", sem entrar na
  // ficha do cliente. Nomes escolhidos pra não se confundirem entre si.
  { key: "locacao", label: "Reservar data", dica: "Sem disparos ainda", emoji: "📦", module: "agenda", grupo: "Agenda" },
  { key: "locacao_disparos", label: "Lançar locação", dica: "Com os disparos", emoji: "🎯", module: "agenda", grupo: "Agenda" },
  { key: "evento", label: "Evento", dica: "Na agenda", emoji: "📅", module: "agenda", grupo: "Agenda" },
  { key: "planejador", label: "Planejamento", dica: "Planejador HIPRO", emoji: "📋", module: "agenda", grupo: "Agenda" },
  { key: "lancamento", label: "Lançamento", dica: "Entrada ou saída", emoji: "💰", module: "financeiro", grupo: "Dinheiro" },
  { key: "despesa_voz", label: "Despesa por voz", dica: "Fale o gasto", emoji: "🎙️", module: "financeiro", grupo: "Dinheiro" },
  { key: "lead", label: "Novo lead", dica: "Ou cliente", emoji: "🧲", module: "clientes", grupo: "Clientes" },
  { key: "tarefa", label: "Tarefa", dica: "Lembrete com data", emoji: "🗒️", module: "clientes", grupo: "Clientes" },
  { key: "tabela", label: "Tabela de preços", dica: "Arte para mandar", emoji: "🏷️", module: "clientes", grupo: "Clientes" },
];

// Botão "+" único, disponível em toda tela (fica no layout, não em cada
// página). Reaproveita os mesmos formulários que já existem em Funil,
// Financeiro e Agenda — não duplica lógica de criação, só dá um atalho pra
// abrir qualquer um deles de onde a pessoa estiver.
export default function QuickActionsButton({
  permissions,
  isAdmin,
  pricingConfig,
  reservationFee,
}: {
  permissions: Record<string, boolean>;
  isAdmin: boolean;
  pricingConfig?: PricingConfig;
  reservationFee?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActionKey | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [equipments, setEquipments] = useState<EquipmentOption[]>([]);

  const visibleActions = ACTIONS.filter((a) => isAdmin || permissions?.[a.module]);

  // Busca clientes, categorias e equipamentos de novo a cada vez que o menu
  // abre, em vez de guardar em cache — assim os dropdowns (tarefa,
  // lançamento, evento, locação) sempre refletem um lead ou equipamento
  // recém-criado em outra tela, sem depender de recarregar a página inteira.
  async function openMenu() {
    setMenuOpen(true);
    const [clientsRes, categoriesRes, equipmentsRes] = await Promise.all([
      supabase.from("clients").select("id, name, city, whatsapp, parceiro").order("name"),
      supabase.from("categories").select("id, name, type").eq("scope", "harmonize").order("name"),
      supabase.from("equipments").select("id, code, name").order("code"),
    ]);
    setClients(clientsRes.data ?? []);
    setCategories(categoriesRes.data ?? []);
    setEquipments(equipmentsRes.data ?? []);
  }

  // Atalho do ícone do app (manifest): /qualquer-tela?acao=receber abre direto
  // a janela pedida. O parâmetro sai da barra de endereço logo depois, para
  // um recarregar não abrir de novo.
  useEffect(() => {
    const url = new URL(window.location.href);
    const acao = url.searchParams.get("acao") as ActionKey | null;
    if (!acao || !visibleActions.some((a) => a.key === acao)) return;
    url.searchParams.delete("acao");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    openMenu().then(() => {
      setMenuOpen(false);
      setActiveModal(acao);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePick(key: ActionKey) {
    setMenuOpen(false);
    // O planejador é uma tela, não uma janela.
    if (key === "planejador") {
      router.push("/planejador/novo");
      return;
    }
    setActiveModal(key);
  }

  function handleCreated() {
    setActiveModal(null);
    router.refresh();
  }

  if (visibleActions.length === 0) return null;

  // No espaço Pessoal o "+" é da Harmonize e não aparece (cada tela pessoal tem o próprio botão).
  if (ehEspacoPessoal(pathname)) return null;
  // Na tela do assistente o "+" ficaria em cima do campo de pergunta.
  if (pathname.startsWith("/assistente")) return null;

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
            className="w-full max-w-md rounded-t-3xl bg-neutral-50/95 p-4 pb-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-base font-bold text-neutral-900">Criar</p>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="max-h-[78dvh] space-y-3 overflow-y-auto">
              {visibleActions
                .filter((a) => a.grupo === "destaque")
                .map((a) => (
                  <button
                    key={a.key}
                    onClick={() => handlePick(a.key)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-400 px-4 py-3 text-left text-white shadow-glow-teal active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
                      {(() => {
                        const I = VISUAL_ACAO[a.key].icone;
                        return <I size={20} />;
                      })()}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold leading-tight">{a.label}</span>
                      <span className="block text-xs text-white/85">{a.dica}</span>
                    </span>
                  </button>
                ))}
              {GRUPOS_ACAO.map((g) => {
                const itens = visibleActions.filter((a) => a.grupo === g);
                if (!itens.length) return null;
                return (
                  <section key={g}>
                    <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">{g}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {itens.map((a) => (
                        <button
                          key={a.key}
                          onClick={() => handlePick(a.key)}
                          className="flex items-center gap-2 rounded-2xl bg-white px-2.5 py-2.5 text-left shadow-[0_8px_20px_-16px_rgb(15_23_42/0.25)] ring-1 ring-slate-200/70 transition active:bg-neutral-50"
                        >
                          <IconeChip icone={VISUAL_ACAO[a.key].icone} cor={VISUAL_ACAO[a.key].cor} tamanho="sm" />
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold leading-tight text-neutral-800">{a.label}</span>
                            <span className="block truncate text-[11px] leading-tight text-neutral-500">{a.dica}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeModal === "tarefa" && (
        <NovaTarefaModal leads={clients} onClose={() => setActiveModal(null)} onCreated={handleCreated} />
      )}
      {activeModal === "receber" && <ReceberPagamentoModal onClose={() => setActiveModal(null)} />}
      {activeModal === "lead" && <NovoLeadModal onClose={() => setActiveModal(null)} onCreated={handleCreated} />}
      {activeModal === "lancamento" && (
        <NovoLancamentoModal
          categories={categories}
          clients={clients}
          onClose={() => setActiveModal(null)}
          onCreated={handleCreated}
        />
      )}
      {activeModal === "despesa_voz" && (
        <NovoLancamentoModal
          categories={categories}
          clients={clients}
          porVoz
          onClose={() => setActiveModal(null)}
          onCreated={handleCreated}
        />
      )}
      {activeModal === "evento" && (
        <NovoEventoModal clients={clients} onClose={() => setActiveModal(null)} onCreated={handleCreated} />
      )}
      {activeModal === "locacao" && (
        <ReservarHiproModal
          clients={clients}
          equipments={equipments}
          onClose={() => setActiveModal(null)}
          onCreated={handleCreated}
        />
      )}
      {activeModal === "tabela" && <TabelaPrecosModal onClose={() => setActiveModal(null)} />}
      {activeModal === "locacao_disparos" && (
        <CalculadoraLocacaoModal
          mode={{ kind: "create", clients, equipments }}
          pricingConfig={pricingConfig}
          reservationFee={reservationFee}
          onClose={() => setActiveModal(null)}
          onDone={handleCreated}
        />
      )}
    </>
  );
}
