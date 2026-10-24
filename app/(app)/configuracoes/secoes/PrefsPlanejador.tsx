"use client";

// Planejador: janela de "Retornos nos próximos N dias" e perfis de disparos
// do seletor de saldo. Planos já salvos não mudam.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { BarraSalvar, Bloco, Campo, numero } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.planejador;

interface PerfilTela {
  nome: string;
  disparos: string;
}

const paraTela = (perfis: Preferencias["planejador"]["perfis"]): PerfilTela[] =>
  perfis.map((p) => ({ nome: p.nome, disparos: String(p.disparos) }));

export default function PrefsPlanejador({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = { dias: String(preferencias.planejador.retornoDias), perfis: paraTela(preferencias.planejador.perfis) };
  const [dias, setDias] = useState(inicial.dias);
  const [perfis, setPerfis] = useState<PerfilTela[]>(inicial.perfis);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = dias !== inicial.dias || JSON.stringify(perfis) !== JSON.stringify(inicial.perfis);

  function tocou() {
    setErro(null);
    setSalvo(false);
  }
  function mudaPerfil(i: number, campo: keyof PerfilTela, v: string) {
    setPerfis((l) => l.map((p, j) => (j === i ? { ...p, [campo]: campo === "disparos" ? v.replace(/\D/g, "") : v } : p)));
    tocou();
  }
  function mover(i: number, d: number) {
    setPerfis((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    tocou();
  }

  async function salvar() {
    const n = Math.round(numero(dias));
    if (!(n >= 1 && n <= 90)) {
      setErro("Retornos: de 1 a 90 dias.");
      return;
    }
    if (perfis.length < 1) {
      setErro("Deixe ao menos um perfil.");
      return;
    }
    const limpos: { nome: string; disparos: number }[] = [];
    for (const p of perfis) {
      const nome = p.nome.trim();
      const d = Number(p.disparos);
      if (!nome) {
        setErro("Todo perfil precisa de um nome.");
        return;
      }
      if (!(d >= 100 && d <= 100000)) {
        setErro(`"${nome}": quantidade de 100 a 100.000 disparos.`);
        return;
      }
      limpos.push({ nome, disparos: d });
    }
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { planejador: { retornoDias: n, perfis: limpos } });
    setSalvando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  const botao = "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-100 disabled:opacity-30";

  return (
    <div className="space-y-4 pb-28">
      <Bloco titulo="Retornos" dica="Quantos dias à frente a lista de retornos do Planejador olha.">
        <div className="max-w-[12rem]">
          <Campo rotulo={`Retornos nos próximos N dias (padrão ${PADRAO.retornoDias})`} valor={dias} onChange={(v) => { setDias(v.replace(/\D/g, "")); tocou(); }} sufixo="dias" />
        </div>
      </Bloco>

      <Bloco titulo="Perfis de disparos" dica="Botões de saldo no planejamento (além do Nenhum). Planos já salvos não mudam.">
        <div className="space-y-2">
          {perfis.map((p, i) => (
            <div key={i} className="rounded-2xl bg-neutral-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Nome</span>
                  <input
                    value={p.nome}
                    maxLength={30}
                    onChange={(e) => mudaPerfil(i, "nome", e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900"
                  />
                </label>
                <Campo rotulo="Disparos" valor={p.disparos} onChange={(v) => mudaPerfil(i, "disparos", v)} />
              </div>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button type="button" className={botao} disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir perfil">
                  <ArrowUp size={16} />
                </button>
                <button type="button" className={botao} disabled={i === perfis.length - 1} onClick={() => mover(i, 1)} aria-label="Descer perfil">
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className={`${botao} text-rose-600`}
                  disabled={perfis.length <= 1}
                  onClick={() => {
                    setPerfis((l) => l.filter((_, j) => j !== i));
                    tocou();
                  }}
                  aria-label="Remover perfil"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPerfis((l) => [...l, { nome: "", disparos: "10000" }]);
              tocou();
            }}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-teal/10 px-3 text-xs font-bold text-brand-teal-dark"
          >
            <Plus size={14} /> Adicionar perfil
          </button>
          <button
            type="button"
            onClick={() => {
              setDias(String(PADRAO.retornoDias));
              setPerfis(paraTela(PADRAO.perfis));
              tocou();
            }}
            className="min-h-[44px] rounded-xl px-3 text-xs font-semibold text-brand-teal-dark ring-1 ring-neutral-200 active:bg-neutral-50"
          >
            Voltar ao padrão
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Padrão: Leve 8.000, Moderado 12.000 e Pesado 16.000. Retornos: {PADRAO.retornoDias} dias.</p>
      </Bloco>

      <BarraSalvar
        alterado={alterado}
        salvando={salvando}
        salvo={salvo}
        erro={erro}
        onSalvar={salvar}
        onDescartar={() => {
          setDias(inicial.dias);
          setPerfis(inicial.perfis);
          setErro(null);
        }}
      />
    </div>
  );
}
