"use client";

// Bloqueio da agenda por período (manutenção, recesso ou outro motivo).
// Enquanto bloqueado, o banco recusa reserva nova do equipamento nesses
// dias (gatilho validar_bloqueio_equipamento). Manutenção que começa hoje
// coloca o equipamento em manutenção sozinha, com volta no dia seguinte ao
// último dia. Reservas que já existiam no período continuam: a tela lista
// quais são antes de confirmar, para reagendar se precisar.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { hojeLocal, somarDias } from "@/lib/period";

export interface Bloqueio {
  id: string;
  equipment_id: string;
  tipo: "manutencao" | "recesso" | "outro";
  motivo: string | null;
  data_inicio: string;
  data_fim: string;
}

export const ROTULO_BLOQUEIO: Record<Bloqueio["tipo"], string> = {
  manutencao: "Manutenção",
  recesso: "Recesso",
  outro: "Outro",
};

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export default function BloqueiosEquipamento({
  equipmentId,
  equipmentName,
  bloqueios,
}: {
  equipmentId: string;
  equipmentName: string;
  bloqueios: Bloqueio[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const hoje = hojeLocal();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Bloqueio["tipo"]>("recesso");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [conflitos, setConflitos] = useState<{ data: string; cliente: string }[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [novoFim, setNovoFim] = useState("");

  function limpar() {
    setAberto(false);
    setTipo("recesso");
    setInicio(hoje);
    setFim("");
    setMotivo("");
    setConflitos(null);
    setErro(null);
  }

  async function conferir() {
    setErro(null);
    if (!inicio || !fim) return setErro("Escolha o primeiro e o último dia.");
    if (fim < inicio) return setErro("O último dia não pode ser antes do primeiro.");
    setSalvando(true);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("date_start, clients(name)")
      .eq("equipment_id", equipmentId)
      .neq("status", "cancelada")
      .lte("date_start", fim)
      .gte("date_end", inicio)
      .order("date_start");
    setSalvando(false);
    if (error) return setErro("Não consegui conferir as reservas do período. Tente de novo.");
    const lista = (data ?? []).map((e: any) => ({ data: e.date_start as string, cliente: um<any>(e.clients)?.name ?? "Sem cliente" }));
    if (lista.length === 0) return salvar();
    setConflitos(lista);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("criar_bloqueio_equipamento", {
      p_equipment_id: equipmentId,
      p_tipo: tipo,
      p_inicio: inicio,
      p_fim: fim,
      p_motivo: motivo.trim() || null,
    });
    setSalvando(false);
    if (error) return setErro(error.message || "Não consegui bloquear. Tente de novo.");
    limpar();
    router.refresh();
  }

  async function mudarFim(b: Bloqueio) {
    if (!novoFim) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("alterar_fim_bloqueio_equipamento", { p_bloqueio_id: b.id, p_fim: novoFim });
    setSalvando(false);
    if (error) return setErro(error.message || "Não consegui mudar o prazo.");
    setEditando(null);
    router.refresh();
  }

  async function excluir(b: Bloqueio) {
    if (!window.confirm(`Excluir o bloqueio de ${formatDate(b.data_inicio)} a ${formatDate(b.data_fim)}? A agenda volta a aceitar reservas nesses dias.`)) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("excluir_bloqueio_equipamento", { p_bloqueio_id: b.id });
    setSalvando(false);
    if (error) return setErro(error.message || "Não consegui excluir.");
    router.refresh();
  }

  const campo =
    "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="mt-4 border-t border-neutral-200/70 pt-3 dark:border-neutral-800">
      <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
        <Lock size={13} /> Agenda bloqueada
      </p>

      {bloqueios.length === 0 ? (
        <p className="mt-1 text-[11px] text-neutral-400">Nenhum bloqueio de hoje em diante.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {bloqueios.map((b) => {
            const emCurso = b.data_inicio <= hoje && b.data_fim >= hoje;
            return (
              <li key={b.id} className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/50">
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  <span
                    className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      b.tipo === "manutencao"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                    }`}
                  >
                    {ROTULO_BLOQUEIO[b.tipo]}
                  </span>
                  {formatDate(b.data_inicio)} a {formatDate(b.data_fim)}
                  {emCurso && <span className="ml-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400">agora</span>}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Volta a aceitar reservas em {formatDate(somarDias(b.data_fim, 1))}
                  {b.motivo ? ` · ${b.motivo}` : ""}
                </p>
                {editando === b.id ? (
                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="mb-0.5 block text-[10px] text-neutral-500">Novo último dia parado</label>
                      <input type="date" value={novoFim} min={b.data_inicio} onChange={(e) => setNovoFim(e.target.value)} className={campo} />
                    </div>
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => mudarFim(b)}
                      className="rounded-lg bg-brand-teal px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
                    >
                      Salvar
                    </button>
                    <button type="button" onClick={() => setEditando(null)} className="text-[11px] text-neutral-500 underline">
                      voltar
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(b.id);
                        setNovoFim(b.data_fim);
                      }}
                      className="text-[11px] font-medium text-brand-teal"
                    >
                      Mudar data de volta
                    </button>
                    <button type="button" disabled={salvando} onClick={() => excluir(b)} className="text-[11px] text-neutral-500 underline">
                      excluir
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Bloquear período
        </button>
      ) : (
        <div className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-800/50">
          <div className="flex gap-1.5">
            {(["manutencao", "recesso", "outro"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`flex-1 rounded-lg border py-1.5 text-[11px] font-medium ${
                  tipo === t
                    ? "border-brand-teal bg-brand-teal text-white"
                    : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                }`}
              >
                {ROTULO_BLOQUEIO[t]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-neutral-500">Primeiro dia parado</label>
              <input type="date" value={inicio} min={hoje} onChange={(e) => { setInicio(e.target.value); setConflitos(null); }} className={campo} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-neutral-500">Último dia parado</label>
              <input type="date" value={fim} min={inicio || hoje} onChange={(e) => { setFim(e.target.value); setConflitos(null); }} className={campo} />
            </div>
          </div>
          {fim && fim >= inicio && (
            <p className="text-[11px] text-neutral-500">
              {equipmentName} volta a aceitar reservas em {formatDate(somarDias(fim, 1))}.
              {tipo === "manutencao" && inicio === hoje ? " Entra em manutenção agora." : ""}
            </p>
          )}
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === "recesso" ? "Ex: férias, feriado (opcional)" : tipo === "manutencao" ? "Ex: troca de peça (opcional)" : "Motivo (opcional)"}
            className={campo}
          />

          {conflitos && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
              <p className="font-medium">
                Já {conflitos.length === 1 ? "existe 1 reserva" : `existem ${conflitos.length} reservas`} nesse período:
              </p>
              <ul className="mt-1 list-disc pl-4">
                {conflitos.map((c, i) => (
                  <li key={i}>
                    {formatDate(c.data)} · {c.cliente}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Elas continuam marcadas. Bloquear mesmo assim? Depois reagende pela Agenda se precisar.</p>
            </div>
          )}

          {erro && <p className="text-[11px] text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={limpar}
              className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Desistir
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={conflitos ? salvar : conferir}
              className="flex-1 rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {salvando ? "Salvando..." : conflitos ? "Bloquear mesmo assim" : "Bloquear"}
            </button>
          </div>
        </div>
      )}
      {erro && !aberto && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
