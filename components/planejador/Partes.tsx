"use client";

// Peças do Planejador HIPRO nativo: folha (bottom sheet), campo de disparos
// com - e +, cartão de área (modelo facial + linhas por profundidade),
// folha da modelo ampliada e folha de área manual.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Minus, Plus, Trash2, X } from "lucide-react";
import BonecoCorporal from "@/components/BonecoCorporal";
import { CATALOGO_CORPORAL } from "@/lib/boneco-corporal";
import { imagemDaArea } from "@/lib/planejador-impressao";
import { MOVIMENTO_DA_AREA, OPTS_PAP, linhaAcimaDoMaximo, linhaVazia, maximoDaLinha, subtotalLinha, type Area, type Linha } from "@/lib/planejador";

export const fmt = (n: number) => n.toLocaleString("pt-BR");

export function Folha({ aberta, onFechar, titulo, children, rodape }: { aberta: boolean; onFechar: () => void; titulo: string; children: React.ReactNode; rodape?: React.ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberta, onFechar]);
  if (!montado || !aberta) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center" onClick={onFechar}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl animate-[subir_.22s_ease-out] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <p className="text-base font-bold text-neutral-900">{titulo}</p>
          <button onClick={onFechar} className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {rodape && <div className="border-t border-neutral-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{rodape}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Número com - e + (passo de 50, como a regra do Eder de números redondos). */
export function CampoDisparos({ rotulo, valor, onMudar, alerta, passo = 50 }: { rotulo: string; valor: number; onMudar: (v: number) => void; alerta?: boolean; passo?: number }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{rotulo}</span>
      <span className={`flex items-stretch overflow-hidden rounded-xl bg-white ring-1 transition focus-within:ring-2 ${alerta ? "ring-amber-400 focus-within:ring-amber-400" : "ring-neutral-200 focus-within:ring-brand-teal"}`}>
        <button type="button" tabIndex={-1} onClick={() => onMudar(Math.max(0, valor - passo))} className="flex w-9 flex-shrink-0 items-center justify-center text-neutral-400 active:bg-neutral-100" aria-label={`Menos ${passo}`}>
          <Minus size={15} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          enterKeyHint="next"
          value={valor ? String(valor) : ""}
          placeholder="0"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onMudar(Math.min(999999, Number(e.target.value.replace(/\D/g, "")) || 0))}
          className="w-full min-w-0 bg-transparent py-2 text-center text-lg font-bold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300"
        />
        <button type="button" tabIndex={-1} onClick={() => onMudar(valor + passo)} className="flex w-9 flex-shrink-0 items-center justify-center text-brand-teal-dark active:bg-brand-teal/10" aria-label={`Mais ${passo}`}>
          <Plus size={15} />
        </button>
      </span>
    </label>
  );
}

