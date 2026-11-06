"use client";

// Avisos: "Precisa de você" inteiro (as mesmas pendências do Dashboard, cada
// uma levando à sua lista) e o histórico das notificações do celular, por dia,
// com as não lidas em destaque. Tocar abre o que a notificação avisa e marca
// como lida; "Marcar todas como lidas" limpa o ponto do sino.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeLocal, somarDias } from "@/lib/period";
import { agruparPorDia, enderecoInterno, horaDeBrasilia, rotuloDia, type Notificacao } from "@/lib/notificacoes";
import PrecisaDeVoce, { type AvisoDash } from "@/components/dashboard/PrecisaDeVoce";
import { EVENTO_PENDENCIAS } from "@/components/SinoAvisos";
import { IconeChip } from "@/components/ui/Visual";
import { avisar } from "@/components/Dialogos";

export default function AvisosClient({
  avisos,
  notificacoes,
  erroHistorico,
}: {
  avisos: AvisoDash[];
  notificacoes: Notificacao[];
  erroHistorico: string | null;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(notificacoes);
  const hoje = hojeLocal();
  const ontem = somarDias(hoje, -1);
  const grupos = useMemo(() => agruparPorDia(lista), [lista]);
  const naoLidas = lista.filter((n) => !n.lida_em).length;

  // Ao abrir a tela, o sino recalcula com o número desta tela.
  useEffect(() => {
    window.dispatchEvent(new Event(EVENTO_PENDENCIAS));
  }, []);

  async function marcar(id: string | null) {
    const { error } = await createClient().rpc("marcar_notificacoes_lidas", { p_id: id });
    if (error) {
      avisar(error.message, "erro");
      return false;
    }
    const agora = new Date().toISOString();
    setLista((l) => l.map((n) => (id === null || n.id === id ? { ...n, lida_em: n.lida_em ?? agora } : n)));
    window.dispatchEvent(new Event(EVENTO_PENDENCIAS));
    return true;
  }

  async function abrir(n: Notificacao) {
    if (!n.lida_em) await marcar(n.id);
    const destino = enderecoInterno(n.url);
    if (destino) router.push(destino);
  }

  return (
    <div className="space-y-4">
      <section className="cartao flex items-start gap-3 p-5">
        <IconeChip icone={Bell} cor="ambar" tamanho="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-neutral-900">Avisos</h1>
          <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">
            {avisos.length === 0
              ? "Nada pendente agora."
              : `${avisos.length} ${avisos.length === 1 ? "assunto precisa" : "assuntos precisam"} de você. O número do sino é este.`}
          </p>
        </div>
      </section>

      <PrecisaDeVoce avisos={avisos} visiveis={Math.max(avisos.length, 1)} />

      <section className="cartao p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-slate-600">
            <History size={15} /> Histórico do celular
            {naoLidas > 0 && <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] text-brand-teal-dark">{naoLidas} não lidas</span>}
          </p>
          {naoLidas > 0 && (
            <button type="button" onClick={() => marcar(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500">
              <CheckCheck size={14} /> Marcar todas como lidas
            </button>
          )}
        </div>
        {erroHistorico && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{erroHistorico}</p>}
        {!erroHistorico && lista.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-500">As notificações que chegarem no celular vão aparecer aqui (guardadas por 90 dias).</p>
        )}
        <div className="space-y-3">
          {grupos.map((g) => (
            <div key={g.dia}>
              <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">{rotuloDia(g.dia, hoje, ontem)}</p>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-neutral-100">
                {g.itens.map((n) => {
                  const temLink = !!enderecoInterno(n.url);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => abrir(n)}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left active:bg-neutral-50 ${n.lida_em ? "" : "bg-brand-teal/5"}`}
                      >
                        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.lida_em ? "bg-neutral-200" : "bg-brand-teal"}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[14px] leading-snug ${n.lida_em ? "text-neutral-600" : "font-semibold text-neutral-900"}`}>{n.titulo}</span>
                          {n.texto && <span className="mt-0.5 block whitespace-pre-line text-[12.5px] text-neutral-500 line-clamp-3">{n.texto}</span>}
                          <span className="mt-0.5 block text-[11px] text-neutral-400">{horaDeBrasilia(n.criada_em)}</span>
                        </span>
                        {temLink && <ChevronRight size={16} className="mt-1 flex-shrink-0 text-neutral-300" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <p className="px-1 text-center text-[11px] text-neutral-400">
        <Link href="/configuracoes?secao=avisos" className="underline">Avisos no celular</Link> · as pendências seguem as escolhas de Configurações &gt; Dashboard
      </p>
    </div>
  );
}
