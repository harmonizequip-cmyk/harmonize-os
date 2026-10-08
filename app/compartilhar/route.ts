import { NextResponse } from "next/server";

// Reserva para quando o compartilhamento chega antes do service worker estar
// ativo (o normal é o sw.js responder sem chegar aqui): abre a janela de
// receber, sem o arquivo.
export function POST(request: Request) {
  return NextResponse.redirect(new URL("/dashboard?acao=receber", request.url), 303);
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/dashboard?acao=receber", request.url), 303);
}
