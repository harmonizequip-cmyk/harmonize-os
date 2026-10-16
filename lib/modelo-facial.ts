// Modelo facial do Planejador HIPRO: desenho próprio (traço limpo, cores da
// Harmonize) que mostra, área por área, o sentido do movimento da ponteira
// com setas, igual às fotos do protocolo antigo. Sai como texto SVG para
// servir na tela (<img src={urlModeloFacial(id)}>) e na impressão do
// prontuário (mesma imagem).

const COR = {
  fundoA: "#EEF8F7",
  fundoB: "#F6F0FA",
  pele: "#F7E4D9",
  peleSombra: "#EFD3C4",
  traco: "#B98A7B",
  tracoSuave: "#CFA698",
  cabelo: "#4E3D38",
  cabeloBrilho: "#6A5450",
  olho: "#5C4038",
  pupila: "#2E211D",
  labio: "#E39CA7",
  labioTraco: "#C97B89",
  sobrancelha: "#6B5049",
  seta: "#13867F",
  zona: "#3DBFB8",
  proibido: "#D9577E",
};

export type VistaModelo = "frente" | "perfil" | "papada" | "baixo" | "boca_sup" | "boca_inf" | "corporal";

/** Vista de cada área fixa do planejador (o resto do rosto usa a frente sem setas). */
export const VISTA_DA_AREA: Record<string, VistaModelo> = {
  frontal: "frente",
  temporal: "frente",
  arcomandibular: "perfil",
  jowls: "perfil",
  pescoco: "perfil",
  papada: "papada",
  submandibular: "baixo",
  perioral_sup: "boca_sup",
  perioral_inf: "boca_inf",
};

/** Como a ponteira anda em cada área (texto curto, para a tela e o prontuário). */
export const MOVIMENTO_DA_AREA: Record<string, string> = {
  frontal: "Do centro da testa para as laterais, em linhas paralelas.",
  temporal: "Em arco, de baixo do olho subindo pela lateral até a têmpora.",
  arcomandibular: "Em diagonal, do sulco perto da boca subindo até a frente da orelha.",
  jowls: "Dois campos ovais (bigode chinês e jowls), com o movimento de baixo para cima.",
  pescoco: "Da parte de baixo da orelha descendo em curva até embaixo do queixo.",
  papada: "Movimento circular no centro da papada. Não descer para a tireoide (X).",
  submandibular: "Do centro do queixo para os lados, em arco até perto da orelha.",
  perioral_sup: "Entre o nariz e o lábio, do centro para os cantos.",
  perioral_inf: "Abaixo do lábio inferior, do centro para os cantos.",
};

const f = (n: number) => +n.toFixed(1);

function seta(d: string, extra = ""): string {
  return `<path d="${d}" fill="none" stroke="${COR.seta}" stroke-width="2.1" stroke-linecap="round" marker-end="url(#ponta)"${extra}/>`;
}

const defs = `<defs>
<linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COR.fundoA}"/><stop offset="1" stop-color="${COR.fundoB}"/></linearGradient>
<radialGradient id="rubor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#F2B8B0" stop-opacity="0.55"/><stop offset="1" stop-color="#F2B8B0" stop-opacity="0"/></radialGradient>
<marker id="ponta" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto"><path d="M0,0.8 L9.5,5 L0,9.2 L2.2,5 Z" fill="${COR.seta}"/></marker>
<marker id="pontaIni" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0,0.8 L9.5,5 L0,9.2 L2.2,5 Z" fill="${COR.seta}"/></marker>
<clipPath id="quadro"><rect x="0" y="0" width="120" height="120" rx="16"/></clipPath>
</defs>`;

const zona = (d: string) => `<path d="${d}" fill="${COR.zona}" fill-opacity="0.16" stroke="${COR.zona}" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="2 2"/>`;

// ─── Vistas (tudo em 120 x 120) ───

