"use client";

// Categorias de lançamento (24/10/2026): Harmonize e Pessoal, entradas e
// saídas. As do sistema (cadeado) não se renomeiam, arquivam nem apagam.
// Arquivar tira da lista de escolha sem mexer nos lançamentos antigos; apagar
// só vale para categoria sem nenhum lançamento.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar, pedirTexto } from "@/components/Dialogos";
import {
  buscarUsoCategorias,
  ehDoSistema,
  limparNomeCategoria,
  ordenarCategorias,
  problemaNomeCategoria,
  type CategoriaLinha,
} from "@/lib/categorias";
import { Bloco } from "../ui";

type Escopo = "harmonize" | "pessoal";
type Tipo = "entrada" | "saida";

const aba = (ativa: boolean) =>
  `flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${ativa ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`;
const botaoIcone =
  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-neutral-500 active:bg-neutral-200 disabled:opacity-30";

function plural(n: number) {
  return n === 1 ? "1 lançamento" : `${n.toLocaleString("pt-BR")} lançamentos`;
}

export default function Categorias() {
  const supabase = createClient();
  const [lista, setLista] = useState<CategoriaLinha[] | null>(null);
  const [uso, setUso] = useState<Record<string, number>>({});
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<Escopo>("harmonize");
  const [tipo, setTipo] = useState<Tipo>("saida");
  const [novo, setNovo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("categories").select("*").order("name");
    if (error) {
      setErroCarga(`Não consegui carregar as categorias: ${error.message}`);
      return;
    }
    setErroCarga(null);
    setLista((data ?? []) as CategoriaLinha[]);
    setUso(await buscarUsoCategorias(supabase));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Antes do SQL da etapa 2b a tabela não tem a coluna "sistema": a tela só mostra.
  const migrada = !!lista && lista.length > 0 && Object.prototype.hasOwnProperty.call(lista[0], "sistema");
  const temPessoal = !!lista?.some((c) => c.scope === "pessoal");

  const doEspaco = useMemo(() => (lista ?? []).filter((c) => (c.scope ?? "harmonize") === escopo), [lista, escopo]);
  const daAba = useMemo(() => ordenarCategorias(doEspaco.filter((c) => c.type === tipo)), [doEspaco, tipo]);
  const ativas = daAba.filter((c) => !c.arquivada);
  const arquivadas = daAba.filter((c) => c.arquivada);

  async function rpc(nome: string, args: Record<string, unknown>, id: string): Promise<boolean> {
    setOcupado(id);
    const { error } = await supabase.rpc(nome, args);
    setOcupado(null);
    if (error) {
      avisar(error.message || "Não foi possível salvar.", "erro");
      return false;
    }
    await carregar();
    return true;
  }

  async function criar() {
    const nome = limparNomeCategoria(novo);
    const problema = problemaNomeCategoria(nome, { scope: escopo, type: tipo }, lista ?? []);
    if (problema) return avisar(problema, "erro");
    if (await rpc("salvar_categoria", { p_id: null, p_nome: nome, p_scope: escopo, p_type: tipo }, "novo")) {
      setNovo("");
      avisar(`Categoria "${nome}" criada.`);
    }
  }

  async function renomear(c: CategoriaLinha) {
    const digitado = await pedirTexto({ titulo: `Renomear "${c.name}"`, valorInicial: c.name, confirmar: "Continuar" });
    if (digitado === null) return;
    const nome = limparNomeCategoria(digitado);
    if (nome === c.name) return;
    const problema = problemaNomeCategoria(nome, { id: c.id, scope: c.scope ?? "harmonize", type: String(c.type) }, lista ?? []);
    if (problema) return avisar(problema, "erro");
    const qtd = uso[c.id] ?? 0;
    const ok = await confirmar({
      titulo: `Trocar "${c.name}" por "${nome}"?`,
      texto:
        qtd > 0
          ? `${plural(qtd)} ${qtd === 1 ? "passa" : "passam"} a aparecer como "${nome}" no Financeiro e nos relatórios. Nenhum valor muda.`
          : "Nenhum lançamento usa esta categoria ainda.",
      confirmar: "Renomear",
    });
    if (!ok) return;
    if (await rpc("salvar_categoria", { p_id: c.id, p_nome: nome }, c.id)) avisar(`Agora é "${nome}".`);
  }

  async function arquivar(c: CategoriaLinha, arquivar: boolean) {
    const qtd = uso[c.id] ?? 0;
    const ok = await confirmar(
      arquivar
        ? {
            titulo: `Arquivar "${c.name}"?`,
            texto: `Ela some da lista na hora de lançar. ${qtd > 0 ? `Os ${plural(qtd)} antigos continuam com ela, nos relatórios também.` : ""} Dá para reativar depois.`,
            confirmar: "Arquivar",
          }
        : { titulo: `Reativar "${c.name}"?`, texto: "Ela volta a aparecer na hora de lançar.", confirmar: "Reativar" }
    );
    if (!ok) return;
    await rpc("arquivar_categoria", { p_id: c.id, p_arquivar: arquivar }, c.id);
  }

  async function apagar(c: CategoriaLinha) {
    const ok = await confirmar({
      titulo: `Apagar "${c.name}"?`,
      texto: "Nenhum lançamento usa esta categoria. Ela sai da lista para sempre.",
      confirmar: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    if (await rpc("excluir_categoria", { p_id: c.id }, c.id)) avisar(`"${c.name}" apagada.`);
  }

  function linha(c: CategoriaLinha) {
    const sistema = ehDoSistema(c);
    const qtd = uso[c.id] ?? 0;
    const travado = !migrada || ocupado !== null;
    return (
      <li key={c.id} className={`flex items-center gap-2 rounded-2xl py-1.5 pl-3 pr-1 ${c.arquivada ? "bg-neutral-50 opacity-70" : "bg-neutral-50"}`}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {sistema && <Lock size={13} className="flex-shrink-0 text-neutral-400" aria-label="Do sistema" />}
            <span className="truncate text-sm font-medium text-neutral-900">{c.name}</span>
          </span>
          <span className="block text-[11px] text-neutral-500">
            {sistema ? "Do sistema · " : ""}
            {qtd > 0 ? plural(qtd) : "Sem lançamentos"}
          </span>
        </span>
        {ocupado === c.id ? (
          <Loader2 size={16} className="mr-3 animate-spin text-neutral-400" />
        ) : sistema ? null : (
          <span className="flex">
            {!c.arquivada && (
              <button type="button" disabled={travado} onClick={() => renomear(c)} className={botaoIcone} aria-label={`Renomear ${c.name}`}>
                <Pencil size={15} />
              </button>
            )}
            <button
              type="button"
              disabled={travado}
              onClick={() => arquivar(c, !c.arquivada)}
              className={botaoIcone}
              aria-label={c.arquivada ? `Reativar ${c.name}` : `Arquivar ${c.name}`}
            >
              {c.arquivada ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            </button>
            {qtd === 0 && (
              <button
                type="button"
                disabled={travado}
                onClick={() => apagar(c)}
                className={`${botaoIcone} active:bg-rose-50 active:text-rose-600`}
                aria-label={`Apagar ${c.name}`}
              >
                <Trash2 size={15} />
              </button>
            )}
          </span>
        )}
      </li>
    );
  }

  if (erroCarga) return <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{erroCarga}</p>;
  if (!lista) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-neutral-500">
        <Loader2 size={16} className="animate-spin" /> Carregando categorias...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!migrada && (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Para editar as categorias, rode antes o SQL da etapa 2b (categorias editáveis) no Supabase. Até lá a lista só aparece aqui.
        </p>
      )}

      <div className="space-y-2">
        {temPessoal && (
          <div className="flex gap-1 rounded-2xl bg-neutral-100 p-1">
            <button type="button" className={aba(escopo === "harmonize")} onClick={() => setEscopo("harmonize")}>
              Harmonize
            </button>
            <button type="button" className={aba(escopo === "pessoal")} onClick={() => setEscopo("pessoal")}>
              Pessoal
            </button>
          </div>
        )}
        <div className="flex gap-1 rounded-2xl bg-neutral-100 p-1">
          <button type="button" className={aba(tipo === "saida")} onClick={() => setTipo("saida")}>
            Saídas
          </button>
          <button type="button" className={aba(tipo === "entrada")} onClick={() => setTipo("entrada")}>
            Entradas
          </button>
        </div>
      </div>

      <Bloco titulo={`Nova categoria de ${tipo === "saida" ? "saída" : "entrada"}${escopo === "pessoal" ? " (Pessoal)" : ""}`}>
        <div className="flex gap-2">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            maxLength={60}
            disabled={!migrada}
            placeholder={tipo === "saida" ? "Ex.: Marketing, Manutenção" : "Ex.: Curso, Consultoria"}
            className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-brand-teal disabled:bg-neutral-50"
          />
          <button
            type="button"
            onClick={criar}
            disabled={!migrada || !novo.trim() || ocupado !== null}
            className="flex items-center gap-1 rounded-xl bg-brand-gradient px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {ocupado === "novo" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar
          </button>
        </div>
      </Bloco>

      <Bloco
        titulo={`${tipo === "saida" ? "Saídas" : "Entradas"} (${ativas.length})`}
        dica={
          escopo === "harmonize" && tipo === "entrada"
            ? "Locação e Mentoria nascem sozinhas quando a locação ou a mentoria é finalizada; por isso não aparecem no lançamento manual."
            : "O cadeado marca as que o sistema usa pelo nome: essas ficam como estão."
        }
      >
        {ativas.length === 0 ? (
          <p className="py-3 text-center text-sm text-neutral-400">Nenhuma categoria aqui.</p>
        ) : (
          <ul className="space-y-1.5">
            {ativas.map(linha)}
          </ul>
        )}
      </Bloco>

      {arquivadas.length > 0 && (
        <Bloco titulo={`Arquivadas (${arquivadas.length})`} dica="Não aparecem na hora de lançar, mas continuam nos lançamentos antigos e nos relatórios.">
          <ul className="space-y-1.5">
            {arquivadas.map(linha)}
          </ul>
        </Bloco>
      )}
    </div>
  );
}
