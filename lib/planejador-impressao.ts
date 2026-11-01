// Documentos A4 do Planejador HIPRO: prontuário (interno, com profundidades
// e disparos) e ficha do paciente (áreas tratadas, recomendações e
// assinaturas). O mesmo HTML serve para a prévia na tela e para a impressão
// (Salvar como PDF).

import { urlImagemCorporal } from "./corpo-foto";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "./preferencias";
import { contaDaSessao, dataBr, planoDaSessao, situacaoSaldo, todasAreas, totalArea, type Area, type Plano } from "./planejador";
import { dataHoraCompleta, type PapelAssinatura } from "./assinatura-sessao";
import { textoTriagemImpressao, type TriagemRegistro } from "./triagem-hipro";

/** Assinatura colhida no celular, pronta para a impressão (imagem já baixada como data URL). */
export interface AssinaturaImpressa {
  papel: PapelAssinatura;
  nome: string;
  registro: string | null;
  assinadaEm: string;
  /** data:image/png;base64,... (vazio se não deu para baixar). */
  src: string;
  hash: string;
  /** Só na do paciente: triagem de contraindicações e termo aceito. */
  triagem?: TriagemRegistro | null;
}

/** Assinaturas de uma sessão e a conferência do conteúdo atual (hash do que está na tela agora). */
export interface AssinaturasDaFicha {
  lista: AssinaturaImpressa[];
  hashAtual: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Quadro com a inicial, para área manual do rosto sem foto (a modelo antiga saiu a pedido do dono). */
function quadroSemFoto(nome: string): string {
  const letra = esc((nome.trim()[0] ?? "?").toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6F7F6"/><stop offset="1" stop-color="#F1ECF8"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(#g)"/><text x="60" y="76" font-family="Arial,sans-serif" font-size="46" font-weight="700" text-anchor="middle" fill="#2E9A94">${letra}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Imagem da área: foto do protocolo (com as setas do movimento), foto da modelo corporal ou quadro com a inicial. */
export function imagemDaArea(a: Area, origem = ""): string {
  if (a.regiao === "corporal") return urlImagemCorporal(a.parte);
  if (!a.manual) return `${origem}/ferramentas/areas/${a.id === "submandibular" ? "papada" : a.id}.jpg`;
  if (/p[aá]lpebra|olho/i.test(a.nome)) return `${origem}/ferramentas/areas/olhos.jpg`;
  return quadroSemFoto(a.nome);
}

export const CSS_PRONTUARIO = `
.pront-page{font-family:Inter,'Segoe UI',Roboto,Arial,sans-serif;color:#1d2327;background:#fff}
.pront-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;margin-bottom:16px;border-bottom:2.5px solid #3DBFB8}
.pront-header img{height:46px}
.pront-header-right{text-align:right}
.pront-header-right h2{font-size:16px;font-weight:800;margin:0}
.pront-header-right p{font-size:10px;color:#6e7580;margin:2px 0 0;text-transform:uppercase;letter-spacing:.08em}
.pront-title{text-align:center;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#1F8F88;margin-bottom:16px}
.pront-section{margin-bottom:16px;break-inside:avoid}
.pront-section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#fff;background:linear-gradient(135deg,#3DBFB8,#7EC8E3);padding:6px 10px;border-radius:6px;margin-bottom:9px}
.pront-fields{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:12px;padding:0 4px}
.pront-field{display:flex;gap:6px;padding:4px 0;border-bottom:1px dotted #cfd6da}
.pront-field.full{grid-column:1/-1}
.pront-field .lbl{font-weight:700;color:#6e7580;white-space:nowrap}
.pront-field .val{font-weight:600}
.pront-table{width:100%;border-collapse:collapse;font-size:11.5px}
.pront-table th{background:#E8F7F6;color:#1F8F88;padding:7px 8px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:800;border:1px solid #d0e0de}
.pront-table td{padding:6px 8px;border:1px solid #e2eaed;vertical-align:middle}
.pront-area-cell{display:flex;align-items:center;gap:8px}
.pront-chk{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1.5px solid #9aa3a8;border-radius:4px;font-size:12px;font-weight:800;color:#1F8F88}
.pront-chk.on{background:#E8F7F6;border-color:#3DBFB8}
.pront-th{width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0}
.pront-table tr:nth-child(even) td{background:#fafbfc}
.pront-table .tot td{background:#1F8F88;color:#fff;font-weight:800}
.pront-summary{display:flex;justify-content:space-around;gap:10px;background:#F2FAFA;border:1px solid #d0e0de;border-radius:10px;padding:12px}
.pront-sum-item{text-align:center}
.pront-sum-item .n{font-size:20px;font-weight:800;color:#1F8F88;font-variant-numeric:tabular-nums}
.pront-sum-item .l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6e7580;font-weight:700;margin-top:3px}
.pront-obs{font-size:12px;line-height:1.6;padding:12px;background:#fafbfc;border:1px solid #e2eaed;border-radius:8px;min-height:56px;white-space:pre-wrap}
.pront-footer{margin-top:36px;padding-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:50px}
.pront-sign{text-align:center}
.pront-sign-line{border-top:1.5px solid #333;padding-top:6px;font-size:11px;color:#6e7580}
.pront-date-foot{text-align:center;font-size:9.5px;color:#b0b8c1;margin-top:20px;padding-top:12px;border-top:1px solid #e2eaed}
.pront-sign img{display:block;margin:0 auto 4px;max-width:100%;height:64px;object-fit:contain}
.pront-sign-meta{font-size:9.5px;color:#6e7580;margin-top:3px;line-height:1.4}
.pront-verif{grid-column:1/-1;text-align:center;font-size:9.5px;color:#6e7580;margin-top:-30px}
.pront-verif.alterada{color:#b4365c;font-weight:800}
.pront-triagem{font-size:11px;line-height:1.5;padding:9px 12px;border:1px solid #e2eaed;border-radius:8px;background:#fafbfc}
.pront-triagem.absoluta{border:2px solid #D9577E;background:#fff0f3;color:#b4365c}
.pront-triagem.relativa{border-color:#e9c46a;background:#fffaf0}
.pront-triagem p{margin:0 0 4px}
.pront-triagem p:last-child{margin:0}
.pront-alert{background:#fff0f3;border:2px solid #D9577E;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#b4365c;font-size:12px;font-weight:800}
`;

function cabecalho(origem: string, titulo: string): string {
  return `<div class="pront-header"><img src="${origem}/harmonize-logo-full.png" alt="Harmonize"><div class="pront-header-right"><h2>${titulo}</h2><p>HIPRO HOF · Ultrassom Microfocado</p></div></div>`;
}

function identificacao(p: Plano, titulo: string): string {
  const campo = (lbl: string, val: string, full = false) => `<div class="pront-field${full ? " full" : ""}"><span class="lbl">${lbl}:</span><span class="val">${esc(val)}</span></div>`;
  return `<div class="pront-section"><div class="pront-section-title">${titulo}</div><div class="pront-fields">
${campo("Paciente", p.paciente || "________________________")}
${campo("Data", dataBr(p.data))}
${campo("Retorno / próxima sessão", p.dataRetorno ? dataBr(p.dataRetorno) : "—")}
${campo("Profissional", p.profissional ? `${p.profissional}${p.profissionalRegistro ? ` · ${p.profissionalRegistro}` : ""}` : "________________________")}
${campo("Procedimento", p.procNome || "—")}
${campo("Valor do procedimento", p.valorProc || "—")}
${campo("Queixa principal", p.queixa || "—", true)}
</div></div>`;
}

/** Dados da empresa que entram nos documentos (Configurações > Empresa e contrato). */
type CfgDocumentos = Pick<Preferencias, "empresa">;

const rodape = (agora: Date, cfg: CfgDocumentos) => {
  const extra = cfg.empresa.rodapeDocumentos.trim();
  return `<div class="pront-date-foot">Documento gerado em ${agora.toLocaleString("pt-BR")}${extra ? ` · ${esc(extra)}` : ""}</div>`;
};

/** Números do pacote numa sessão: pacote, já usados, nesta sessão e o que fica para a próxima. */
function numerosDoPacote(p: Plano, n: number): string {
  const c = contaDaSessao(p, n);
  const item = (num: number, rotulo: string) => `<div class="pront-sum-item"><div class="n">${fmt(num)}</div><div class="l">${esc(rotulo)}</div></div>`;
  return [
    item(c.pacote, "Pacote"),
    c.antes > 0 ? item(c.antes, "Já usados antes") : "",
    item(c.nesta, `Nesta sessão (${n})`),
    c.ultima ? item(c.resta, "Restante") : item(Math.max(0, c.resta), `Fica para a Sessão ${n + 1}`),
  ].join("");
}

/**
 * Triagem e termo de consentimento (vêm com a assinatura do paciente), logo
 * acima das assinaturas. Sem triagem guardada (assinaturas antigas), nada.
 */
function blocoTriagem(ass?: AssinaturasDaFicha): string {
  const t = ass?.lista.find((x) => x.papel === "paciente")?.triagem;
  if (!t) return "";
  const termo = t.termo.aceito
    ? `<p><b>Termo de consentimento${t.termo.versao ? ` (versão ${esc(t.termo.versao)})` : ""}:</b> ${esc(t.termo.resumo || "aceito pelo paciente.")}</p>`
    : "";
  return `<div class="pront-section"><div class="pront-section-title">Triagem e consentimento</div><div class="pront-triagem ${t.situacao}"><p><b>Triagem:</b> ${esc(textoTriagemImpressao(t))}</p>${termo}</div></div>`;
}

/**
 * Linhas de assinatura. Sem assinatura colhida, a linha em branco de sempre;
 * com assinatura, a imagem, o nome, o registro e a data e hora, mais a
 * conferência do conteúdo (8 primeiros caracteres do sha256).
 */
function blocoAssinaturas(rotuloPaciente: string, ass?: AssinaturasDaFicha, sempre = true): string {
  const lista = ass?.lista ?? [];
  if (!sempre && !lista.length) return "";
  const um = (papel: PapelAssinatura, rotulo: string) => {
    const a = lista.find((x) => x.papel === papel);
    if (!a) return `<div class="pront-sign"><div class="pront-sign-line">${rotulo}</div></div>`;
    const meta = [esc(a.nome), a.registro ? esc(a.registro) : "", `Assinado em ${esc(dataHoraCompleta(a.assinadaEm))}`].filter(Boolean).join("<br>");
    return `<div class="pront-sign">${a.src ? `<img src="${a.src}" alt="Assinatura">` : ""}<div class="pront-sign-line">${rotulo}</div><div class="pront-sign-meta">${meta}</div></div>`;
  };
  let verif = "";
  if (lista.length) {
    const hash = lista[0].hash;
    const alterada = !!ass?.hashAtual && lista.some((x) => x.hash !== ass.hashAtual);
    verif = `<div class="pront-verif${alterada ? " alterada" : ""}">Conteúdo verificado: ${esc(hash.slice(0, 8))}${alterada ? " · ATENÇÃO: a sessão foi alterada depois de assinada" : ""}</div>`;
  }
  return `<div class="pront-footer">${um("profissional", "Assinatura do Profissional")}${um("paciente", rotuloPaciente)}${verif}</div>`;
}

/** Prontuário interno: tudo, linha por linha. */
export function htmlProntuario(p: Plano, origem = "", agora = new Date(), cfg: CfgDocumentos = DEFAULT_PREFERENCIAS, assinaturas?: AssinaturasDaFicha): string {
  const s = situacaoSaldo(p);
  let linhas = "";
  for (const a of todasAreas(p)) {
    if (!totalArea(p, a)) continue;
    const corporal = a.regiao === "corporal";
    let primeira = true;
    for (const r of p.DATA[a.id] ?? []) {
      const tem = a.bilateral ? (r.dispD ?? 0) + (r.dispE ?? 0) > 0 : (r.disp ?? 0) > 0;
      if (!tem) continue;
      const q = corporal ? Math.max(1, r.quad ?? 1) : 1;
      const nome = primeira ? `<div class="pront-area-cell"><img class="pront-th" src="${imagemDaArea(a, origem)}" alt=""><span>${esc(a.nome)}</span></div>` : "";
      const chk = `<td style="text-align:center"><span class="pront-chk${r.feito ? " on" : ""}">${r.feito ? "✓" : ""}</span></td>`;
      const lados = a.bilateral
        ? `<td>${r.dispD ?? 0}</td><td>${r.dispE ?? 0}</td>`
        : `<td colspan="2" style="text-align:center">${r.disp ?? 0}${corporal ? "/quad" : " (único)"}</td>`;
      const sub = (a.bilateral ? (r.dispD ?? 0) + (r.dispE ?? 0) : r.disp ?? 0) * q;
      linhas += `<tr>${chk}<td>${nome}</td><td>${r.prof} mm</td>${lados}<td>${corporal ? "×" + q : "—"}</td><td><strong>${fmt(sub)}</strong></td></tr>`;
      primeira = false;
    }
  }
  if (!linhas) linhas = `<tr><td colspan="7" style="text-align:center;color:#aaa;padding:14px">Nenhuma área preenchida</td></tr>`;
  return `<div class="pront-page">
${cabecalho(origem, "Ficha de Procedimento")}
<div class="pront-title">Prontuário de Atendimento</div>
${s.estado === "estourado" ? `<div class="pront-alert">ATENÇÃO: total distribuído (${fmt(s.total)}) excede o saldo contratado (${fmt(s.disponivel)}) em ${fmt(-s.resta)} disparos.</div>` : ""}
${identificacao(p, "Identificação do Paciente")}
<div class="pront-section"><div class="pront-section-title">Resumo de Disparos${p.sessoesTotal > 1 ? ` · Sessão ${p.sessaoAtual} de ${p.sessoesTotal}` : ""}</div><div class="pront-summary">
${
  p.sessoesTotal > 1
    ? numerosDoPacote(p, p.sessaoAtual)
    : `<div class="pront-sum-item"><div class="n">${fmt(s.saldo)}</div><div class="l">Saldo total</div></div>
<div class="pront-sum-item"><div class="n">${fmt(s.total)}</div><div class="l">Distribuído</div></div>
<div class="pront-sum-item"><div class="n">${fmt(s.resta)}</div><div class="l">Restante</div></div>`
}
</div></div>
<div class="pront-section"><div class="pront-section-title">Distribuição por Área</div><table class="pront-table">
<thead><tr><th style="width:34px;text-align:center">✓</th><th>Área</th><th>Profund.</th><th>Direito</th><th>Esquerdo</th><th>Quad.</th><th>Total</th></tr></thead>
<tbody>${linhas}<tr class="tot"><td colspan="6">TOTAL GERAL DE DISPAROS</td><td>${fmt(s.total)}</td></tr></tbody></table></div>
<div class="pront-section"><div class="pront-section-title">Observações Clínicas</div><div class="pront-obs">${esc(p.obs || "—")}</div></div>
${blocoTriagem(assinaturas)}
${blocoAssinaturas(`Assinatura do Paciente${p.sessoesTotal > 1 ? ` · Sessão ${p.sessaoAtual}` : ""}`, assinaturas, false)}
${rodape(agora, cfg)}
</div>`;
}

/**
 * Ficha do paciente: áreas (com o que foi feito), recomendações e assinaturas.
 * Com várias sessões (ou uma sessão pedida), vira a ficha daquela sessão: mostra o
 * pacote, o que foi distribuído nela e quanto fica para a próxima, com os disparos de
 * cada área, e é a folha que o paciente assina.
 */
export function htmlFichaPaciente(
  p: Plano,
  origem = "",
  agora = new Date(),
  sessao?: number,
  cfg: CfgDocumentos = DEFAULT_PREFERENCIAS,
  assinaturas?: AssinaturasDaFicha,
): string {
  const porSessao = p.sessoesTotal > 1 || sessao !== undefined;
  const n = sessao ?? p.sessaoAtual;
  let v = p;
  if (porSessao) {
    const daSessao = planoDaSessao(p, n);
    if (daSessao) {
      // A sessão fechada volta na data da seguinte; a aberta usa o retorno marcado.
      const proxima = p.sessoesAnteriores.find((x) => x.n === n + 1)?.data || (n < p.sessaoAtual ? p.data : "");
      v = { ...daSessao, dataRetorno: n === p.sessaoAtual ? p.dataRetorno : proxima };
    }
  }
  let linhas = "";
  for (const a of todasAreas(v)) {
    const tot = totalArea(v, a);
    if (!tot) continue;
    const feito = (v.DATA[a.id] ?? []).some((r) => r.feito && (a.bilateral ? (r.dispD ?? 0) + (r.dispE ?? 0) > 0 : (r.disp ?? 0) > 0));
    linhas += `<tr><td style="text-align:center"><span class="pront-chk${feito ? " on" : ""}">${feito ? "✓" : ""}</span></td><td><div class="pront-area-cell"><img class="pront-th" src="${imagemDaArea(a, origem)}" alt=""><span>${esc(a.nome)}</span></div></td>${porSessao ? `<td style="text-align:right"><strong>${fmt(tot)}</strong></td>` : ""}</tr>`;
  }
  const colunas = porSessao ? 3 : 2;
  if (!linhas) linhas = `<tr><td colspan="${colunas}" style="text-align:center;color:#aaa;padding:14px">Nenhuma área registrada</td></tr>`;
  const titulo = porSessao ? `Ficha do Paciente · Sessão ${n} de ${p.sessoesTotal}` : "Ficha do Paciente";
  const pacote = porSessao
    ? `<div class="pront-section"><div class="pront-section-title">Disparos do pacote</div><div class="pront-summary">${numerosDoPacote(p, n)}</div></div>`
    : "";
  return `<div class="pront-page">
${cabecalho(origem, "Comprovante de Atendimento")}
<div class="pront-title">${titulo}</div>
${identificacao(v, "Identificação")}
${pacote}
<div class="pront-section"><div class="pront-section-title">Áreas Tratadas</div><table class="pront-table"><thead><tr><th style="width:34px;text-align:center">✓</th><th>Área</th>${porSessao ? '<th style="text-align:right">Disparos</th>' : ""}</tr></thead><tbody>${linhas}</tbody></table></div>
<div class="pront-section"><div class="pront-section-title">Recomendações</div><div class="pront-obs">${esc(p.recomendacoes || "—")}</div></div>
${blocoTriagem(assinaturas)}
${blocoAssinaturas(`Assinatura do Paciente${porSessao ? ` · Sessão ${n}` : ""}`, assinaturas)}
${rodape(agora, cfg)}
</div>`;
}

/** Abre a janela de impressão (no celular: "Salvar como PDF"). Falso se o aparelho bloqueou. */
export function imprimir(corpo: string, titulo: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  escreverImpressao(win, corpo, titulo);
  return true;
}

/**
 * Impressão que precisa buscar algo antes (as imagens das assinaturas): abre a
 * janela já no toque (senão o aparelho bloqueia), mostra "Preparando..." e
 * escreve o documento quando ficar pronto. Falso se o aparelho bloqueou.
 */
export function imprimirDepois(montar: () => Promise<string>, titulo: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(titulo)}</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#555">Preparando o documento...</body></html>`);
  win.document.close();
  montar().then(
    (corpo) => escreverImpressao(win, corpo, titulo),
    () => {
      win.document.body.textContent = "Não consegui preparar o documento. Confira a internet e tente de novo.";
    }
  );
  return true;
}

function escreverImpressao(win: Window, corpo: string, titulo: string) {
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;padding:12px}${CSS_PRONTUARIO}</style></head><body>${corpo}</body></html>`);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 600);
}
