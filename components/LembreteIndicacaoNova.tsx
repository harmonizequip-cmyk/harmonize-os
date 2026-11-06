"use client";

// Balão que pede para falar logo com quem chegou por indicação, antes de esfriar
// (pedido do dono, 05/11/2026). Mostra leads indicados nos últimos 14 dias sem
// nenhum contato registrado depois do cadastro (anotação digitada, falada ou do
// assistente, ou tarefa concluída). "WhatsApp" abre a conversa com a mensagem
// pronta; "Já falei" grava uma anotação e tira a pessoa do balão; "Depois"
// esconde até amanhã. É lembrete, não lista: se a carga falhar, não mostra nada.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Gift, MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeLocal, somarDias } from "@/lib/period";
import { buildWhatsAppLink } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import { DIAS_INDICADA_NOVA, indicadasSemContato, mensagemBoasVindasIndicacao } from "@/lib/indicacao";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { IconeChip } from "@/components/ui/Visual";

const CHAVE_ADIADO = "harmonize-lembrete-indicacao-adiado";

interface Indicada {
  id: string;
  name: string;
  display_name: string | null;
  treatment: string | null;
  whatsapp: string | null;
  created_at: string;
  is_client: boolean | null;
  indicado_por: string | null;
  indicadora: string | null;
  validoAte: string | null;
}

function adiadoHoje(): boolean {
  try {
    return localStorage.getItem(CHAVE_ADIADO) === hojeLocal();
  } catch {
    return false;
  }
}

async function carregar(): Promise<Indicada[]> {
  const sb = createClient();
  const hoje = hojeLocal();
  const desde = somarDias(hoje, -DIAS_INDICADA_NOVA);
  const { data: leads, error } = await sb
    .from("clients")
    .select("id, name, display_name, treatment, whatsapp, created_at, is_client, indicado_por, origem")
    .eq("is_test", false)
    .eq("is_client", false)
    .neq("stage", "desqualificado")
    .gte("created_at", `${desde}T00:00:00-03:00`)
    .or("indicado_por.not.is.null,origem.eq.indicacao");
  if (error || !leads?.length) return [];
  const ids = leads.map((l) => l.id);
  const [{ data: notas }, { data: tarefas }, { data: descontos }] = await Promise.all([
    sb.from("cliente_anotacoes").select("client_id, created_at").in("client_id", ids).in("origem", ["digitada", "voz", "assistente"]),
    sb.from("tasks").select("client_id").in("client_id", ids).eq("status", "concluida"),
    sb.from("descontos_indicacao").select("client_id, valido_ate").in("client_id", ids).eq("tipo", "indicado").is("usado_em", null),
  ]);
  const contatadas = new Set<string>([
    ...((notas ?? []) as { client_id: string }[]).map((n) => n.client_id),
    ...((tarefas ?? []) as { client_id: string }[]).map((t) => t.client_id),
  ]);
  const quem = [...new Set(leads.map((l) => l.indicado_por).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (quem.length) {
    const { data: ind } = await sb.from("clients").select("id, name, display_name, treatment").in("id", quem);
    for (const c of (ind ?? []) as { id: string; name: string; display_name: string | null; treatment: string | null }[]) {
      nomes.set(c.id, [c.treatment, c.display_name || c.name.split(" ")[0]].filter(Boolean).join(" "));
    }
  }
  const validade = new Map(((descontos ?? []) as { client_id: string; valido_ate: string }[]).map((d) => [d.client_id, d.valido_ate]));
  return indicadasSemContato(leads as any[], contatadas, hoje).map((l: any) => ({
    ...l,
    indicadora: l.indicado_por ? nomes.get(l.indicado_por) ?? null : null,
    validoAte: validade.get(l.id) ?? null,
  }));
}

export default function LembreteIndicacaoNova() {
  const pathname = usePathname();
  const somenteLeitura = useSomenteLeitura();
  const [lista, setLista] = useState<Indicada[]>([]);
  const [indice, setIndice] = useState(0);
  const [adiado, setAdiado] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (somenteLeitura) return;
    if (adiadoHoje()) {
      setAdiado(true);
      return;
    }
    setAdiado(false);
    let vivo = true;
    carregar()
      .then((l) => {
        if (!vivo) return;
        setLista(l);
        setIndice(0);
      })
      .catch(() => {
        if (vivo) setLista([]);
      });
    return () => {
      vivo = false;
    };
  }, [pathname, somenteLeitura]);

  if (somenteLeitura || adiado || lista.length === 0) return null;
  const p = lista[Math.min(indice, lista.length - 1)];
  const nome = p.display_name || p.name;
  const link = p.whatsapp
    ? buildWhatsAppLink(
        p.whatsapp,
        mensagemBoasVindasIndicacao({
          saudacao: saudacaoCurta({ name: p.name, treatment: p.treatment, displayName: p.display_name }),
          indicadora: p.indicadora,
          validoAte: p.validoAte,
        })
      )
    : null;

  function depois() {
    try {
      localStorage.setItem(CHAVE_ADIADO, hojeLocal());
    } catch {
      // sem armazenamento: esconde só nesta tela
    }
    setAdiado(true);
  }

  async function jaFalei() {
    setSalvando(true);
    const { error } = await createClient().rpc("salvar_anotacao_cliente", {
      p_client_id: p.id,
      p_texto: "Primeiro contato feito com quem chegou por indicação.",
      p_origem: "digitada",
    });
    setSalvando(false);
    if (error) return;
    setLista((l) => l.filter((x) => x.id !== p.id));
    setIndice(0);
  }

  return (
    <div role="status" className="cartao pointer-events-auto p-4 ring-2 ring-pink-200">
      <div className="flex items-start gap-3">
        <IconeChip icone={Gift} cor="rosa" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">Chegou por indicação: fale hoje</p>
          <p className="mt-0.5 text-xs text-neutral-600">
            <Link href={`/clientes/${p.id}`} className="font-semibold underline">
              {nome}
            </Link>
            {p.indicadora ? `, indicada por ${p.indicadora},` : ""} ainda não recebeu contato. Lead de indicação esfria rápido.
          </p>
          {lista.length > 1 && (
            <button type="button" onClick={() => setIndice((i) => (i + 1) % lista.length)} className="mt-1 text-[11px] font-medium text-neutral-500 underline">
              {Math.min(indice, lista.length - 1) + 1} de {lista.length} · ver a próxima
            </button>
          )}
        </div>
        <button type="button" onClick={depois} aria-label="Lembrar amanhã" className="-mr-1 -mt-1 p-1 text-neutral-400">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2 text-sm font-semibold text-white">
            <MessageCircle size={15} /> WhatsApp
          </a>
        ) : (
          <Link href={`/clientes/${p.id}`} className="flex-1 rounded-xl bg-brand-gradient px-3 py-2 text-center text-sm font-semibold text-white">
            Abrir ficha
          </Link>
        )}
        <button type="button" onClick={jaFalei} disabled={salvando} className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-60">
          <Check size={15} /> Já falei
        </button>
      </div>
    </div>
  );
}
