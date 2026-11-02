// Ficha assinada da sessão para mandar ao paciente (PDF gerado no aparelho,
// lib/ficha-assinada-pdf.tsx). Aqui só os dados, sem tela nem banco: o mesmo
// conteúdo da ficha impressa (htmlFichaPaciente) daquela sessão, com as
// assinaturas, a triagem e a conferência do conteúdo. Testado em
// ficha-assinada.test.ts.

import { contaDaSessao, dataBr, planoDaSessao, todasAreas, totalArea, type Plano } from "./planejador";
import { dataHoraCompleta } from "./assinatura-sessao";
import { textoTriagemImpressao } from "./triagem-hipro";
import { primeiroNomePaciente } from "./orientacoes-pos";
import type { AssinaturaImpressa } from "./planejador-impressao";

export interface FichaAssinada {
  titulo: string;
  campos: { rotulo: string; valor: string }[];
  pacote: { rotulo: string; valor: number }[];
  areas: { nome: string; total: number; feito: boolean }[];
  total: number;
  recomendacoes: string;
  triagem: string | null;
  termo: string | null;
  assinaturas: { rotulo: string; nome: string; registro: string | null; quando: string; src: string }[];
  /** "Conteúdo verificado: abcd1234" (com aviso se a sessão mudou depois). */
  verificacao: string | null;
  alterada: boolean;
}

export function dadosFichaAssinada(p: Plano, n: number, lista: AssinaturaImpressa[], hashAtual: string | null): FichaAssinada {
  const daSessao = planoDaSessao(p, n) ?? p;
  const proxima = p.sessoesAnteriores.find((x) => x.n === n + 1)?.data || (n < p.sessaoAtual ? p.data : "");
  const v: Plano = { ...daSessao, dataRetorno: n === p.sessaoAtual ? p.dataRetorno : proxima };
  const varias = p.sessoesTotal > 1;

  const areas: FichaAssinada["areas"] = [];
  for (const a of todasAreas(v)) {
    const total = totalArea(v, a);
    if (!total) continue;
    const feito = (v.DATA[a.id] ?? []).some((r) => r.feito && (a.bilateral ? (r.dispD ?? 0) + (r.dispE ?? 0) > 0 : (r.disp ?? 0) > 0));
    areas.push({ nome: a.nome, total, feito });
  }

  const c = contaDaSessao(p, n);
  const pacote: FichaAssinada["pacote"] = varias
    ? [
        { rotulo: "Pacote", valor: c.pacote },
        ...(c.antes > 0 ? [{ rotulo: "Já usados antes", valor: c.antes }] : []),
        { rotulo: `Nesta sessão (${n})`, valor: c.nesta },
        c.ultima ? { rotulo: "Restante", valor: c.resta } : { rotulo: `Fica para a Sessão ${n + 1}`, valor: Math.max(0, c.resta) },
      ]
    : [];

  const campos: FichaAssinada["campos"] = [
    { rotulo: "Paciente", valor: v.paciente || "" },
    { rotulo: "Data", valor: dataBr(v.data) },
    { rotulo: "Retorno / próxima sessão", valor: v.dataRetorno ? dataBr(v.dataRetorno) : "" },
    { rotulo: "Profissional", valor: v.profissional ? `${v.profissional}${v.profissionalRegistro ? ` · ${v.profissionalRegistro}` : ""}` : "" },
    { rotulo: "Procedimento", valor: v.procNome || "" },
    { rotulo: "Queixa principal", valor: v.queixa || "" },
  ].filter((x) => x.valor);

  const doPaciente = lista.find((a) => a.papel === "paciente");
  const t = doPaciente?.triagem ?? null;
  const ordem: { papel: AssinaturaImpressa["papel"]; rotulo: string }[] = [
    { papel: "profissional", rotulo: "Assinatura do Profissional" },
    { papel: "paciente", rotulo: `Assinatura do Paciente${varias ? ` · Sessão ${n}` : ""}` },
  ];
  const assinaturas = ordem.flatMap(({ papel, rotulo }) => {
    const a = lista.find((x) => x.papel === papel);
    return a ? [{ rotulo, nome: a.nome, registro: a.registro, quando: `Assinado em ${dataHoraCompleta(a.assinadaEm)}`, src: a.src }] : [];
  });
  const alterada = !!hashAtual && lista.some((x) => x.hash !== hashAtual);
  const hash = lista[0]?.hash ?? "";

  return {
    titulo: varias ? `Ficha do Paciente · Sessão ${n} de ${p.sessoesTotal}` : "Ficha do Paciente",
    campos,
    pacote,
    areas,
    total: areas.reduce((s, a) => s + a.total, 0),
    recomendacoes: (p.recomendacoes || "").trim(),
    triagem: t ? textoTriagemImpressao(t) : null,
    termo: t?.termo.aceito ? `Termo de consentimento${t.termo.versao ? ` (versão ${t.termo.versao})` : ""}: ${t.termo.resumo || "aceito pelo paciente."}` : null,
    assinaturas,
    verificacao: hash ? `Conteúdo verificado: ${hash.slice(0, 8)}${alterada ? " · ATENÇÃO: a sessão foi alterada depois de assinada" : ""}` : null,
    alterada,
  };
}

/** Texto que vai junto do PDF no WhatsApp. */
export function mensagemFichaAssinada(paciente: string, n: number, sessoesTotal: number): string {
  const nome = primeiroNomePaciente(paciente);
  const sessao = sessoesTotal > 1 ? ` da Sessão ${n}` : "";
  return `Olá${nome ? `, ${nome}` : ""}! Segue a ficha${sessao} do seu procedimento com o HIPRO, assinada por você e pela profissional. Guarde para o seu controle.`;
}

/** Nome do arquivo: "Ficha HIPRO - Eder - Sessao 1.pdf", sem acento nem caractere estranho. */
export function nomeArquivoFicha(paciente: string, n: number): string {
  const nome = primeiroNomePaciente(paciente)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();
  return `Ficha HIPRO${nome ? ` - ${nome}` : ""} - Sessao ${n}.pdf`;
}
