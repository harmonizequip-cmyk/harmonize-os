"use client";

// Fila de envio da campanha: uma pessoa por vez, com a mensagem já no nome
// dela (editável só para ela), a arte e os botões. Nada sai sozinho: o
// Compartilhar abre a lista do celular e o dono escolhe o WhatsApp e a
// conversa. O limite diário protege o número de ser marcado como spam.
// Modelo: app/(app)/assistente/CartaoAgenda.tsx e tarefas/ModoFila.tsx.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleSlash, MessageCircle, Send, ShieldAlert, SkipForward } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink } from "@/lib/format";
import { avisar, confirmar } from "@/components/Dialogos";
import { LinkCliente } from "@/components/Atalhos";
import MenuAtalhosCliente from "@/components/MenuAtalhosCliente";
import { mensagemParaPessoa, situacaoDoLimite, type StatusEnvio } from "@/lib/campanhas";
import { arquivoDaArte } from "@/lib/campanha-arte";
import type { PessoaClassificada } from "@/lib/relacionamento";
import { SeloClasse, nomeDaPessoa } from "./comum";

export default function FilaCampanha({
  campanhaId,
  mensagemBase,
  limiteDiario,
  arteUrl: arteUrlInicial,
  arteNome,
  fila: filaInicial,
  enviadosHojeInicial,
  onMudou,
}: {
  campanhaId: string;
  mensagemBase: string;
  limiteDiario: number;
  arteUrl: string | null;
  arteNome: string | null;
  fila: PessoaClassificada[];
  enviadosHojeInicial: number;
  onMudou: () => void;
}) {
  const supabase = createClient();
  // Fotografia da fila ao abrir: marcar alguém não reordena o resto.
  const [fila] = useState(filaInicial);
  // O endereço da arte muda a cada recarga da página; fica o primeiro (vale 1 hora).
  const [arteUrl] = useState(arteUrlInicial);
  const [pos, setPos] = useState(0);
  const [enviadosHoje, setEnviadosHoje] = useState(enviadosHojeInicial);
  const [passouLimite, setPassouLimite] = useState(false);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mandou, setMandou] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arteErro, setArteErro] = useState(false);
  const [montado, setMontado] = useState(false);
  const compartilhando = useRef(false);

  const p = fila[pos];
  const limite = situacaoDoLimite(enviadosHoje, limiteDiario);
  const restantes = Math.max(0, fila.length - pos);

  useEffect(() => setMontado(true), []);

  // A arte é baixada ANTES do toque: o Compartilhar precisa ser chamado direto
  // no clique, sem esperar nada (senão o celular recusa).
  useEffect(() => {
    if (!arteUrl) return;
    let vivo = true;
    arquivoDaArte(arteUrl, arteNome ?? "arte")
      .then((f) => vivo && setArquivo(f))
      .catch(() => vivo && setArteErro(true));
    return () => {
      vivo = false;
    };
  }, [arteUrl, arteNome]);

  useEffect(() => {
    if (!p) return;
    setTexto(mensagemParaPessoa(mensagemBase, p));
    setEditando(false);
    setMandou(false);
    setAviso(null);
  }, [p, mensagemBase]);

  // Uma tentativa por toque, sem repetir: o toque só vale uma vez para o Compartilhar.
  function enviarComArte() {
    setAviso(null);
    if (!p || compartilhando.current) return;
    if (!arquivo) {
      setAviso(arteErro ? "Não consegui carregar a arte. Use Só texto." : "A arte ainda está carregando. Espere um instante e toque de novo.");
      return;
    }
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const dados: ShareData = { files: [arquivo], text: texto };
    if (typeof nav.share !== "function" || !nav.canShare?.(dados)) {
      setAviso("Este aparelho não compartilha imagem por aqui. Use Só texto.");
      return;
    }
    // Copia o texto (o WhatsApp às vezes não leva o texto junto da imagem), sem esperar.
    try {
      navigator.clipboard?.writeText(texto).catch(() => undefined);
    } catch {
      // sem permissão de copiar: segue só com o Compartilhar
    }
    compartilhando.current = true;
    let promessa: Promise<void>;
    try {
      promessa = nav.share(dados);
    } catch {
      compartilhando.current = false;
      setAviso("Não consegui abrir o Compartilhar. Use Só texto.");
      return;
    }
    promessa
      .then(() => {
        setMandou(true);
        setAviso(`Escolha o WhatsApp e a conversa de ${nomeDaPessoa(p)}. A mensagem também foi copiada, caso não vá junto. Depois toque em Marcar enviado.`);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setAviso("Não consegui abrir o Compartilhar. Use Só texto.");
      })
      .finally(() => {
        compartilhando.current = false;
      });
  }

  async function marcar(status: StatusEnvio) {
    if (!p) return;
    if (status === "enviado" && !texto.trim()) {
      setAviso("A mensagem está vazia.");
      return;
    }
    setOcupado(true);
    const { error } = await supabase.rpc("registrar_envio_campanha", {
      p_campanha: campanhaId,
      p_client: p.id,
      p_status: status,
      p_mensagem: status === "enviado" ? texto.trim() : null,
    });
    setOcupado(false);
    if (error) {
      avisar(error.message || "Não consegui registrar. Tente de novo.", "erro");
      return;
    }
    if (status === "enviado") setEnviadosHoje((n) => n + 1);
    setPos((x) => x + 1);
    onMudou();
  }

  async function passarDoLimite() {
    const ok = await confirmar({
      titulo: "Passar do limite de hoje?",
      texto: `Você já mandou ${limite.enviados} mensagens desta campanha hoje. Mandar muitas mensagens iguais no mesmo dia aumenta o risco de o WhatsApp marcar seu número como spam e até bloquear. O mais seguro é continuar amanhã.`,
      confirmar: "Passar do limite",
      cancelar: "Continuar amanhã",
      perigo: true,
    });
    if (ok) setPassouLimite(true);
  }

  const contador = (
    <div className="cartao p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-800">
          {limite.enviados} de {limite.limite} enviados hoje
        </p>
        <p className="text-[12px] text-neutral-500">
          {restantes} {restantes === 1 ? "restante" : "restantes"} na fila
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full transition-all ${limite.atingido ? "bg-amber-400" : "bg-brand-teal"}`}
          style={{ width: `${Math.min(100, (limite.enviados / limite.limite) * 100)}%` }}
        />
      </div>
    </div>
  );

  if (!p) {
    return (
      <div className="space-y-3">
        {contador}
        <section className="cartao p-6 text-center">
          <p className="text-base font-bold text-neutral-900">Fila vazia</p>
          <p className="mt-1 text-sm text-neutral-500">
            {fila.length ? "Você passou por todo mundo desta fila." : "Ninguém do público está esperando. Ajuste o público em Editar, se quiser alcançar mais gente."}
          </p>
        </section>
      </div>
    );
  }

  if (limite.atingido && !passouLimite) {
    return (
      <div className="space-y-3">
        {contador}
        <section className="cartao p-5 text-center">
          <ShieldAlert size={30} className="mx-auto text-amber-500" />
          <p className="mt-2 text-base font-bold text-neutral-900">Limite de hoje atingido, continue amanhã</p>
          <p className="mt-1 text-sm text-neutral-500">
            O limite de {limite.limite} por dia protege o seu número. A fila continua de onde parou.
          </p>
          <button
            type="button"
            onClick={passarDoLimite}
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700"
          >
            Passar do limite
          </button>
        </section>
      </div>
    );
  }

  const link = montado ? buildWhatsAppLink(p.whatsapp, texto) : null;
  const botao = "flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="space-y-3">
      {contador}
      <section className="cartao p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-neutral-400">
              {pos + 1} de {fila.length}
            </p>
            <p className="mt-0.5 truncate text-base font-bold text-neutral-900">
              <LinkCliente id={p.id}>{nomeDaPessoa(p)}</LinkCliente>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-500">
              <SeloClasse classe={p.classe} />
              {p.cidade && <span>{p.cidade}</span>}
            </div>
          </div>
          <MenuAtalhosCliente clienteId={p.id} nome={p.nome} className="-mr-2 -mt-1" />
        </div>

        {arteUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={arteUrl} alt="Arte da campanha" className="mt-3 max-h-56 w-full rounded-2xl border border-neutral-100 bg-neutral-50 object-contain" />
        )}

        <div className="mt-3">
          {editando ? (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[13.5px] text-neutral-800"
            />
          ) : (
            <p className="whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-[13.5px] text-neutral-700">{texto}</p>
          )}
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-teal-dark"
          >
            {editando ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {editando ? "Pronto" : "Editar só para esta pessoa"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {arteUrl ? (
            <button type="button" onClick={enviarComArte} disabled={ocupado} className={`${botao} bg-emerald-600 text-white`}>
              <Send size={15} /> Enviar com arte
            </button>
          ) : null}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMandou(true)}
              className={`${botao} ${arteUrl ? "border border-neutral-300 bg-white text-neutral-700" : "col-span-2 bg-emerald-600 text-white"}`}
            >
              <MessageCircle size={15} /> Só texto
            </a>
          ) : (
            <span className={`${botao} ${arteUrl ? "" : "col-span-2"} border border-neutral-200 text-neutral-400`}>
              <MessageCircle size={15} /> Só texto
            </span>
          )}
        </div>
        {aviso && <p className="mt-2 text-[12px] leading-snug text-neutral-600">{aviso}</p>}

        <p className="mb-2 mt-4 text-[11px] text-neutral-400">{mandou ? "Mandou? Marque para ir à próxima:" : "Depois de mandar, marque para ir à próxima:"}</p>
        <button
          type="button"
          onClick={() => marcar("enviado")}
          disabled={ocupado}
          className={`${botao} w-full bg-brand-teal text-white`}
        >
          <Check size={16} /> Marcar enviado
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => marcar("pulado")} disabled={ocupado} className={`${botao} border border-neutral-300 text-neutral-600`}>
            <SkipForward size={15} /> Pular
          </button>
          <button type="button" onClick={() => marcar("nao_quer")} disabled={ocupado} className={`${botao} border border-rose-200 bg-rose-50 text-rose-700`}>
            <CircleSlash size={15} /> Não quer receber
          </button>
        </div>
      </section>
    </div>
  );
}
