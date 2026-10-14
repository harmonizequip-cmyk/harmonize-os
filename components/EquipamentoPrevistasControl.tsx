"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

type PrevistaItem = {
  id: string;
  event_date: string;
  client_name: string | null;
};

export default function EquipamentoPrevistasControl({ items }: { items: PrevistaItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return (
      <p className="mt-0.5 text-sm font-medium text-neutral-900">0</p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 text-sm font-medium text-brand-blue underline underline-offset-2 hover:text-brand-blue/80"
      >
        {items.length}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">
                Locações previstas
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-200/60 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-neutral-900">
                    {item.client_name ?? "Cliente não identificado"}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {formatDate(item.event_date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
