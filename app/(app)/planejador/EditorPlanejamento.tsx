"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { Atalho, Atalhos } from "@/components/Atalhos";
import { CHAVE_PLANO_IA, linkCliente, linkEvento, linkNovoPlanejamento } from "@/lib/atalhos";
import { chaveLocal, temConteudo, type EstadoPlanejador, type PlanejamentoMontado } from "@/lib/planejamento";
import SeletorPlanejamento from "@/components/SeletorPlanejamento";
import { formatDate } from "@/lib/format";
import { ArrowLeft, Check, ListChecks, Loader2, Trash2, X } from "lucide-react";

type Cliente = ClientOption & { profissional: string };
type Evento = { id: string; date_start: string; event_type: string };

const EQUIP: Record<string, string> = { hipro_1: "HIPRO 1", hipro_2: "HIPRO 2" };

// O planejador original (public/ferramentas/planejador.html) roda numa moldura
// do próprio site. Antes de abrir, o estado vai para a chave dele no aparelho;
// a cada mudança ele avisa por postMessage e o app guarda no banco (com
// intervalo). Planejamento novo só vira registro quando ganha conteúdo.
export default function EditorPlanejamento({
  planoId,
  estado,
  clienteId,
  eventoId,
  clientes,
}: {
  planoId: string | null;
  estado: EstadoPlanejador;
  clienteId: string | null;
  eventoId: string | null;
  clientes: Cliente[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const [id, setId] = useState<string | null>(planoId);
  const [cliente, setCliente] = useState(clienteId ?? "");
  const [evento, setEvento] = useState(eventoId ?? "");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">(planoId ? "salvo" : "");
  const [pronto, setPronto] = useState(false);
  // Chave local fixa enquanto a tela está aberta (o novo ganha id só depois).
  const [chave] = useState(() => planoId ?? `novo-${crypto.randomUUID()}`);
  const [seletor, setSeletor] = useState(false);
  const [versao, setVersao] = useState(0);
  const atual = useRef<EstadoPlanejador>(estado);

  const ultimo = useRef<{ estado: EstadoPlanejador; total: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(id);
  const ligacao = useRef({ cliente, evento });
  idRef.current = id;
  ligacao.current = { cliente, evento };

  // Estado no aparelho antes de abrir a moldura. Vindo do assistente (?ia=1),
  // a distribuição montada pela IA entra por cima do estado inicial.
  useEffect(() => {
    let inicial: EstadoPlanejador = estado;
    try {
      if (!planoId && new URLSearchParams(window.location.search).get("ia") === "1") {
        const daIa = JSON.parse(sessionStorage.getItem(CHAVE_PLANO_IA) ?? "null") as EstadoPlanejador | null;
        sessionStorage.removeItem(CHAVE_PLANO_IA);
        if (daIa) inicial = { ...estado, ...daIa, profissional: (daIa.profissional as string) || estado.profissional };
      }
    } catch {
      // sessão indisponível: segue com o estado inicial
    }
    atual.current = inicial;
    try {
      localStorage.setItem(chaveLocal(chave), JSON.stringify(inicial));
    } catch {
      // sem armazenamento: o planejador abre vazio
    }
    setPronto(true);
    return () => {
      try {
        localStorage.removeItem(chaveLocal(chave));
      } catch {
        // nada
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvar = useCallback(async () => {
    const atual = ultimo.current;
    if (!atual || somenteLeitura) return;
    if (!idRef.current && !temConteudo(atual.estado, atual.total)) return;
    setStatus("salvando");
    const { data, error } = await supabase.rpc("salvar_planejamento", {
      p_id: idRef.current,
      p_client_id: ligacao.current.cliente || null,
      p_calendar_event_id: ligacao.current.evento || null,
      p_estado: atual.estado,
      p_total: atual.total,
    });
    if (error) {
      setStatus("erro");
      return;
    }
    if (!idRef.current && data) {
      idRef.current = data as string;
      setId(data as string);
      // Troca o endereço sem recarregar a moldura.
      window.history.replaceState(null, "", `/planejador/${data}`);
    }
    setStatus("salvo");
  }, [supabase, somenteLeitura]);

  const agendar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(salvar, 1200);
  }, [salvar]);

  // Mensagens do planejador.
  useEffect(() => {
    function ouvir(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const m = ev.data as { tipo?: string; plano?: string; estado?: EstadoPlanejador; total?: number };
      if (!m || m.plano !== chave) return;
      if (m.tipo === "planejador:estado" && m.estado) {
        ultimo.current = { estado: m.estado, total: Number(m.total) || 0 };
        atual.current = m.estado;
        agendar();
      }
      if (m.tipo === "planejador:novo") {
        // "Novo" dentro do planejador: guarda este e abre outro para a mesma cliente.
        if (timer.current) clearTimeout(timer.current);
        salvar().finally(() => {
          window.location.href = linkNovoPlanejamento(ligacao.current.cliente || null, ligacao.current.evento || null);
        });
      }
    }
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [chave, agendar, salvar]);

  // Ao sair da tela, guarda o que faltou.
  useEffect(() => {
    const sair = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        salvar();
      }
    };
    window.addEventListener("pagehide", sair);
    return () => {
      window.removeEventListener("pagehide", sair);
      sair();
    };
  }, [salvar]);

  // Atendimentos HIPRO da cliente (60 dias para trás e para frente).
  useEffect(() => {
    let ativo = true;
    if (!cliente) {
      setEventos([]);
      return;
    }
    const hoje = new Date();
    const de = new Date(hoje.getTime() - 60 * 86400000).toISOString().slice(0, 10);
    const ate = new Date(hoje.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("calendar_events")
      .select("id, date_start, event_type")
      .eq("client_id", cliente)
      .in("event_type", ["hipro_1", "hipro_2"])
      .neq("status", "cancelada")
      .gte("date_start", de)
      .lte("date_start", ate)
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (ativo) setEventos((data ?? []) as Evento[]);
      });
    return () => {
      ativo = false;
    };
  }, [cliente, supabase]);

  function mudarLigacao(novoCliente: string, novoEvento: string) {
    setCliente(novoCliente);
    setEvento(novoEvento);
    ligacao.current = { cliente: novoCliente, evento: novoEvento };
    if (idRef.current || ultimo.current) agendar();
  }

  // "Montar pelas regras": troca as áreas pelo que o seletor montou, mantém
  // paciente, datas e anotações, e recarrega a moldura.
  function aplicarSeletor(m: PlanejamentoMontado) {
    const tem = Object.keys((atual.current.DATA as Record<string, unknown>) ?? {}).length > 0;
    if (tem && !window.confirm("Trocar as áreas e disparos deste planejamento pelo que foi montado?")) return false;
    const novo: EstadoPlanejador = {
      ...atual.current,
      DATA: m.estado.DATA,
      customAreas: m.estado.customAreas,
      customSeq: m.estado.customSeq,
      saldoTotal: m.estado.saldoTotal,
      procNome: m.estado.procNome,
      ...(m.estado.queixa ? { queixa: m.estado.queixa } : {}),
    };
    atual.current = novo;
    try {
      localStorage.setItem(chaveLocal(chave), JSON.stringify(novo));
    } catch {
      // sem armazenamento: só guarda no banco
    }
    ultimo.current = { estado: novo, total: m.total };
    agendar();
    setSeletor(false);
    setVersao((v) => v + 1);
  }

  async function excluir() {
    if (!id) {
      router.push("/planejador");
      return;
    }
    if (!window.confirm("Excluir este planejamento? Não dá para desfazer.")) return;
    if (timer.current) clearTimeout(timer.current);
    ultimo.current = null;
    const { error } = await supabase.rpc("excluir_planejamento", { p_id: id });
    if (error) {
      setStatus("erro");
      return;
    }
    router.push("/planejador");
    router.refresh();
  }

  const nomeCliente = useMemo(() => clientes.find((c) => c.id === cliente)?.name, [clientes, cliente]);

  return (
    <div className="-mx-4 -mt-2 flex flex-col sm:mx-0 sm:mt-0">
      <div className="space-y-2 border-b border-neutral-200 bg-white px-3 py-2.5 sm:rounded-t-2xl sm:border">
        <div className="flex items-center justify-between gap-2">
          <Link href={cliente ? `/planejador?cliente=${cliente}` : "/planejador"} className="flex items-center gap-1 text-sm font-medium text-neutral-600">
            <ArrowLeft size={16} /> Planejamentos
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              {somenteLeitura ? (
                "Só visualização: nada é guardado"
              ) : status === "salvando" ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Salvando
                </>
              ) : status === "salvo" ? (
                <>
                  <Check size={13} className="text-emerald-600" /> Salvo
                </>
              ) : status === "erro" ? (
                <span className="text-rose-600">Não salvou. Confira a internet.</span>
              ) : (
                "Guarda sozinho quando tiver paciente"
              )}
            </span>
            {!somenteLeitura && (
              <button onClick={excluir} className="text-neutral-400 hover:text-rose-600" aria-label="Excluir planejamento">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ClientPicker
            clients={clientes}
            value={cliente}
            onChange={(c) => mudarLigacao(c, "")}
            onClientCreated={() => {}}
            label="Cliente (profissional)"
            optional
            noneLabel="Sem cliente"
            allowCreate={false}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Atendimento</label>
            <select
              value={evento}
              onChange={(e) => mudarLigacao(cliente, e.target.value)}
              disabled={!cliente}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50"
            >
              <option value="">{cliente ? "Sem atendimento" : "Escolha a cliente"}</option>
              {evento && !eventos.some((e) => e.id === evento) && <option value={evento}>Atendimento ligado</option>}
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.date_start)} · {EQUIP[e.event_type] ?? e.event_type}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Atalhos>
          {cliente && (
            <Atalho href={linkCliente(cliente)} emoji="👤">
              Ficha {nomeCliente ? `de ${nomeCliente.split(" ")[0]}` : ""}
            </Atalho>
          )}
          {evento && (
            <Atalho href={linkEvento(evento)} emoji="📅">
              Atendimento
            </Atalho>
          )}
          {cliente && (
            <Atalho href={`/planejador?cliente=${cliente}`} emoji="📋">
              Outros pacientes dela
            </Atalho>
          )}
          {!somenteLeitura && (
            <button
              type="button"
              onClick={() => setSeletor(true)}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-brand-teal/40 bg-brand-teal/10 px-2.5 py-1 text-xs font-semibold text-brand-teal-dark"
            >
              <ListChecks size={13} /> Montar pelas regras
            </button>
          )}
          {!somenteLeitura && (
            <Atalho
              href={`/assistente?${cliente ? `cliente=${cliente}&` : ""}pergunta=${encodeURIComponent(
                "Monta um planejamento: paciente , saldo de  disparos, queixa principal: "
              )}`}
              emoji="✨"
            >
              Montar com a IA
            </Atalho>
          )}
        </Atalhos>
      </div>
      {seletor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSeletor(false)}>
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-neutral-50 p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-neutral-900">Montar pelas regras</p>
              <button onClick={() => setSeletor(false)} className="text-neutral-400" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <SeletorPlanejamento
              saldoInicial={Number(atual.current.saldoTotal) || null}
              queixaInicial={(atual.current.queixa as string) || null}
              paciente={(atual.current.paciente as string) || null}
              textoAplicar="Colocar no planejador"
              onAplicar={aplicarSeletor}
            />
          </div>
        </div>
      )}
      {pronto && (
        <iframe
          key={versao}
          title="Planejador HIPRO"
          src={`/ferramentas/planejador.html?plano=${encodeURIComponent(chave)}`}
          className="h-[calc(100dvh-230px)] min-h-[520px] w-full border-0 bg-[#f4f6f7] sm:rounded-b-2xl"
        />
      )}
    </div>
  );
}
