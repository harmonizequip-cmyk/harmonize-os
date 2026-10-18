"use client";

// Desfazer importação de fatura: lista as importações feitas num cartão (por data e hora) e apaga
// a escolhida, ou tudo o que foi importado. Lançamento feito à mão não é tocado.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { rotuloFatura } from "@/lib/cartao";
import { avisar, confirmar } from "@/components/Dialogos";
import { agruparImportacoes, type LinhaImportada, type SessaoImportacao } from "@/lib/importar-fatura";

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function DesfazerImportacaoModal({
  cartaoId,
  cartaoNome,
  onClose,
  onFeito,
}: {
  cartaoId: string;
  cartaoNome: string;
  onClose: () => void;
  onFeito: () => void;
}) {
  const supabase = createClient();
  const [sessoes, setSessoes] = useState<SessaoImportacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  async function carregar() {
    // O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
    const todas: LinhaImportada[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase
        .from("transactions")
        .select("created_at, amount, fatura_ref, cartao_mov")
        .eq("cartao_id", cartaoId)
        .not("importacao_chave", "is", null)
        .order("id")
        .range(de, de + 999);
      if (error) {
        setErro(error.message);
        return;
      }
      const linhas = (data ?? []) as LinhaImportada[];
      todas.push(...linhas);
      if (linhas.length < 1000) break;
    }
    setSessoes(agruparImportacoes(todas.map((l) => ({ ...l, amount: Number(l.amount) }))));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartaoId]);

  async function desfazer(janela: { desde: string; ate: string } | null, descricao: string) {
    const ok = await confirmar({
      titulo: "Desfazer esta importação?",
      texto: `${descricao}. Os lançamentos importados saem do cartão ${cartaoNome}, e pagamentos importados voltam para o seu saldo. O que você lançou à mão não muda.`,
      confirmar: "Desfazer",
      perigo: true,
    });
    if (!ok) return;
    setApagando(true);
    setErro(null);
    const { data, error } = await supabase.rpc("desfazer_importacao_cartao", {
      p_cartao_id: cartaoId,
      p_desde: janela?.desde ?? null,
      p_ate: janela?.ate ?? null,
    });
    setApagando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    const n = Number((data as { removidos: number }).removidos);
    avisar(`${n} lançamento${n === 1 ? "" : "s"} removido${n === 1 ? "" : "s"}.`);
    onFeito();
  }

  const totalGeral = sessoes?.reduce((s, x) => s + x.lancamentos + x.pagamentos, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h2 className="text-base font-semibold text-neutral-900">Desfazer importação</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-neutral-500">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-4">
          <p className="text-xs text-neutral-600">
            Importações feitas no cartão <b>{cartaoNome}</b>. Toque em uma para desfazer só ela.
          </p>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          {sessoes === null && !erro && <p className="text-xs text-neutral-500">Carregando...</p>}
          {sessoes?.length === 0 && <p className="text-sm text-neutral-600">Nenhuma importação neste cartão.</p>}

          {sessoes?.map((s) => (
            <button
              key={s.desde}
              type="button"
              disabled={apagando}
              onClick={() =>
                desfazer(
                  { desde: s.desde, ate: s.ate },
                  `Importação de ${quando(s.inicio)}: ${s.lancamentos} compra${s.lancamentos === 1 ? "" : "s"} (${formatCurrency(s.total)})${s.pagamentos ? ` e ${s.pagamentos} pagamento${s.pagamentos === 1 ? "" : "s"}` : ""}`
                )
              }
              className="block w-full rounded-2xl border border-neutral-200 p-3 text-left active:bg-neutral-50 disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-neutral-900">{quando(s.inicio)}</p>
              <p className="text-xs text-neutral-600">
                {s.lancamentos} compra{s.lancamentos === 1 ? "" : "s"}, {formatCurrency(s.total)}
                {s.pagamentos > 0 && ` · ${s.pagamentos} pagamento${s.pagamentos === 1 ? "" : "s"}`}
              </p>
              {s.faturaDe && (
                <p className="text-[11px] text-neutral-500">
                  Faturas de {rotuloFatura(s.faturaDe)}
                  {s.faturaAte !== s.faturaDe && ` a ${rotuloFatura(s.faturaAte)}`}
                </p>
              )}
              <p className="mt-1 text-[11px] font-medium text-red-600">Desfazer esta</p>
            </button>
          ))}

          {sessoes && sessoes.length > 1 && (
            <button
              type="button"
              disabled={apagando}
              onClick={() => desfazer(null, `Tudo o que foi importado neste cartão (${totalGeral} lançamentos)`)}
              className="w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
            >
              Desfazer todas as importações
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