function LinhaEditor({ area, linha, podeRemover, onMudar, onRemover }: { area: Area; linha: Linha; podeRemover: boolean; onMudar: (l: Linha) => void; onRemover: () => void }) {
  const corporal = area.regiao === "corporal";
  const acima = linhaAcimaDoMaximo(area, linha);
  const sub = subtotalLinha(area, linha);
  const max = maximoDaLinha(area.id);
  // Lados iguais: mexeu no direito e o esquerdo estava igual, ele acompanha.
  const mudarDireito = (v: number) => onMudar({ ...linha, dispD: v, dispE: (linha.dispE ?? 0) === (linha.dispD ?? 0) ? v : linha.dispE });
  const colunas = area.bilateral ? (corporal ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2") : corporal ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`rounded-2xl p-2.5 ring-1 transition ${linha.feito ? "bg-emerald-50/70 ring-emerald-200" : "bg-neutral-50 ring-neutral-200/70"}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMudar({ ...linha, feito: !linha.feito })}
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ring-1 transition ${linha.feito ? "bg-emerald-500 text-white ring-emerald-500" : "bg-white text-transparent ring-neutral-300"}`}
          aria-label={linha.feito ? "Desmarcar feito" : "Marcar como feito"}
          title="Feito no atendimento"
        >
          <Check size={15} strokeWidth={3} />
        </button>
        <span className="relative">
          <select
            value={linha.prof}
            onChange={(e) => onMudar({ ...linha, prof: e.target.value })}
            className="appearance-none rounded-full bg-white py-1.5 pl-3 pr-7 text-sm font-bold text-brand-teal-dark ring-1 ring-brand-teal/40 outline-none focus:ring-2 focus:ring-brand-teal"
            aria-label="Profundidade"
          >
            {area.opts.map((p) => (
              <option key={p} value={p}>
                {p.replace(".", ",")} mm
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-teal-dark" />
        </span>
        <span className="ml-auto text-xs tabular-nums text-neutral-500">
          = <b className="text-neutral-800">{fmt(sub)}</b>
        </span>
        <button type="button" onClick={onRemover} disabled={!podeRemover} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:text-rose-600 disabled:opacity-25" aria-label="Remover profundidade">
          <Trash2 size={14} />
        </button>
      </div>
      <div className={`mt-2 grid gap-2 ${colunas}`}>
        {area.bilateral ? (
          <>
            <CampoDisparos rotulo="Direito" valor={linha.dispD ?? 0} onMudar={mudarDireito} alerta={!!acima && (linha.dispD ?? 0) > (max ?? Infinity)} />
            <CampoDisparos rotulo="Esquerdo" valor={linha.dispE ?? 0} onMudar={(v) => onMudar({ ...linha, dispE: v })} alerta={!!acima && (linha.dispE ?? 0) > (max ?? Infinity)} />
          </>
        ) : (
          <CampoDisparos rotulo={corporal ? "Disparos por quadrante" : "Disparos"} valor={linha.disp ?? 0} onMudar={(v) => onMudar({ ...linha, disp: v })} alerta={!!acima} />
        )}
        {corporal && <CampoDisparos rotulo="Quadrantes" valor={linha.quad ?? 1} passo={1} onMudar={(v) => onMudar({ ...linha, quad: Math.max(1, v) })} />}
      </div>
      {acima && <p className="mt-1.5 text-[11px] font-medium text-amber-700">Acima do máximo do fabricante: {fmt(acima)}{area.bilateral ? " por lado" : ""}.</p>}
    </div>
  );
}

export function CartaoArea({
  area,
  linhas,
  total,
  aberto,
  onAlternar,
  onLinhas,
  onVerModelo,
  onRemoverArea,
}: {
  area: Area;
  linhas: Linha[];
  total: number;
  aberto: boolean;
  onAlternar: () => void;
  onLinhas: (l: Linha[]) => void;
  onVerModelo: () => void;
  onRemoverArea?: () => void;
}) {
  const feitas = linhas.filter((l) => l.feito && subtotalLinha(area, l) > 0).length;
  const comDisparo = linhas.filter((l) => subtotalLinha(area, l) > 0).length;
  const proxima = () => {
    // Próxima profundidade: a primeira da lista que ainda não está em uso (rosto vai de 4,5 para 1,5).
    const usadas = new Set(linhas.map((l) => l.prof));
    const ordem = area.id === "papada" || area.manual ? [...area.opts].reverse() : ["4.5", "3.0", "1.5", ...area.opts];
    return ordem.find((p) => !usadas.has(p)) ?? area.opts[0];
  };
  return (
    <section id={`area-${area.id}`} className={`overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)] ring-1 transition ${total > 0 ? "ring-brand-teal/45" : "ring-neutral-200/80"}`}>
      <div className="flex w-full items-center gap-3 p-3">
        <button type="button" onClick={onVerModelo} className="relative flex-shrink-0 rounded-2xl transition active:scale-95" aria-label={`Ver movimento: ${area.nome}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagemDaArea(area)} alt="" className="h-[68px] w-[68px] rounded-2xl bg-neutral-50 object-cover" />
          {total > 0 && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-brand-teal ring-2 ring-white" />}
        </button>
        <button type="button" onClick={onAlternar} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={aberto}>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-tight text-neutral-900">{area.nome}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{area.bilateral ? "Direito e esquerdo" : "Campo único"}</span>
              {area.manual && <span className="rounded-full bg-brand-lilac/20 px-2 py-0.5 text-[10px] font-semibold text-[#7a5fa0]">{area.regiao === "corporal" ? "Corporal" : "Manual"}</span>}
              {comDisparo > 0 && (
                <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10px] font-semibold text-brand-teal-dark">
                  {comDisparo} prof.{feitas ? ` · ${feitas} feita${feitas > 1 ? "s" : ""}` : ""}
                </span>
              )}
            </span>
          </span>
          <span className="text-right">
            <span className={`block text-lg font-extrabold tabular-nums leading-none ${total > 0 ? "text-neutral-900" : "text-neutral-300"}`}>{fmt(total)}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">disparos</span>
          </span>
          <ChevronDown size={18} className={`flex-shrink-0 text-neutral-400 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-neutral-100 px-3 pb-3 pt-3">
            {area.hint && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">⚡ {area.hint}</p>}
            {linhas.map((l, i) => (
              <LinhaEditor
                key={i}
                area={area}
                linha={l}
                podeRemover={linhas.length > 1}
                onMudar={(nova) => onLinhas(linhas.map((x, j) => (j === i ? nova : x)))}
                onRemover={() => onLinhas(linhas.filter((_, j) => j !== i))}
              />
            ))}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onLinhas([...linhas, linhaVazia(area, proxima())])}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-brand-teal/60 px-3.5 py-2 text-xs font-bold text-brand-teal-dark active:bg-brand-teal/10"
              >
                <Plus size={14} /> Profundidade
              </button>
              {onRemoverArea && (
                <button type="button" onClick={onRemoverArea} className="ml-auto text-xs font-medium text-rose-600">
                  Remover área
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FolhaModelo({ area, onFechar }: { area: Area | null; onFechar: () => void }) {
  const max = area ? maximoDaLinha(area.id) : null;
  return (
    <Folha aberta={!!area} onFechar={onFechar} titulo={area?.nome ?? ""}>
      {area && (
        <div className="space-y-3 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagemDaArea(area)} alt={`Movimento: ${area.nome}`} className="mx-auto aspect-square w-full max-w-[260px] rounded-3xl object-cover shadow-sm" />
          {MOVIMENTO_DA_AREA[area.id] && (
            <p className="rounded-2xl bg-brand-teal/10 px-4 py-3 text-sm text-neutral-800">
              <b className="text-brand-teal-dark">Movimento: </b>
              {MOVIMENTO_DA_AREA[area.id]}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-neutral-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Aplicação</p>
              <p className="mt-0.5 font-semibold text-neutral-800">{area.bilateral ? "Direito e esquerdo" : "Campo único"}</p>
            </div>
            <div className="rounded-2xl bg-neutral-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Máximo por linha</p>
              <p className="mt-0.5 font-semibold text-neutral-800">{area.id === "jowls" ? "Pode passar de 1.200" : max ? `${fmt(max)}${area.bilateral ? " por lado" : ""}` : "Livre"}</p>
            </div>
          </div>
          {area.hint && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">⚡ {area.hint}</p>}
        </div>
      )}
    </Folha>
  );
}

export function FolhaNovaArea({ aberta, onFechar, onCriar }: { aberta: boolean; onFechar: () => void; onCriar: (a: Omit<Area, "id">, prof: string) => void }) {
  const [nome, setNome] = useState("");
  const [nomeAuto, setNomeAuto] = useState("");
  const [regiao, setRegiao] = useState<"facial" | "corporal">("facial");
  const [parte, setParte] = useState("");
  const [bilateral, setBilateral] = useState(true);
  const [prof, setProf] = useState("3.0");

  useEffect(() => {
    if (aberta) {
      setNome("");
      setNomeAuto("");
      setRegiao("facial");
      setParte("");
      setBilateral(true);
      setProf("3.0");
    }
  }, [aberta]);

  function escolherParte(id: string) {
    const novo = parte === id ? "" : id;
    setParte(novo);
    const r = CATALOGO_CORPORAL.find((c) => c.id === novo);
    if (!nome.trim() || nome === nomeAuto) {
      setNome(r?.nome ?? "");
      setNomeAuto(r?.nome ?? "");
    }
    if (r) setBilateral(r.bilateral);
  }

  const pronto = nome.trim().length > 0;
  const chip = (on: boolean) => `flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition ${on ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-700 ring-neutral-200"}`;

  return (
    <Folha
      aberta={aberta}
      onFechar={onFechar}
      titulo="Nova área"
      rodape={
        <button
          disabled={!pronto}
          onClick={() => onCriar({ nome: nome.trim(), bilateral, opts: OPTS_PAP, regiao, ...(regiao === "corporal" && parte ? { parte } : {}), manual: true }, prof)}
          className="w-full rounded-2xl bg-brand-gradient py-3 text-sm font-bold text-white shadow-glow-teal disabled:opacity-40"
        >
          Adicionar área
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setRegiao("facial")} className={chip(regiao === "facial")}>
            Rosto
          </button>
          <button type="button" onClick={() => setRegiao("corporal")} className={chip(regiao === "corporal")}>
            Corporal
          </button>
        </div>
        {regiao === "corporal" && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Toque na parte do corpo</p>
            <BonecoCorporal marcadas={parte ? [parte] : []} onAlternar={escolherParte} />
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Nome da área</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={regiao === "corporal" ? "Ex.: Abdômen" : "Ex.: Mento, Pálpebras"} className="w-full rounded-xl bg-white px-3.5 py-3 text-[15px] ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-brand-teal" />
        </label>
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Aplicação</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setBilateral(true)} className={chip(bilateral)}>
              Direito e esquerdo
            </button>
            <button type="button" onClick={() => setBilateral(false)} className={chip(!bilateral)}>
              Campo único
            </button>
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Primeira profundidade</span>
          <div className="flex flex-wrap gap-1.5">
            {OPTS_PAP.map((p) => (
              <button key={p} type="button" onClick={() => setProf(p)} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${prof === p ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-600 ring-neutral-200"}`}>
                {p.replace(".", ",")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Folha>
  );
}
