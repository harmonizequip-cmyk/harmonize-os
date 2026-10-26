import Link from "next/link";
import { CalendarCheck, ChevronRight, MapPin, MessageCircle, Target } from "lucide-react";
import { IconeChip } from "@/components/ui/Visual";
import type { PlanoMeta } from "@/lib/plano-meta";

/**
 * Plano para bater a meta (logo abaixo do destaque do mês): o que fazer com o
 * "faltam N". Mostra datas livres, as que têm gente perto e quem chamar, e leva
 * direto à lista que resolve (Encaixe ou Relacionamento). Conta em lib/plano-meta.ts.
 */
export default function PlanoDaMeta({ plano }: { plano: PlanoMeta }) {
  const chips = [
    { icone: CalendarCheck, texto: `${plano.diasLivres} ${plano.diasLivres === 1 ? "data livre" : "datas livres"}` },
    ...(plano.datasComGente > 0 ? [{ icone: MapPin, texto: `${plano.datasComGente} com gente perto` }] : []),
    ...(plano.paraChamar > 0 ? [{ icone: MessageCircle, texto: `${plano.paraChamar} para chamar` }] : []),
  ];
  return (
    <section className="cartao p-4" aria-label="Plano para bater a meta">
      <div className="flex items-start gap-3">
        <IconeChip icone={Target} cor={plano.naoCabe ? "ambar" : "teal"} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Plano para a meta</p>
          <p className="mt-0.5 text-[14px] font-semibold leading-snug text-neutral-900">{plano.frase}</p>
          {plano.porSemana !== null && (
            <p className="mt-1 text-[12px] text-neutral-500">
              Ritmo que a meta pede: {plano.porSemana} {plano.porSemana === 1 ? "locação" : "locações"} por semana até o fim do mês.
            </p>
          )}
        </div>
      </div>
      {plano.semReserva > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.texto} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
              <c.icone size={12} /> {c.texto}
            </span>
          ))}
        </div>
      )}
      {(plano.principal || plano.secundaria) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {plano.principal && (
            <Link
              href={plano.principal.href}
              className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-brand-teal px-3 text-sm font-bold text-white active:opacity-90"
            >
              {plano.principal.rotulo}
              <ChevronRight size={16} />
            </Link>
          )}
          {plano.secundaria && (
            <Link
              href={plano.secundaria.href}
              className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-neutral-100 px-3 text-sm font-bold text-neutral-700 active:bg-neutral-200"
            >
              {plano.secundaria.rotulo}
              <ChevronRight size={16} />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
