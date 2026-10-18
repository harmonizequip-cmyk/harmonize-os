"use client";

// Importar fatura do cartão: o dono exporta o OFX no app do banco e escolhe o
// arquivo aqui. Mostra a prévia (agrupada por estabelecimento, com categoria) e
// grava de uma vez. Contas em lib/importar-fatura.ts; gravação por importar_compras_cartao.

import { useEffect, useMemo, useState } from "react";
import { X, FileUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { rotuloFatura } from "@/lib/cartao";
import { hojeLocal } from "@/lib/period";
import { avisar } from "@/components/Dialogos";
import {
  decodificarArquivo,
  lerFatura,
  refDoNomeDoArquivo,
  planejarImportacao,
  refDaFatura,
  sugerirCategoria,
  type FaturaLida,
} from "@/lib/importar-fatura";

interface CartaoOpcao {
  id: string;
  nome: string;
  dia_vencimento: number;
}

interface Categoria {
  id: string;
  name: string;
}

const campo = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const LOTE = 300;

export default function ImportarFaturaModal({
  cartoes,
  cartaoInicial,
  categorias,
  onClose,
  onFeito,
}: {
  cartoes: CartaoOpcao[];
  cartaoInicial: string | null;
  categorias: Categoria[];
  onClose: () => void;
  onFeito: () => void;
}) {
  const supabase = createClient();
  const [cartaoId, setCartaoId] = useState(cartaoInicial ?? cartoes[0]?.id ?? "");
  const cartao = cartoes.find((c) => c.id === cartaoId) ?? null;
  const [fatura, setFatura] = useState<FaturaLida | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [modo, setModo] = useState<"paga" | "aberta">("paga");
  const [faturaRef, setFaturaRef] = useState("");
  // Pagamentos feitos no banco só entram a partir desta data (vazio = não registrar nenhum).
  const [pagamentosDesde, setPagamentosDesde] = useState(hojeLocal());
  const [categoriaPorNome, setCategoriaPorNome] = useState<Record<string, string>>({});
  // chave -> fatura em que a linha já está lançada neste cartão.
  const [jaLancadas, setJaLancadas] = useState<Map<string, string>>(new Map());
  // Só libera a prévia e o botão depois de conferir o que já está lançado (senão parece duplicado).
  const [conferido, setConferido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const plano = useMemo(
    () => (fatura && cartao ? planejarImportacao(fatura, { diaVencimento: cartao.dia_vencimento, modo, faturaRef: faturaRef || undefined, pagamentosDesde: pagamentosDesde || null }) : null),
    [fatura, cartao, modo, faturaRef, pagamentosDesde]
  );

  // A data de corte dos pagamentos fica guardada por cartão: nas próximas importações vale a primeira
  // escolhida, para não perder pagamento feito no meio do mês (os repetidos são pulados).
  const chaveCorte = `harmonize-import-corte-${cartaoId}`;
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(chaveCorte);
      if (guardada) setPagamentosDesde(guardada);
    } catch {
      // sem armazenamento: fica a data de hoje
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartaoId]);

  // Fatura de referência padrão: a data no nome do arquivo (Nubank_2026-10-02 = vence em outubro);
  // sem ela, o primeiro vencimento depois do fechamento.
  useEffect(() => {
    if (!fatura || !cartao) return;
    const doNome = refDoNomeDoArquivo(nomeArquivo);
    if (doNome) setFaturaRef(doNome);
    else if (fatura.fim) setFaturaRef(refDaFatura(fatura.fim, cartao.dia_vencimento));
    else setFaturaRef("");
  }, [fatura, cartao, nomeArquivo]);

  // Linhas que já foram lançadas antes (mesma chave neste cartão) ficam de fora.
  useEffect(() => {
    if (!cartaoId || !fatura) return;
    let vivo = true;
    setConferido(false);
    (async () => {
      // O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
      const mapa = new Map<string, string>();
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("transactions")
          .select("importacao_chave, fatura_ref")
          .eq("cartao_id", cartaoId)
          .not("importacao_chave", "is", null)
          .order("id")
          .range(de, de + 999);
        if (!vivo) return;
        if (error) {
          setErro(`Não consegui conferir o que já foi lançado: ${error.message}`);
          return;
        }
        const linhas = (data ?? []) as { importacao_chave: string; fatura_ref: string | null }[];
        for (const r of linhas) mapa.set(r.importacao_chave, r.fatura_ref ?? "");
        if (linhas.length < 1000) break;
      }
      setJaLancadas(mapa);
      setConferido(true);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartaoId, fatura]);

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    setErro(null);
    try {
      const lida = lerFatura(decodificarArquivo(await arq.arrayBuffer()));
      setFatura(lida);
      setNomeArquivo(arq.name);
      // Palpite de categoria por estabelecimento (o dono ajusta na prévia).
      const palpites: Record<string, string> = {};
      for (const l of lida.linhas) if (!(l.descricao in palpites)) palpites[l.descricao] = sugerirCategoria(l.descricao, categorias);
      setCategoriaPorNome(palpites);
    } catch (err) {
      setFatura(null);
      setErro((err as Error).message);
    }
  }

  // Os dois formatos usam chaves diferentes: misturar no mesmo cartão duplicaria compras.
  const misturaFormato = useMemo(() => {
    if (!fatura) return false;
    const chaves = Array.from(jaLancadas.keys());
    const existentesCsv = chaves.some((c) => c.startsWith("csv|"));
    const existentesOfx = chaves.some((c) => !c.startsWith("csv|"));
    return fatura.formato === "csv" ? existentesOfx : existentesCsv;
  }, [fatura, jaLancadas]);

  // Já lançada na mesma fatura (ou numa anterior) fica de fora. Parcela que estava numa fatura
  // futura e o banco trouxe para esta (antecipação) é movida para esta fatura.
  const novos = useMemo(
    () => (plano ? plano.itens.filter((i) => !jaLancadas.has(i.chave) || i.fatura_ref < (jaLancadas.get(i.chave) ?? "")) : []),
    [plano, jaLancadas]
  );
  const antecipadas = novos.filter((i) => jaLancadas.has(i.chave)).length;
  const repetidos = plano ? plano.itens.length - novos.length : 0;
  const compras = novos.filter((i) => i.tipo !== "pagamento");
  const pagamentos = novos.filter((i) => i.tipo === "pagamento");
  const total = compras.reduce((s, i) => s + i.valor, 0);
  const totalPagamentos = pagamentos.reduce((s, i) => s + i.valor, 0);

  // Por estabelecimento: quantas compras diferentes, o que cai nesta fatura e o que fica para os próximos meses.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; compras: Set<string>; agora: number; qtdAgora: number; depois: number; qtdDepois: number; total: number }>();
    for (const i of compras) {
      const g = mapa.get(i.nome) ?? { nome: i.nome, compras: new Set<string>(), agora: 0, qtdAgora: 0, depois: 0, qtdDepois: 0, total: 0 };
      g.compras.add(i.parcela_num ? i.grupo : i.chave);
      if (i.fatura_ref === plano?.faturaRef) {
        g.agora += i.valor;
        g.qtdAgora += 1;
      } else {
        g.depois += i.valor;
        g.qtdDepois += 1;
      }
      g.total += i.valor;
      mapa.set(i.nome, g);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [compras, plano]);

  const nestaFatura = compras.filter((i) => i.fatura_ref === plano?.faturaRef);
  const totalNesta = nestaFatura.reduce((s, i) => s + i.valor, 0);
  const totalDepois = total - totalNesta;

  const porFatura = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of compras) mapa.set(i.fatura_ref, (mapa.get(i.fatura_ref) ?? 0) + i.valor);
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [compras]);

  async function importar() {
    if (!cartao || novos.length === 0) return;
    setSalvando(true);
    setErro(null);
    let inseridos = 0;
    let pulados = 0;
    let movidos = 0;
    for (let i = 0; i < novos.length; i += LOTE) {
      const lote = novos.slice(i, i + LOTE).map((x) => ({
        chave: x.chave,
        grupo: x.grupo,
        data: x.data,
        valor: x.valor,
        descricao: x.descricao,
        fatura_ref: x.fatura_ref,
        parcela_num: x.parcela_num,
        parcelas_total: x.parcelas_total,
        tipo: x.tipo ?? "compra",
        category_id: x.tipo === "pagamento" ? null : categoriaPorNome[x.nome] || null,
      }));
      const { data, error } = await supabase.rpc("importar_compras_cartao", { p_cartao_id: cartao.id, p_itens: lote });
      if (error) {
        setSalvando(false);
        setErro(`${error.message}${inseridos ? ` (já entraram ${inseridos} antes do erro; importe de novo, as repetidas são puladas)` : ""}`);
        return;
      }
      inseridos += Number((data as { inseridos: number }).inseridos);
      pulados += Number((data as { repetidos: number }).repetidos);
      movidos += Number((data as { movidos?: number }).movidos ?? 0);
    }
    setSalvando(false);
    try {
      if (pagamentosDesde && !localStorage.getItem(chaveCorte)) localStorage.setItem(chaveCorte, pagamentosDesde);
    } catch {
      // sem armazenamento
    }
    avisar(
      `${inseridos} lançamento${inseridos === 1 ? "" : "s"} entraram no cartão ${cartao.nome}` +
        `${movidos ? `, ${movidos} parcela${movidos === 1 ? "" : "s"} antecipada${movidos === 1 ? "" : "s"} passaram para esta fatura` : ""}` +
        `${pulados ? ` (${pulados} já existiam)` : ""}.`
    );
    onFeito();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-semibold text-neutral-900">Importar fatura do cartão</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-neutral-500">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          {cartoes.length > 1 && (
            <label className="block text-xs text-neutral-600">
              Cartão
              <select className={`${campo} mt-1`} value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
                {cartoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-700 active:bg-neutral-50">
            <FileUp size={20} className="shrink-0 text-neutral-500" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{nomeArquivo || "Escolher o arquivo da fatura (.ofx ou .csv)"}</span>
              <span className="block text-[11px] text-neutral-500">No app do banco: fatura, exportar. Prefira o OFX.</span>
            </span>
            <input type="file" accept=".ofx,.OFX,.csv,.CSV,text/plain,text/csv,application/x-ofx" className="hidden" onChange={escolherArquivo} />
          </label>

          {erro && <p className="text-xs text-red-600">{erro}</p>}

          {fatura && !conferido && !erro && <p className="text-xs text-neutral-500">Conferindo o que já foi lançado...</p>}

          {fatura && plano && cartao && conferido && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-neutral-700">Esta fatura</p>
                <label className="flex cursor-pointer gap-2 rounded-xl border border-neutral-200 p-3 text-xs">
                  <input type="radio" name="modo" checked={modo === "paga"} onChange={() => setModo("paga")} className="mt-0.5" />
                  <span>
                    <b className="text-neutral-900">Já foi paga.</b> Cria só as parcelas que ainda faltam, nas faturas dos próximos meses.
                  </span>
                </label>
                <label className="flex cursor-pointer gap-2 rounded-xl border border-neutral-200 p-3 text-xs">
                  <input type="radio" name="modo" checked={modo === "aberta"} onChange={() => setModo("aberta")} className="mt-0.5" />
                  <span>
                    <b className="text-neutral-900">Está em aberto.</b> Lança tudo que está nela, mais as parcelas que ainda faltam.
                  </span>
                </label>
                <label className="block text-xs text-neutral-600">
                  Fatura de (mês do vencimento)
                  <input type="month" className={`${campo} mt-1`} value={faturaRef} onChange={(e) => setFaturaRef(e.target.value)} />
                </label>
              </div>

              {misturaFormato && (
                <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  Este cartão já tem compras importadas por {fatura.formato === "csv" ? "OFX" : "CSV"}. Importar também por {fatura.formato === "csv" ? "CSV" : "OFX"} pode duplicar as compras. Use sempre o mesmo formato.
                </p>
              )}

              <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700">
                <p>
                  Arquivo: {fatura.linhas.length} linhas
                  {fatura.saldo !== null && <>, total da fatura {formatCurrency(Math.abs(fatura.saldo))}</>}.
                </p>
                {plano.pagamentos.qtd > 0 && (
                  <p className="mt-1 text-neutral-500">
                    O arquivo tem {plano.pagamentos.qtd} pagamento{plano.pagamentos.qtd === 1 ? "" : "s"} ({formatCurrency(plano.pagamentos.total)}). Eles não são compras: veja abaixo quais serão registrados.
                  </p>
                )}
                {plano.creditos.qtd > 0 && modo === "paga" && (
                  <p className="mt-1 text-neutral-500">
                    {plano.creditos.qtd} desconto{plano.creditos.qtd === 1 ? "" : "s"} ou estorno{plano.creditos.qtd === 1 ? "" : "s"} do banco ({formatCurrency(plano.creditos.total)}) não entram: a fatura já foi paga.
                  </p>
                )}
                {plano.abatimentos.length > 0 && (
                  <div className="mt-2 border-t border-neutral-200 pt-2">
                    <p className="font-medium text-neutral-700">Descontos e estornos abatidos das compras</p>
                    <ul className="mt-1 space-y-0.5 text-neutral-600">
                      {plano.abatimentos.map((a, i) => (
                        <li key={i}>
                          {a.descricao}: -{formatCurrency(a.aplicado)}
                          {a.linhas > 0 ? ` em ${a.linhas} linha${a.linhas === 1 ? "" : "s"}` : ""}
                          {a.aplicado < a.valor - 0.009 && (
                            <span className="text-amber-700"> (sem compra correspondente para {formatCurrency(a.valor - a.aplicado)})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <label className="block text-xs text-neutral-600">
                Registrar os pagamentos feitos a partir de
                <input type="date" className={`${campo} mt-1`} value={pagamentosDesde} onChange={(e) => setPagamentosDesde(e.target.value)} />
                <span className="mt-1 block text-[11px] text-neutral-500">
                  Os pagamentos antigos já estão no saldo que você informou. Apague a data para não registrar nenhum.
                </span>
              </label>
              {pagamentos.length > 0 && (
                <p className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700">
                  {pagamentos.length} pagamento{pagamentos.length === 1 ? "" : "s"} de fatura, {formatCurrency(totalPagamentos)}, saem do seu saldo.
                </p>
              )}

              {novos.length === 0 ? (
                <p className="text-xs text-neutral-600">
                  {repetidos > 0 ? "Tudo deste arquivo já foi lançado antes." : "Nada para lançar com essa escolha."}
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {compras.length} lançamento{compras.length === 1 ? "" : "s"} novo{compras.length === 1 ? "" : "s"}, {formatCurrency(total)}
                    </p>
                    <p className="text-xs text-neutral-700">
                      Nesta fatura ({rotuloFatura(plano.faturaRef)}): {nestaFatura.length}, {formatCurrency(totalNesta)}
                    </p>
                    {compras.length > nestaFatura.length && (
                      <p className="text-xs text-neutral-700">
                        Parcelas dos próximos meses: {compras.length - nestaFatura.length}, {formatCurrency(totalDepois)}
                      </p>
                    )}
                    {antecipadas > 0 && (
                      <p className="text-[11px] text-neutral-500">
                        {antecipadas} parcela{antecipadas === 1 ? "" : "s"} antecipada{antecipadas === 1 ? "" : "s"}: já estavam em faturas futuras e passam para esta.
                      </p>
                    )}
                    {repetidos > 0 && (
                      <p className="text-[11px] text-neutral-500">
                        {repetidos} já {repetidos === 1 ? "estava lançada" : "estavam lançadas"} por uma importação anterior e {repetidos === 1 ? "fica" : "ficam"} de fora (não duplica).
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Por fatura: {porFatura.map(([r, v]) => `${rotuloFatura(r)} ${formatCurrency(v)}`).join(" · ")}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-neutral-700">Categoria de cada estabelecimento</p>
                    <p className="mb-1 text-[11px] text-neutral-500">Compras na mesma loja ficam juntas numa linha.</p>
                    <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                      {grupos.map((g) => (
                        <li key={g.nome} className="flex items-center gap-2 px-3 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-neutral-800">{g.nome}</span>
                            <span className="block text-[11px] text-neutral-500">
                              {g.compras.size} compra{g.compras.size === 1 ? "" : "s"}
                              {g.qtdAgora > 0 && ` · nesta fatura ${formatCurrency(g.agora)}`}
                              {g.qtdDepois > 0 && ` · próximos meses ${formatCurrency(g.depois)} (${g.qtdDepois} parcela${g.qtdDepois === 1 ? "" : "s"})`}
                            </span>
                          </span>
                          <select
                            className="w-36 shrink-0 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
                            value={categoriaPorNome[g.nome] ?? ""}
                            onChange={(e) => setCategoriaPorNome((c) => ({ ...c, [g.nome]: e.target.value }))}
                          >
                            <option value="">Sem categoria</option>
                            {categorias.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-neutral-200 px-4 py-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm text-neutral-600">
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando || !conferido || novos.length === 0}
            onClick={importar}
            className="flex-1 rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {salvando ? "Importando..." : novos.length ? `Importar ${novos.length}` : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