function olhoFrente(cx: number, espelho: boolean): string {
  const s = espelho ? -1 : 1;
  const x = (dx: number) => f(cx + s * dx);
  return `<path d="M${x(-11)},60 C${x(-6)},54.5 ${x(5)},54.5 ${x(11)},60 C${x(5)},64 ${x(-6)},64 ${x(-11)},60 Z" fill="#fff" stroke="${COR.olho}" stroke-width="1.1"/>
<circle cx="${cx}" cy="59.6" r="3.6" fill="${COR.olho}"/><circle cx="${cx}" cy="59.6" r="1.5" fill="${COR.pupila}"/><circle cx="${f(cx + 1.2)}" cy="58.4" r="0.8" fill="#fff"/>
<path d="M${x(-11.5)},59.6 C${x(-6)},53.6 ${x(5)},53.6 ${x(11.5)},59.4" fill="none" stroke="${COR.olho}" stroke-width="1.7" stroke-linecap="round"/>
<path d="M${x(-13)},${f(49.5)} C${x(-6)},44 ${x(5)},43.4 ${x(13)},46.2" fill="none" stroke="${COR.sobrancelha}" stroke-width="2.6" stroke-linecap="round"/>`;
}

function frente(): string {
  return `<rect width="120" height="120" fill="${COR.pele}"/>
<ellipse cx="30" cy="80" rx="14" ry="9" fill="url(#rubor)"/><ellipse cx="90" cy="80" rx="14" ry="9" fill="url(#rubor)"/>
<path d="M0,0 H120 V92 C117,68 112,42 100,25 C90,12 76,7 60,7 C44,7 30,12 20,25 C8,42 3,68 0,92 Z" fill="${COR.cabelo}"/>
<path d="M0,90 C3,100 8,111 15,120 L0,120 Z" fill="${COR.fundoA}"/><path d="M120,90 C117,100 112,111 105,120 L120,120 Z" fill="${COR.fundoB}"/>
<path d="M0,90 C3,100 8,111 15,120 M120,90 C117,100 112,111 105,120" fill="none" stroke="${COR.traco}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M58,9 C46,10 35,15 27,23" fill="none" stroke="${COR.cabeloBrilho}" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
${olhoFrente(39, false)}${olhoFrente(81, true)}
<path d="M55.5,64 C54.6,73 51.6,79 51.6,83.5" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.2" stroke-linecap="round"/>
<path d="M64.5,64 C65.4,73 68.4,79 68.4,83.5" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.2" stroke-linecap="round"/>
<path d="M50.5,84 C53,88.5 56.5,88.5 60,86.4 C63.5,88.5 67,88.5 69.5,84" fill="none" stroke="${COR.traco}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M44,108 C50,103.6 56,102.8 60,105 C64,102.8 70,103.6 76,108 C70,110 50,110 44,108 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="0.9"/>
<path d="M44,108 C50,117 70,117 76,108 C70,110.5 50,110.5 44,108 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="0.9"/>`;
}

