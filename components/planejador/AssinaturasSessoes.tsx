"use client";

// Assinaturas por sessão de um planejamento (só o dono): selo "Assinada por
// paciente e profissional em dd/mm hh:mm" ou o alerta "Alterada depois de
// assinada" (com o que foi assinado), o botão "Colher assinaturas" e, com as
// duas assinaturas, "Mandar ficha assinada ao paciente" (PDF pelo Compartilhar).
// Sem o SQL rodado, o botão avisa "Falta rodar o SQL das assinaturas".

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, PenLine, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { formatDate } from "@/lib/format";
import type { Plano } from "@/lib/planejador";
import {
  assinaturasDaSessao,
  dataHoraCurta,
  hashDoResumo,
  resumoDaSessao,
  situacaoAssinaturas,
  type AssinaturaSessao,
  type SituacaoAssinaturas,
} from "@/lib/assinatura-sessao";
import { apagarAssinatura, MSG_FALTA_SQL_ASSINATURAS, type EstadoAssinaturas } from "@/lib/assinaturas-envio";
import { lerTriagem } from "@/lib/triagem-hipro";
import ColherAssinaturas from "./ColherAssinaturas";
import EnviarFichaAssinada from "./EnviarFichaAssinada";

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

/** Números das sessões de um plano: as fechadas e a aberta. */
export const sessoesDoPlano = (p: Plano) => [...p.sessoesAnteriores.map((x) => x.n), p.sessaoAtual];

