import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";
import EquipamentoStatusControl from "@/components/EquipamentoStatusControl";
import BloqueiosEquipamento, { type Bloqueio } from "@/components/BloqueiosEquipamento";
import EquipamentoInfoControl from "@/components/EquipamentoInfoControl";
import EquipamentoPrevistasControl from "@/components/EquipamentoPrevistasControl";

import { hojeLocal, resolverPeriodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
const EQUIPMENT_COLORS: Record<string, string> = {
  hipro_1: "bg-brand-teal",
  hipro_2: "bg-brand-blue",
};

export default async function EquipamentosPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const supabase = createClient();
  const today = hojeLocal();
  // Locações, disparos e receita seguem o período escolhido (padrão: este
  // mês). Status, próxima reserva e previstas são sempre "de hoje em diante".
  const periodo = resolverPeriodo(searchParams.period ?? "mes", searchParams.from, searchParams.to);

  // Leva U: não há job agendado neste projeto, então a atualização de
  // previsões vencidas acontece "sob demanda" aqui, antes de montar a
  // lista — garante que a tela nunca mostre um equipamento em
  // manutenção cuja previsão de retorno já passou.
  await supabase.rpc("aplicar_previsoes_manutencao_vencidas");

  // Bloqueios de agenda de hoje em diante (manutenção programada, recesso...).
  const { data: bloqueiosRaw } = await supabase
    .from("bloqueios_equipamento")
    .select("id, equipment_id, tipo, motivo, data_inicio, data_fim")
    .gte("data_fim", today)
    .order("data_inicio");
  const bloqueios = (bloqueiosRaw ?? []) as Bloqueio[];

  const { data: equipments } = await supabase
    .from("equipments")
    .select("id, code, name, status, status_motivo, status_desde, status_previsto_fim, serial_number, anvisa_registro")
    .order("code");

  // Lê da view rentals_contabilizaveis, não da tabela rentals: a receita
  // por equipamento contava locação cancelada e locação de modo teste,
  // divergindo do mesmo número mostrado no Dashboard.
  const { data: rentals } = await supabase
    .from("rentals_contabilizaveis")
    .select("id, equipment_id, calculated_value, shots")
    .gte("event_date", periodo.inicio)
    .lte("event_date", periodo.fim);

  // Saldo em aberto por locação, para calcular o pendente de cada
  // equipamento sem duplicar a lógica de pagamento parcial que já vive em
  // rentals_situacao_pagamento.
  const rentalIds = (rentals ?? []).map((r) => r.id);
  const { data: situacoes } = rentalIds.length
    ? await supabase
        .from("rentals_situacao_pagamento")
        .select("rental_id, saldo")
        .in("rental_id", rentalIds)
    : { data: [] as { rental_id: string; saldo: number }[] };

  const saldoByRentalId = new Map((situacoes ?? []).map((s) => [s.rental_id, Number(s.saldo)]));

  const { data: upcoming } = await supabase
    .from("calendar_events")
    .select("equipment_id, date_start, client_id, clients(name)")
    .neq("status", "cancelada")
    .gte("date_start", today)
    .not("equipment_id", "is", null)
    .order("date_start", { ascending: true });

  const normalizedUpcoming = (upcoming ?? []).map((e: any) => ({
    ...e,
    clients: Array.isArray(e.clients) ? (e.clients[0] ?? null) : (e.clients ?? null),
  }));

  // Locações previstas: eventos do calendário com status "pre_reserva",
  // ainda não realizados, de hoje em diante — usadas no card para o
  // gestor saber quantas pré-reservas vão virar locação, e quais
  // clientes são.
  const { data: previstasRaw } = await supabase
    .from("calendar_events")
    .select("id, equipment_id, date_start, client_id, clients(name)")
    .eq("status", "pre_reserva")
    .gte("date_start", today)
    .not("equipment_id", "is", null)
    .order("date_start", { ascending: true });

  const normalizedPrevistas = (previstasRaw ?? []).map((r: any) => ({
    id: r.id as string,
    equipment_id: r.equipment_id as string,
    event_date: r.date_start as string,
    client_name: (Array.isArray(r.clients) ? r.clients[0]?.name : r.clients?.name) ?? null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Equipamentos</h1>

      <FiltroBarra periodoPadrao="mes" rotuloPeriodo={periodo.rotulo} />

      <div className="grid gap-4 sm:grid-cols-2">
        {(equipments ?? []).map((eq) => {
          const eqRentals = (rentals ?? []).filter((r) => r.equipment_id === eq.id);
          const totalLocacoes = eqRentals.length;
          const receitaTotal = eqRentals.reduce((sum, r) => sum + Number(r.calculated_value), 0);
          const pendenteTotal = eqRentals.reduce((sum, r) => sum + (saldoByRentalId.get(r.id) ?? 0), 0);
          const disparosTotal = eqRentals.reduce((sum, r) => sum + Number(r.shots ?? 0), 0);
          const nextEvent = normalizedUpcoming.find((e) => e.equipment_id === eq.id);
          const eqPrevistas = normalizedPrevistas.filter((p) => p.equipment_id === eq.id);

          return (
            <div key={eq.id} className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${EQUIPMENT_COLORS[eq.code] ?? "bg-neutral-400"}`} />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{eq.name}</h2>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Status</p>
                  <EquipamentoStatusControl
                    equipmentId={eq.id}
                    status={eq.status}
                    statusMotivo={eq.status_motivo ?? null}
                    statusDesde={eq.status_desde ?? null}
                    statusPrevistoFim={eq.status_previsto_fim ?? null}
                  />
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Próxima reserva</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {nextEvent ? (
                      <>
                        {formatDate(nextEvent.date_start)}
                        {nextEvent.clients?.name && (
                          <span className="block text-xs font-normal text-neutral-500">
                            {nextEvent.clients.name}
                          </span>
                        )}
                      </>
                    ) : (
                      "Nenhuma"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Locações no período</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">{totalLocacoes}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {disparosTotal.toLocaleString("pt-BR")} disparos
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Receita no período</p>
                  <p className="mt-0.5 text-sm font-medium text-brand-teal">{formatCurrency(receitaTotal)}</p>
                  {pendenteTotal > 0 && (
                    <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Pendente: {formatCurrency(pendenteTotal)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Locações previstas</p>
                  <EquipamentoPrevistasControl items={eqPrevistas} />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Número de série</p>
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
                bloqueios={bloqueios.filter((b) => b.equipment_id === eq.id)}
              />
            </div>
          );
        })}
        {(!equipments || equipments.length === 0) && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300/70 bg-white/50 py-12 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            Nenhum equipamento cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}
