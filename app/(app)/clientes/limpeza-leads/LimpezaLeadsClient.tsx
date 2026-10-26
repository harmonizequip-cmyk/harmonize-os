"use client";

// TEMPORÁRIA: remover quando terminar a limpeza (ver page.tsx).
//
// Exclusão em massa de leads, com quatro travas: só aparecem leads sem nenhum
// vínculo de dinheiro/agenda/crédito/contrato/login/planejamento; a cópia dos
// selecionados é baixada antes; é preciso escrever APAGAR; e, antes de cada
// exclusão, a prévia do banco (preview_exclusao) é conferida de novo, porque
// delete_record_forever apaga em cascata locação, lançamento e agenda.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  History,
  Loader2,
  MessageCircleOff,
  Search,
  ShieldAlert,
  Square,
  SquareCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { avisar } from "@/components/Dialogos";
import { Cartao, IconeChip, Pilula, TituloBloco } from "@/components/ui/Visual";
import { linkCliente } from "@/lib/atalhos";
import { formatDate } from "@/lib/format";
import { usePreferencias } from "@/lib/usar-preferencias";
import { origensParaTela, rotuloDaOrigem } from "@/app/(app)/funil/NovoLeadModal";
import { STAGES } from "@/app/(app)/funil/FunilClient";
import {
  FILTROS_VAZIOS,
  LIMITE_RODADA,
  alternarSelecao,
  explicarErro,
  filtrarLeads,
  marcarFiltrados,
  motivoParaNaoApagar,
  motivosDeFora,
  nomeArquivoCopia,
  podarSelecao,
  resumoExclusao,
  temHistorico,
  temWhatsapp,
  textoCopia,
  type FiltrosLimpeza,
  type LeadLimpeza,
  type Ordem,
  type PreviaExclusao,
  type Vinculos,
} from "@/lib/limpeza-leads";

const PALAVRA = "APAGAR";
const rotuloEtapa = (k: string | null) => STAGES.find((s) => s.key === k)?.label ?? (k || "Sem etapa");

interface Resultado {
  id: string;
  nome: string;
  ok: boolean;
  motivo?: string;
}

