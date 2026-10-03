import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import ClienteDetailClient from "./ClienteDetailClient";

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", params.id).single();

  if (!client) {
    notFound();
  }

  const { data: rentals } = await supabase
    .from("rentals")
    .select(
      "id, event_date, event_date_end, shots, calculated_value, payment_method, status, rescheduled, equipment_id, notes, km_ida, valor_deslocamento, deslocamento_incluso_no_valor, equipments(name, serial_number, anvisa_registro)"
    )
    .eq("client_id", params.id)
    .order("event_date", { ascending: false });

  // A tabela da ficha continua mostrando TODAS as locações, inclusive as
  // canceladas, porque o histórico do cliente precisa delas visíveis com
  // a etiqueta de cancelada. Já os cartões de total faturado e ticket
  // médio vêm da view de contabilizáveis, que exclui cancelada e modo
  // teste. Antes os dois saíam da mesma lista, e o total somava tudo.
  const { data: billableRentals } = await supabase
    .from("rentals_contabilizaveis")
    .select("calculated_value")
    .eq("client_id", params.id);

  const billableCount = (billableRentals ?? []).length;
  const billableTotal = (billableRentals ?? []).reduce(
    (sum: number, r: any) => sum + Number(r.calculated_value),
    0
  );

  const { data: equipments } = await supabase.from("equipments").select("id, code, name").order("code");
  const settings = await fetchSettings(supabase);

  const normalizedRentals = (rentals ?? []).map((r: any) => ({
    ...r,
    equipments: Array.isArray(r.equipments) ? (r.equipments[0] ?? null) : (r.equipments ?? null),
  }));

  // Leva Y: pré-reservas ("Agendar sem disparos") deste cliente que ainda
  // não viraram locação — ficam numa seção separada, "Próximos
  // agendamentos", porque é justamente aí que o contrato precisa poder
  // ser gerado: antes do procedimento, quando ainda não existe linha
  // nenhuma em `rentals`.
  const { data: preReservas } = await supabase
    .from("calendar_events")
    .select("id, date_start, date_end, equipment_id, equipments(name, serial_number, anvisa_registro)")
    .eq("client_id", params.id)
    .eq("status", "pre_reserva")
    .is("rental_id", null)
    .order("date_start", { ascending: true });

  const normalizedPreReservas = (preReservas ?? []).map((r: any) => ({
    id: r.id,
    event_date: r.date_start,
    event_date_end: r.date_end,
    equipment_id: r.equipment_id,
    equipments: Array.isArray(r.equipments) ? (r.equipments[0] ?? null) : (r.equipments ?? null),
  }));

  // Pré-reservas reagendadas não aparecem em `rentals` (ainda não têm
  // rental_id), então contamos à parte em calendar_events — só onde
  // rental_id é nulo, pra não contar de novo o que já virou locação.
  const { count: reagendadasPreReservaCount } = await supabase
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("client_id", params.id)
    .eq("rescheduled", true)
    .is("rental_id", null);

  // Item 7: quem indicou este cliente e quem ele já indicou.
  const { data: indicador } = client.indicado_por
    ? await supabase.from("clients").select("id, name").eq("id", client.indicado_por).maybeSingle()
    : { data: null };
  const { data: indicados } = await supabase
    .from("clients")
    .select("id, name")
    .eq("indicado_por", params.id)
    .eq("is_test", false)
    .order("name");

  return (
    <ClienteDetailClient
      indicador={indicador ?? null}
      indicados={indicados ?? []}
      client={client}
      rentals={normalizedRentals}
      preReservas={normalizedPreReservas}
      billableCount={billableCount}
      billableTotal={billableTotal}
      equipments={equipments ?? []}
      pricingConfig={settings.pricing}
      reservationFee={settings.reservationFee}
      reagendadasPreReservaCount={reagendadasPreReservaCount ?? 0}
    />
  );
}
