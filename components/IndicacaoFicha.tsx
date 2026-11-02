"use client";

// Cartão "Indicação" da ficha da cliente (programa de indicação, 02/11/2026):
// quem indicou (ou o nome digitado no formulário esperando ligar), o link dela
// para indicar (mandar no WhatsApp ou copiar), quem ela indicou e os descontos
// de 10% (disponível, usado, vencido). Os descontos nascem no banco.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Gift, Link2, Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { buildWhatsAppLink, formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { saudacaoCurta } from "@/lib/saudacao";
import { mensagemLinkIndicacao, rotuloTipo, situacaoDesconto, type DescontoIndicacao } from "@/lib/indicacao";

interface Pessoa {
  id: string;
  name: string;
  display_name: string | null;
}

interface Dados {
  indicadoPor: Pessoa | null;
  indicacaoNome: string | null;
  codigo: string | null;
  indicadas: (Pessoa & { alugou: boolean })[];
  descontos: DescontoIndicacao[];
}

export default function IndicacaoFicha({
  cliente,
}: {
  cliente: { id: string; name: string; whatsapp: string | null; treatment?: string | null; display_name?: string | null };
}) {
  const somenteLeitura = useSomenteLeitura();
  const [dados, setDados] = useState<Dados | null>(null);
  const [faltaSql, setFaltaSql] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const sb = createClient();
    const [{ data: c, error: e1 }, { data: ind }, { data: desc }] = await Promise.all([
      sb.from("clients").select("indicado_por, indicacao_nome, codigo_indicacao").eq("id", cliente.id).maybeSingle(),
      sb.from("clients").select("id, name, display_name").eq("indicado_por", cliente.id).order("name"),
      sb
        .from("descontos_indicacao")
        .select("id, client_id, tipo, outro_client_id, percentual, valido_ate, usado_em, usado_rental_id, created_at")
        .eq("client_id", cliente.id)
        .order("created_at", { ascending: false }),
    ]);
    if (e1) {
      setFaltaSql(/indicacao_nome|codigo_indicacao/.test(e1.message));
      return;
    }
    const indicadas = (ind ?? []) as Pessoa[];
    let alugaram = new Set<string>();
    if (indicadas.length) {
      const { data: r } = await sb.from("rentals_contabilizaveis").select("client_id").in("client_id", indicadas.map((p) => p.id));
      alugaram = new Set((r ?? []).map((x: { client_id: string }) => x.client_id));
    }
    let indicadoPor: Pessoa | null = null;
    if (c?.indicado_por) {
      const { data: p } = await sb.from("clients").select("id, name, display_name").eq("id", c.indicado_por).maybeSingle();
      indicadoPor = (p as Pessoa) ?? null;
    }
    setDados({
      indicadoPor,
      indicacaoNome: c?.indicacao_nome ?? null,
      codigo: c?.codigo_indicacao ?? null,
      indicadas: indicadas.map((p) => ({ ...p, alugou: alugaram.has(p.id) })),
      descontos: (desc ?? []) as DescontoIndicacao[],
    });
  }, [cliente.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function link(): Promise<string | null> {
    setOcupado(true);
    const { data, error } = await createClient().rpc("codigo_indicacao_cliente", { p_client_id: cliente.id });
    setOcupado(false);
    if (error || !data) {
      avisar(error?.message ?? "Não consegui gerar o link.", "erro");
      return null;
    }
    return `${window.location.origin}/indicacao/${data as string}`;
  }

  async function mandar() {
    const zap = cliente.whatsapp ? window.open("", "_blank") : null;
    const l = await link();
    if (!l) return zap?.close();
    const texto = mensagemLinkIndicacao(saudacaoCurta({ name: cliente.name, treatment: cliente.treatment, displayName: cliente.display_name }), l);
    const wa = buildWhatsAppLink(cliente.whatsapp, texto);
    if (zap && wa) zap.location.href = wa;
    else {
      zap?.close();
      await copiarTexto(texto);
    }
    carregar();
  }

  async function copiarTexto(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      avisar("Copiado.");
    } catch {
      avisar("Não consegui copiar neste aparelho.", "erro");
    }
  }

  const hoje = hojeLocal();
  const nomeDe = (p: Pessoa) => p.display_name || p.name;

  return (
    <section className="cartao p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Gift size={16} />
        </span>
        <h2 className="text-sm font-bold text-neutral-900">Indicação</h2>
      </div>

      {faltaSql && <p className="text-xs text-amber-700">Falta rodar o SQL do programa de indicação.</p>}
      {!faltaSql && !dados && (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 size={13} className="animate-spin" /> Carregando...
        </p>
      )}

      {dados && (
        <div className="space-y-3 text-sm">
          {dados.indicadoPor ? (
            <p className="text-neutral-700">
              Indicada por{" "}
              <Link href={`/clientes/${dados.indicadoPor.id}`} className="font-semibold text-brand-teal-dark underline">
                {nomeDe(dados.indicadoPor)}
              </Link>
            </p>
          ) : dados.indicacaoNome ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No formulário disse que veio por indicação de <b>{dados.indicacaoNome}</b>, mas não deu para ligar a um cadastro.{" "}
              <Link href="/clientes/indicacoes" className="font-semibold underline">
                Ligar agora
              </Link>
            </p>
          ) : null}

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Descontos</p>
            {dados.descontos.length === 0 ? (
              <p className="text-xs text-neutral-500">Nenhum desconto de indicação.</p>
            ) : (
              <ul className="space-y-1">
                {dados.descontos.map((d) => {
                  const sit = situacaoDesconto(d, hoje);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-700">
                        {Number(d.percentual)}% · {rotuloTipo(d.tipo)}
                      </span>
                      <span className={sit === "disponivel" ? "font-semibold text-emerald-700" : "text-neutral-500"}>
                        {sit === "disponivel" ? `Disponível até ${formatDate(d.valido_ate)}` : sit === "usado" ? "Usado" : `Venceu em ${formatDate(d.valido_ate)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Indicou ({dados.indicadas.length})</p>
            {dados.indicadas.length === 0 ? (
              <p className="text-xs text-neutral-500">Ainda ninguém.</p>
            ) : (
              <ul className="space-y-1">
                {dados.indicadas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link href={`/clientes/${p.id}`} className="truncate text-neutral-800 underline">
                      {nomeDe(p)}
                    </Link>
                    <span className={p.alugou ? "text-emerald-700" : "text-neutral-500"}>{p.alugou ? "Já alugou" : "Ainda não alugou"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!somenteLeitura && (
            <div className="flex flex-wrap gap-2 border-t border-neutral-200/70 pt-3">
              <button type="button" onClick={mandar} disabled={ocupado} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-60">
                {ocupado ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} Mandar o link de indicação
              </button>
              <button
                type="button"
                onClick={async () => {
                  const l = await link();
                  if (l) copiarTexto(l);
                  carregar();
                }}
                disabled={ocupado}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200"
              >
                {dados.codigo ? <Copy size={13} /> : <Link2 size={13} />} Copiar link
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
