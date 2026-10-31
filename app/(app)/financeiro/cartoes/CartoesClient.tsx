"use client";

// Cartões de crédito: fatura atual de cada cartão, compras da fatura,
// pagar a fatura e cadastrar/editar cartão. A compra conta como gasto no mês em
// que a fatura vence; o pagamento da fatura tira o dinheiro e fica fora do resultado.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { valorParaNumero, numeroParaCampo } from "@/lib/valor";
import { faturaDaCompra, rotuloFatura, somarMesesRef } from "@/lib/cartao";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { Atalho } from "@/components/Atalhos";
import { linkLancamento } from "@/lib/atalhos";
import { confirmar, avisar } from "@/components/Dialogos";
import { usePreferencias } from "@/lib/usar-preferencias";
import { grupoDevedores, rotuloDevedor, siglaDevedor } from "@/lib/emprestimos";
import ImportarFaturaModal from "@/components/ImportarFaturaModal";
import DesfazerImportacaoModal from "@/components/DesfazerImportacaoModal";

export interface Cartao {
  id: string;
  nome: string;
  scope: "harmonize" | "pessoal";
  dia_fechamento: number;
  dia_vencimento: number;
  limite: number | null;
  ativo: boolean;
}

export interface Fatura {
  cartao_id: string;
  fatura_ref: string;
  vencimento: string;
  fechamento: string;
  total_compras: number;
  total_pago: number;
}

interface Compra {
  id: string;
  description: string;
  amount: number;
  date: string;
  /** Dia da compra (date é o vencimento da fatura). */
  data_compra: string | null;
  cartao_mov: "compra" | "pagamento";
  compra_grupo: string | null;
  parcela_num: number | null;
  parcelas_total: number | null;
  categoria: string | null;
}

/** Erro de função que ainda não existe no banco (SQL não rodado). */
function faltaSqlEmprestimo(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message ?? "");
}
const MSG_FALTA_SQL = "Falta rodar o SQL do empréstimo no cartão.";

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "transferencia", label: "Transferência" },
  { value: "debito", label: "Débito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outros", label: "Outros" },
];

const campo =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

function situacao(f: { total_compras: number; total_pago: number; fechamento: string; vencimento: string } | null, hoje: string) {
  if (!f || f.total_compras <= 0) return { texto: "Sem compras", cor: "text-neutral-400" };
  const falta = f.total_compras - f.total_pago;
  if (falta <= 0.009) return { texto: "Paga", cor: "text-brand-teal" };
  if (hoje > f.vencimento) return { texto: "Vencida", cor: "text-red-600" };
  if (hoje > f.fechamento) return { texto: "Fechada, a pagar", cor: "text-amber-600" };
  return { texto: "Aberta", cor: "text-neutral-500" };
}

