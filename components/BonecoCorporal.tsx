"use client";

import { CATALOGO_CORPORAL } from "@/lib/boneco-corporal";
import { FOTOS, FOTO_ALTURA, FOTO_LARGURA, REGIOES_FOTO, type Vista } from "@/lib/corpo-foto";

// Modelo corporal em foto, frente e costas lado a lado (fotos do dono). Toque
// na região marca em turquesa; as outras ficam tracejadas para mostrar onde
// dá para tocar. Região que aparece nas duas vistas marca nas duas.
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
  const vista = (v: Vista) => (
    <figure key={v}>
      <svg viewBox={`0 0 ${FOTO_LARGURA} ${FOTO_ALTURA}`} className="block w-full overflow-hidden rounded-2xl bg-white" role="group" aria-label={`${v === "frente" ? "Frente" : "Costas"}: toque na região`}>
        <defs>
          <clipPath id={`corpo-${v}-quadro`}>
            <rect width={FOTO_LARGURA} height={FOTO_ALTURA} rx={5} />
          </clipPath>
        </defs>
        <image href={FOTOS[v]} x={0} y={0} width={FOTO_LARGURA} height={FOTO_ALTURA} clipPath={`url(#corpo-${v}-quadro)`} />
        {CATALOGO_CORPORAL.filter((r) => REGIOES_FOTO[r.id]?.[v]).map((r) => {
          const on = sel.has(r.id);
          return (
            <g
              key={r.id}
              onClick={tocavel ? () => onAlternar!(r.id) : undefined}
              className={tocavel ? "cursor-pointer" : ""}
              fill="#3DBFB8"
              fillOpacity={on ? 0.5 : 0.08}
              stroke={on ? "#1F8F88" : "#ffffff"}
              strokeDasharray={on ? undefined : "1.6 1.2"}
              strokeWidth={on ? 0.9 : 0.7}
            >
              <title>{r.nome}</title>
              {REGIOES_FOTO[r.id][v]!.map(([cx, cy, rx, ry, rot], i) => (
                <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{v === "frente" ? "Frente" : "Costas"}</figcaption>
    </figure>
  );
  return <div className="mx-auto grid w-full max-w-[380px] select-none grid-cols-2 gap-3">{(["frente", "costas"] as Vista[]).map(vista)}</div>;
}
