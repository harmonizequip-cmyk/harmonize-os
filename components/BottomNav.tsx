"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, Users, GitBranch, CalendarDays, Package, MoreHorizontal, BarChart3, Settings } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, module: "dashboard" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { href: "/equipamentos", label: "Equip.", icon: Package, module: "equipamentos" },
];

// Telas que não couberam na barra principal. Ficam atrás do botão "Mais"
// em vez de brigar por espaço com os 6 ícones de uso diário acima.
const MORE_ITEMS = [
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes" },
];

export default function BottomNav({
  permissions,
  isAdmin,
}: {
  permissions: Record<string, boolean>;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = ITEMS.filter((item) => isAdmin || permissions?.[item.module]);
  const moreItems = MORE_ITEMS.filter((item) => isAdmin || permissions?.[item.module]);
  const isInMore = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-white/50 bg-white/75 py-2 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/70 md:hidden">
        {items.map((item) => {
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

        {moreItems.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center rounded-xl px-3 py-1 text-[10px] transition ${
              isInMore ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            <span
              className={`flex h-7 w-9 items-center justify-center rounded-full transition ${
                isInMore ? "bg-neutral-900 dark:bg-white" : ""
              }`}
            >
              <MoreHorizontal size={17} strokeWidth={1.75} className={isInMore ? "text-white dark:text-neutral-900" : ""} />
            </span>
            <span className="mt-0.5 font-medium">Mais</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white/90 p-4 pb-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/90"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <div className="space-y-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
