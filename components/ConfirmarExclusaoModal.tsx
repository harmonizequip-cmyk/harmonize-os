"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";

// Prévia devolvida pela função preview_exclusao do banco. A conta de o
// que sai junto é feita lá, e não aqui, porque é o mesmo lugar que vai
// efetivamente apagar: se a regra fosse duplicada no front, um dia as
// duas discordariam e a tela prometeria uma coisa enquanto o banco faz
// outra.
interface Preview {
  tabela: string;
  id: string;
  alvo: string;
  locacoes: number;
  eventos: number;
  lancamentos: number;
  tarefas: number;
  valor_locacoes: number;
  valor_lancamentos: number;
  itens: string[];
  aviso: string | null;
}

const PALAVRA_CONFIRMACAO = "APAGAR";

export default function ConfirmarExclusaoModal({
  table,
  id,
  onCancel,
  onDeleted,
}: {
  table: string;
  id: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase
      .rpc("preview_exclusao", { p_table: table, p_id: id })
      .then(({ data, error }) => {
        if (!ativo) return;
        setCarregando(false);
        if (error) {
          // A mensagem de "apenas administradores" vem do próprio banco.
          // Mostrar ela crua é melhor do que traduzir, porque é ela que
          // diz a verdade sobre o que aconteceu.
          setErro(error.message || "Não foi possível calcular o que será apagado.");
          return;
        }
        setPreview(data as Preview);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, id]);

  async function handleApagar() {
    setApagando(true);
    setErro(null);
    const { error } = await supabase.rpc("delete_record_forever", {
      p_table: table,
      p_id: id,
    });
    setApagando(false);
    if (error) {
      setErro(error.message || "Não foi possível excluir. Tente novamente.");
      return;
    }
    onDeleted();
  }

  const podeApagar = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO && !apagando;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/95 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">Excluir para sempre</h2>
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          Esta ação não tem desfazer. Confira abaixo o que sai junto.
        </p>

        {carregando && (
          <p className="py-6 text-center text-sm text-neutral-400">Calculando o que será apagado...</p>
        )}

        {erro && !preview && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
            {erro}
          </div>
        )}

        {preview && (
          <>
            <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Registro</p>
              <p className="mt-0.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">{preview.alvo}</p>
            </div>

            {preview.aviso && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
                ⚠️ {preview.aviso}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/10">
              <p className="text-xs font-medium text-red-800 dark:text-red-400">Vai apagar junto:</p>
              <ul className="mt-1 space-y-0.5">
                {preview.itens.map((item) => (
                  <li key={item} className="text-sm text-red-700 dark:text-red-400">
                    · {item}
                  </li>
                ))}
              </ul>

              {/* Os dois valores aparecem separados porque medem coisas
                  diferentes: um é o que some do faturamento, o outro é o
                  que some do caixa. Quando alguém já apagou o lançamento
                  antes, eles divergem, e é justamente aí que importa ver
                  os dois. */}
              {(preview.valor_locacoes > 0 || preview.valor_lancamentos > 0) && (
                <div className="mt-2 space-y-0.5 border-t border-red-200 pt-2 dark:border-red-900/40">
                  {preview.valor_locacoes > 0 && (
                    <div className="flex items-center justify-between text-xs text-red-800 dark:text-red-400">
                      <span>Sai do faturamento</span>
                      <span className="font-semibold">{formatCurrency(preview.valor_locacoes)}</span>
                    </div>
                  )}
                  {preview.valor_lancamentos > 0 && (
                    <div className="flex items-center justify-between text-xs text-red-800 dark:text-red-400">
                      <span>Sai do caixa</span>
                      <span className="font-semibold">{formatCurrency(preview.valor_lancamentos)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Para confirmar, escreva {PALAVRA_CONFIRMACAO}
              </label>
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && podeApagar && handleApagar()}
                placeholder={PALAVRA_CONFIRMACAO}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-center text-sm tracking-widest dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleApagar}
                disabled={!podeApagar}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600"
              >
                {apagando ? "Apagando..." : "Apagar para sempre"}
              </button>
            </div>

            <p className="mt-3 text-center text-[11px] text-neutral-400">
              Fica registrado no histórico de movimentações quem apagou e quando.
            </p>
          </>
        )}

        {!preview && !carregando && (
          <button
            onClick={onCancel}
            className="mt-4 w-full rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}
