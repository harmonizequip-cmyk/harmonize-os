import { somarDias } from "./period";

// Data (calendário de Brasília) em que o registro foi criado. created_at
// vem em UTC; Brasília é UTC-3 o ano todo, igual ao resto do sistema.
export function dataCriacaoLocal(createdAtIso: string): string {
  return new Date(new Date(createdAtIso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Taxa de reserva vencida: ainda pendente depois de `dias` dias contados da
// criação da reserva (settings.dias_cobranca_taxa, 3 por padrão). Mesma
// conta da tarefa "Cobrar taxa de reserva" (gerar_tarefas_agenda). É só
// aviso: nada é cancelado automaticamente.
export function taxaVencida(createdAtIso: string | null | undefined, hoje: string, dias: number): boolean {
  if (!createdAtIso) return false;
  return somarDias(dataCriacaoLocal(createdAtIso), dias) <= hoje;
}
