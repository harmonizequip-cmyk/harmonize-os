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
            <div className="space-y-1">
              {pendingFeeNames.map((name, i) => (
                <p key={i} className="text-xs text-neutral-700 dark:text-neutral-300">
                  · {name}
                </p>
              ))}
            </div>
          )}
        </Card>

        <Card
          icon="⚠️"
          title="Concentração de receita"
          summary={
            topClients.length > 0
              ? `Os ${Math.min(3, topClients.length)} maiores clientes respondem por ${fmtPct(
                  top3Share
                )} de tudo que já entrou (${formatCurrency(totalRevenue)} no total).`
              : "Ainda sem lançamentos de entrada suficientes para calcular."
          }
          accent="blue"
        >
          <div className="space-y-1.5">
            {topClients.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-neutral-700 dark:text-neutral-300">
                  {i + 1}. {c.name}
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {formatCurrency(c.total)} · {totalRevenue > 0 ? fmtPct(c.total / totalRevenue) : "0%"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Quanto mais concentrado, maior o risco de um único cliente parar de fechar e derrubar o caixa do mês.
          </p>
        </Card>

        <Card
          icon="📍"
          title="De onde vêm os clientes que fecham"
          summary={
            bestOrigem
              ? `"${bestOrigem.origem}" converte melhor: ${fmtPct(bestOrigem.taxa)} dos leads viram cliente.`
              : "Ainda sem dados de origem suficientes pra apontar um canal melhor que outro."
          }
          accent="teal"
        >
          <div className="space-y-1.5">
            {origemBreakdown.map((o) => (
              <div key={o.origem} className="flex items-center justify-between text-xs">
                <span className="text-neutral-700 dark:text-neutral-300">{o.origem}</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {o.convertidos}/{o.total} · {fmtPct(o.taxa)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card
          icon="🔁"
          title="Onde as tentativas de contato perdem força"
          summary={`${nutricaoCount} ${
            nutricaoCount === 1 ? "cliente esfriou" : "clientes esfriaram"
          } depois de esgotar as 5 tentativas de follow-up.`}
          accent="amber"
        >
          <div className="space-y-1.5">
            {followupBreakdown.map((f) => (
              <div key={f.label} className="flex items-center justify-between text-xs">
                <span className="text-neutral-700 dark:text-neutral-300">{f.label}</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{f.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Se a contagem cai muito rápido de uma tentativa pra outra, vale mudar a abordagem (mensagem, canal ou
            horário) antes de chegar lá, em vez de só repetir a mesma tentativa 5 vezes.
          </p>
        </Card>

        <Card
          icon="📅"
          title="Dias da semana mais vazios"
          summary={
            emptiestWeekday
              ? `${emptiestWeekday.label} é o dia com menos eventos agendados no histórico (${emptiestWeekday.count}).`
              : "Ainda sem eventos suficientes pra um padrão confiável."
          }
          accent="blue"
        >
          <div className="space-y-1.5">
            {weekdayBreakdown.map((w) => (
              <div key={w.label} className="flex items-center gap-2 text-xs">
                <span className="w-16 flex-shrink-0 text-neutral-600 dark:text-neutral-300">{w.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-brand-blue"
                    style={{ width: `${(w.count / maxWeekdayCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 flex-shrink-0 text-right text-neutral-400">{w.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Dia parado é agenda livre pra oferecer com desconto, promoção relâmpago, ou pra puxar os leads parados do
            radar do Dashboard.
          </p>
        </Card>

        <Card
          icon="🧪"
          title="De onde vem o dinheiro"
          summary={
            revenueMix[0]
              ? `"${revenueMix[0].name}" é a maior fatia: ${fmtPct(revenueMix[0].share)} da receita.`
              : "Ainda sem lançamentos suficientes pra calcular o mix."
          }
          accent="teal"
        >
          <div className="space-y-1.5">
            {revenueMix.map((r) => (
              <div key={r.name} className="flex items-center justify-between text-xs">
                <span className="text-neutral-700 dark:text-neutral-300">{r.name}</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {formatCurrency(r.total)} · {fmtPct(r.share)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Se quase tudo depende de uma única linha, vale pensar em diversificar (mentoria, novos serviços,
            parcerias) pra não ficar refém de um único produto.
          </p>
        </Card>
      </div>
    </div>
  );
}
