"use client";

import { CATALOGO_CORPORAL, CORES_BONECO, formasDaRegiao, formasDoCorpo, type FormaDesenho } from "@/lib/boneco-corporal";

const corpo = formasDoCorpo();

function Forma({ f, ...props }: { f: FormaDesenho } & React.SVGProps<SVGPathElement & SVGEllipseElement>) {
  return f.e ? <ellipse cx={f.e[0]} cy={f.e[1]} rx={f.e[2]} ry={f.e[3]} {...props} /> : <path d={f.d} {...props} />;
}

// Corpo inteiro (frente e costas) com as regiões tocáveis: as marcadas na cor
// da marca, as outras bem claras para mostrar onde dá para tocar.
export default function BonecoCorporal({
  marcadas,
  onAlternar,
  desabilitado,
}: {
  marcadas: string[];
  onAlternar?: (id: string) => void;
  desabilitado?: boolean;
}) {
  const c = CORES_BONECO;
  const sel = new Set(marcadas);
  return (
    <svg viewBox="-12 0 224 224" className="mx-auto block w-full max-w-[340px] select-none" role="group" aria-label="Boneco corporal: toque na região">
      <rect x={-12} y={0} width={224} height={224} rx={12} fill={c.fundo} />
      <g fill={c.contorno} stroke={c.contorno} strokeWidth={2.4} strokeLinejoin="round">
        {corpo.map((f, i) => (
          <Forma key={i} f={f} />
        ))}
      </g>
      <g fill={c.pele}>
        {corpo.map((f, i) => (
          <Forma key={i} f={f} />
        ))}
      </g>
      <path d="M150,44 C150,70 150,96 150,120" stroke={c.contorno} strokeWidth={1} fill="none" />
      {CATALOGO_CORPORAL.map((r) => {
        const on = sel.has(r.id);
        return (
          <g
            key={r.id}
            onClick={desabilitado || !onAlternar ? undefined : () => onAlternar(r.id)}
            className={desabilitado || !onAlternar ? "" : "cursor-pointer"}
            fill={c.regiao}
            fillOpacity={on ? 0.65 : 0.12}
            stroke={on ? c.regiaoBorda : c.regiao}
            strokeOpacity={on ? 1 : 0.45}
            strokeDasharray={on ? undefined : "2 1.5"}
            strokeWidth={1.1}
            strokeLinejoin="round"
          >
            <title>{r.nome}</title>
            {formasDaRegiao(r.id).map((f, i) => (
              <Forma key={i} f={f} />
            ))}
          </g>
        );
      })}
      <text x={50} y={221} fontFamily="Arial,sans-serif" fontSize={8} textAnchor="middle" fill={c.texto}>
        Frente
      </text>
      <text x={150} y={221} fontFamily="Arial,sans-serif" fontSize={8} textAnchor="middle" fill={c.texto}>
        Costas
      </text>
    </svg>
  );
}
