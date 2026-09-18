"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import {
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Wallet,
  Users,
  GitBranch,
  CalendarDays,
  Package,
  BarChart3,
  Settings,
} from "lucide-react";

// Menu completo (não só o que não coube na barra inferior). Fica atrás do
// ícone de hambúrguer no cabeçalho, que ao contrário do antigo botão "Mais"
// da BottomNav NUNCA é escondido condicionalmente — sempre existe na tela,
// independente de permissions/isAdmin terem chegado certo do servidor ou
// não. Isso evita o cenário em que uma falha ao buscar o perfil (ou
// qualquer outro problema de dados) faz o botão de acesso sumir por
// completo, sem deixar rastro do que aconteceu.
const ALL_ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, module: "dashboard" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { href: "/equipamentos", label: "Equipamentos", icon: Package, module: "equipamentos" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes" },
];

export default function MobileHeader({
  permissions,
  isAdmin,
  permissionsLoaded,
}: {
  permissions?: Record<string, boolean>;
  isAdmin?: boolean;
  permissionsLoaded?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const allowedByPermission = ALL_ITEMS.filter((item) => isAdmin || permissions?.[item.module]);
  // Se a busca de permissões no servidor falhou ou não veio (permissionsLoaded
  // = false), não dá pra confiar que a lista filtrada é a real: nesse caso,
  // mostra o menu inteiro em vez de arriscar esconder tudo por um problema
  // que não tem nada a ver com o que o usuário pode ou não acessar.
  const items = permissionsLoaded === false ? ALL_ITEMS : allowedByPermission;

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/50 bg-white/75 px-4 py-2 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/70 md:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <Menu size={22} strokeWidth={1.75} />
        </button>

        <div className="w-fit">
          <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-8 w-auto dark:hidden" />
          <img
            src="/harmonize-logo-full-dark.png"
            alt="Harmonize"
            className="hidden h-8 w-auto dark:block"
          />
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle compact className="h-8 w-8" />
          <button
            onClick={handleLogout}
            aria-label="Sair"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <LogOut size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 flex bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="flex h-full w-[80%] max-w-xs flex-col bg-white/95 p-4 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-7 w-auto dark:hidden" />
              <img
                src="/harmonize-logo-full-dark.png"
                alt="Harmonize"
                className="hidden h-7 w-auto dark:block"
              />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto">
              {items.map((item) => {
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
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    {item.label}
                  </Link>
                );
              })}
              {items.length === 0 && (
                <p className="px-3 py-3 text-sm text-neutral-400">Nenhum módulo liberado para este usuário.</p>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
