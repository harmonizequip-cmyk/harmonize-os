"use client";

// Janelas de confirmação, pedido de texto e avisos rápidos (toast) com a cara
// do app, no lugar do confirm/alert/prompt do navegador (que no Android
// aparecem cinzas, com o endereço do site no topo).
//
// Uso, de qualquer componente do navegador:
//   if (!(await confirmar({ titulo: "Apagar a tag?", perigo: true }))) return;
//   avisar("Salvo.");                       // toast verde
//   avisar("Não consegui salvar.", "erro"); // toast vermelho
//   const motivo = await pedirTexto({ titulo: "Motivo do cancelamento" });
//
// O DialogosHost fica no app/layout.tsx. Sem ele montado (ex.: teste), cai no
// diálogo do navegador.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export interface OpcoesConfirmar {
  titulo: string;
  texto?: string;
  /** Rótulo do botão de confirmar (padrão "Confirmar"). */
  confirmar?: string;
  /** Rótulo do botão de cancelar (padrão "Cancelar"). */
  cancelar?: string;
  /** Botão vermelho, para apagar/cancelar algo. */
  perigo?: boolean;
}

export interface OpcoesTexto {
  titulo: string;
  texto?: string;
  valorInicial?: string;
  placeholder?: string;
  confirmar?: string;
  /** Mostra o texto só para copiar (campo selecionado, sem cancelar). */
  soCopiar?: boolean;
}

type TipoAviso = "ok" | "erro" | "info";

type Pedido =
  | { tipo: "confirmar"; opcoes: OpcoesConfirmar; resolver: (v: boolean) => void }
  | { tipo: "texto"; opcoes: OpcoesTexto; resolver: (v: string | null) => void };

interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}

let abrirPedido: ((p: Pedido) => void) | null = null;
let mostrarAviso: ((a: Omit<Aviso, "id">) => void) | null = null;

/** Pergunta sim/não. Devolve true só se a pessoa confirmar. */
export function confirmar(opcoes: OpcoesConfirmar | string): Promise<boolean> {
  const o = typeof opcoes === "string" ? { titulo: opcoes } : opcoes;
  if (!abrirPedido) return Promise.resolve(window.confirm([o.titulo, o.texto].filter(Boolean).join("\n\n")));
  return new Promise((resolver) => abrirPedido!({ tipo: "confirmar", opcoes: o, resolver }));
}

/** Pede um texto. Devolve null se a pessoa cancelar. */
export function pedirTexto(opcoes: OpcoesTexto | string): Promise<string | null> {
  const o = typeof opcoes === "string" ? { titulo: opcoes } : opcoes;
  if (!abrirPedido) return Promise.resolve(window.prompt(o.titulo, o.valorInicial ?? ""));
  return new Promise((resolver) => abrirPedido!({ tipo: "texto", opcoes: o, resolver }));
}

/** Aviso rápido no pé da tela, some sozinho. */
export function avisar(texto: string, tipo: TipoAviso = "ok") {
  if (!mostrarAviso) {
    window.alert(texto);
    return;
  }
  mostrarAviso({ texto, tipo });
}

