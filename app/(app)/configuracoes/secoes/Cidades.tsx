"use client";

// Cidades do encaixe de datas livres (24/10/2026): posição de cada cidade para
// medir a distância em linha reta. Cidade que não está aqui não entra no
// encaixe; o aviso no topo lista as cidades do cadastro de clientes que faltam.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { buscarTodas } from "@/lib/buscar-todas";
import { CIDADES_PADRAO, lerCoordenadas, normalizarCidade } from "@/lib/cidades-coordenadas";
import { buscarCidades, cidadesSemPosicao, mapaDasCidades, type CidadeLinha } from "@/lib/carregar-cidades";
import { Bloco, CampoTexto } from "../ui";

const sem = (t: string) => normalizarCidade(t);

function linhasDaListaFixa(): CidadeLinha[] {
  return Object.entries(CIDADES_PADRAO).map(([nome, [latitude, longitude]]) => ({
    id: nome,
    nome,
    nome_exibicao: nome.replace(/\b\p{L}/gu, (l) => l.toUpperCase()),
    uf: null,
    latitude,
    longitude,
  }));
}

export default function Cidades() {
  const supabase = createClient();
  const [cidades, setCidades] = useState<CidadeLinha[] | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [doCadastro, setDoCadastro] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<{ nome: string; uf: string; coords: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const linhas = await buscarCidades(supabase).catch(() => null);
    setSemTabela(!linhas);
    setCidades(linhas ?? linhasDaListaFixa());
    try {
      const clientes = await buscarTodas<{ city: string | null }>((de, ate) =>
        supabase.from("clients").select("city").not("city", "is", null).order("id").range(de, ate)
      );
      setDoCadastro(clientes.map((c) => c.city ?? ""));
    } catch {
      setDoCadastro([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const faltando = useMemo(() => (cidades ? cidadesSemPosicao(doCadastro, mapaDasCidades(cidades)) : []), [cidades, doCadastro]);
  const filtradas = useMemo(() => {
    const q = sem(busca);
    return (cidades ?? [])
      .filter((c) => !q || c.nome.includes(q) || (c.uf ?? "").toLowerCase() === q)
      .sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, "pt-BR"));
  }, [cidades, busca]);

  const coords = form ? lerCoordenadas(form.coords) : null;

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return avisar("Escreva o nome da cidade.", "erro");
    if (!coords) return avisar('Cole a posição como "-7.1153, -34.861" (latitude, longitude).', "erro");
    const uf = form.uf.trim().toUpperCase();
    if (uf && !/^[A-Z]{2}$/.test(uf)) return avisar("UF deve ter duas letras (ex.: PE).", "erro");
    const existe = cidades?.find((c) => c.nome === normalizarCidade(form.nome));
    if (existe) {
      const ok = await confirmar({
        titulo: `${existe.nome_exibicao} já está na lista`,
        texto: "Trocar a posição dela pela nova?",
        confirmar: "Trocar",
      });
      if (!ok) return;
    }
    setSalvando(true);
    const { error } = await supabase.rpc("salvar_cidade", {
      p_nome: form.nome.trim(),
      p_latitude: coords[0],
      p_longitude: coords[1],
      p_uf: uf || null,
    });
    setSalvando(false);
    if (error) return avisar(error.message || "Não foi possível salvar.", "erro");
    avisar(`${form.nome.trim()} cadastrada.`);
    setForm(null);
    await carregar();
  }

  async function remover(c: CidadeLinha) {
    const usam = doCadastro.filter((x) => normalizarCidade(x) === c.nome).length;
    const ok = await confirmar({
      titulo: `Remover ${c.nome_exibicao}?`,
      texto: usam > 0 ? `${usam} ${usam === 1 ? "cliente mora" : "clientes moram"} lá e deixam de entrar no encaixe.` : "Ela deixa de entrar no encaixe.",
      confirmar: "Remover",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("excluir_cidade", { p_id: c.id });
    if (error) return avisar(error.message || "Não foi possível remover.", "erro");
    await carregar();
  }

  function abrirForm(nome = "") {
    setForm({ nome, uf: "", coords: "" });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!cidades) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-neutral-500">
        <Loader2 size={16} className="animate-spin" /> Carregando cidades...
      </p>
    );
  }

  const linkMapa = (nome: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nome)}`;

  return (
    <div className="space-y-4">
      {semTabela && (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Para editar as cidades, rode antes o SQL da etapa 2b (cidades do encaixe) no Supabase. Até lá vale a lista de sempre, mostrada abaixo.
        </p>
      )}

      {faltando.length > 0 && (
        <Bloco titulo={`Cidades de clientes fora da lista (${faltando.length})`} dica="Quem mora nelas não entra no encaixe de datas livres até a cidade ser cadastrada.">
          <ul className="space-y-1.5">
            {faltando.map((f) => (
              <li key={f.nome} className="flex items-center gap-2 rounded-2xl bg-amber-50/70 py-1.5 pl-3 pr-1.5">
                <AlertTriangle size={14} className="flex-shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">{f.exibir}</span>
                  <span className="block text-[11px] text-neutral-500">
                    {f.clientes} {f.clientes === 1 ? "cliente" : "clientes"}
                  </span>
                </span>
                {!semTabela && (
                  <button
                    type="button"
                    onClick={() => abrirForm(f.exibir)}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-teal ring-1 ring-neutral-200"
                  >
                    Cadastrar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {!semTabela &&
        (form ? (
          <Bloco titulo="Nova cidade" dica="A posição sai do Google Maps: abra a cidade, toque e segure no centro dela e copie os números que aparecem (latitude, longitude).">
            <div className="space-y-3">
              <CampoTexto rotulo="Cidade" valor={form.nome} onChange={(v) => setForm({ ...form, nome: v })} maxLength={80} placeholder="Ex.: Lagoa Seca" />
              <CampoTexto rotulo="UF (opcional)" valor={form.uf} onChange={(v) => setForm({ ...form, uf: v.slice(0, 2) })} placeholder="PB" />
              <CampoTexto rotulo="Latitude, longitude" valor={form.coords} onChange={(v) => setForm({ ...form, coords: v })} placeholder="-7.1153, -34.861" />
              <p className="text-[11px] text-neutral-500">
                {form.coords.trim() ? (coords ? `Lido: latitude ${coords[0]}, longitude ${coords[1]}` : "Não entendi a posição. Use o formato -7.1153, -34.861.") : ""}
              </p>
              {form.nome.trim() && (
                <a
                  href={linkMapa(`${form.nome.trim()}${form.uf.trim() ? ` ${form.uf.trim()}` : ""}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-teal"
                >
                  <ExternalLink size={14} /> Achar {form.nome.trim()} no Google Maps
                </a>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm(null)} className="flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200">
                  <X size={14} /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={salvar}
                  disabled={salvando}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
                </button>
              </div>
            </div>
          </Bloco>
        ) : (
          <button
            type="button"
            onClick={() => abrirForm()}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-brand-teal ring-1 ring-neutral-200"
          >
            <Plus size={16} /> Adicionar cidade
          </button>
        ))}

      <Bloco titulo={`Cidades com posição (${cidades.length})`} dica="Distância em linha reta; pela estrada costuma dar 20% a 30% a mais.">
        <label className="mb-3 flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3">
          <Search size={15} className="text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cidade ou UF"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {filtradas.length === 0 ? (
          <p className="py-3 text-center text-sm text-neutral-400">Nenhuma cidade encontrada.</p>
        ) : (
          <ul className="space-y-1.5">
            {filtradas.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-neutral-50 py-1.5 pl-3 pr-1">
                <MapPin size={14} className="flex-shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {c.nome_exibicao}
                    {c.uf ? <span className="text-neutral-500"> · {c.uf}</span> : null}
                  </span>
                  <span className="block text-[11px] tabular-nums text-neutral-500">
                    {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                  </span>
                </span>
                {!semTabela && (
                  <button
                    type="button"
                    onClick={() => remover(c)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-400 active:bg-rose-50 active:text-rose-600"
                    aria-label={`Remover ${c.nome_exibicao}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </div>
  );
}
