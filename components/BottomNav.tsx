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
    <nav className="fixed bottom-0 left-0 right-0 z-10 flex justify-around border-t border-white/50 bg-white/75 py-2 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/70 md:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center rounded-xl px-3 py-1 text-[10px] transition ${
              active ? "text-brand-teal-dark dark:text-brand-teal" : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            <span
              className={`flex h-7 w-9 items-center justify-center rounded-full text-lg leading-none transition ${
                active ? "bg-brand-gradient-soft" : ""
              }`}
            >
              {item.icon}
            </span>
            <span className="mt-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
