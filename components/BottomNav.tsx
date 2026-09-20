"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Settings,
} from "lucide-react";

// Os 4 atalhos de uso diário, nessa ordem. O 5º e último botão não é um
// link, é o gatilho do menu com o restante (ver MORE_ITEMS).
const MAIN_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
];

// Tudo que não é atalho do dia a dia fica atrás do botão de menu:
// Clientes, Tarefas (visão completa, pendentes + concluídas — o Funil só
// mostra as pendentes), Equipamentos (cujos números principais já aparecem
// resumidos no Dashboard), Relatórios e Configurações.
const MORE_ITEMS = [
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks, module: "clientes" },
  { href: "/equipamentos", label: "Equipamentos", icon: Package, module: "equipamentos" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
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

  const mainItems = MAIN_ITEMS.filter((item) => isAdmin || permissions?.[item.module]);
  const moreItemsByPermission = MORE_ITEMS.filter((item) => isAdmin || permissions?.[item.module]);
  // Mesma cautela de sempre: se a busca de permissões no servidor falhou
  // (permissionsLoaded === false), não dá pra confiar na lista filtrada —
  // melhor mostrar tudo do que esconder o menu inteiro por um problema que
  // não tem nada a ver com o que o usuário pode acessar.
  const moreItems = permissionsLoaded === false ? MORE_ITEMS : moreItemsByPermission;
  const isInMore = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-white/50 bg-white/75 py-2 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/70 md:hidden">
        {mainItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center rounded-xl px-3 py-1 text-[10px] transition ${
                active ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              <span
                className={`flex h-7 w-9 items-center justify-center rounded-full transition ${
                  active ? "bg-neutral-900 dark:bg-white" : ""
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={1.75}
                  className={active ? "text-white dark:text-neutral-900" : ""}
                />
              </span>
              <span className="mt-0.5 font-medium">{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setMenuOpen(true)}
          className={`flex flex-col items-center rounded-xl px-3 py-1 text-[10px] transition ${
            isInMore ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
          }`}
        >
          <span
            className={`flex h-7 w-9 items-center justify-center rounded-full transition ${
              isInMore ? "bg-neutral-900 dark:bg-white" : ""
            }`}
          >
            <Menu size={17} strokeWidth={1.75} className={isInMore ? "text-white dark:text-neutral-900" : ""} />
          </span>
          <span className="mt-0.5 font-medium">Menu</span>
        </button>
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white/95 p-4 pb-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Mais opções</p>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
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
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
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
