// Recursos em teste (23/11/2026, pedido do dono): todo recurso novo para as
// clientes do portal nasce "em teste" (só o dono vê, pela prévia) e só aparece
// para elas depois que o dono toca em "Testei, liberar" em Configurações >
// Recursos em teste. A lista dos liberados fica em settings.preferencias.recursos.liberados;
// o portal lê pela função recursos_liberados() (sem o SQL, tudo fica escondido).

export interface Recurso {
  id: string;
  nome: string;
  /** O que a cliente passa a ver quando for liberado. */
  descricao: string;
  /** Endereço da prévia que o dono abre para testar (com o login dele). */
  previa?: string;
  /** Desde quando existe (dd/mm/aaaa). */
  desde: string;
}

export const RECURSOS: Recurso[] = [
  {
    id: "tour-planejador",
    nome: "Tour guiado do Planejador",
    descricao:
      "Convite \"Primeira vez no Planejador?\" ao entrar no portal, botão \"Como usar\" no topo, a paciente de exemplo com 16 balões e as dicas curtas que somem com \"Entendi\" (concluir sessão, ordem da assinatura e paciente sem WhatsApp).",
    previa: "/planejador/exemplo",
    desde: "21/11/2026",
  },
];

const ID_VALIDO = /^[a-z0-9-]{1,60}$/;

/** Lista de liberados vinda do banco (qualquer formato): só textos válidos, sem repetir. */
export function lerLiberados(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [];
  const saida: string[] = [];
  for (const v of bruto) if (typeof v === "string" && ID_VALIDO.test(v) && !saida.includes(v)) saida.push(v);
  return saida;
}

export function estaLiberado(liberados: readonly string[] | null | undefined, id: string): boolean {
  return !!liberados && liberados.includes(id);
}

/** Liga ou desliga um recurso na lista, sem mexer nos outros. */
export function alternarLiberado(liberados: readonly string[], id: string, liberar: boolean): string[] {
  const sem = liberados.filter((x) => x !== id);
  return liberar ? [...sem, id] : sem;
}
