import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClienteDetailClient from "./ClienteDetailClient";

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", params.id).single();

  if (!client) {
    notFound();
  }

  const { data: rentals } = await supabase
    .from("rentals")
    .select("id, event_date, shots, calculated_value, payment_method, status, equipment_id, equipments(name)")
    .eq("client_id", params.id)
    .order("event_date", { ascending: false });

  const { data: equipments } = await supabase.from("equipments").select("id, code, name").order("code");

  const normalizedRentals = (rentals ?? []).map((r: any) => ({
    ...r,
    equipments: Array.isArray(r.equipments) ? (r.equipments[0] ?? null) : (r.equipments ?? null),
  }));

  return (
    <ClienteDetailClient client={client} rentals={normalizedRentals} equipments={equipments ?? []} />
  );
}