/** sha256 do conteúdo atual de cada sessão (só das que têm assinatura). */
export function useHashesAtuais(plano: Plano | null, sessoes: number[]): Record<number, string> {
  const [hashes, setHashes] = useState<Record<number, string>>({});
  const chave = useMemo(() => {
    if (!plano) return "";
    return JSON.stringify(sessoes.map((n) => [n, resumoDaSessao(plano, n)]));
  }, [plano, sessoes]);
  useEffect(() => {
    if (!plano || !chave) return;
    let vivo = true;
    Promise.all(
      sessoes.map(async (n) => {
        const r = resumoDaSessao(plano, n);
        return [n, r ? await hashDoResumo(r) : ""] as const;
      })
    ).then(
      (pares) => vivo && setHashes(Object.fromEntries(pares)),
      () => {
        // aparelho sem crypto.subtle: fica sem a conferência
      }
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return hashes;
}

export function SeloAssinatura({ situacao }: { situacao: SituacaoAssinaturas }) {
  return situacao.alterada ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
      <AlertTriangle size={12} /> {situacao.texto}
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${situacao.completa ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
      <CheckCircle2 size={12} /> {situacao.texto}
    </span>
  );
}

/** O que foi assinado (guardado em resumo), para comparar quando a sessão mudou. */
function OQueFoiAssinado({ lista }: { lista: AssinaturaSessao[] }) {
  const r = lista.find((a) => a.resumo && Array.isArray(a.resumo.areas))?.resumo;
  if (!r) return null;
  return (
    <details className="group mt-2 rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-neutral-200">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-neutral-700">
        Ver o que foi assinado <ChevronDown size={14} className="transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-1 text-neutral-600">
        <p>
          {r.paciente} · {r.data ? formatDate(r.data) : "sem data"} · Sessão {r.sessao}
        </p>
        {(r.areas ?? []).map((a) => (
          <p key={a.id} className="flex justify-between gap-2">
            <span>{a.nome}</span>
            <b className="tabular-nums">{fmt(a.total)}</b>
          </p>
        ))}
        <p className="flex justify-between gap-2 border-t border-neutral-100 pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{fmt(r.total ?? 0)}</span>
        </p>
        <p className="flex justify-between gap-2">
          <span>Saldo</span>
          <span className="tabular-nums">{fmt(r.saldo ?? 0)}</span>
        </p>
      </div>
    </details>
  );
}

export default function AssinaturasSessoes({
  planoId,
  plano,
  clienteId,
  estado,
  lista,
  onMudou,
  sessoes,
  antesDeAbrir,
  titulo = true,
  semNumero = false,
  whatsappPaciente,
}: {
  planoId: string | null;
  plano: Plano;
  clienteId: string | null;
  estado: EstadoAssinaturas;
  lista: AssinaturaSessao[];
  onMudou: () => void;
  /** Sessões a mostrar (padrão: todas). */
  sessoes?: number[];
  /** Antes de abrir (o editor salva o que estiver pendente). Falso cancela. */
  antesDeAbrir?: () => Promise<boolean>;
  titulo?: boolean;
  /** Dentro da linha da sessão (a ficha do paciente já mostra o número). */
  semNumero?: boolean;
  /** WhatsApp do paciente (reserva quando o celular não compartilha arquivo). */
  whatsappPaciente?: string | null;
}) {
  const numeros = useMemo(() => sessoes ?? sessoesDoPlano(plano), [sessoes, plano]);
  const hashes = useHashesAtuais(plano, numeros);
  const [abrir, setAbrir] = useState<number | null>(null);

  if (estado === "sem_permissao" || estado === "carregando") return null;

  async function colher(n: number) {
    if (estado === "sem_sql") return avisar(MSG_FALTA_SQL_ASSINATURAS, "erro");
    if (estado === "erro") return avisar("Não consegui carregar as assinaturas. Confira a internet.", "erro");
    if (!planoId) return avisar("Preencha o planejamento antes de colher as assinaturas.", "erro");
    if (antesDeAbrir && !(await antesDeAbrir())) return;
    setAbrir(n);
  }

  async function apagar(a: AssinaturaSessao) {
    const ok = await confirmar({
      titulo: `Apagar a assinatura de ${a.nome}?`,
      texto: `Assinada em ${dataHoraCurta(a.assinada_em)}. A imagem é apagada.`,
      confirmar: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    try {
      await apagarAssinatura(createClient(), a.id);
      onMudou();
    } catch (e) {
      avisar((e as Error).message, "erro");
    }
  }

  return (
    <div className="space-y-2">
      {titulo && <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Assinaturas</p>}
      {numeros.map((n) => {
        const daSessao = planoId ? assinaturasDaSessao(lista, planoId, n) : [];
        const sit = situacaoAssinaturas(daSessao, hashes[n] ?? null);
        return (
          <div key={n} className={semNumero ? "" : "rounded-2xl bg-neutral-50 px-3 py-2.5 ring-1 ring-neutral-200"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                {!semNumero && (
                  <p className="text-sm font-semibold text-neutral-800">
                    Sessão {n}
                    {plano.sessoesTotal > 1 ? ` de ${plano.sessoesTotal}` : ""}
                  </p>
                )}
                <div className={semNumero ? "" : "mt-1"}>{sit ? <SeloAssinatura situacao={sit} /> : <span className="text-xs text-neutral-500">Ainda sem assinatura</span>}</div>
              </div>
              <button
                type="button"
                onClick={() => colher(n)}
                className={`inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-bold ${sit && !sit.alterada && sit.completa ? "bg-white text-neutral-700 ring-1 ring-neutral-200" : "bg-brand-teal text-white"}`}
              >
                <PenLine size={14} /> {sit ? "Assinar de novo" : "Colher assinaturas"}
              </button>
            </div>
            {estado === "sem_sql" && <p className="mt-1 text-[11px] text-amber-700">{MSG_FALTA_SQL_ASSINATURAS}</p>}
            {daSessao.length > 0 && (
              <ul className="mt-2 space-y-1">
                {daSessao.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-[11px] text-neutral-600">
                    <span className="min-w-0 truncate">
                      {a.papel === "paciente" ? "Paciente" : "Profissional"}: <b className="text-neutral-800">{a.nome}</b>
                      {a.registro ? ` · ${a.registro}` : ""} · {dataHoraCurta(a.assinada_em)}
                    </span>
                    <button type="button" onClick={() => apagar(a)} aria-label={`Apagar a assinatura de ${a.nome}`} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-neutral-400 active:bg-rose-50 active:text-rose-600">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {(() => {
              const t = lerTriagem(daSessao.find((a) => a.papel === "paciente"));
              if (!t) return null;
              const cor = t.situacao === "absoluta" ? "text-rose-700" : t.situacao === "relativa" ? "text-amber-700" : "text-neutral-500";
              return (
                <p className={`mt-1 text-[11px] ${cor}`}>
                  Triagem: {t.situacao === "absoluta" ? "contraindicação absoluta confirmada pela profissional" : t.situacao === "relativa" ? "relativas avaliadas pela profissional" : "sem contraindicações declaradas"}
                  {t.termo.aceito ? " · termo aceito" : ""}
                </p>
              );
            })()}
            {sit?.alterada && <OQueFoiAssinado lista={daSessao} />}
            {sit?.completa && (
              <div className="mt-2">
                <EnviarFichaAssinada plano={plano} sessao={n} assinaturas={daSessao} hashAtual={hashes[n] ?? null} whatsapp={whatsappPaciente} />
              </div>
            )}
          </div>
        );
      })}
      {abrir !== null && planoId && (
        <ColherAssinaturas planoId={planoId} plano={plano} sessao={abrir} clienteId={clienteId} onFechar={() => setAbrir(null)} onConcluiu={onMudou} />
      )}
    </div>
  );
}
