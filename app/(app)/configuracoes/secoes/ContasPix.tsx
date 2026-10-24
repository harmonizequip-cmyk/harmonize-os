"use client";

// Contas PIX que recebem pagamentos (24/10/2026). A padrão vem marcada nas
// telas de pagamento; a chave e o favorecido vão no resumo do WhatsApp. Conta
// que já recebeu pagamento não se apaga: desativa (some da escolha).

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import {
  CONTAS_PIX_PADRAO,
  TIPOS_CHAVE_PIX,
  chaveFormatada,
  ordenarContasPix,
  problemaContaPix,
  type ContaPix,
  type TipoChavePix,
} from "@/lib/contas-pix";
import { esquecerContasPixDoNavegador } from "@/lib/usar-contas-pix";
import { Bloco, CampoTexto, Chave } from "../ui";

interface Rascunho {
  id: string | null;
  rotulo: string;
  titular: string;
  tipo_chave: TipoChavePix;
  chave: string;
  ativa: boolean;
  padrao: boolean;
}

const VAZIO: Rascunho = { id: null, rotulo: "", titular: "", tipo_chave: "cpf", chave: "", ativa: true, padrao: false };
const botaoIcone =
  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-neutral-500 active:bg-neutral-200 disabled:opacity-30";

function Formulario({
  r,
  setR,
  salvando,
  onSalvar,
  onCancelar,
}: {
  r: Rascunho;
  setR: (r: Rascunho) => void;
  salvando: boolean;
  onSalvar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-brand-teal/40">
      <CampoTexto rotulo="Nome curto (aparece na escolha)" valor={r.rotulo} onChange={(v) => setR({ ...r, rotulo: v })} maxLength={40} placeholder="Ex.: Nubank PJ" />
      <CampoTexto rotulo="Titular (favorecido)" valor={r.titular} onChange={(v) => setR({ ...r, titular: v })} maxLength={120} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-600">Tipo da chave</span>
        <select
          value={r.tipo_chave}
          onChange={(e) => setR({ ...r, tipo_chave: e.target.value as TipoChavePix })}
          className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm"
        >
          {TIPOS_CHAVE_PIX.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <CampoTexto rotulo="Chave PIX" valor={r.chave} onChange={(v) => setR({ ...r, chave: v })} maxLength={120} tipo={r.tipo_chave === "email" ? "email" : "text"} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-700">Ativa (aparece para escolher)</span>
        <Chave ligada={r.ativa} onChange={(v) => setR({ ...r, ativa: v, padrao: v ? r.padrao : false })} rotulo="Ativa" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-700">Padrão (vem marcada)</span>
        <Chave ligada={r.padrao} onChange={(v) => setR({ ...r, padrao: v, ativa: v ? true : r.ativa })} rotulo="Padrão" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200">
          <X size={14} /> Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}

export default function ContasPix() {
  const supabase = createClient();
  const [contas, setContas] = useState<ContaPix[] | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("contas_pix")
      .select("id, codigo, rotulo, titular, tipo_chave, chave, ordem, ativa, padrao")
      .order("ordem");
    if (error) {
      // Tabela ainda não criada (SQL não rodado): mostra as de sempre, sem editar.
      setSemTabela(true);
      setContas(CONTAS_PIX_PADRAO);
      return;
    }
    setSemTabela(false);
    setContas(ordenarContasPix((data ?? []) as ContaPix[]));
    esquecerContasPixDoNavegador();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    if (!rascunho) return;
    const problema = problemaContaPix(rascunho);
    if (problema) return avisar(problema, "erro");
    setSalvando(true);
    const { error } = await supabase.rpc("salvar_conta_pix", {
      p_id: rascunho.id,
      p_rotulo: rascunho.rotulo.trim(),
      p_titular: rascunho.titular.trim(),
      p_tipo_chave: rascunho.tipo_chave,
      p_chave: rascunho.chave.trim(),
      p_ativa: rascunho.ativa,
      p_padrao: rascunho.padrao,
    });
    setSalvando(false);
    if (error) return avisar(error.message || "Não foi possível salvar.", "erro");
    avisar(rascunho.id ? "Conta atualizada." : "Conta criada.");
    setRascunho(null);
    await carregar();
  }

  async function apagar(c: ContaPix) {
    const ok = await confirmar({
      titulo: `Apagar a conta "${c.rotulo}"?`,
      texto: "Só dá para apagar conta que nunca recebeu pagamento. Se já recebeu, desative.",
      confirmar: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("excluir_conta_pix", { p_id: c.id });
    if (error) return avisar(error.message || "Não foi possível apagar.", "erro");
    avisar("Conta apagada.");
    await carregar();
  }

  async function mover(i: number, d: -1 | 1) {
    if (!contas) return;
    const a = contas[i];
    const b = contas[i + d];
    if (!a || !b) return;
    setSalvando(true);
    // Troca as posições (ordem = posição na lista, a partir de 1).
    const args = (c: ContaPix, ordem: number) => ({
      p_id: c.id,
      p_rotulo: c.rotulo,
      p_titular: c.titular,
      p_tipo_chave: c.tipo_chave,
      p_chave: c.chave,
      p_ativa: c.ativa,
      p_padrao: c.padrao,
      p_ordem: ordem,
    });
    const r1 = await supabase.rpc("salvar_conta_pix", args(a, i + d + 1));
    const r2 = r1.error ? r1 : await supabase.rpc("salvar_conta_pix", args(b, i + 1));
    setSalvando(false);
    if (r2.error) avisar(r2.error.message || "Não foi possível mudar a ordem.", "erro");
    await carregar();
  }

  if (!contas) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-neutral-500">
        <Loader2 size={16} className="animate-spin" /> Carregando contas...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {semTabela && (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Para editar as contas, rode antes o SQL da etapa 2b (contas PIX) no Supabase. Até lá valem as três de sempre, mostradas abaixo.
        </p>
      )}

      <Bloco titulo={`Contas PIX (${contas.length})`} dica="A padrão vem marcada ao receber um pagamento. O favorecido e a chave vão no resumo do WhatsApp.">
        <ul className="space-y-2">
          {contas.map((c, i) =>
            rascunho?.id && rascunho.id === c.id ? (
              <li key={c.codigo}>
                <Formulario r={rascunho} setR={setRascunho} salvando={salvando} onSalvar={salvar} onCancelar={() => setRascunho(null)} />
              </li>
            ) : (
              <li key={c.codigo} className={`flex items-center gap-2 rounded-2xl bg-neutral-50 py-2 pl-3 pr-1 ${c.ativa ? "" : "opacity-60"}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-neutral-900">{c.rotulo}</span>
                    {c.padrao && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                        <Star size={10} /> Padrão
                      </span>
                    )}
                    {!c.ativa && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">Desativada</span>}
                  </span>
                  <span className="block truncate text-xs text-neutral-600">{c.titular}</span>
                  <span className="block truncate text-[11px] text-neutral-500">
                    {TIPOS_CHAVE_PIX.find((t) => t.value === c.tipo_chave)?.label}: {chaveFormatada(c)}
                  </span>
                </span>
                {!semTabela && (
                  <span className="flex flex-shrink-0">
                    <span className="flex flex-col">
                      <button type="button" disabled={i === 0 || salvando} onClick={() => mover(i, -1)} className="flex h-6 w-8 items-center justify-center text-neutral-400 disabled:opacity-30" aria-label={`Subir ${c.rotulo}`}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" disabled={i === contas.length - 1 || salvando} onClick={() => mover(i, 1)} className="flex h-6 w-8 items-center justify-center text-neutral-400 disabled:opacity-30" aria-label={`Descer ${c.rotulo}`}>
                        <ArrowDown size={14} />
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => setRascunho({ id: c.id ?? null, rotulo: c.rotulo, titular: c.titular, tipo_chave: c.tipo_chave, chave: c.chave, ativa: c.ativa, padrao: c.padrao })}
                      className={botaoIcone}
                      aria-label={`Editar ${c.rotulo}`}
                    >
                      <Pencil size={15} />
                    </button>
                    {!c.padrao && (
                      <button type="button" onClick={() => apagar(c)} className={`${botaoIcone} active:bg-rose-50 active:text-rose-600`} aria-label={`Apagar ${c.rotulo}`}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </span>
                )}
              </li>
            )
          )}
        </ul>
        {!semTabela &&
          (rascunho && !rascunho.id ? (
            <div className="mt-3">
              <Formulario r={rascunho} setR={setRascunho} salvando={salvando} onSalvar={salvar} onCancelar={() => setRascunho(null)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRascunho({ ...VAZIO })}
              className="mt-3 flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-brand-teal ring-1 ring-neutral-200"
            >
              <Plus size={16} /> Nova conta
            </button>
          ))}
      </Bloco>
    </div>
  );
}
