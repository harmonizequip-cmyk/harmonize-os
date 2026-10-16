"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";
import {
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

// Tudo que não é atalho do dia a dia fica atrás do botão de menu:
// Clientes, Tarefas (visão completa, pendentes + concluídas — o Funil só
// mostra as pendentes), Equipamentos (cujos números principais já aparecem
// resumidos no Dashboard), Relatórios e Configurações.
const MORE_ITEMS = [
  { href: "/assistente", label: "Assistente", icon: Sparkles, module: "dashboard" },
  { href: "/insights", label: "Cérebro", icon: Brain, module: "dashboard" },
  { href: "/planejador", label: "Planejador", icon: ClipboardList, module: "agenda" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, module: "clientes" },
  // Histórico de locações realizadas: os FATOS. Fica ao lado de
  // Equipamentos porque a pergunta é a mesma família, "quanto rodamos".
  { href: "/locacoes", label: "Locações", icon: Receipt, module: "financeiro" },
  // Quem está devendo e quanto (o total também aparece no Dashboard).
  { href: "/pendencias", label: "Pendências", icon: HandCoins, module: "financeiro" },
  { href: "/financeiro/emprestimos", label: "Empréstimos", icon: Landmark, module: "financeiro" },
  { href: "/financeiro/cartoes", label: "Cartões", icon: CreditCard, module: "financeiro" },
  // Controle dos contratos de locação já emitidos (leva X).
  { href: "/contratos", label: "Contratos", icon: FileText, module: "agenda" },
  { href: "/equipamentos", label: "Equipamentos", icon: Package, module: "equipamentos" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
  { href: "/movimentacoes", label: "Movimentações", icon: History, module: "configuracoes" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes" },
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
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-white/50 bg-white/75 py-2 backdrop-blur-xl md:hidden">
        {mainItems.map((item) => {
          // "Início" do Pessoal (/pessoal) só acende na própria página.
          const active = item.href === "/pessoal" ? pathname === "/pessoal" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center rounded-xl px-3 py-1 text-[10px] transition ${
                active ? "text-neutral-900" : "text-neutral-500"
              }`}
            >
              <span
                className={`flex h-7 w-9 items-center justify-center rounded-full transition ${
                  active ? "bg-neutral-900" : ""
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={1.75}
                  className={active ? "text-white" : ""}
                />
              </span>
              <span className="mt-0.5 font-medium">{item.label}</span>
            </Link>
          );
        })}

        {!pessoal && <button
          onClick={() => setMenuOpen(true)}
          className={`flex flex-col items-center rounded-xl px-3 py-1 text-[10px] transition ${
            isInMore ? "text-neutral-900" : "text-neutral-500"
          }`}
        >
          <span
            className={`flex h-7 w-9 items-center justify-center rounded-full transition ${
              isInMore ? "bg-neutral-900" : ""
            }`}
          >
            <Menu size={17} strokeWidth={1.75} className={isInMore ? "text-white" : ""} />
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
              <p className="text-sm font-semibold text-neutral-700">Mais opções</p>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="space-y-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-brand-teal/10 text-brand-teal"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    {item.label}
                  </Link>
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
