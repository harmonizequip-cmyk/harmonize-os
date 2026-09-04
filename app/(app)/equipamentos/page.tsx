import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/format";

const EQUIPMENT_COLORS: Record<string, string> = {
  hipro_1: "bg-brand-teal",
  hipro_2: "bg-brand-blue",
};

export default async function EquipamentosPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: equipments } = await supabase
    .from("equipments")
    .select("id, code, name, status")
    .order("code");

  const { data: rentals } = await supabase.from("rentals").select("equipment_id, calculated_value");

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Equipamentos</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {(equipments ?? []).map((eq) => {
          const eqRentals = (rentals ?? []).filter((r) => r.equipment_id === eq.id);
          const totalLocacoes = eqRentals.length;
          const receitaTotal = eqRentals.reduce((sum, r) => sum + Number(r.calculated_value), 0);
          const nextEvent = normalizedUpcoming.find((e) => e.equipment_id === eq.id);

          return (
            <div key={eq.id} className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${EQUIPMENT_COLORS[eq.code] ?? "bg-neutral-400"}`} />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{eq.name}</h2>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Status</p>
                  <p className="mt-0.5 text-sm font-medium capitalize text-neutral-900 dark:text-neutral-100">{eq.status}</p>
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
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Quantidade de locações</p>
                  <p className="mt-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">{totalLocacoes}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Receita total</p>
                  <p className="mt-0.5 text-sm font-medium text-brand-teal">{formatCurrency(receitaTotal)}</p>
                </div>
              </div>
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
