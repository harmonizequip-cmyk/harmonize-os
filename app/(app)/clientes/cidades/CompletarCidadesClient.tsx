"use client";

// Completar cidades: uma linha por pessoa sem cidade. Digitar mostra as cidades
// já conhecidas (Configurações > Cidades e as dos cadastros), com as do estado
// do DDD do WhatsApp na frente; tocar numa sugestão já salva. O estado vem
// preenchido pelo DDD. Salvou, a pessoa sai da lista.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { IconeChip } from "@/components/ui/Visual";
import { sugerirCidades, ufPeloWhatsapp, UFS, type CidadeConhecida } from "@/lib/cidades-cliente";

export interface SemCidade {
  id: string;
  nome: string;
  nomeCompleto: string;
  whatsapp: string | null;
  ehCliente: boolean;
  temReserva: boolean;
  criadoEm: string;
}

type Filtro = "todos" | "clientes" | "leads";

export default function CompletarCidadesClient({ pessoas, conhecidas, erro }: { pessoas: SemCidade[]; conhecidas: CidadeConhecida[]; erro: string | null }) {
  const somenteLeitura = useSomenteLeitura();
  const [feitos, setFeitos] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const faltam = pessoas.filter((p) => !feitos[p.id]);
  const visiveis = faltam.filter((p) => (filtro === "clientes" ? p.ehCliente : filtro === "leads" ? !p.ehCliente : true));

  return (
    <div className="space-y-4">
      <section className="cartao flex items-start gap-3 p-5">
        <IconeChip icone={MapPin} cor="teal" tamanho="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-neutral-900">Completar cidades</h1>
          <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">
            {faltam.length === 0
              ? "Todo mundo tem cidade no cadastro."
              : `${faltam.length} ${faltam.length === 1 ? "cadastro sem cidade" : "cadastros sem cidade"}. A cidade coloca a pessoa no Encaixe, nas Melhores datas e no cartão da Agenda.`}
          </p>
          {Object.keys(feitos).length > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">{Object.keys(feitos).length} preenchidos agora</p>}
        </div>
      </section>

      {erro && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">{erro}</p>}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
        {(
          [
            ["todos", "Todos", faltam.length],
            ["clientes", "Clientes", faltam.filter((p) => p.ehCliente).length],
            ["leads", "Leads", faltam.filter((p) => !p.ehCliente).length],
          ] as [Filtro, string, number][]
        ).map(([id, rotulo, n]) => (
          <button key={id} type="button" onClick={() => setFiltro(id)} className={`rounded-xl px-1 py-2 text-center text-xs font-bold ${filtro === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}>
            {rotulo} <span className="tabular-nums">· {n}</span>
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {visiveis.map((p) => (
          <LinhaCidade key={p.id} pessoa={p} conhecidas={conhecidas} somenteLeitura={somenteLeitura} onSalvo={(cidade) => setFeitos((f) => ({ ...f, [p.id]: cidade }))} />
        ))}
      </ul>
    </div>
  );
}

function LinhaCidade({
  pessoa,
  conhecidas,
  somenteLeitura,
  onSalvo,
}: {
  pessoa: SemCidade;
  conhecidas: CidadeConhecida[];
  somenteLeitura: boolean;
  onSalvo: (cidade: string) => void;
}) {
  const ufProvavel = ufPeloWhatsapp(pessoa.whatsapp);
  const [texto, setTexto] = useState("");
  const [uf, setUf] = useState(ufProvavel ?? "");
  const [salvando, setSalvando] = useState(false);
  const sugestoes = useMemo(() => sugerirCidades(texto, conhecidas, uf || ufProvavel), [texto, conhecidas, uf, ufProvavel]);

  async function salvar(cidade: string, estado: string) {
    const nome = cidade.trim().replace(/\s+/g, " ").toUpperCase();
    if (!nome) return;
    setSalvando(true);
    const { error } = await createClient().from("clients").update({ city: nome, state: estado || null }).eq("id", pessoa.id);
    setSalvando(false);
    if (error) return avisar(`Não consegui salvar: ${error.message}`, "erro");
    onSalvo(nome);
  }

  return (
    <li className="cartao space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/clientes/${pessoa.id}`} className="min-w-0 truncate text-sm font-bold text-neutral-900 underline decoration-dotted underline-offset-2">
          {pessoa.nome}
        </Link>
        <span className="flex flex-shrink-0 gap-1 text-[10px] font-semibold">
          {pessoa.temReserva && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">reserva marcada</span>}
          <span className={`rounded-full px-2 py-0.5 ${pessoa.ehCliente ? "bg-brand-teal/10 text-brand-teal-dark" : "bg-neutral-100 text-neutral-600"}`}>{pessoa.ehCliente ? "cliente" : "lead"}</span>
        </span>
      </div>
      {!somenteLeitura && (
        <>
          <div className="flex gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={ufProvavel ? `Cidade (DDD de ${ufProvavel})` : "Cidade"}
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <select value={uf} onChange={(e) => setUf(e.target.value)} className="w-20 rounded-lg border border-neutral-300 px-2 py-2 text-sm">
              <option value="">UF</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => salvar(texto, uf)}
              disabled={salvando || !texto.trim()}
              aria-label="Salvar cidade"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-teal text-white disabled:opacity-40"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
          </div>
          {sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sugestoes.map((s) => (
                <button
                  key={`${s.nome}-${s.uf}`}
                  type="button"
                  disabled={salvando}
                  onClick={() => salvar(s.nome, s.uf ?? uf)}
                  className="rounded-full bg-brand-teal/10 px-3 py-1.5 text-xs font-semibold text-brand-teal-dark"
                >
                  {s.nome}
                  {s.uf ? ` - ${s.uf}` : ""}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </li>
  );
}
