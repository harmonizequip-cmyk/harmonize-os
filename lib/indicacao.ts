// Programa de indicação (02/11/2026): regras puras, testadas em indicacao.test.ts.
// Quem indica ganha 10% quando a indicada faz a primeira locação de HIPRO; a
// indicada ganha 10% na primeira locação. Um desconto por locação, vale 90 dias.
// Os descontos nascem no banco (gatilhos da migration 2026-11-02-programa-indicacao.sql).

export const PERCENTUAL_INDICACAO = 10;
export const DIAS_LINK_INDICACAO = 7;

export interface DescontoIndicacao {
  id: string;
  client_id: string;
  tipo: "indicou" | "indicado";
  outro_client_id: string | null;
  percentual: number;
  valido_ate: string;
  usado_em: string | null;
  usado_rental_id: string | null;
  created_at: string;
}

export type SituacaoDesconto = "disponivel" | "usado" | "vencido";

export function situacaoDesconto(d: Pick<DescontoIndicacao, "usado_em" | "valido_ate">, hoje: string): SituacaoDesconto {
  if (d.usado_em) return "usado";
  return d.valido_ate < hoje ? "vencido" : "disponivel";
}

/** O desconto a usar agora: o disponível que vence primeiro (um por locação). */
export function descontoParaUsar<T extends Pick<DescontoIndicacao, "usado_em" | "valido_ate">>(lista: T[], hoje: string): T | null {
  const ok = lista.filter((d) => situacaoDesconto(d, hoje) === "disponivel");
  ok.sort((a, b) => a.valido_ate.localeCompare(b.valido_ate));
  return ok[0] ?? null;
}

const normalizar = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface ClienteParaIndicacao {
  id: string;
  name: string;
  display_name?: string | null;
  city?: string | null;
}

/**
 * Cadastros parecidos com o nome digitado de quem indicou: todas as palavras
 * do nome digitado aparecem no nome (ou no "como prefere ser chamada").
 * Os de nome exatamente igual vêm primeiro.
 */
export function candidatosIndicacao<T extends ClienteParaIndicacao>(nome: string, clientes: T[], ignorar?: string): T[] {
  const alvo = normalizar(nome);
  if (!alvo) return [];
  const palavras = alvo.split(" ");
  const achados = clientes.filter((c) => {
    if (c.id === ignorar) return false;
    const nomes = [normalizar(c.name), normalizar(c.display_name)];
    return nomes.some((n) => n && palavras.every((p) => n.split(" ").includes(p)));
  });
  const exato = (c: T) => (normalizar(c.name) === alvo || normalizar(c.display_name) === alvo ? 0 : 1);
  return achados.sort((a, b) => exato(a) - exato(b) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Tempo que falta até o prazo, para a contagem regressiva do link. */
export function tempoRestante(expiraEm: string, agora: number): { dias: number; horas: number; minutos: number; segundos: number; acabou: boolean } {
  const ms = new Date(expiraEm).getTime() - agora;
  if (!Number.isFinite(ms) || ms <= 0) return { dias: 0, horas: 0, minutos: 0, segundos: 0, acabou: true };
  const s = Math.floor(ms / 1000);
  return { dias: Math.floor(s / 86400), horas: Math.floor((s % 86400) / 3600), minutos: Math.floor((s % 3600) / 60), segundos: s % 60, acabou: false };
}

/** Mensagem que a cliente recebe com o próprio link para indicar. */
export function mensagemLinkIndicacao(saudacao: string, link: string): string {
  return [
    `${saudacao} Agora você pode indicar a Harmonize e ganhar desconto!`,
    "",
    `Quem você indicar ganha ${PERCENTUAL_INDICACAO}% de desconto na primeira locação do HIPRO, e você ganha ${PERCENTUAL_INDICACAO}% na sua próxima locação assim que ela alugar.`,
    "",
    `É só mandar este link para ela (vale ${DIAS_LINK_INDICACAO} dias depois de aberto):`,
    link,
  ].join("\n");
}

export const rotuloTipo = (t: DescontoIndicacao["tipo"]) => (t === "indicou" ? "Por indicar" : "Por ter sido indicada");
