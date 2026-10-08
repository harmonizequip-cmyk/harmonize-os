// Textos das mensagens para o cliente, iguais aos do app (lib/saudacao.ts e
// lib/cobranca.ts). Ficam copiados aqui porque a função roda no Supabase,
// fora do projeto Next. Se mudar lá, mudar aqui também.

const TRATAMENTOS: Record<string, string> = {
  dr: "Dr.", "dr.": "Dr.", doutor: "Dr.", dra: "Dra.", "dra.": "Dra.", doutora: "Dra.",
};

function capitalizar(p: string) {
  const m = p.toLocaleLowerCase("pt-BR");
  return m.charAt(0).toLocaleUpperCase("pt-BR") + m.slice(1);
}

export function saudacaoCurta(c: { name?: string | null; treatment?: string | null; display_name?: string | null }) {
  const palavras = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
  let tratamento = c.treatment?.trim() || null;
  let resto = palavras;
  const prefixo = TRATAMENTOS[(palavras[0] ?? "").toLocaleLowerCase("pt-BR")];
  if (prefixo) {
    resto = palavras.slice(1);
    if (!tratamento) tratamento = prefixo;
  }
  const exibicao = (c.display_name ?? "").trim().split(/\s+/).filter((p) => p && !TRATAMENTOS[p.toLocaleLowerCase("pt-BR")]);
  const candidato = exibicao[0] ?? resto[0] ?? null;
  const nome = candidato && /^\p{L}[\p{L}'’]*$/u.test(candidato) ? capitalizar(candidato) : null;
  if (!nome) return "Olá!";
  return tratamento ? `Olá, ${tratamento} ${nome}!` : `Olá, ${nome}!`;
}

export const reais = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function mensagemCobranca(c: any, locacoes: { data: string; saldo: number }[]) {
  const total = locacoes.reduce((s, l) => s + l.saldo, 0);
  const corpo =
    locacoes.length === 1
      ? `Passando para lembrar do pagamento em aberto da locação de ${dataBr(locacoes[0].data)}, no valor de ${reais(total)}.`
      : `Passando para lembrar dos pagamentos em aberto das locações de ${locacoes.map((l) => dataBr(l.data)).join(", ")}, somando ${reais(total)}.`;
  return `${saudacaoCurta(c)} 😊\n\n${corpo}\n\nSe já realizou o pagamento, me envie o comprovante, por favor. Obrigada! 🙏`;
}

export function mensagemTaxa(c: any, dataEvento: string, valor: number) {
  const v = valor > 0 ? ` de ${reais(valor)}` : "";
  return (
    `${saudacaoCurta(c)} 😊\n\n` +
    `Passando para lembrar da taxa de reserva${v} para garantir a sua data de ${dataBr(dataEvento)}. ` +
    `Assim que o pagamento for confirmado, a data fica reservada para você.\n\n` +
    `Se já realizou o pagamento, me envie o comprovante, por favor. Obrigada! 🙏`
  );
}

/** Link do WhatsApp com a mensagem pronta (wa.me abre o app do WhatsApp no celular). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  if (!telefone) return null;
  let d = telefone.replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55") && d.startsWith("0")) d = d.slice(1);
  const numero = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
