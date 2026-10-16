"use client";

import { useMemo, useState } from "react";
import type { EscolhaAreas } from "@/lib/assistente";
import { CATALOGO_AREAS, dividirDisparos, nomeProcedimento, profundidadesPapada } from "@/lib/planejamento";
import { Check, ClipboardList } from "lucide-react";

// Caixinhas das áreas que o Eder vai tratar. O nome do procedimento sai da
// escolha (Full Face, Full Face + Papada...); o botão manda a escolha de
// volta para a IA distribuir os disparos.
export default function CartaoEscolhaAreas({ escolha, onPedir }: { escolha: EscolhaAreas; onPedir: (texto: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(escolha.marcadas));
  const [saldo, setSaldo] = useState(escolha.saldo ? String(escolha.saldo) : "");
  const [queixa, setQueixa] = useState(escolha.queixa ?? "");
  const [enviado, setEnviado] = useState(false);
  // Papada: medida do adipômetro, quantas profundidades e quantos disparos.
  const [adipometro, setAdipometro] = useState("");
  const [nProf, setNProf] = useState("3");
  const [dispPapada, setDispPapada] = useState("");
  const temPapada = sel.has("papada");
  const previaPapada = useMemo(() => {
    const adip = Number(adipometro.replace(",", "."));
    if (!temPapada || !adip) return null;
    const profs = profundidadesPapada(adip, Number(nProf));
    const partes = dispPapada ? dividirDisparos(Number(dispPapada), profs.length) : [];
    return profs.map((p, i) => `${p.toFixed(1).replace(".", ",")} mm${partes[i] ? ` (${partes[i].toLocaleString("pt-BR")})` : ""}`).join(" · ");
  }, [temPapada, adipometro, nProf, dispPapada]);
  const papadaIncompleta = temPapada && (!adipometro || !dispPapada);
  const nome = useMemo(() => nomeProcedimento(Array.from(sel)), [sel]);

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const rostoTodo = () =>
    setSel((s) => new Set([...s, ...CATALOGO_AREAS.filter((a) => a.grupo === "face" && !a.pequena).map((a) => a.id)]));

  function montar() {
    const nomes = CATALOGO_AREAS.filter((a) => sel.has(a.id)).map((a) => a.nome);
    const partes = [
      `Áreas escolhidas: ${nomes.join(", ")}.`,
      `Procedimento: ${nome}.`,
      saldo ? `Saldo: ${Number(saldo).toLocaleString("pt-BR")} disparos.` : "",
      queixa.trim() ? `Queixa principal: ${queixa.trim()}.` : "",
      temPapada && adipometro && dispPapada
        ? `Papada: adipômetro ${adipometro} mm, ${nProf} profundidades, ${Number(dispPapada).toLocaleString("pt-BR")} disparos.`
        : "",
      escolha.paciente ? `Paciente: ${escolha.paciente}.` : "",
      "Pode distribuir.",
    ];
    setEnviado(true);
    onPedir(partes.filter(Boolean).join(" "));
  }

  const grupo = (g: "face" | "fora", titulo: string) => (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titulo}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {CATALOGO_AREAS.filter((a) => a.grupo === g).map((a) => {
          const on = sel.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              disabled={enviado}
              onClick={() => alternar(a.id)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs ${
                on ? "border-brand-teal bg-brand-teal/10 text-neutral-900" : "border-neutral-200 bg-white text-neutral-600"
              }`}
            >
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${on ? "border-brand-teal bg-brand-teal text-white" : "border-neutral-300"}`}>
                {on && <Check size={11} />}
              </span>
              {a.nome}
              {a.pequena && <span className="ml-auto text-[10px] text-neutral-400">pequena</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-teal-dark">
          <ClipboardList size={14} /> Quais áreas vai fazer?
        </p>
        {!enviado && (
          <button onClick={rostoTodo} className="text-[11px] font-medium text-brand-teal-dark underline">
            Marcar rosto todo
          </button>
        )}
      </div>
      {grupo("face", "Rosto (queixo até a testa)")}
      {grupo("fora", "Fora do rosto")}
      {temPapada && (
        <div className="space-y-2 rounded-lg border border-brand-teal/30 bg-white p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Papada</p>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-neutral-500">
              Adipômetro (mm)
              <input
                value={adipometro}
                onChange={(e) => setAdipometro(e.target.value.replace(/[^\d,.]/g, ""))}
                disabled={enviado}
                inputMode="decimal"
                placeholder="20"
                className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
            <label className="text-[11px] text-neutral-500">
              Profundidades
              <select
                value={nProf}
                onChange={(e) => setNProf(e.target.value)}
                disabled={enviado}
                className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-neutral-500">
              Disparos
              <input
                value={dispPapada}
                onChange={(e) => setDispPapada(e.target.value.replace(/\D/g, ""))}
                disabled={enviado}
                inputMode="numeric"
                placeholder="1500"
                className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              />
            </label>
          </div>
          {previaPapada && <p className="text-xs text-brand-teal-dark">{previaPapada}</p>}
        </div>
      )}
      <div className="rounded-lg bg-white px-3 py-2 text-sm">
        <span className="text-xs text-neutral-500">Procedimento: </span>
        <span className="font-semibold text-neutral-900">{nome || "marque as áreas"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={saldo}
          onChange={(e) => setSaldo(e.target.value.replace(/\D/g, ""))}
          disabled={enviado}
          inputMode="numeric"
          placeholder="Saldo de disparos"
          className="rounded-lg border border-neutral-300 px-2.5 py-2 text-sm"
        />
        <input
          value={queixa}
          onChange={(e) => setQueixa(e.target.value)}
          disabled={enviado}
          placeholder="Queixa principal"
          className="rounded-lg border border-neutral-300 px-2.5 py-2 text-sm"
        />
      </div>
      <button
        onClick={montar}
        disabled={enviado || sel.size === 0 || papadaIncompleta}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {enviado ? "Escolha enviada" : papadaIncompleta ? "Preencha adipômetro e disparos da papada" : "Montar com estas áreas"}
      </button>
    </div>
  );
}
