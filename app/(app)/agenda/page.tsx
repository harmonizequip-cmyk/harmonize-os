import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import AgendaClient from "./AgendaClient";
import type { SaldoCredito } from "@/lib/creditos";

export default async function AgendaPage() {
  const supabase = createClient();

  const { data: events } = await supabase
    .from("calendar_events")
    .select(
      "id, event_type, title, date_start, date_end, status, confirmed, value, client_id, equipment_id, clients(name, whatsapp, treatment, display_name), rental_id, notes, taxa_status, confirmation_message_sent_at, is_mentoria, created_at, contagem_inicial, contagem_inicial_em"
    )
    .neq("status", "cancelada")
    .order("date_start", { ascending: true });

  const { data: clients } = await supabase.from("clients").select("id, name, city, whatsapp").order("name");
  const { data: equipments } = await supabase.from("equipments").select("id, code, name").order("code");
  const settings = await fetchSettings(supabase);
  // Períodos em que um HIPRO não aceita reserva (manutenção, recesso...).
  const { data: bloqueios } = await supabase
    .from("bloqueios_equipamento")
    .select("id, equipment_id, tipo, motivo, data_inicio, data_fim, equipments(name)")
    .order("data_inicio");

  const normalizedEvents = (events ?? []).map((e: any) => ({
    ...e,
    clients: Array.isArray(e.clients) ? (e.clients[0] ?? null) : (e.clients ?? null),
  }));

  // Crédito da cliente: só para reservas ainda sem disparos.
  const idsComReserva = Array.from(
    new Set(normalizedEvents.filter((e: any) => !e.rental_id && e.client_id).map((e: any) => e.client_id as string))
  );
  const { data: saldos } = idsComReserva.length
    ? await supabase
        .from("creditos_saldo")
        .select("client_id, disparos_disponiveis, disparos_aguardando, valor_disponivel")
        .in("client_id", idsComReserva)
    : { data: [] as any[] };
  const creditos: Record<string, SaldoCredito> = {};
  for (const s of saldos ?? []) {
    creditos[s.client_id] = {
      client_id: s.client_id,
      disparos_disponiveis: Number(s.disparos_disponiveis ?? 0),
      disparos_aguardando: Number(s.disparos_aguardando ?? 0),
      valor_disponivel: Number(s.valor_disponivel ?? 0),
    };
  }

  return (
    <AgendaClient
      creditos={creditos}
      initialEvents={normalizedEvents}
      clients={clients ?? []}
      equipments={equipments ?? []}
      pricingConfig={settings.pricing}
      reservationFee={settings.reservationFee}
      mentoriaPricing={settings.mentoriaPricing}
      diasTaxa={settings.diasCobrancaTaxa}
      bloqueios={(bloqueios ?? []).map((b: any) => ({
        id: b.id,
        equipamento: (Array.isArray(b.equipments) ? b.equipments[0]?.name : b.equipments?.name) ?? "HIPRO",
        tipo: b.tipo,
        motivo: b.motivo,
        data_inicio: b.data_inicio,
        data_fim: b.data_fim,
      }))}
    />
  );
}
