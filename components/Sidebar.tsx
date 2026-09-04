"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import {
  LayoutDashboard,
  Wallet,
  Users,
  GitBranch,
  CalendarDays,
  Package,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { href: "/equipamentos", label: "Equipamentos", icon: Package, module: "equipamentos" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, module: "configuracoes" },
];

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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = NAV_ITEMS.filter((item) => isAdmin || permissions?.[item.module]);

  return (
    <aside className="hidden w-60 flex-col border-r border-white/50 bg-white/70 p-4 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/60 md:flex">
      <div className="mb-8 px-2">
        {/* Fundo sempre claro atrás da logo, já que o texto dela é preto */}
        <div className="w-fit rounded-lg bg-white p-1.5">
          <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-11 w-auto" />
        </div>
        <p className="mt-2 truncate text-xs font-medium text-neutral-400 dark:text-neutral-500">{name}</p>
      </div>

      <nav className="flex-1 space-y-0.5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} className={active ? "" : "text-neutral-400 dark:text-neutral-500"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 space-y-0.5 border-t border-neutral-200 pt-2 dark:border-neutral-800">
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <LogOut size={17} strokeWidth={1.75} className="text-neutral-400 dark:text-neutral-500" />
          Sair
        </button>
      </div>
    </aside>
  );
}
