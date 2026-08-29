"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ className = "" }: { className?: string }) {
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

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 ${className}`}
    >
      <span>{isDark ? "☀️" : "🌙"}</span>
      <span>{isDark ? "Tema claro" : "Tema escuro"}</span>
    </button>
  );
}
