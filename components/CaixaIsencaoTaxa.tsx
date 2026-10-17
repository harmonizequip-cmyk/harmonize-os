"use client";

// "Isentar taxa de reserva", ao lado da caixinha Parceiro nos cadastros.
// Serve para cliente que não é parceiro mas nunca pagou a taxa (clientes
// antigas). Grava clients.isento_taxa (migration 2026-10-17-cliente-isento-taxa).
// Marcar tira a taxa pendente e a cobrança das reservas dela; reserva nova
// já nasce sem taxa. Taxa que já foi paga não muda.

export default function CaixaIsencaoTaxa({
  checked,
  onChange,
  parceiro = false,
  compacta = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Parceiro já isenta sozinho; a caixinha só avisa disso. */
  parceiro?: boolean;
  /** Versão de uma linha, para os cadastros novos. */
  compacta?: boolean;
}) {
  if (compacta) {
    return (
      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Isentar taxa de reserva (mesmo sem ser parceiro)
      </label>
    );
  }
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-neutral-300 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand-teal"
      />
      <span className="text-xs text-neutral-600">
        <span className="block text-sm font-medium text-neutral-800">Isentar taxa de reserva</span>
        Vale mesmo sem ser parceiro, para quem nunca pagou a taxa. As reservas dela nascem sem taxa e a taxa pendente de
        hoje deixa de ser cobrada. Taxa já paga não muda.
        {parceiro && <span className="mt-1 block text-neutral-400">Parceiro já é isento sozinho.</span>}
      </span>
    </label>
  );
}
