// Funil de clientes: a etapa não é gravada no banco, é calculada aqui a
// partir de dados que já existem (reservas futuras, taxa de reserva e
// última locação concluída). Assim ela nunca fica desatualizada: paga a
// taxa, a etapa muda sozinha; passam 45 dias, cai em Reativar sozinha.

export const CLIENT_STAGES = [
  { key: "pre_reserva", label: "Pré-reserva", dot: "bg-amber-400" },
  { key: "agendamento", label: "Agendamento", dot: "bg-brand-pink" },
  { key: "cliente", label: "Cliente", dot: "bg-brand-teal" },
  { key: "reativar", label: "Reativar", dot: "bg-neutral-400" },
] as const;

export type ClientStageKey = (typeof CLIENT_STAGES)[number]["key"];

export interface ReservaAberta {
  taxa_status: string;
}

function diasEntre(inicio: string, fim: string) {
  const a = new Date(`${inicio.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${fim.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Regras:
 * - Reserva futura com taxa pendente => Pré-reserva (se houver mais de uma
 *   reserva e qualquer uma estiver pendente, vale a pendente, que é a que
 *   pede ação).
 * - Reserva futura com taxa paga ou isenta (taxa "não se aplica", como
 *   parceiro) => Agendamento.
 * - Sem reserva futura: Cliente se a última locação concluída foi há no
 *   máximo `diasAteReativar` dias; senão (ou sem nenhuma locação) Reativar.
 */
export function etapaDoCliente({
  reservas,
  ultimaLocacao,
  hoje,
  diasAteReativar,
}: {
  reservas: ReservaAberta[];
  ultimaLocacao: string | null;
  hoje: string;
  diasAteReativar: number;
}): ClientStageKey {
  if (reservas.some((r) => r.taxa_status === "pendente")) return "pre_reserva";
  if (reservas.some((r) => r.taxa_status === "paga" || r.taxa_status === "nao_aplica")) return "agendamento";
  if (ultimaLocacao && diasEntre(ultimaLocacao, hoje) <= diasAteReativar) return "cliente";
  return "reativar";
}
