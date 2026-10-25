"use client";

// Mensagens de WhatsApp (etapa 3a): um texto por modelo, com as variáveis
// entre chaves, prévia com dados de exemplo e "Restaurar padrão". Regras e
// textos padrão em lib/mensagens-modelos.ts. Cobrança, taxa de reserva e
// avisos do celular continuam fixos (a função alertas tem cópia deles).

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Plus, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import type { Preferencias } from "@/lib/preferencias";
import {
  IDS_MODELOS,
  MODELOS,
  MODELOS_PADRAO,
  TAMANHO_MAXIMO_MENSAGEM,
  VARIAVEIS,
  previaDoModelo,
  problemasDoModelo,
  type ModeloId,
  type ModelosMensagem,
} from "@/lib/mensagens-modelos";
import { BarraSalvar } from "../ui";

const GRUPOS = ["Agenda", "Tarefas e relacionamento", "Imagens e recibo"] as const;

/** Texto como vai para o banco: sem espaço nas pontas e vazio = padrão. */
function normal(id: ModeloId, t: string): string {
  const x = t.replace(/\r\n?/g, "\n").trim();
  return x || MODELOS_PADRAO[id];
}

export default function PrefsMensagens({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => ({ ...preferencias.mensagens }), [preferencias]);
  const [m, setM] = useState<ModelosMensagem>(inicial);
  const [aberto, setAberto] = useState<ModeloId | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campos = useRef<Partial<Record<ModeloId, HTMLTextAreaElement | null>>>({});

  const alterado = IDS_MODELOS.some((id) => normal(id, m[id]) !== normal(id, inicial[id]));
  const comProblema = IDS_MODELOS.filter((id) => problemasDoModelo(id, m[id]).length > 0);
  const personalizadas = IDS_MODELOS.filter((id) => normal(id, inicial[id]) !== MODELOS_PADRAO[id]).length;

  function muda(id: ModeloId, texto: string) {
    setM((x) => ({ ...x, [id]: texto }));
    setErro(null);
    setSalvo(false);
  }

  function inserir(id: ModeloId, variavel: string) {
    const el = campos.current[id];
    const atual = m[id];
    const token = `{${variavel}}`;
    const ini = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    const novo = (atual.slice(0, ini) + token + atual.slice(fim)).slice(0, TAMANHO_MAXIMO_MENSAGEM);
    muda(id, novo);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = Math.min(ini + token.length, novo.length);
      el.setSelectionRange(pos, pos);
    });
  }

  async function salvar() {
    if (comProblema.length) {
      setAberto(comProblema[0]);
      return setErro(`Corrija "${MODELOS[comProblema[0]].titulo}" antes de salvar.`);
    }
    const mensagens = Object.fromEntries(IDS_MODELOS.map((id) => [id, normal(id, m[id])])) as ModelosMensagem;
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { mensagens });
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    esquecerPreferenciasDoNavegador();
    setM(r.preferencias.mensagens);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <section className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
        <p className="text-sm leading-relaxed text-neutral-700">
          Os textos que o app prepara para o WhatsApp. Você sempre revisa no WhatsApp antes de enviar.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          As palavras entre chaves, como <span className="font-mono text-neutral-700">{"{saudacao}"}</span>, são trocadas pelos dados
          da cliente. Se uma mensagem ficar com variável errada, ela volta ao texto padrão até ser corrigida. Cobrança, taxa de
          reserva e avisos do celular não mudam por aqui.
        </p>
        <p className="mt-2 text-xs font-medium text-neutral-600">
          {personalizadas === 0 ? "Todas com o texto padrão." : `${personalizadas} de ${IDS_MODELOS.length} personalizadas.`}
        </p>
      </section>

      {GRUPOS.map((grupo) => (
        <section key={grupo}>
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">{grupo}</p>
          <ul className="space-y-2">
            {IDS_MODELOS.filter((id) => MODELOS[id].grupo === grupo).map((id) => {
              const def = MODELOS[id];
              const texto = m[id];
              const problemas = problemasDoModelo(id, texto);
              const personalizada = normal(id, texto) !== MODELOS_PADRAO[id];
              const estaAberto = aberto === id;
              return (
                <li key={id} className="overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200/80">
                  <button
                    type="button"
                    onClick={() => setAberto(estaAberto ? null : id)}
                    aria-expanded={estaAberto}
                    className="flex min-h-14 w-full items-center gap-2 p-4 text-left active:bg-neutral-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-neutral-900">{def.titulo}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-neutral-500">{def.quando}</span>
                    </span>
                    {problemas.length > 0 ? (
                      <span className="flex-shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-600">Com erro</span>
                    ) : personalizada ? (
                      <span className="flex-shrink-0 rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10.5px] font-bold text-brand-teal-dark">
                        Personalizada
                      </span>
                    ) : null}
                    <ChevronDown size={18} className={`flex-shrink-0 text-neutral-400 transition-transform ${estaAberto ? "rotate-180" : ""}`} />
                  </button>

                  {estaAberto && (
                    <div className="border-t border-neutral-100 p-4 pt-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-neutral-600">Texto</span>
                        <textarea
                          ref={(el) => {
                            campos.current[id] = el;
                          }}
                          value={texto}
                          maxLength={TAMANHO_MAXIMO_MENSAGEM}
                          onChange={(e) => muda(id, e.target.value)}
                          rows={Math.min(12, Math.max(4, texto.split("\n").length + 2))}
                          className="w-full min-w-0 resize-y rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-neutral-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                        />
                      </label>
                      <p className="mt-0.5 text-right text-[10.5px] tabular-nums text-neutral-400">
                        {texto.length}/{TAMANHO_MAXIMO_MENSAGEM}
                      </p>

                      {def.variaveis.length > 0 && (
                        <div className="mt-1">
                          <p className="mb-1 text-xs font-medium text-neutral-600">Inserir no cursor</p>
                          <div className="flex flex-wrap gap-1.5">
                            {def.variaveis.map((v) => (
                              <button
                                key={v}
                                type="button"
                                title={VARIAVEIS[v].dica}
                                // Mantém o cursor no texto ao tocar no botão.
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => inserir(id, v)}
                                className="flex min-h-10 items-center gap-1 rounded-xl bg-neutral-50 px-3 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200 active:bg-neutral-100"
                              >
                                <Plus size={13} className="text-brand-teal-dark" />
                                {VARIAVEIS[v].rotulo}
                              </button>
                            ))}
                          </div>
                          <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-neutral-500">
                            {def.variaveis.map((v) => (
                              <li key={v}>
                                <span className="font-mono text-neutral-700">{`{${v}}`}</span> {VARIAVEIS[v].dica}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {problemas.length > 0 && (
                        <div className="mt-3 flex gap-2 rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">
                          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-semibold">Enquanto isso, sai o texto padrão:</p>
                            <ul className="mt-0.5 list-disc pl-4">
                              {problemas.map((p) => (
                                <li key={p}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium text-neutral-600">Prévia (dados de exemplo)</p>
                        <div className="rounded-2xl bg-[#e7f7ee] p-3">
                          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-800">{previaDoModelo(id, texto)}</p>
                        </div>
                      </div>

                      {personalizada && (
                        <button
                          type="button"
                          onClick={() => muda(id, MODELOS_PADRAO[id])}
                          className="mt-3 flex min-h-11 items-center gap-1.5 text-xs font-medium text-neutral-500 active:text-neutral-800"
                        >
                          <RotateCcw size={13} /> Restaurar padrão
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setM(inicial)} />
    </div>
  );
}
