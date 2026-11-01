"use client";

// Quadro para assinar com o dedo (ou caneta, ou mouse): eventos de ponteiro,
// fundo branco, traço escuro. "Limpar" apaga. `exportar()` devolve um PNG
// recortado em volta da assinatura e reduzido (até 600 x 240), bem abaixo do
// limite de 500 KB da pasta "assinaturas".

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Eraser } from "lucide-react";
import { assinaturaVazia, caixaDosTracos, escalaParaCaber, type Ponto } from "@/lib/assinatura-sessao";

export interface CanvasAssinaturaApi {
  exportar: () => Promise<Blob | null>;
  limpar: () => void;
  vazia: () => boolean;
}

const COR = "#1d2327";
const LARGURA_TRACO = 2.6;

function desenhar(ctx: CanvasRenderingContext2D, tracos: Ponto[][], escala = 1, dx = 0, dy = 0) {
  ctx.strokeStyle = COR;
  ctx.fillStyle = COR;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = LARGURA_TRACO * Math.max(escala, 0.6);
  for (const t of tracos) {
    if (!t.length) continue;
    const p0 = t[0];
    if (t.length === 1) {
      ctx.beginPath();
      ctx.arc((p0.x - dx) * escala, (p0.y - dy) * escala, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo((p0.x - dx) * escala, (p0.y - dy) * escala);
    for (let i = 1; i < t.length - 1; i++) {
      const a = t[i];
      const b = t[i + 1];
      ctx.quadraticCurveTo((a.x - dx) * escala, (a.y - dy) * escala, (((a.x + b.x) / 2) - dx) * escala, (((a.y + b.y) / 2) - dy) * escala);
    }
    const u = t[t.length - 1];
    ctx.lineTo((u.x - dx) * escala, (u.y - dy) * escala);
    ctx.stroke();
  }
}

export default function CanvasAssinatura({
  ref,
  rotulo,
  onMudou,
}: {
  ref?: Ref<CanvasAssinaturaApi>;
  rotulo: string;
  /** Avisa quando passa a ter (ou deixa de ter) assinatura. */
  onMudou?: (temAssinatura: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tracos = useRef<Ponto[][]>([]);
  const atual = useRef<Ponto[] | null>(null);
  const [tem, setTem] = useState(false);

  const redesenhar = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    desenhar(ctx, tracos.current);
  }, []);

  useEffect(() => {
    redesenhar();
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => redesenhar());
    ro.observe(c);
    return () => ro.disconnect();
  }, [redesenhar]);

  const avisar = useCallback(() => {
    const agora = !assinaturaVazia(tracos.current);
    setTem(agora);
    onMudou?.(agora);
  }, [onMudou]);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>): Ponto => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // aparelho sem captura: segue sem ela
    }
    atual.current = [ponto(e)];
    tracos.current = [...tracos.current, atual.current];
    redesenhar();
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!atual.current) return;
    e.preventDefault();
    const eventos = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const r = e.currentTarget.getBoundingClientRect();
    if (eventos.length) for (const ev of eventos) atual.current.push({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    else atual.current.push(ponto(e));
    redesenhar();
  }

  function terminar() {
    if (!atual.current) return;
    atual.current = null;
    avisar();
  }

  const limpar = useCallback(() => {
    tracos.current = [];
    atual.current = null;
    redesenhar();
    avisar();
  }, [redesenhar, avisar]);

  useImperativeHandle(
    ref,
    () => ({
      limpar,
      vazia: () => assinaturaVazia(tracos.current),
      exportar: () =>
        new Promise<Blob | null>((ok) => {
          const caixa = caixaDosTracos(tracos.current, 12);
          if (!caixa || assinaturaVazia(tracos.current)) return ok(null);
          // Desenha em 2x para ficar nítido e depois reduz para caber em 600 x 240.
          const escala = escalaParaCaber(caixa.w * 2, caixa.h * 2, 600, 240) * 2;
          const out = document.createElement("canvas");
          out.width = Math.max(1, Math.round(caixa.w * escala));
          out.height = Math.max(1, Math.round(caixa.h * escala));
          const ctx = out.getContext("2d");
          if (!ctx) return ok(null);
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, out.width, out.height);
          desenhar(ctx, tracos.current, escala, caixa.x, caixa.y);
          out.toBlob((b) => ok(b), "image/png");
        }),
    }),
    [limpar]
  );

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-300">
        <canvas
          ref={canvas}
          aria-label={rotulo}
          data-testid="canvas-assinatura"
          className="block h-52 w-full cursor-crosshair touch-none select-none"
          style={{ touchAction: "none" }}
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-neutral-300" />
        {!tem && <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-neutral-400">Assine aqui com o dedo</p>}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={limpar} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-neutral-100 px-4 text-xs font-semibold text-neutral-700 active:bg-neutral-200">
          <Eraser size={14} /> Limpar
        </button>
      </div>
    </div>
  );
}
