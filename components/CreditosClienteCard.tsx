"use client";

// Créditos da cliente (creditos_cliente / creditos_saldo): saldo, extrato e
// lançamento à mão (disparos, permuta ou ajuste em R$). Crédito de troca de
// ponteira só fica disponível quando a locação de origem está paga.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { Atalho } from "@/components/Atalhos";
import { linkLocacao } from "@/lib/atalhos";
import { hojeLocal } from "@/lib/period";
import { ORIGEM_CREDITO, temCredito, type SaldoCredito } from "@/lib/creditos";

interface Movimento {
  id: string;
  tipo: "disparos" | "valor";
  quantidade: number;
  origem: string;
  rental_id: string | null;
  descricao: string | null;
  data: string;
  created_at: string;
}

type Aba = "disparos" | "permuta" | "valor";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function numero(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, "");
  // "1.234,56" ou "1234,56" ou "1234.56"
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

function ddmm(data: string) {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

export default function CreditosClienteCard({ clientId }: { clientId: string }) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const [saldo, setSaldo] = useState<SaldoCredito | null>(null);
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("disparos");
  const [sinal, setSinal] = useState<1 | -1>(1);
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [destino, setDestino] = useState<"empresa" | "pessoal">("empresa");
  const [categoria, setCategoria] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState(hojeLocal());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [{ data: s }, { data: m }] = await Promise.all([
      supabase
        .from("creditos_saldo")
        .select("client_id, disparos_disponiveis, disparos_aguardando, valor_disponivel")
        .eq("client_id", clientId)
        .maybeSingle(),
      supabase
        .from("creditos_cliente")
        .select("id, tipo, quantidade, origem, rental_id, descricao, data, created_at")
        .eq("client_id", clientId)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setSaldo(
      s
        ? {
            client_id: s.client_id,
            disparos_disponiveis: Number(s.disparos_disponiveis ?? 0),
            disparos_aguardando: Number(s.disparos_aguardando ?? 0),
            valor_disponivel: Number(s.valor_disponivel ?? 0),
          }
        : null
    );
    setMovs(((m ?? []) as Movimento[]).map((x) => ({ ...x, quantidade: Number(x.quantidade) })));
    setCarregado(true);
  }, [clientId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!aberto || aba !== "permuta" || destino !== "pessoal" || categorias.length) return;
    createClient()
      .from("categories")
      .select("id, name")
      .eq("scope", "pessoal")
      .eq("type", "saida")
      .order("name")
      .then(({ data: c }) => setCategorias((c ?? []) as { id: string; name: string }[]));
  }, [aberto, aba, destino, categorias.length]);

  function abrir() {
    setAberto(true);
    setAba("disparos");
    setSinal(1);
    setQuantidade("");
    setMotivo("");
    setDestino("empresa");
    setCategoria("");
    setData(hojeLocal());
    setErro(null);
  }

  async function salvar() {
    setErro(null);
    const qtd = numero(quantidade);
    if (!(qtd > 0)) return setErro(aba === "disparos" ? "Informe a quantidade de disparos." : "Informe o valor.");
    if (aba === "disparos" && qtd !== Math.round(qtd)) return setErro("Disparos são números inteiros.");
    if (!motivo.trim()) return setErro(aba === "permuta" ? "Escreva o que veio na permuta." : "Escreva o motivo.");
    if (aba === "permuta" && destino === "pessoal" && !categoria) return setErro("Escolha a categoria do gasto pessoal.");
    setSalvando(true);
    const supabase = createClient();
    const { error } =
      aba === "permuta"
        ? await supabase.rpc("registrar_permuta", {
            p_client_id: clientId,
            p_valor: Math.round(qtd * 100) / 100,
            p_descricao: motivo.trim(),
            p_destino: destino,
            p_categoria_pessoal: destino === "pessoal" ? categoria : null,
            p_rental_id: null,
            p_data: data || hojeLocal(),
          })
        : await supabase.rpc("lancar_credito_cliente", {
            p_client_id: clientId,
            p_tipo: aba,
            p_quantidade: sinal * (aba === "valor" ? Math.round(qtd * 100) / 100 : qtd),
            p_descricao: motivo.trim(),
          });
    setSalvando(false);
    if (error) return setErro(error.message);
    setAberto(false);
    await carregar();
    router.refresh();
  }

  if (!carregado) return null;
  const vazio = !temCredito(saldo) && movs.length === 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal-dark">
            <Coins size={17} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-900">Créditos</p>
            {vazio && <p className="text-xs text-neutral-500">Sem crédito</p>}
          </div>
        </div>
        {!aberto && !somenteLeitura && (
          <button
            onClick={abrir}
            className="flex-shrink-0 rounded-lg border border-brand-teal/40 bg-brand-teal/10 px-3 py-1.5 text-xs font-semibold text-brand-teal-dark"
          >
            Lançar crédito
          </button>
        )}
      </div>

      {!vazio && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-neutral-50 p-2.5">
            <p className="text-[11px] text-neutral-500">Disparos</p>
            <p className="text-sm font-semibold text-neutral-900">{(saldo?.disparos_disponiveis ?? 0).toLocaleString("pt-BR")}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-2.5">
            <p className="text-[11px] text-neutral-500">Aguardando pagamento</p>
            <p className="text-sm font-semibold text-neutral-900">{(saldo?.disparos_aguardando ?? 0).toLocaleString("pt-BR")}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-2.5">
            <p className="text-[11px] text-neutral-500">Em R$</p>
            <p className="text-sm font-semibold text-neutral-900">{brl(saldo?.valor_disponivel ?? 0)}</p>
          </div>
        </div>
      )}

      {aberto && (
        <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 p-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1 text-xs font-medium">
            {(
              [
                ["disparos", "Disparos"],
                ["permuta", "Permuta"],
                ["valor", "Ajuste em R$"],
              ] as [Aba, string][]
            ).map(([k, rotulo]) => (
              <button
                key={k}
                onClick={() => {
                  setAba(k);
                  setErro(null);
                }}
                className={`rounded-md px-2 py-1.5 ${aba === k ? "bg-white text-brand-teal-dark shadow-sm" : "text-neutral-600"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {aba !== "permuta" && (
            <div className="grid grid-cols-2 gap-1 text-xs font-medium">
              <button
                onClick={() => setSinal(1)}
                className={`rounded-lg border px-2 py-1.5 ${sinal === 1 ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-600"}`}
              >
                Dar
              </button>
              <button
                onClick={() => setSinal(-1)}
                className={`rounded-lg border px-2 py-1.5 ${sinal === -1 ? "border-rose-300 bg-rose-50 text-rose-700" : "border-neutral-200 text-neutral-600"}`}
              >
                Tirar
              </button>
            </div>
          )}

          <label className="block text-xs text-neutral-600">
            {aba === "disparos" ? "Quantidade de disparos" : "Valor (R$)"}
            <input
              inputMode={aba === "disparos" ? "numeric" : "decimal"}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder={aba === "disparos" ? "Ex.: 1000" : "Ex.: 150,00"}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs text-neutral-600">
            {aba === "permuta" ? "O que veio" : "Motivo"}
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              placeholder={aba === "permuta" ? "Ex.: Jantar, produtos da clínica" : "Ex.: Cortesia"}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>

          {aba === "permuta" && (
            <>
              <div className="grid grid-cols-2 gap-1 text-xs font-medium">
                {(["empresa", "pessoal"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDestino(d)}
                    className={`rounded-lg border px-2 py-1.5 ${destino === d ? "border-brand-teal/50 bg-brand-teal/10 text-brand-teal-dark" : "border-neutral-200 text-neutral-600"}`}
                  >
                    {d === "empresa" ? "Empresa" : "Pessoal"}
                  </button>
                ))}
              </div>
              {destino === "pessoal" && (
                <label className="block text-xs text-neutral-600">
                  Categoria do gasto pessoal
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Escolha</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-xs text-neutral-600">
                Data
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                />
              </label>
              <p className="text-[11px] text-neutral-500">
                Empresa: sai em Outros. Pessoal: sai como Retirada e vira gasto no Pessoal. Não mexe no saldo do caixa.
              </p>
            </>
          )}

          {erro && <p className="text-xs text-rose-600">{erro}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={() => setAberto(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Lançar"}
            </button>
          </div>
        </div>
      )}

      {movs.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {movs.map((m) => {
            const positivo = m.quantidade > 0;
            const abs = Math.abs(m.quantidade);
            const texto = m.tipo === "valor" ? brl(abs) : `${abs.toLocaleString("pt-BR")} disparos`;
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="text-neutral-800">
                    <span className="mr-1.5 text-neutral-400">{ddmm(m.data)}</span>
                    {m.descricao || ORIGEM_CREDITO[m.origem] || m.origem}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-neutral-500">{ORIGEM_CREDITO[m.origem] ?? m.origem}</span>
                    {m.rental_id && (
                      <Atalho href={linkLocacao(clientId, m.rental_id)} emoji="📦">
                        Locação
                      </Atalho>
                    )}
                  </div>
                </div>
                <span className={`flex-shrink-0 font-semibold ${positivo ? "text-emerald-600" : "text-rose-600"}`}>
                  {positivo ? "+" : "−"} {texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
