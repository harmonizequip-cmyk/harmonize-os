"use client";

// Profissionais da clínica (tabela profissionais): listar, cadastrar, editar,
// desativar/reativar e excluir (a que já foi usada é desativada). Usado na
// ficha da cliente (dono) e no portal (a cliente cuida das dela; o banco
// força a clínica dela). Visualização só vê.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Power, Trash2, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { faltaSql, nomeRepetido, problemaProfissional, profissionaisDaCliente, rotuloProfissional, type Profissional } from "@/lib/profissionais";

export const MSG_FALTA_SQL_PROFISSIONAIS = "Falta rodar o SQL das profissionais.";

export default function ProfissionaisCliente({ clienteId, portal, semMoldura }: { clienteId: string; portal?: boolean; semMoldura?: boolean }) {
  const somenteLeitura = useSomenteLeitura();
  const [lista, setLista] = useState<Profissional[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ id: string | null; nome: string; registro: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await createClient().from("profissionais").select("id, client_id, nome, registro, ativo").eq("client_id", clienteId);
    if (error) {
      setErro(faltaSql(error) ? MSG_FALTA_SQL_PROFISSIONAIS : "Não consegui carregar as profissionais. Confira a internet.");
      setLista([]);
      return;
    }
    setErro(null);
    setLista(profissionaisDaCliente((data ?? []) as Profissional[], clienteId));
  }, [clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    if (!form || !lista) return;
    const problema = problemaProfissional(form);
    if (problema) return avisar(problema, "erro");
    const repetida = nomeRepetido(lista, form.nome, form.id);
    if (form.id && repetida) return avisar("Já existe uma profissional com esse nome nesta clínica.", "erro");
    setSalvando(true);
    const atual = form.id ? lista.find((p) => p.id === form.id) : null;
    const { error } = await createClient().rpc("salvar_profissional", {
      p_id: form.id,
      p_client_id: clienteId,
      p_nome: form.nome,
      p_registro: form.registro || null,
      p_ativo: atual ? atual.ativo : true,
    });
    setSalvando(false);
    if (error) return avisar(faltaSql(error) ? MSG_FALTA_SQL_PROFISSIONAIS : error.message || "Não consegui salvar.", "erro");
    setForm(null);
    avisar(repetida && !form.id ? `${repetida.nome} já estava cadastrada (reativada).` : "Profissional salva.");
    carregar();
  }

  async function alternar(p: Profissional) {
    const { error } = await createClient().rpc("salvar_profissional", { p_id: p.id, p_client_id: clienteId, p_nome: p.nome, p_registro: p.registro, p_ativo: !p.ativo });
    if (error) return avisar(error.message || "Não consegui mudar.", "erro");
    carregar();
  }

  async function excluir(p: Profissional) {
    const ok = await confirmar({
      titulo: `Excluir ${p.nome}?`,
      texto: "Se ela já foi usada em algum planejamento ou assinatura, fica só desativada (some da escolha, o histórico continua).",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const { data, error } = await createClient().rpc("excluir_profissional", { p_id: p.id });
    if (error) return avisar(error.message || "Não consegui excluir.", "erro");
    avisar(data === "desativada" ? `${p.nome} já foi usada: ficou desativada.` : `${p.nome} excluída.`);
    carregar();
  }

  const podeMexer = !somenteLeitura && !erro;
  const entrada = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm";

  const corpo = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <UsersRound size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-neutral-900">{portal ? "Profissionais da clínica" : "Profissionais"}</p>
          <p className="text-xs text-neutral-500">
            {lista === null ? "Carregando..." : lista.length === 0 ? "Ninguém cadastrado ainda" : `${lista.filter((p) => p.ativo).length} ativa(s) · escolhidas no planejamento`}
          </p>
        </div>
        {podeMexer && !form && (
          <button type="button" onClick={() => setForm({ id: null, nome: "", registro: "" })} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-50 px-3 text-xs font-bold text-teal-700">
            <Plus size={15} /> Nova
          </button>
        )}
      </div>
      {erro && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">{erro}</p>}
      {lista === null && (
        <p className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 size={13} className="animate-spin" /> Carregando...
        </p>
      )}
      {form && (
        <div className="mt-3 space-y-2 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
          <div className="grid grid-cols-[1fr_130px] gap-2">
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome da profissional" className={entrada} autoComplete="off" autoFocus />
            <input value={form.registro} onChange={(e) => setForm({ ...form, registro: e.target.value })} placeholder="Registro (opcional)" className={entrada} autoComplete="off" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="min-h-10 flex-1 rounded-xl bg-white text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200">
              Cancelar
            </button>
            <button type="button" onClick={salvar} disabled={salvando} className="min-h-10 flex-1 rounded-xl bg-brand-teal text-sm font-bold text-white disabled:opacity-60">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
      {lista && lista.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {lista.map((p) => (
            <li key={p.id} className={`flex items-center gap-2 py-2 ${p.ativo ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-800">{rotuloProfissional(p)}</p>
                {!p.ativo && <p className="text-[11px] text-neutral-500">Desativada</p>}
              </div>
              {podeMexer && (
                <>
                  <button type="button" onClick={() => setForm({ id: p.id, nome: p.nome, registro: p.registro ?? "" })} aria-label={`Editar ${p.nome}`} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100">
                    <Pencil size={15} />
                  </button>
                  <button type="button" onClick={() => alternar(p)} aria-label={p.ativo ? `Desativar ${p.nome}` : `Reativar ${p.nome}`} title={p.ativo ? "Desativar" : "Reativar"} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100">
                    <Power size={15} />
                  </button>
                  <button type="button" onClick={() => excluir(p)} aria-label={`Excluir ${p.nome}`} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 active:bg-rose-50 active:text-rose-600">
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return semMoldura ? <div>{corpo}</div> : <div className="cartao p-4">{corpo}</div>;
}
