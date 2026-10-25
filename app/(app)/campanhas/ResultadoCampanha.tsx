"use client";

// Resultado da campanha: contagem por situação e a lista de quem recebeu
// (e de quem foi pulado ou não quer), onde o dono marca "Respondeu",
// "Agendou", "Não quer receber" ou desfaz o envio (a pessoa volta à fila).

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { LinkCliente } from "@/components/Atalhos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { CORES } from "@/components/ui/Visual";
import { ROTULO_STATUS, contarPorStatus, totalRecebidos, type StatusEnvio } from "@/lib/campanhas";
import type { EnvioComCliente } from "@/lib/carregar-campanhas";
import { SeloStatus, VISUAL_STATUS, nomeDaPessoa, quandoFoi } from "./comum";

type Filtro = "recebidos" | "pulado" | "nao_quer";

const MUDAR_PARA: StatusEnvio[] = ["respondeu", "agendou", "nao_quer"];

function Linha({
  envio,
  hoje,
  podeMexer,
  ocupado,
  onMudar,
  onDesfazer,
}: {
  envio: EnvioComCliente;
  hoje: string;
  podeMexer: boolean;
  ocupado: boolean;
  onMudar: (status: StatusEnvio) => void;
  onDesfazer: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const c = envio.cliente;
  const nome = c ? nomeDaPessoa({ nome: c.name, treatment: c.treatment, displayName: c.display_name }) : "Cliente";
  return (
    <div className="border-b border-neutral-100 px-3 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">
            <LinkCliente id={envio.client_id}>{nome}</LinkCliente>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
            <SeloStatus status={envio.status} />
            {envio.enviado_em && <span>enviada {quandoFoi(envio.enviado_em, hoje)}</span>}
            {c?.city && <span>· {c.city}</span>}
          </div>
        </div>
        {envio.mensagem && (
          <button type="button" onClick={() => setAberta((v) => !v)} className="flex flex-shrink-0 items-center gap-0.5 text-[11px] text-neutral-500">
            mensagem {aberta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>
      {aberta && envio.mensagem && (
        <p className="mt-2 whitespace-pre-line rounded-xl bg-neutral-50 p-2.5 text-[12.5px] text-neutral-700">{envio.mensagem}</p>
      )}
      {podeMexer && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MUDAR_PARA.filter((s) => s !== envio.status).map((s) => (
            <button
              key={s}
              type="button"
              disabled={ocupado}
              onClick={() => onMudar(s)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50 ${CORES[VISUAL_STATUS[s].cor].pilula}`}
            >
              {ROTULO_STATUS[s]}
            </button>
          ))}
          <button
            type="button"
            disabled={ocupado}
            onClick={onDesfazer}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-[11.5px] font-semibold text-neutral-600 disabled:opacity-50"
          >
            <Undo2 size={12} /> {envio.enviado_em ? "Desfazer envio" : "Voltar para a fila"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ResultadoCampanha({
  campanhaId,
  envios,
  hoje,
  onMudou,
}: {
  campanhaId: string;
  envios: EnvioComCliente[];
  hoje: string;
  onMudou: () => void;
}) {
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [filtro, setFiltro] = useState<Filtro>("recebidos");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const contagem = contarPorStatus(envios);
  const recebidos = totalRecebidos(envios);
  const lista = useMemo(() => {
    const l =
      filtro === "recebidos"
        ? envios.filter((e) => !!e.enviado_em)
        : envios.filter((e) => e.status === filtro && (filtro === "pulado" || !e.enviado_em));
    return [...l].sort((a, b) => (b.enviado_em ?? b.atualizado_em ?? "").localeCompare(a.enviado_em ?? a.atualizado_em ?? ""));
  }, [envios, filtro]);

  async function mudar(e: EnvioComCliente, status: StatusEnvio) {
    setOcupado(e.client_id);
    const { error } = await supabase.rpc("registrar_envio_campanha", {
      p_campanha: campanhaId,
      p_client: e.client_id,
      p_status: status,
      p_mensagem: null,
    });
    setOcupado(null);
    if (error) return avisar(error.message || "Não consegui mudar.", "erro");
    avisar(`Marcado: ${ROTULO_STATUS[status]}.`);
    onMudou();
  }

  async function desfazer(e: EnvioComCliente) {
    const ok = await confirmar({
      titulo: e.enviado_em ? "Desfazer o envio?" : "Voltar para a fila?",
      texto: e.enviado_em
        ? "O registro do envio é apagado e a pessoa volta para a fila desta campanha. A mensagem que já foi no WhatsApp não volta."
        : "A pessoa volta para a fila desta campanha.",
      confirmar: e.enviado_em ? "Desfazer" : "Voltar para a fila",
      perigo: !!e.enviado_em,
    });
    if (!ok) return;
    setOcupado(e.client_id);
    const { error } = await supabase.rpc("desfazer_envio_campanha", { p_campanha: campanhaId, p_client: e.client_id });
    setOcupado(null);
    if (error) return avisar(error.message || "Não consegui desfazer.", "erro");
    avisar("Desfeito.");
    onMudou();
  }

  const numeros: { rotulo: string; valor: number; status: StatusEnvio }[] = [
    { rotulo: "Enviadas", valor: recebidos, status: "enviado" },
    { rotulo: "Responderam", valor: contagem.respondeu, status: "respondeu" },
    { rotulo: "Agendaram", valor: contagem.agendou, status: "agendou" },
    { rotulo: "Não querem", valor: contagem.nao_quer, status: "nao_quer" },
  ];

  const naoQuerSemEnvio = envios.filter((e) => e.status === "nao_quer" && !e.enviado_em).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {numeros.map((n) => {
          const v = VISUAL_STATUS[n.status];
          const I = v.icone;
          return (
            <div key={n.rotulo} className="cartao flex items-center gap-2.5 p-3">
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${CORES[v.cor].chip}`}>
                <I size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-black leading-tight text-neutral-900 tabular-nums">{n.valor}</span>
                <span className="block text-[11px] text-neutral-500">{n.rotulo}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
        {(
          [
            ["recebidos", `Receberam · ${recebidos}`],
            ["pulado", `Puladas · ${contagem.pulado}`],
            ["nao_quer", `Recusaram · ${naoQuerSemEnvio}`],
          ] as [Filtro, string][]
        ).map(([f, r]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-xl py-2 text-[11.5px] font-bold transition ${filtro === f ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            {r}
          </button>
        ))}
      </div>
      {filtro === "nao_quer" && (
        <p className="px-1 text-[11.5px] text-neutral-500">Quem marcou &quot;Não quer receber&quot; na fila, sem ter recebido. Essas pessoas saem de todas as campanhas.</p>
      )}

      {lista.length === 0 ? (
        <section className="cartao p-5 text-center text-sm text-neutral-500">Ninguém aqui ainda.</section>
      ) : (
        <section className="cartao overflow-hidden p-0">
          {lista.map((e) => (
            <Linha
              key={e.id}
              envio={e}
              hoje={hoje}
              podeMexer={!somenteLeitura}
              ocupado={ocupado === e.client_id}
              onMudar={(s) => mudar(e, s)}
              onDesfazer={() => desfazer(e)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
