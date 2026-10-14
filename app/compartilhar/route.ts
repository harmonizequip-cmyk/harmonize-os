import { NextResponse } from "next/server";

// Reserva para quando o compartilhamento chega antes do service worker estar
// ativo (o normal é o sw.js responder sem chegar aqui): texto sem arquivo vai
// para o assistente; o resto abre a janela de receber, sem o arquivo.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const arquivo = form.get("arquivo");
    const texto = String(form.get("texto") || form.get("titulo") || "").trim();
    if (!(arquivo && typeof arquivo !== "string") && texto) {
      return NextResponse.redirect(new URL(`/assistente?texto=${encodeURIComponent(texto.slice(0, 2000))}`, request.url), 303);
    }
  } catch {
    // corpo ilegível: segue para receber
  }
  return NextResponse.redirect(new URL("/dashboard?acao=receber", request.url), 303);
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/dashboard?acao=receber", request.url), 303);
}
