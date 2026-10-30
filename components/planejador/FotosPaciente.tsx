"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ChevronRight, Columns2, ImagePlus, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { confirmar, avisar } from "@/components/Dialogos";
import {
  AREA_ROSTO,
  ETAPAS_FOTO,
  agruparFotos,
  areasParaFoto,
  faltaSqlDasFotos,
  formatarTamanho,
  rotuloDaEtapa,
  type EtapaFoto,
  type FotoPaciente,
} from "@/lib/fotos-paciente";
import { apagarFotoPaciente, enviarFotoPaciente, urlsAssinadas } from "@/lib/fotos-paciente-envio";

const COLUNAS = "id, paciente_id, planejamento_id, etapa, area, caminho, miniatura, largura, altura, tamanho_bytes, tirada_em, observacao, created_at";
const titulo = "text-[11px] font-bold uppercase tracking-wider text-neutral-500";
const entrada = "min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500";

type PlanoFoto = { id: string; data: string | null; procedimento: string | null };

/**
 * Fotos do paciente (antes, imediato, 30, 60 e 90 dias), só para o dono.
 * Dado sensível: só aparece depois que o paciente autorizou. A grade usa as
 * miniaturas; a foto grande só carrega no visualizador e no comparar.
 */
export default function FotosPaciente({
  pacienteId,
  nomePaciente,
  autorizadoEm,
  planos,
  areas,
  onMudou,
}: {
  pacienteId: string;
  nomePaciente: string;
  autorizadoEm: string | null;
  planos: PlanoFoto[];
  /** Áreas corporais dos planejamentos (o facial não se separa por área). */
  areas: string[];
  onMudou: () => void;
}) {
  const [fotos, setFotos] = useState<FotoPaciente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [faltaSql, setFaltaSql] = useState(false);
  const [autorizado, setAutorizado] = useState<string | null>(autorizadoEm);
  const [liberando, setLiberando] = useState(false);
  const [etapa, setEtapa] = useState<EtapaFoto>("antes");
  const [miniUrls, setMiniUrls] = useState<Map<string, string>>(new Map());
  const [adicionando, setAdicionando] = useState(false);
  const [area, setArea] = useState(AREA_ROSTO);
  const [data, setData] = useState(() => hojeLocal());
  const [planoId, setPlanoId] = useState<string>("");
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);
  const [vendo, setVendo] = useState<string | null>(null);
  const [comparando, setComparando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => setAutorizado(autorizadoEm), [autorizadoEm]);

  const planosOrdenados = useMemo(
    () => [...planos].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")),
    [planos]
  );
  const opcoesArea = useMemo(() => areasParaFoto(areas), [areas]);
  const temCorporal = opcoesArea.length > 1;

  const carregar = useCallback(async () => {
    setErro(null);
    const { data: linhas, error } = await createClient()
      .from("paciente_fotos")
      .select(COLUNAS)
      .eq("paciente_id", pacienteId)
      .order("tirada_em")
      .order("created_at")
      .limit(2000);
    if (error) {
      if (faltaSqlDasFotos(error)) {
        setFaltaSql(true);
        setFotos([]);
        return;
      }
      setErro("Não consegui carregar as fotos. Confira a internet e tente de novo.");
      return;
    }
    setFaltaSql(false);
    setFotos((linhas ?? []) as FotoPaciente[]);
  }, [pacienteId]);

  useEffect(() => {
    setFotos(null);
    carregar();
  }, [carregar]);

  // Endereços das miniaturas (um pedido só; o módulo reaproveita os que já tem).
  useEffect(() => {
    if (!fotos?.length) return;
    let ativo = true;
    urlsAssinadas(createClient(), fotos.map((f) => f.miniatura))
      .then((m) => ativo && setMiniUrls(m))
      .catch(() => ativo && setErro("Não consegui abrir as fotos. Confira a internet e tente de novo."));
    return () => {
      ativo = false;
    };
  }, [fotos]);

  const grupos = useMemo(() => agruparFotos(fotos ?? []), [fotos]);
  const grupoAberto = grupos.find((g) => g.etapa === etapa)!;
  const fotosDaEtapa = useMemo(() => grupoAberto.areas.flatMap((a) => a.fotos), [grupoAberto]);
  const etapasComFoto = grupos.filter((g) => g.total > 0);
  // Título de área só quando a etapa tem foto de área corporal; só Rosto fica sem título.
  const comTitulos = grupoAberto.areas.some((a) => a.area !== AREA_ROSTO);
  const totalBytes = (fotos ?? []).reduce((s, f) => s + (Number(f.tamanho_bytes) || 0), 0);

  if (faltaSql) {
    return (
      <section className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
        <p className={titulo}>Fotos</p>
        <p className="mt-1 text-xs text-neutral-400">Falta rodar o SQL das fotos.</p>
      </section>
    );
  }

  async function liberar() {
    const ok = await confirmar({
      titulo: `${nomePaciente || "O paciente"} autorizou as fotos?`,
      texto: "Confirme só se o paciente autorizou tirar e guardar as fotos dele. Fica registrada a data de hoje.",
      confirmar: "Autorizou",
    });
    if (!ok) return;
    setLiberando(true);
    const { error } = await createClient().rpc("definir_autorizacao_fotos", { p_paciente_id: pacienteId, p_autorizado: true });
    setLiberando(false);
    if (error) {
      if (faltaSqlDasFotos(error)) return setFaltaSql(true);
      return avisar(error.message || "Não consegui salvar. Confira a internet.", "erro");
    }
    setAutorizado(new Date().toISOString());
    avisar("Autorização registrada.");
    onMudou();
  }

  function abrirAdicionar() {
    setArea(AREA_ROSTO);
    setData(hojeLocal());
    setPlanoId(planosOrdenados[0]?.id ?? "");
    setAdicionando(true);
  }

  async function enviar(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (!arquivos.length) return;
    const sb = createClient();
    let falhas = 0;
    for (let i = 0; i < arquivos.length; i++) {
      setProgresso({ atual: i + 1, total: arquivos.length });
      try {
        await enviarFotoPaciente(sb, {
          pacienteId,
          etapa,
          area: !temCorporal || area === AREA_ROSTO ? null : area,
          planejamentoId: planoId || null,
          tiradaEm: data || hojeLocal(),
          arquivo: arquivos[i],
        });
      } catch (e) {
        falhas++;
        avisar(`Foto ${i + 1}: ${e instanceof Error ? e.message : "não consegui enviar."}`, "erro");
      }
    }
    setProgresso(null);
    setAdicionando(false);
    const certas = arquivos.length - falhas;
    if (certas > 0) avisar(certas === 1 ? "Foto guardada." : `${certas} fotos guardadas.`);
    await carregar();
  }

  if (!autorizado) {
    return (
      <section className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
        <p className={titulo}>Fotos</p>
        <div className="mt-2 flex gap-3 rounded-xl bg-neutral-50 p-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal-dark">
            <ShieldCheck size={20} />
          </span>
          <div className="min-w-0 text-sm text-neutral-700">
            <p className="font-semibold text-neutral-900">Fotos são dado sensível</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Antes, imediato, 30, 60 e 90 dias ficam guardados numa pasta privada que só você vê. Só guarde fotos se o paciente autorizou.
            </p>
          </div>
        </div>
        {erro && <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
        <button
          type="button"
          onClick={liberar}
          disabled={liberando || (fotos === null && !erro)}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-teal px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {liberando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} O paciente autorizou o uso das fotos
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 ${titulo}`}>
          <Camera size={13} /> Fotos
        </p>
        {etapasComFoto.length >= 2 && (
          <button
            type="button"
            onClick={() => setComparando(true)}
            className="inline-flex min-h-10 items-center gap-1 rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-700 active:bg-neutral-200"
          >
            <Columns2 size={14} /> Comparar
          </button>
        )}
      </div>

      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {grupos.map((g) => {
          const ativo = g.etapa === etapa;
          return (
            <button
              key={g.etapa}
              type="button"
              onClick={() => {
                setEtapa(g.etapa);
                setAdicionando(false);
              }}
              aria-pressed={ativo}
              className={`min-h-10 flex-shrink-0 rounded-full px-3.5 text-xs font-semibold ring-1 ${ativo ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-700 ring-neutral-300"}`}
            >
              {g.rotulo}
              {g.total > 0 && <span className={`ml-1.5 tabular-nums ${ativo ? "text-white/80" : "text-neutral-400"}`}>{g.total}</span>}
            </button>
          );
        })}
      </div>

      {erro && <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

      <div className="mt-3 space-y-3">
        {fotos === null && !erro && (
          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 size={13} className="animate-spin" /> Carregando as fotos...
          </p>
        )}
        {fotos !== null && grupoAberto.total === 0 && !adicionando && (
          <p className="rounded-xl border border-dashed border-neutral-300 px-3 py-4 text-center text-xs text-neutral-500">
            Nenhuma foto em {grupoAberto.rotulo.toLowerCase()}.
          </p>
        )}
        {grupoAberto.areas.map((a) => (
          <div key={a.area}>
            {comTitulos && <p className="mb-1.5 text-[11px] font-semibold text-neutral-600">{a.area}</p>}
            <div className="grid grid-cols-3 gap-1.5">
              {a.fotos.map((f) => {
                const url = miniUrls.get(f.miniatura);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setVendo(f.id)}
                    aria-label={`Abrir foto de ${a.area}, ${formatDate(f.tirada_em)}`}
                    className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-neutral-300">
                        <Camera size={18} />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-medium text-white">
                      {formatDate(f.tirada_em)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {adicionando ? (
          <div className="space-y-2.5 rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
            <p className="text-sm font-semibold text-neutral-800">Adicionar em {grupoAberto.rotulo}</p>
            <div className={temCorporal ? "grid grid-cols-2 gap-2" : ""}>
              {temCorporal && (
                <label className="block min-w-0">
                  <span className={rotulo}>Área</span>
                  <select value={area} onChange={(e) => setArea(e.target.value)} className={entrada} disabled={!!progresso}>
                    {opcoesArea.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block min-w-0">
                <span className={rotulo}>Data</span>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={entrada} disabled={!!progresso} />
              </label>
            </div>
            {planosOrdenados.length > 0 && (
              <label className="block">
                <span className={rotulo}>Planejamento</span>
                <select value={planoId} onChange={(e) => setPlanoId(e.target.value)} className={entrada} disabled={!!progresso}>
                  <option value="">Nenhum</option>
                  {planosOrdenados.map((p) => (
                    <option key={p.id} value={p.id}>
                      HIPRO Day {p.data ? formatDate(p.data) : "sem data"}
                      {p.procedimento ? ` · ${p.procedimento}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input ref={arquivoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
            {progresso ? (
              <p className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200">
                <Loader2 size={16} className="animate-spin" /> Enviando {progresso.atual} de {progresso.total}
              </p>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdicionando(false)} className="min-h-11 flex-1 rounded-xl bg-white text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-teal text-sm font-bold text-white"
                >
                  <ImagePlus size={16} /> Escolher fotos
                </button>
              </div>
            )}
          </div>
        ) : (
          fotos !== null && (
            <button
              type="button"
              onClick={abrirAdicionar}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-teal/10 text-sm font-bold text-brand-teal-dark active:bg-brand-teal/20"
            >
              <ImagePlus size={16} /> Adicionar fotos
            </button>
          )
        )}
      </div>

      <p className="mt-3 text-[11px] text-neutral-400">
        {(fotos ?? []).length} {(fotos ?? []).length === 1 ? "foto" : "fotos"} · {formatarTamanho(totalBytes)}
        {` · autorizado em ${formatDate(autorizado.slice(0, 10))}`}
      </p>

      {vendo && (
        <Visualizador
          fotos={fotosDaEtapa}
          inicial={vendo}
          onFechar={() => setVendo(null)}
          onApagou={async () => {
            setVendo(null);
            await carregar();
          }}
        />
      )}
      {comparando && fotos && <Comparar fotos={fotos} onFechar={() => setComparando(false)} />}
    </section>
  );
}

/** Foto grande em tela cheia, com anterior/próxima da mesma etapa e "Apagar foto". */
function Visualizador({
  fotos,
  inicial,
  onFechar,
  onApagou,
}: {
  fotos: FotoPaciente[];
  inicial: string;
  onFechar: () => void;
  onApagou: () => void;
}) {
  const [indice, setIndice] = useState(() => Math.max(0, fotos.findIndex((f) => f.id === inicial)));
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [apagando, setApagando] = useState(false);
  const toque = useRef<number | null>(null);
  const foto = fotos[indice];
  const ir = useCallback((d: number) => setIndice((i) => Math.min(fotos.length - 1, Math.max(0, i + d))), [fotos.length]);

  useEffect(() => {
    if (!foto) return;
    let ativo = true;
    setUrl(null);
    setFalhou(false);
    urlsAssinadas(createClient(), [foto.caminho])
      .then((m) => ativo && (m.get(foto.caminho) ? setUrl(m.get(foto.caminho)!) : setFalhou(true)))
      .catch(() => ativo && setFalhou(true));
    return () => {
      ativo = false;
    };
  }, [foto]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      } else if (e.key === "ArrowLeft") ir(-1);
      else if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [ir, onFechar]);

  if (!foto) return null;

  async function apagar() {
    const ok = await confirmar({ titulo: "Apagar esta foto?", texto: "A foto sai da ficha e do armazenamento. Não dá para desfazer.", confirmar: "Apagar", perigo: true });
    if (!ok) return;
    setApagando(true);
    try {
      await apagarFotoPaciente(createClient(), foto.id);
      avisar("Foto apagada.");
      onApagou();
    } catch (e) {
      setApagando(false);
      avisar(e instanceof Error ? e.message : "Não consegui apagar a foto.", "erro");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-black" role="dialog" aria-label="Foto do paciente">
      <div className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)] text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {rotuloDaEtapa(foto.etapa)} · {foto.area || AREA_ROSTO}
          </p>
          <p className="text-xs text-white/70">
            {formatDate(foto.tirada_em)} · {indice + 1} de {fotos.length}
          </p>
        </div>
        <button onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/15 active:bg-white/25">
          <X size={18} />
        </button>
      </div>
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (toque.current === null) return;
          const dx = e.changedTouches[0].clientX - toque.current;
          toque.current = null;
          if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${rotuloDaEtapa(foto.etapa)}, ${foto.area || AREA_ROSTO}`} className="max-h-full max-w-full object-contain" />
        ) : falhou ? (
          <p className="text-sm text-white/70">Não consegui abrir a foto.</p>
        ) : (
          <Loader2 size={24} className="animate-spin text-white/70" />
        )}
        {indice > 0 && (
          <button onClick={() => ir(-1)} aria-label="Foto anterior" className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white">
            <ChevronLeft size={22} />
          </button>
        )}
        {indice < fotos.length - 1 && (
          <button onClick={() => ir(1)} aria-label="Próxima foto" className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
      <div className="flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        <button
          onClick={apagar}
          disabled={apagando}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-5 text-sm font-semibold text-rose-300 active:bg-white/20 disabled:opacity-50"
        >
          {apagando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Apagar foto
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Duas etapas lado a lado (empilhadas no celular), a primeira foto de cada na área escolhida. */
function Comparar({ fotos, onFechar }: { fotos: FotoPaciente[]; onFechar: () => void }) {
  const grupos = useMemo(() => agruparFotos(fotos), [fotos]);
  const comFoto = grupos.filter((g) => g.total > 0);
  const areasComFoto = useMemo(() => {
    const nomes: string[] = [];
    for (const g of grupos) for (const a of g.areas) if (!nomes.includes(a.area)) nomes.push(a.area);
    return nomes;
  }, [grupos]);
  // A escolha de área só existe quando há foto de área corporal; senão compara o Rosto.
  const comCorporal = areasComFoto.some((a) => a !== AREA_ROSTO);
  const temNaEtapa = (et: EtapaFoto, ar: string) => !!grupos.find((g) => g.etapa === et)?.areas.some((a) => a.area === ar);

  const etapaA0: EtapaFoto = comFoto.some((g) => g.etapa === "antes") ? "antes" : comFoto[0]?.etapa ?? "antes";
  const etapaB0: EtapaFoto = [...comFoto].reverse().find((g) => g.etapa !== etapaA0)?.etapa ?? etapaA0;
  const area0 = areasComFoto.find((a) => temNaEtapa(etapaA0, a) && temNaEtapa(etapaB0, a)) ?? areasComFoto[0] ?? AREA_ROSTO;

  const [area, setArea] = useState(area0);
  const [etapaA, setEtapaA] = useState<EtapaFoto>(etapaA0);
  const [etapaB, setEtapaB] = useState<EtapaFoto>(etapaB0);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  const primeira = (et: EtapaFoto) => grupos.find((g) => g.etapa === et)?.areas.find((a) => a.area === area)?.fotos[0] ?? null;
  const fotoA = primeira(etapaA);
  const fotoB = primeira(etapaB);
  const chave = `${fotoA?.caminho ?? ""}|${fotoB?.caminho ?? ""}`;

  useEffect(() => {
    const caminhos = [fotoA?.caminho, fotoB?.caminho].filter((c): c is string => !!c);
    if (!caminhos.length) return;
    let ativo = true;
    urlsAssinadas(createClient(), caminhos)
      .then((m) => ativo && setUrls(m))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [onFechar]);

  const lado = (f: FotoPaciente | null, et: EtapaFoto) => {
    const url = f ? urls.get(f.caminho) : null;
    return (
      <figure className="min-w-0 flex-1">
        <div className="flex h-[34vh] items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 sm:aspect-[3/4] sm:h-auto">
          {f ? (
            url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`${rotuloDaEtapa(et)}, ${area}`} className="h-full w-full object-contain" />
            ) : (
              <Loader2 size={20} className="animate-spin text-neutral-400" />
            )
          ) : (
            <p className="px-3 text-center text-xs text-neutral-500">Sem foto{comCorporal ? ` de ${area}` : ""} em {rotuloDaEtapa(et).toLowerCase()}.</p>
          )}
        </div>
        <figcaption className="mt-1.5 text-center text-xs">
          <span className="font-bold text-neutral-800">{rotuloDaEtapa(et)}</span>
          {f && <span className="text-neutral-500"> · {formatDate(f.tirada_em)}</span>}
        </figcaption>
      </figure>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#F3F6F7]" role="dialog" aria-label="Comparar fotos">
      <header className="bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(16,24,40,.06)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-base font-extrabold text-neutral-900">Comparar fotos</p>
          <button onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200">
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-3 px-4 pb-24 pt-4">
          <div className={`grid gap-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80 ${comCorporal ? "grid-cols-3" : "grid-cols-2"}`}>
            {comCorporal && (
              <label className="block min-w-0">
                <span className={rotulo}>Área</span>
                <select value={area} onChange={(e) => setArea(e.target.value)} className={entrada}>
                  {areasComFoto.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block min-w-0">
              <span className={rotulo}>De</span>
              <select value={etapaA} onChange={(e) => setEtapaA(e.target.value as EtapaFoto)} className={entrada}>
                {ETAPAS_FOTO.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className={rotulo}>Para</span>
              <select value={etapaB} onChange={(e) => setEtapaB(e.target.value as EtapaFoto)} className={entrada}>
                {ETAPAS_FOTO.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {lado(fotoA, etapaA)}
            {lado(fotoB, etapaB)}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
