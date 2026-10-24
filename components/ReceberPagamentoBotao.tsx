"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { paraEscolha } from "@/lib/categorias";
import { codigoPadrao, contasParaEscolha } from "@/lib/contas-pix";
import { useContasPix } from "@/lib/usar-contas-pix";
import { formatCurrency } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { valorParaNumero, numeroParaCampo } from "@/lib/valor";
import { avisarPagamentoRegistrado } from "./ReciboHost";

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
  { value: "permuta", label: "Permuta" },
];

interface CategoriaPessoal {
  id: string;
  name: string;
}

/**
 * Atalho único para receber o saldo de uma locação, usado em todas as telas
 * onde aparece dívida (Pendências, Locações, Agenda, ficha do cliente...).
 * Valor já vem preenchido com o saldo; pode ser menor (pagamento parcial).
 * Quem decide o que é aceito é o banco (registrar_pagamento_locacao): aqui só
 * se evita o erro óbvio de valor zero ou acima do saldo.
 * Também usa o crédito em R$ da cliente (usar_credito_valor) e recebe por
 * permuta (registrar_permuta), que pode passar do saldo e virar crédito.
 */
export default function ReceberPagamentoBotao({
  rentalId,
  saldo,
  clientId,
  rotulo,
  onDone,
}: {
  rentalId: string;
  saldo: number;
  /** Quando não vem, é buscado na locação ao abrir. */
  clientId?: string | null;
  rotulo?: string;
  onDone?: () => void;
}) {
  const supabase = createClient();
  const contasPix = useContasPix();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState("pix");
  const [conta, setConta] = useState(codigoPadrao(contasPix));
  const [data, setData] = useState(hojeLocal());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Saldo em aberto atualizado depois de usar crédito sem fechar o formulário.
  const [saldoAtual, setSaldoAtual] = useState(saldo);
  const [cliente, setCliente] = useState<string | null>(clientId ?? null);
  const [credito, setCredito] = useState(0);
  const [usandoCredito, setUsandoCredito] = useState(false);
  const [valorCredito, setValorCredito] = useState("");
  const [creditoUsado, setCreditoUsado] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  // Permuta
  const [descricao, setDescricao] = useState("");
  const [destino, setDestino] = useState<"empresa" | "pessoal">("empresa");
  const [categoria, setCategoria] = useState("");
  const [categorias, setCategorias] = useState<CategoriaPessoal[] | null>(null);

  const permuta = forma === "permuta";
  const maxCredito = Math.max(0, Math.min(credito, saldoAtual));

  // Quitação = valor do saldo inteiro; abatimento = parte do saldo (a pessoa
  // digita quanto). O banco trata os dois do mesmo jeito: um pagamento a mais.
  const quitando = Math.abs((valorParaNumero(valor) || 0) - saldoAtual) < 0.005;
  const valorDigitado = valorParaNumero(valor) || 0;
  const sobraPermuta = permuta && valorDigitado > saldoAtual + 0.005 ? valorDigitado - saldoAtual : 0;

  async function carregarCredito() {
    let id = clientId ?? null;
    if (!id) {
      const { data: loc } = await supabase.from("rentals").select("client_id").eq("id", rentalId).maybeSingle();
      id = ((loc as { client_id: string | null } | null)?.client_id) ?? null;
    }
    setCliente(id);
    if (!id) {
      setCredito(0);
      return;
    }
    const { data: c } = await supabase
      .from("creditos_saldo")
      .select("valor_disponivel")
      .eq("client_id", id)
      .maybeSingle();
    setCredito(Number((c as { valor_disponivel: number } | null)?.valor_disponivel ?? 0));
  }

  async function carregarCategorias() {
    if (categorias) return;
    const { data: cats } = await supabase
      .from("categories")
      .select("*")
      .eq("scope", "pessoal")
      .eq("type", "saida")
      .order("name");
    setCategorias(paraEscolha((cats ?? []) as CategoriaPessoal[]));
  }

  function abrir() {
    setSaldoAtual(saldo);
    setValor(numeroParaCampo(saldo));
    setForma("pix");
    setConta(codigoPadrao(contasPix));
    setData(hojeLocal());
    setErro(null);
    setAviso(null);
    setCredito(0);
    setUsandoCredito(false);
    setCreditoUsado(0);
    setDescricao("");
    setDestino("empresa");
    setCategoria("");
    setAberto(true);
    carregarCredito();
  }

  function trocarForma(f: string) {
    setForma(f);
    setErro(null);
    if (f === "permuta") carregarCategorias();
  }

  function fecharFormulario() {
    setAberto(false);
    // Crédito já usado mudou o saldo: atualiza a tela de quem chamou.
    if (creditoUsado > 0) {
      if (onDone) onDone();
      else router.refresh();
    }
  }

  function abrirCredito() {
    setValorCredito(numeroParaCampo(Math.round(maxCredito * 100) / 100));
    setErro(null);
    setUsandoCredito(true);
  }

  async function confirmarCredito() {
    const v = valorParaNumero(valorCredito);
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe quanto do crédito usar.");
      return;
    }
    if (v > maxCredito + 0.001) {
      setErro(`O máximo é ${formatCurrency(maxCredito)} (o menor entre o crédito e o saldo).`);
      return;
    }
    if (!data) {
      setErro("Informe a data.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("usar_credito_valor", {
      p_rental_id: rentalId,
      p_valor: v,
      p_data: data,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível usar o crédito.");
      return;
    }
    const resto = Math.max(0, Math.round((saldoAtual - v) * 100) / 100);
    setUsandoCredito(false);
    setCredito((c) => Math.max(0, c - v));
    if (resto <= 0.009) {
      // Quitou só com o crédito: sem recibo (não entrou dinheiro).
      setAberto(false);
      if (onDone) onDone();
      else router.refresh();
      return;
    }
    setCreditoUsado((u) => u + v);
    setSaldoAtual(resto);
    setValor(numeroParaCampo(resto));
    setAviso(`${formatCurrency(v)} de crédito usado. Falta receber ${formatCurrency(resto)}.`);
  }

  async function confirmarPermuta(v: number) {
    if (!descricao.trim()) {
      setErro("Escreva o que veio na permuta.");
      return;
    }
    if (destino === "pessoal" && !categoria) {
      setErro("Escolha a categoria do gasto pessoal.");
      return;
    }
    if (!cliente) {
      setErro("Esta locação não tem cliente, então não dá para registrar permuta.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_permuta", {
      p_client_id: cliente,
      p_valor: v,
      p_descricao: descricao.trim(),
      p_destino: destino,
      p_categoria_pessoal: destino === "pessoal" ? categoria : null,
      p_rental_id: rentalId,
      p_data: data,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível registrar a permuta.");
      return;
    }
    // Permuta não oferece recibo (não entrou dinheiro).
    setAberto(false);
    if (onDone) onDone();
    else router.refresh();
  }

  async function confirmar() {
    const v = valorParaNumero(valor);
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    if (!permuta && v > saldoAtual + 0.001) {
      setErro(`O valor é maior que o saldo em aberto (${formatCurrency(saldoAtual)}).`);
      return;
    }
    if (!data) {
      setErro(permuta ? "Informe a data da permuta." : "Informe a data em que o dinheiro entrou.");
      return;
    }
    if (permuta) {
      await confirmarPermuta(v);
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_pagamento_locacao", {
      p_rental_id: rentalId,
      p_forma: forma,
      p_valor: v,
      p_data: data,
      p_pix_conta: forma === "pix" ? conta : null,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível registrar o pagamento.");
      return;
    }
    setAberto(false);
    // Oferece o recibo (components/ReciboHost.tsx, no layout).
    avisarPagamentoRegistrado({ rentalId, valor: v, forma, data });
    if (onDone) onDone();
    else router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="w-full rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white"
      >
        {rotulo ?? `Receber (${formatCurrency(saldo)})`}
      </button>
    );
  }

  const campo =
    "rounded-lg border border-neutral-300 px-2 py-1.5 text-sm";
  return (
    <div className="space-y-2 rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-2.5">
      <p className="text-[11px] text-neutral-500">Saldo em aberto: {formatCurrency(saldoAtual)}.</p>
      {aviso && <p className="text-[11px] font-medium text-brand-teal">{aviso}</p>}
      {credito > 0.009 && maxCredito > 0.009 && (
        <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-emerald-800">
              Crédito da cliente: {formatCurrency(credito)} disponível
            </p>
            {!usandoCredito && (
              <button
                type="button"
                onClick={abrirCredito}
                className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white"
              >
                Usar crédito
              </button>
            )}
          </div>
          {usandoCredito && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={valorCredito}
                  onChange={(e) => setValorCredito(e.target.value)}
                  inputMode="decimal"
                  aria-label="Valor do crédito a usar"
                  className={`w-28 ${campo}`}
                />
                <p className="text-[11px] text-neutral-500">máximo {formatCurrency(maxCredito)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={confirmarCredito}
                  className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Confirmar uso do crédito"}
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setUsandoCredito(false)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setValor(numeroParaCampo(saldoAtual))}
          className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
            quitando
              ? "border-brand-teal bg-brand-teal text-white"
              : "border-neutral-300 text-neutral-600"
          }`}
        >
          Quitar tudo ({formatCurrency(saldoAtual)})
        </button>
        <button
          type="button"
          onClick={() => setValor("")}
          className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
            !quitando
              ? "border-brand-teal bg-brand-teal text-white"
              : "border-neutral-300 text-neutral-600"
          }`}
        >
          Abatimento (parte)
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="Valor"
          aria-label="Valor recebido"
          className={`w-28 ${campo}`}
        />
        <select value={forma} onChange={(e) => trocarForma(e.target.value)} aria-label="Forma de pagamento" className={campo}>
          {FORMAS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {forma === "pix" && (
          <select
            value={conta}
            onChange={(e) => setConta(e.target.value)}
            aria-label="Conta PIX que recebeu"
            className={`min-w-0 flex-1 ${campo}`}
          >
            {contasParaEscolha(contasPix, conta).map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.titular}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          aria-label="Data em que entrou"
          className={campo}
        />
      </div>
      {permuta && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2">
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que veio (ex.: 2 caixas de bioestimulador)"
            aria-label="O que veio na permuta"
            className={`w-full ${campo}`}
          />
          <div className="flex gap-2">
            {(["empresa", "pessoal"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDestino(d)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
                  destino === d ? "border-brand-teal bg-brand-teal text-white" : "border-neutral-300 text-neutral-600"
                }`}
              >
                {d === "empresa" ? "Da empresa" : "Pessoal"}
              </button>
            ))}
          </div>
          {destino === "pessoal" && (
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              aria-label="Categoria do gasto pessoal"
              className={`w-full ${campo}`}
            >
              <option value="">{categorias ? "Categoria do gasto pessoal..." : "Carregando categorias..."}</option>
              {(categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {sobraPermuta > 0 && (
            <p className="text-[11px] font-medium text-emerald-700">
              {formatCurrency(saldoAtual)} abate esta locação e {formatCurrency(sobraPermuta)} ficam de crédito.
            </p>
          )}
          <p className="text-[11px] text-neutral-500">
            Não entra dinheiro no caixa. Empresa: sai em Outros. Pessoal: sai como Retirada e vira gasto no Pessoal.
          </p>
        </div>
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={salvando}
          onClick={confirmar}
          className="flex-1 rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {salvando ? "Salvando..." : permuta ? "Confirmar permuta" : "Confirmar recebimento"}
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={fecharFormulario}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
