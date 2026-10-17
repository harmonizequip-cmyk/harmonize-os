"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";
import {
  HeartHandshake,
  LayoutDashboard,
  GitBranch,
  Wallet,
  CalendarDays,
  Menu,
  X,
  Users,
  ListChecks,
  Package,
  BarChart3,
  History,
  Receipt,
  HandCoins,
  Landmark,
  FileText,
  Settings,
  PiggyBank,
  CreditCard,
  Sparkles,
  Brain,
  ClipboardList,
} from "lucide-react";

// Os 4 atalhos de uso diário, nessa ordem. O 5º e último botão não é um
// link, é o gatilho do menu com o restante (ver MORE_ITEMS).
const MAIN_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
];

// Menu do espaço Pessoal (chave Harmonize | Pessoal no topo).
const PESSOAL_ITEMS = [
  { href: "/pessoal", label: "Início", icon: PiggyBank, module: "pessoal" },
  { href: "/pessoal/lancamentos", label: "Lançamentos", icon: Wallet, module: "pessoal" },
  { href: "/pessoal/cartoes", label: "Cartões", icon: CreditCard, module: "pessoal" },
  { href: "/pessoal/relatorios", label: "Relatórios", icon: BarChart3, module: "pessoal" },
];

// Tudo que não é atalho do dia a dia fica atrás do botão de menu, em grupos
// por assunto (pedido do dono, 17/10/2026), em duas colunas para caber numa
// tela só, sem rolar.
const GRUPOS = ["Atendimento", "Dinheiro", "Inteligência", "Sistema"] as const;
// Cor do quadradinho do ícone por grupo (padrão visual aprovado).
const COR_GRUPO: Record<(typeof GRUPOS)[number], string> = {
  Atendimento: "bg-teal-50 text-teal-600",
  Dinheiro: "bg-amber-50 text-amber-600",
  Inteligência: "bg-violet-50 text-violet-600",
  Sistema: "bg-slate-100 text-slate-500",
};
const MORE_ITEMS: { href: string; label: string; icon: typeof Users; module: string; grupo: (typeof GRUPOS)[number] }[] = [
  { href: "/relacionamento", label: "Relacionamento", icon: HeartHandshake, module: "clientes", grupo: "Atendimento" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes", grupo: "Atendimento" },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, module: "clientes", grupo: "Atendimento" },
  { href: "/planejador", label: "Planejador", icon: ClipboardList, module: "agenda", grupo: "Atendimento" },
  { href: "/contratos", label: "Contratos", icon: FileText, module: "agenda", grupo: "Atendimento" },
  { href: "/locacoes", label: "Locações", icon: Receipt, module: "financeiro", grupo: "Dinheiro" },
  { href: "/pendencias", label: "Pendências", icon: HandCoins, module: "financeiro", grupo: "Dinheiro" },
  { href: "/financeiro/cartoes", label: "Cartões", icon: CreditCard, module: "financeiro", grupo: "Dinheiro" },
  { href: "/financeiro/emprestimos", label: "Empréstimos", icon: Landmark, module: "financeiro", grupo: "Dinheiro" },
  { href: "/assistente", label: "Assistente", icon: Sparkles, module: "dashboard", grupo: "Inteligência" },
  { href: "/insights", label: "Cérebro", icon: Brain, module: "dashboard", grupo: "Inteligência" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios", grupo: "Inteligência" },
  { href: "/equipamentos", label: "Equipamentos", icon: Package, module: "equipamentos", grupo: "Sistema" },
  { href: "/movimentacoes", label: "Movimentações", icon: History, module: "configuracoes", grupo: "Sistema" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes", grupo: "Sistema" },
];

export default function BottomNav({
  permissions,
  isAdmin,
  permissionsLoaded,
}: {
  permissions: Record<string, boolean>;
  isAdmin: boolean;
  permissionsLoaded?: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const pessoal = ehEspacoPessoal(pathname);

  const mainItems = (pessoal ? PESSOAL_ITEMS : MAIN_ITEMS).filter((item) => isAdmin || permissions?.[item.module]);
  const moreItemsByPermission = MORE_ITEMS.filter((item) => isAdmin || permissions?.[item.module]);
  // Mesma cautela de sempre: se a busca de permissões no servidor falhou
  // (permissionsLoaded === false), não dá pra confiar na lista filtrada —
  // melhor mostrar tudo do que esconder o menu inteiro por um problema que
  // não tem nada a ver com o que o usuário pode acessar.
  const moreItems = permissionsLoaded === false ? MORE_ITEMS : moreItemsByPermission;
  const isInMore = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-neutral-200/60 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_-16px_rgb(15_23_42/0.2)] backdrop-blur-xl md:hidden">
        {mainItems.map((item) => {
          // "Início" do Pessoal (/pessoal) só acende na própria página.
          const active = item.href === "/pessoal" ? pathname === "/pessoal" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center rounded-xl px-2 py-0.5 text-[11px] transition ${
                active ? "text-teal-600" : "text-neutral-500"
              }`}
            >
              <span
                className={`flex h-8 w-12 items-center justify-center rounded-2xl transition ${
                  active ? "bg-teal-50" : ""
                }`}
              >
                <Icon
                  size={19}
                  strokeWidth={1.9}
                  className={active ? "text-teal-600" : ""}
                />
              </span>
              <span className="mt-0.5 font-medium">{item.label}</span>
            </Link>
          );
        })}

        {!pessoal && <button
          onClick={() => setMenuOpen(true)}
          className={`flex flex-col items-center rounded-xl px-2 py-0.5 text-[11px] transition ${
            isInMore ? "text-teal-600" : "text-neutral-500"
          }`}
        >
          <span
            className={`flex h-8 w-12 items-center justify-center rounded-2xl transition ${
              isInMore ? "bg-teal-50" : ""
            }`}
          >
            <Menu size={19} strokeWidth={1.9} className={isInMore ? "text-teal-600" : ""} />
          </span>
          <span className="mt-0.5 font-medium">Menu</span>
        </button>}
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white/95 p-4 pb-6 shadow-2xl backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-base font-bold text-neutral-900">Menu</p>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="space-y-3">
              {GRUPOS.map((g) => {
                const itens = moreItems.filter((item) => item.grupo === g);
                if (!itens.length) return null;
                return (
                  <section key={g}>
                    <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">{g}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {itens.map((item) => {
                        const Icon = item.icon;
                        const active = pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className={`flex items-center gap-2 rounded-2xl px-2.5 py-2.5 text-[13.5px] font-medium ring-1 transition ${
                              active
                                ? "bg-teal-50/60 text-teal-700 ring-teal-300/60"
                                : "bg-white text-slate-700 ring-slate-200/70 shadow-[0_8px_20px_-16px_rgb(15_23_42/0.25)] active:bg-neutral-50"
                            }`}
                          >
                            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${COR_GRUPO[item.grupo]}`}>
                              <Icon size={17} strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 leading-tight">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {moreItems.length === 0 && (
                <p className="px-3 py-3 text-sm text-neutral-400">Nenhum módulo liberado para este usuário.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
