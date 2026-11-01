"use client";

// Checklist do dia da locação ("Cuidados com o HIPRO"), recolhível, em três
// momentos: antes de sair, ao chegar e ao terminar (e-book do HIPRO, cap. 26).
// As caixinhas marcam só na tela, nada é gravado. Se a troca de água do HIPRO
// estiver vencida, o alerta aparece mesmo com o bloco fechado.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, Droplets, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CuidadosHiproModal from "@/components/equipamentos/CuidadosHiproModal";
import {
  CHECKLIST_DIA,
  aguaPrecisaTrocar,
  situacaoAgua,
  textoAvisoAgua,
  ultimaTrocaPorEquipamento,
} from "@/lib/manutencao-equipamento";
import { hojeLocal } from "@/lib/period";

interface AlertaAgua {
  code: string;
  texto: string;
}

export default function CuidadosHiproDia({
  equipmentId = null,
  className = "",
}: {
  /** HIPRO do atendimento; sem ele, confere os dois. */
  equipmentId?: string | null;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [guia, setGuia] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [alertas, setAlertas] = useState<AlertaAgua[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const supabase = createClient();
      let q = supabase.from("manutencoes_equipamento").select("equipment_id, tipo, feita_em").eq("tipo", "troca_agua");
      if (equipmentId) q = q.eq("equipment_id", equipmentId);
      const { data: trocas, error } = await q.order("feita_em", { ascending: false }).limit(50);
      // Sem o SQL rodado (ou erro de leitura): o checklist aparece sem o alerta.
      if (error || !vivo) return;
      let qe = supabase.from("equipments").select("id, code, name").order("code");
      if (equipmentId) qe = qe.eq("id", equipmentId);
      const { data: equipamentos } = await qe;
      if (!vivo) return;
      const ultima = ultimaTrocaPorEquipamento((trocas ?? []) as { equipment_id: string; tipo: string; feita_em: string }[]);
      const hoje = hojeLocal();
      const lista: AlertaAgua[] = [];
      for (const e of (equipamentos ?? []) as { id: string; code: string; name: string }[]) {
        const s = situacaoAgua(ultima.get(e.id) ?? null, hoje);
        if (aguaPrecisaTrocar(s)) lista.push({ code: e.code, texto: textoAvisoAgua(e.name, s) });
      }
      setAlertas(lista);
    })();
    return () => {
      vivo = false;
    };
  }, [equipmentId]);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const total = CHECKLIST_DIA.reduce((n, m) => n + m.itens.length, 0);

  return (
    <div className={`rounded-3xl border border-slate-100 bg-slate-50/70 ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <ShieldCheck size={20} strokeWidth={1.9} className="flex-shrink-0 text-teal-600" />
        <span className="min-w-0 flex-1 text-[14px] font-bold text-slate-900">Cuidados com o HIPRO</span>
        {marcados.size > 0 && (
          <span className="text-[12px] font-semibold text-teal-700">
            {marcados.size} de {total}
          </span>
        )}
        <ChevronDown size={18} className={`flex-shrink-0 text-slate-500 transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {alertas.length > 0 && (
        <Link
          href={`/equipamentos#agua-${alertas[0].code}`}
          className="mx-3.5 mb-3 flex gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-[13px] font-semibold leading-snug text-rose-700"
        >
          <Droplets size={16} className="mt-0.5 flex-shrink-0" />
          <span>Troca de água: {alertas.map((a) => a.texto).join(", ")}. Troque antes de atender.</span>
        </Link>
      )}

      {aberto && (
        <div className="space-y-3 px-3.5 pb-3.5">
          {CHECKLIST_DIA.map((m) => (
            <div key={m.id}>
              <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{m.titulo}</p>
              <ul className="space-y-1">
                {m.itens.map((i) => {
                  const chave = `${m.id}:${i.id}`;
                  const ok = marcados.has(chave);
                  return (
                    <li key={chave}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-1 py-1 text-[13.5px] leading-snug text-slate-700">
                        <input
                          type="checkbox"
                          checked={ok}
                          onChange={() => alternar(chave)}
                          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-teal-600"
                        />
                        <span className={ok ? "text-slate-400 line-through" : ""}>{i.texto}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11.5px] text-slate-400">Marca só nesta tela, nada é gravado.</p>
            <button type="button" onClick={() => setGuia(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700">
              <BookOpen size={15} />
              Ver cuidados
            </button>
          </div>
        </div>
      )}
      {guia && <CuidadosHiproModal onClose={() => setGuia(false)} />}
    </div>
  );
}
