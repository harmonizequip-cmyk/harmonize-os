"use client";

// Gráficos do Dashboard, desenhados em SVG próprio:
//  1. Fluxo do período: resultado, margem, resultado acumulado (área) e
//     entradas/saídas por dia (barras para cima e para baixo). Arrastar o
//     dedo sobre o gráfico mostra o dia.
//  2. Para onde foi / De onde veio: categorias em barras, maiores primeiro.
// Contas em lib/grafico-fluxo.ts. Os lançamentos chegam já sem empréstimo
// e sem pagamento de fatura, os mesmos dos quadros de Entradas e Saídas.

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { montarFluxo, somarPorCategoria, type LancamentoGrafico, type PontoFluxo } from "@/lib/grafico-fluxo";

const TEAL = "#1F9E97";
const PINK = "#D9577E";

function compacto(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1000) return `${s}R$ ${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 10000 ? 0 : 1 })} mil`;
  return `${s}R$ ${Math.round(a).toLocaleString("pt-BR")}`;
}

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Caminho suave (monotônico) pelos pontos, sem passar do valor real. */
function caminhoSuave(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function AnelMargem({ margem }: { margem: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, margem));
  return (
    <div className="relative h-[76px] w-[76px] shrink-0" title="Quanto sobra de cada real que entrou">
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="anel-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3DBFB8" />
            <stop offset="55%" stopColor="#7EC8E3" />
            <stop offset="100%" stopColor="#B8A0D0" />
          </linearGradient>
        </defs>
        <circle cx="34" cy="34" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-neutral-100" />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="url(#anel-grad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          className="graf-anel"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-sm font-bold tabular-nums text-neutral-900">{margem < 0 ? "–" : `${Math.round(margem * 100)}%`}</span>
        <span className="mt-0.5 text-[8px] font-medium uppercase tracking-wide text-neutral-400">margem</span>
      </div>
    </div>
  );
}

function GraficoFluxo({ pontos }: { pontos: PontoFluxo[] }) {
  const [ref, W] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);
  const hA = 132; // área do acumulado
  const hB = 84; // barras
  const gap = 14;
  const padX = 6;
  const n = pontos.length;

  const geo = useMemo(() => {
    if (!W || n === 0) return null;
    const passo = n > 1 ? (W - padX * 2) / (n - 1) : 0;
    const x = (i: number) => (n > 1 ? padX + i * passo : W / 2);
    const acc = pontos.map((p) => p.acumulado);
    const min = Math.min(0, ...acc);
    const max = Math.max(0, ...acc);
    const span = max - min || 1;
    const yA = (v: number) => 10 + (1 - (v - min) / span) * (hA - 22);
    const linha = caminhoSuave(pontos.map((p, i) => [x(i), yA(p.acumulado)]));
    const area = `${linha} L${x(n - 1)},${hA} L${x(0)},${hA} Z`;
    const maxBar = Math.max(1, ...pontos.map((p) => Math.max(p.entradas, p.saidas)));
    const meio = hA + gap + hB / 2;
    const larg = Math.max(2, Math.min(14, (n > 1 ? passo : W) * 0.56));
    return { x, yA, linha, area, maxBar, meio, larg, zero: yA(0), min };
  }, [W, n, pontos]);

  function escolher(clientX: number) {
    const el = ref.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (clientX - r.left - padX) / Math.max(1, r.width - padX * 2)));
    setAtivo(Math.round(rel * (n - 1)));
  }

  const H = hA + gap + hB + 22;
  const p = ativo != null ? pontos[ativo] : null;
  const ultimo = pontos[n - 1];

  return (
    <div className="relative">
      <div className="mb-2 h-10">
        {p ? (
          <div className="flex items-baseline justify-between gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-[11px] text-white shadow-lg">
            <span className="font-semibold">{p.rotulo}</span>
            <span className="tabular-nums">
              <span className="text-[#7FE0D9]">▲ {formatCurrency(p.entradas)}</span>
              <span className="mx-1.5 text-white/30">|</span>
              <span className="text-[#F7A8BF]">▼ {formatCurrency(p.saidas)}</span>
            </span>
            <span className="font-semibold tabular-nums">{formatCurrency(p.acumulado)}</span>
          </div>
        ) : (
          <p className="pt-2 text-[11px] text-neutral-400">Arraste o dedo no gráfico para ver cada dia.</p>
        )}
      </div>
      <div
        ref={ref}
        className="relative touch-pan-y select-none"
        style={{ height: H }}
        onPointerDown={(e) => escolher(e.clientX)}
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons > 0 ? escolher(e.clientX) : null)}
        onPointerLeave={() => setAtivo(null)}
        onPointerUp={(e) => (e.pointerType !== "mouse" ? setTimeout(() => setAtivo(null), 1800) : null)}
      >
        {geo && (
          <svg width={W} height={H} className="overflow-visible">
            <defs>
              <linearGradient id="fluxo-linha" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3DBFB8" />
                <stop offset="55%" stopColor="#5AAFD6" />
                <stop offset="100%" stopColor="#9B7FC8" />
              </linearGradient>
              <linearGradient id="fluxo-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3DBFB8" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#B8A0D0" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Linhas de apoio discretas */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={0} x2={W} y1={10 + f * (hA - 22)} y2={10 + f * (hA - 22)} className="stroke-neutral-100" strokeWidth={1} />
            ))}
            {geo.min < 0 && (
              <line x1={0} x2={W} y1={geo.zero} y2={geo.zero} className="stroke-neutral-300" strokeDasharray="4 4" strokeWidth={1} />
            )}

            <path d={geo.area} fill="url(#fluxo-area)" className="graf-fade" />
            <path d={geo.linha} fill="none" stroke="url(#fluxo-linha)" strokeWidth={2.5} strokeLinecap="round" pathLength={1} className="graf-traco" />

            {/* Ponto final com o valor */}
            {ativo == null && ultimo && (
              <g className="graf-fade">
                <circle cx={geo.x(n - 1)} cy={geo.yA(ultimo.acumulado)} r={9} fill="#9B7FC8" opacity={0.18} className="graf-pulso" />
                <circle cx={geo.x(n - 1)} cy={geo.yA(ultimo.acumulado)} r={4.5} fill="#fff" stroke="#9B7FC8" strokeWidth={2.5} />
                <text
                  x={geo.x(n - 1) - 10}
                  y={geo.yA(ultimo.acumulado) - 12}
                  textAnchor="end"
                  className="fill-neutral-700 text-[11px] font-semibold tabular-nums"
                >
                  {compacto(ultimo.acumulado)}
                </text>
              </g>
            )}

            {/* Barras: entradas para cima, saídas para baixo */}
            <line x1={0} x2={W} y1={geo.meio} y2={geo.meio} className="stroke-neutral-200" strokeWidth={1} />
            {pontos.map((pt, i) => {
              const hE = (pt.entradas / geo.maxBar) * (hB / 2 - 4);
              const hS = (pt.saidas / geo.maxBar) * (hB / 2 - 4);
              const x0 = geo.x(i) - geo.larg / 2;
              const apagado = ativo != null && ativo !== i;
              return (
                <g key={pt.chave} opacity={apagado ? 0.35 : 1} style={{ transition: "opacity .15s" }}>
                  {hE > 0.5 && (
                    <rect x={x0} y={geo.meio - 1 - hE} width={geo.larg} height={hE} rx={Math.min(4, geo.larg / 2)} fill={TEAL} className="graf-sobe" style={{ animationDelay: `${Math.min(i * 12, 400)}ms` }} />
                  )}
                  {hS > 0.5 && (
                    <rect x={x0} y={geo.meio + 1} width={geo.larg} height={hS} rx={Math.min(4, geo.larg / 2)} fill={PINK} className="graf-desce" style={{ animationDelay: `${Math.min(i * 12, 400)}ms` }} />
                  )}
                </g>
              );
            })}

            {/* Linha do dedo */}
            {ativo != null && (
              <g pointerEvents="none">
                <line x1={geo.x(ativo)} x2={geo.x(ativo)} y1={4} y2={hA + gap + hB} className="stroke-neutral-400" strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={geo.x(ativo)} cy={geo.yA(pontos[ativo].acumulado)} r={5} fill="#fff" stroke="#5AAFD6" strokeWidth={2.5} />
              </g>
            )}

            {/* Eixo de datas: início, meio e fim */}
            {Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1])).map((i) => (
              <text
                key={i}
                x={geo.x(i)}
                y={H - 4}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-neutral-400 text-[10px]"
              >
                {pontos[i].rotulo}
              </text>
            ))}
          </svg>
        )}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full bg-gradient-to-r from-[#3DBFB8] to-[#9B7FC8]" /> Resultado acumulado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TEAL }} /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PINK }} /> Saídas
        </span>
      </div>
    </div>
  );
}

