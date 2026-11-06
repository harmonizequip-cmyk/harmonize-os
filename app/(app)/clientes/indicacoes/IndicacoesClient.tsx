"use client";

// Tela do programa de indicação: "Para ligar" (indicação digitada no
// formulário que não bateu com um cadastro só: escolher entre os parecidos,
// procurar outra pessoa, cadastrar como lead ou deixar sem ligação),
// "Descontos" (10%, 90 dias) e "Indicações" (quem indicou quem).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Gift, Link2, Loader2, MessageCircle, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { IconeChip } from "@/components/ui/Visual";
import ClientPicker from "@/components/ClientPicker";
import { buildWhatsAppLink, formatDate, toUpperTrim } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import { hojeLocal } from "@/lib/period";
import { candidatosIndicacao, descontosVencendo, mensagemDescontoVencendo, rotuloTipo, situacaoDesconto, textoVencimento, type DescontoIndicacao } from "@/lib/indicacao";

export interface ClienteIndicacao {
  id: string;
  name: string;
  display_name: string | null;
  treatment?: string | null;
  city: string | null;
  whatsapp: string | null;
  indicado_por: string | null;
  indicacao_nome: string | null;
}

type Aba = "ligar" | "descontos" | "indicacoes";

export default function IndicacoesClient({
  clientes,
  descontos,
  alugaram,
  erro,
  abaInicial = null,
}: {
  clientes: ClienteIndicacao[];
  descontos: DescontoIndicacao[];
  alugaram: string[];
  erro: string | null;
  abaInicial?: Aba | null;
}) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const hoje = hojeLocal();
  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const nome = (id: string | null) => {
    const c = id ? porId.get(id) : null;
    return c ? c.display_name || c.name : "cadastro apagado";
  };
  const pendentes = clientes.filter((c) => c.indicacao_nome && !c.indicado_por);
  const disponiveis = descontos.filter((d) => situacaoDesconto(d, hoje) === "disponivel");
  const indicadas = clientes.filter((c) => c.indicado_por);
  const vencendo = descontosVencendo(descontos, hoje);
  function linkVencendo(d: DescontoIndicacao & { dias: number }): string | null {
    const c = porId.get(d.client_id);
    if (!c?.whatsapp) return null;
    const msg = mensagemDescontoVencendo({
      saudacao: saudacaoCurta({ name: c.name, treatment: c.treatment, displayName: c.display_name }),
      tipo: d.tipo,
      dias: d.dias,
      validoAte: d.valido_ate,
      outroNome: d.outro_client_id ? nome(d.outro_client_id) : null,
    });
    return buildWhatsAppLink(c.whatsapp, msg);
  }
  const alugou = new Set(alugaram);
  const [aba, setAba] = useState<Aba>(abaInicial ?? (pendentes.length ? "ligar" : "descontos"));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const opcoes = useMemo(() => clientes.map((c) => ({ id: c.id, name: c.name, city: c.city, whatsapp: c.whatsapp })), [clientes]);

  async function rodar(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setOcupado(id);
    const { error } = await fn();
    setOcupado(null);
    if (error) return avisar(error.message, "erro");
    avisar(ok);
    router.refresh();
  }

  async function ligar(c: ClienteIndicacao) {
    const ind = escolha[c.id];
    if (!ind) return avisar("Escolha quem indicou.", "erro");
    await rodar(c.id, () => createClient().rpc("definir_indicacao", { p_client_id: c.id, p_indicador_id: ind }), `Ligado: ${nome(c.id)} foi indicada por ${nome(ind)}.`);
  }

  async function cadastrarLead(c: ClienteIndicacao) {
    const sim = await confirmar({
      titulo: `Cadastrar ${c.indicacao_nome} como lead?`,
      texto: `Cria um lead com esse nome e liga a indicação de ${nome(c.id)} a ele. O WhatsApp e o resto você completa depois.`,
      confirmar: "Cadastrar e ligar",
    });
    if (!sim) return;
    setOcupado(c.id);
    const sb = createClient();
    const { data, error } = await sb
      .from("clients")
      .insert({ name: toUpperTrim(c.indicacao_nome ?? ""), stage: "lead", is_client: false, origem: "outro" })
      .select("id")
      .single();
    if (error || !data) {
      setOcupado(null);
      return avisar(error?.message ?? "Não consegui cadastrar.", "erro");
    }
    await rodar(c.id, () => sb.rpc("definir_indicacao", { p_client_id: c.id, p_indicador_id: data.id }), "Lead cadastrado e indicação ligada.");
  }

  async function semLigacao(c: ClienteIndicacao) {
    const sim = await confirmar({
      titulo: "Deixar sem ligação?",
      texto: `A indicação de ${c.indicacao_nome} some desta lista e ninguém ganha desconto por ela. A anotação na ficha continua.`,
      confirmar: "Deixar sem ligação",
      perigo: true,
    });
    if (!sim) return;
    await rodar(c.id, () => createClient().rpc("dispensar_indicacao_nome", { p_client_id: c.id }), "Pronto.");
  }

  const abas: { id: Aba; rotulo: string; n: number }[] = [
    { id: "ligar", rotulo: "Para ligar", n: pendentes.length },
    { id: "descontos", rotulo: "Descontos", n: disponiveis.length },
    { id: "indicacoes", rotulo: "Indicações", n: indicadas.length },
  ];

  return (
    <div className="space-y-4">
      <section className="cartao p-5">
        <div className="flex items-start gap-3">
          <IconeChip icone={Gift} cor="roxo" tamanho="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-neutral-900">Programa de indicação</h1>
            <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">
              Quem indica ganha 10% quando a indicada faz a primeira locação, e a indicada ganha 10% na primeira locação. Um desconto por locação, válido por 90 dias. O link de cada cliente fica na ficha dela.
            </p>
          </div>
        </div>
      </section>

      {erro && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">{erro}</p>}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
        {abas.map((a) => (
          <button key={a.id} type="button" onClick={() => setAba(a.id)} className={`rounded-xl px-1 py-2 text-center text-xs font-bold ${aba === a.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}>
            {a.rotulo}
            <span className="block text-base font-black tabular-nums">{a.n}</span>
          </button>
        ))}
      </div>

      {aba === "ligar" && (
        <div className="space-y-3">
          {pendentes.length === 0 && <p className="cartao p-5 text-center text-sm text-neutral-500">Nenhuma indicação esperando ligação.</p>}
          {pendentes.map((c) => {
            const candidatos = candidatosIndicacao(c.indicacao_nome ?? "", clientes, c.id);
            return (
              <section key={c.id} className="cartao space-y-3 p-4 ring-2 ring-amber-200">
                <p className="text-sm text-neutral-800">
                  <Link href={`/clientes/${c.id}`} className="font-bold underline">
                    {c.display_name || c.name}
                  </Link>{" "}
                  disse que veio por indicação de <b>{c.indicacao_nome}</b>.
                </p>
                <p className={`rounded-lg px-3 py-2 text-xs ${candidatos.length ? "bg-amber-50 text-amber-900" : "bg-neutral-50 text-neutral-700"}`}>
                  {candidatos.length > 1
                    ? `Há ${candidatos.length} cadastros parecidos. Escolha qual é a pessoa certa:`
                    : candidatos.length === 1
                      ? "Achei um cadastro parecido. Confira se é a pessoa:"
                      : "Não tem ninguém com esse nome no cadastro. Procure outro nome, cadastre como lead ou deixe sem ligação."}
                </p>
                {candidatos.length > 0 && (
                  <div className="space-y-1.5">
                    {candidatos.slice(0, 8).map((p) => (
                      <label key={p.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 ${escolha[c.id] === p.id ? "bg-brand-teal/10 ring-brand-teal" : "bg-white ring-neutral-200"}`}>
                        <input type="radio" name={`ind-${c.id}`} checked={escolha[c.id] === p.id} onChange={() => setEscolha((e) => ({ ...e, [c.id]: p.id }))} className="h-4 w-4 accent-brand-teal" />
                        <span className="min-w-0 text-sm">
                          <b className="text-neutral-900">{p.name}</b>
                          <span className="block text-xs text-neutral-500">{[p.display_name, p.city, p.whatsapp].filter(Boolean).join(" · ") || "sem mais dados"}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {!somenteLeitura && (
                  <>
                    <ClientPicker
                      clients={opcoes.filter((o) => o.id !== c.id)}
                      value={escolha[c.id] && !candidatos.some((p) => p.id === escolha[c.id]) ? escolha[c.id] : ""}
                      onChange={(id) => setEscolha((e) => ({ ...e, [c.id]: id }))}
                      onClientCreated={() => undefined}
                      label="Ou procure outra pessoa"
                      allowCreate={false}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => ligar(c)} disabled={ocupado === c.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-teal px-4 text-xs font-bold text-white disabled:opacity-60">
                        {ocupado === c.id ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Ligar indicação
                      </button>
                      <button type="button" onClick={() => cadastrarLead(c)} disabled={ocupado === c.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
                        <UserPlus size={14} /> Cadastrar {c.indicacao_nome} como lead
                      </button>
                      <button type="button" onClick={() => semLigacao(c)} disabled={ocupado === c.id} className="min-h-10 px-3 text-xs font-semibold text-neutral-500">
                        Deixar sem ligação
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {aba === "descontos" && vencendo.length > 0 && (
        <section className="cartao space-y-2 p-4 ring-2 ring-rose-200">
          <div className="flex items-center gap-2">
            <IconeChip icone={AlarmClock} cor="rosa" />
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Vencendo: chame antes que expire</h2>
              <p className="text-xs text-neutral-500">A mensagem já vai pronta, com o prazo e um convite para marcar a data.</p>
            </div>
          </div>
          <ul className="space-y-2">
            {vencendo.map((d) => {
              const link = linkVencendo(d);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-neutral-200">
                  <div className="min-w-0">
                    <Link href={`/clientes/${d.client_id}`} className="truncate text-sm font-bold text-neutral-900 underline">
                      {nome(d.client_id)}
                    </Link>
                    <p className={`text-xs font-semibold ${d.dias <= 1 ? "text-rose-600" : "text-amber-700"}`}>
                      {Number(d.percentual)}% · {rotuloTipo(d.tipo)} · {textoVencimento(d.dias, d.valido_ate)}
                    </p>
                  </div>
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 rounded-full bg-brand-teal px-3 text-xs font-bold text-white">
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  ) : (
                    <span className="flex-shrink-0 text-[11px] text-neutral-400">Sem WhatsApp</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {aba === "descontos" && (
        <ul className="space-y-2">
          {descontos.length === 0 && <li className="cartao p-5 text-center text-sm text-neutral-500">Nenhum desconto ainda.</li>}
          {descontos.map((d) => {
            const sit = situacaoDesconto(d, hoje);
            return (
              <li key={d.id} className="cartao flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link href={`/clientes/${d.client_id}`} className="truncate text-sm font-bold text-neutral-900 underline">
                    {nome(d.client_id)}
                  </Link>
                  <p className="text-xs text-neutral-500">
                    {Number(d.percentual)}% · {rotuloTipo(d.tipo)} {d.tipo === "indicou" ? `(${nome(d.outro_client_id)} alugou)` : `(por ${nome(d.outro_client_id)})`}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs ${sit === "disponivel" ? "font-semibold text-emerald-700" : "text-neutral-500"}`}>
                  {sit === "disponivel" ? `Até ${formatDate(d.valido_ate)}` : sit === "usado" ? "Usado" : "Venceu"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {aba === "indicacoes" && (
        <ul className="space-y-2">
          {indicadas.length === 0 && <li className="cartao p-5 text-center text-sm text-neutral-500">Ninguém indicado ainda.</li>}
          {indicadas.map((c) => (
            <li key={c.id} className="cartao flex items-center justify-between gap-3 p-3">
              <div className="min-w-0 text-sm">
                <Link href={`/clientes/${c.indicado_por}`} className="font-bold text-neutral-900 underline">
                  {nome(c.indicado_por)}
                </Link>{" "}
                <span className="text-neutral-500">indicou</span>{" "}
                <Link href={`/clientes/${c.id}`} className="font-semibold text-neutral-800 underline">
                  {c.display_name || c.name}
                </Link>
              </div>
              <span className={`flex-shrink-0 text-xs ${alugou.has(c.id) ? "font-semibold text-emerald-700" : "text-neutral-500"}`}>
                {alugou.has(c.id) ? "Já alugou" : "Ainda não alugou"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-neutral-400">
        <Users size={12} /> O desconto entra sozinho na finalização da locação, com opção de tirar.
      </p>
    </div>
  );
}
