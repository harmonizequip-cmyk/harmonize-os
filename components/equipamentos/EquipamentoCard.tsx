// Cartão de um HIPRO na tela Equipamentos (desenho aprovado pelo dono em
// 17/10/2026): nome, status e próxima reserva; números do período; revisão
// anual; aplicador montado, número de série e bloqueio de período.

import Link from "next/link";
import { CalendarCheck, CalendarDays, CircleDollarSign, ClipboardList } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { linkEvento } from "@/lib/atalhos";
import { LinkCliente } from "@/components/Atalhos";
import EquipamentoStatusControl from "@/components/EquipamentoStatusControl";
import EquipamentoInfoControl from "@/components/EquipamentoInfoControl";
import EquipamentoPrevistasControl from "@/components/EquipamentoPrevistasControl";
import RevisaoAnualControl from "@/components/RevisaoAnualControl";
import BloqueiosEquipamento, { type Bloqueio } from "@/components/BloqueiosEquipamento";
import { type AplicadorUso, situacaoAplicador } from "@/lib/aplicador";

const EQUIPMENT_COLORS: Record<string, string> = {
  hipro_1: "bg-brand-teal",
  hipro_2: "bg-brand-blue",
};

export interface EquipamentoDados {
  id: string;
  code: string;
  name: string;
  status: string;
  status_motivo: string | null;
  status_desde: string | null;
  status_previsto_fim: string | null;
  serial_number: string | null;
  anvisa_registro: string | null;
  ultima_revisao: string | null;
}

export default function EquipamentoCard({
  eq,
  totalLocacoes,
  receitaTotal,
  pendenteTotal,
  disparosTotal,
  nextEvent,
  previstas,
  aplicador,
  bloqueios,
}: {
  eq: EquipamentoDados;
  totalLocacoes: number;
  receitaTotal: number;
  pendenteTotal: number;
  disparosTotal: number;
  nextEvent: { id: string; date_start: string; client_id: string | null; clients: { name: string } | null } | null;
  previstas: { id: string; event_date: string; client_name: string | null }[];
  aplicador: (AplicadorUso & { disparos: number }) | null;
  bloqueios: Bloqueio[];
}) {
  const situacao = aplicador ? situacaoAplicador(aplicador) : null;
  const eqPrevistas = previstas;
  return (
    <div className="mt-3 border-t border-slate-100 pt-4">
        {/* Nome, status e próxima reserva */}
        <div className="grid grid-cols-[1.05fr_auto_1fr] gap-x-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2.5 text-xl font-extrabold leading-none text-slate-900">
              <span className={`h-3 w-3 flex-shrink-0 rounded-full ${EQUIPMENT_COLORS[eq.code] ?? "bg-slate-400"}`} />
              {eq.name}
            </p>
            <EquipamentoStatusControl
              equipmentId={eq.id}
              status={eq.status}
              statusMotivo={eq.status_motivo ?? null}
              statusDesde={eq.status_desde ?? null}
              statusPrevistoFim={eq.status_previsto_fim ?? null}
            />
          </div>
          <span className="w-px bg-slate-100" />
          <div className="flex min-w-0 gap-2.5">
            <CalendarDays size={22} strokeWidth={1.7} className="mt-0.5 flex-shrink-0 text-teal-600" />
            <div className="min-w-0">
              <p className="text-[13px] text-slate-500">Próxima reserva</p>
              {nextEvent ? (
                <>
                  <Link href={linkEvento(nextEvent.id)} className="block whitespace-nowrap text-[1.05rem] font-extrabold leading-tight tabular-nums text-slate-900">
                    {formatDate(nextEvent.date_start)}
                  </Link>
                  {nextEvent.clients?.name && (
                    <span className="block truncate text-[13.5px] text-slate-500">
                      <LinkCliente id={nextEvent.client_id}>{nextEvent.clients.name}</LinkCliente>
                    </span>
                  )}
                </>
              ) : (
                <p className="text-lg font-bold text-slate-400">Nenhuma</p>
              )}
            </div>
          </div>
        </div>
  
        {/* Números do período */}
        <div className="mt-5 grid grid-cols-[0.9fr_auto_1.5fr_auto_0.8fr] gap-x-2.5 border-t border-slate-100 pt-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-slate-500">
              <CalendarCheck size={15} className="flex-shrink-0 text-slate-500" />
              <span className="leading-tight">Locações no período</span>
            </p>
            <p className="mt-2 text-2xl font-extrabold leading-none tabular-nums text-teal-700">{totalLocacoes}</p>
            <p className="mt-1 text-[12.5px] text-slate-500">{disparosTotal.toLocaleString("pt-BR")} disparos</p>
          </div>
          <span className="w-px bg-slate-100" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-slate-500">
              <CircleDollarSign size={15} className="flex-shrink-0 text-slate-500" />
              <span className="leading-tight">Receita no período</span>
            </p>
            <p className="mt-2 whitespace-nowrap text-base font-extrabold leading-none tabular-nums tracking-tight text-teal-700">{formatCurrency(receitaTotal)}</p>
            {pendenteTotal > 0 && (
              <p className="mt-1 text-[12.5px] font-bold text-orange-500">Pendente: {formatCurrency(pendenteTotal)}</p>
            )}
          </div>
          <span className="w-px bg-slate-100" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-slate-500">
              <ClipboardList size={15} className="flex-shrink-0 text-slate-500" />
              <span className="leading-tight">Locações previstas</span>
            </p>
            <div className="mt-2">
              <EquipamentoPrevistasControl items={eqPrevistas} />
            </div>
          </div>
        </div>
  
        {/* Revisão anual */}
        <div id={`revisao-${eq.code}`} className="mt-5 scroll-mt-20">
          <RevisaoAnualControl equipmentId={eq.id} ultimaRevisao={eq.ultima_revisao ?? null} />
        </div>
  
        {/* Aplicador e número de série */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <a href="#aplicadores" className="block rounded-3xl bg-slate-50/80 p-3">
            <p className="text-[12px] text-slate-500">Aplicador montado</p>
            {aplicador ? (
              <>
                <p className="mt-0.5 font-bold text-slate-900">{aplicador.nome}</p>
                <p className="text-[12px] text-slate-500">
                  ≈ {aplicador.disparos.toLocaleString("pt-BR")} disparos
                  {situacao?.pct != null && (
                    <span className={situacao.situacao === "perto" ? " font-semibold text-amber-600" : ""}>
                      {" "}
                      ({situacao.situacao === "fora" ? "fora da garantia" : `${Math.round(situacao.pct * 100)}% da garantia`})
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-[12px] text-slate-400">Nenhum registrado →</p>
            )}
          </a>
          <div className="rounded-3xl bg-slate-50/80 p-3">
            <p className="text-[12px] text-slate-500">Número de série</p>
            <EquipamentoInfoControl
              equipmentId={eq.id}
              serialNumber={eq.serial_number ?? null}
              anvisaRegistro={eq.anvisa_registro ?? null}
            />
          </div>
        </div>
  
        <BloqueiosEquipamento
          equipmentId={eq.id}
          equipmentName={eq.name}
          bloqueios={bloqueios}
        />
      </div>
  );
}