export default function LimpezaLeadsClient({ leads, deFora, erro }: { leads: LeadLimpeza[]; deFora: number; erro: string | null }) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const preferencias = usePreferencias();
  const origens = origensParaTela(preferencias.listas.origens);

  const [filtros, setFiltros] = useState<FiltrosLimpeza>(FILTROS_VAZIOS);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [janela, setJanela] = useState(false);

  // Apagado (ou que ganhou vínculo) sai da seleção quando a lista recarrega.
  useEffect(() => {
    setSelecao((s) => podarSelecao(s, leads));
  }, [leads]);

  const filtrados = useMemo(() => filtrarLeads(leads, filtros), [leads, filtros]);
  const selecionados = useMemo(() => leads.filter((l) => selecao.has(l.id)), [leads, selecao]);
  const origensPresentes = useMemo(() => Array.from(new Set(leads.map((l) => l.origem).filter(Boolean) as string[])).sort(), [leads]);
  const etapasPresentes = useMemo(() => Array.from(new Set(leads.map((l) => l.etapa ?? ""))).sort(), [leads]);

  const mudar = <K extends keyof FiltrosLimpeza>(k: K, v: FiltrosLimpeza[K]) => setFiltros((f) => ({ ...f, [k]: v }));

  function alternar(id: string) {
    const r = alternarSelecao(selecao, id);
    if (r.recusado) avisar(`Máximo de ${LIMITE_RODADA} por rodada. Apague estes primeiro.`, "info");
    setSelecao(r.selecao);
  }

  function marcarTodos() {
    const r = marcarFiltrados(selecao, filtrados);
    setSelecao(r.selecao);
    if (r.cortados > 0) avisar(`Marquei até o limite de ${LIMITE_RODADA}. ${r.cortados} ficaram para a próxima rodada.`, "info");
  }

  if (somenteLeitura) {
    return <p className="text-sm text-neutral-600">Acesso só de visualização: esta tela apaga dados e não abre aqui.</p>;
  }

  return (
    <div className="space-y-4 pb-4">
      <Cartao className="p-5">
        <div className="flex items-start gap-3">
          <IconeChip icone={Trash2} cor="vermelho" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-neutral-900">Limpar leads</h1>
            <div className="mt-1">
              <Pilula cor="ambar" icone={AlertTriangle}>
                Temporária: remover quando terminar a limpeza
              </Pilula>
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Só leads sem locação, reserva, pagamento, crédito, contrato, acesso ao Planejador ou planejamento. No máximo {LIMITE_RODADA} por rodada.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {deFora === 1 ? "1 lead" : `${deFora} leads`} com locação, reserva, pagamento ou outro vínculo {deFora === 1 ? "fica" : "ficam"} de fora.
            </p>
            <Link href="/clientes" className="mt-2 inline-block text-xs text-brand-blue underline underline-offset-2">
              Voltar para Clientes
            </Link>
          </div>
        </div>
      </Cartao>

      {erro && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-semibold">Não consegui carregar a lista. Nada foi apagado.</p>
          <p className="mt-1">{erro}</p>
          <button onClick={() => router.refresh()} className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold ring-1 ring-rose-300">
            Tentar de novo
          </button>
        </div>
      )}

      {!erro && (
        <>
          <Cartao className="space-y-3 p-4">
            <TituloBloco>Filtros</TituloBloco>
            <label className="flex items-center gap-2 rounded-xl px-3 py-2.5 ring-1 ring-neutral-200">
              <Search size={16} className="text-neutral-400" />
              <input
                value={filtros.busca}
                onChange={(e) => mudar("busca", e.target.value)}
                placeholder="Nome, telefone ou cidade"
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select value={filtros.etapa} onChange={(e) => mudar("etapa", e.target.value)} className="rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-neutral-200">
                <option value="">Todas as etapas</option>
                {etapasPresentes.map((k) => (
                  <option key={k || "sem"} value={k}>
                    {rotuloEtapa(k)}
                  </option>
                ))}
              </select>
              <select value={filtros.origem} onChange={(e) => mudar("origem", e.target.value)} className="rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-neutral-200">
                <option value="">Todas as origens</option>
                <option value="__sem__">Sem origem</option>
                {origensPresentes.map((o) => (
                  <option key={o} value={o}>
                    {rotuloDaOrigem(origens, o)}
                  </option>
                ))}
              </select>
              <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700 sm:col-span-1">
                <span className="whitespace-nowrap">Criados antes de</span>
                <input
                  type="date"
                  value={filtros.criadosAntesDe}
                  onChange={(e) => mudar("criadosAntesDe", e.target.value)}
                  className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-neutral-200"
                />
              </label>
              <select
                value={filtros.ordem}
                onChange={(e) => mudar("ordem", e.target.value as Ordem)}
                className="col-span-2 rounded-xl bg-white px-3 py-2.5 text-sm ring-1 ring-neutral-200 sm:col-span-1"
              >
                <option value="nome">Ordem: nome</option>
                <option value="antigos">Ordem: mais antigos primeiro</option>
                <option value="recentes">Ordem: mais recentes primeiro</option>
                <option value="cidade">Ordem: cidade</option>
                <option value="etapa">Ordem: etapa</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chave ligada={filtros.semWhatsapp} onClick={() => mudar("semWhatsapp", !filtros.semWhatsapp)}>
                Sem WhatsApp
              </Chave>
              <Chave ligada={filtros.semAtividade} onClick={() => mudar("semAtividade", !filtros.semAtividade)}>
                Sem nenhuma atividade
              </Chave>
              <Chave ligada={filtros.naoQuer} onClick={() => mudar("naoQuer", !filtros.naoQuer)}>
                Marcou &quot;não quer receber&quot;
              </Chave>
              {JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS) && (
                <button onClick={() => setFiltros(FILTROS_VAZIOS)} className="px-2 text-xs font-semibold text-brand-blue underline underline-offset-2">
                  Limpar filtros
                </button>
              )}
            </div>
            <p className="text-xs text-neutral-500">&quot;Sem nenhuma atividade&quot; = sem tarefa, anotação nem envio de campanha.</p>
          </Cartao>

          <div className="space-y-2">
            {filtrados.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-500">{leads.length === 0 ? "Nenhum lead sem vínculo para limpar." : "Nenhum lead com esses filtros."}</p>
            )}
            {filtrados.map((l) => (
              <LinhaLead key={l.id} lead={l} marcado={selecao.has(l.id)} onAlternar={() => alternar(l.id)} origem={rotuloDaOrigem(origens, l.origem)} />
            ))}
          </div>

          <div className="sticky bottom-24 z-20 md:bottom-4">
            <div className="cartao flex flex-wrap items-center gap-2 p-3">
              <p className="mr-auto text-sm font-semibold text-neutral-800">
                {selecao.size} selecionados de {filtrados.length}
              </p>
              <button onClick={marcarTodos} disabled={!filtrados.length} className="rounded-xl px-3 py-2 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-300 disabled:opacity-40">
                Marcar todos os filtrados
              </button>
              <button onClick={() => setSelecao(new Set())} disabled={!selecao.size} className="rounded-xl px-3 py-2 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-300 disabled:opacity-40">
                Limpar seleção
              </button>
              <button
                onClick={() => setJanela(true)}
                disabled={!selecao.size}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40 sm:w-auto"
              >
                <Trash2 size={16} /> Excluir {selecao.size} selecionados
              </button>
            </div>
          </div>
        </>
      )}

      {janela && selecionados.length > 0 && (
        <JanelaExclusao
          leads={selecionados}
          onFechar={(houveExclusao) => {
            setJanela(false);
            if (houveExclusao) router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Chave({ ligada, onClick, children }: { ligada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ligada}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${ligada ? "bg-teal-50 text-teal-700 ring-teal-300" : "bg-white text-neutral-600 ring-neutral-200"}`}
    >
      {children}
    </button>
  );
}

function LinhaLead({ lead: l, marcado, onAlternar, origem }: { lead: LeadLimpeza; marcado: boolean; onAlternar: () => void; origem: string }) {
  const partesHistorico = [
    l.tarefas ? `${l.tarefas} tarefa${l.tarefas > 1 ? "s" : ""}` : "",
    l.anotacoes ? `${l.anotacoes} anotaç${l.anotacoes > 1 ? "ões" : "ão"}` : "",
    l.envios ? `${l.envios} envio${l.envios > 1 ? "s" : ""} de campanha` : "",
  ].filter(Boolean);
  return (
    <div
      role="checkbox"
      aria-checked={marcado}
      tabIndex={0}
      onClick={onAlternar}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onAlternar();
        }
      }}
      className={`cartao flex cursor-pointer gap-3 p-3 ${marcado ? "ring-2 ring-rose-400" : ""}`}
    >
      <span className={`mt-0.5 flex-shrink-0 ${marcado ? "text-rose-600" : "text-neutral-400"}`}>{marcado ? <SquareCheck size={22} /> : <Square size={22} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-neutral-900">{l.nome}</p>
            {l.apelido && <p className="text-xs text-neutral-500">{l.apelido}</p>}
          </div>
          <a
            href={linkCliente(l.id)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-brand-teal/30 bg-brand-teal/5 px-2.5 py-1 text-[11px] font-medium text-brand-teal-dark"
          >
            <ExternalLink size={12} /> Ficha
          </a>
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          {[l.cidade || "Sem cidade", temWhatsapp(l) ? l.whatsapp : "sem WhatsApp", rotuloEtapa(l.etapa), origem || "sem origem", l.criadoEm ? `criado em ${formatDate(l.criadoEm)}` : "sem data"].join(" · ")}
        </p>
        {(temHistorico(l) || l.naoQuer || l.indicou > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {temHistorico(l) && (
              <Pilula cor="ambar" icone={History}>
                {partesHistorico.join(", ")}
              </Pilula>
            )}
            {l.naoQuer && (
              <Pilula cor="cinza" icone={MessageCircleOff}>
                Não quer receber
              </Pilula>
            )}
            {l.indicou > 0 && <Pilula cor="azul">Indicou {l.indicou}</Pilula>}
          </div>
        )}
      </div>
    </div>
  );
}

type Fase = "revisar" | "executando" | "fim";

function JanelaExclusao({ leads, onFechar }: { leads: LeadLimpeza[]; onFechar: (houveExclusao: boolean) => void }) {
  const supabase = createClient();
  const resumo = useMemo(() => resumoExclusao(leads), [leads]);
  // A lista da rodada fica congelada ao abrir a janela.
  const alvo = useRef(leads);
  const [copia, setCopia] = useState<string | null>(null);
  const [erroCopia, setErroCopia] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<Fase>("revisar");
  const [feitos, setFeitos] = useState(0);
  const [atual, setAtual] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const parar = useRef(false);
  const [parando, setParando] = useState(false);
  const gerou = useRef(false);

  function baixarCopia() {
    setErroCopia(null);
    try {
      const nome = nomeArquivoCopia();
      const blob = new Blob([textoCopia(alvo.current)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCopia(nome);
    } catch (e) {
      setCopia(null);
      setErroCopia(e instanceof Error ? e.message : "Não consegui gerar a cópia.");
    }
  }

  // Baixa a cópia sozinha ao abrir a janela (o toque em "Excluir" acabou de acontecer).
  useEffect(() => {
    if (gerou.current) return;
    gerou.current = true;
    baixarCopia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Confere de novo, em lote, os vínculos que a prévia do banco não mostra. */
  async function conferirVinculos(ids: string[]): Promise<Map<string, string>> {
    const bloqueio = new Map<string, Partial<Vinculos>>();
    const marcar = (id: string, k: keyof Vinculos) => bloqueio.set(id, { ...(bloqueio.get(id) ?? {}), [k]: true });
    const tabelas: [string, keyof Vinculos][] = [
      ["rentals", "locacao"],
      ["transactions", "lancamento"],
      ["calendar_events", "agenda"],
      ["creditos_cliente", "credito"],
      ["contratos_emitidos", "contrato"],
      ["planejamentos", "planejamento"],
    ];
    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      const consultas = [
        ...tabelas.map(([t, k]) =>
          supabase
            .from(t)
            .select("client_id")
            .in("client_id", lote)
            .then(({ data, error }) => {
              if (error) throw new Error(`${t}: ${error.message}`);
              for (const r of (data ?? []) as { client_id: string }[]) marcar(r.client_id, k);
            })
        ),
        supabase
          .from("profiles")
          .select("cliente_id")
          .in("cliente_id", lote)
          .then(({ data, error }) => {
            if (error) throw new Error(`profiles: ${error.message}`);
            for (const r of (data ?? []) as { cliente_id: string }[]) marcar(r.cliente_id, "login");
          }),
        supabase
          .from("clients")
          .select("id, is_client")
          .in("id", lote)
          .then(({ data, error }) => {
            if (error) throw new Error(`clients: ${error.message}`);
            for (const r of (data ?? []) as { id: string; is_client: boolean }[]) if (r.is_client) marcar(r.id, "locacao");
          }),
      ];
      await Promise.all(consultas);
    }
    const motivos = new Map<string, string>();
    for (const [id, v] of bloqueio) motivos.set(id, `Pulado: agora tem ${motivosDeFora(v).join(", ") || "vínculo de cliente"}.`);
    return motivos;
  }

  async function executar() {
    if (!copia || texto.trim().toUpperCase() !== PALAVRA) return;
    parar.current = false;
    setParando(false);
    setFase("executando");
    setErroGeral(null);
    const lista = alvo.current;
    const saida: Resultado[] = [];

    let bloqueados: Map<string, string>;
    try {
      bloqueados = await conferirVinculos(lista.map((l) => l.id));
    } catch (e) {
      setErroGeral(`Não consegui conferir os vínculos antes de apagar, então nada foi apagado. ${e instanceof Error ? e.message : ""}`);
      setFase("fim");
      return;
    }

    for (let i = 0; i < lista.length; i++) {
      const l = lista[i];
      if (parar.current) {
        for (const r of lista.slice(i)) saida.push({ id: r.id, nome: r.nome, ok: false, motivo: "Não tentado: você parou antes." });
        break;
      }
      setAtual(l.nome);
      const motivoLote = bloqueados.get(l.id);
      if (motivoLote) {
        saida.push({ id: l.id, nome: l.nome, ok: false, motivo: motivoLote });
      } else {
        const { data: previa, error: erroPrevia } = await supabase.rpc("preview_exclusao", { p_table: "clients", p_id: l.id });
        const motivo = erroPrevia ? `Prévia recusada: ${explicarErro(erroPrevia)}` : motivoParaNaoApagar(previa as PreviaExclusao | null);
        if (motivo) {
          saida.push({ id: l.id, nome: l.nome, ok: false, motivo });
        } else {
          const { error } = await supabase.rpc("delete_record_forever", { p_table: "clients", p_id: l.id });
          saida.push(error ? { id: l.id, nome: l.nome, ok: false, motivo: explicarErro(error) } : { id: l.id, nome: l.nome, ok: true });
        }
      }
      setFeitos(i + 1);
      setResultados([...saida]);
    }
    setResultados([...saida]);
    setAtual(null);
    setFase("fim");
  }

  const apagados = resultados.filter((r) => r.ok);
  const falhas = resultados.filter((r) => !r.ok);
  const pode = !!copia && texto.trim().toUpperCase() === PALAVRA;
  const total = alvo.current.length;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => fase === "revisar" && onFechar(false)}>
      <div
        role="dialog"
        aria-label="Excluir leads"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="flex items-center gap-3">
          <IconeChip icone={Trash2} cor="vermelho" />
          <p className="text-base font-bold text-neutral-900">
            {fase === "fim" ? "Resultado da exclusão" : `Excluir ${total} ${total === 1 ? "lead" : "leads"}`}
          </p>
        </div>

        {fase === "revisar" && (
          <>
            <ul className="mt-4 space-y-1 rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-700">
              <li>
                <b>{resumo.total}</b> {resumo.total === 1 ? "lead" : "leads"}
              </li>
              <li>
                {resumo.comTarefas} com tarefas ({resumo.tarefas} no total)
              </li>
              <li>
                {resumo.comAnotacoes} com anotações ({resumo.anotacoes} no total)
              </li>
              <li>
                {resumo.comEnvios} com envios de campanha ({resumo.envios} no total)
              </li>
              {resumo.naoQuer > 0 && <li>{resumo.naoQuer} marcaram &quot;não quer receber&quot;</li>}
              {resumo.indicaram > 0 && <li>{resumo.indicaram} indicaram alguém (a indicação fica sem nome)</li>}
            </ul>

            <div className="mt-3 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
              <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />
              <p>
                Irreversível. Apaga também tarefas, anotações e o histórico de campanha desses leads. Quem marcou &quot;não quer receber&quot; deixa de estar bloqueado para campanhas futuras.
              </p>
            </div>

            <div className="mt-3 rounded-2xl p-3 ring-1 ring-neutral-200">
              {copia ? (
                <p className="flex items-start gap-2 text-sm text-emerald-700">
                  <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Cópia salva em Downloads: <b className="break-all">{copia}</b>
                  </span>
                </p>
              ) : (
                <p className="text-sm text-rose-700">{erroCopia ?? "Gerando a cópia..."}</p>
              )}
              <button onClick={baixarCopia} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue underline underline-offset-2">
                <Download size={14} /> {copia ? "Baixar a cópia de novo" : "Gerar a cópia"}
              </button>
            </div>

            <p className="mt-4 text-sm font-medium text-neutral-800">Para confirmar, escreva {PALAVRA}:</p>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pode && executar()}
              placeholder={PALAVRA}
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-2 w-full rounded-xl px-3.5 py-3 text-base font-semibold tracking-widest ring-1 ring-neutral-300 outline-none focus:ring-2 focus:ring-rose-400"
            />
            {!copia && <p className="mt-1 text-xs text-neutral-500">O botão só libera depois da cópia salva.</p>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => onFechar(false)} className="rounded-2xl py-3 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-300">
                Cancelar
              </button>
              <button onClick={executar} disabled={!pode} className="flex items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-40">
                <Trash2 size={16} /> Apagar {total}
              </button>
            </div>
          </>
        )}

        {fase === "executando" && (
          <div className="mt-4">
            <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${total ? Math.round((feitos / total) * 100) : 0}%` }} />
            </div>
            <p className="mt-2 text-sm text-neutral-700">
              {feitos} de {total} · {resultados.filter((r) => r.ok).length} apagados · {resultados.filter((r) => !r.ok).length} com problema
            </p>
            {atual && (
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-neutral-500">
                <Loader2 size={12} className="animate-spin" /> {atual}
              </p>
            )}
            <button
              onClick={() => {
                parar.current = true;
                setParando(true);
              }}
              disabled={parando}
              className="mt-4 w-full rounded-2xl py-3 text-sm font-semibold text-neutral-800 ring-1 ring-neutral-300 disabled:opacity-50"
            >
              {parando ? "Parando depois deste..." : "Parar"}
            </button>
          </div>
        )}

        {fase === "fim" && (
          <div className="mt-4 space-y-3">
            {erroGeral && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{erroGeral}</p>}
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={18} /> {apagados.length} {apagados.length === 1 ? "apagado" : "apagados"}
            </p>
            {falhas.length > 0 && (
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                  <XCircle size={18} /> {falhas.length} não {falhas.length === 1 ? "apagado (continua na lista)" : "apagados (continuam na lista)"}
                </p>
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {falhas.map((f) => (
                    <li key={f.id} className="rounded-xl bg-rose-50 p-2 text-xs text-rose-800">
                      <b>{f.nome}</b>
                      <br />
                      {f.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={() => onFechar(true)} className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white">
              Fechar e recarregar a lista
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
