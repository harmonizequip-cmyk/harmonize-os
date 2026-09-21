"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { PricingCliff } from "@/lib/pricing-opportunity";

interface TopClient {
  name: string;
  total: number;
}

interface OrigemRow {
  origem: string;
  total: number;
  convertidos: number;
  taxa: number;
}

interface FollowupRow {
  label: string;
  count: number;
}

interface WeekdayRow {
  label: string;
  count: number;
}

interface RevenueMixRow {
  name: string;
  total: number;
  share: number;
}

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

const ACCENT_CLASSES: Record<string, string> = {
  teal: "border-brand-teal/30 bg-brand-teal/5 text-brand-teal dark:border-brand-teal/20 dark:bg-brand-teal/10",
  amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400",
  pink: "border-brand-pink/30 bg-brand-pink/5 text-brand-pink-dark dark:border-brand-pink/20 dark:bg-brand-pink/10 dark:text-brand-pink",
  blue: "border-brand-blue/30 bg-brand-blue/5 text-brand-blue dark:border-brand-blue/20 dark:bg-brand-blue/10",
};

// Card padrão dos relatórios: sempre mostra a conclusão em uma linha
// (o "summary"), e só quem quiser o porquê expande. Ninguém devia
// precisar ler sete parágrafos pra saber se algo merece atenção.
function Card({
  icon,
  title,
  summary,
  accent = "teal",
  children,
}: {
  icon: string;
  title: string;
  summary: string;
  accent?: "teal" | "amber" | "pink" | "blue";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`overflow-hidden rounded-2xl border ${ACCENT_CLASSES[accent]}`}>
      <button
        onClick={() => children && setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold">
            {icon} {title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{summary}</p>
        </div>
        {children && (
          <span className="mt-0.5 flex-shrink-0 text-xs text-neutral-400">{open ? "▲" : "▼"}</span>
        )}
      </button>
      {open && children && (
        <div className="border-t border-black/5 p-4 pt-3 dark:border-white/10">{children}</div>
      )}
    </div>
  );
}

export default function RelatoriosClient({
  cliff,
  dealsInDeadZoneCount,
  deadZoneTotal,
  nearMissCount,
  nearMissThreshold,
  pendingFeeCount,
  pendingFeeTotal,
  pendingFeeNames,
  totalRevenue,
  topClients,
  top3Share,
  origemBreakdown,
  followupBreakdown,
  nutricaoCount,
  weekdayBreakdown,
  revenueMix,
}: {
  cliff: PricingCliff | null;
  dealsInDeadZoneCount: number;
  deadZoneTotal: number;
  nearMissCount: number;
  nearMissThreshold: number;
  pendingFeeCount: number;
  pendingFeeTotal: number;
  pendingFeeNames: string[];
  totalRevenue: number;
  topClients: TopClient[];
  top3Share: number;
  origemBreakdown: OrigemRow[];
  followupBreakdown: FollowupRow[];
  nutricaoCount: number;
  weekdayBreakdown: WeekdayRow[];
  revenueMix: RevenueMixRow[];
}) {
  // Origem "vencedora": só entra na conclusão se tiver pelo menos 3 leads
  // (senão um único lead convertido vira "100% de conversão", que é
  // estatisticamente vazio e só atrapalharia a leitura).
  const meaningfulOrigens = origemBreakdown.filter((o) => o.total >= 3);
  const bestOrigem = [...meaningfulOrigens].sort((a, b) => b.taxa - a.taxa)[0] ?? null;

  // Dia mais vazio, ignorando domingo (nunca é sugerido como dia útil
  // em nenhum outro lugar do sistema, então não faz sentido destacar
  // aqui como "oportunidade").
  const weekdaysExceptSunday = weekdayBreakdown.filter((w) => w.label !== "Domingo");
  const emptiestWeekday = [...weekdaysExceptSunday].sort((a, b) => a.count - b.count)[0] ?? null;
  const maxWeekdayCount = Math.max(...weekdayBreakdown.map((w) => w.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Relatórios</h1>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Diferente do radar do Dashboard (dias livres × leads parados, pra ação imediata), esta tela cruza pontos
          estruturais do negócio — coisas que valem revisar de vez em quando, não todo dia. Tudo calculado em cima
          dos dados reais, atualizado a cada vez que você abre a tela.
        </p>
      </div>

      <div className="space-y-3">
        {cliff ? (
          <Card
            icon="🎯"
            title="Degrau de incentivo: rodar mais disparos sai mais barato"
            summary={`${nearMissCount} ${
              nearMissCount === 1 ? "locação do histórico ficou" : "locações do histórico ficaram"
            } perto de ${fmtInt(cliff.peakShots)} disparos sem cruzar a linha — candidatas a um empurrãozinho na
              próxima.`}
            accent="teal"
          >
            <div className="space-y-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p>
                A tabela hoje cobra {formatCurrency(cliff.peakValue)} para {fmtInt(cliff.peakShots)} disparos (o topo
                da faixa intermediária). A partir de {fmtInt(cliff.cliffStartShots)} disparos, a taxa menor passa a
                valer sobre TODO o excedente, e o valor cai para {formatCurrency(cliff.cliffStartValue)} — uma
                diferença de {formatCurrency(cliff.dropAmount)}. É esse degrau que dá ao cliente um motivo concreto
                pra rodar mais um pouco em vez de parar perto do limite.
              </p>
              <p>
                {nearMissCount > 0
                  ? `${nearMissCount} ${
                      nearMissCount === 1 ? "locação" : "locações"
                    } do seu histórico pararam entre ${fmtInt(nearMissThreshold)} e ${fmtInt(
                      cliff.peakShots
                    )} disparos — perto o bastante da linha pra valer avisar, na hora do atendimento, que rodar mais
                    um pouco reduz o valor total.`
                  : "Nenhuma locação do seu histórico parou perto da linha sem cruzar — sinal de que o degrau já está sendo bem aproveitado, ou de que ainda não surgiu a situação."}
              </p>
              <p>
                {dealsInDeadZoneCount > 0
                  ? `${dealsInDeadZoneCount} ${
                      dealsInDeadZoneCount === 1 ? "locação já cruzou" : "locações já cruzaram"
                    } a linha e aproveitou a taxa menor, somando ${formatCurrency(deadZoneTotal)} cobrados nelas.`
                  : "Ainda nenhuma locação do histórico cruzou a linha pra aproveitar a taxa menor."}
              </p>
            </div>
          </Card>
        ) : (
          <Card
            icon="ℹ️"
            title="Sem degrau de incentivo configurado"
            summary="A configuração atual de preços não tem um ponto em que rodar mais disparos reduza o valor total."
            accent="blue"
          />
        )}

        <Card
          icon="💳"
          title="Taxa de reserva parada"
          summary={
            pendingFeeCount > 0
              ? `${pendingFeeCount} ${
                  pendingFeeCount === 1 ? "cliente está" : "clientes estão"
                } com taxa de reserva pendente — ${formatCurrency(pendingFeeTotal)} para cobrar.`
              : "Nenhuma taxa de reserva pendente no momento."
          }
          accent="amber"
        >
          {pendingFeeNames.length > 0 && (
            <div className="sp
