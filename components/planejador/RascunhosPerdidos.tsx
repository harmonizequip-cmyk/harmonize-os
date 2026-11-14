"use client";

// Planejamentos que ficaram só no celular: o rascunho guardado é de um plano
// que não existe mais no sistema (foi apagado antes de o trabalho chegar lá).
// Pedido do dono em 14/11/2026, depois de perder a distribuição do ALTAMIR.
// Recuperar grava o rascunho no plano vazio do mesmo paciente (se houver) ou
// cria um plano novo. Regras puras em lib/rascunho-planejamento.ts.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PREFIXO_RASCUNHO, rascunhosOrfaos, type RascunhoOrfao } from "@/lib/rascunho-planejamento";
import { normalizarNome } from "@/lib/historico-paciente";
import { avisar, confirmar } from "@/components/Dialogos";

type PlanoDaLista = { id: string; client_id: string | null; paciente: string | null; total_disparos: number | null };

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

function lerEntradas(): { chave: string; texto: string | null }[] {
  const saida: { chave: string; texto: string | null }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.startsWith(PREFIXO_RASCUNHO)) saida.push({ chave, texto: localStorage.getItem(chave) });
    }
  } catch {
    // armazenamento indisponível: nada a recuperar
  }
  return saida;
}

export default function RascunhosPerdidos({ planejamentos }: { planejamentos: PlanoDaLista[] }) {
  const router = useRouter();
  const [orfaos, setOrfaos] = useState<RascunhoOrfao[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    setOrfaos(rascunhosOrfaos(lerEntradas(), new Set(planejamentos.map((p) => p.id))));
  }, [planejamentos]);

  if (!orfaos.length) return null;

  // Plano vazio do mesmo paciente e cliente (ex.: criado de novo depois de apagar o antigo).
  const vazioDoMesmo = (o: RascunhoOrfao) =>
    planejamentos.find(
      (p) =>
        (p.client_id ?? "") === (o.rascunho.cliente || "") &&
        normalizarNome(p.paciente ?? "") === normalizarNome(o.paciente) &&
        !Number(p.total_disparos)
    ) ?? null;

  function tirar(o: RascunhoOrfao) {
    try {
      localStorage.removeItem(o.chave);
    } catch {
      // segue
    }
    setOrfaos((xs) => xs.filter((x) => x.chave !== o.chave));
  }

  async function recuperar(o: RascunhoOrfao) {
    const destino = vazioDoMesmo(o);
    setSalvando(o.chave);
    const supabase = createClient();
    const chamar = (evento: string | null) =>
      supabase.rpc("salvar_planejamento", {
        p_id: destino?.id ?? null,
        p_client_id: o.rascunho.cliente || null,
        p_calendar_event_id: evento,
        p_estado: o.rascunho.estado,
        p_total: o.total,
      });
    let r = await chamar(o.rascunho.evento || null);
    if (r.error && o.rascunho.evento) r = await chamar(null);
    setSalvando(null);
    if (r.error) {
      avisar("Não consegui recuperar agora. Confira a internet e tente de novo.", "erro");
      return;
    }
    tirar(o);
    avisar(`Planejamento de ${o.paciente || "paciente"} recuperado com ${fmt(o.total)} disparos.`);
    router.refresh();
  }

  async function descartar(o: RascunhoOrfao) {
    const ok = await confirmar({
      titulo: "Descartar o que ficou no celular?",
      texto: `${o.paciente || "Paciente"}: ${fmt(o.total)} disparos. Isso não volta mais.`,
      confirmar: "Descartar",
      perigo: true,
    });
    if (ok) tirar(o);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
        <LifeBuoy size={16} /> Ficou guardado só neste celular
      </p>
      <p className="text-xs text-amber-800">
        {orfaos.length === 1 ? "Este planejamento não chegou ao sistema" : "Estes planejamentos não chegaram ao sistema"} antes de o plano ser apagado. Recupere para não perder a distribuição.
      </p>
      {orfaos.map((o) => {
        const destino = vazioDoMesmo(o);
        const quando = new Date(o.rascunho.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        return (
          <div key={o.chave} className="rounded-xl bg-white p-3 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-neutral-900">{o.paciente || "Paciente sem nome"}</p>
            <p className="text-xs text-neutral-500">
              {fmt(o.total)} disparos · guardado em {quando}
              {destino ? " · vai para o planejamento vazio dele" : " · vira um planejamento novo"}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => descartar(o)}
                disabled={salvando === o.chave}
                className="min-h-[40px] rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600 disabled:opacity-50"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => recuperar(o)}
                disabled={salvando === o.chave}
                className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-brand-teal text-xs font-bold text-white disabled:opacity-50"
              >
                {salvando === o.chave && <Loader2 size={14} className="animate-spin" />} Recuperar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
