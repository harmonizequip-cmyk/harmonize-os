"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { Atalho, Atalhos } from "@/components/Atalhos";
import LiberarAcademy from "@/components/LiberarAcademy";
import { linkCliente } from "@/lib/atalhos";
import {
  acharParecidos,
  digitos,
  dividirCidadeEstado,
  notaDoCadastro,
  tratamentoSugerido,
  type CadastroRecebido,
  type ClienteParaComparar,
} from "@/lib/cadastro-formulario";
import { confirmar as confirmarDialogo } from "@/components/Dialogos";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

function dataHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Campo = "treatment" | "whatsapp" | "email" | "clinic_name" | "city" | "state";
const ROTULOS: Record<Campo, string> = {
  treatment: "Tratamento",
  whatsapp: "WhatsApp",
  email: "E-mail",
  clinic_name: "Clínica/empresa",
  city: "Cidade",
  state: "UF",
};

type Feito = { clientId: string; nome: string; treatment: string | null; whatsapp: string | null; novo: boolean };

function Cartao({
  cad,
  clientes,
  somenteLeitura,
  aoResolver,
}: {
  cad: CadastroRecebido;
  clientes: ClienteParaComparar[];
  somenteLeitura: boolean;
  aoResolver: (id: string) => void;
}) {
  const supabase = createClient();
  const parecidos = useMemo(() => acharParecidos(cad, clientes), [cad, clientes]);
  const { cidade, uf } = dividirCidadeEstado(cad.cidade_estado);
  const nota = notaDoCadastro(cad);
  const tratamento = tratamentoSugerido(cad);

  const [modo, setModo] = useState<"novo" | "atualizar">(parecidos.length ? "atualizar" : "novo");
  const [alvoId, setAlvoId] = useState<string>(parecidos[0]?.cliente.id ?? "");
  const alvo = clientes.find((c) => c.id === alvoId) ?? null;

  // Lead novo: tudo pré-preenchido e editável.
  const [novo, setNovo] = useState({
    name: (cad.nome ?? "").replace(/^dra?\.?\s+/i, ""),
    treatment: tratamento as string,
    whatsapp: cad.whatsapp ?? "",
    email: cad.email ?? "",
    clinic_name: cad.empresa ?? "",
    city: cidade ?? "",
    state: uf ?? "",
    notes_add: nota ?? "",
  });

  // Atualizar: o que vem do formulário para cada campo.
  const vindo: Record<Campo, string> = {
    treatment: tratamento,
    whatsapp: cad.whatsapp ?? "",
    email: cad.email ?? "",
    clinic_name: cad.empresa ?? "",
    city: cidade ?? "",
    state: uf ?? "",
  };
  const atualDe = (c: Campo) => (alvo ? ((alvo[c] as string | null) ?? "") : "");
  const diferente = (c: Campo) => {
    if (!vindo[c]) return false;
    // Mesmo número escrito de outro jeito não é mudança.
    if (c === "whatsapp") return digitos(vindo[c]).slice(-8) !== digitos(atualDe(c)).slice(-8);
    return vindo[c].trim().toLowerCase() !== atualDe(c).trim().toLowerCase();
  };
  // Marcado de saída só o que está vazio no cadastro do cliente: nada é sobrescrito sem você marcar.
  const [marcados, setMarcados] = useState<Set<Campo>>(
    () => new Set((Object.keys(vindo) as Campo[]).filter((c) => diferente(c) && !atualDe(c)))
  );
  const [comNota, setComNota] = useState(!!nota);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Feito | null>(null);

  function trocarAlvo(id: string) {
    setAlvoId(id);
    const c = clientes.find((x) => x.id === id);
    setMarcados(
      new Set(
        (Object.keys(vindo) as Campo[]).filter((k) => {
          const atual = ((c?.[k] as string | null) ?? "").trim();
          return !!vindo[k] && !atual;
        })
      )
    );
  }

  async function confirmar() {
    setSalvando(true);
    setErro(null);
    let campos: Record<string, string> = {};
    let clientId: string | null = null;
    if (modo === "novo") {
      if (!novo.name.trim()) {
        setErro("Informe o nome.");
        setSalvando(false);
        return;
      }
      campos = { ...novo };
    } else {
      if (!alvo) {
        setErro("Escolha o cliente.");
        setSalvando(false);
        return;
      }
      clientId = alvo.id;
      for (const c of marcados) campos[c] = vindo[c];
      if (comNota && nota) campos.notes_add = nota;
    }
    const { data, error } = await supabase.rpc("confirmar_cadastro_recebido", {
      p_id: cad.id,
      p_client_id: clientId,
      p_campos: campos,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não consegui confirmar. Tente de novo.");
      return;
    }
    setFeito({
      clientId: String(data),
      nome: modo === "novo" ? novo.name : alvo!.name,
      treatment: modo === "novo" ? novo.treatment || null : (campos.treatment ?? alvo!.treatment),
      whatsapp: modo === "novo" ? novo.whatsapp || null : (campos.whatsapp ?? alvo!.whatsapp ?? cad.whatsapp),
      novo: modo === "novo",
    });
  }

  async function descartar() {
    if (!(await confirmarDialogo({ titulo: "Descartar este cadastro?", texto: "Ele não entra no Harmonize.", confirmar: "Descartar", perigo: true }))) return;
    setSalvando(true);
    const { error } = await supabase.rpc("descartar_cadastro_recebido", { p_id: cad.id });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não consegui descartar.");
      return;
    }
    aoResolver(cad.id);
  }

  if (feito) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
        <p className="text-sm font-semibold text-emerald-800">
          ✓ {feito.novo ? "Lead criado" : "Cadastro atualizado"}: {feito.nome}
        </p>
        {/* O link da Academy é só do dono: ele mesmo cadastra a cliente, nunca vai para ela. */}
        <LiberarAcademy nome={cad.nome} email={cad.email} className="mt-3" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/clientes/${feito.clientId}`} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700">
            Abrir ficha
          </Link>
          <button onClick={() => aoResolver(cad.id)} className="rounded-lg px-3 py-2 text-xs font-medium text-neutral-500">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-neutral-900">{cad.nome ?? "Sem nome"}</p>
          <p className="text-[11px] text-neutral-400">Respondeu em {dataHora(cad.respondido_em ?? cad.recebido_em)}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {[
          ["Profissão", cad.profissao],
          ["WhatsApp", cad.whatsapp],
          ["E-mail", cad.email],
          ["Empresa", cad.empresa],
          ["Estabelecimento", cad.estabelecimento],
          ["Cidade/UF", cad.cidade_estado],
        ].map(([r, v]) => (
          <div key={r} className="flex gap-2">
            <dt className="w-28 flex-shrink-0 text-neutral-400">{r}</dt>
            <dd className="min-w-0 break-words text-neutral-800">{v || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex rounded-xl bg-neutral-100 p-1 text-xs font-medium">
        <button
          onClick={() => setModo("atualizar")}
          className={`flex-1 rounded-lg py-2 ${modo === "atualizar" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
        >
          Já é cliente/lead
        </button>
        <button
          onClick={() => setModo("novo")}
          className={`flex-1 rounded-lg py-2 ${modo === "novo" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
        >
          Criar lead novo
        </button>
      </div>

      {modo === "atualizar" ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Cliente</label>
            <select value={alvoId} onChange={(e) => trocarAlvo(e.target.value)} className={input}>
              <option value="">Escolha...</option>
              {parecidos.length > 0 && (
                <optgroup label="Parecidos">
                  {parecidos.map((p) => (
                    <option key={p.cliente.id} value={p.cliente.id}>
                      {p.cliente.name} ({p.motivo})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Todos">
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
            {parecidos.length === 0 && <p className="mt-1 text-[11px] text-neutral-400">Não achei ninguém parecido. Escolha na lista ou crie um lead novo.</p>}
            {alvo && (
              <Atalhos className="mt-1.5">
                <Atalho href={linkCliente(alvo.id)} emoji="👤">Ver ficha</Atalho>
              </Atalhos>
            )}
          </div>

          {alvo && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-neutral-600">Marque o que atualizar</p>
              {(Object.keys(vindo) as Campo[])
                .filter((c) => diferente(c))
                .map((c) => (
                  <label key={c} className="flex items-start gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={marcados.has(c)}
                      onChange={(e) => {
                        const n = new Set(marcados);
                        if (e.target.checked) n.add(c);
                        else n.delete(c);
                        setMarcados(n);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs text-neutral-500">{ROTULOS[c]}</span>
                      <span className="break-words text-neutral-400 line-through">{atualDe(c) || "vazio"}</span>
                      <span className="text-neutral-400"> → </span>
                      <span className="break-words font-medium text-neutral-900">{vindo[c]}</span>
                    </span>
                  </label>
                ))}
              {nota && (
                <label className="flex items-start gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={comNota} onChange={(e) => setComNota(e.target.checked)} />
                  <span>
                    <span className="block text-xs text-neutral-500">Acrescentar nas observações</span>
                    <span className="text-neutral-800">{nota}</span>
                  </span>
                </label>
              )}
              {(Object.keys(vindo) as Campo[]).every((c) => !diferente(c)) && !nota && (
                <p className="text-xs text-neutral-400">O cadastro já está igual ao do formulário.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Nome</label>
            <input value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Tratamento</label>
            <select value={novo.treatment} onChange={(e) => setNovo({ ...novo, treatment: e.target.value })} className={input}>
              <option value="">Nenhum</option>
              <option value="Dra.">Dra.</option>
              <option value="Dr.">Dr.</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">WhatsApp</label>
            <input value={novo.whatsapp} onChange={(e) => setNovo({ ...novo, whatsapp: e.target.value })} className={input} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-600">E-mail</label>
            <input value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} className={input} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Clínica/empresa</label>
            <input value={novo.clinic_name} onChange={(e) => setNovo({ ...novo, clinic_name: e.target.value })} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Cidade</label>
            <input value={novo.city} onChange={(e) => setNovo({ ...novo, city: e.target.value })} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">UF</label>
            <input value={novo.state} maxLength={2} onChange={(e) => setNovo({ ...novo, state: e.target.value })} className={input} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-600">Observação</label>
            <input value={novo.notes_add} onChange={(e) => setNovo({ ...novo, notes_add: e.target.value })} className={input} />
          </div>
        </div>
      )}

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}

      {!somenteLeitura && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={confirmar}
            disabled={salvando}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {salvando ? "Salvando..." : modo === "novo" ? "Confirmar e criar lead" : "Confirmar"}
          </button>
          <button onClick={descartar} disabled={salvando} className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 disabled:opacity-50">
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

export default function CadastrosClient({
  pendentes,
  clientes,
}: {
  pendentes: CadastroRecebido[];
  clientes: ClienteParaComparar[];
}) {
  const somenteLeitura = useSomenteLeitura();
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  const lista = pendentes.filter((p) => !resolvidos.has(p.id));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/clientes" className="text-xs text-neutral-500">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Cadastros recebidos</h1>
        <p className="text-sm text-neutral-500">
          Respostas do formulário da Contourline Academy. Nada entra no Harmonize até você confirmar.
        </p>
      </div>
      {lista.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">
          Nenhum cadastro esperando. Quando alguém preencher o formulário, aparece aqui e chega um aviso no celular.
        </p>
      ) : (
        lista.map((c) => (
          <Cartao
            key={c.id}
            cad={c}
            clientes={clientes}
            somenteLeitura={somenteLeitura}
            aoResolver={(id) => setResolvidos((s) => new Set(s).add(id))}
          />
        ))
      )}
    </div>
  );
}
