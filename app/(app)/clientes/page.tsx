import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, clinic_name, whatsapp, city, address, data_evento")
    .eq("stage", "cliente")
    .order("name");

  // Lê da view rentals_contabilizaveis, não da tabela rentals. A view já
  // exclui cancelada e modo teste, que era o filtro que esta tela não
  // tinha: locação cancelada entrava no total faturado de cada cliente.
  const { data: rentals } = await supabase
    .from("rentals_contabilizaveis")
    .select("client_id, calculated_value, event_date");

  // hojeLocal em vez de toISOString: o segundo devolve a data em UTC, e
  // à noite fazia o "próximo evento" pular o dia seguinte.
  const todayStr = hojeLocal();
  const { data: upcomingEvents } = await supabase
    .from("calendar_events")
    .select("client_id, date_start, confirmed")
    .neq("status", "cancelada")
    .not("client_id", "is", null)
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true });

  const statsByClient = new Map<string, { count: number; total: number; lastDate: string | null }>();
  for (const r of rentals ?? []) {
    const current = statsByClient.get(r.client_id) ?? { count: 0, total: 0, lastDate: null };
    current.count += 1;
    current.total += Number(r.calculated_value);
    if (!current.lastDate || r.event_date > current.lastDate) current.lastDate = r.event_date;
    statsByClient.set(r.client_id, current);
  }

  // Primeiro evento futuro de cada cliente (a lista já vem ordenada por data)
  const nextEventByClient = new Map<string, { date_start: string; confirmed: boolean }>();
  for (const e of upcomingEvents ?? []) {
    if (!nextEventByClient.has(e.client_id)) {
      nextEventByClient.set(e.client_id, { date_start: e.date_start, confirmed: e.confirmed });
    }
  }

  // A taxa vem dos agendamentos, não do cliente: quem reserva cinco
  // datas deve cinco taxas, e o campo antigo guardava uma só.
  const { data: taxas } = await supabase
    .from("clientes_taxas")
    .select("client_id, taxas_pendentes, taxas_pagas, valor_pendente");
  const taxaPorCliente = new Map((taxas ?? []).map((t: any) => [t.client_id, t]));

  const clientsWithStats = (clients ?? []).map((c) => {
    const t: any = taxaPorCliente.get(c.id);
    return {
      ...c,
      stats: statsByClient.get(c.id) ?? { count: 0, total: 0, lastDate: null },
      nextEvent: nextEventByClient.get(c.id) ?? null,
      taxasPendentes: Number(t?.taxas_pendentes ?? 0),
      taxasPagas: Number(t?.taxas_pagas ?? 0),
      valorPendente: Number(t?.valor_pendente ?? 0),
    };
  });

  return <ClientesClient initialClients={clientsWithStats} />;
}
