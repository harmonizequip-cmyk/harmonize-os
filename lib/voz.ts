// "Anotar por voz": transforma uma frase falada numa tarefa. Exemplo:
// "tarefa cobrar a Ylka amanhã" vira título "Cobrar a Ylka", data de amanhã
// e cliente Ylka. A pessoa sempre confere antes de salvar, então aqui vale
// acertar o caso comum e, na dúvida, deixar em branco em vez de chutar.
import { somarDias } from "./period";

export interface ClienteParaVoz {
  id: string;
  name: string;
}

export interface FalaInterpretada {
  titulo: string;
  data: string;
  clienteId: string | null;
  // Quando o nome dito bate com mais de um cadastro, a tela oferece estes.
  candidatos: ClienteParaVoz[];
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30,
};

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// getUTCDay: 0 = domingo.
const DIAS_DA_SEMANA: [RegExp, number][] = [
  [/\b(?:no |na |nesse |nessa |proximo |proxima )?domingo\b/, 0],
  [/\b(?:na |nessa |proxima )?segunda(?:-feira| feira)?\b/, 1],
  [/\b(?:na |nessa |proxima )?terca(?:-feira| feira)?\b/, 2],
  [/\b(?:na |nessa |proxima )?quarta(?:-feira| feira)?\b/, 3],
  [/\b(?:na |nessa |proxima )?quinta(?:-feira| feira)?\b/, 4],
  [/\b(?:na |nessa |proxima )?sexta(?:-feira| feira)?\b/, 5],
  [/\b(?:no |nesse |proximo )?sabado\b/, 6],
];

function diaDaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function dataValida(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d.toISOString().slice(0, 10);
}

/** Procura a data na frase (já sem acento). Volta a data e o trecho achado. */
function acharData(t: string, hoje: string): { data: string; trecho: [number, number] } | null {
  const [ano, mes] = hoje.split("-").map(Number);
  const tentativas: { re: RegExp; calc: (m: RegExpMatchArray) => string | null }[] = [
    { re: /\b(?:para |pra )?depois de amanha\b/, calc: () => somarDias(hoje, 2) },
    { re: /\b(?:para |pra )?amanha\b/, calc: () => somarDias(hoje, 1) },
    { re: /\b(?:para |pra )?hoje\b/, calc: () => hoje },
    {
      re: /\b(?:daqui a|daqui|em) (\d+|[a-z]+) dias?\b/,
      calc: (m) => {
        const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]];
        return n ? somarDias(hoje, n) : null;
      },
    },
    { re: /\b(?:na |para a |pra )?(?:semana que vem|proxima semana)\b/, calc: () => somarDias(hoje, 7) },
    {
      re: /\b(?:no |para o |pra )?dia (\d{1,2})(?:\/| de )(\d{1,2}|[a-z]+)\b/,
      calc: (m) => {
        const mm = /^\d+$/.test(m[2]) ? Number(m[2]) : MESES[m[2]];
        if (!mm) return null;
        const d = dataValida(ano, mm, Number(m[1]));
        return d && d < hoje ? dataValida(ano + 1, mm, Number(m[1])) : d;
      },
    },
    {
      re: /\b(\d{1,2})\/(\d{1,2})\b/,
      calc: (m) => {
        const d = dataValida(ano, Number(m[2]), Number(m[1]));
        return d && d < hoje ? dataValida(ano + 1, Number(m[2]), Number(m[1])) : d;
      },
    },
    {
      re: /\b(?:no |para o |pra )?dia (\d{1,2})\b/,
      calc: (m) => {
        const dia = Number(m[1]);
        const d = dataValida(ano, mes, dia);
        if (d && d >= hoje) return d;
        return mes === 12 ? dataValida(ano + 1, 1, dia) : dataValida(ano, mes + 1, dia);
      },
    },
  ];
  for (const { re, calc } of tentativas) {
    const m = t.match(re);
    if (m && m.index !== undefined) {
      const data = calc(m);
      if (data) return { data, trecho: [m.index, m.index + m[0].length] };
    }
  }
  for (const [re, alvo] of DIAS_DA_SEMANA) {
    const m = t.match(re);
    if (m && m.index !== undefined) {
      // Sempre o próximo: "sexta" dito numa sexta é a da semana que vem.
      const falta = ((alvo - diaDaSemana(hoje) + 7) % 7) || 7;
      return { data: somarDias(hoje, falta), trecho: [m.index, m.index + m[0].length] };
    }
  }
  return null;
}

const PALAVRAS_FRACAS = new Set(["da", "de", "do", "das", "dos", "e", "dr", "dra"]);

function palavras(s: string): string[] {
  return semAcento(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function acharCliente(t: string, clientes: ClienteParaVoz[]): { id: string | null; candidatos: ClienteParaVoz[] } {
  const ditas = new Set(palavras(t));
  let melhor = 0;
  let achados: ClienteParaVoz[] = [];
  for (const c of clientes) {
    const nome = palavras(c.name).filter((p) => p.length >= 3 && !PALAVRAS_FRACAS.has(p));
    // O primeiro nome precisa ter sido dito; cada sobrenome dito soma ponto.
    if (nome.length === 0 || !ditas.has(nome[0])) continue;
    const pontos = nome.filter((p) => ditas.has(p)).length;
    if (pontos > melhor) {
      melhor = pontos;
      achados = [c];
    } else if (pontos === melhor) {
      achados.push(c);
    }
  }
  if (achados.length === 1) return { id: achados[0].id, candidatos: [] };
  return { id: null, candidatos: achados.slice(0, 5) };
}

export function interpretarFala(fala: string, clientes: ClienteParaVoz[], hoje: string): FalaInterpretada {
  let texto = fala.trim().replace(/\s+/g, " ");
  // O normalize de semAcento mantém o tamanho do texto em português comum
  // (letra + acento combinado vira só a letra), então os índices batem.
  const comparavel = semAcento(texto.normalize("NFC"));
  texto = texto.normalize("NFC");

  let data = hoje;
  const achada = comparavel.length === texto.length ? acharData(comparavel, hoje) : null;
  if (achada) {
    data = achada.data;
    texto = (texto.slice(0, achada.trecho[0]) + " " + texto.slice(achada.trecho[1])).replace(/\s+/g, " ").trim();
  }

  texto = texto
    .replace(/^(?:nova tarefa|tarefa|lembrete|lembrar de|lembrar|anotar|anota)[\s,:.-]*/i, "")
    .replace(/[\s,.-]+$/, "")
    .trim();
  const titulo = texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "";

  const { id, candidatos } = acharCliente(titulo, clientes);
  return { titulo, data, clienteId: id, candidatos };
}
