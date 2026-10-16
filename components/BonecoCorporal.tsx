"use client";

import { CATALOGO_CORPORAL } from "@/lib/boneco-corporal";
import { FOTO_ALTURA, FOTO_LARGURA, REGIOES_FOTO, naFoto } from "@/lib/corpo-foto";
import { FOTO_CORPO } from "@/lib/corpo-foto-dados";

// Modelo corporal em foto com as regiões tocáveis: marcadas em turquesa, as
// outras com contorno tracejado claro para mostrar onde dá para tocar. As
// regiões de trás (sem foto) ficam como botões embaixo.
export default function BonecoCorporal({
  marcadas,
  onAlternar,
  desabilitado,
}: {
  marcadas: string[];
  onAlternar?: (id: string) => void;
  desabilitado?: boolean;
}) {
  const sel = new Set(marcadas);
  const tocavel = !desabilitado && !!onAlternar;
  const atras = CATALOGO_CORPORAL.filter((r) => !naFoto(r.id));
  return (
    <div className="mx-auto w-full max-w-[300px] select-none">
      <svg viewBox={`0 0 ${FOTO_LARGURA} ${FOTO_ALTURA}`} className="block w-full overflow-hidden rounded-2xl bg-white" role="group" aria-label="Modelo corporal: toque na região">
        <defs>
          <clipPath id="corpo-foto-quadro">
            <rect width={FOTO_LARGURA} height={FOTO_ALTURA} rx={7} />
          </clipPath>
        </defs>
        <image href={FOTO_CORPO} x={0} y={0} width={FOTO_LARGURA} height={FOTO_ALTURA} clipPath="url(#corpo-foto-quadro)" />
        {CATALOGO_CORPORAL.filter((r) => naFoto(r.id)).map((r) => {
          const on = sel.has(r.id);
          return (
            <g
              key={r.id}
              onClick={tocavel ? () => onAlternar!(r.id) : undefined}
              className={tocavel ? "cursor-pointer" : ""}
              fill="#3DBFB8"
              fillOpacity={on ? 0.5 : 0.08}
              stroke={on ? "#1F8F88" : "#ffffff"}
              strokeOpacity={on ? 1 : 0.95}
              strokeDasharray={on ? undefined : "2 1.5"}
              strokeWidth={on ? 1.2 : 0.9}
            >
              <title>{r.nome}</title>
              {REGIOES_FOTO[r.id].map(([cx, cy, rx, ry, rot], i) => (
                <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} />
              ))}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Parte de trás</p>
      <div className="mt-1 flex flex-wrap justify-center gap-1.5">
        {atras.map((r) => {
          const on = sel.has(r.id);
          return (
            <button
              key={r.id}
              type="button"
              disabled={!tocavel}
              onClick={() => onAlternar?.(r.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${on ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-600 ring-neutral-200"}`}
            >
              {r.nome}
            </button>
          );
        })}
      </div>
    </div>
  );
}
