"use client";

// Menu de atalhos dos cartões de lead/cliente (Funil, Agenda, Clientes, Relacionamento,
// Tarefas, Pendências, Agenda de hoje). Cada opção leva a uma tela ou ação que já existe:
// WhatsApp e Waze pelo cadastro, Agendar sem disparos e Nova locação abrem a ficha já com a
// janela certa (?acao=), e o resto são as listas filtradas pela cliente.
// No celular abre como folha de baixo; no computador, como menu ao lado do botão.
// Teclado: Enter/Espaço abre, setas andam, Home/End, Esc fecha e devolve o foco ao botão.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CalendarPlus,
  ClipboardList,
  FilePlus2,
  ListTodo,
  MessageCircle,
  MoreVertical,
  Navigation,
  Package,
  PlusCircle,
  StickyNote,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildWazeLink, buildWhatsAppLink } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import {
  linkAgendarCliente,
  linkLancamentosCliente,
  linkLocacoesCliente,
  linkNovaLocacaoCliente,
  linkNovoPlanejamento,
  linkPlanejamentosCliente,
  linkTarefasCliente,
} from "@/lib/atalhos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import AnotacoesCliente from "@/components/AnotacoesCliente";

interface DadosCliente {
  nome: string | null;
  nomeCurto: string | null;
  tratamento: string | null;
  whatsapp: string | null;
  endereco: string | null;
}

interface Item {
  chave: string;
  rotulo: string;
  icone: LucideIcon;
  href: string | null;
  externo?: boolean;
  /** Ação na própria tela (sem trocar de página), como abrir as anotações. */
  acao?: () => void;
  /** Por que está indisponível (sem WhatsApp, sem endereço). */
  motivo?: string;
}

const LARGURA = 288;

