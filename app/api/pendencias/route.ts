import { NextResponse } from "next/server";
import { carregarAvisosAbertos, podeVerAvisos } from "@/lib/carregar-pendencias";

// Número do sino: quantos avisos do "Precisa de você" estão abertos (mesma
// conta do Dashboard), quantos são urgentes e quantas notificações não foram lidas.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await podeVerAvisos())) return NextResponse.json({ total: 0, urgentes: 0, naoLidas: 0 });
  try {
    const { avisos, naoLidas } = await carregarAvisosAbertos();
    return NextResponse.json({
      total: avisos.length,
      urgentes: avisos.filter((a) => a.nivel === "urgente").length,
      naoLidas,
    });
  } catch {
    return NextResponse.json({ erro: "Não consegui contar os avisos." }, { status: 500 });
  }
}
