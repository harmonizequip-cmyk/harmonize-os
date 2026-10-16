"use client";

import { CATALOGO_CORPORAL, CORES_BONECO, formasDaRegiao, formasDoCorpo, type FormaDesenho } from "@/lib/boneco-corporal";
import { FOTO_ALTURA, FOTO_LARGURA, REGIOES_FOTO, naFoto } from "@/lib/corpo-foto";
import { FOTO_CORPO } from "@/lib/corpo-foto-dados";

const costas = (f: FormaDesenho) => (f.e ? f.e[0] >= 100 : /M1\d\d/.test(f.d ?? ""));
const corpoCostas = formasDoCorpo().filter(costas);

function Forma({ f, ...props }: { f: FormaDesenho } & React.SVGProps<SVGPathElement & SVGEllipseElement>) {
  return f.e ? <ellipse cx={f.e[0]} cy={f.e[1]} rx={f.e[2]} ry={f.e[3]} {...props} /> : <path d={f.d} {...props} />;
}

// Modelo corporal em duas posições: frente na foto da modelo (tabela de
// protocolos do dono) e costas na figura, até chegar a foto de costas. Toque na
// região marca em turquesa; as outras ficam tracejadas para mostrar onde tocar.
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
  const c = CORES_BONECO;
  const deTras = CATALOGO_CORPORAL.filter((r) => !naFoto(r.id));
  return (
    <div className="mx-auto grid w-full max-w-[420px] select-none grid-cols-2 gap-2">
      <figure>
        <svg viewBox={`0 0 ${FOTO_LARGURA} ${FOTO_ALTURA}`} className="block w-full overflow-hidden rounded-2xl bg-white" role="group" aria-label="Frente: toque na região">
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
        <figcaption className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Frente</figcaption>
      </figure>
      <figure>
        <svg viewBox="100 0 100 214" className="block w-full rounded-2xl" role="group" aria-label="Costas: toque na região">
          <rect x={100} y={0} width={100} height={214} fill={c.fundo} />
          <g fill={c.contorno} stroke={c.contorno} strokeWidth={2.4} strokeLinejoin="round">
            {corpoCostas.map((f, i) => (
              <Forma key={i} f={f} />
            ))}
          </g>
          <g fill={c.pele}>
            {corpoCostas.map((f, i) => (
              <Forma key={i} f={f} />
            ))}
          </g>
          <path d="M150,44 C150,70 150,96 150,120" stroke={c.contorno} strokeWidth={1} fill="none" />
          {deTras.map((r) => {
            const on = sel.has(r.id);
            return (
              <g
                key={r.id}
                onClick={tocavel ? () => onAlternar!(r.id) : undefined}
                className={tocavel ? "cursor-pointer" : ""}
                fill={c.regiao}
                fillOpacity={on ? 0.6 : 0.12}
                stroke={on ? c.regiaoBorda : c.regiao}
                strokeOpacity={on ? 1 : 0.5}
                strokeDasharray={on ? undefined : "2 1.5"}
                strokeWidth={1.1}
              >
                <title>{r.nome}</title>
                {formasDaRegiao(r.id)
                  .filter(costas)
                  .map((f, i) => (
                    <Forma key={i} f={f} />
                  ))}
              </g>
            );
          })}
        </svg>
        <figcaption className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Costas</figcaption>
      </figure>
    </div>
  );
}
