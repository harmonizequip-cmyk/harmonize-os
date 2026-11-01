"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { usePreferencias } from "@/lib/usar-preferencias";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { CHAVE_PLANO_IA, linkCliente, linkEvento, linkNovoPlanejamento } from "@/lib/atalhos";
import { temConteudo, type EstadoPlanejador, type PlanejamentoMontado } from "@/lib/planejamento";
import {
  MAX_SESSOES,
  alertas,
  areasPreenchidas,
  fecharSessao,
  linhaVazia,
  mascaraReais,
  normalizarPlano,
  paraEstado,
  reabrirSessaoAnterior,
  situacaoSaldo,
  textoResumo,
  todasAreas,
  totalArea,
  totalDaSessao,
  totalDistribuido,
  usadoEmAnteriores,
  type Area,
  type Linha,
  type Plano,
} from "@/lib/planejador";
import { htmlFichaPaciente, htmlProntuario, imprimir, imprimirDepois } from "@/lib/planejador-impressao";
import { ativas, escolhaAutomatica, faltaSql, profissionaisDaCliente, profissionalDoPlano, problemaProfissional, rotuloProfissional, type Profissional } from "@/lib/profissionais";
import { assinaturasDaSessao, hashDoResumo, resumoDaSessao } from "@/lib/assinatura-sessao";
import { paraImpressao, prepararLimpezaAssinaturas, useAssinaturasSessao } from "@/lib/assinaturas-envio";
import AssinaturasSessoes from "@/components/planejador/AssinaturasSessoes";
import SeletorPlanejamento from "@/components/SeletorPlanejamento";
import ConfirmarApagarModal from "@/components/ConfirmarApagarModal";
import { CartaoArea, Folha, FolhaModelo, FolhaNovaArea, fmt } from "@/components/planejador/Partes";
import ResumoPlano from "@/components/planejador/ResumoPlano";
import BotaoOrientacoes from "@/components/planejador/BotaoOrientacoes";
import { mensagemOrientacoesPos } from "@/lib/orientacoes-pos";
import { AVISO_GERAL_APLICACAO } from "@/lib/zonas-risco";
import { hojeLocal } from "@/lib/period";
import CustoDisparos from "@/components/planejador/CustoDisparos";
import { aplicarQuantidades } from "@/lib/custo-disparos";
import { buildWhatsAppLink, formatDate } from "@/lib/format";
import { pacienteDeMesmoNome, sugerirPacientes, type PacienteCadastro } from "@/lib/pacientes";
import { chaveRascunho, decidirRascunho, impressao, lerRascunho, proximaEspera, type Rascunho } from "@/lib/rascunho-planejamento";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCopy,
  Copy,
  FileText,
  Calculator,
  ListChecks,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  UserRound,
  CalendarDays,
  CloudOff,
  PenLine,
  MessageCircle,
  ShieldAlert,
} from "lucide-react";
import { confirmar } from "@/components/Dialogos";
import { CircleCheck } from "lucide-react";

type Cliente = ClientOption & { profissional: string };
type Evento = { id: string; date_start: string; event_type: string };
type Aba = "paciente" | "areas" | "resumo";

const EQUIP: Record<string, string> = { hipro_1: "HIPRO 1", hipro_2: "HIPRO 2" };

// Planejador HIPRO nativo, em tela cheia (cobre o menu do app): topo com
// paciente, cliente e saldo; abas Paciente, Áreas e Resumo. Guarda sozinho
// no banco (com intervalo); planejamento novo só vira registro quando ganha
// conteúdo. O estado salvo é o mesmo do planejador antigo.
//
// Salvamento resiliente (sinal fraco na clínica, Android que mata a aba em
// segundo plano): cada mudança vai na hora para um rascunho no celular
// (localStorage, `lib/rascunho-planejamento.ts`), apagado só quando o banco
// confirma aquele estado; salva ao esconder a tela (troca de app, tela
// bloqueada), repete sozinho quando falha (2 s, 5 s, 10 s, 20 s e depois a
// cada 30 s), ao voltar a rede e ao voltar para a tela; ao abrir, recupera o
// rascunho que não chegou ao banco.
const DEBOUNCE_MS = 600;
/** Sem resposta do banco neste prazo, a tentativa conta como falha (e repete). */
const PRAZO_SALVAR_MS = 25000;
/** Salvando há mais que isto: a faixa "Salvando..." aparece. */
const LENTO_MS = 3000;

function comPrazo(ms: number): AbortSignal | undefined {
  try {
    return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
  } catch {
    return undefined;
  }
}

