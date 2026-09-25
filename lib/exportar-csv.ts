// ============================================================
// EXPORTAÇÃO EM CSV
//
// POR QUE ESTA FUNÇÃO RECEBE AS LINHAS EM VEZ DE CONSULTAR O BANCO
//
// Se a exportação refizesse a consulta, ela e a tela seriam dois
// caminhos diferentes para o mesmo número, e uma hora divergiriam: foi
// assim que o faturamento chegou a mostrar R$ 95.109,04 quando o certo
// era R$ 55.527,07. Aqui o arquivo é feito das MESMAS linhas que estão
// na tela, já filtradas. Se o que você vê está certo, o que baixa está
// certo, por construção.
// ============================================================

export interface ColunaCsv<T> {
  /** Cabeçalho da coluna no arquivo. */
  titulo: string;
  /** Como tirar o valor de cada linha. Devolva string, número ou nulo. */
  valor: (linha: T) => string | number | null | undefined;
}

// O Excel em português espera ponto e vírgula, não vírgula, senão joga
// tudo numa coluna só. E espera vírgula decimal.
const SEPARADOR = ";";

function numeroBr(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function celula(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "number" ? numeroBr(valor) : String(valor);
  // Aspas duplas viram duas, e o campo inteiro é envolvido em aspas
  // sempre que contém separador, aspas ou quebra de linha. Sem isso, uma
  // descrição com ponto e vírgula parte a linha em duas colunas.
  if (/[";\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** Monta o texto do CSV. Separado do download para poder ser testado. */
export function montarCsv<T>(linhas: T[], colunas: ColunaCsv<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(SEPARADOR);
  const corpo = linhas.map((l) =>
    colunas.map((c) => celula(c.valor(l))).join(SEPARADOR)
  );
  return [cabecalho, ...corpo].join("\r\n");
}

function nomeSeguro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Baixa as linhas como CSV. O nome do arquivo carrega o período, porque
 * planilha exportada sem período no nome vira um monte de "financeiro.csv"
 * na pasta de downloads e ninguém sabe qual é qual.
 */
export function exportarCsv<T>(
  linhas: T[],
  colunas: ColunaCsv<T>[],
  nomeBase: string,
  rotuloPeriodo?: string
): void {
  const texto = montarCsv(linhas, colunas);

  // BOM na frente: sem ele o Excel no Windows abre acentuação quebrada,
  // e "Locação" vira "LocaÃ§Ã£o".
  const blob = new Blob([`﻿${texto}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const partes = [nomeSeguro(nomeBase)];
  if (rotuloPeriodo) partes.push(nomeSeguro(rotuloPeriodo));

  const link = document.createElement("a");
  link.href = url;
  link.download = `${partes.join("-")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