export default function CartoesClient({
  cartoes: todosCartoes,
  faturas,
  escopo,
  categorias = [],
}: {
  cartoes: Cartao[];
  faturas: Fatura[];
  escopo: "harmonize" | "pessoal";
  categorias?: { id: string; name: string }[];
}) {
  // Cada espaço mostra só os próprios cartões.
  const cartoes = todosCartoes.filter((c) => c.scope === escopo);
  const supabase = createClient();
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const hoje = hojeLocal();
  const ativos = cartoes.filter((c) => c.ativo);
  const [selecionado, setSelecionado] = useState<string | null>(ativos[0]?.id ?? null);
  const cartao = cartoes.find((c) => c.id === selecionado) ?? null;
  const refAtual = cartao ? faturaDaCompra(hoje, cartao.dia_fechamento, cartao.dia_vencimento) : null;
  const [deslocamento, setDeslocamento] = useState(0);
  const ref = refAtual ? somarMesesRef(refAtual, deslocamento) : null;
  const fatura = faturas.find((f) => f.cartao_id === selecionado && f.fatura_ref === ref) ?? null;
  const [compras, setCompras] = useState<Compra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  // Compra da Harmonize que é de um devedor (Laser Dream) vira empréstimo, parcela a parcela.
  const sugeridos = usePreferencias().listas.devedores;
  const [emprestimoDe, setEmprestimoDe] = useState<Map<string, string>>(new Map());
  const [marcando, setMarcando] = useState<Compra | null>(null);
  const [devedorEscolhido, setDevedorEscolhido] = useState("");
  const [todasParcelas, setTodasParcelas] = useState(true);
  const [salvandoEmp, setSalvandoEmp] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const devedores = Array.from(new Set([...sugeridos, ...emprestimoDe.values()]));
  const grupo = grupoDevedores(devedores);
  const rotuloAcao = grupo ? `é da ${grupo}` : "é empréstimo";
  const rotuloDesfazer = grupo ? `Não é da ${grupo}` : "Não é empréstimo";

  // ?cartao=<id>&fatura=AAAA-MM (linha da fatura em Lançamentos): abre direto naquela fatura.
  // ?importar=1 (lembrete de importar a fatura): já abre a importação desse cartão.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("cartao");
    const alvo = url.searchParams.get("fatura");
    if (url.searchParams.get("importar") === "1") {
      if (!somenteLeitura && ativos.length > 0) setImportando(true);
      // Tira o parâmetro para não reabrir a importação ao recarregar a tela.
      url.searchParams.delete("importar");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const c = cartoes.find((x) => x.id === id);
    if (!c) return;
    setSelecionado(c.id);
    if (alvo && /^\d{4}-\d{2}$/.test(alvo)) {
      const atual = faturaDaCompra(hoje, c.dia_fechamento, c.dia_vencimento);
      const meses = (r: string) => Number(r.slice(0, 4)) * 12 + Number(r.slice(5, 7));
      setDeslocamento(meses(alvo) - meses(atual));
    }
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pagando, setPagando] = useState(false);
  const [valorPagar, setValorPagar] = useState("");
  const [dataPagar, setDataPagar] = useState(hoje);
  const [formaPagar, setFormaPagar] = useState("pix");

  const [editando, setEditando] = useState<Partial<Cartao> | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!selecionado || !ref) return;
    setCarregando(true);
    supabase
      .from("transactions")
      .select("id, description, amount, date, data_compra, cartao_mov, compra_grupo, parcela_num, parcelas_total, categories(name)")
      .eq("cartao_id", selecionado)
      .eq("fatura_ref", ref)
      .eq("is_test", false)
      .order("data_compra", { nullsFirst: false })
      .order("date")
      .then(async ({ data }) => {
        const lista = ((data ?? []) as any[]).map((t) => ({
          ...t,
          amount: Number(t.amount),
          categoria: (Array.isArray(t.categories) ? t.categories[0] : t.categories)?.name ?? null,
        })) as Compra[];
        // Quais compras desta fatura já viraram empréstimo (sem o SQL rodado, nenhuma).
        const mapa = new Map<string, string>();
        const ids = lista.filter((c) => c.cartao_mov === "compra").map((c) => c.id);
        if (escopo === "harmonize" && ids.length > 0) {
          const { data: emp } = await supabase
            .from("emprestimos")
            .select("transaction_id, devedor")
            .eq("origem", "cartao")
            .in("transaction_id", ids);
          for (const e of (emp ?? []) as { transaction_id: string; devedor: string }[]) mapa.set(e.transaction_id, e.devedor);
        }
        setCompras(lista);
        setEmprestimoDe(mapa);
        setCarregando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado, ref, recarregar]);

  // Limite usado: tudo que foi comprado e ainda não foi pago, em todas as faturas.
  const usadoPorCartao = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of faturas) m.set(f.cartao_id, (m.get(f.cartao_id) ?? 0) + Math.max(0, f.total_compras - f.total_pago));
    return m;
  }, [faturas]);

  const falta = fatura ? Math.max(0, fatura.total_compras - fatura.total_pago) : 0;
  const sit = situacao(fatura, hoje);

  async function pagar() {
    if (!cartao || !ref) return;
    const v = valorParaNumero(valorPagar);
    if (!v || v <= 0) return setErro("Informe o valor pago.");
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("pagar_fatura_cartao", {
      p_cartao_id: cartao.id,
      p_fatura_ref: ref,
      p_valor: v,
      p_data: dataPagar,
      p_forma: formaPagar,
    });
    setSalvando(false);
    if (error) return setErro(error.message || "Não consegui registrar o pagamento.");
    setPagando(false);
    router.refresh();
  }

  async function excluirCompra(c: Compra) {
    if (!c.compra_grupo) return;
    if (!(await confirmar({ titulo: `Apagar a compra "${c.description.replace(/ \(\d+\/\d+\)$/, "")}"?`, texto: emprestimoDe.has(c.id) ? "Todas as parcelas são apagadas, e o empréstimo ligado a elas sai junto." : "Todas as parcelas são apagadas.", confirmar: "Apagar", perigo: true }))) return;
    setErro(null);
    const { error } = await supabase.rpc("excluir_compra_cartao", { p_compra_grupo: c.compra_grupo });
    if (error) return setErro(error.message || "Não consegui apagar.");
    router.refresh();
  }

  function abrirMarcar(c: Compra) {
    setErro(null);
    setMarcando(c);
    setDevedorEscolhido(devedores[0] ?? "");
    setTodasParcelas(true);
  }

  async function marcarEmprestimo() {
    if (!marcando || !devedorEscolhido) return;
    setSalvandoEmp(true);
    const { data, error } = await supabase.rpc("marcar_compra_emprestimo", {
      p_transaction_id: marcando.id,
      p_devedor: devedorEscolhido,
      p_todas_parcelas: todasParcelas,
    });
    setSalvandoEmp(false);
    if (error) {
      avisar(faltaSqlEmprestimo(error) ? MSG_FALTA_SQL : error.message || "Não consegui marcar.", "erro");
      return;
    }
    setMarcando(null);
    const n = Number(data ?? 0);
    avisar(n > 1 ? `${n} parcelas viraram empréstimo para ${devedorEscolhido}.` : `Virou empréstimo para ${devedorEscolhido}.`);
    setRecarregar((r) => r + 1);
    router.refresh();
  }

  async function desmarcarEmprestimo(c: Compra) {
    const varias = !!c.compra_grupo && (c.parcelas_total ?? 1) > 1;
    const ok = await confirmar({
      titulo: `${rotuloDesfazer}?`,
      texto: varias
        ? "Todas as parcelas desta compra deixam de ser empréstimo e voltam para a categoria de antes (contam de novo como despesa da Harmonize)."
        : "A compra deixa de ser empréstimo e volta para a categoria de antes (conta de novo como despesa da Harmonize).",
      confirmar: rotuloDesfazer,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("desmarcar_compra_emprestimo", { p_transaction_id: c.id, p_todas_parcelas: true });
    if (error) {
      avisar(faltaSqlEmprestimo(error) ? MSG_FALTA_SQL : error.message || "Não consegui desfazer.", "erro");
      return;
    }
    setRecarregar((r) => r + 1);
    router.refresh();
  }

  async function salvarCartao() {
    if (!editando) return;
    const fech = Number(editando.dia_fechamento);
    const venc = Number(editando.dia_vencimento);
    if (!editando.nome?.trim() || !fech || !venc) return setErro("Preencha nome, dia de fechamento e dia de vencimento.");
    setSalvando(true);
    setErro(null);
    const limite = editando.limite != null && String(editando.limite).trim() ? valorParaNumero(String(editando.limite)) : null;
    const { data, error } = await supabase.rpc("salvar_cartao", {
      p_id: editando.id ?? null,
      p_nome: editando.nome,
      p_scope: editando.scope ?? "harmonize",
      p_dia_fechamento: fech,
      p_dia_vencimento: venc,
      p_limite: limite && limite > 0 ? limite : null,
      p_ativo: editando.ativo ?? true,
    });
    setSalvando(false);
    if (error) return setErro(error.message || "Não consegui salvar o cartão.");
    setEditando(null);
    if (data) setSelecionado(data as string);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link href={escopo === "pessoal" ? "/pessoal/lancamentos" : "/financeiro"} className="text-xs text-neutral-500">
            ← {escopo === "pessoal" ? "Lançamentos" : "Financeiro"}
          </Link>
          <h1 className="text-xl font-semibold text-neutral-900">
            {escopo === "pessoal" ? "Cartões pessoais" : "Cartões da Harmonize"}
          </h1>
        </div>
        {!somenteLeitura && (
          <div className="flex gap-2">
            {ativos.length > 0 && (
              <button
                type="button"
                onClick={() => setImportando(true)}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700"
              >
                Importar fatura
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setErro(null);
                setEditando({ scope: escopo, ativo: true });
              }}
              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700"
            >
              + Cartão
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        A compra conta como gasto no mês em que a fatura vence, mas só sai da conta quando você paga a fatura. O pagamento da fatura fica
        fora do resultado, para não contar duas vezes.
      </p>

      {editando && (
        <div className="space-y-2 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-sm font-medium text-neutral-900">{editando.id ? "Editar cartão" : "Novo cartão"}</p>
          <input value={editando.nome ?? ""} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Nome (ex: Inter PJ)" className={campo} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-0.5 block text-[11px] text-neutral-500">Fecha dia</label>
              <input inputMode="numeric" value={editando.dia_fechamento ?? ""} onChange={(e) => setEditando({ ...editando, dia_fechamento: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || undefined })} className={campo} />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-neutral-500">Vence dia</label>
              <input inputMode="numeric" value={editando.dia_vencimento ?? ""} onChange={(e) => setEditando({ ...editando, dia_vencimento: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || undefined })} className={campo} />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-neutral-500">Limite</label>
              <input inputMode="decimal" value={editando.limite == null ? "" : String(editando.limite)} onChange={(e) => setEditando({ ...editando, limite: e.target.value as any })} placeholder="opcional" className={campo} />
            </div>
          </div>
          {editando.id && (
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={editando.ativo === false} onChange={(e) => setEditando({ ...editando, ativo: !e.target.checked })} />
              Não uso mais este cartão (esconde dos lançamentos)
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(null)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs text-neutral-600">
              Cancelar
            </button>
            <button type="button" disabled={salvando} onClick={salvarCartao} className="flex-1 rounded-lg bg-brand-teal py-2 text-xs font-medium text-white disabled:opacity-60">
              Salvar
            </button>
          </div>
        </div>
      )}

      {ativos.length === 0 && !editando && (
        <p className="rounded-2xl border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-400">
          Nenhum cartão cadastrado. Toque em &quot;+ Cartão&quot; e informe o dia em que fecha e o dia em que vence.
        </p>
      )}

      {ativos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ativos.map((c) => {
            const usado = usadoPorCartao.get(c.id) ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelecionado(c.id);
                  setDeslocamento(0);
                  setPagando(false);
                }}
                className={`min-w-[150px] rounded-2xl border p-3 text-left ${
                  selecionado === c.id ? "border-brand-teal bg-brand-teal/5" : "border-neutral-200 bg-white/70"
                }`}
              >
                <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                  <CreditCard size={14} /> {c.nome}
                </p>
                <p className="text-[11px] text-neutral-500">{c.scope === "harmonize" ? "Harmonize" : "Pessoal"} · vence dia {c.dia_vencimento}</p>
                {c.limite ? (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Disponível {formatCurrency(Math.max(0, Number(c.limite) - usado))} de {formatCurrency(Number(c.limite))}
                  </p>
                ) : (
                  usado > 0 && <p className="mt-1 text-[11px] text-neutral-500">A pagar {formatCurrency(usado)}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {cartao && ref && (
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setDeslocamento((d) => d - 1)} aria-label="Fatura anterior" className="p-1 text-neutral-500">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-neutral-900">
                Fatura de {rotuloFatura(ref)}
                {deslocamento === 0 && <span className="ml-1 text-[11px] font-normal text-neutral-400">(atual)</span>}
              </p>
              <p className="text-[11px] text-neutral-500">
                {fatura ? `fecha ${formatDate(fatura.fechamento)} · vence ${formatDate(fatura.vencimento)}` : `vence dia ${cartao.dia_vencimento}`}
              </p>
            </div>
            <button type="button" onClick={() => setDeslocamento((d) => d + 1)} aria-label="Próxima fatura" className="p-1 text-neutral-500">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">Total</p>
              <p className="text-sm font-semibold text-neutral-900">{formatCurrency(fatura?.total_compras ?? 0)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">Pago</p>
              <p className="text-sm font-semibold text-brand-teal">{formatCurrency(fatura?.total_pago ?? 0)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">Situação</p>
              <p className={`text-sm font-semibold ${sit.cor}`}>{sit.texto}</p>
            </div>
          </div>

          {!somenteLeitura && falta > 0.009 && !pagando && (
            <button
              type="button"
              onClick={() => {
                setPagando(true);
                setErro(null);
                setValorPagar(numeroParaCampo(falta));
                setDataPagar(hoje);
              }}
              className="mt-3 w-full rounded-xl bg-brand-teal py-2.5 text-sm font-semibold text-white"
            >
              Pagar fatura ({formatCurrency(falta)})
            </button>
          )}

          {pagando && (
            <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[11px] text-neutral-500">Valor pago</label>
                  <input inputMode="decimal" value={valorPagar} onChange={(e) => setValorPagar(e.target.value)} className={campo} />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] text-neutral-500">Dia</label>
                  <input type="date" value={dataPagar} max={hoje} onChange={(e) => setDataPagar(e.target.value)} className={campo} />
                </div>
              </div>
              <select value={formaPagar} onChange={(e) => setFormaPagar(e.target.value)} className={campo}>
                {FORMAS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-500">
                Sai {cartao.scope === "harmonize" ? "do caixa da Harmonize" : "da conta pessoal"}. Pagamento menor que o total deixa o resto em aberto.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPagando(false)} className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs text-neutral-600">
                  Voltar
                </button>
                <button type="button" disabled={salvando} onClick={pagar} className="flex-1 rounded-lg bg-brand-teal py-2 text-xs font-medium text-white disabled:opacity-60">
                  {salvando ? "Salvando..." : "Registrar pagamento"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-medium text-neutral-600">Movimentos da fatura</p>
            {carregando ? (
              <p className="mt-2 text-xs text-neutral-400">Carregando...</p>
            ) : compras.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-400">Nada nesta fatura.</p>
            ) : (
              <ul className="mt-2 divide-y divide-neutral-200/70">
                {compras.map((c) => {
                  const devedorEmp = emprestimoDe.get(c.id);
                  return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block truncate text-neutral-800">{c.description}</span>
                      <span className="text-[11px] text-neutral-400">
                        {formatDate(c.data_compra ?? c.date)}
                        {c.categoria && !devedorEmp ? ` · ${c.categoria}` : ""}
                      </span>
                      {devedorEmp && (
                        <span className="mt-0.5 block">
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            Empréstimo · {siglaDevedor(devedorEmp, devedores)}
                          </span>
                          {!somenteLeitura && (
                            <button
                              type="button"
                              onClick={() => desmarcarEmprestimo(c)}
                              className="ml-2 text-[11px] text-neutral-500 underline"
                            >
                              {rotuloDesfazer}
                            </button>
                          )}
                        </span>
                      )}
                      {!devedorEmp && !somenteLeitura && escopo === "harmonize" && cartao.scope === "harmonize" && c.cartao_mov === "compra" && (
                        <button type="button" onClick={() => abrirMarcar(c)} className="mt-0.5 block text-[11px] text-brand-teal underline">
                          {rotuloAcao.charAt(0).toUpperCase() + rotuloAcao.slice(1)}
                        </button>
                      )}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className={`font-medium ${c.cartao_mov === "pagamento" ? "text-brand-teal" : "text-neutral-800"}`}>
                        {c.cartao_mov === "pagamento" ? "pago " : ""}
                        {formatCurrency(c.amount)}
                      </span>
                      {/* Abre o lançamento para editar; o pessoal abre na tela do Pessoal. */}
                      {!somenteLeitura && (
                        <Atalho
                          href={cartao.scope === "pessoal" ? `/pessoal/lancamentos?lancamento=${c.id}` : linkLancamento(c.id)}
                        >
                          abrir
                        </Atalho>
                      )}
                      {!somenteLeitura && c.cartao_mov === "compra" && (
                        <button type="button" onClick={() => excluirCompra(c)} className="text-[11px] text-neutral-400 underline">
                          apagar
                        </button>
                      )}
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!somenteLeitura && (
            <button
              type="button"
              onClick={() => {
                setErro(null);
                setEditando({ ...cartao });
              }}
              className="mt-3 text-[11px] text-neutral-500 underline"
            >
              Editar cartão
            </button>
          )}
          {!somenteLeitura && (
            <button type="button" onClick={() => setDesfazendo(true)} className="ml-4 mt-3 text-[11px] text-neutral-500 underline">
              Desfazer importação
            </button>
          )}
        </div>
      )}

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {marcando &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setMarcando(null)}>
            <div
              role="dialog"
              aria-modal="true"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-bold text-neutral-900">Esta compra {rotuloAcao}?</p>
              <p className="mt-1 truncate text-sm text-neutral-700">
                {marcando.description.replace(/ \(\d+\/\d+\)$/, "")} · {formatCurrency(marcando.amount)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                Cada parcela vira um empréstimo no mês em que a fatura dela vence. Sai das despesas e do resultado da Harmonize e entra
                em Empréstimos, como dinheiro que volta. A compra continua na fatura do cartão.
              </p>
              <p className="mb-1 mt-4 text-xs font-medium text-neutral-600">Para quem</p>
              <div className="space-y-1.5">
                {devedores.map((d) => (
                  <label key={d} className="flex items-center gap-2 rounded-xl border border-neutral-200 p-2.5 text-sm text-neutral-800">
                    <input type="radio" name="devedor-emprestimo" checked={devedorEscolhido === d} onChange={() => setDevedorEscolhido(d)} />
                    {rotuloDevedor(d, devedores) || d}
                  </label>
                ))}
                {devedores.length === 0 && (
                  <p className="text-xs text-neutral-500">Cadastre os devedores em Configurações &gt; Listas.</p>
                )}
              </div>
              {(marcando.parcelas_total ?? 1) > 1 && marcando.compra_grupo && (
                <label className="mt-3 flex items-start gap-2 rounded-xl border border-neutral-200 p-2.5 text-sm text-neutral-700">
                  <input type="checkbox" checked={todasParcelas} onChange={(e) => setTodasParcelas(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>
                    Todas as {marcando.parcelas_total} parcelas
                    <span className="block text-[11px] text-neutral-400">
                      Desmarcado, só esta parcela ({marcando.parcela_num}/{marcando.parcelas_total}) vira empréstimo.
                    </span>
                  </span>
                </label>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMarcando(null)} className="rounded-xl border border-neutral-300 py-2.5 text-sm text-neutral-600">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvandoEmp || !devedorEscolhido}
                  onClick={marcarEmprestimo}
                  className="rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {salvandoEmp ? "Salvando..." : "Virar empréstimo"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {desfazendo && cartao && (
        <DesfazerImportacaoModal
          cartaoId={cartao.id}
          cartaoNome={cartao.nome}
          onClose={() => setDesfazendo(false)}
          onFeito={() => {
            setDesfazendo(false);
            router.refresh();
          }}
        />
      )}

      {importando && (
        <ImportarFaturaModal
          cartoes={ativos}
          cartaoInicial={selecionado}
          categorias={categorias}
          onClose={() => setImportando(false)}
          onFeito={() => {
            setImportando(false);
            router.refresh();
          }}
        />
      )}

      <p className="text-[11px] text-neutral-400">
        Para lançar uma compra: Novo lançamento, saída, forma de pagamento Crédito, escolha o cartão e as parcelas.
      </p>
    </div>
  );
}
