"use client";

import { ehEspacoPessoal } from "@/lib/espaco";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
import {
  HeartHandshake,
  LayoutDashboard,
  Wallet,
  Users,
  GitBranch,
  ListChecks,
  CalendarDays,
  Package,
  BarChart3,
  History,
  Receipt,
  HandCoins,
  Landmark,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  CreditCard,
  Sparkles,
  Brain,
  ClipboardList,
  Megaphone,
} from "lucide-react";

// Menu do espaço Pessoal (chave Harmonize | Pessoal no topo).
const PESSOAL_ITEMS = [
  { href: "/pessoal", label: "Início", icon: PiggyBank, module: "pessoal" },
  { href: "/pessoal/lancamentos", label: "Lançamentos", icon: Wallet, module: "pessoal" },
  { href: "/pessoal/cartoes", label: "Cartões", icon: CreditCard, module: "pessoal" },
  { href: "/pessoal/relatorios", label: "Relatórios", icon: BarChart3, module: "pessoal" },
  { href: "/pessoal/assistente", label: "Assistente", icon: Sparkles, module: "pessoal" },
];

// Mesma organização do Menu do celular (BottomNav): o dia a dia no topo e os
// grupos Atendimento, Dinheiro, Inteligência e Sistema.
const NAV_ITEMS: { href: string; label: string; icon: typeof Users; module: string; grupo?: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/relacionamento", label: "Relacionamento", icon: HeartHandshake, module: "clientes", grupo: "Atendimento" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes", grupo: "Atendimento" },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, module: "clientes", grupo: "Atendimento" },
  { href: "/planejador", label: "Planejador", icon: ClipboardList, module: "agenda", grupo: "Atendimento" },
  { href: "/contratos", label: "Contratos", icon: FileText, module: "agenda", grupo: "Atendimento" },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, module: "clientes", grupo: "Atendimento" },
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

// Chave de localStorage pra lembrar a preferência de menu recolhido —
// mesmo padrão do ThemeToggle (harmonize-tema): guarda só neste
// navegador/dispositivo, não sincroniza entre aparelhos, e começa sempre
// aberto (valor default) até o useEffect ler o que foi salvo, pra não
// depender de localStorage durante a renderização no servidor.
const COLLAPSE_STORAGE_KEY = "harmonize-sidebar-collapsed";

export default function Sidebar({
  name,
  permissions,
  isAdmin,
}: {
  name: string;
  permissions: Record<string, boolean>;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // localStorage indisponível, segue com o menu aberto
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // localStorage indisponível, a preferência só não persiste
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const pessoal = ehEspacoPessoal(pathname);
  const items = (pessoal ? PESSOAL_ITEMS : NAV_ITEMS).filter((item) => isAdmin || permissions?.[item.module]);

  return (
    <aside
      // flex-shrink-0 é a correção do bug "menu encolhe e a logo fica
      // distorcida" (visto no notebook ao entrar no Funil, e em várias
      // telas no tablet): assim que o aside ganhou overflow-y/x não-visible
      // (para o scroll independente e a transição de largura), o navegador
      // parou de respeitar w-60/w-16 como largura mínima nesse flex row —
      // por padrão, um item flex só recusa encolher abaixo do próprio
      // conteúdo quando overflow é visible; com overflow diferente de
      // visible, a largura mínima automática vira 0. Em qualquer página cujo
      // conteúdo principal (main) precise de mais espaço horizontal do que
      // sobrou (tabela larga, board do Funil), o menu inteiro era espremido
      // junto — texto cortado, ícones e logo minúsculos e "esmagados".
      // flex-shrink-0 tira o aside dessa distribuição de encolhimento: ele
      // sempre fica exatamente em w-60 (ou w-16 recolhido), e quem sobra
      // sem espaço é o conteúdo da página, que já tem seu próprio scroll
      // horizontal onde precisa (ex: overflow-x-auto do board do Funil).
      className={`hidden flex-shrink-0 flex-col overflow-x-hidden border-r border-white/50 bg-white/70 p-4 backdrop-blur-xl transition-[width] duration-200 ease-in-out md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto ${
        collapsed ? "md:w-16" : "w-60"
      }`}
    >
      <div className={`mb-8 flex items-center ${collapsed ? "flex-col gap-2" : "justify-between gap-2 px-2"}`}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-11 w-auto" />
            <img
              src="/harmonize-logo-full-dark.png"
              alt="Harmonize"
              className="hidden h-11 w-auto"
            />
            <p className="mt-2 truncate text-xs font-medium text-neutral-400">{name}</p>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
        >
          {collapsed ? <ChevronRight size={16} strokeWidth={1.75} /> : <ChevronLeft size={16} strokeWidth={1.75} />}
        </button>
      </div>

      <div className={`mb-2 ${collapsed ? "flex justify-center" : ""}`}>
        <GlobalSearch compact={collapsed} />
      </div>

      <nav className="flex-1 space-y-0.5">
        {items.map((item, i) => {
          const grupo = "grupo" in item ? (item.grupo as string | undefined) : undefined;
          const anterior = i > 0 && "grupo" in items[i - 1] ? (items[i - 1] as { grupo?: string }).grupo : undefined;
          const titulo = grupo && grupo !== anterior && !collapsed;
          const active = item.href === "/pessoal" ? pathname === "/pessoal" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <div key={item.href}>
            {titulo && <p className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">{grupo}</p>}
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-lg text-sm transition ${
                collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
              } ${
                active
                  ? "bg-neutral-900 font-medium text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} className={active ? "" : "text-neutral-400"} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
            </div>
          );
        })}
      </nav>

      <div className="mt-2 space-y-0.5 border-t border-neutral-200 pt-2">
        <ThemeToggle compact={collapsed} className={collapsed ? "mx-auto h-8 w-8" : undefined} />
        <button
          onClick={handleLogout}
          title={collapsed ? "Sair" : undefined}
          className={`flex items-center rounded-lg text-left text-sm text-neutral-500 transition hover:bg-neutral-100 ${
            collapsed ? "mx-auto h-8 w-8 justify-center" : "w-full gap-3 px-3 py-2"
          }`}
        >
          <LogOut size={17} strokeWidth={1.75} className="text-neutral-400" />
          {!collapsed && "Sair"}
        </button>
      </div>
    </aside>
  );
}
