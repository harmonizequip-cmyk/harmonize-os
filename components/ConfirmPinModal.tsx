"use client";

import { useState } from "react";

const REQUIRED_PIN = "4062";

export default function ConfirmPinModal({
  title = "Confirme com a senha",
  confirmLabel = "Confirmar",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (pin === REQUIRED_PIN) {
      onConfirm();
    } else {
      setError("Senha incorreta.");
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-lg dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="••••"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.5em] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-neutral-300 py-2 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className={`flex-1 rounded-xl py-2 text-sm font-medium text-white ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-teal hover:bg-brand-teal-dark"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
