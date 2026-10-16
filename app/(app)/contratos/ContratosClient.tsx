"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ContratoDados } from "@/lib/contrato-pdf";
import { Atalho, Atalhos } from "@/components/Atalhos";
import { linkEvento, linkLocacao } from "@/lib/atalhos";

interface ContratoRow {
  id: string;
  gerado_em: string;
  dados: ContratoDados;
  client_id: string;
  // Leva Y: mutuamente exclusivos — vem de uma locação já lançada
  // (rental_id) ou de uma pré-reserva assinada antes do procedimento
  // (reservation_id), nunca dos dois.
  rental_id: string | null;
  reservation_id: string | null;
  clients?: { name: string } | null;
}

// Atalho para o que gerou o contrato: a locação (na ficha) ou a reserva (na Agenda).
function AtalhoOrigem({ c, className = "" }: { c: ContratoRow; className?: string }) {
  return (
    <Atalhos className={className}>
      {c.rental_id && c.client_id && <Atalho href={linkLocacao(c.client_id, c.rental_id)} emoji="📦">Locação</Atalho>}
      {c.reservation_id && <Atalho href={linkEvento(c.reservation_id)} emoji="📅">Reserva</Atalho>}
    </Atalhos>
  );
}

function formatPeriodo(dados: ContratoDados): string {
  const { event_date, event_date_end } = dados.locacao;
  if (event_date_end && event_date_end !== event_date) {
    return `${formatDate(event_date)} a ${formatDate(event_date_end)}`;
  }
  return formatDate(event_date);
}

// Leva Y: contrato gerado a partir de uma pré-reserva ainda não tem
// valor fechado — mostrar "A apurar" em vez de tentar formatar null como
// moeda (Number(null) vira 0, o que mentiria um valor que não existe).
function formatValorOuApurar(dados: ContratoDados): string {
  return dados.locacao.calculated_value != null ? formatCurrency(Number(dados.locacao.calculated_value)) : "A apurar";
}

export default function ContratosClient({
  contratos,
  atingiuTeto,
}: {
  contratos: ContratoRow[];
  atingiuTeto: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();
  const linhas = termo
    ? contratos.filter((c) => (c.clients?.name ?? c.dados.contratante.nome ?? "").toLowerCase().includes(termo))
    : contratos;

  async function handleBaixarNovamente(contrato: ContratoRow) {
    setError(null);
    setBaixandoId(contrato.id);
    try {
      // Import dinâmico: só carrega a biblioteca de PDF (pesada) quando
      // alguém de fato clica em "Baixar de novo".
      const { gerarContratoPdfBlob, baixarPdfBlob, nomeArquivoContrato } = await import("@/lib/contrato-pdf");
      const blob = await gerarContratoPdfBlob(contrato.dados);
      baixarPdfBlob(blob, nomeArquivoContrato(contrato.dados));
    } catch {
      setError("Não foi possível gerar o PDF agora. Tente novamente.");
    } finally {
      setBaixandoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Contratos</h1>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente..."
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm sm:w-64"
        />
      </div>

      <p className="text-xs text-neutral-400">
        O PDF não fica salvo no sistema — cada linha abaixo é um registro de que um contrato foi gerado, com os dados
        exatos usados, para poder baixar de novo quando precisar.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Celular: cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {linhas.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <Link href={`/clientes/${c.client_id}`} className="text-sm font-medium text-brand-teal underline underline-offset-2">
                  {c.clients?.name ?? c.dados.contratante.nome}
                </Link>
                <p className="mt-0.5 text-xs text-neutral-500">{formatPeriodo(c.dados)}</p>
                <AtalhoOrigem c={c} className="mt-1.5" />
              </div>
              <span className="text-xs text-neutral-400">{formatDate(c.gerado_em.slice(0, 10))}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-medium text-brand-teal">{formatValorOuApurar(c.dados)}</span>
              <button
                onClick={() => handleBaixarNovamente(c)}
                disabled={baixandoId === c.id}
                className="rounded-lg bg-brand-teal/10 px-3 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-60"
              >
                {baixandoId === c.id ? "Gerando..." : "Baixar de novo"}
              </button>
            </div>
          </div>
        ))}
        {linhas.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl">
            Nenhum contrato gerado ainda.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Gerado em</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {formatDate(c.gerado_em.slice(0, 10))}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/clientes/${c.client_id}`} className="text-brand-teal underline underline-offset-2">
                    {c.clients?.name ?? c.dados.contratante.nome}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {formatPeriodo(c.dados)}
                  <AtalhoOrigem c={c} className="mt-1" />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-brand-teal">
                  {formatValorOuApurar(c.dados)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => handleBaixarNovamente(c)}
                    disabled={baixandoId === c.id}
                    className="rounded-lg bg-brand-teal/10 px-3 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-60"
                  >
                    {baixandoId === c.id ? "Gerando..." : "Baixar de novo"}
                  </button>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum contrato gerado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {atingiuTeto && (
        <p className="text-center text-xs text-neutral-400">Mostrando os {contratos.length} mais recentes.</p>
      )}
    </div>
  );
}
