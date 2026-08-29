"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Início", icon: "🏠", module: "dashboard" },
  { href: "/financeiro", label: "Financeiro", icon: "💰", module: "financeiro" },
  { href: "/clientes", label: "Clientes", icon: "👩", module: "clientes" },
  { href: "/funil", label: "Funil", icon: "🧭", module: "clientes" },
  { href: "/agenda", label: "Agenda", icon: "📅", module: "agenda" },
  { href: "/equipamentos", label: "Equip.", icon: "📦", module: "equipamentos" },
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
    <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-neutral-200 bg-white py-2 dark:border-neutral-800 dark:bg-neutral-900 md:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center px-3 py-1 text-[10px] ${
              active ? "text-brand-teal" : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="mt-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
