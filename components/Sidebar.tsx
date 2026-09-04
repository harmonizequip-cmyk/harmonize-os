"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", module: "dashboard" },
  { href: "/financeiro", label: "Financeiro", icon: "💰", module: "financeiro" },
  { href: "/clientes", label: "Clientes", icon: "👩", module: "clientes" },
  { href: "/funil", label: "Funil", icon: "🧭", module: "clientes" },
  { href: "/agenda", label: "Agenda", icon: "📅", module: "agenda" },
  { href: "/equipamentos", label: "Equipamentos", icon: "📦", module: "equipamentos" },
  { href: "/relatorios", label: "Relatórios", icon: "📊", module: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️", module: "configuracoes" },
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
      <div className="mb-6 px-2">
        {/* Fundo sempre claro atrás da logo, já que o texto dela é preto */}
        <div className="w-fit rounded-lg bg-white p-1.5">
          <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-12 w-auto" />
        </div>
        <p className="mt-2 truncate text-xs text-neutral-500 dark:text-neutral-400">{name}</p>
      </div>

      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-brand-gradient-soft border-l-2 border-brand-teal font-medium text-brand-teal-dark dark:text-brand-teal"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <ThemeToggle />

      <button
        onClick={handleLogout}
        className="mt-1 rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Sair
      </button>
    </aside>
  );
}

