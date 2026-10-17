"use client";

// Central de Configurações (pedido do dono, 17/10/2026): em vez de uma tela
// comprida com tudo aberto, um check-up do app no topo e os assuntos em
// grupos, em blocos de duas colunas como o Menu. Tocar num bloco abre só
// aquele assunto (?secao=...), e o voltar do celular volta para a central.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BellRing,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Eye,
  FlaskConical,
  Fingerprint,
  History,
  Palette,
  ShieldCheck,
  Tags as TagsIcon,
  Wallet,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OndaMarca } from "@/components/ui/Visual";
import { formatCurrency } from "@/lib/format";
import type { AppSettings } from "@/lib/settings";
import { avisosSuportados } from "@/lib/push";
import BackupCard, { CHAVE_BACKUP } from "@/components/BackupCard";
import AvisosCelularCard from "@/components/AvisosCelularCard";
import DigitalCard from "@/components/DigitalCard";
import AcessoVisualizacaoCard from "@/components/AcessoVisualizacaoCard";
import ContasFixasCard from "@/components/ContasFixasCard";
import Precos from "./secoes/Precos";
import Automacoes from "./secoes/Automacoes";
import Tags, { type TagRow } from "./secoes/Tags";
import MinhaConta from "./secoes/MinhaConta";
import Aparencia from "./secoes/Aparencia";
import { TITULOS_SECAO as TITULOS, type SecaoId } from "./secoes-ids";

interface Dados {
  settings: AppSettings;
  tags: TagRow[];
  testMode: boolean;
  nome: string;
  email: string;
  acessosVisualizacao: number;
}

type Situacao = "ok" | "pendente" | "carregando";

interface Saude {
  backupDias: number | null | undefined; // undefined = ainda lendo
  avisos: Situacao;
  digital: number | null; // null = lendo
  tema: "Clássico" | "Aurora";
}

function useSaude(): Saude {
  const [s, setS] = useState<Saude>({ backupDias: undefined, avisos: "carregando", digital: null, tema: "Clássico" });

  useEffect(() => {
    let backupDias: number | null = null;
    try {
      const ultimo = localStorage.getItem(CHAVE_BACKUP);
      if (ultimo) backupDias = Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000);
    } catch {
      // sem armazenamento
    }
    const tema = document.documentElement.classList.contains("tema-aurora") ? "Aurora" : "Clássico";
    setS((x) => ({ ...x, backupDias, tema }));

    (async () => {
      if (!avisosSuportados() || Notification.permission !== "granted") return "pendente" as const;
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      return (await reg?.pushManager.getSubscription()) ? ("ok" as const) : ("pendente" as const);
    })()
      .catch(() => "pendente" as const)
      .then((avisos) => setS((x) => ({ ...x, avisos })));

    createClient()
      .auth.passkey.list()
      .then(({ data }) => setS((x) => ({ ...x, digital: (data ?? []).length })))
      .catch(() => setS((x) => ({ ...x, digital: 0 })));
  }, []);

  return s;
}

function Anel({ feitos, total }: { feitos: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const tudo = feitos === total;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="flex-shrink-0">
      <circle cx="30" cy="30" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke="#14b8a6"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - feitos / total)}
        transform="rotate(-90 30 30)"
        style={{ transition: "stroke-dashoffset .8s ease" }}
      />
      <text x="30" y="35" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">
        {tudo ? "✓" : `${feitos}/${total}`}
      </text>
    </svg>
  );
}

