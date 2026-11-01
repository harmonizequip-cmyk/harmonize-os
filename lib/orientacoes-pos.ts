// Orientações depois da sessão do HIPRO (e-book, cap. 24), mandadas ao
// paciente pelo WhatsApp a partir do Planejador. Nada sai sozinho: a tela
// monta o link (buildWhatsAppLink) e o dono ou a cliente toca para enviar.
// Regra pura, testada em orientacoes-pos.test.ts.

export interface DadosOrientacoes {
  paciente: string;
  /** Profissional do planejamento (estado.profissional); assina a mensagem. */
  profissional?: string | null;
  /** Próximo retorno (AAAA-MM-DD); só entra se for hoje ou depois. */
  retorno?: string | null;
  /** Hoje (AAAA-MM-DD, hojeLocal). */
  hoje: string;
}

/** Primeiro nome com só a inicial maiúscula ("MARIA DA SILVA" vira "Maria"). */
export function primeiroNomePaciente(nome: string): string {
  const p = (nome || "").replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
  if (!p) return "";
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
}

const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

export function mensagemOrientacoesPos(d: DadosOrientacoes): string {
  const nome = primeiroNomePaciente(d.paciente);
  const linhas = [
    `Olá${nome ? `, ${nome}` : ""}! Seguem os cuidados depois da sua sessão de HIPRO:`,
    "",
    "• Protetor solar FPS 50 ou mais logo depois da sessão, reaplicando a cada 3 horas.",
    "• Nas primeiras 48 horas, evite sauna, banho muito quente, sol direto e treino intenso.",
    "• Nos primeiros 5 dias, use sabonete neutro e hidratante restaurador.",
    "• Suspenda ácidos na pele (retinóico, glicólico, salicílico) por 3 a 5 dias.",
    "• Se quiser, use máscaras calmantes (camomila, calêndula, aloe vera).",
    "",
    "*O que esperar*",
    "• Logo depois: leve retração da pele, sutil.",
    "• De 30 a 60 dias: melhora que você já percebe.",
    "• De 90 a 180 dias: resultado máximo.",
    "",
    "Vermelhidão, inchaço leve e sensibilidade nos primeiros dias são normais e passam sozinhos. Qualquer dúvida, é só me chamar.",
  ];
  const retorno = (d.retorno ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(retorno) && retorno >= d.hoje) linhas.push("", `Seu próximo retorno: ${dataBr(retorno)}.`);
  const prof = (d.profissional ?? "").replace(/\s+/g, " ").trim();
  if (prof) linhas.push("", prof);
  return linhas.join("\n");
}
