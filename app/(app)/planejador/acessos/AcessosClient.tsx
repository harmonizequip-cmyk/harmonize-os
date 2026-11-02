"use client";

// Tela dos acessos ao Planejador (portal da cliente): abas Com acesso, Sem
// acesso e Sem cadastro, com busca. Ações pelas funções do banco que já
// existem: Pausar (remover_acesso_planejador), Liberar (liberar_acesso_planejador
// para login pausado ou formulário preenchido; liberar_portal_cliente para
// validade vencida) e Mandar formulário (criar_convite_cadastro + WhatsApp).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ChevronRight, ClipboardPen, KeyRound, Link2, Loader2, MessageCircle, PauseCircle, PlayCircle, Search, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar, pedirTexto } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { IconeChip } from "@/components/ui/Visual";
import LiberarAcademy from "@/components/LiberarAcademy";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { buildWhatsAppLink } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import { mensagemFormulario, textoMotivo, type GruposAcesso, type LinhaAcesso } from "@/lib/acessos-planejador";

type Aba = "com" | "sem" | "cadastro";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function saudacao(l: LinhaAcesso) {
  return saudacaoCurta({ name: l.cliente.nomeCompleto ?? l.cliente.nome, treatment: l.cliente.tratamento, displayName: l.cliente.nomeExibicao });
}

