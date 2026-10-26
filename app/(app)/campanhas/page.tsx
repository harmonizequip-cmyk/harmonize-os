import Link from "next/link";
import { ChevronRight, ImageIcon, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { carregarListaCampanhas } from "@/lib/carregar-campanhas";
import { IconeChip } from "@/components/ui/Visual";
import { FaltaSql, diaDe } from "./comum";
import BotaoNovaCampanha from "./BotaoNovaCampanha";

// Campanhas: arte fixa + mensagem enviadas um a um pelo WhatsApp. Lista das
// ativas e, em aba separada, das arquivadas. Regras em lib/campanhas.ts.
export const dynamic = "force-dynamic";

export default async function CampanhasPage(props: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await props.searchParams;
  const aba = sp.aba === "arquivadas" ? "arquivadas" : "ativas";
  const supabase = createClient();
  const r = await carregarListaCampanhas(supabase);

  const cabecalho = (
    <section className="cartao relative overflow-hidden p-5">
      <div className="flex items-start gap-3">
        <IconeChip icone={Megaphone} cor="rosa" tamanho="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-neutral-900">Campanhas</h1>
          <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">
            Uma arte e uma mensagem, enviadas uma a uma pelo WhatsApp. Nada sai sozinho: você toca em cada contato.
          </p>
        </div>
      </div>
      {!r.faltaSql && <BotaoNovaCampanha />}
    </section>
  );

  if (r.faltaSql) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <FaltaSql />
      </div>
    );
  }

  const ativas = r.campanhas.filter((c) => !c.arquivada);
  const arquivadas = r.campanhas.filter((c) => c.arquivada);
  const lista = aba === "arquivadas" ? arquivadas : ativas;

  return (
    <div className="space-y-4">
      {cabecalho}

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1">
        {(
          [
            ["ativas", `Ativas · ${ativas.length}`],
            ["arquivadas", `Arquivadas · ${arquivadas.length}`],
          ] as const
        ).map(([a, rotulo]) => (
          <Link
            key={a}
            href={a === "ativas" ? "/campanhas" : "/campanhas?aba=arquivadas"}
            replace
            className={`rounded-xl py-2 text-center text-xs font-bold transition ${aba === a ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {lista.length === 0 ? (
        <section className="cartao p-5 text-center text-sm text-neutral-500">
          {aba === "arquivadas" ? "Nenhuma campanha arquivada." : "Nenhuma campanha ainda. Toque em Nova campanha para criar a primeira."}
        </section>
      ) : (
        <div className="space-y-2.5">
          {lista.map((c) => (
            <Link key={c.id} href={`/campanhas/${c.id}`} className="cartao flex items-center gap-3 p-4 active:bg-neutral-50">
              <IconeChip icone={c.arte_path ? ImageIcon : Megaphone} cor={c.arquivada ? "cinza" : "rosa"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-neutral-900">{c.nome}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {c.recebidos} {c.recebidos === 1 ? "enviada" : "enviadas"}
                  {c.contagem.respondeu > 0 && ` · ${c.contagem.respondeu} ${c.contagem.respondeu === 1 ? "respondeu" : "responderam"}`}
                  {c.adquiriram > 0 && ` · ${c.adquiriram} ${c.adquiriram === 1 ? "adquiriu" : "adquiriram"}`}
                  {c.contagem.agendou > 0 && ` · ${c.contagem.agendou} ${c.contagem.agendou === 1 ? "agendou" : "agendaram"}`}
                  {c.contagem.nao_quer > 0 && ` · ${c.contagem.nao_quer} não ${c.contagem.nao_quer === 1 ? "quer" : "querem"}`}
                  {c.contagem.pulado > 0 && ` · ${c.contagem.pulado} ${c.contagem.pulado === 1 ? "pulada" : "puladas"}`}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">Criada em {diaDe(c.created_at)}</p>
              </div>
              <ChevronRight size={18} className="flex-shrink-0 text-neutral-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