export default function EditorPlanejamento({
  planoId,
  estado,
  updatedAt,
  clienteId,
  eventoId,
  clientes,
  portal,
}: {
  /** Login da cliente (/portal): sem escolha de cliente/atendimento, sem IA. */
  portal?: boolean;
  planoId: string | null;
  estado: EstadoPlanejador;
  /** updated_at do plano no banco quando a página carregou (para decidir o rascunho). */
  updatedAt?: string | null;
  clienteId: string | null;
  eventoId: string | null;
  clientes: Cliente[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const preferencias = usePreferencias();
  const perfisSalvos = preferencias.planejador.perfis;
  // "Nenhum" sempre primeiro; o valor do botão é o número de disparos como texto.
  const perfisTela = useMemo(
    () => [{ valor: "0", nome: "Nenhum", disparos: 0 }, ...perfisSalvos.map((p) => ({ valor: String(p.disparos), nome: p.nome, disparos: p.disparos }))],
    [perfisSalvos]
  );
  const base = portal ? "/portal" : "/planejador";
  const [id, setId] = useState<string | null>(planoId);
  const [cliente, setCliente] = useState(clienteId ?? "");
  const [evento, setEvento] = useState(eventoId ?? "");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">(planoId ? "salvo" : "");
  const [plano, setPlano] = useState<Plano>(() => normalizarPlano(estado));
  const [aba, setAba] = useState<Aba>(() => (planoId && totalDistribuido(normalizarPlano(estado)) > 0 ? "areas" : "paciente"));
  const [abertas, setAbertas] = useState<Set<string>>(() => {
    const p = normalizarPlano(estado);
    return new Set(todasAreas(p).filter((a) => totalArea(p, a) > 0).map((a) => a.id));
  });
  const [soPreenchidas, setSoPreenchidas] = useState(false);
  const [modelo, setModelo] = useState<Area | null>(null);
  const [novaArea, setNovaArea] = useState(false);
  const [seletor, setSeletor] = useState(false);
  const [custos, setCustos] = useState(false);
  // Planejamento novo sempre pergunta quantas sessões o paciente vai fazer (planos que já existem, nunca).
  const [perguntarSessoes, setPerguntarSessoes] = useState(() => !planoId && estado.sessoesTotal === undefined && !somenteLeitura);
  const [maisSessoes, setMaisSessoes] = useState<number | null>(null);
  const [stepperSessoes, setStepperSessoes] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [digitando, setDigitando] = useState(false);
  // Cadastros de paciente da cliente (sugestões do campo "Nome do paciente").
  const [cadastros, setCadastros] = useState<PacienteCadastro[]>([]);
  const [sugerindo, setSugerindo] = useState(false);
  // Profissionais da clínica (null = sem cliente ou sem o SQL: campo de texto livre).
  const [profissionais, setProfissionais] = useState<Profissional[] | null>(null);
  const [novaProf, setNovaProf] = useState<{ nome: string; registro: string } | null>(null);
  const [salvandoProf, setSalvandoProf] = useState(false);
  // Uma profissional ativa só: escolhe sozinho no plano novo ("inicial") ou depois de trocar a cliente ("troca").
  const autoEscolher = useRef<"inicial" | "troca" | null>(planoId ? null : "inicial");
  const rolagem = useRef<HTMLDivElement>(null);
  // Assinaturas da sessão: só o dono (nunca no portal nem na visualização).
  const assinaturas = useAssinaturasSessao(id ? [id] : [], !portal && !somenteLeitura);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repetir = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tentativas = useRef(0);
  const montado = useRef(true);
  const idRef = useRef(id);
  const planoRef = useRef(plano);
  const sujo = useRef(false);
  // Desde quando há mudança ainda não mandada (para não esperar o intervalo para sempre enquanto digita).
  const sujoDesde = useRef<number | null>(null);
  const emAndamento = useRef<Promise<void> | null>(null);
  const ligacao = useRef({ cliente, evento });
  // Rascunho no celular: chave, número da mudança e impressão do estado do banco sobre o qual ele foi feito.
  const chaveRef = useRef(chaveRascunho(planoId, clienteId, eventoId));
  const versao = useRef(0);
  const baseRef = useRef<string | null>(planoId ? impressao(estado) : null);
  const [falhou, setFalhou] = useState(false);
  const [lento, setLento] = useState(false);
  const [semRede, setSemRede] = useState(false);
  const [rascunhoOk, setRascunhoOk] = useState(true);
  idRef.current = id;
  ligacao.current = { cliente, evento };

  // Tela cheia: a página de trás não rola.
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = antes;
    };
  }, []);

  // Teclado aberto: esconde a barra de baixo para não cobrir o campo.
  useEffect(() => {
    const ehCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    const entrou = (e: FocusEvent) => ehCampo(e.target) && setDigitando(true);
    const saiu = (e: FocusEvent) => ehCampo(e.target) && setDigitando(false);
    document.addEventListener("focusin", entrou);
    document.addEventListener("focusout", saiu);
    return () => {
      document.removeEventListener("focusin", entrou);
      document.removeEventListener("focusout", saiu);
    };
  }, []);

  const mostrarAviso = useCallback((t: string, ms = 2600) => {
    setAviso(t);
    setTimeout(() => setAviso((a) => (a === t ? null : a)), ms);
  }, []);

  // Guarda o estado atual no celular (a cada mudança e antes de sair).
  const gravarRascunho = useCallback(() => {
    if (somenteLeitura) return;
    try {
      const r: Rascunho = {
        v: 1,
        estado: paraEstado(planoRef.current),
        cliente: ligacao.current.cliente,
        evento: ligacao.current.evento,
        versao: versao.current,
        em: Date.now(),
        base: baseRef.current,
      };
      localStorage.setItem(chaveRef.current, JSON.stringify(r));
      setRascunhoOk(true);
    } catch {
      setRascunhoOk(false);
    }
  }, [somenteLeitura]);

  const apagarRascunho = useCallback((chave?: string) => {
    try {
      localStorage.removeItem(chave ?? chaveRef.current);
    } catch {
      // sem armazenamento: nada a apagar
    }
  }, []);

  // Uma ida ao banco. "ok" quando gravou (o laço de `salvar` repete se ficou
  // sujo enquanto isso), "nada" quando não há o que gravar, "erro" quando falhou.
  const salvarUmaVez = useCallback(async (): Promise<"ok" | "nada" | "erro"> => {
    if (!sujo.current || somenteLeitura) return "nada";
    const p = planoRef.current;
    const total = totalDistribuido(p) + usadoEmAnteriores(p);
    const est = paraEstado(p);
    if (!idRef.current && !temConteudo(est, total)) return "nada";
    const versaoEnviada = versao.current;
    sujo.current = false;
    sujoDesde.current = null;
    setStatus("salvando");
    const relogioLento = setTimeout(() => setLento(true), LENTO_MS);
    let data: unknown = null;
    let falha = false;
    try {
      let consulta = supabase.rpc("salvar_planejamento", {
        p_id: idRef.current,
        p_client_id: ligacao.current.cliente || null,
        p_calendar_event_id: ligacao.current.evento || null,
        p_estado: est,
        p_total: total,
      });
      const sinal = comPrazo(PRAZO_SALVAR_MS);
      if (sinal) consulta = consulta.abortSignal(sinal);
      const r = await consulta;
      data = r.data;
      falha = !!r.error;
    } catch {
      falha = true;
    } finally {
      clearTimeout(relogioLento);
      setLento(false);
    }
    if (falha) {
      sujo.current = true;
      sujoDesde.current ??= Date.now();
      setStatus("erro");
      setFalhou(true);
      return "erro";
    }
    if (!idRef.current && data) {
      const novoId = data as string;
      idRef.current = novoId;
      setId(novoId);
      window.history.replaceState(null, "", `${base}/${novoId}`);
      // O rascunho passa a ser do plano salvo (o "novo" daquela cliente fica livre).
      const antiga = chaveRef.current;
      chaveRef.current = chaveRascunho(novoId);
      apagarRascunho(antiga);
    }
    // O banco agora tem `est` (fora o paciente, que ele ajusta e a impressão ignora).
    baseRef.current = impressao(est);
    if (versao.current === versaoEnviada && !sujo.current) apagarRascunho();
    else gravarRascunho();
    setStatus("salvo");
    setFalhou(false);
    tentativas.current = 0;
    return "ok";
  }, [supabase, somenteLeitura, base, apagarRascunho, gravarRascunho]);

  // Salvamentos em fila, um de cada vez: enquanto o primeiro de um plano novo
  // roda, o id ainda não existe e um segundo em paralelo criaria outro registro.
  // Quem chama durante um salvamento espera o mesmo; se mudou algo nesse meio
  // tempo, ele grava de novo com o estado mais recente ao terminar. Se falhar,
  // tenta de novo sozinho com espera crescente enquanto houver mudança.
  const salvarRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const salvar = useCallback((): Promise<void> => {
    if (emAndamento.current) return emAndamento.current;
    if (repetir.current) {
      clearTimeout(repetir.current);
      repetir.current = null;
    }
    const rodada = (async () => {
      let r: "ok" | "nada" | "erro" = "nada";
      try {
        while (sujo.current && (r = await salvarUmaVez()) === "ok") {
          // repete enquanto houver mudança nova
        }
      } finally {
        emAndamento.current = null;
      }
      if (r === "erro" && sujo.current && montado.current) {
        const ms = proximaEspera(tentativas.current++);
        repetir.current = setTimeout(() => {
          repetir.current = null;
          void salvarRef.current();
        }, ms);
      }
    })();
    emAndamento.current = rodada;
    return rodada;
  }, [salvarUmaVez]);
  salvarRef.current = salvar;

  const agendar = useCallback(() => {
    if (somenteLeitura) return;
    sujo.current = true;
    sujoDesde.current ??= Date.now();
    versao.current += 1;
    gravarRascunho();
    if (timer.current) clearTimeout(timer.current);
    // Digitando sem parar: no máximo a cada 3 s vai ao banco, sem esperar a pausa.
    const espera = Date.now() - (sujoDesde.current ?? Date.now()) > LENTO_MS ? 0 : DEBOUNCE_MS;
    timer.current = setTimeout(() => {
      timer.current = null;
      void salvar();
    }, espera);
  }, [salvar, gravarRascunho, somenteLeitura]);

  const mudar = useCallback(
    (fn: (p: Plano) => Plano) => {
      if (somenteLeitura) return;
      // Calcula já (e não no setState) para o rascunho guardar o estado novo na hora.
      const novo = fn(planoRef.current);
      planoRef.current = novo;
      setPlano(novo);
      agendar();
    },
    [agendar, somenteLeitura]
  );

  const campo = <K extends keyof Plano>(k: K, v: Plano[K]) => mudar((p) => ({ ...p, [k]: v }));

  // "Editar" na lista abre direto nos dados do paciente (?aba=paciente).
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("aba");
    if (a === "paciente" || a === "areas" || a === "resumo") setAba(a);
  }, []);

  // Vindo do assistente ou do "Duplicar" (?ia=1): o plano montado entra por cima.
  useEffect(() => {
    try {
      if (!planoId && new URLSearchParams(window.location.search).get("ia") === "1") {
        const daIa = JSON.parse(sessionStorage.getItem(CHAVE_PLANO_IA) ?? "null") as EstadoPlanejador | null;
        sessionStorage.removeItem(CHAVE_PLANO_IA);
        if (daIa) {
          const novo = normalizarPlano({ ...estado, ...daIa, profissional: (daIa.profissional as string) || estado.profissional });
          setPlano(novo);
          planoRef.current = novo;
          setAbertas(new Set(todasAreas(novo).filter((a) => totalArea(novo, a) > 0).map((a) => a.id)));
          setAba("areas");
          agendar();
        }
      }
    } catch {
      // sessão indisponível: segue com o estado inicial
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao abrir: recupera o rascunho que não chegou ao banco e, sem ele, confere
  // se o banco tem versão mais nova que a da página (voltar pelo histórico do
  // aparelho reaproveita a página guardada pelo Next, que pode estar velha).
  const abriu = useRef(false);
  useEffect(() => {
    if (abriu.current || somenteLeitura) return;
    abriu.current = true;
    const veioDaIa = !planoId && new URLSearchParams(window.location.search).get("ia") === "1";
    let texto: string | null = null;
    try {
      texto = localStorage.getItem(chaveRef.current);
    } catch {
      setRascunhoOk(false);
    }
    const r = lerRascunho(texto);
    const decisao = veioDaIa ? "nada" : decidirRascunho({ rascunho: r, novo: !planoId, servidorEstado: estado, servidorUpdatedAt: updatedAt ?? null, agora: Date.now() });

    const aplicar = (rr: Rascunho) => {
      const novo = normalizarPlano(rr.estado);
      planoRef.current = novo;
      setPlano(novo);
      if (!portal) {
        setCliente(rr.cliente);
        setEvento(rr.evento);
        ligacao.current = { cliente: rr.cliente, evento: rr.evento };
      }
      setAbertas(new Set(todasAreas(novo).filter((a) => totalArea(novo, a) > 0).map((a) => a.id)));
      if (rr.estado.sessoesTotal !== undefined) setPerguntarSessoes(false);
      if (totalDistribuido(novo) > 0) setAba("areas");
      agendar();
    };

    if (decisao === "restaurar" && r) {
      aplicar(r);
      mostrarAviso("Recuperamos o que não tinha sido salvo.", 5000);
      return;
    }
    if (decisao === "descartar") apagarRascunho();
    if (decisao === "perguntar" && r) {
      const quem = typeof r.estado.paciente === "string" && r.estado.paciente.trim() ? ` de ${r.estado.paciente.trim()}` : "";
      const quando = new Date(r.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      // Espera o DialogosHost (montado no layout) ligar: os efeitos dos filhos rodam antes.
      setTimeout(() => {
        void confirmar({
          titulo: "Continuar de onde parou?",
          texto: `Ficou guardado no celular um planejamento novo${quem} que não chegou a ser salvo (${quando}).`,
          confirmar: "Continuar",
          cancelar: "Começar do zero",
        }).then((ok) => {
          if (ok && versao.current === 0) aplicar(r);
          else if (!ok) apagarRascunho();
        });
      }, 60);
      return;
    }
    if (!planoId) return;
    const v0 = versao.current;
    let q = supabase.from("planejamentos").select("estado, client_id, calendar_event_id").eq("id", planoId);
    const sinal = comPrazo(15000);
    if (sinal) q = q.abortSignal(sinal);
    q.maybeSingle().then(
      ({ data }) => {
        if (!data || versao.current !== v0 || sujo.current) return;
        const atual = (data.estado ?? {}) as EstadoPlanejador;
        if (impressao(atual) === impressao(estado)) return;
        const novo = normalizarPlano(atual);
        planoRef.current = novo;
        setPlano(novo);
        baseRef.current = impressao(atual);
        if (!portal) {
          setCliente(data.client_id ?? "");
          setEvento(data.calendar_event_id ?? "");
          ligacao.current = { cliente: data.client_id ?? "", evento: data.calendar_event_id ?? "" };
        }
        setAbertas(new Set(todasAreas(novo).filter((a) => totalArea(novo, a) > 0).map((a) => a.id)));
        mostrarAviso("Atualizado com a última versão salva.");
      },
      () => {
        // sem sinal: segue com o que a página trouxe
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salva na hora quando a tela some (troca de app, tela bloqueada: no Android
  // o sistema pode matar a aba em segundo plano) e ao sair; volta a tentar ao
  // voltar a rede ou a tela.
  useEffect(() => {
    montado.current = true;
    const agora = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (sujo.current) {
        gravarRascunho();
        void salvar();
      }
    };
    const visibilidade = () => {
      if (document.visibilityState === "hidden") agora();
      else if (sujo.current) {
        tentativas.current = 0;
        void salvar();
      }
    };
    const voltouRede = () => {
      setSemRede(false);
      if (sujo.current) {
        tentativas.current = 0;
        void salvar();
      }
    };
    const caiuRede = () => setSemRede(true);
    setSemRede(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("pagehide", agora);
    document.addEventListener("visibilitychange", visibilidade);
    window.addEventListener("online", voltouRede);
    window.addEventListener("offline", caiuRede);
    return () => {
      window.removeEventListener("pagehide", agora);
      document.removeEventListener("visibilitychange", visibilidade);
      window.removeEventListener("online", voltouRede);
      window.removeEventListener("offline", caiuRede);
      montado.current = false;
      if (repetir.current) {
        clearTimeout(repetir.current);
        repetir.current = null;
      }
      agora();
    };
  }, [salvar, gravarRascunho]);

  // Antes de sair pelos botões do editor: tenta salvar (até 8 s) e, se não
  // deu, avisa que está guardado no celular.
  const precisaSalvar = () => !somenteLeitura && (sujo.current || !!emAndamento.current || !!timer.current);
  async function antesDeSair(): Promise<boolean> {
    if (!precisaSalvar()) return true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    tentativas.current = 0;
    await Promise.race([salvar(), new Promise((ok) => setTimeout(ok, 8000))]);
    const p = planoRef.current;
    if (!idRef.current && !temConteudo(paraEstado(p), totalDistribuido(p) + usadoEmAnteriores(p))) return true;
    if (!sujo.current && !emAndamento.current) return true;
    gravarRascunho();
    let guardado = true;
    try {
      guardado = !!localStorage.getItem(chaveRef.current);
    } catch {
      guardado = false;
    }
    return confirmar({
      titulo: "Ainda não salvou no sistema",
      texto: guardado
        ? "Mas está guardado no celular: ao abrir este planejamento de novo, ele volta e é salvo. Sair mesmo assim?"
        : "E não deu para guardar no celular. Se sair agora, o que mudou pode se perder. Sair mesmo assim?",
      confirmar: "Sair mesmo assim",
      cancelar: "Ficar",
      perigo: !guardado,
    });
  }
  // Para os links internos do editor: sem nada pendente, o Link segue normal.
  const aoSair = (href: string) => (e: React.MouseEvent) => {
    if (!precisaSalvar() || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    void antesDeSair().then((ok) => ok && router.push(href));
  };

  // Atendimentos HIPRO da cliente (60 dias para trás e para frente).
  useEffect(() => {
    let ativo = true;
    if (!cliente || portal) {
      setEventos([]);
      return;
    }
    const hoje = new Date();
    const de = new Date(hoje.getTime() - 60 * 86400000).toISOString().slice(0, 10);
    const ate = new Date(hoje.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("calendar_events")
      .select("id, date_start, event_type")
      .eq("client_id", cliente)
      .in("event_type", ["hipro_1", "hipro_2"])
      .neq("status", "cancelada")
      .gte("date_start", de)
      .lte("date_start", ate)
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (ativo) setEventos((data ?? []) as Evento[]);
      });
    return () => {
      ativo = false;
    };
  }, [cliente, supabase, portal]);

  useEffect(() => {
    let ativo = true;
    let q = supabase.from("pacientes").select("id, client_id, nome, whatsapp, nascimento, observacoes").order("nome").limit(2000);
    if (!portal) q = cliente ? q.eq("client_id", cliente) : q.is("client_id", null);
    q.then(({ data, error }) => {
      if (ativo) setCadastros(error ? [] : ((data ?? []) as PacienteCadastro[]));
    });
    return () => {
      ativo = false;
    };
  }, [cliente, supabase, portal]);

  // Profissionais da clínica ligada (no portal, a RLS só devolve as dela).
  const clienteDasProfissionais = portal ? clienteId ?? "" : cliente;
  useEffect(() => {
    let ativo = true;
    if (!clienteDasProfissionais) {
      setProfissionais(null);
      return;
    }
    supabase
      .from("profissionais")
      .select("id, client_id, nome, registro, ativo")
      .eq("client_id", clienteDasProfissionais)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          // Sem o SQL (ou sem acesso): continua o campo de texto.
          setProfissionais(null);
          if (!faltaSql(error)) console.warn("profissionais:", error.message);
          return;
        }
        const lista = profissionaisDaCliente((data ?? []) as Profissional[], clienteDasProfissionais);
        setProfissionais(lista);
        const modo = autoEscolher.current;
        autoEscolher.current = null;
        if (!modo || somenteLeitura) return;
        const nomePadrao = portal ? estado.profissional : clientes.find((c) => c.id === clienteDasProfissionais)?.profissional;
        const uma = escolhaAutomatica(lista, planoRef.current, (nomePadrao as string | undefined) ?? null);
        if (!uma) return;
        const ajuste = (p: Plano): Plano => ({ ...p, profissional: uma.nome, profissionalId: uma.id, profissionalRegistro: uma.registro ?? "" });
        if (modo === "troca") mudar(ajuste);
        else {
          // Plano novo: só ajusta a tela (sem contar como mudança); vai junto no primeiro salvamento.
          planoRef.current = ajuste(planoRef.current);
          setPlano(planoRef.current);
        }
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteDasProfissionais, supabase, portal]);

  function escolherProfissional(valor: string) {
    if (valor === "__nova") {
      setNovaProf({ nome: "", registro: "" });
      return;
    }
    if (valor === "__texto") return;
    const p = profissionais?.find((x) => x.id === valor);
    if (!valor) mudar((pl) => ({ ...pl, profissional: "", profissionalId: "", profissionalRegistro: "" }));
    else if (p) mudar((pl) => ({ ...pl, profissional: p.nome, profissionalId: p.id, profissionalRegistro: p.registro ?? "" }));
  }

  async function criarProfissional() {
    if (!novaProf || !clienteDasProfissionais) return;
    const problema = problemaProfissional(novaProf);
    if (problema) return mostrarAviso(problema);
    setSalvandoProf(true);
    const { data, error } = await supabase.rpc("salvar_profissional", {
      p_id: null,
      p_client_id: clienteDasProfissionais,
      p_nome: novaProf.nome,
      p_registro: novaProf.registro || null,
      p_ativo: true,
    });
    setSalvandoProf(false);
    if (error || !data) return mostrarAviso(error?.message || "Não consegui cadastrar. Confira a internet.", 4000);
    const nome = novaProf.nome.replace(/\s+/g, " ").trim();
    const registro = novaProf.registro.trim();
    const nova: Profissional = { id: data as string, client_id: clienteDasProfissionais, nome, registro: registro || null, ativo: true };
    setProfissionais((l) => profissionaisDaCliente([...(l ?? []).filter((x) => x.id !== nova.id), nova], clienteDasProfissionais));
    mudar((pl) => ({ ...pl, profissional: nome, profissionalId: nova.id, profissionalRegistro: registro }));
    setNovaProf(null);
    mostrarAviso("Profissional cadastrada.");
  }

  function mudarLigacao(novoCliente: string, novoEvento: string) {
    if (novoCliente !== ligacao.current.cliente && planoRef.current.pacienteId) {
      planoRef.current = { ...planoRef.current, pacienteId: "" };
      setPlano(planoRef.current);
    }
    if (novoCliente !== ligacao.current.cliente) {
      // A profissional escolhida era da outra clínica: volta ao nome da cliente nova.
      if (planoRef.current.profissionalId) {
        planoRef.current = { ...planoRef.current, profissional: "", profissionalId: "", profissionalRegistro: "" };
        setPlano(planoRef.current);
      }
      autoEscolher.current = "troca";
    }
    setCliente(novoCliente);
    setEvento(novoEvento);
    ligacao.current = { cliente: novoCliente, evento: novoEvento };
    const prof = clientes.find((c) => c.id === novoCliente)?.profissional;
    if (prof && !planoRef.current.profissional.trim()) campo("profissional", prof);
    else agendar();
  }

  // "Montar pelas regras": troca áreas e disparos, mantém paciente, datas e anotações.
  async function aplicarSeletor(m: PlanejamentoMontado) {
    if (
      totalDistribuido(plano) > 0 &&
      !(await confirmar({ titulo: "Trocar as áreas e disparos?", texto: "O que está neste planejamento é trocado pelo que foi montado.", confirmar: "Trocar" }))
    )
      return false;
    // Com várias sessões o saldo do pacote não é trocado pelo saldo da sessão que o seletor usou.
    const saldoPacote = plano.sessoesTotal > 1 ? String(Math.max(Number(plano.saldoTotal) || 0, usadoEmAnteriores(plano) + m.total)) : m.estado.saldoTotal;
    const montado = normalizarPlano({ ...paraEstado(plano), DATA: m.estado.DATA, customAreas: m.estado.customAreas, customSeq: m.estado.customSeq, saldoTotal: saldoPacote, procNome: m.estado.procNome, ...(m.estado.queixa ? { queixa: m.estado.queixa } : {}) });
    mudar(() => montado);
    setAbertas(new Set(todasAreas(montado).filter((a) => totalArea(montado, a) > 0).map((a) => a.id)));
    setSeletor(false);
    irPara("areas");
    mostrarAviso("Planejamento montado pelas regras.");
  }

  // "Tentar agora" da faixa: salva já, recomeçando a espera das repetições.
  async function guardarAgora() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    tentativas.current = 0;
    await salvar();
  }

  async function novo() {
    setMenu(false);
    if (!(await antesDeSair())) return;
    window.location.href = portal ? "/portal/novo" : linkNovoPlanejamento(cliente || null, evento || null);
  }

  // Mesmo plano para outro paciente: copia áreas, saldo e procedimento; zera paciente e "feito".
  async function duplicar() {
    setMenu(false);
    if (!(await antesDeSair())) return;
    const est = paraEstado(plano);
    const DATA = Object.fromEntries(Object.entries(plano.DATA).map(([k, ls]) => [k, ls.map(({ feito: _f, ...l }) => l)]));
    try {
      sessionStorage.setItem(CHAVE_PLANO_IA, JSON.stringify({ ...est, paciente: "", pacienteId: "", dataRetorno: "", obs: "", DATA, sessaoAtual: 1, sessoesAnteriores: [] }));
    } catch {
      return mostrarAviso("Não consegui duplicar neste aparelho.");
    }
    const destino = portal ? "/portal/novo" : linkNovoPlanejamento(cliente || null, evento || null);
    window.location.href = `${destino}${destino.includes("?") ? "&" : "?"}ia=1`;
  }

  async function excluir() {
    setMenu(false);
    // Primeiro salvamento ainda rodando: espera, senão o registro nasce depois de "apagado".
    if (emAndamento.current) await emAndamento.current;
    if (!idRef.current) {
      sujo.current = false;
      if (timer.current) clearTimeout(timer.current);
      apagarRascunho();
      router.push(base);
      return;
    }
    setConfirmarApagar(true);
  }

  async function apagarDeVez(): Promise<string | null> {
    if (timer.current) clearTimeout(timer.current);
    sujo.current = false;
    if (emAndamento.current) await emAndamento.current;
    const limpar = !portal && idRef.current ? await prepararLimpezaAssinaturas(supabase, [idRef.current]) : null;
    const { error } = await supabase.rpc("excluir_planejamento", { p_id: idRef.current });
    if (error) return error.message || "Não consegui apagar. Confira a internet.";
    await limpar?.().catch(() => {});
    apagarRascunho();
    router.push(base);
    router.refresh();
    return null;
  }

  function irPara(a: Aba) {
    setAba(a);
    rolagem.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function irParaArea(areaId: string) {
    setSoPreenchidas(false);
    setAbertas((s) => new Set(s).add(areaId));
    setAba("areas");
    setTimeout(() => document.getElementById(`area-${areaId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function criarArea(a: Omit<Area, "id">, prof: string) {
    const seq = plano.customSeq + 1;
    const area: Area = { ...a, id: `custom_${seq}` };
    mudar((p) => ({ ...p, customSeq: seq, customAreas: [...p.customAreas, area], DATA: { ...p.DATA, [area.id]: [linhaVazia(area, prof)] } }));
    setNovaArea(false);
    setAbertas((s) => new Set(s).add(area.id));
    setTimeout(() => document.getElementById(`area-${area.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }

  async function removerArea(a: Area) {
    if (!(await confirmar({ titulo: `Remover a área "${a.nome}"?`, confirmar: "Remover", perigo: true }))) return;
    mudar((p) => {
      const DATA = { ...p.DATA };
      delete DATA[a.id];
      return { ...p, customAreas: p.customAreas.filter((x) => x.id !== a.id), DATA };
    });
  }

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(textoResumo(plano));
      mostrarAviso("Resumo copiado.");
    } catch {
      mostrarAviso("Não consegui copiar neste aparelho.");
    }
  }

  async function compartilharResumo() {
    const texto = textoResumo(plano);
    try {
      if (navigator.share) {
        await navigator.share({ text: texto });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  // Com assinaturas colhidas na sessão, a impressão espera baixar as imagens (a janela abre já no toque).
  function imprimirComAssinaturas(n: number, montar: (a?: Parameters<typeof htmlFichaPaciente>[5]) => string, titulo: string): boolean {
    const daSessao = id && assinaturas.estado === "ok" ? assinaturasDaSessao(assinaturas.lista, id, n) : [];
    if (!daSessao.length) return imprimir(montar(), titulo);
    const atual = plano;
    return imprimirDepois(async () => {
      const r = resumoDaSessao(atual, n);
      const [lista, hashAtual] = await Promise.all([paraImpressao(supabase, daSessao), r ? hashDoResumo(r).catch(() => null) : Promise.resolve(null)]);
      return montar({ lista, hashAtual });
    }, titulo);
  }

  function pdf(tipo: "prontuario" | "paciente") {
    const origem = window.location.origin;
    const nome = plano.paciente || "paciente";
    const ok =
      tipo === "prontuario"
        ? imprimirComAssinaturas(plano.sessaoAtual, (a) => htmlProntuario(plano, origem, new Date(), preferencias, a), `Prontuario - ${nome}`)
        : imprimirComAssinaturas(plano.sessaoAtual, (a) => htmlFichaPaciente(plano, origem, new Date(), undefined, preferencias, a), `Ficha do paciente - ${nome}`);
    mostrarAviso(ok ? "Abrindo para salvar em PDF…" : "O aparelho bloqueou a janela. Permita pop-ups para o Harmonize.");
  }

  function fichaSessao(n: number) {
    const nome = plano.paciente || "paciente";
    const ok = imprimirComAssinaturas(n, (a) => htmlFichaPaciente(plano, window.location.origin, new Date(), n, preferencias, a), `Ficha da Sessão ${n} - ${nome}`);
    mostrarAviso(ok ? "Abrindo a ficha para imprimir…" : "O aparelho bloqueou a janela. Permita pop-ups para o Harmonize.");
  }

  // Antes de colher assinaturas: o planejamento precisa estar salvo no banco.
  async function salvarAntesDeAssinar(): Promise<boolean> {
    if (precisaSalvar()) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      tentativas.current = 0;
      await Promise.race([salvar(), new Promise((ok) => setTimeout(ok, 8000))]);
    }
    if (!idRef.current) {
      mostrarAviso("Preencha o paciente antes de colher as assinaturas.", 4000);
      return false;
    }
    if (sujo.current || emAndamento.current) {
      return confirmar({
        titulo: "Ainda não salvou no sistema",
        texto: "A assinatura vale para o que está na tela agora. Se a internet não voltar, o banco fica com a versão anterior e a sessão aparece como alterada. Continuar?",
        confirmar: "Continuar",
        cancelar: "Esperar",
      });
    }
    return true;
  }

  function irParaAssinaturas() {
    setMenu(false);
    setAba("resumo");
    setTimeout(() => document.getElementById("assinaturas-sessao")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  function definirSessoes(n: number) {
    campo("sessoesTotal", Math.max(plano.sessaoAtual, Math.min(MAX_SESSOES, n)));
  }

  async function concluirSessao() {
    const atual = planoRef.current;
    if (totalDistribuido(atual) <= 0) return mostrarAviso("Distribua os disparos desta sessão antes de concluir.");
    const sobra = Math.max(0, situacaoSaldo(atual).resta);
    const ok = await confirmar({
      titulo: `Concluir a Sessão ${atual.sessaoAtual}?`,
      texto: `Guarda os ${fmt(totalDistribuido(atual))} disparos distribuídos, abre a Sessão ${atual.sessaoAtual + 1} vazia${atual.dataRetorno ? ` na data do retorno (${formatDate(atual.dataRetorno)})` : ""} e deixa ${fmt(sobra)} disparos de saldo para ela.`,
      confirmar: "Concluir sessão",
    });
    if (!ok) return;
    const novo = fecharSessao(planoRef.current);
    if (!novo) return mostrarAviso("Não deu para concluir a sessão.");
    mudar(() => novo);
    setAbertas(new Set());
    setSoPreenchidas(false);
    irPara("areas");
    mostrarAviso(`Sessão ${novo.sessaoAtual} aberta.`);
  }

  async function voltarSessao() {
    const atual = planoRef.current;
    if (!atual.sessoesAnteriores.length) return;
    const anterior = atual.sessoesAnteriores[atual.sessoesAnteriores.length - 1].n;
    if (
      totalDistribuido(atual) > 0 &&
      !(await confirmar({ titulo: `Voltar para a Sessão ${anterior}?`, texto: "O que foi distribuído na sessão aberta agora é descartado.", confirmar: "Voltar", perigo: true }))
    )
      return;
    const novo = reabrirSessaoAnterior(planoRef.current);
    if (!novo) return;
    mudar(() => novo);
    setAbertas(new Set(todasAreas(novo).filter((a) => totalArea(novo, a) > 0).map((a) => a.id)));
    mostrarAviso(`Voltou para a Sessão ${novo.sessaoAtual}.`);
  }

  const s = situacaoSaldo(plano);
  const varias = plano.sessoesTotal > 1;
  // Cadastro do paciente (para o WhatsApp das orientações depois da sessão).
  const cadastroPaciente = plano.pacienteId ? cadastros.find((c) => c.id === plano.pacienteId) : pacienteDeMesmoNome(cadastros, plano.paciente);
  const whatsPaciente = cadastroPaciente?.whatsapp ?? null;
  const naoUltima = plano.sessaoAtual < plano.sessoesTotal;
  const nAreas = areasPreenchidas(plano);
  const nAlertas = alertas(plano).length;
  const nomeCliente = useMemo(() => clientes.find((c) => c.id === cliente)?.name, [clientes, cliente]);
  const profDoPlano = profissionais ? profissionalDoPlano(profissionais, plano) : null;
  const quemAtende = nomeCliente || plano.profissional;
  const areas = todasAreas(plano).filter((a) => !soPreenchidas || totalArea(plano, a) > 0);
  const voltar = portal ? base : cliente ? `/planejador?cliente=${cliente}` : "/planejador";
  const linkIa = `/assistente?${cliente ? `cliente=${cliente}&` : ""}pergunta=${encodeURIComponent(
    `Monta um planejamento: paciente ${plano.paciente}, saldo de ${plano.saldoTotal !== "0" ? plano.saldoTotal : ""} disparos, queixa principal: ${plano.queixa}`
  )}`;
  const usado = s.disponivel > 0 ? Math.min(100, (s.total / s.disponivel) * 100) : s.total > 0 ? 100 : 0;
  // Seletor: com várias sessões sugere dividir o que resta igual entre as sessões que faltam.
  const saldoSeletor = varias
    ? s.disponivel > 0
      ? Math.floor(s.disponivel / (plano.sessoesTotal - plano.sessaoAtual + 1) / 50) * 50 || null
      : null
    : Number(plano.saldoTotal) || null;
  const corBarra = s.estado === "estourado" ? "bg-rose-500" : s.estado === "baixo" ? "bg-amber-400" : "bg-brand-gradient";
  const entrada = "w-full rounded-xl bg-white px-3.5 py-3 text-[15px] text-neutral-900 ring-1 ring-neutral-200 outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-brand-teal disabled:bg-neutral-50";
  const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500";
  const cartao = "rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)] ring-1 ring-neutral-200/80";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#F3F6F7]">
      {/* Topo: volta, paciente e cliente, situação do salvamento, menu. */}
      <header className="relative z-10 bg-white/90 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(16,24,40,.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pb-1 pt-2">
          <Link href={voltar} onClick={aoSair(voltar)} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100" aria-label="Voltar para os planejamentos">
            <ArrowLeft size={20} />
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/harmonize-borboleta.png" alt="" className="h-7 w-7 flex-shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold leading-tight text-neutral-900">{plano.paciente || "Novo planejamento"}</p>
            <p className="truncate text-xs text-neutral-500">
              {quemAtende ? quemAtende : "Planejador HIPRO"}
              {plano.procNome ? ` · ${plano.procNome}` : ""}
            </p>
          </div>
          <span className="flex flex-shrink-0 items-center text-xs text-neutral-500" aria-live="polite">
            {somenteLeitura ? (
              <span className="rounded-full bg-neutral-100 px-2 py-1">Só ver</span>
            ) : falhou ? (
              <CloudOff size={16} className="text-amber-600" aria-label="Não salvo ainda" />
            ) : status === "salvando" ? (
              <Loader2 size={16} className="animate-spin text-neutral-400" />
            ) : status === "salvo" ? (
              <span className="flex items-center gap-1 rounded-full px-1.5 py-1 font-semibold text-emerald-700">
                <Check size={13} /> Salvo
              </span>
            ) : null}
          </span>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100" aria-label="Mais opções">
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-20 w-60 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-neutral-200">
                  {!somenteLeitura && (
                    <>
                      <button onClick={novo} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                        <Plus size={16} /> Novo planejamento
                      </button>
                      <button onClick={duplicar} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                        <Copy size={16} /> Duplicar para outro paciente
                      </button>
                    </>
                  )}
                  <button onClick={() => (setMenu(false), pdf("prontuario"))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                    <FileText size={16} /> PDF do prontuário
                  </button>
                  <button onClick={() => (setMenu(false), pdf("paciente"))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                    <UserRound size={16} /> PDF do paciente
                  </button>
                  {whatsPaciente ? (
                    <a
                      href={buildWhatsAppLink(whatsPaciente, mensagemOrientacoesPos({ paciente: plano.paciente, profissional: plano.profissional, retorno: plano.dataRetorno, hoje: hojeLocal() })) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenu(false)}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50"
                    >
                      <MessageCircle size={16} /> Mandar orientações ao paciente
                    </a>
                  ) : (
                    <button onClick={() => (setMenu(false), irPara("resumo"))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-400 active:bg-neutral-50">
                      <MessageCircle size={16} /> Orientações ao paciente (sem WhatsApp)
                    </button>
                  )}
                  {varias && (
                    <>
                      <button onClick={() => (setMenu(false), fichaSessao(plano.sessaoAtual))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-neutral-800 active:bg-neutral-50">
                        <FileText size={16} /> Ficha para assinar (Sessão {plano.sessaoAtual})
                      </button>
                      {plano.sessoesAnteriores.map((x) => (
                        <button key={x.n} onClick={() => (setMenu(false), fichaSessao(x.n))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                          <FileText size={16} /> Ficha da Sessão {x.n}
                        </button>
                      ))}
                    </>
                  )}
                  {assinaturas.estado !== "sem_permissao" && assinaturas.estado !== "carregando" && (
                    <button onClick={irParaAssinaturas} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                      <PenLine size={16} /> Colher assinaturas (Sessão {plano.sessaoAtual})
                    </button>
                  )}
                  {!somenteLeitura && (
                    <button onClick={excluir} className="flex w-full items-center gap-2.5 border-t border-neutral-100 px-4 py-3 text-left text-sm text-rose-600 active:bg-rose-50">
                      <Trash2 size={16} /> Excluir planejamento
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mudança que ainda não chegou ao banco: faixa bem visível. */}
        {!somenteLeitura && (falhou || lento) && (
          <div className="mx-auto max-w-3xl px-3 pb-2" role="status">
            <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-[13px] font-semibold ring-1 ${falhou ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-sky-50 text-sky-900 ring-sky-200"}`}>
              {falhou ? <CloudOff size={17} className="flex-shrink-0" /> : <Loader2 size={17} className="flex-shrink-0 animate-spin" />}
              <span className="min-w-0 flex-1 leading-snug">
                {semRede
                  ? `Sem internet: ${rascunhoOk ? "guardado no celular, vamos salvar quando voltar" : "não feche esta tela, vamos salvar quando voltar"}.`
                  : falhou
                    ? status === "salvando"
                      ? "Tentando salvar de novo..."
                      : `Não salvou ainda: ${rascunhoOk ? "guardado no celular, tentando de novo" : "não feche esta tela, tentando de novo"}.`
                    : `Salvando... ${rascunhoOk ? "(sinal fraco, já está guardado no celular)" : "(sinal fraco)"}`}
              </span>
              {falhou && status !== "salvando" && !semRede && (
                <button type="button" onClick={guardarAgora} className="flex-shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-300">
                  Tentar agora
                </button>
              )}
            </div>
          </div>
        )}

        {/* Saldo sempre à vista. */}
        <div className="mx-auto max-w-3xl px-4 pb-2.5">
          <button type="button" onClick={() => s.saldo <= 0 && irPara("paciente")} className="block w-full text-left">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                  {s.saldo <= 0 ? "Saldo de disparos" : varias && naoUltima ? `Fica para a sessão ${plano.sessaoAtual + 1}` : "Saldo restante"}
                </p>
                <p className={`text-[28px] font-black leading-none tabular-nums ${s.estado === "estourado" ? "text-rose-600" : s.estado === "baixo" ? "text-amber-600" : "text-neutral-900"}`}>
                  {s.saldo > 0 ? fmt(s.resta) : <span className="text-base font-bold text-brand-teal-dark">Toque para definir</span>}
                </p>
                {varias && s.saldo > 0 && (
                  <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                    Sessão {plano.sessaoAtual} de {plano.sessoesTotal}
                  </p>
                )}
              </div>
              <p className="pb-0.5 text-right text-xs leading-tight text-neutral-500">
                <b className="tabular-nums text-neutral-800">{fmt(s.total)}</b>
                {s.saldo > 0 ? <> de {fmt(s.disponivel)}</> : " distribuídos"}
                <br />
                {nAreas} área{nAreas === 1 ? "" : "s"}
                {nAlertas > 0 && <span className="ml-1 font-semibold text-amber-600">· {nAlertas} alerta{nAlertas > 1 ? "s" : ""}</span>}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200/80">
              <div className={`h-full rounded-full transition-all duration-500 ease-out ${corBarra}`} style={{ width: `${usado}%` }} />
            </div>
          </button>
        </div>

        {/* Abas. */}
        <div className="mx-auto max-w-3xl px-3 pb-2">
          <div className="relative grid grid-cols-3 rounded-2xl bg-neutral-100 p-1">
            <span
              className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: `translateX(${aba === "paciente" ? 0 : aba === "areas" ? 100 : 200}%)` }}
            />
            {(
              [
                ["paciente", "Paciente"],
                ["areas", `Áreas${nAreas ? ` · ${nAreas}` : ""}`],
                ["resumo", "Resumo"],
              ] as [Aba, string][]
            ).map(([k, r]) => (
              <button key={k} onClick={() => irPara(k)} className={`relative z-10 rounded-xl py-2 text-[13px] font-bold transition-colors ${aba === k ? "text-neutral-900" : "text-neutral-500"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[2px] bg-brand-gradient opacity-70" />
      </header>

      <div ref={rolagem} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-3 px-4 pb-32 pt-4">
          {aba === "paciente" && (
            <div key="paciente" className="space-y-3 animate-[aparecer_.25s_ease-out]">
              {!portal && (
                <div className={cartao}>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Cliente e atendimento</p>
                  <div className="space-y-3">
                    <ClientPicker clients={clientes} value={cliente} onChange={(c) => mudarLigacao(c, "")} onClientCreated={() => {}} label="Cliente (profissional)" optional noneLabel="Sem cliente" allowCreate={false} />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-600">Atendimento</label>
                      <select value={evento} onChange={(e) => mudarLigacao(cliente, e.target.value)} disabled={!cliente} className={entrada}>
                        <option value="">{cliente ? "Sem atendimento" : "Escolha a cliente"}</option>
                        {evento && !eventos.some((e) => e.id === evento) && <option value={evento}>Atendimento ligado</option>}
                        {eventos.map((e) => (
                          <option key={e.id} value={e.id}>
                            {formatDate(e.date_start)} · {EQUIP[e.event_type] ?? e.event_type}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(cliente || evento) && (
                      <div className="flex flex-wrap gap-2">
                        {cliente && (
                          <Link href={linkCliente(cliente)} onClick={aoSair(linkCliente(cliente))} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                            <UserRound size={13} /> Ficha da cliente
                          </Link>
                        )}
                        {evento && (
                          <Link href={linkEvento(evento)} onClick={aoSair(linkEvento(evento))} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                            <CalendarDays size={13} /> Atendimento
                          </Link>
                        )}
                        {cliente && (
                          <Link href={`/planejador?cliente=${cliente}`} onClick={aoSair(`/planejador?cliente=${cliente}`)} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                            <ClipboardCopy size={13} /> Outros pacientes dela
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={cartao}>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Paciente</p>
                <div className="space-y-3">
                  <div className="relative">
                    <label className="block">
                      <span className={rotulo}>Nome do paciente</span>
                      <input
                        value={plano.paciente}
                        onChange={(e) => {
                          const v = e.target.value;
                          mudar((p) => ({ ...p, paciente: v, pacienteId: "" }));
                          setSugerindo(true);
                        }}
                        onFocus={() => setSugerindo(true)}
                        onBlur={() => setTimeout(() => setSugerindo(false), 150)}
                        placeholder={cadastros.length ? "Digite para achar ou cadastrar" : "Nome completo"}
                        autoComplete="off"
                        className={`${entrada} text-base font-semibold`}
                      />
                    </label>
                    {sugerindo && !plano.pacienteId && !somenteLeitura && (() => {
                      const lista = sugerirPacientes(cadastros, plano.paciente).filter((c) => c.nome !== plano.paciente);
                      if (!lista.length) return null;
                      return (
                        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">
                          <li className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">Pacientes já cadastrados</li>
                          {lista.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  mudar((p) => ({ ...p, paciente: c.nome, pacienteId: c.id }));
                                  setSugerindo(false);
                                }}
                                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-neutral-800 active:bg-brand-teal/10"
                              >
                                <UserRound size={15} className="text-brand-teal-dark" /> {c.nome}
                              </button>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                    {plano.paciente.trim() && (() => {
                      const mesmo = plano.pacienteId ? cadastros.find((c) => c.id === plano.pacienteId) : pacienteDeMesmoNome(cadastros, plano.paciente);
                      return (
                        <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${mesmo ? "text-emerald-700" : "text-neutral-500"}`}>
                          {mesmo ? <CircleCheck size={13} /> : <Plus size={13} />}
                          <span className="min-w-0 flex-1">{mesmo ? `Na ficha de ${mesmo.nome}: este planejamento entra no histórico dele.` : "Paciente novo: a ficha dele é criada ao salvar."}</span>
                          {mesmo && (
                            <Link href={`${base}?paciente=${mesmo.id}`} onClick={aoSair(`${base}?paciente=${mesmo.id}`)} className="flex-shrink-0 font-semibold text-brand-teal-dark underline">
                              Ver ficha
                            </Link>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block min-w-0">
                      <span className={rotulo}>Data</span>
                      <input type="date" value={plano.data} onChange={(e) => campo("data", e.target.value)} className={entrada} />
                    </label>
                    <label className="block min-w-0">
                      <span className={rotulo}>Retorno</span>
                      <input type="date" value={plano.dataRetorno} onChange={(e) => campo("dataRetorno", e.target.value)} className={entrada} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={rotulo}>Queixa principal</span>
                    <input value={plano.queixa} onChange={(e) => campo("queixa", e.target.value)} placeholder="Ex.: flacidez de papada" className={entrada} />
                  </label>
                  {profissionais === null ? (
                    <label className="block">
                      <span className={rotulo}>Profissional</span>
                      <input value={plano.profissional} onChange={(e) => mudar((p) => ({ ...p, profissional: e.target.value, profissionalId: "", profissionalRegistro: "" }))} placeholder="Nome do profissional" className={entrada} />
                    </label>
                  ) : (
                    <div>
                      <label className="block">
                        <span className={rotulo}>Profissional</span>
                        <select
                          value={profDoPlano ? profDoPlano.id : plano.profissional.trim() ? "__texto" : ""}
                          onChange={(e) => escolherProfissional(e.target.value)}
                          disabled={somenteLeitura}
                          className={entrada}
                          aria-label="Profissional"
                        >
                          <option value="">{ativas(profissionais).length ? "Escolha a profissional" : "Nenhuma cadastrada"}</option>
                          {!profDoPlano && plano.profissional.trim() && <option value="__texto">{plano.profissional} (escrito à mão)</option>}
                          {profissionais
                            .filter((p) => p.ativo || p.id === profDoPlano?.id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {rotuloProfissional(p)}
                                {p.ativo ? "" : " (desativada)"}
                              </option>
                            ))}
                          {!somenteLeitura && <option value="__nova">+ Nova profissional</option>}
                        </select>
                      </label>
                      {novaProf && (
                        <div className="mt-2 space-y-2 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                          <p className="text-xs font-semibold text-neutral-700">Nova profissional {portal ? "da sua clínica" : "desta clínica"}</p>
                          <div className="grid grid-cols-[1fr_120px] gap-2">
                            <input value={novaProf.nome} onChange={(e) => setNovaProf({ ...novaProf, nome: e.target.value })} placeholder="Nome" className={entrada} autoComplete="off" />
                            <input value={novaProf.registro} onChange={(e) => setNovaProf({ ...novaProf, registro: e.target.value })} placeholder="Registro" className={entrada} autoComplete="off" />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setNovaProf(null)} className="min-h-10 flex-1 rounded-xl bg-white text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200">
                              Cancelar
                            </button>
                            <button type="button" onClick={criarProfissional} disabled={salvandoProf} className="min-h-10 flex-1 rounded-xl bg-brand-teal text-sm font-bold text-white disabled:opacity-60">
                              {salvandoProf ? "Salvando..." : "Cadastrar e escolher"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_140px] gap-2">
                    <label className="block min-w-0">
                      <span className={rotulo}>Procedimento</span>
                      <input value={plano.procNome} onChange={(e) => campo("procNome", e.target.value)} placeholder="Ex.: HIPRO Full Face" className={entrada} />
                    </label>
                    <label className="block min-w-0">
                      <span className={rotulo}>Valor</span>
                      <input value={plano.valorProc} onChange={(e) => campo("valorProc", mascaraReais(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" className={entrada} />
                    </label>
                  </div>
                </div>
              </div>

              <div className={cartao}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Sessões do pacote</p>
                <p className="mb-3 text-sm font-semibold text-neutral-800">Quantas sessões o paciente vai fazer?</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const on = plano.sessoesTotal === n;
                    const bloqueada = n < plano.sessaoAtual;
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={bloqueada || somenteLeitura}
                        onClick={() => definirSessoes(n)}
                        className={`rounded-2xl py-2.5 text-center text-sm font-bold ring-1 transition disabled:opacity-40 ${on ? "bg-brand-teal text-white ring-brand-teal shadow-glow-teal" : "bg-white text-neutral-700 ring-neutral-200"}`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                {(stepperSessoes || plano.sessoesTotal > 6) && (
                  <div className="mt-2 flex items-center justify-between rounded-2xl bg-neutral-50 px-3 py-2 ring-1 ring-neutral-200">
                    <span className="text-sm text-neutral-600">Mais de 6 sessões</span>
                    <span className="flex items-center gap-3">
                      <button type="button" disabled={somenteLeitura || plano.sessoesTotal <= plano.sessaoAtual} onClick={() => definirSessoes(plano.sessoesTotal - 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 ring-1 ring-neutral-200 disabled:opacity-40" aria-label="Menos uma sessão">
                        <Minus size={16} />
                      </button>
                      <b className="w-6 text-center text-base tabular-nums">{plano.sessoesTotal}</b>
                      <button type="button" disabled={somenteLeitura || plano.sessoesTotal >= MAX_SESSOES} onClick={() => definirSessoes(plano.sessoesTotal + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 ring-1 ring-neutral-200 disabled:opacity-40" aria-label="Mais uma sessão">
                        <Plus size={16} />
                      </button>
                    </span>
                  </div>
                )}
                {!stepperSessoes && plano.sessoesTotal <= 6 && (
                  <button type="button" onClick={() => setStepperSessoes(true)} className="mt-2 text-xs font-semibold text-brand-teal-dark">
                    Mais de 6 sessões
                  </button>
                )}
                <p className="mt-3 text-sm text-neutral-600">
                  Sessão atual: <b className="text-neutral-900">{plano.sessaoAtual} de {plano.sessoesTotal}</b>
                </p>
                {varias && plano.sessoesAnteriores.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {plano.sessoesAnteriores.map((x) => (
                      <li key={x.n} className="flex items-center justify-between gap-2 rounded-2xl bg-neutral-50 px-3 py-2 text-sm ring-1 ring-neutral-200">
                        <span className="min-w-0 truncate">
                          <b>Sessão {x.n}</b> · {x.data ? formatDate(x.data) : "sem data"} · {fmt(totalDaSessao(x))} disparos
                        </span>
                        <button type="button" onClick={() => fichaSessao(x.n)} className="flex-shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-teal-dark ring-1 ring-brand-teal/40">
                          Ficha
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {varias && !somenteLeitura && (
                  <div className="mt-3 space-y-2">
                    {naoUltima && (
                      <>
                        <button
                          type="button"
                          onClick={concluirSessao}
                          disabled={s.total <= 0}
                          className="w-full rounded-2xl bg-brand-gradient py-3 text-sm font-bold text-white shadow-glow-teal disabled:opacity-50 disabled:shadow-none"
                        >
                          Concluir Sessão {plano.sessaoAtual} e abrir Sessão {plano.sessaoAtual + 1}
                        </button>
                        {s.total <= 0 && <p className="text-center text-xs text-neutral-500">Distribua os disparos desta sessão antes de concluir.</p>}
                      </>
                    )}
                    {plano.sessoesAnteriores.length > 0 && (
                      <button type="button" onClick={voltarSessao} className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200">
                        Voltar para a Sessão {plano.sessoesAnteriores[plano.sessoesAnteriores.length - 1].n}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className={cartao}>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">{varias ? "Saldo de disparos do pacote" : "Saldo de disparos"}</p>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${perfisTela.length <= 4 ? 4 : 3}, minmax(0, 1fr))` }}>
                  {perfisTela.map((pf) => {
                    const on = plano.perfil === pf.valor;
                    return (
                      <button
                        key={pf.valor}
                        type="button"
                        onClick={() => mudar((p) => ({ ...p, perfil: pf.valor, saldoTotal: String(pf.disparos) }))}
                        className={`rounded-2xl px-1 py-2.5 text-center ring-1 transition ${on ? "bg-brand-teal text-white ring-brand-teal shadow-glow-teal" : "bg-white text-neutral-700 ring-neutral-200"}`}
                      >
                        <span className="block text-xs font-bold">{pf.nome}</span>
                        <span className={`block text-[10px] tabular-nums ${on ? "text-white/85" : "text-neutral-400"}`}>{pf.disparos ? fmt(pf.disparos) : "—"}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className={rotulo}>{varias ? "Saldo total do pacote" : "Saldo total"}</span>
                  <input
                    inputMode="numeric"
                    value={plano.saldoTotal === "0" ? "" : fmt(Number(plano.saldoTotal))}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => campo("saldoTotal", String(Number(e.target.value.replace(/\D/g, "")) || 0))}
                    className={`${entrada} text-2xl font-black tabular-nums`}
                  />
                </label>
                {varias && (
                  <dl className="mt-3 space-y-1 text-sm">
                    {s.anteriores > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-neutral-600">Já usados nas sessões anteriores</dt>
                        <dd className="font-bold tabular-nums">{fmt(s.anteriores)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-neutral-600">Nesta sessão</dt>
                      <dd className="font-bold tabular-nums">{fmt(s.total)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-neutral-600">{naoUltima ? "Fica para as próximas sessões" : "Restante"}</dt>
                      <dd className={`font-bold tabular-nums ${s.resta < 0 ? "text-rose-600" : "text-brand-teal-dark"}`}>{fmt(naoUltima ? s.paraProximas : s.resta)}</dd>
                    </div>
                  </dl>
                )}
              </div>

              <div className={cartao}>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Anotações</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className={rotulo}>Observações clínicas</span>
                    <textarea value={plano.obs} onChange={(e) => campo("obs", e.target.value)} rows={3} placeholder="Anotações, contraindicações, observações gerais..." className={`${entrada} resize-y`} />
                  </label>
                  <label className="block">
                    <span className={rotulo}>Recomendações ao paciente</span>
                    <textarea value={plano.recomendacoes} onChange={(e) => campo("recomendacoes", e.target.value)} rows={2} placeholder="Cuidados pós-procedimento..." className={`${entrada} resize-y`} />
                  </label>
                </div>
              </div>

              {!somenteLeitura && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setSeletor(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-brand-teal-dark ring-1 ring-brand-teal/40">
                    <ListChecks size={17} /> Montar pelas regras
                  </button>
                  {!portal ? (
                    <Link
                      href={linkIa}
                      onClick={aoSair(linkIa)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-[#7a5fa0] ring-1 ring-brand-lilac/50"
                    >
                      <Sparkles size={17} /> Montar com a IA
                    </Link>
                  ) : (
                    <button type="button" onClick={() => irPara("areas")} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200">
                      Preencher à mão
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {aba === "areas" && (
            <div key="areas" className="space-y-3 animate-[aparecer_.25s_ease-out]">
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-white p-1 ring-1 ring-neutral-200">
                  <button type="button" onClick={() => setSoPreenchidas(false)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!soPreenchidas ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>
                    Todas
                  </button>
                  <button type="button" onClick={() => setSoPreenchidas(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${soPreenchidas ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>
                    Preenchidas
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAbertas((a) => (a.size ? new Set() : new Set(areas.map((x) => x.id))))}
                  className="ml-auto text-xs font-semibold text-brand-teal-dark"
                >
                  {abertas.size ? "Fechar todas" : "Abrir todas"}
                </button>
              </div>
              <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                <ShieldAlert size={15} className="mt-0.5 flex-shrink-0 text-amber-600" /> {AVISO_GERAL_APLICACAO}
              </p>
              {areas.length === 0 && <p className="rounded-3xl bg-white p-6 text-center text-sm text-neutral-500 ring-1 ring-neutral-200">Nenhuma área com disparos ainda.</p>}
              <div className="gap-3 md:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
                {areas.map((a) => (
                  <CartaoArea
                    key={a.id}
                    area={a}
                    linhas={plano.DATA[a.id] ?? []}
                    total={totalArea(plano, a)}
                    aberto={abertas.has(a.id)}
                    onAlternar={() =>
                      setAbertas((s0) => {
                        const n = new Set(s0);
                        if (n.has(a.id)) n.delete(a.id);
                        else n.add(a.id);
                        return n;
                      })
                    }
                    onLinhas={(ls: Linha[]) => mudar((p) => ({ ...p, DATA: { ...p.DATA, [a.id]: ls.length ? ls : [linhaVazia(a)] } }))}
                    onVerModelo={() => setModelo(a)}
                    onRemoverArea={a.manual && !somenteLeitura ? () => removerArea(a) : undefined}
                  />
                ))}
              </div>
              {!somenteLeitura && (
                <button type="button" onClick={() => setNovaArea(true)} className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-teal/40 bg-white/60 py-4 text-sm font-bold text-brand-teal-dark active:bg-brand-teal/5">
                  <Plus size={18} /> Adicionar área (rosto ou corporal)
                </button>
              )}
            </div>
          )}

          {aba === "resumo" && (
            <div key="resumo" className="animate-[aparecer_.25s_ease-out]">
              <ResumoPlano plano={plano} onIrParaArea={irParaArea} />
              <div className={`${cartao} mt-4`}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Depois da sessão</p>
                <p className="mb-3 text-xs text-neutral-500">Cuidados, o que esperar{plano.dataRetorno ? " e o próximo retorno" : ""}, já escritos para o WhatsApp do paciente.</p>
                <BotaoOrientacoes paciente={plano.paciente} whatsapp={whatsPaciente} profissional={plano.profissional} retorno={plano.dataRetorno} />
              </div>
              {assinaturas.estado !== "sem_permissao" && assinaturas.estado !== "carregando" && (
                <div id="assinaturas-sessao" className={`${cartao} mt-4 scroll-mt-4`}>
                  <AssinaturasSessoes
                    planoId={id}
                    plano={plano}
                    clienteId={cliente || null}
                    estado={assinaturas.estado}
                    lista={assinaturas.lista}
                    onMudou={assinaturas.recarregar}
                    antesDeAbrir={salvarAntesDeAssinar}
                  />
                </div>
              )}
              {varias && (
                <div className={`${cartao} mt-4`}>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Fichas para assinar</p>
                  <div className="flex flex-wrap gap-2">
                    {plano.sessoesAnteriores.map((x) => (
                      <button key={x.n} type="button" onClick={() => fichaSessao(x.n)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-neutral-700 ring-1 ring-neutral-200">
                        <FileText size={14} /> Ficha da Sessão {x.n}
                      </button>
                    ))}
                    <button type="button" onClick={() => fichaSessao(plano.sessaoAtual)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal px-3.5 py-2 text-xs font-bold text-white shadow-glow-teal">
                      <FileText size={14} /> Ficha para assinar (Sessão {plano.sessaoAtual})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Barra de baixo: o próximo passo de cada aba. */}
      {!digitando && (
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-neutral-200/70 bg-white/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl gap-2">
            {aba === "paciente" && (
              <button onClick={() => irPara("areas")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal active:scale-[0.99]">
                Distribuir nas áreas <ArrowRight size={17} />
              </button>
            )}
            {aba === "areas" && (
              <>
                <button onClick={() => setCustos(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-3.5 text-sm font-bold text-brand-teal-dark ring-1 ring-brand-teal/40 active:scale-[0.99]">
                  <Calculator size={16} /> Custos de disparos
                </button>
                <button onClick={() => irPara("resumo")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal active:scale-[0.99]">
                  Ver resumo <ArrowRight size={17} />
                </button>
              </>
            )}
            {aba === "resumo" && (
              <>
                <button onClick={() => setCustos(true)} className="flex items-center justify-center rounded-2xl bg-white px-3.5 py-3.5 text-brand-teal-dark ring-1 ring-brand-teal/40" aria-label="Custos de disparos" title="Custos de disparos">
                  <Calculator size={17} />
                </button>
                <button onClick={copiarResumo} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-3.5 text-sm font-bold text-neutral-800 ring-1 ring-neutral-200">
                  <Copy size={16} /> Copiar
                </button>
                <button onClick={compartilharResumo} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white">
                  <Share2 size={16} /> Enviar
                </button>
                <button onClick={() => pdf("prontuario")} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal">
                  <FileText size={16} /> PDF
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {aviso && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <p className="rounded-full bg-neutral-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg animate-[aparecer_.2s_ease-out]">{aviso}</p>
        </div>
      )}

      {confirmarApagar && (
        <ConfirmarApagarModal
          titulo={`Excluir ${plano.paciente || "este paciente"}?`}
          descricao="Apaga o planejamento deste paciente, com as áreas e os disparos."
          onCancelar={() => setConfirmarApagar(false)}
          onConfirmar={apagarDeVez}
        />
      )}
      <Folha aberta={perguntarSessoes} onFechar={() => setPerguntarSessoes(false)} titulo="Quantas sessões o paciente vai fazer?">
        <div className="space-y-4 pb-2">
          <p className="text-sm text-neutral-600">Ex.: pacote de 16.000 disparos em 2 sessões: faz 10.000 agora e ficam 6.000 para a segunda.</p>
          {maisSessoes === null ? (
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => (campo("sessoesTotal", n), setPerguntarSessoes(false))}
                  className={`rounded-2xl py-4 text-lg font-extrabold ring-1 transition active:scale-[0.98] ${plano.sessoesTotal === n ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-800 ring-neutral-200"}`}
                >
                  {n}
                  <span className="block text-[10px] font-semibold opacity-70">{n === 1 ? "sessão" : "sessões"}</span>
                </button>
              ))}
              <button type="button" onClick={() => setMaisSessoes(6)} className="rounded-2xl bg-white py-4 text-base font-extrabold text-brand-teal-dark ring-1 ring-brand-teal/40 active:scale-[0.98]">
                Mais
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-5">
                <button type="button" onClick={() => setMaisSessoes((v) => Math.max(6, (v ?? 6) - 1))} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-neutral-600 ring-1 ring-neutral-200" aria-label="Menos uma sessão">
                  <Minus size={20} />
                </button>
                <b className="w-12 text-center text-4xl font-black tabular-nums">{maisSessoes}</b>
                <button type="button" onClick={() => setMaisSessoes((v) => Math.min(MAX_SESSOES, (v ?? 6) + 1))} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-neutral-600 ring-1 ring-neutral-200" aria-label="Mais uma sessão">
                  <Plus size={20} />
                </button>
              </div>
              <button type="button" onClick={() => (campo("sessoesTotal", maisSessoes), setPerguntarSessoes(false))} className="w-full rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal">
                Usar {maisSessoes} sessões
              </button>
              <button type="button" onClick={() => setMaisSessoes(null)} className="w-full text-center text-xs font-semibold text-neutral-500">
                Voltar
              </button>
            </div>
          )}
        </div>
      </Folha>
      <CustoDisparos
        aberta={custos}
        onFechar={() => setCustos(false)}
        plano={plano}
        podeAplicar={!somenteLeitura}
        onAplicar={(q) => {
          mudar((p) => aplicarQuantidades(p, q));
          mostrarAviso("Quantidades aplicadas no planejamento.");
        }}
      />
      <FolhaModelo area={modelo} onFechar={() => setModelo(null)} />
      <FolhaNovaArea aberta={novaArea} onFechar={() => setNovaArea(false)} onCriar={criarArea} />
      <Folha aberta={seletor} onFechar={() => setSeletor(false)} titulo="Montar pelas regras">
        <SeletorPlanejamento
          saldoInicial={saldoSeletor}
          rotuloSaldo={varias ? "Disparos desta sessão" : undefined}
          queixaInicial={plano.queixa || null}
          paciente={plano.paciente || null}
          textoAplicar="Colocar no planejador"
          onAplicar={aplicarSeletor}
        />
      </Folha>
    </div>
  );
}