function Categorias({ transactions }: { transactions: LancamentoGrafico[] }) {
  const [tipo, setTipo] = useState<"saida" | "entrada">("saida");
  const fatias = useMemo(() => somarPorCategoria(transactions, tipo), [transactions, tipo]);
  const cor = tipo === "saida" ? PINK : TEAL;
  const maior = fatias[0];
  const total = fatias.reduce((s, f) => s + f.valor, 0);

  return (
    <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">{tipo === "saida" ? "Para onde foi o dinheiro" : "De onde veio o dinheiro"}</p>
        <div className="flex rounded-full bg-neutral-100 p-0.5 text-[11px] font-medium">
          {(["saida", "entrada"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-full px-3 py-1 transition ${tipo === t ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
            >
              {t === "saida" ? "Saídas" : "Entradas"}
            </button>
          ))}
        </div>
      </div>
      {fatias.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">Sem lançamentos no período.</p>
      ) : (
        <>
          <p className="mt-3 text-[13px] leading-snug text-neutral-600">
            <span className="font-semibold text-neutral-900">{maior.nome}</span> {tipo === "saida" ? "levou" : "trouxe"}{" "}
            <span className="font-semibold text-neutral-900">{Math.round(maior.pct * 100)}%</span> {tipo === "saida" ? "das saídas" : "das entradas"}.
          </p>
          <ul className="mt-4 space-y-3.5">
            {fatias.map((f, i) => (
              <li key={f.nome}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-neutral-700">{f.nome}</span>
                  <span className="shrink-0 tabular-nums text-neutral-900">
                    <span className="font-semibold">{formatCurrency(f.valor)}</span>
                    <span className="ml-1.5 text-neutral-400">{Math.round(f.pct * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="graf-barra h-full rounded-full"
                    style={{ width: `${Math.max(2, f.pct * 100)}%`, background: cor, opacity: f.nome === "Outras" ? 0.45 : 1, animationDelay: `${i * 70}ms` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-neutral-100 pt-3 text-right text-xs text-neutral-500">
            Total <span className="font-semibold tabular-nums text-neutral-900">{formatCurrency(total)}</span>
          </p>
        </>
      )}
    </div>
  );
}

export default function DashboardCharts({
  transactions,
  inicio,
  ate,
  rotuloPeriodo,
}: {
  transactions: LancamentoGrafico[];
  inicio: string;
  ate: string;
  rotuloPeriodo?: string;
}) {
  const pontos = useMemo(() => montarFluxo(transactions, inicio, ate), [transactions, inicio, ate]);
  // Totais de todo o período (os pontos param em hoje, mas a fatura do cartão pode ter data
  // mais adiante no mês e conta no mesmo resultado do Financeiro).
  const entradas = transactions.reduce((s, t) => s + (t.type === "entrada" ? Number(t.amount) || 0 : 0), 0);
  const saidas = transactions.reduce((s, t) => s + (t.type === "saida" ? Number(t.amount) || 0 : 0), 0);
  const resultado = entradas - saidas;
  const margem = entradas > 0 ? resultado / entradas : 0;

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur-xl md:col-span-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Resultado {rotuloPeriodo ? `· ${rotuloPeriodo}` : "do período"}
            </p>
            <p className={`mt-1 text-[28px] font-bold leading-tight tracking-tight tabular-nums ${resultado < 0 ? "text-brand-pink-dark" : "text-neutral-900"}`}>
              {formatCurrency(resultado)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium tabular-nums">
              <span className="rounded-full bg-[#1F9E97]/10 px-2 py-0.5 text-[#167a74]">▲ {formatCurrency(entradas)}</span>
              <span className="rounded-full bg-[#D9577E]/10 px-2 py-0.5 text-[#b03e63]">▼ {formatCurrency(saidas)}</span>
            </div>
          </div>
          {entradas > 0 && <AnelMargem margem={margem} />}
        </div>
        <div className="mt-4">
          {pontos.length === 0 || (entradas === 0 && saidas === 0) ? (
            <p className="py-12 text-center text-sm text-neutral-400">Sem lançamentos no período.</p>
          ) : (
            <GraficoFluxo pontos={pontos} />
          )}
        </div>
      </div>
      <div className="md:col-span-2">
        <Categorias transactions={transactions} />
      </div>
    </div>
  );
}
