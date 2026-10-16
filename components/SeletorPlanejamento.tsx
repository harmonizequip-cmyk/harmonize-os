"use client";

import { useMemo, useState } from "react";
import BonecoCorporal from "@/components/BonecoCorporal";
import { CATALOGO_CORPORAL, urlBoneco } from "@/lib/boneco-corporal";
import {
  CATALOGO_AREAS,
  DISPAROS_CORPORAL,
  dividirDisparos,
  montarPlanejamento,
  profundidadesFlacidez,
  profundidadesGordura,
  profundidadesPapada,
  type AreaCorporal,
  type PlanejamentoMontado,
} from "@/lib/planejamento";
import { Check, ClipboardList, Plus, Sparkles, X } from "lucide-react";

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const mm = (p: number) => p.toFixed(1).replace(".", ",");
const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

type Corporal = {
  chave: string;
  regiao: string;
  nome: string;
  tipo: "flacidez" | "gordura";
  quadrantes: string;
  profundidades: string;
  disparos: string;
  adipometro: string;
  bilateral: boolean;
};

const IDS_CORPORAIS = new Set(CATALOGO_CORPORAL.map((c) => c.id));

function novaCorporal(regiao: string): Corporal {
  const r = CATALOGO_CORPORAL.find((c) => c.id === regiao);
  return {
    chave: regiao || `outra-${Math.random().toString(36).slice(2, 8)}`,
    regiao,
    nome: r?.nome ?? "",
    tipo: r?.tipo ?? "flacidez",
    quadrantes: "1",
    profundidades: "3",
    disparos: String(DISPAROS_CORPORAL.min),
    adipometro: "",
    bilateral: r?.bilateral ?? true,
  };
}

const paraArea = (c: Corporal): AreaCorporal => ({
  nome: c.nome,
  tipo: c.tipo,
  quadrantes: num(c.quadrantes),
  profundidades: num(c.profundidades),
  disparosPorProfundidade: num(c.disparos),
  adipometro: num(c.adipometro),
  bilateral: c.bilateral,
  regiao: c.regiao || undefined,
});

