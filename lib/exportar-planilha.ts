// ============================================================
// EXPORTAR PLANILHA (.xlsx com o layout da Harmonize)
//
// Substitui o CSV em todas as telas. Monta o arquivo com as linhas que
// estão na tela (lib/planilha-xlsx.ts) e tenta abrir o Compartilhar do
// celular, onde basta escolher Drive. Quando o aparelho não aceita
// compartilhar esse tipo de arquivo, baixa e avisa como mandar ao Drive.
// ============================================================

import { montarXlsx, type DadosPlanilha } from "@/lib/planilha-xlsx";

export type { ColunaPlanilha, ResumoPlanilha } from "@/lib/planilha-xlsx";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function nomeArquivoPlanilha(nomeBase: string, rotuloPeriodo?: string): string {
  const seguro = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  const partes = ["harmonize", seguro(nomeBase)];
  if (rotuloPeriodo) partes.push(seguro(rotuloPeriodo));
  return `${partes.filter(Boolean).join("-")}.xlsx`;
}

function aviso(texto: string) {
  const el = document.createElement("div");
  el.textContent = texto;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;left:16px;right:16px;bottom:88px;z-index:9999;margin:0 auto;max-width:420px;padding:12px 14px;border-radius:14px;background:#1F7A75;color:#fff;font-size:13px;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.2)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 7000);
}

export async function exportarPlanilha<T>(dados: DadosPlanilha<T>, nomeBase: string, rotuloPeriodo?: string): Promise<void> {
  const bytes = montarXlsx(dados);
  const nome = nomeArquivoPlanilha(nomeBase, rotuloPeriodo);
  const arquivo = new File([bytes as BlobPart], nome, { type: MIME });

  if (typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      // Outro erro: cai no download.
    }
  }

  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  aviso("Planilha baixada. Para guardar no Drive: abra Arquivos > Downloads, segure o arquivo e toque em Compartilhar > Drive.");
}

/** Mesmo jeito de chamar do antigo exportarCsv, com o título da tela. */
export function exportarTabela<T>(
  linhas: T[],
  colunas: DadosPlanilha<T>["colunas"],
  nomeBase: string,
  rotuloPeriodo: string | undefined,
  opcoes: { titulo: string; resumo?: DadosPlanilha<T>["resumo"]; graficos?: DadosPlanilha<T>["graficos"] }
): Promise<void> {
  return exportarPlanilha(
    { titulo: opcoes.titulo, periodo: rotuloPeriodo, linhas, colunas, resumo: opcoes.resumo, graficos: opcoes.graficos },
    nomeBase,
    rotuloPeriodo
  );
}
