"use client";

// Listas: origens do lead, devedores sugeridos de empréstimo e link da Academy.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Plus, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { codigoDeOrigem, DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { confirmar } from "@/components/Dialogos";
import { BarraSalvar, Bloco } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.listas;
const botaoIcone =
  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-100 disabled:opacity-30";
const entrada =
  "h-11 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20";
const botaoVoltar = "mt-3 flex min-h-11 items-center gap-1.5 text-xs font-medium text-neutral-500 active:text-neutral-800";

type Origem = { valor: string; rotulo: string };

export default function PrefsListas({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(
    () => ({
      origens: preferencias.listas.origens.map((o) => ({ ...o })),
      devedores: [...preferencias.listas.devedores],
      link: preferencias.listas.linkAcademy,
    }),
    [preferencias],
  );
  const [origens, setOrigens] = useState<Origem[]>(inicial.origens);
  const [devedores, setDevedores] = useState<string[]>(inicial.devedores);
  const [link, setLink] = useState(inicial.link);
  const [novaOrigem, setNovaOrigem] = useState("");
  const [novoDevedor, setNovoDevedor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify({ origens, devedores, link }) !== JSON.stringify(inicial);

  function mexeu() {
    setErro(null);
    setSalvo(false);
  }

  function adicionarOrigem() {
    const rotulo = novaOrigem.trim().slice(0, 40);
    if (!rotulo) return;
    const valor = codigoDeOrigem(rotulo);
    if (!valor) return setErro("Use letras ou números no nome da origem.");
    if (origens.some((o) => o.valor === valor)) return setErro("Já existe uma origem com esse nome.");
    setOrigens((l) => [...l, { valor, rotulo }]);
    setNovaOrigem("");
    mexeu();
  }

  function mover(i: number, delta: number) {
    setOrigens((l) => {
      const j = i + delta;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    mexeu();
  }

  async function removerOrigem(i: number) {
    const o = origens[i];
    const ok = await confirmar({
      titulo: `Tirar "${o.rotulo}" da lista?`,
      texto: "Clientes que já têm essa origem continuam com ela.",
      confirmar: "Tirar",
      perigo: true,
    });
    if (!ok) return;
    setOrigens((l) => l.filter((_, k) => k !== i));
    mexeu();
  }

  function adicionarDevedor() {
    const nome = novoDevedor.trim().toUpperCase().slice(0, 60);
    if (!nome) return;
    if (devedores.includes(nome)) return setErro("Esse devedor já está na lista.");
    setDevedores((l) => [...l, nome]);
    setNovoDevedor("");
    mexeu();
  }

  async function salvar() {
    if (origens.length === 0) return setErro("Deixe pelo menos uma origem na lista.");
    if (origens.some((o) => !o.rotulo.trim())) return setErro("Toda origem precisa de um nome.");
    const l = link.trim();
    if (!/^https:\/\/\S+$/.test(l)) return setErro("O link da Academy precisa começar com https://");
    setSalvando(true);
    setErro(null);
    const { erro: e } = await salvarPreferencias(createClient(), {
      listas: {
        origens: origens.map((o) => ({ valor: o.valor, rotulo: o.rotulo.trim() })),
        devedores,
        linkAcademy: l,
      },
    });
    setSalvando(false);
    if (e) return setErro(typeof e === "string" ? e : "Não foi possível salvar. Tente de novo.");
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco titulo="Origens do lead" dica="Como o contato chegou. A ordem daqui é a ordem das telas.">
        <ul className="space-y-2">
          {origens.map((o, i) => (
            <li key={o.valor} className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <input
                  value={o.rotulo}
                  maxLength={40}
                  aria-label={`Nome da origem ${o.valor}`}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    setOrigens((l) => l.map((x, k) => (k === i ? { ...x, rotulo: v } : x)));
                    mexeu();
                  }}
                  className={entrada}
                />
                <p className="mt-0.5 pl-1 text-[10px] text-neutral-400">código: {o.valor}</p>
              </div>
              <button type="button" className={botaoIcone} disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className={botaoIcone}
                disabled={i === origens.length - 1}
                onClick={() => mover(i, 1)}
                aria-label="Descer"
              >
                <ArrowDown size={16} />
              </button>
              <button type="button" className={`${botaoIcone} text-rose-600`} onClick={() => removerOrigem(i)} aria-label={`Tirar ${o.rotulo}`}>
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            value={novaOrigem}
            maxLength={40}
            placeholder="Nova origem (ex: Congresso)"
            onChange={(ev) => setNovaOrigem(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && adicionarOrigem()}
            className={entrada}
          />
          <button
            type="button"
            onClick={adicionarOrigem}
            className="flex h-11 flex-shrink-0 items-center gap-1 rounded-xl bg-brand-teal px-3 text-xs font-bold text-white"
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <button
          type="button"
          className={botaoVoltar}
          onClick={() => {
            setOrigens(PADRAO.origens.map((o) => ({ ...o })));
            mexeu();
          }}
        >
          <RotateCcw size={13} /> Voltar ao padrão
        </button>
      </Bloco>

      <Bloco titulo="Devedores de empréstimo" dica="Sugestões no Novo lançamento de empréstimo. Quem já tem empréstimo continua na tela de Empréstimos. Sem nomes, a opção some do Novo lançamento.">
        {devedores.length === 0 ? (
          <p className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">Nenhum devedor sugerido.</p>
        ) : (
          <ul className="space-y-2">
            {devedores.map((d, i) => (
              <li key={d} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate rounded-xl bg-neutral-50 px-3 py-3 text-sm font-medium text-neutral-800">{d}</span>
                <button
                  type="button"
                  className={`${botaoIcone} text-rose-600`}
                  aria-label={`Tirar ${d}`}
                  onClick={() => {
                    setDevedores((l) => l.filter((_, k) => k !== i));
                    mexeu();
                  }}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={novoDevedor}
            maxLength={60}
            placeholder="Nome do devedor"
            onChange={(ev) => setNovoDevedor(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && adicionarDevedor()}
            className={`${entrada} uppercase`}
          />
          <button
            type="button"
            onClick={adicionarDevedor}
            className="flex h-11 flex-shrink-0 items-center gap-1 rounded-xl bg-brand-teal px-3 text-xs font-bold text-white"
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <button
          type="button"
          className={botaoVoltar}
          onClick={() => {
            setDevedores([...PADRAO.devedores]);
            mexeu();
          }}
        >
          <RotateCcw size={13} /> Voltar ao padrão
        </button>
      </Bloco>

      <Bloco titulo="Link da Academy" dica="Link de convite da Contourline Academy. Só aparece para você, nunca vai para a cliente.">
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(ev) => {
            setLink(ev.target.value);
            mexeu();
          }}
          placeholder="https://"
          aria-label="Link da Academy"
          className={entrada}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className={botaoVoltar.replace("mt-3", "mt-0")}
            onClick={() => {
              setLink(PADRAO.linkAcademy);
              mexeu();
            }}
          >
            <RotateCcw size={13} /> Voltar ao padrão
          </button>
          <a
            href={/^https:\/\/\S+$/.test(link.trim()) ? link.trim() : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!/^https:\/\/\S+$/.test(link.trim())}
            className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ring-1 ring-brand-teal ${
              /^https:\/\/\S+$/.test(link.trim()) ? "text-brand-teal-dark" : "pointer-events-none text-neutral-300 ring-neutral-200"
            }`}
          >
            <ExternalLink size={14} /> Testar link
          </a>
        </div>
      </Bloco>

      <BarraSalvar
        alterado={alterado}
        salvando={salvando}
        salvo={salvo}
        erro={erro}
        onSalvar={salvar}
        onDescartar={() => {
          setOrigens(inicial.origens);
          setDevedores(inicial.devedores);
          setLink(inicial.link);
          setErro(null);
        }}
      />
    </div>
  );
}
