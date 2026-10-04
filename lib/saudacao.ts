// ============================================================
// SAUDAÇÃO CURTA: "Olá, Dra. Simone!"
//
// O campo "Nome" do cadastro costuma carregar tudo junto, por exemplo
// "DRA. SIMONE KARLA - BOM JARDIM - PE - HIPRO". Em mensagem para o
// cliente só interessa o tratamento e o primeiro nome.
//
// Ordem de preferência: tratamento e nome de exibição do cadastro (os
// campos feitos para isso); na falta deles, o que dá para tirar do campo
// "Nome". Se nem assim houver um nome, a saudação vira só "Olá!".
// ============================================================

const TRATAMENTOS: Record<string, string> = {
  "dr": "Dr.",
  "dr.": "Dr.",
  "doutor": "Dr.",
  "dra": "Dra.",
  "dra.": "Dra.",
  "doutora": "Dra.",
};

function capitalizar(palavra: string): string {
  const p = palavra.toLocaleLowerCase("pt-BR");
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
}

// Só letras (com acento) contam como nome: telefone, traço e número não.
function ehNome(palavra: string): boolean {
  return /^\p{L}[\p{L}'’]*$/u.test(palavra);
}

export function tratamentoEPrimeiroNome(params: {
  name?: string | null;
  treatment?: string | null;
  displayName?: string | null;
}): { tratamento: string | null; primeiroNome: string | null } {
  const palavrasDoNome = (params.name ?? "").trim().split(/\s+/).filter(Boolean);

  let tratamento = params.treatment?.trim() || null;
  let resto = palavrasDoNome;
  const prefixo = TRATAMENTOS[(palavrasDoNome[0] ?? "").toLocaleLowerCase("pt-BR")];
  if (prefixo) {
    resto = palavrasDoNome.slice(1);
    if (!tratamento) tratamento = prefixo;
  }

  // Nome de exibição também pode vir com "Dra." na frente; pula.
  const palavrasExibicao = (params.displayName ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !TRATAMENTOS[p.toLocaleLowerCase("pt-BR")]);

  const candidato = palavrasExibicao[0] ?? resto[0] ?? null;
  const primeiroNome = candidato && ehNome(candidato) ? capitalizar(candidato) : null;

  return { tratamento: primeiroNome ? tratamento : null, primeiroNome };
}

export function saudacaoCurta(params: {
  name?: string | null;
  treatment?: string | null;
  displayName?: string | null;
}): string {
  const { tratamento, primeiroNome } = tratamentoEPrimeiroNome(params);
  if (!primeiroNome) return "Olá!";
  return tratamento ? `Olá, ${tratamento} ${primeiroNome}!` : `Olá, ${primeiroNome}!`;
}

/** Mensagem que acompanha a imagem de datas disponíveis para locação. */
export function mensagemDatasDisponiveis(params: {
  name?: string | null;
  treatment?: string | null;
  displayName?: string | null;
}): string {
  const { tratamento } = tratamentoEPrimeiroNome(params);
  const pacientes = tratamento === "Dr." ? "seus pacientes" : "suas pacientes";
  return (
    `${saudacaoCurta(params)}\n` +
    `Tudo bem? ☺️\n\n` +
    `Passando para te atualizar sobre as datas disponíveis para a locação do HIPRO. ✨\n\n` +
    `Se você já está planejando atender ${pacientes}, esse é um bom momento para escolher a data que melhor se encaixa na sua agenda e começar a organizar seus atendimentos com antecedência.\n\n` +
    `Vou te enviar as datas disponíveis para você avaliar e garantir sua reserva antes que sejam preenchidas. 📅`
  );
}
