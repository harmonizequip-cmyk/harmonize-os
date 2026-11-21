// Tour guiado do Planejador (portal da cliente, 21/11/2026): um paciente de
// exemplo que nunca vai ao banco e balões que mostram, um por vez, cada parte
// da tela. Regras puras aqui; a tela fica em components/planejador/TourGuiado.tsx.

import { estadoInicial, montarPlanejamento, type EstadoPlanejador } from "./planejamento";

export type AbaTour = "paciente" | "areas" | "resumo";

export interface PassoTour {
  /** data-tour do elemento destacado; sem alvo, o balão fica no meio da tela. */
  alvo?: string;
  /** Aba que precisa estar aberta para o alvo existir. */
  aba?: AbaTour;
  titulo: string;
  texto: string;
}

/** Chave do aparelho: a cliente já viu (ou dispensou) o convite do tour. */
export const CHAVE_TOUR_VISTO = "harmonize-tour-planejador-visto";
/** Endereço do paciente de exemplo no portal. */
export const ENDERECO_TOUR = "/portal/exemplo";
export const NOME_PACIENTE_EXEMPLO = "Maria (exemplo)";

export const PASSOS_TOUR: PassoTour[] = [
  {
    titulo: "Bem-vinda ao Planejador",
    texto: "Vamos montar juntas o plano de uma paciente de exemplo. Pode tocar em tudo: nada do que você fizer aqui fica salvo.",
  },
  {
    alvo: "nome-paciente",
    aba: "paciente",
    titulo: "1. O paciente",
    texto: "Comece pelo nome. Ao digitar, aparecem os pacientes que você já cadastrou: escolha da lista para não criar uma ficha repetida.",
  },
  {
    alvo: "profissional",
    aba: "paciente",
    titulo: "2. Quem vai atender",
    texto: "Escolha a profissional da sua clínica. Para cadastrar alguém novo, use a opção \"+ Nova profissional\" ou o ícone de pessoas no topo da tela inicial.",
  },
  {
    alvo: "sessoes",
    aba: "paciente",
    titulo: "3. Sessões do pacote",
    texto: "Marque quantas sessões o paciente vai fazer. Aqui são 2: o que não for usado hoje fica guardado para a próxima.",
  },
  {
    alvo: "saldo",
    aba: "paciente",
    titulo: "4. Saldo de disparos",
    texto: "Coloque o total de disparos do pacote. A conta de quanto já foi usado e quanto sobra é feita sozinha.",
  },
  {
    alvo: "montar",
    aba: "paciente",
    titulo: "5. Montar o plano",
    texto: "\"Montar pelas regras\" distribui os disparos pelas áreas seguindo as regras do HIPRO. Se preferir, preencha à mão. No exemplo, o plano já está montado.",
  },
  {
    alvo: "barra-saldo",
    titulo: "6. Saldo sempre à vista",
    texto: "Aqui em cima você vê, o tempo todo, quantos disparos ainda restam enquanto distribui.",
  },
  {
    alvo: "primeira-area",
    aba: "areas",
    titulo: "7. Cada área",
    texto: "Toque na foto para ver o movimento do aplicador. Escolha a profundidade e use o − e o + de cada lado. Se passar do máximo do fabricante, aparece um aviso.",
  },
  {
    alvo: "primeira-area",
    aba: "areas",
    titulo: "8. Marque o que foi feito",
    texto: "Durante o atendimento, toque no círculo de cada lado conforme for aplicando. A linha fica completa quando os dois lados estão marcados.",
  },
  {
    alvo: "resumo",
    aba: "resumo",
    titulo: "9. O resumo",
    texto: "O plano pronto, área por área. Os botões de baixo geram o PDF e mandam o resumo.",
  },
  {
    alvo: "assinaturas",
    aba: "resumo",
    titulo: "10. Assinaturas",
    texto: "No fim da sessão, toque em \"Colher assinaturas\": triagem, termo, o paciente assina com o dedo e depois a profissional. Experimente no exemplo depois do tour.",
  },
  {
    alvo: "orientacoes",
    aba: "resumo",
    titulo: "11. Orientações ao paciente",
    texto: "Manda pelo WhatsApp os cuidados depois da sessão, já escritos. Para funcionar, o paciente precisa ter o WhatsApp na ficha.",
  },
  {
    alvo: "concluir-sessao",
    aba: "paciente",
    titulo: "12. Fechar a sessão",
    texto: "Ao terminar, toque em \"Concluir Sessão 1 e abrir Sessão 2\". Quando o paciente voltar, abra a ficha dele e toque em \"Continuar\".",
  },
  {
    titulo: "Pronto, agora é com você",
    texto: "Mexa à vontade neste exemplo. Para ver o tour de novo, toque em \"Como usar\" no topo da tela inicial.",
  },
];

/** Plano da paciente de exemplo: 10.000 disparos em 2 sessões, 6.000 já distribuídos no rosto. */
export function estadoDeExemplo(hoje: string, profissional?: string | null): EstadoPlanejador {
  const montado = montarPlanejamento({ areas: ["frontal", "arcomandibular", "jowls"], saldo: 6000, queixa: "Flacidez no rosto", paciente: NOME_PACIENTE_EXEMPLO });
  return {
    ...estadoInicial(profissional ?? null, hoje),
    ...montado.estado,
    paciente: NOME_PACIENTE_EXEMPLO,
    queixa: "Flacidez no rosto",
    saldoTotal: "10000",
    sessoesTotal: 2,
  };
}

/** Lê do aparelho se o convite do tour já foi visto (sem armazenamento: conta como visto). */
export function tourJaVisto(ler: (k: string) => string | null): boolean {
  try {
    return !!ler(CHAVE_TOUR_VISTO);
  } catch {
    return true;
  }
}
