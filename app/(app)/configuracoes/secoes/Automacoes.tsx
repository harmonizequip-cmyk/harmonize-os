"use client";

// Automações: tarefas que a agenda cria sozinha e as regras do funil de
// clientes (recontato e Reativar).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, HandCoins, MessageCircleHeart, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AppSettings } from "@/lib/settings";
import { BarraSalvar, Bloco, Chave, numero } from "../ui";

function estado(s: AppSettings) {
  return {
    confAtiva: s.tarefaConfirmacaoAtiva,
    confDias: String(s.diasAntesConfirmacao),
    posAtiva: s.tarefaPosLocacaoAtiva,
    posDias: String(s.diasPosLocacao),
    taxaAtiva: s.tarefaTaxaAtiva,
    taxaDias: String(s.diasCobrancaTaxa),
    recontatoAtivo: s.recontatoAutomatico,
    recontatoIntervalo: String(s.recontatoIntervaloDias),
    diasAteReativar: String(s.diasAteReativar),
  };
}

type Estado = ReturnType<typeof estado>;

function Dias({ valor, onChange, desligado }: { valor: string; onChange: (v: string) => void; desligado?: boolean }) {
  const n = Math.round(numero(valor)) || 0;
  const botao = "flex h-8 w-8 items-center justify-center rounded-xl bg-white text-base font-bold text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-100 disabled:opacity-40";
  return (
    <span className={`flex items-center gap-1 ${desligado ? "opacity-40" : ""}`}>
      <button type="button" disabled={desligado} className={botao} onClick={() => onChange(String(Math.max(0, n - 1)))} aria-label="Menos um dia">
        -
      </button>
      <input
        inputMode="numeric"
        value={valor}
        disabled={desligado}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="w-11 rounded-xl border border-neutral-300 bg-white py-1.5 text-center text-sm font-bold tabular-nums"
      />
      <button type="button" disabled={desligado} className={botao} onClick={() => onChange(String(n + 1))} aria-label="Mais um dia">
        +
      </button>
    </span>
  );
}

function Linha({
  icone,
  titulo,
  frase,
  ativa,
  onAtiva,
  dias,
  onDias,
}: {
  icone: React.ReactNode;
  titulo: string;
  frase: (dias: string) => string;
  ativa?: boolean;
  onAtiva?: (v: boolean) => void;
  dias: string;
  onDias: (v: string) => void;
}) {
  const desligado = ativa === false;
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${desligado ? "bg-neutral-200 text-neutral-400" : "bg-brand-teal/10 text-brand-teal-dark"}`}>
          {icone}
        </span>
        <p className={`min-w-0 flex-1 text-sm font-semibold ${desligado ? "text-neutral-400" : "text-neutral-900"}`}>{titulo}</p>
        {onAtiva && <Chave ligada={!!ativa} onChange={onAtiva} rotulo={titulo} />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-12">
        <p className={`min-w-0 text-xs leading-snug ${desligado ? "text-neutral-400" : "text-neutral-600"}`}>{frase(dias)}</p>
        <Dias valor={dias} onChange={onDias} desligado={desligado} />
      </div>
    </div>
  );
}

const plural = (d: string) => (Math.round(numero(d)) === 1 ? "dia" : "dias");

export default function Automacoes({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const supabase = createClient();
  const inicial = useMemo(() => estado(settings), [settings]);
  const [e, setE] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  function muda<K extends keyof Estado>(k: K) {
    return (v: Estado[K]) => {
      setE((x) => ({ ...x, [k]: v }));
      setErro(null);
      setSalvo(false);
    };
  }

  async function salvar() {
    const n = (v: string) => Math.round(numero(v));
    const conf = n(e.confDias), pos = n(e.posDias), taxa = n(e.taxaDias);
    const intervalo = n(e.recontatoIntervalo), reativar = n(e.diasAteReativar);
    if (![conf, pos, taxa].every((x) => Number.isFinite(x) && x >= 0 && x <= 30) || taxa < 1) {
      setErro("Tarefas da agenda: de 0 a 30 dias (cobrança da taxa, de 1 a 30).");
      return;
    }
    if (!(intervalo >= 1 && intervalo <= 365) || !(reativar >= 1)) {
      setErro("Funil: números a partir de 1 (recontato até 365 dias).");
      return;
    }
    setSalvando(true);
    setErro(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("settings")
      .update({
        tarefa_confirmacao_ativa: e.confAtiva,
        dias_antes_confirmacao: conf,
        tarefa_pos_locacao_ativa: e.posAtiva,
        dias_pos_locacao: pos,
        tarefa_taxa_ativa: e.taxaAtiva,
        dias_cobranca_taxa: taxa,
        recontato_automatico: e.recontatoAtivo,
        recontato_intervalo_dias: intervalo,
        dias_ate_reativar: reativar,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", true);
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Tente de novo.");
      return;
    }
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco titulo="Tarefas da agenda" dica="O sistema cria a tarefa sozinho na data certa. Não gera nada com o modo teste ligado.">
        <div className="space-y-2">
          <Linha
            icone={<CalendarCheck size={17} />}
            titulo="Confirmar presença"
            frase={(d) => `${d || 0} ${plural(d)} antes do atendimento ainda não confirmado`}
            ativa={e.confAtiva}
            onAtiva={muda("confAtiva")}
            dias={e.confDias}
            onDias={muda("confDias")}
          />
          <Linha
            icone={<MessageCircleHeart size={17} />}
            titulo="Contato pós-locação"
            frase={(d) => `${d || 0} ${plural(d)} depois da locação (só das últimas duas semanas)`}
            ativa={e.posAtiva}
            onAtiva={muda("posAtiva")}
            dias={e.posDias}
            onDias={muda("posDias")}
          />
          <Linha
            icone={<HandCoins size={17} />}
            titulo="Cobrar taxa de reserva"
            frase={(d) => `${d || 0} ${plural(d)} com a taxa pendente, contados da criação da reserva`}
            ativa={e.taxaAtiva}
            onAtiva={muda("taxaAtiva")}
            dias={e.taxaDias}
            onDias={muda("taxaDias")}
          />
        </div>
      </Bloco>

      <Bloco titulo="Funil de clientes">
        <div className="space-y-2">
          <Linha
            icone={<RefreshCcw size={17} />}
            titulo="Recontato automático"
            frase={(d) => `Tarefa a cada ${d || 0} ${plural(d)} para quem está em Cliente ou Reativar e não tem reserva`}
            ativa={e.recontatoAtivo}
            onAtiva={muda("recontatoAtivo")}
            dias={e.recontatoIntervalo}
            onDias={muda("recontatoIntervalo")}
          />
          <Linha
            icone={<RefreshCcw size={17} className="-scale-x-100" />}
            titulo="Ir para Reativar"
            frase={(d) => `Depois de ${d || 0} ${plural(d)} sem locação. Quem tem reserva futura não cai em Reativar.`}
            dias={e.diasAteReativar}
            onDias={muda("diasAteReativar")}
          />
        </div>
      </Bloco>

      <BarraSalvar
        alterado={alterado}
        salvando={salvando}
        salvo={salvo}
        erro={erro}
        onSalvar={salvar}
        onDescartar={() => setE(inicial)}
      />
    </div>
  );
}