export default function DialogosHost() {
  const [fila, setFila] = useState<Pedido[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [montado, setMontado] = useState(false);
  const proximo = useRef(1);

  useEffect(() => {
    setMontado(true);
    abrirPedido = (p) => setFila((f) => [...f, p]);
    mostrarAviso = (a) => {
      const id = proximo.current++;
      setAvisos((l) => [...l.slice(-2), { ...a, id }]);
      setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== id)), a.tipo === "erro" ? 6000 : 3200);
    };
    return () => {
      abrirPedido = null;
      mostrarAviso = null;
    };
  }, []);

  if (!montado) return null;
  const atual = fila[0];

  function fechar() {
    setFila((f) => f.slice(1));
  }

  return createPortal(
    <>
      {atual?.tipo === "confirmar" && (
        <JanelaConfirmar
          key={fila.length}
          opcoes={atual.opcoes}
          onFim={(v) => {
            atual.resolver(v);
            fechar();
          }}
        />
      )}
      {atual?.tipo === "texto" && (
        <JanelaTexto
          key={fila.length}
          opcoes={atual.opcoes}
          onFim={(v) => {
            atual.resolver(v);
            fechar();
          }}
        />
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-8">
        {avisos.map((a) => (
          <div
            key={a.id}
            role="status"
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl animate-[aviso-entra_.25s_ease-out] ${
              a.tipo === "erro" ? "bg-rose-600" : a.tipo === "info" ? "bg-neutral-900/95" : "bg-emerald-600"
            }`}
            onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))}
          >
            {a.tipo === "erro" ? (
              <XCircle size={17} className="mt-px flex-shrink-0" />
            ) : a.tipo === "info" ? (
              <Info size={17} className="mt-px flex-shrink-0" />
            ) : (
              <CheckCircle2 size={17} className="mt-px flex-shrink-0" />
            )}
            <span className="whitespace-pre-line">{a.texto}</span>
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

function Moldura({ children, onFora }: { children: React.ReactNode; onFora: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFora();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFora]);
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={onFora}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl animate-[aviso-entra_.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function JanelaConfirmar({ opcoes, onFim }: { opcoes: OpcoesConfirmar; onFim: (v: boolean) => void }) {
  return (
    <Moldura onFora={() => onFim(false)}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${
            opcoes.perigo ? "bg-rose-50 text-rose-600" : "bg-brand-teal/10 text-brand-teal-dark"
          }`}
        >
          {opcoes.perigo ? <AlertTriangle size={19} /> : <Info size={19} />}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-base font-bold leading-snug text-neutral-900">{opcoes.titulo}</p>
          {opcoes.texto && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{opcoes.texto}</p>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onFim(false)}
          className="rounded-2xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-700 active:bg-neutral-200"
        >
          {opcoes.cancelar ?? "Cancelar"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => onFim(true)}
          className={`rounded-2xl py-3 text-sm font-bold text-white ${opcoes.perigo ? "bg-rose-600 active:bg-rose-700" : "bg-brand-gradient shadow-glow-teal"}`}
        >
          {opcoes.confirmar ?? "Confirmar"}
        </button>
      </div>
    </Moldura>
  );
}

function JanelaTexto({ opcoes, onFim }: { opcoes: OpcoesTexto; onFim: (v: string | null) => void }) {
  const [valor, setValor] = useState(opcoes.valorInicial ?? "");
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    campo.current?.focus();
    if (opcoes.soCopiar) campo.current?.select();
  }, [opcoes.soCopiar]);
  return (
    <Moldura onFora={() => onFim(null)}>
      <p className="text-base font-bold text-neutral-900">{opcoes.titulo}</p>
      {opcoes.texto && <p className="mt-1 text-sm text-neutral-600">{opcoes.texto}</p>}
      <textarea
        ref={campo}
        value={valor}
        readOnly={opcoes.soCopiar}
        onChange={(e) => setValor(e.target.value)}
        placeholder={opcoes.placeholder}
        rows={opcoes.soCopiar ? 3 : 2}
        className="mt-3 w-full resize-none rounded-2xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
      />
      <div className={`mt-4 grid gap-2 ${opcoes.soCopiar ? "grid-cols-1" : "grid-cols-2"}`}>
        {!opcoes.soCopiar && (
          <button type="button" onClick={() => onFim(null)} className="rounded-2xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-700">
            Cancelar
          </button>
        )}
        <button type="button" onClick={() => onFim(valor)} className="rounded-2xl bg-brand-gradient py-3 text-sm font-bold text-white shadow-glow-teal">
          {opcoes.confirmar ?? (opcoes.soCopiar ? "Fechar" : "OK")}
        </button>
      </div>
    </Moldura>
  );
}
