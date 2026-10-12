"use client";

// Aplicadores do HIPRO: a contagem de disparos é por aplicador, e eles
// trocam de aparelho. O banco soma à última leitura do contador os disparos
// das locações do HIPRO em que o aplicador estava montado (view
// aplicadores_uso, mentoria fora). Ler o contador de novo corrige a conta.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { type AplicadorUso, situacaoAplicador, lerContador, formatarContador, GARANTIA_PADRAO } from "@/lib/aplicador";

interface Equip {
  id: string;
  name: string;
}

type Painel = { id: string; tipo: "ler" | "trocar" | "editar" } | null;

const campo =
  "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const rotulo = "mb-0.5 block text-[10px] text-neutral-500";
const botaoSalvar = "rounded-lg bg-brand-teal px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-60";

const COR_BARRA = { ok: "bg-brand-teal", perto: "bg-amber-500", fora: "bg-neutral-500", sem_garantia: "bg-neutral-400" };

export default function AplicadoresCard({ aplicadores, equipamentos }: { aplicadores: AplicadorUso[]; equipamentos: Equip[] }) {
  const supabase = createClient();
  const router = useRouter();
  const hoje = hojeLocal();
  const [painel, setPainel] = useState<Painel>(null);
  const [novo, setNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [verDesativados, setVerDesativados] = useState(false);

  // Campos dos formulários (um aberto por vez).
  const [contador, setContador] = useState("");
  const [data, setData] = useState(hoje);
  const [destino, setDestino] = useState("");
  const [nome, setNome] = useState("");
  const [serie, setSerie] = useState("");
  const [limite, setLimite] = useState("");

  const nomeEquip = (id: string | null) => equipamentos.find((e) => e.id === id)?.name ?? null;
  const ativos = aplicadores.filter((a) => a.ativo);
  const desativados = aplicadores.filter((a) => !a.ativo);

  function abrir(a: AplicadorUso, tipo: "ler" | "trocar" | "editar") {
    setErro(null);
    setNovo(false);
    setPainel({ id: a.id, tipo });
    setData(hoje);
    setContador("");
    setDestino(a.equipment_id ? "" : equipamentos[0]?.id ?? "");
    setNome(a.nome);
    setSerie(a.numero_serie ?? "");
    setLimite(a.garantia_disparos ? formatarContador(String(a.garantia_disparos)) : "");
  }

  function abrirNovo() {
    setErro(null);
    setPainel(null);
    setNovo(true);
    setNome(`Aplicador ${aplicadores.length + 1}`);
    setSerie("");
    setLimite(formatarContador(String(GARANTIA_PADRAO)));
    setContador("");
    setDestino("");
  }

  async function rodar(fn: () => Promise<{ error: { message?: string } | null }>) {
    setSalvando(true);
    setErro(null);
    const { error } = await fn();
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não consegui salvar. Tente de novo.");
      return false;
    }
    setPainel(null);
    setNovo(false);
    router.refresh();
    return true;
  }

  async function lerContadorDe(a: AplicadorUso) {
    const n = lerContador(contador);
    if (n == null) return setErro("Digite o número que aparece no contador.");
    await rodar(async () =>
      supabase.rpc("registrar_leitura_aplicador", { p_aplicador_id: a.id, p_contador: n, p_data: data })
    );
  }

  async function trocar(a: AplicadorUso) {
    const eq = destino || null;
    await rodar(async () => supabase.rpc("montar_aplicador", { p_aplicador_id: a.id, p_equipment_id: eq, p_desde: data }));
  }

  async function editar(a: AplicadorUso, ativo = true) {
    if (!ativo && !window.confirm(`Desativar ${a.nome}? Ele sai do aparelho e da lista.`)) return;
    await rodar(async () =>
      supabase.rpc("salvar_aplicador", {
        p_id: a.id,
        p_nome: nome,
        p_numero_serie: serie || null,
        p_garantia_disparos: lerContador(limite),
        p_ativo: ativo,
      })
    );
  }

  async function reativar(a: AplicadorUso) {
    await rodar(async () =>
      supabase.rpc("salvar_aplicador", {
        p_id: a.id,
        p_nome: a.nome,
        p_numero_serie: a.numero_serie,
        p_garantia_disparos: a.garantia_disparos,
        p_ativo: true,
      })
    );
  }

  async function cadastrar() {
    const n = lerContador(contador);
    if (n == null) return setErro("Digite o contador atual do aplicador (pode ser 0).");
    setSalvando(true);
    setErro(null);
    const { data: id, error } = await supabase.rpc("salvar_aplicador", {
      p_id: null,
      p_nome: nome,
      p_numero_serie: serie || null,
      p_garantia_disparos: lerContador(limite),
      p_ativo: true,
      p_contador_inicial: n,
    });
    if (error || !id) {
      setSalvando(false);
      return setErro(error?.message || "Não consegui cadastrar.");
    }
    if (destino) {
      const { error: e2 } = await supabase.rpc("montar_aplicador", { p_aplicador_id: id, p_equipment_id: destino });
      if (e2) {
        setSalvando(false);
        router.refresh();
        return setErro(`Cadastrei, mas não consegui montar: ${e2.message}`);
      }
    }
    setSalvando(false);
    setNovo(false);
    router.refresh();
  }

  const campoData = (min?: string) => (
    <div>
      <label className={rotulo}>Em que dia</label>
      <input type="date" value={data} max={hoje} min={min} onChange={(e) => setData(e.target.value)} className={campo} />
    </div>
  );

  const opcoesLugar = (
    <>
      {equipamentos.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
      <option value="">Reserva</option>
    </>
  );

  return (
    <div
      id="aplicadores"
      className="scroll-mt-20 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55"
    >
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Aplicadores</h2>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        Disparos estimados: última leitura do contador + locações do HIPRO onde ele está (mentoria não entra). Leia o contador de vez
        em quando para acertar a conta.
      </p>

      {ativos.length === 0 && (
        <p className="mt-3 text-xs text-neutral-400">Nenhum aplicador cadastrado ainda. Cadastre os 4 com o contador de hoje.</p>
      )}

      <ul className="mt-3 space-y-3">
        {ativos
          .slice()
          .sort((x, y) => (nomeEquip(x.equipment_id) ?? "zz").localeCompare(nomeEquip(y.equipment_id) ?? "zz") || x.nome.localeCompare(y.nome))
          .map((a) => {
            const s = situacaoAplicador(a);
            const lugar = nomeEquip(a.equipment_id);
            const aberto = painel?.id === a.id ? painel.tipo : null;
            return (
              <li key={a.id} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {a.nome}
                      {a.numero_serie && <span className="ml-1.5 text-[11px] font-normal text-neutral-400">nº {a.numero_serie}</span>}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {lugar ? `No ${lugar} desde ${formatDate(a.montado_desde as string)}` : "Na reserva"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      lugar ? "bg-brand-teal/10 text-brand-teal" : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {lugar ?? "Reserva"}
                  </span>
                </div>

                <p className="mt-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  ≈ {a.disparos.toLocaleString("pt-BR")} <span className="text-xs font-normal text-neutral-500">disparos</span>
                </p>
                {s.pct != null ? (
                  <>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                      <div className={`h-full rounded-full ${COR_BARRA[s.situacao]}`} style={{ width: `${Math.min(100, Math.round(s.pct * 100))}%` }} />
                    </div>
                    <p
                      className={`mt-1 text-[11px] ${
                        s.situacao === "fora"
                          ? "font-medium text-neutral-600 dark:text-neutral-300"
                          : s.situacao === "perto"
                            ? "font-semibold text-amber-600 dark:text-amber-400"
                            : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {s.situacao === "fora" ? "Fora da garantia" : `${Math.round(s.pct * 100)}% da garantia`} de {a.garantia_disparos!.toLocaleString("pt-BR")}
                      {s.situacao === "fora" ? ` · passou ${(a.disparos - a.garantia_disparos!).toLocaleString("pt-BR")}` : ` · faltam ${s.faltam!.toLocaleString("pt-BR")}`}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] text-neutral-400">Sem garantia definida (toque em Editar para pôr).</p>
                )}
                <p className="mt-0.5 text-[10px] text-neutral-400">
                  Última leitura: {a.contador_base.toLocaleString("pt-BR")} em {formatDate(a.contador_base_em)}
                </p>

                {aberto === null && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button type="button" onClick={() => abrir(a, "ler")} className="text-[11px] font-medium text-brand-teal">
                      Ler contador
                    </button>
                    <button type="button" onClick={() => abrir(a, "trocar")} className="text-[11px] font-medium text-brand-teal">
                      {lugar ? "Trocar / guardar" : "Montar num HIPRO"}
                    </button>
                    <button type="button" onClick={() => abrir(a, "editar")} className="text-[11px] text-neutral-500 underline">
                      Editar
                    </button>
                  </div>
                )}

                {aberto === "ler" && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={rotulo}>Número no contador</label>
                        <input
                          inputMode="numeric"
                          value={contador}
                          onChange={(e) => setContador(formatarContador(e.target.value))}
                          placeholder={a.disparos.toLocaleString("pt-BR")}
                          className={campo}
                          autoFocus
                        />
                      </div>
                      {campoData()}
                    </div>
                    <p className="text-[10px] text-neutral-400">Locações depois desse dia somam em cima da leitura.</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={salvando} onClick={() => lerContadorDe(a)} className={botaoSalvar}>
                        Salvar leitura
                      </button>
                      <button type="button" onClick={() => setPainel(null)} className="text-[11px] text-neutral-500 underline">
                        voltar
                      </button>
                    </div>
                  </div>
                )}

                {aberto === "trocar" && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={rotulo}>Vai para</label>
                        <select value={destino} onChange={(e) => setDestino(e.target.value)} className={campo}>
                          {opcoesLugar}
                        </select>
                      </div>
                      {campoData(a.montado_desde ?? undefined)}
                    </div>
                    {destino && destino !== a.equipment_id && (
                      <p className="text-[10px] text-neutral-500">
                        {(() => {
                          const ocupante = ativos.find((o) => o.equipment_id === destino && o.id !== a.id);
                          return ocupante ? `${ocupante.nome} sai do ${nomeEquip(destino)} e vai para a reserva.` : "";
                        })()}{" "}
                        A locação do dia da troca conta para o aplicador que entrou.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={salvando || (destino || null) === a.equipment_id}
                        onClick={() => trocar(a)}
                        className={botaoSalvar}
                      >
                        Confirmar
                      </button>
                      <button type="button" onClick={() => setPainel(null)} className="text-[11px] text-neutral-500 underline">
                        voltar
                      </button>
                    </div>
                  </div>
                )}

                {aberto === "editar" && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={rotulo}>Nome</label>
                        <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
                      </div>
                      <div>
                        <label className={rotulo}>Número de série</label>
                        <input value={serie} onChange={(e) => setSerie(e.target.value)} className={campo} />
                      </div>
                      <div className="col-span-2">
                        <label className={rotulo}>Garantia até (disparos)</label>
                        <input
                          inputMode="numeric"
                          value={limite}
                          onChange={(e) => setLimite(formatarContador(e.target.value))}
                          placeholder="Ex: 6.000.000"
                          className={campo}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={salvando} onClick={() => editar(a)} className={botaoSalvar}>
                        Salvar
                      </button>
                      <button type="button" onClick={() => setPainel(null)} className="text-[11px] text-neutral-500 underline">
                        voltar
                      </button>
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => editar(a, false)}
                        className="ml-auto text-[11px] text-red-600 underline dark:text-red-400"
                      >
                        desativar
                      </button>
                    </div>
                  </div>
                )}
                {aberto && erro && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
              </li>
            );
          })}
      </ul>

      {novo ? (
        <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Novo aplicador</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={rotulo}>Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Número de série</label>
              <input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="opcional" className={campo} />
            </div>
            <div>
              <label className={rotulo}>Contador hoje</label>
              <input
                inputMode="numeric"
                value={contador}
                onChange={(e) => setContador(formatarContador(e.target.value))}
                placeholder="Ex: 448.395"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Onde está</label>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className={campo}>
                {opcoesLugar}
              </select>
            </div>
            <div className="col-span-2">
              <label className={rotulo}>Garantia até (disparos)</label>
              <input
                inputMode="numeric"
                value={limite}
                onChange={(e) => setLimite(formatarContador(e.target.value))}
                placeholder="Ex: 6.000.000"
                className={campo}
              />
            </div>
          </div>
          {erro && <p className="text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setNovo(false)} className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
              Desistir
            </button>
            <button type="button" disabled={salvando} onClick={cadastrar} className="flex-1 rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white disabled:opacity-60">
              {salvando ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={abrirNovo}
          className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          + Cadastrar aplicador
        </button>
      )}

      {desativados.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setVerDesativados((v) => !v)} className="text-[11px] text-neutral-500 underline">
            {verDesativados ? "Esconder" : "Ver"} desativados ({desativados.length})
          </button>
          {verDesativados && (
            <ul className="mt-1 space-y-1">
              {desativados.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>
                    {a.nome} · ≈ {a.disparos.toLocaleString("pt-BR")} disparos
                  </span>
                  <button type="button" disabled={salvando} onClick={() => reativar(a)} className="text-brand-teal">
                    reativar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!painel && !novo && erro && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
