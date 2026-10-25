import Link from "next/link";
import { CalendarCheck, MapPin, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { carregarRelacionamento } from "@/lib/carregar-relacionamento";
import { carregarEncaixe } from "@/lib/carregar-encaixe";
import { mensagemEncaixe } from "@/lib/encaixe";
import { fetchPreferencias } from "@/lib/settings";
import { ROTULO_CLASSE } from "@/lib/relacionamento";
import { saudacaoCurta } from "@/lib/saudacao";
import { buildWhatsAppLink } from "@/lib/format";
import HeroTela from "@/components/ui/HeroTela";
import { LinkCliente } from "@/components/Atalhos";
import MenuAtalhosCliente from "@/components/MenuAtalhosCliente";

// Encaixe de datas livres: dias sem HIPRO marcado com atendimento no dia
// anterior ou seguinte, e quem está perto (até RAIO_KM) para oferecer a data.
// Regras em lib/encaixe.ts. ?data=AAAA-MM-DD mostra só aquele dia (vem do
// cancelamento ou reagendamento).
export const dynamic = "force-dynamic";

function dataLonga(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export default async function EncaixePage(props: { searchParams: Promise<{ data?: string }> }) {
  const sp = await props.searchParams;
  const somenteDia = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : null;
  const hoje = hojeLocal();
  const supabase = createClient();
  const { encaixe, relacionamento, mensagens } = await fetchPreferencias(supabase);
  const RAIO_KM = encaixe.raioKm;
  const POR_DATA = encaixe.porData;
  let erro: string | null = null;
  let lista: Awaited<ReturnType<typeof carregarEncaixe>> = [];
  try {
    lista = await carregarEncaixe(supabase, hoje, {
      somenteDia,
      encaixe,
      pessoas: await carregarRelacionamento(supabase, hoje, relacionamento),
    });
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não consegui montar o encaixe.";
  }
  const totalPessoas = lista.reduce((s, o) => s + o.candidatas.length, 0);

  return (
    <div className="space-y-4">
      <HeroTela
        etiqueta="Agenda · encaixe"
        rotulo={somenteDia ? `Data livre: ${dataLonga(somenteDia)}` : "Datas livres para encaixar"}
        valor={somenteDia ? totalPessoas : lista.length}
        apoio={
          somenteDia
            ? `${totalPessoas === 1 ? "pessoa perto" : "pessoas perto"} de onde você vai estar`
            : `nos próximos ${encaixe.diasAFrente} dias, com atendimento no dia anterior ou seguinte · até ${RAIO_KM} km`
        }
        chips={[{ texto: `Raio de ${RAIO_KM} km em linha reta`, icone: MapPin }]}
      />
      <h1 className="sr-only">Encaixe de datas livres</h1>

      {erro && <p className="cartao p-4 text-sm text-rose-700">{erro}</p>}

      {!erro && lista.length === 0 && (
        <div className="cartao p-5 text-sm text-neutral-600">
          {somenteDia ? (
            <>
              Nada para encaixar em {dataLonga(somenteDia)}. Pode ser que o dia não esteja livre nos dois HIPROs, que você não
              tenha atendimento no dia anterior nem no seguinte, ou que ninguém sem reserva more a até {RAIO_KM} km.
            </>
          ) : (
            <>Nenhuma data livre colada a um atendimento nos próximos {encaixe.diasAFrente} dias com alguém por perto.</>
          )}
          {somenteDia && (
            <Link href="/agenda/encaixe" className="mt-3 block font-semibold text-brand-teal-dark">
              Ver todas as datas para encaixar
            </Link>
          )}
        </div>
      )}

      {lista.map((o) => (
        <section key={o.data} className="cartao p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <CalendarCheck size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold capitalize text-neutral-900">{dataLonga(o.data)}</p>
              <p className="text-xs text-neutral-500">
                Você vai estar em{" "}
                {o.ancoras
                  .map((a) => `${a.cidade} (${a.dia < o.data ? "dia anterior" : "dia seguinte"})`)
                  .join(" e ")}
              </p>
            </div>
            <Link href={`/agenda?date=${o.data}`} className="whitespace-nowrap text-xs font-semibold text-brand-teal-dark">
              Abrir dia
            </Link>
          </div>

          <ul className="mt-3 divide-y divide-neutral-100">
            {o.candidatas.slice(0, POR_DATA).map((c) => {
              const classe = ROTULO_CLASSE[c.pessoa.classe];
              const zap = buildWhatsAppLink(c.pessoa.whatsapp, mensagemEncaixe(c.pessoa, o.data, c.perto, saudacaoCurta, mensagens));
              return (
                <li key={c.pessoa.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      <LinkCliente id={c.pessoa.id}>{c.pessoa.displayName || c.pessoa.nome}</LinkCliente>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-neutral-500">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${classe.cor}`}>{classe.rotulo}</span>
                      <span>
                        {c.pessoa.cidade} · ~{Math.round(c.km)} km de {c.perto}
                      </span>
                      {c.pessoa.devida && <span className="font-semibold text-amber-600">hora de conversar</span>}
                    </p>
                  </div>
                  {zap ? (
                    <a
                      href={zap}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-700"
                    >
                      <MessageCircle size={15} /> Oferecer
                    </a>
                  ) : (
                    <span className="flex-shrink-0 text-[11px] text-neutral-400">sem WhatsApp</span>
                  )}
                  <MenuAtalhosCliente
                    clienteId={c.pessoa.id}
                    nome={c.pessoa.nome}
                    nomeCurto={c.pessoa.displayName}
                    tratamento={c.pessoa.treatment}
                    className="-mr-2 flex-shrink-0"
                  />
                </li>
              );
            })}
          </ul>
          {o.candidatas.length > POR_DATA && (
            <p className="mt-1 text-xs text-neutral-400">
              Mostrando as {POR_DATA} primeiras de {o.candidatas.length}, por prioridade.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
