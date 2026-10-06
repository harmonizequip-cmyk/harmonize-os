"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { valorParaNumero } from "@/lib/valor";
import { DEVEDORES_SUGERIDOS, type ResumoDevedor } from "@/lib/emprestimos";

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "outros", label: "Outros" },
];

type Tipo = "concedido" | "devolucao";

export default function EmprestimosClient({ devedores }: { devedores: ResumoDevedor[] }) {
  const supabase = createClient();
  const router = useRouter();
  const totalAReceber = devedores.reduce((s, d) => s + Math.max(0, d.saldo), 0);

  const [form, setForm] = useState<{ tipo: Tipo; devedor: string } | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => hojeLocal());
  const [forma, setForma] = useState("pix");
  const [descricao, setDescricao] = useState("");
  const [outroNome, setOutroNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const nomes = Array.from(new Set([...devedores.map((d) => d.devedor), ...DEVEDORES_SUGERIDOS]));

  function abrir(tipo: Tipo, devedor: string) {
    setForm({ tipo, devedor });
    setValor("");
    setData(hojeLocal());
    setForma("pix");
    setDescricao("");
    setOutroNome("");
    setErro(null);
  }

  async function salvar() {
    if (!form) return;
    const nome = (form.devedor === "__outro__" ? outroNome : form.devedor).trim();
    const numero = valorParaNumero(valor);
    if (!nome) return setErro("Informe para quem foi o empréstimo.");
    if (!Number.isFinite(numero) || numero <= 0) return setErro("Informe um valor maior que zero.");
    const texto =
      form.tipo === "concedido"
        ? `Registrar empréstimo de ${formatCurrency(numero)} para ${nome.toUpperCase()}? Sai do caixa como saída, fora do resultado.`
        : `Registrar devolução de ${formatCurrency(numero)} de ${nome.toUpperCase()}? Entra no caixa como entrada, fora do faturamento.`;
    if (!window.confirm(texto)) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_emprestimo", {
      p_devedor: nome,
      p_tipo: form.tipo,
      p_valor: numero,
      p_forma: forma,
      p_data: data,
      p_descricao: descricao || null,
    });
    setSalvando(false);
    if (error) return setErro(error.message || "Não foi possível salvar.");
    setForm(null);
    router.refresh();
  }

  async function remover(id: string, rotulo: string) {
    if (!window.confirm(`Apagar "${rotulo}"? O lançamento do Financeiro ligado a ele também sai.`)) return;
    setRemovendo(id);
    const { error } = await supabase.rpc("remover_emprestimo", { p_id: id });
    setRemovendo(null);
    if (error) {
      window.alert(error.message || "Não foi possível apagar.");
      return;
    }
    router.refresh();
  }

  const campo =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/financeiro" className="text-xs text-neutral-500">
            ← Financeiro
          </Link>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Empréstimos</h1>
        </div>
        <button
          onClick={() => abrir("concedido", nomes[0] ?? "__outro__")}
          className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal"
        >
          + Novo empréstimo
        </button>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <p className="text-[11px] uppercase tracking-wide text-neutral-400">A receber de volta</p>
        <p className="mt-0.5 text-2xl font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(totalAReceber)}</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Empréstimo sai do caixa, mas não é despesa: fica fora do Resultado, do quadro &quot;Este mês&quot; e dos
          relatórios. A devolução também não conta como faturamento.
        </p>
      </div>

      {devedores.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
          Nenhum empréstimo lançado ainda.
        </div>
      )}

      {devedores.map((d) => (
        <div
          key={d.devedor}
          className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{d.devedor}</p>
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                d.saldo > 0
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-brand-teal/10 text-brand-teal"
              }`}
            >
              {d.saldo > 0 ? `Deve ${formatCurrency(d.saldo)}` : "Quitado"}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Emprestado {formatCurrency(d.concedido)} · devolvido {formatCurrency(d.devolvido)}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => abrir("devolucao", d.devedor)}
              disabled={d.saldo <= 0}
              className="rounded-xl bg-brand-teal py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Registrar devolução
            </button>
            <button
              onClick={() => abrir("concedido", d.devedor)}
              className="rounded-xl border border-neutral-300 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Emprestar mais
            </button>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-neutral-200 pt-2 dark:border-neutral-800">
            {d.movimentos.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-600 dark:text-neutral-300">
                  {formatDate(m.data)} · {m.tipo === "concedido" ? "Emprestado" : "Devolvido"}
                  {m.descricao ? ` · ${m.descricao}` : ""}
                </span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className={m.tipo === "concedido" ? "font-medium text-brand-pink" : "font-medium text-brand-teal"}>
                    {m.tipo === "concedido" ? "-" : "+"}
                    {formatCurrency(m.valor)}
                  </span>
                  <button
                    onClick={() =>
                      remover(m.id, `${m.tipo === "concedido" ? "Empréstimo" : "Devolução"} de ${formatCurrency(m.valor)} em ${formatDate(m.data)}`)
                    }
                    disabled={removendo === m.id}
                    className="text-red-600 disabled:opacity-50 dark:text-red-400"
                    aria-label="Apagar"
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {form && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setForm(null)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
              {(["concedido", "devolucao"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, tipo: t })}
                  className={`rounded-lg py-2 text-sm font-medium ${
                    form.tipo === t ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100" : "text-neutral-500"
                  }`}
                >
                  {t === "concedido" ? "Emprestei" : "Recebi de volta"}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {form.tipo === "concedido" ? "Para quem" : "De quem"}
            </label>
            <select value={form.devedor} onChange={(e) => setForm({ ...form, devedor: e.target.value })} className={campo}>
              {nomes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="__outro__">Outro...</option>
            </select>
            {form.devedor === "__outro__" && (
              <input value={outroNome} onChange={(e) => setOutroNome(e.target.value)} placeholder="Nome" className={`${campo} mt-2`} />
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor (R$)</label>
                <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
              </div>
            </div>

            <label className="mb-1 mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Forma</label>
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={campo}>
              {FORMAS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label className="mb-1 mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Observação</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" className={campo} />

            {erro && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setForm(null)} className="rounded-xl border border-neutral-300 py-2.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando} className="rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