// Seletor do planejamento: rosto (caixinhas), papada (adipômetro) e corporal
// (toque no boneco). Monta pelas regras com montarPlanejamento; a IA só entra
// se o Eder pedir ajuste.
export default function SeletorPlanejamento({
  marcadas = [],
  saldoInicial,
  queixaInicial,
  paciente,
  textoAplicar,
  onAplicar,
  onPedirIA,
}: {
  marcadas?: string[];
  saldoInicial?: number | null;
  queixaInicial?: string | null;
  paciente?: string | null;
  textoAplicar: string;
  /** Devolva false para continuar editando (ex.: cancelou a confirmação). */
  onAplicar: (m: PlanejamentoMontado) => boolean | void;
  onPedirIA?: (texto: string) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(marcadas.filter((m) => !IDS_CORPORAIS.has(m))));
  const [corporais, setCorporais] = useState<Corporal[]>(() => marcadas.filter((m) => IDS_CORPORAIS.has(m)).map(novaCorporal));
  const [saldo, setSaldo] = useState(saldoInicial ? String(saldoInicial) : "");
  const [queixa, setQueixa] = useState(queixaInicial ?? "");
  const [adipPapada, setAdipPapada] = useState("");
  const [nProfPapada, setNProfPapada] = useState("3");
  const [dispPapada, setDispPapada] = useState("");
  const [feito, setFeito] = useState(false);

  const temPapada = sel.has("papada");
  const papadaIncompleta = temPapada && (!num(adipPapada) || !num(dispPapada));
  const corporalIncompleta = corporais.some((c) => !c.nome.trim() || (c.tipo === "gordura" && !num(c.adipometro)));

  const montado = useMemo(
    () =>
      montarPlanejamento({
        areas: Array.from(sel),
        saldo: num(saldo) || null,
        papada: temPapada && !papadaIncompleta ? { adipometro: num(adipPapada), profundidades: num(nProfPapada), disparos: num(dispPapada) } : null,
        corporais: corporais.map(paraArea),
        queixa: queixa.trim() || null,
        paciente: paciente || null,
      }),
    [sel, saldo, temPapada, papadaIncompleta, adipPapada, nProfPapada, dispPapada, corporais, queixa, paciente]
  );
  const nada = sel.size === 0 && corporais.length === 0;
  const previaPapada = useMemo(() => {
    if (!temPapada || !num(adipPapada)) return null;
    const profs = profundidadesPapada(num(adipPapada), num(nProfPapada));
    const partes = num(dispPapada) ? dividirDisparos(num(dispPapada), profs.length) : [];
    return profs.map((p, i) => `${mm(p)} mm${partes[i] ? ` (${fmt(partes[i])})` : ""}`).join(" · ");
  }, [temPapada, adipPapada, nProfPapada, dispPapada]);

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarCorpo = (id: string) =>
    setCorporais((l) => (l.some((c) => c.regiao === id) ? l.filter((c) => c.regiao !== id) : [...l, novaCorporal(id)]));
  const mudar = (chave: string, campo: Partial<Corporal>) => setCorporais((l) => l.map((c) => (c.chave === chave ? { ...c, ...campo } : c)));

  function aplicar() {
    if (onAplicar(montado) !== false) setFeito(true);
  }

  function pedirIA() {
    if (!onPedirIA) return;
    const rosto = CATALOGO_AREAS.filter((a) => sel.has(a.id)).map((a) => a.nome);
    const corpo = corporais.map((c) => {
      const profs = c.tipo === "gordura" ? profundidadesGordura(num(c.adipometro), num(c.profundidades)) : profundidadesFlacidez(num(c.profundidades));
      return `${c.nome} (${c.tipo}${c.tipo === "gordura" ? `, adipômetro ${c.adipometro} mm` : ""}, ${num(c.quadrantes)} quadrante(s), ${profs.map(mm).join("/")} mm, ${fmt(num(c.disparos))} por profundidade${c.bilateral ? ", dois lados" : ""})`;
    });
    const partes = [
      rosto.length ? `Áreas do rosto: ${rosto.join(", ")}.` : "",
      corpo.length ? `Corporal: ${corpo.join("; ")}.` : "",
      `Procedimento: ${montado.estado.procNome || "-"}.`,
      num(saldo) ? `Saldo: ${fmt(num(saldo))} disparos.` : "",
      queixa.trim() ? `Queixa principal: ${queixa.trim()}.` : "",
      temPapada && !papadaIncompleta ? `Papada: adipômetro ${adipPapada} mm, ${nProfPapada} profundidades, ${fmt(num(dispPapada))} disparos.` : "",
      paciente ? `Paciente: ${paciente}.` : "",
      `Pelas regras ficou: ${montado.resumo.map((r) => `${r.area} ${fmt(r.total)}`).join(", ")} (total ${fmt(montado.total)}).`,
      "Ajusta a distribuição pela queixa e monta o planejamento.",
    ];
    setFeito(true);
    onPedirIA(partes.filter(Boolean).join(" "));
  }

  const grupo = (g: "face" | "fora", titulo: string) => (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titulo}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {CATALOGO_AREAS.filter((a) => a.grupo === g).map((a) => {
          const on = sel.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              disabled={feito}
              onClick={() => alternar(a.id)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs ${
                on ? "border-brand-teal bg-brand-teal/10 text-neutral-900" : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${on ? "border-brand-teal bg-brand-teal text-white" : "border-neutral-300"}`}>
                {on && <Check size={11} />}
              </span>
              <span className="min-w-0 flex-1">{a.nome}</span>
              {a.pequena && <span className="text-[10px] text-neutral-400">pequena</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const campo = "mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 disabled:bg-neutral-50";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-teal-dark">
          <ClipboardList size={14} /> Quais áreas vai fazer?
        </p>
        {!feito && (
          <button
            onClick={() => setSel((s) => new Set([...s, ...CATALOGO_AREAS.filter((a) => a.grupo === "face" && !a.pequena).map((a) => a.id)]))}
            className="text-[11px] font-medium text-brand-teal-dark underline"
          >
            Marcar rosto todo
          </button>
        )}
      </div>
      {grupo("face", "Rosto (queixo até a testa)")}
      {grupo("fora", "Papada e pescoço")}

      {temPapada && (
        <div className="space-y-2 rounded-lg border border-brand-teal/30 bg-white p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Papada</p>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-neutral-500">
              Adipômetro (mm)
              <input value={adipPapada} onChange={(e) => setAdipPapada(e.target.value.replace(/[^\d,.]/g, ""))} disabled={feito} inputMode="decimal" placeholder="20" className={campo} />
            </label>
            <label className="text-[11px] text-neutral-500">
              Profundidades
              <select value={nProfPapada} onChange={(e) => setNProfPapada(e.target.value)} disabled={feito} className={campo}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-neutral-500">
              Disparos
              <input value={dispPapada} onChange={(e) => setDispPapada(e.target.value.replace(/\D/g, ""))} disabled={feito} inputMode="numeric" placeholder="1500" className={campo} />
            </label>
          </div>
          {previaPapada && <p className="text-xs text-brand-teal-dark">{previaPapada}</p>}
        </div>
      )}

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Corporal (toque na região)</p>
        <div className="rounded-lg border border-neutral-200 bg-white p-2">
          <BonecoCorporal marcadas={corporais.map((c) => c.regiao).filter(Boolean)} onAlternar={alternarCorpo} desabilitado={feito} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATALOGO_CORPORAL.map((r) => {
              const on = corporais.some((c) => c.regiao === r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={feito}
                  onClick={() => alternarCorpo(r.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    on ? "border-brand-teal bg-brand-teal text-white" : "border-neutral-200 bg-white text-neutral-600"
                  }`}
                >
                  {r.nome}
                </button>
              );
            })}
            {!feito && (
              <button
                type="button"
                onClick={() => setCorporais((l) => [...l, novaCorporal("")])}
                className="flex items-center gap-1 rounded-full border border-dashed border-brand-teal/50 px-2.5 py-1 text-[11px] font-medium text-brand-teal-dark"
              >
                <Plus size={12} /> Outra
              </button>
            )}
          </div>
        </div>
      </div>

      {corporais.map((c) => {
        const profs = c.tipo === "gordura" ? profundidadesGordura(num(c.adipometro), num(c.profundidades)) : profundidadesFlacidez(num(c.profundidades));
        const disp = Math.min(DISPAROS_CORPORAL.max, Math.max(DISPAROS_CORPORAL.min, num(c.disparos) || DISPAROS_CORPORAL.min));
        const q = Math.max(1, Math.round(num(c.quadrantes)) || 1);
        const total = profs.length * disp * q * (c.bilateral ? 2 : 1);
        const foraFaixa = num(c.disparos) > 0 && (num(c.disparos) < DISPAROS_CORPORAL.min || num(c.disparos) > DISPAROS_CORPORAL.max);
        return (
          <div key={c.chave} className="space-y-2 rounded-lg border border-brand-teal/30 bg-white p-2.5">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlBoneco(c.regiao || "corpo")} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg border border-neutral-200" />
              <input
                value={c.nome}
                onChange={(e) => mudar(c.chave, { nome: e.target.value })}
                disabled={feito}
                placeholder="Nome da área"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm font-semibold text-neutral-900"
              />
              {!feito && (
                <button onClick={() => setCorporais((l) => l.filter((x) => x.chave !== c.chave))} className="text-neutral-400" aria-label="Tirar área">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["flacidez", "gordura"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={feito}
                  onClick={() => mudar(c.chave, { tipo: t, profundidades: t === "flacidez" ? (num(c.profundidades) >= 3 ? "3" : "2") : String(Math.max(3, num(c.profundidades))) })}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${c.tipo === t ? "border-brand-teal bg-brand-teal/10 text-brand-teal-dark" : "border-neutral-200 text-neutral-500"}`}
                >
                  {t === "flacidez" ? "Flacidez (1,5 a 4,5)" : "Gordura (6 a 13)"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {c.tipo === "gordura" && (
                <label className="text-[11px] text-neutral-500">
                  Adipômetro (mm)
                  <input value={c.adipometro} onChange={(e) => mudar(c.chave, { adipometro: e.target.value.replace(/[^\d,.]/g, "") })} disabled={feito} inputMode="decimal" placeholder="24" className={campo} />
                </label>
              )}
              <label className="text-[11px] text-neutral-500">
                Profundidades
                <select value={c.profundidades} onChange={(e) => mudar(c.chave, { profundidades: e.target.value })} disabled={feito} className={campo}>
                  {(c.tipo === "flacidez" ? [2, 3] : [3, 4, 5, 6, 7, 8]).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-neutral-500">
                Disparos/prof.
                <input value={c.disparos} onChange={(e) => mudar(c.chave, { disparos: e.target.value.replace(/\D/g, "") })} disabled={feito} inputMode="numeric" className={campo} />
              </label>
              <label className="text-[11px] text-neutral-500">
                Quadrantes
                <input value={c.quadrantes} onChange={(e) => mudar(c.chave, { quadrantes: e.target.value.replace(/\D/g, "") })} disabled={feito} inputMode="numeric" className={campo} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={c.bilateral} onChange={(e) => mudar(c.chave, { bilateral: e.target.checked })} disabled={feito} />
              Dois lados (direito e esquerdo)
            </label>
            <p className="text-xs text-brand-teal-dark">
              {c.tipo === "gordura" && !num(c.adipometro)
                ? "Preencha o adipômetro."
                : `${profs.map(mm).join(" · ")} mm × ${fmt(disp)} × ${q} quad.${c.bilateral ? " × 2 lados" : ""} = ${fmt(total)}`}
            </p>
            {foraFaixa && <p className="text-[11px] text-amber-700">Por profundidade fica entre 3.200 e 4.000: vai como {fmt(disp)}.</p>}
          </div>
        );
      })}

      <div className="grid grid-cols-2 gap-2">
        <input value={saldo} onChange={(e) => setSaldo(e.target.value.replace(/\D/g, ""))} disabled={feito} inputMode="numeric" placeholder="Saldo de disparos" className="rounded-lg border border-neutral-300 px-2.5 py-2 text-sm" />
        <input value={queixa} onChange={(e) => setQueixa(e.target.value)} disabled={feito} placeholder="Queixa principal" className="rounded-lg border border-neutral-300 px-2.5 py-2 text-sm" />
      </div>

      {!nada && (
        <div className="space-y-1 rounded-lg bg-white px-3 py-2">
          <p className="text-sm">
            <span className="text-xs text-neutral-500">Procedimento: </span>
            <span className="font-semibold text-neutral-900">{montado.estado.procNome || "-"}</span>
          </p>
          {montado.resumo.map((r) => (
            <div key={r.area} className="flex justify-between text-xs text-neutral-600">
              <span>{r.area}</span>
              <span className="font-mono">{fmt(r.total)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-neutral-100 pt-1 text-xs font-semibold text-neutral-900">
            <span>Total</span>
            <span className="font-mono">
              {fmt(montado.total)}
              {num(saldo) ? ` de ${fmt(num(saldo))}` : ""}
            </span>
          </div>
          {montado.avisos.map((a) => (
            <p key={a} className="text-[11px] text-amber-700">
              {a}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={aplicar}
        disabled={feito || nada || papadaIncompleta || corporalIncompleta}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {feito
          ? "Pronto"
          : papadaIncompleta
          ? "Preencha adipômetro e disparos da papada"
          : corporalIncompleta
          ? "Complete as áreas corporais"
          : textoAplicar}
      </button>
      {onPedirIA && !feito && !nada && (
        <button
          onClick={pedirIA}
          disabled={papadaIncompleta || corporalIncompleta}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-teal/40 bg-white px-3 py-2 text-xs font-semibold text-brand-teal-dark disabled:opacity-60"
        >
          <Sparkles size={13} /> Pedir ajuste à IA
        </button>
      )}
    </div>
  );
}