function perfil(): string {
  // Rosto virado para a esquerda (como as fotos do protocolo).
  const frenteRosto =
    "M47,9 C40,15 38.5,24 38.5,32 C38.5,36 37,38.5 35.6,40.5 C36.4,43 36,45.5 34.3,48.5 C31.5,53.5 27.6,58 25.4,61.6 C24.8,64 27,65.6 31,65.8 C32,67.8 31.6,69.6 30.4,71 C29.4,72.8 30.2,74.2 32,75 C30.4,76.4 30.4,78 31.4,79.2 C33.4,81.8 33.2,84 32.2,86 C33,90.4 35.4,93.4 40.4,95.2 C45,96.8 50,97 54.2,97.4";
  return `<rect width="120" height="120" fill="${COR.fundoA}"/>
<path d="${frenteRosto} C54.2,106 55,114 56,120 L95,120 C91,106 88.5,94 87,83 C94,70 97,42 90,22 C80,9 61,4 47,9 Z" fill="${COR.pele}" stroke="${COR.traco}" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M54.6,97.2 C64,96 74,90 80.5,78" fill="none" stroke="${COR.traco}" stroke-width="1.2" stroke-linecap="round"/>
<ellipse cx="50" cy="73" rx="10" ry="7" fill="url(#rubor)"/>
<path d="M41,12 C52,0 82,-1 98,10 C112,21 115,42 111,60 C109,72 102,84 94,90 C93,78 92.6,70 90.4,62 C88,50 80,40 70,35 C60,31 50,29.6 41.6,23.6 C39.6,19.6 39.4,15.6 41,12 Z" fill="${COR.cabelo}"/>
<path d="M46,13 C58,6 76,6 90,13" fill="none" stroke="${COR.cabeloBrilho}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
<path d="M82.4,54 C88.4,51.6 92.6,56.6 91.6,62.8 C90.8,68.2 87.6,72 83.4,71.2 C82.2,68.6 83.2,66.6 82.4,64.4 C84.6,62 84.6,58.6 82.4,56.6 Z" fill="${COR.peleSombra}" stroke="${COR.traco}" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M36.6,46.2 C38.8,43.8 42.6,43.6 45.2,45.8 C42.8,47.6 39.4,47.8 36.6,46.2 Z" fill="#fff" stroke="${COR.olho}" stroke-width="1"/>
<circle cx="39.6" cy="45.6" r="1.5" fill="${COR.olho}"/>
<path d="M36.4,45.9 C38.8,43 42.8,42.8 45.6,45.4" fill="none" stroke="${COR.olho}" stroke-width="1.5" stroke-linecap="round"/>
<path d="M35.6,40.6 C39.6,38.2 45,38.2 49.6,40.4" fill="none" stroke="${COR.sobrancelha}" stroke-width="2.3" stroke-linecap="round"/>
<path d="M28.6,63.4 C30.6,62.4 32.6,63 33.6,64.6" fill="none" stroke="${COR.traco}" stroke-width="1.1" stroke-linecap="round"/>
<path d="M30.6,71 C32.6,71.6 34.6,71.8 36,72.8 C34.4,74.2 32.4,74.8 30.6,74.4 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="0.8"/>
<path d="M30.8,75.2 C32.8,76 35,76 36.2,75.2 C35.4,77.8 33.4,79 31.6,79 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="0.8"/>`;
}

function papadaVista(): string {
  return `<rect width="120" height="120" fill="${COR.pele}"/>
<path d="M0,0 H120 V6 C110,20 94,31 74,34.6 C68,35.6 52,35.6 46,34.6 C26,31 10,20 0,6 Z" fill="${COR.peleSombra}"/>
<path d="M0,6 C10,20 26,31 46,34.6 C52,35.6 68,35.6 74,34.6 C94,31 110,20 120,6" fill="none" stroke="${COR.traco}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M44,0 C50,7 70,7 76,0 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="0.9"/>
<path d="M50,24 C54,27 66,27 70,24" fill="none" stroke="${COR.tracoSuave}" stroke-width="1" stroke-linecap="round"/>
<path d="M29,42 C27,68 25,94 21,120" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.2" stroke-linecap="round"/>
<path d="M91,42 C93,68 95,94 99,120" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.2" stroke-linecap="round"/>
<path d="M4,116 C20,108 38,109 52,116" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.1" stroke-linecap="round"/>
<path d="M116,116 C100,108 82,109 68,116" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.1" stroke-linecap="round"/>`;
}

function baixoVista(): string {
  // Queixo para cima (vista de baixo): mandíbula em arco, orelhas nos lados.
  return `<rect width="120" height="120" fill="${COR.pele}"/>
<path d="M0,0 H120 V70 C108,46 88,30 60,27 C32,30 12,46 0,70 Z" fill="${COR.peleSombra}"/>
<path d="M0,70 C12,46 32,30 60,27 C88,30 108,46 120,70" fill="none" stroke="${COR.traco}" stroke-width="1.3" stroke-linecap="round"/>
<path d="M48,8 C53,4 67,4 72,8 C66,11 54,11 48,8 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="0.9"/>
<path d="M52,20 C56,23 64,23 68,20" fill="none" stroke="${COR.tracoSuave}" stroke-width="1" stroke-linecap="round"/>
<path d="M0,58 C7,58 10,66 9,74 C8,82 4,86 0,86 Z" fill="${COR.peleSombra}" stroke="${COR.traco}" stroke-width="1.1"/>
<path d="M120,58 C113,58 110,66 111,74 C112,82 116,86 120,86 Z" fill="${COR.peleSombra}" stroke="${COR.traco}" stroke-width="1.1"/>
<path d="M30,92 C30,102 29,112 28,120" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.1" stroke-linecap="round"/>
<path d="M90,92 C90,102 91,112 92,120" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.1" stroke-linecap="round"/>
<path d="M54,64 C57,66 63,66 66,64" fill="none" stroke="${COR.tracoSuave}" stroke-width="1" stroke-linecap="round"/>`;
}

