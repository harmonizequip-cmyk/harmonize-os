"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    <aside className="hidden w-60 flex-col border-r border-neutral-200 bg-white p-4 md:flex">
      <div className="mb-6 px-2">
        <p className="text-lg font-semibold text-brand-teal">Harmonize OS</p>
        <p className="truncate text-xs text-neutral-500">{name}</p>
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
                  ? "bg-brand-teal/10 font-medium text-brand-teal"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        onClick={handleLogout}
        className="mt-4 rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100"
      >
        Sair
      </button>
    </aside>
  );
}
