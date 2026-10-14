"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Leva W: número de série e registro ANVISA do aparelho, usados na geração
// do contrato de locação. Como só existem 2 equipamentos e o valor quase
// nunca muda (só se o aparelho físico for trocado), não há RPC dedicada —
// a RLS de equipments (equipments_update, exige permissão de
// "configuracoes") já protege a escrita direta, igual ao padrão usado em
// EditarClienteModal para a tabela clients.
export default function EquipamentoInfoControl({
  equipmentId,
  serialNumber,
  anvisaRegistro,
}: {
  equipmentId: string;
  serialNumber: string | null;
  anvisaRegistro: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [serial, setSerial] = useState(serialNumber ?? "");
  const [anvisa, setAnvisa] = useState(anvisaRegistro ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("equipments")
      .update({
        serial_number: serial.trim() || null,
        anvisa_registro: anvisa.trim() || null,
      })
      .eq("id", equipmentId);
    setSaving(false);
    if (updateError) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div>
        <p className="mt-0.5 text-sm font-medium text-neutral-900">
          {serialNumber || "Não informado"}
        </p>
        {anvisaRegistro && <p className="text-[11px] text-neutral-400">ANVISA: {anvisaRegistro}</p>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 text-[11px] font-medium text-brand-teal underline underline-offset-2"
        >
          Editar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-neutral-50 p-2">
      <label className="mb-1 block text-[11px] font-medium text-neutral-600">
        Número de série
      </label>
      <input
        value={serial}
        onChange={(e) => setSerial(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
      />
      <label className="mb-1 mt-2 block text-[11px] font-medium text-neutral-600">
        Registro ANVISA
      </label>
      <input
        value={anvisa}
        onChange={(e) => setAnvisa(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
            setSerial(serialNumber ?? "");
            setAnvisa(anvisaRegistro ?? "");
          }}
          className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-600"
        >
          Desistir
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="flex-1 rounded-lg bg-brand-gradient py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