function bocaSup(): string {
  return `<rect width="120" height="120" fill="${COR.pele}"/>
<path d="M40,0 C39,10 33,15 34.5,21.5 C37,27 44,27.5 49,25 C53,27.6 57,28 60,26.6 C63,28 67,27.6 71,25 C76,27.5 83,27 85.5,21.5 C87,15 81,10 80,0 Z" fill="${COR.peleSombra}" stroke="${COR.traco}" stroke-width="1.2" stroke-linejoin="round"/>
<ellipse cx="49" cy="20.6" rx="4.4" ry="2.4" transform="rotate(14 49 20.6)" fill="#7A4E45"/>
<ellipse cx="71" cy="20.6" rx="4.4" ry="2.4" transform="rotate(-14 71 20.6)" fill="#7A4E45"/>
<path d="M55.4,30 C54.8,44 54.6,60 54,73" fill="none" stroke="${COR.tracoSuave}" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
<path d="M64.6,30 C65.2,44 65.4,60 66,73" fill="none" stroke="${COR.tracoSuave}" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
<path d="M14,88 C26,80 41,73.4 52,75 C56,75.8 58,78 60,78 C62,78 64,75.8 68,75 C79,73.4 94,80 106,88 C92,90.4 28,90.4 14,88 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="1"/>
<path d="M14,88 C32,108 88,108 106,88 C92,91.6 28,91.6 14,88 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="1"/>
<path d="M40,96 C50,99 70,99 80,96" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>`;
}

function bocaInf(): string {
  return `<rect width="120" height="120" fill="${COR.pele}"/>
<path d="M14,22 C26,13 41,7 52,8.6 C56,9.4 58,11.6 60,11.6 C62,11.6 64,9.4 68,8.6 C79,7 94,13 106,22 C92,24.4 28,24.4 14,22 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="1"/>
<path d="M14,22 C32,42 88,42 106,22 C92,25.6 28,25.6 14,22 Z" fill="${COR.labio}" stroke="${COR.labioTraco}" stroke-width="1"/>
<path d="M40,30 C50,33 70,33 80,30" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>
<path d="M16,120 C26,100 44,94 60,94 C76,94 94,100 104,120" fill="none" stroke="${COR.tracoSuave}" stroke-width="1.2" stroke-linecap="round"/>`;
}

function rostoNeutro(): string {
  return frente();
}

// ─── Setas por área ───