export default function MenuAtalhosCliente({
  clienteId,
  nome,
  nomeCurto,
  tratamento,
  whatsapp,
  endereco,
  eventoId,
  className = "",
  comTexto = false,
}: {
  clienteId: string;
  nome?: string | null;
  nomeCurto?: string | null;
  tratamento?: string | null;
  /** undefined = o cartão não sabe; o menu busca no cadastro ao abrir. */
  whatsapp?: string | null;
  endereco?: string | null;
  /** Atendimento do cartão (Agenda): o Novo planejamento já nasce ligado a ele. */
  eventoId?: string | null;
  className?: string;
  /** Mostra "Atalhos" ao lado do ícone. */
  comTexto?: boolean;
}) {
  const somenteLeitura = useSomenteLeitura();
  const [aberto, setAberto] = useState(false);
  const [anotacoes, setAnotacoes] = useState(false);
  const [celular, setCelular] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [dados, setDados] = useState<DadosCliente>({
    nome: nome ?? null,
    nomeCurto: nomeCurto ?? null,
    tratamento: tratamento ?? null,
    whatsapp: whatsapp ?? null,
    endereco: endereco ?? null,
  });
  const [buscado, setBuscado] = useState(whatsapp !== undefined && endereco !== undefined);
  const [carregando, setCarregando] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) requestAnimationFrame(() => botao.current?.focus());
  }, []);

  // Cadastro completo (WhatsApp, endereço, tratamento) na primeira abertura, quando o cartão não tem.
  useEffect(() => {
    if (!aberto || buscado) return;
    let ativo = true;
    setCarregando(true);
    createClient()
      .from("clients")
      .select("name, display_name, treatment, whatsapp, address")
      .eq("id", clienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return;
        if (data) {
          setDados({
            nome: (data.name as string | null) ?? nome ?? null,
            nomeCurto: (data.display_name as string | null) ?? nomeCurto ?? null,
            tratamento: (data.treatment as string | null) ?? tratamento ?? null,
            whatsapp: (data.whatsapp as string | null) ?? null,
            endereco: (data.address as string | null) ?? null,
          });
        }
        setBuscado(true);
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [aberto, buscado, clienteId, nome, nomeCurto, tratamento]);

  function posicionar() {
    const b = botao.current?.getBoundingClientRect();
    if (!b) return;
    const altura = Math.min(560, window.innerHeight - 16);
    const embaixo = window.innerHeight - b.bottom;
    const top = embaixo < altura && b.top > embaixo ? Math.max(8, b.top - altura - 6) : b.bottom + 6;
    const left = Math.min(Math.max(8, b.right - LARGURA), window.innerWidth - LARGURA - 8);
    setPos({ top, left });
  }

  function abrir() {
    const ehCelular = window.innerWidth < 640;
    setCelular(ehCelular);
    if (!ehCelular) posicionar();
    setAberto(true);
  }

  // Foco no primeiro item ao abrir; fecha ao rolar/redimensionar (o menu do computador fica solto na tela).
  useEffect(() => {
    if (!aberto) return;
    const t = requestAnimationFrame(() => primeiroItem()?.focus());
    const sair = () => !celular && fechar(false);
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (menu.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      fechar(false);
    };
    window.addEventListener("resize", sair);
    window.addEventListener("scroll", sair, true);
    document.addEventListener("mousedown", fora);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("resize", sair);
      window.removeEventListener("scroll", sair, true);
      document.removeEventListener("mousedown", fora);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, celular]);

  const itensFocaveis = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
  const primeiroItem = () => itensFocaveis()[0];

  function teclado(e: React.KeyboardEvent) {
    e.stopPropagation();
    const itens = itensFocaveis();
    const atual = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    } else if (e.key === "Tab") {
      fechar(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      itens[(atual + 1) % itens.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itens[(atual - 1 + itens.length) % itens.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itens[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itens[itens.length - 1]?.focus();
    }
  }

  const mensagem = `${saudacaoCurta({ name: dados.nome, treatment: dados.tratamento, displayName: dados.nomeCurto })}\n`;
  const zap = buildWhatsAppLink(dados.whatsapp, mensagem);
  const waze = buildWazeLink(dados.endereco);
  const esperando = carregando || !buscado;

  const grupos: { titulo: string; itens: Item[] }[] = [
    {
      titulo: "Contato",
      itens: [
        {
          chave: "anotacoes",
          rotulo: "Anotações",
          icone: StickyNote,
          href: null,
          acao: () => {
            fechar(false);
            setAnotacoes(true);
          },
        },
        { chave: "whatsapp", rotulo: "WhatsApp", icone: MessageCircle, href: zap, externo: true, motivo: esperando ? "carregando..." : "sem WhatsApp no cadastro" },
        { chave: "waze", rotulo: "Waze", icone: Navigation, href: waze, externo: true, motivo: esperando ? "carregando..." : "sem endereço no cadastro" },
      ],
    },
    ...(somenteLeitura
      ? []
      : [
          {
            titulo: "Agendar",
            itens: [
              { chave: "agendar", rotulo: "Agendar sem disparos", icone: CalendarPlus, href: linkAgendarCliente(clienteId) },
              { chave: "locacao", rotulo: "Nova locação", icone: PlusCircle, href: linkNovaLocacaoCliente(clienteId) },
            ],
          },
        ]),
    {
      titulo: "Da cliente",
      itens: [
        { chave: "tarefas", rotulo: "Tarefas", icone: ListTodo, href: linkTarefasCliente(clienteId) },
        { chave: "lancamentos", rotulo: "Lançamentos", icone: Wallet, href: linkLancamentosCliente(clienteId) },
        { chave: "locacoes", rotulo: "Locações", icone: Package, href: linkLocacoesCliente(clienteId) },
        { chave: "planejamentos", rotulo: "Planejamentos", icone: ClipboardList, href: linkPlanejamentosCliente(clienteId) },
      ],
    },
    ...(somenteLeitura
      ? []
      : [{ titulo: "Planejamento", itens: [{ chave: "novo-plano", rotulo: "Novo planejamento", icone: FilePlus2, href: linkNovoPlanejamento(clienteId, eventoId ?? null) }] }]),
  ];

  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  const conteudoItem = (it: Item) => (
    <>
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <it.icone size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold leading-tight text-neutral-800 ${celular ? "text-[13px]" : "truncate text-[14px]"}`}>{it.rotulo}</span>
        {!it.href && it.motivo && <span className="block truncate text-[11px] text-neutral-400">{it.motivo}</span>}
      </span>
    </>
  );
  const classeItem =
    "flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none transition hover:bg-neutral-50 focus-visible:bg-teal-50 focus-visible:ring-2 focus-visible:ring-brand-teal";

  const lista = (
    <div className={celular ? "grid grid-cols-2 gap-x-2 gap-y-3" : "space-y-2"}>
      {grupos.map((g) => (
        <div key={g.titulo} role="group" aria-label={g.titulo} className={celular ? "col-span-2" : ""}>
          <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{g.titulo}</p>
          <div className={celular ? "grid grid-cols-2 gap-1" : "space-y-0.5"}>
            {g.itens.map((it) =>
              it.acao ? (
                <button key={it.chave} type="button" role="menuitem" onClick={it.acao} className={classeItem}>
                  {conteudoItem(it)}
                </button>
              ) : !it.href ? (
                <span key={it.chave} role="menuitem" aria-disabled="true" tabIndex={-1} className={`${classeItem} cursor-not-allowed opacity-50`}>
                  {conteudoItem(it)}
                </span>
              ) : it.externo ? (
                <a key={it.chave} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => fechar(false)} className={classeItem}>
                  {conteudoItem(it)}
                </a>
              ) : (
                <Link key={it.chave} role="menuitem" href={it.href} onClick={() => fechar(false)} className={classeItem}>
                  {conteudoItem(it)}
                </Link>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const titulo = dados.nome || nome || "Cliente";

  return (
    <span className={`inline-flex ${className}`} onClick={parar} onPointerDown={parar} onMouseDown={parar} onTouchStart={parar} onKeyDown={parar}>
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        aria-label={`Atalhos de ${titulo}`}
        title="Atalhos"
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            abrir();
          }
        }}
        className={`inline-flex h-10 items-center justify-center gap-1 rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${comTexto ? "px-3 text-xs font-bold" : "w-10"} ${aberto ? "bg-neutral-100 text-neutral-800" : ""}`}
      >
        <MoreVertical size={18} />
        {comTexto && <span>Atalhos</span>}
      </button>
      {aberto &&
        createPortal(
          celular ? (
            <div className="fixed inset-0 z-[90] flex items-end bg-neutral-900/40 backdrop-blur-[2px]" onClick={(e) => (e.stopPropagation(), fechar())} onPointerDown={parar} onKeyDown={teclado}>
              <div
                ref={menu}
                id={idMenu}
                role="menu"
                aria-label={`Atalhos de ${titulo}`}
                onClick={parar}
                className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl animate-[subir_.22s_ease-out]"
              >
                <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-neutral-200" />
                <div className="mb-3 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-base font-bold text-neutral-900">{titulo}</p>
                  <button type="button" onClick={() => fechar()} className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-500" aria-label="Fechar atalhos">
                    <X size={16} />
                  </button>
                </div>
                {lista}
              </div>
            </div>
          ) : (
            <div
              ref={menu}
              id={idMenu}
              role="menu"
              aria-label={`Atalhos de ${titulo}`}
              onClick={parar}
              onPointerDown={parar}
              onKeyDown={teclado}
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: LARGURA, maxHeight: "min(560px, calc(100dvh - 16px))" }}
              className="fixed z-[90] overflow-y-auto rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-neutral-200 animate-[aparecer_.15s_ease-out]"
            >
              <p className="truncate px-2 pb-1.5 pt-1 text-xs font-bold text-neutral-500">{titulo}</p>
              {lista}
            </div>
          ),
          document.body
        )}
      {anotacoes && <AnotacoesCliente clienteId={clienteId} nome={dados.nome || nome} onClose={() => setAnotacoes(false)} />}
    </span>
  );
}
