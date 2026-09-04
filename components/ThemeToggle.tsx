"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("harmonize-theme", next ? "dark" : "light");
    } catch {
      // localStorage indisponível, segue sem persistir
    }
  }

  const Icon = isDark ? Sun : Moon;

  if (compact) {
    return (
      <button
        onClick={toggle}
        aria-label="Alternar tema"
        className={`flex items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 ${className}`}
      >
        <Icon size={18} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 ${className}`}
    >
      <Icon size={17} strokeWidth={1.75} className="text-neutral-400 dark:text-neutral-500" />
      <span>{isDark ? "Tema claro" : "Tema escuro"}</span>
    </button>
  );
}
