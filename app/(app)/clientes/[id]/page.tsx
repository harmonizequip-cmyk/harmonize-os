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
    .select("id, event_date, shots, calculated_value, payment_method, status, rescheduled, equipment_id, notes, equipments(name)")
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

  return (
    <ClienteDetailClient
      client={client}
      rentals={normalizedRentals}
      billableCount={billableCount}
      billableTotal={billableTotal}
      equipments={equipments ?? []}
      pricingConfig={settings.pricing}
      reservationFee={settings.reservationFee}
    />
  );
}
