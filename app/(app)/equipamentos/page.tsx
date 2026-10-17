import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";
import AplicadoresCard from "@/components/AplicadoresCard";
import { type Bloqueio } from "@/components/BloqueiosEquipamento";
import { type AplicadorUso } from "@/lib/aplicador";

import { hojeLocal, resolverPeriodo } from "@/lib/period";
import SeletorPeriodo from "@/components/equipamentos/SeletorPeriodo";
import { IconeChip } from "@/components/ui/Visual";
import { Server } from "lucide-react";
import EquipamentoCard, { type EquipamentoDados } from "@/components/equipamentos/EquipamentoCard";
const EQUIPMENT_COLORS: Record<string, string> = {
  hipro_1: "bg-brand-teal",
  hipro_2: "bg-brand-blue",
};

export default async function EquipamentosPage(
  props: {
    searchParams: Promise<{ period?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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

  // Aplicadores e disparos estimados de cada um (view aplicadores_uso).
  const { data: aplicadoresRaw } = await supabase
    .from("aplicadores_uso")
    .select("id, nome, numero_serie, garantia_disparos, contador_base, contador_base_em, ativo, equipment_id, montado_desde, disparos")
    .order("nome");
  const aplicadores = ((aplicadoresRaw ?? []) as AplicadorUso[]).map((a) => ({ ...a, disparos: Number(a.disparos) }));

  const { data: equipments } = await supabase
    .from("equipments")
    .select("id, code, name, status, status_motivo, status_desde, status_previsto_fim, serial_number, anvisa_registro, ultima_revisao")
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
    .select("id, equipment_id, date_start, client_id, clients(name)")
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
      <section className="cartao p-4">
        <div className="flex items-center gap-2.5">
          <IconeChip icone={Server} cor="teal" />
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-slate-900">Equipamentos</h1>
          <SeletorPeriodo padrao="mes" />
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Período: {periodo.rotulo}</p>

        {(equipments ?? []).map((eq) => {
          const eqRentals = (rentals ?? []).filter((r) => r.equipment_id === eq.id);
          const totalLocacoes = eqRentals.length;
          const receitaTotal = eqRentals.reduce((sum, r) => sum + Number(r.calculated_value), 0);
          const pendenteTotal = eqRentals.reduce((sum, r) => sum + (saldoByRentalId.get(r.id) ?? 0), 0);
          const disparosTotal = eqRentals.reduce((sum, r) => sum + Number(r.shots ?? 0), 0);
          const nextEvent = normalizedUpcoming.find((e) => e.equipment_id === eq.id);
          const eqPrevistas = normalizedPrevistas.filter((p) => p.equipment_id === eq.id);
          const aplicador = aplicadores.find((a) => a.ativo && a.equipment_id === eq.id);

          return (
            <EquipamentoCard
              key={eq.id}
              eq={eq as EquipamentoDados}
              totalLocacoes={totalLocacoes}
              receitaTotal={receitaTotal}
              pendenteTotal={pendenteTotal}
              disparosTotal={disparosTotal}
              nextEvent={nextEvent ?? null}
              previstas={eqPrevistas}
              aplicador={aplicador ?? null}
              bloqueios={bloqueios.filter((b) => b.equipment_id === eq.id)}
            />
          );
        })}
        {(!equipments || equipments.length === 0) && (
          <p className="py-10 text-center text-slate-400">Nenhum equipamento cadastrado.</p>
        )}
      </section>

      <AplicadoresCard aplicadores={aplicadores} equipamentos={(equipments ?? []).map((e) => ({ id: e.id, name: e.name }))} />
    </div>
  );
}
