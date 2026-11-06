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

// ---------------------------------------------------------------------------
// Avisos com urgência (05/11/2026): descontos perto de vencer e indicadas novas
// que ainda não receberam o primeiro contato.

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Dias que faltam até a data (0 = hoje). Datas no formato AAAA-MM-DD. */
export function diasParaVencer(validoAte: string, hoje: string): number {
  const a = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
  const b = Date.UTC(+validoAte.slice(0, 4), +validoAte.slice(5, 7) - 1, +validoAte.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export const DIAS_AVISO_VENCIMENTO = 3;

/** Descontos ainda disponíveis que vencem em até 3 dias (hoje incluso), o mais urgente primeiro. */
export function descontosVencendo<T extends Pick<DescontoIndicacao, "usado_em" | "valido_ate">>(lista: T[], hoje: string, limite = DIAS_AVISO_VENCIMENTO): (T & { dias: number })[] {
  return lista
    .filter((d) => situacaoDesconto(d, hoje) === "disponivel")
    .map((d) => ({ ...d, dias: diasParaVencer(d.valido_ate, hoje) }))
    .filter((d) => d.dias >= 0 && d.dias <= limite)
    .sort((a, b) => a.dias - b.dias || a.valido_ate.localeCompare(b.valido_ate));
}

/** "vence hoje", "vence amanhã (07/11)", "vence em 3 dias (09/11)". */
export function textoVencimento(dias: number, validoAte: string): string {
  if (dias <= 0) return "vence hoje";
  if (dias === 1) return `vence amanhã (${ddmm(validoAte)})`;
  return `vence em ${dias} dias (${ddmm(validoAte)})`;
}

/**
 * Mensagem de WhatsApp para quem tem desconto vencendo. Gatilhos: posse ("é seu"),
 * prazo concreto, perda ao expirar e um próximo passo fácil (escolher a data).
 */
export function mensagemDescontoVencendo(p: {
  saudacao: string;
  tipo: DescontoIndicacao["tipo"];
  dias: number;
  validoAte: string;
  outroNome?: string | null;
}): string {
  const prazo = textoVencimento(p.dias, p.validoAte);
  const ultimo = p.dias <= 0 ? "Hoje é o último dia." : p.dias === 1 ? "Amanhã é o último dia." : "Faltam poucos dias.";
  if (p.tipo === "indicado") {
    return [
      `${p.saudacao} Tenho um presente guardado no seu nome: ${PERCENTUAL_INDICACAO}% de desconto na sua primeira locação do HIPRO${p.outroNome ? `, por indicação de ${p.outroNome}` : ""}.`,
      "",
      `Ele ${prazo}. ${ultimo} Depois disso ele expira e eu não consigo segurar.`,
      "",
      "Me diz a melhor data para você que eu já reservo com o desconto aplicado. As datas boas do mês costumam ir primeiro.",
    ].join("\n");
  }
  return [
    `${p.saudacao} Como agradecimento pela sua indicação${p.outroNome ? ` (${p.outroNome} já alugou)` : ""}, você tem ${PERCENTUAL_INDICACAO}% de desconto guardado na sua próxima locação do HIPRO.`,
    "",
    `Ele ${prazo}. ${ultimo} Depois disso ele expira.`,
    "",
    "Vamos garantir a sua próxima data enquanto ele vale? Me diz o dia que eu seguro para você.",
  ].join("\n");
}

/** Mensagem do primeiro contato com quem chegou por indicação (antes de esfriar). */
export function mensagemBoasVindasIndicacao(p: { saudacao: string; indicadora?: string | null; validoAte?: string | null }): string {
  const presente = p.validoAte
    ? `e isso já te garante ${PERCENTUAL_INDICACAO}% de desconto na sua primeira locação do HIPRO, válido até ${ddmm(p.validoAte)}`
    : `e isso já te garante ${PERCENTUAL_INDICACAO}% de desconto na sua primeira locação do HIPRO`;
  return [
    `${p.saudacao} Aqui é da Harmonize. Vi que você chegou por indicação${p.indicadora ? ` de ${p.indicadora}` : ""}, ${presente}.`,
    "",
    "Quem indica já viu de perto o resultado que o HIPRO entrega, e as agendas do mês costumam fechar rápido.",
    "",
    "Em qual cidade você atende e qual período fica melhor? Já te mando as datas livres para você escolher primeiro.",
  ].join("\n");
}

export interface IndicadaNova {
  id: string;
  created_at: string;
  is_client?: boolean | null;
}

/** Janela em que a indicada nova ainda pede o primeiro contato (dias desde o cadastro). */
export const DIAS_INDICADA_NOVA = 14;

/** Indicadas recentes, ainda leads, sem nenhum contato registrado depois do cadastro. */
export function indicadasSemContato<T extends IndicadaNova>(lista: T[], contatadas: Set<string>, hoje: string, janela = DIAS_INDICADA_NOVA): T[] {
  return lista
    .filter((c) => !c.is_client && !contatadas.has(c.id))
    .filter((c) => {
      const d = -diasParaVencer(c.created_at.slice(0, 10), hoje);
      return d >= 0 && d <= janela;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