function setasDaArea(id: string): string {
  switch (id) {
    case "frontal": {
      const ys = [27, 32.5, 38];
      return (
        zona("M22,23 C34,17 86,17 98,23 L100,42 C88,40 32,40 20,42 Z") +
        ys.map((y) => seta(`M54,${y} C44,${y - 1.2} 32,${y - 0.6} 21,${y + 0.6}`)).join("") +
        ys.map((y) => seta(`M66,${y} C76,${y - 1.2} 88,${y - 0.6} 99,${y + 0.6}`)).join("")
      );
    }
    case "temporal":
      return (
        zona("M74,68 C92,72 106,62 106,40 L94,38 C94,56 88,64 74,64 Z") +
        seta("M76,69 C88,69.5 94.5,61 94.5,47") +
        seta("M76,73.5 C91,74 99,64 99,45") +
        seta("M76,78 C94,78.5 103.4,67 103.4,43")
      );
    case "arcomandibular": {
      const linhas: [number, number, number, number][] = [
        [43, 63, 74, 50],
        [44, 69, 75.4, 56],
        [45.4, 75, 76.6, 62],
        [47.4, 81, 77.6, 68],
        [50.4, 87, 78.4, 74],
      ];
      return (
        zona("M40,62 C52,52 66,46 78,46 L81,78 C70,84 58,90 50,92 C44,84 41,72 40,62 Z") +
        linhas.map(([x1, y1, x2, y2]) => seta(`M${x1},${y1} C${f((x1 + x2) / 2)},${f((y1 + y2) / 2 + 1.4)} ${f(x2 - 6)},${f(y2 + 1)} ${x2},${y2}`)).join("")
      );
    }
    case "jowls":
      return (
        `<ellipse cx="42.6" cy="66" rx="5.2" ry="10.4" transform="rotate(-18 42.6 66)" fill="${COR.zona}" fill-opacity="0.16" stroke="${COR.seta}" stroke-width="1.5"/>` +
        `<ellipse cx="50.4" cy="85" rx="5.6" ry="10" transform="rotate(-38 50.4 85)" fill="${COR.zona}" fill-opacity="0.16" stroke="${COR.seta}" stroke-width="1.5"/>` +
        seta("M43.6,74 L41.2,59.6") +
        seta("M47.4,72.6 L44.6,61") +
        seta("M54.6,91 L48,80.4") +
        seta("M57.2,87.6 L51.8,79")
      );
    case "pescoco":
      return (
        zona("M80,72 C92,76 94,92 84,108 L60,112 C58,104 57,100 57,98 C68,96 76,88 80,72 Z") +
        seta("M82,73 C80,86 72,94 61,99") +
        seta("M86.4,76 C84.6,90 76.6,99.6 63,105") +
        seta("M90.6,79 C89,95 80.6,105.6 65,111")
      );
    case "papada":
      return (
        `<circle cx="60" cy="54" r="15" fill="${COR.zona}" fill-opacity="0.14" stroke="${COR.zona}" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="2 2"/>` +
        seta("M66.9,47.6 A9.4,9.4 0 1 1 57.4,45") +
        `<path d="M53,80 L67,94 M67,80 L53,94" stroke="${COR.proibido}" stroke-width="3.4" stroke-linecap="round"/>`
      );
    case "submandibular":
      return (
        zona("M18,62 C28,44 46,34 60,33 C74,34 92,44 102,62 L94,70 C86,56 74,48 60,47 C46,48 34,56 26,70 Z") +
        seta("M54,43 C40,43.4 26,53 18.6,70") +
        seta("M66,43 C80,43.4 94,53 101.4,70")
      );
    case "perioral_sup": {
      const ys = [44, 51, 58];
      return (
        zona("M12,40 C30,36 90,36 108,40 L108,64 C90,66 30,66 12,64 Z") +
        ys.map((y) => seta(`M53,${y} C42,${y - 0.8} 30,${y - 0.4} 17,${y + 1}`)).join("") +
        ys.map((y) => seta(`M67,${y} C78,${y - 0.8} 90,${y - 0.4} 103,${y + 1}`)).join("")
      );
    }
    case "perioral_inf": {
      const ys = [55, 62, 69];
      return (
        zona("M12,50 C30,46 90,46 108,50 L108,76 C90,78 30,78 12,76 Z") +
        ys.map((y) => seta(`M53,${y} C42,${y + 0.8} 30,${y + 0.4} 17,${y - 1}`)).join("") +
        ys.map((y) => seta(`M67,${y} C78,${y + 0.8} 90,${y + 0.4} 103,${y - 1}`)).join("")
      );
    }
    default:
      return "";
  }
}

function base(vista: VistaModelo): string {
  switch (vista) {
    case "perfil":
      return perfil();
    case "papada":
      return papadaVista();
    case "baixo":
      return baixoVista();
    case "boca_sup":
      return bocaSup();
    case "boca_inf":
      return bocaInf();
    default:
      return rostoNeutro();
  }
}

/** SVG da área (id das áreas fixas; outro id = rosto neutro, sem setas). */
export function svgModeloFacial(id: string): string {
  const vista = VISTA_DA_AREA[id] ?? "frente";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${defs}<rect width="120" height="120" rx="16" fill="url(#fundo)"/><g clip-path="url(#quadro)">${base(vista)}${setasDaArea(id)}</g><rect x="0.6" y="0.6" width="118.8" height="118.8" rx="15.4" fill="none" stroke="#3DBFB8" stroke-opacity="0.35" stroke-width="1.2"/></svg>`;
}

export function urlModeloFacial(id: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgModeloFacial(id))}`;
}

