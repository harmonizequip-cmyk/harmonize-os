"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

export type TestTable = "clients" | "transactions" | "rentals" | "calendar_events" | "mentoring_events" | "tasks";

export interface TestRecord {
  table: TestTable;
  id: string;
  label: string;
  detail: string;
  date: string | null;
  amount: number | null;
}

interface SearchHit {
  table: "clients" | "transactions";
  id: string;
  label: string;
  detail: string;
}

// Ação destrutiva esperando a senha. Guardar a função aqui (em vez de
// espalhar um modal por botão) mantém uma única porta de entrada pra
// tudo que apaga dado.
interface PendingAction {
  title: string;
  warning: string;
  run: () => Promise<void>;
}

const GROUP_LABEL: Record<TestTable, string> = {
  clients: "Clientes",
  transactions: "Lançamentos",
  rentals: "Locações",
  calendar_events: "Agenda",
  mentoring_events: "Mentorias",
  tasks: "Tarefas",
};

const GROUP_ORDER: TestTable[] = [
  "transactions",
  "rentals",
  "calendar_events",
  "clients",
  "mentoring_events",
  "tasks",
];

// ============================================================
// Painel do modo teste.
//
// O risco que essa funcionalidade cria não é teste aparecer no
// relatório: é uma venda real ficar marcada como teste, sumir do
// relatório e depois ser apagada junto com a limpeza sem ninguém
// perceber. Por isso a tela é construída em cima de três decisões:
//
//   1. toda marcação é reversível com um clique, nos dois sentidos;
//   2. nada é apagado sem senha e sem mostrar antes o que vai sumir;
//   3. enquanto a chave estiver ligada, o aviso fica visível no
//      sistema inteiro (ver app/(app)/layout.tsx), porque esquecer
//      ela ligada é o jeito mais fácil de marcar venda real como
//      teste sem querer.
// ============================================================
export default function DadosTesteClient({
  initialTestMode,
  initialRecords,
  userEmail,
}: {
  initialTestMode: boolean;
  initialRecords: TestRecord[];
  userEmail: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [testMode, setTestMode] = useState(initialTestMode);
  const [records, setRecords] = useState(initialRecords);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    setNotice(null);
  }

  async function toggleTestMode(next: boolean) {
    setError(null);
    setNotice(null);
    setTestMode(next);
    const { error: e } = await supabase.from("settings").update({ test_mode: next }).eq("id", true);
    if (e) {
      setTestMode(!next);
      fail(e);
      return;
    }
    setNotice(
      next
        ? "Modo teste ligado. Tudo que você criar a partir de agora nasce marcado como teste."
        : "Modo teste desligado. Novos registros voltam a contar como reais."
    );
    router.refresh();
  }

  // Converter é sempre reversível, então não pede senha. O caso que
  // mais importa aqui é o inverso do esperado: devolver pro relatório
  // uma venda real que foi marcada como teste por engano.
  async function convertToReal(record: TestRecord) {
    setBusyId(record.id);
    setError(null);
    const { error: e } = await supabase.rpc("set_record_test_flag", {
      p_table: record.table,
      p_id: record.id,
      p_is_test: false,
    });
    setBusyId(null);
    if (e) return fail(e);
    setRecords((prev) => prev.filter((r) => r.id !== record.id));
    setNotice(`"${record.label}" voltou a contar como real.`);
    router.refresh();
  }

  async function markAsTest(hit: SearchHit, cascade: boolean) {
    setBusyId(hit.id);
    setError(null);
    const { error: e } =
      cascade && hit.table === "clients"
        ? await supabase.rpc("set_client_test_flag_cascade", { p_client_id: hit.id, p_is_test: true })
        : await supabase.rpc("set_record_test_flag", { p_table: hit.table, p_id: hit.id, p_is_test: true });
    setBusyId(null);
    if (e) return fail(e);
    setHits((prev) => (prev ?? []).filter((h) => h.id !== hit.id));
    setNotice(
      cascade
        ? `"${hit.label}" e tudo que está vinculado a ele foram marcados como teste.`
        : `"${hit.label}" foi marcado como teste.`
    );
    router.refresh();
  }

  // Busca entre o que NÃO é teste, que é o material do caminho inverso:
  // marcar como teste coisas que já existiam antes desta funcionalidade.
  async function runSearch() {
    const term = search.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError(null);
    const [{ data: cl, error: e1 }, { data: tx, error: e2 }] = await Promise.all([
      supabase.from("clients").select("id, name").eq("is_test", false).ilike("name", `%${term}%`).limit(10),
      supabase
        .from("transactions")
        .select("id, description, amount, date")
        .eq("is_test", false)
        .ilike("description", `%${term}%`)
        .limit(10),
    ]);
    setSearching(false);
    if (e1 || e2) return fail(e1 ?? e2);
    setHits([
      ...(cl ?? []).map((c) => ({
        table: "clients" as const,
        id: c.id as string,
        label: c.name as string,
        detail: "Cliente",
      })),
      ...(tx ?? []).map((t) => ({
        table: "transactions" as const,
        id: t.id as string,
        label: t.description as string,
        detail: `Lançamento · ${formatCurrency(Number(t.amount))} · ${formatDate(t.date as string)}`,
      })),
    ]);
  }

  // ---- ações destrutivas: sempre atrás da senha ----

  function askDeleteRecord(record: TestRecord) {
    setPending({
      title: `Excluir "${record.label}"?`,
      warning:
        "Este registro será apagado para sempre. Se ele estiver ligado a outros (uma locação, por exemplo), o vínculo é desfeito, mas os outros registros continuam existindo.",
      run: async () => {
        const { error: e } = await supabase.rpc("delete_record_forever", {
          p_table: record.table,
          p_id: record.id,
        });
        if (e) throw new Error(e.message);
        setRecords((prev) => prev.filter((r) => r.id !== record.id));
        setNotice(`"${record.label}" foi excluído.`);
      },
    });
  }

  function askPurgeAll() {
    setPending({
      title: `Apagar os ${records.length} registros marcados como teste?`,
      warning:
        "Só serão apagados os registros marcados como teste. Clientes de teste que tenham lançamentos ou locações reais vinculados são preservados, e aparecem no aviso depois.",
      run: async () => {
        const { data, error: e } = await supabase.rpc("purge_test_data");
        if (e) throw new Error(e.message);
        const preservados = Number((data as Record<string, number> | null)?.clientes_preservados ?? 0);
        setRecords([]);
        setNotice(
          preservados > 0
            ? `Dados de teste apagados. ${preservados} cliente(s) foram preservados porque têm registros reais vinculados.`
            : "Dados de teste apagados."
        );
      },
    });
  }

  // A senha conferida é a da própria conta, revalidada no Supabase. Não
  // existe uma "senha do sistema" guardada em algum lugar: seria mais um
  // segredo pra vazar ou esquecer, e não provaria quem está clicando.
  async function confirmPending() {
    if (!pending) return;
    setCheckingPassword(true);
    setPasswordError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });
    if (authError) {
      setCheckingPassword(false);
      setPasswordError("Senha incorreta.");
      return;
    }
    try {
      await pending.run();
      setError(null);
    } catch (e) {
      fail(e);
    }
    setCheckingPassword(false);
    setPending(null);
    setPassword("");
    router.refresh();
  }

  const grouped = GROUP_ORDER.map((table) => ({
    table,
    items: records.filter((r) => r.table === table),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/configuracoes"
          className="text-xs text-neutral-500 underline underline-offset-2 dark:text-neutral-400"
        >
          ← Configurações
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">Dados de teste</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Registros marcados como teste continuam aparecendo no Financeiro e na Agenda, mas não entram no Dashboard nem
          nos Relatórios.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3 text-sm text-brand-teal">
          {notice}
        </div>
      )}

      {/* ---- A chave geral ---- */}
      <section
        className={`rounded-2xl border p-4 ${
          testMode
            ? "border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20"
            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Modo teste</h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {testMode
                ? "Ligado: tudo que você criar agora nasce como teste, inclusive o lançamento e o evento de agenda que uma locação cria junto."
                : "Desligado: tudo que você criar conta normalmente nos relatórios."}
            </p>
          </div>
          <button
            onClick={() => toggleTestMode(!testMode)}
            aria-label={testMode ? "Desligar modo teste" : "Ligar modo teste"}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${
              testMode ? "bg-amber-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                testMode ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
        {testMode && (
          <p className="mt-3 flex items-start gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            Lembre de desligar quando terminar. Com a chave ligada, uma venda real lançada por engano fica fora dos
            relatórios.
          </p>
        )}
      </section>

      {/* ---- Marcar como teste algo que já existe ---- */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Marcar como teste algo que já está no sistema
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Serve para limpar o que você testou antes desta tela existir. Busque por nome de cliente ou descrição do
          lançamento.
        </p>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Nome do cliente ou descrição..."
              className="w-full rounded-xl border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {searching ? <Loader2 size={15} className="animate-spin" /> : "Buscar"}
          </button>
        </div>

        {hits !== null && hits.length === 0 && !searching && (
          <p className="mt-3 text-xs text-neutral-400">Nada encontrado fora dos registros já marcados como teste.</p>
        )}

        {hits && hits.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {hits.map((hit) => (
              <li
                key={`${hit.table}-${hit.id}`}
                className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{hit.label}</p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{hit.detail}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={busyId === hit.id}
                    onClick={() => markAsTest(hit, false)}
                    className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-300"
                  >
                    Marcar como teste
                  </button>
                  {hit.table === "clients" && (
                    <button
                      disabled={busyId === hit.id}
                      onClick={() => markAsTest(hit, true)}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Marcar o cliente e tudo dele
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- O que está marcado como teste ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Marcados como teste {records.length > 0 && `(${records.length})`}
          </h2>
          {records.length > 0 && (
            <button
              onClick={askPurgeAll}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              <Trash2 size={13} />
              Apagar todos
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Nenhum registro marcado como teste. Ligue a chave acima antes de testar, ou use a busca para marcar o que
            já existe.
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.table}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {GROUP_LABEL[group.table]} ({group.items.length})
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((record) => (
                  <li
                    key={record.id}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {record.label}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {record.detail}
                          {record.date && ` · ${formatDate(record.date)}`}
                        </p>
                      </div>
                      {record.amount !== null && (
                        <span className="flex-shrink-0 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {formatCurrency(record.amount)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={busyId === record.id}
                        onClick={() => convertToReal(record)}
                        className="flex items-center gap-1 rounded-lg bg-brand-teal/15 px-3 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-50"
                      >
                        <Check size={13} />
                        É real, não é teste
                      </button>
                      <button
                        disabled={busyId === record.id}
                        onClick={() => askDeleteRecord(record)}
                        className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400"
                      >
                        <Trash2 size={13} />
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* ---- Confirmação por senha ---- */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{pending.title}</h3>
              <button
                onClick={() => {
                  setPending(null);
                  setPassword("");
                  setPasswordError(null);
                }}
                aria-label="Cancelar"
                className="text-neutral-400"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{pending.warning}</p>
            <label className="mt-4 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Digite sua senha de acesso para confirmar
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmPending()}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            {passwordError && <p className="mt-1 text-xs text-red-600">{passwordError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                disabled={checkingPassword || password.length === 0}
                onClick={confirmPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {checkingPassword ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