/** Compartilha o texto ou, sem Compartilhar, copia; último recurso: mostra para copiar. */
async function compartilharTexto(texto: string, link: string) {
  try {
    if (navigator.share) {
      await navigator.share({ text: texto });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(texto);
    avisar("Mensagem copiada. Cole na conversa dela.");
  } catch {
    await pedirTexto({ titulo: "Copie o link", valorInicial: link, soCopiar: true });
  }
}

export default function AcessosClient({
  grupos,
  abrirFormulario,
  erro,
  dono,
  paraEscolher,
}: {
  grupos: GruposAcesso;
  abrirFormulario: boolean;
  erro: string | null;
  /** Só o dono preenche o formulário por alguém. */
  dono: boolean;
  /** Clientes e leads para puxar os dados no formulário. */
  paraEscolher: ClientOption[];
}) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const [aba, setAba] = useState<Aba>(abrirFormulario ? "cadastro" : grupos.semAcesso.some((l) => l.motivo === "preencheu") ? "sem" : "com");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [liberada, setLiberada] = useState<LinhaAcesso | null>(null);
  const [preenchendo, setPreenchendo] = useState(false);
  const [escolhida, setEscolhida] = useState("");

  const lista = aba === "com" ? grupos.comAcesso : aba === "sem" ? grupos.semAcesso : grupos.semCadastro;
  const filtrada = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return lista;
    return lista.filter((l) => normalizar(`${l.cliente.nome} ${l.cliente.cidade ?? ""} ${l.email ?? ""}`).includes(q));
  }, [lista, busca]);

  async function rodar(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setOcupado(id);
    const { error } = await fn();
    setOcupado(null);
    if (error) {
      avisar(error.message, "erro");
      return false;
    }
    avisar(ok);
    router.refresh();
    return true;
  }

  async function pausar(l: LinhaAcesso) {
    if (!l.perfil) return;
    const sim = await confirmar({
      titulo: `Pausar o acesso de ${l.cliente.nome}?`,
      texto: "Ela deixa de entrar no Planejador. Os planejamentos ficam guardados e dá para liberar de novo quando quiser.",
      confirmar: "Pausar",
      perigo: true,
    });
    if (!sim) return;
    await rodar(l.cliente.id, () => createClient().rpc("remover_acesso_planejador", { p_user_id: l.perfil!.id }), "Acesso pausado.");
  }

  async function liberar(l: LinhaAcesso) {
    const sb = createClient();
    if (l.motivo === "vencido") {
      await rodar(l.cliente.id, () => sb.rpc("liberar_portal_cliente", { p_client_id: l.cliente.id, p_dias: 60 }), "Liberado por mais 60 dias.");
      return;
    }
    if (!l.email) return avisar("Sem e-mail de login para liberar. Abra a ficha da cliente.", "erro");
    const ok = await rodar(l.cliente.id, () => sb.rpc("liberar_acesso_planejador", { p_email: l.email, p_client_id: l.cliente.id }), "Acesso liberado por 60 dias.");
    if (ok && l.motivo === "preencheu") setLiberada(l);
  }

  async function alternarFotos(l: LinhaAcesso) {
    if (l.cliente.fotos === null || l.cliente.fotos === undefined) return avisar("Falta rodar o SQL das fotos no portal.", "erro");
    const liberar = !l.cliente.fotos;
    if (liberar) {
      const sim = await confirmar({
        titulo: `Liberar fotos para ${l.cliente.nome}?`,
        texto: "No portal, ela passa a ver, tirar e apagar as fotos dos pacientes dela (só de paciente que autorizou). Você pode tirar quando quiser.",
        confirmar: "Liberar fotos",
      });
      if (!sim) return;
    }
    await rodar(`fotos-${l.cliente.id}`, () => createClient().rpc("definir_fotos_portal", { p_client_id: l.cliente.id, p_liberado: liberar }), liberar ? "Fotos liberadas no portal." : "Fotos retiradas do portal.");
  }

  /** Abre o formulário aqui mesmo: ligado à ficha escolhida (já vem com os dados dela) ou do zero. */
  async function preencherFormulario(clienteId: string | null) {
    setOcupado(clienteId ? "preencher" : "zero");
    const { data, error } = await createClient().rpc("criar_convite_cadastro", { p_client_id: clienteId });
    if (error || !data) {
      setOcupado(null);
      return avisar(error?.message ?? "Não consegui abrir o formulário.", "erro");
    }
    window.location.href = `/cadastro/${data as string}`;
  }

  async function mandarFormulario(l: LinhaAcesso | null) {
    // A janela do WhatsApp abre já no toque (depois da espera o celular bloqueia).
    const zap = l?.cliente.whatsapp ? window.open("", "_blank") : null;
    setOcupado(l?.cliente.id ?? "geral");
    const { data, error } = await createClient().rpc("criar_convite_cadastro", { p_client_id: l?.cliente.id ?? null });
    setOcupado(null);
    if (error || !data) {
      zap?.close();
      return avisar(error?.message ?? "Não consegui gerar o link.", "erro");
    }
    const link = `${window.location.origin}/cadastro/${data as string}`;
    const texto = l ? `${saudacao(l)} ${mensagemFormulario(link)}` : mensagemFormulario(link);
    const wa = l ? buildWhatsAppLink(l.cliente.whatsapp, texto) : null;
    if (zap && wa) {
      zap.location.href = wa;
      return;
    }
    zap?.close();
    await compartilharTexto(texto, link);
  }

  const mensagemLiberada = liberada
    ? [
        `${saudacao(liberada)} Liberei seu acesso ao Planejador HIPRO da Harmonize.`,
        "",
        `Entre em: ${typeof window !== "undefined" ? window.location.origin : ""}/login`,
        `E-mail: ${liberada.email}`,
        "Senha: a que você criou no cadastro",
        "",
        "Depois de entrar, você pode trocar a senha no ícone da chave, no topo.",
      ].join("\n")
    : "";
  const waLiberada = liberada ? buildWhatsAppLink(liberada.cliente.whatsapp, mensagemLiberada) : null;

  const abas: { id: Aba; rotulo: string; n: number }[] = [
    { id: "com", rotulo: "Com acesso", n: grupos.comAcesso.length },
    { id: "sem", rotulo: "Sem acesso", n: grupos.semAcesso.length },
    { id: "cadastro", rotulo: "Sem cadastro", n: grupos.semCadastro.length },
  ];

  return (
    <div className="space-y-4">
      <section className="cartao relative overflow-hidden p-5">
        <div className="flex items-start gap-3">
          <IconeChip icone={KeyRound} cor="roxo" tamanho="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-neutral-900">Acessos ao Planejador</h1>
            <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">Quem entra no Planejador, quem está pausado e quem ainda não tem cadastro.</p>
          </div>
        </div>
        {!somenteLeitura && (
          <button
            type="button"
            onClick={() => mandarFormulario(null)}
            disabled={ocupado === "geral"}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-sm font-bold text-white shadow-glow-teal disabled:opacity-60"
          >
            {ocupado === "geral" ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Link do formulário (quem ainda não tem ficha)
          </button>
        )}
        {dono && !somenteLeitura && (
          <div className="mt-3">
            {!preenchendo ? (
              <button
                type="button"
                onClick={() => setPreenchendo(true)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-neutral-800 ring-1 ring-neutral-200"
              >
                <ClipboardPen size={16} /> Preencher o formulário eu mesmo
              </button>
            ) : (
              <div className="space-y-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                <p className="text-xs text-neutral-600">
                  Abre o formulário aqui no seu celular. Puxe um lead ou cliente que já existe (os dados dela já vêm preenchidos) ou comece do zero. Depois de enviar, ela aparece em &quot;Sem acesso&quot; para você liberar.
                </p>
                <ClientPicker
                  clients={paraEscolher}
                  value={escolhida}
                  onChange={setEscolhida}
                  onClientCreated={() => undefined}
                  label="Lead ou cliente"
                  allowCreate={false}
                />
                <button
                  type="button"
                  onClick={() => (escolhida ? preencherFormulario(escolhida) : avisar("Escolha o lead ou cliente, ou toque em Começar do zero.", "erro"))}
                  disabled={ocupado === "preencher"}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-teal px-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  {ocupado === "preencher" ? <Loader2 size={16} className="animate-spin" /> : <ClipboardPen size={16} />} Abrir o formulário com os dados dela
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => preencherFormulario(null)}
                    disabled={ocupado === "zero"}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-neutral-700 ring-1 ring-neutral-200 disabled:opacity-60"
                  >
                    {ocupado === "zero" && <Loader2 size={14} className="animate-spin" />} Começar do zero
                  </button>
                  <button type="button" onClick={() => setPreenchendo(false)} className="min-h-10 px-3 text-xs font-semibold text-neutral-500">
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {abrirFormulario && (
          <p className="mt-2 text-xs text-neutral-500">Para uma cliente que já tem ficha, toque em &quot;Mandar formulário&quot; ao lado do nome dela, abaixo: o link já vai ligado à ficha.</p>
        )}
      </section>

      {erro && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">Não consegui carregar os acessos: {erro}</p>}

      {liberada && (
        <section className="cartao space-y-3 p-4 ring-2 ring-emerald-300">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 size={17} /> Acesso de {liberada.cliente.nome} liberado
          </p>
          <div className="flex flex-wrap gap-2">
            {waLiberada && (
              <a href={waLiberada} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white">
                <MessageCircle size={14} /> Avisar no WhatsApp
              </a>
            )}
            <button type="button" onClick={() => compartilharTexto(mensagemLiberada, mensagemLiberada)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
              Compartilhar mensagem
            </button>
            <button type="button" onClick={() => setLiberada(null)} className="inline-flex min-h-10 items-center px-3 text-xs font-semibold text-neutral-500">
              Fechar
            </button>
          </div>
          <div className="border-t border-neutral-200/70 pt-3">
            <LiberarAcademy nome={liberada.cliente.nomeCompleto ?? liberada.cliente.nome} email={liberada.email} />
          </div>
        </section>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`rounded-xl px-1 py-2 text-center text-xs font-bold ${aba === a.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            {a.rotulo}
            <span className="block text-base font-black tabular-nums">{a.n}</span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 rounded-2xl bg-white px-3 ring-1 ring-neutral-200">
        <Search size={16} className="text-neutral-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, cidade ou e-mail" className="min-h-11 w-full bg-transparent text-sm text-neutral-900 outline-none" />
      </label>

      {filtrada.length === 0 && (
        <p className="cartao p-5 text-center text-sm text-neutral-500">
          {busca ? "Ninguém com esse nome nesta aba." : aba === "com" ? "Ninguém com acesso agora." : aba === "sem" ? "Ninguém pausado ou esperando liberar." : "Todas as clientes já têm cadastro."}
        </p>
      )}

      <ul className="space-y-2">
        {filtrada.map((l) => {
          const status = textoMotivo(l.motivo, l.validoAte);
          const espera = l.motivo === "preencheu";
          return (
            <li key={l.cliente.id} className={`cartao p-4 ${espera ? "ring-2 ring-amber-300" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${aba === "com" ? "bg-emerald-50 text-emerald-600" : aba === "sem" ? "bg-amber-50 text-amber-600" : "bg-neutral-100 text-neutral-500"}`}>
                  {aba === "com" ? <CheckCircle2 size={17} /> : aba === "sem" ? <PauseCircle size={17} /> : <UserX size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/clientes/${l.cliente.id}`} className="flex items-center gap-1 text-sm font-bold text-neutral-900">
                    <span className="truncate">{l.cliente.nome}</span>
                    <ChevronRight size={14} className="flex-shrink-0 text-neutral-400" />
                  </Link>
                  <p className="truncate text-xs text-neutral-500">{[l.cliente.cidade, l.email].filter(Boolean).join(" · ") || "Sem cidade"}</p>
                  {l.comoConheceu && <p className="mt-0.5 text-[11px] text-neutral-500">Conheceu por {l.comoConheceu}</p>}
                  {l.perfil && l.cliente.fotos && <p className="mt-0.5 text-[11px] font-semibold text-violet-700">Pode incluir fotos dos pacientes</p>}
                  {status && <p className={`mt-0.5 text-xs font-semibold ${espera ? "text-amber-700" : aba === "com" ? "text-emerald-700" : "text-neutral-600"}`}>{status}</p>}
                </div>
              </div>
              {!somenteLeitura && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {aba === "com" && (
                    <button type="button" onClick={() => pausar(l)} disabled={ocupado === l.cliente.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold text-rose-700 ring-1 ring-rose-200 disabled:opacity-60">
                      {ocupado === l.cliente.id ? <Loader2 size={14} className="animate-spin" /> : <PauseCircle size={14} />} Pausar
                    </button>
                  )}
                  {l.perfil && (
                    <button
                      type="button"
                      onClick={() => alternarFotos(l)}
                      disabled={ocupado === `fotos-${l.cliente.id}`}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-bold ring-1 disabled:opacity-60 ${l.cliente.fotos ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-white text-neutral-700 ring-neutral-200"}`}
                    >
                      {ocupado === `fotos-${l.cliente.id}` ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {l.cliente.fotos ? "Fotos liberadas · tirar" : "Liberar fotos"}
                    </button>
                  )}
                  {aba === "sem" && (
                    <button type="button" onClick={() => liberar(l)} disabled={ocupado === l.cliente.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-60">
                      {ocupado === l.cliente.id ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />} {l.motivo === "vencido" ? "Liberar por 60 dias" : "Liberar acesso"}
                    </button>
                  )}
                  {aba === "cadastro" && (
                    <button type="button" onClick={() => mandarFormulario(l)} disabled={ocupado === l.cliente.id} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-teal px-4 text-xs font-bold text-white disabled:opacity-60">
                      {ocupado === l.cliente.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} Mandar formulário
                    </button>
                  )}
                  {aba === "cadastro" && !l.cliente.whatsapp && <span className="self-center text-[11px] text-neutral-500">Sem WhatsApp: o link vai pelo Compartilhar.</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
