"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const OPTIONS = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes_anterior", label: "Mês anterior" },
  { key: "personalizado", label: "Personalizado" },
];

export default function PeriodFilter({ padrao = "hoje" }: { padrao?: string } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") ?? (searchParams.get("from") ? "personalizado" : padrao);
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");

  function setPeriod(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    if (key !== "personalizado") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", "personalizado");
    params.set("from", customFrom);
    params.set("to", customTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setPeriod(opt.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              current === opt.key
                ? "bg-brand-teal text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {current === "personalizado" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <span className="text-xs text-neutral-400">até</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
          />
          <button
            onClick={applyCustomRange}
            className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
