"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, Users, GitBranch, CalendarDays, Package } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, module: "dashboard" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
  { href: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
  { href: "/funil", label: "Funil", icon: GitBranch, module: "clientes" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { href: "/equipamentos", label: "Equip.", icon: Package, module: "equipamentos" },
];

export default function BottomNav({
  permissions,
  isAdmin,
}: {
  permissions: Record<string, boolean>;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => isAdmin || permissions?.[item.module]);

  return (
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
    </nav>
  );
}