function Checkup({ saude, testMode }: { saude: Saude; testMode: boolean }) {
  const itens: { id: string; ok: boolean | null; texto: string; href: string }[] = [
    {
      id: "backup",
      ok: saude.backupDias === undefined ? null : saude.backupDias !== null && saude.backupDias < 7,
      texto:
        saude.backupDias === undefined
          ? "Backup"
          : saude.backupDias === null
            ? "Backup nunca feito neste celular"
            : saude.backupDias < 7
              ? `Backup em dia (${saude.backupDias === 0 ? "hoje" : `há ${saude.backupDias} d`})`
              : `Backup atrasado (há ${saude.backupDias} dias)`,
      href: "/configuracoes?secao=backup",
    },
    {
      id: "avisos",
      ok: saude.avisos === "carregando" ? null : saude.avisos === "ok",
      texto: saude.avisos === "ok" ? "Avisos ligados neste celular" : "Avisos desligados neste celular",
      href: "/configuracoes?secao=avisos",
    },
    {
      id: "digital",
      ok: saude.digital === null ? null : saude.digital > 0,
      texto: saude.digital ? "Digital cadastrada" : "Digital não cadastrada",
      href: "/configuracoes?secao=digital",
    },
    {
      id: "teste",
      ok: !testMode,
      texto: testMode ? "Modo teste ligado: vendas não contam" : "Modo teste desligado",
      href: "/configuracoes/dados-teste",
    },
  ];
  const feitos = itens.filter((i) => i.ok).length;
  const pendentes = itens.filter((i) => i.ok === false);

  return (
    <section className="cartao p-4">
      <OndaMarca />
      <div className="relative flex items-center gap-3">
        <Anel feitos={feitos} total={itens.length} />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Check-up do app</p>
          <p className="text-lg font-extrabold leading-tight text-slate-900">
            {pendentes.length === 0 ? "Tudo em ordem" : `${pendentes.length} ${pendentes.length === 1 ? "ponto pede" : "pontos pedem"} atenção`}
          </p>
        </div>
      </div>
      <ul className="relative mt-3 space-y-1.5">
        {itens.map((i) => (
          <li key={i.id}>
            <Link
              href={i.href}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-[13px] font-medium ${
                i.ok === false ? "bg-amber-50 text-slate-800" : "bg-slate-50 text-slate-600"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  i.ok === null ? "bg-slate-200" : i.ok ? "bg-teal-500 text-white" : "bg-amber-400 text-white"
                }`}
              >
                {i.ok === null ? "" : i.ok ? "✓" : "!"}
              </span>
              <span className="min-w-0 flex-1 truncate">{i.texto}</span>
              {i.ok === false && <ChevronRight size={15} className="text-neutral-400" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface Bloco {
  id: SecaoId | "teste" | "historico";
  titulo: string;
  resumo: string;
  icone: typeof Wallet;
  cor: string;
  href?: string;
}

export default function ConfiguracoesHub({ secao, dados }: { secao: SecaoId | null; dados: Dados }) {
  const saude = useSaude();
  const { settings, tags, testMode } = dados;

  if (secao) {
    return (
      <div className="space-y-4">
        <div>
          <Link href="/configuracoes" className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm font-medium text-neutral-500">
            <ChevronLeft size={18} /> Configurações
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">{TITULOS[secao]}</h1>
        </div>
        {secao === "precos" && <Precos settings={settings} />}
        {secao === "automacoes" && <Automacoes settings={settings} />}
        {secao === "tags" && <Tags iniciais={tags} />}
        {secao === "contas" && <ContasFixasCard inicial={settings.despesasFixas} />}
        {secao === "avisos" && <AvisosCelularCard />}
        {secao === "digital" && <DigitalCard />}
        {secao === "aparencia" && <Aparencia />}
        {secao === "backup" && <BackupCard />}
        {secao === "acesso" && <AcessoVisualizacaoCard />}
        {secao === "conta" && <MinhaConta nome={dados.nome} email={dados.email} />}
      </div>
    );
  }

  const totalFixas = settings.despesasFixas.reduce((s, d) => s + d.valor, 0);
  const automacoesLigadas = [
    settings.tarefaConfirmacaoAtiva,
    settings.tarefaPosLocacaoAtiva,
    settings.tarefaTaxaAtiva,
    settings.recontatoAutomatico,
  ].filter(Boolean).length;

  const grupos: { titulo: string; blocos: Bloco[] }[] = [
    {
      titulo: "O negócio",
      blocos: [
        {
          id: "precos",
          titulo: "Preços",
          resumo: `${formatCurrency(settings.pricing.flatPackageValue)} até ${settings.pricing.flatPackageLimit.toLocaleString("pt-BR")}`,
          icone: BadgeDollarSign,
          cor: "bg-emerald-50 text-emerald-600",
        },
        {
          id: "contas",
          titulo: "Contas fixas",
          resumo: totalFixas > 0 ? `${formatCurrency(totalFixas)}/mês` : "Nenhuma ainda",
          icone: Wallet,
          cor: "bg-amber-50 text-amber-600",
        },
        { id: "tags", titulo: "Tags", resumo: `${tags.length} ${tags.length === 1 ? "tag" : "tags"}`, icone: TagsIcon, cor: "bg-pink-50 text-pink-600" },
        {
          id: "automacoes",
          titulo: "Automações",
          resumo: `${automacoesLigadas} de 4 ligadas`,
          icone: Zap,
          cor: "bg-violet-50 text-violet-600",
        },
      ],
    },
    {
      titulo: "Este celular",
      blocos: [
        {
          id: "avisos",
          titulo: "Avisos",
          resumo: saude.avisos === "carregando" ? "..." : saude.avisos === "ok" ? "Ligados" : "Desligados",
          icone: BellRing,
          cor: "bg-sky-50 text-sky-600",
        },
        {
          id: "digital",
          titulo: "Digital",
          resumo: saude.digital === null ? "..." : saude.digital > 0 ? `${saude.digital} aparelho${saude.digital > 1 ? "s" : ""}` : "Não cadastrada",
          icone: Fingerprint,
          cor: "bg-teal-50 text-teal-600",
        },
        { id: "aparencia", titulo: "Aparência", resumo: `Tema ${saude.tema}`, icone: Palette, cor: "bg-fuchsia-50 text-fuchsia-600" },
      ],
    },
    {
      titulo: "Dados e acesso",
      blocos: [
        {
          id: "backup",
          titulo: "Backup",
          resumo:
            saude.backupDias === undefined
              ? "..."
              : saude.backupDias === null
                ? "Nunca neste celular"
                : saude.backupDias === 0
                  ? "Feito hoje"
                  : `Há ${saude.backupDias} dia${saude.backupDias > 1 ? "s" : ""}`,
          icone: DatabaseBackup,
          cor: "bg-blue-50 text-blue-600",
        },
        {
          id: "acesso",
          titulo: "Visualização",
          resumo: dados.acessosVisualizacao > 0 ? `${dados.acessosVisualizacao} com acesso` : "Ninguém",
          icone: Eye,
          cor: "bg-neutral-100 text-neutral-600",
        },
        {
          id: "teste",
          titulo: "Dados de teste",
          resumo: testMode ? "Ligado" : "Desligado",
          icone: FlaskConical,
          cor: testMode ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600",
          href: "/configuracoes/dados-teste",
        },
        { id: "historico", titulo: "Histórico", resumo: "Quem mudou o quê", icone: History, cor: "bg-neutral-100 text-neutral-600", href: "/movimentacoes" },
      ],
    },
  ];

  const inicial = (dados.nome || dados.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-5 pb-4">
      <h1 className="text-xl font-semibold text-neutral-900">Configurações</h1>

      <Link href="/configuracoes?secao=conta" className="cartao flex items-center gap-3 p-3 active:bg-neutral-50">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-base font-extrabold text-white">
          {inicial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-neutral-900">{dados.nome || "Minha conta"}</span>
          <span className="block truncate text-xs text-neutral-500">{dados.email} · senha e sair</span>
        </span>
        <ChevronRight size={18} className="text-neutral-300" />
      </Link>

      <Checkup saude={saude} testMode={testMode} />

      {grupos.map((g) => (
        <section key={g.titulo}>
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">{g.titulo}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {g.blocos.map((b) => {
              const Icone = b.icone;
              return (
                <Link
                  key={b.id}
                  href={b.href ?? `/configuracoes?secao=${b.id}`}
                  className="cartao flex min-h-[96px] flex-col justify-between !rounded-3xl p-3 transition active:scale-[0.98] active:bg-neutral-50"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${b.cor}`}>
                    <Icone size={18} strokeWidth={1.9} />
                  </span>
                  <span className="mt-2 block">
                    <span className="block text-[13.5px] font-semibold leading-tight text-neutral-900">{b.titulo}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-neutral-500">{b.resumo}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-neutral-400">
        <ShieldCheck size={13} /> Só você (administrador) vê esta tela.
      </p>
    </div>
  );
}
