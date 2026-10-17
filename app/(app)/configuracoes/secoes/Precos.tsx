"use client";

// Preços: locação HIPRO (faixas), taxa de reserva e mentoria. A simulação
// mostra, antes de salvar, quanto ficam algumas quantidades de disparos com os
// valores atuais e com os novos.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { calculateRentalValue, type PricingConfig } from "@/lib/rental-pricing";
import type { AppSettings } from "@/lib/settings";
import { confirmar } from "@/components/Dialogos";
import { BarraSalvar, Bloco, Campo, numero } from "../ui";

function campos(s: AppSettings) {
  return {
    flatPackageLimit: String(s.pricing.flatPackageLimit),
    flatPackageValue: String(s.pricing.flatPackageValue).replace(".", ","),
    tier2Limit: String(s.pricing.tier2Limit),
    tier2Rate: String(s.pricing.tier2Rate).replace(".", ","),
    tier3Rate: String(s.pricing.tier3Rate).replace(".", ","),
    reservationFee: String(s.reservationFee).replace(".", ","),
    mentoriaAvista: String(s.mentoriaPricing.valorAvista).replace(".", ","),
    mentoriaParcelado: String(s.mentoriaPricing.valorParcelado).replace(".", ","),
  };
}

type Campos = ReturnType<typeof campos>;

function paraConfig(c: Campos): PricingConfig {
  return {
    flatPackageLimit: Math.round(numero(c.flatPackageLimit)),
    flatPackageValue: numero(c.flatPackageValue),
    tier2Limit: Math.round(numero(c.tier2Limit)),
    tier2Rate: numero(c.tier2Rate),
    tier3Rate: numero(c.tier3Rate),
    minimumShots: null,
  };
}

function valor(shots: number, cfg: PricingConfig): number | null {
  try {
    return calculateRentalValue(shots, cfg).totalValue;
  } catch {
    return null;
  }
}

export default function Precos({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const supabase = createClient();
  const inicial = useMemo(() => campos(settings), [settings]);
  const [c, setC] = useState<Campos>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = (Object.keys(c) as (keyof Campos)[]).some((k) => numero(c[k]) !== numero(inicial[k]));
  const muda = (k: keyof Campos) => (v: string) => {
    setC((x) => ({ ...x, [k]: v }));
    setErro(null);
    setSalvo(false);
  };

  const atual = paraConfig(inicial);
  const novo = paraConfig(c);
  // Quantidades que mostram cada faixa: no limite do pacote, no meio da faixa
  // 2, no limite 2 e logo acima dele (onde a faixa 3 passa a valer no total).
  const exemplos = Array.from(
    new Set(
      [
        novo.flatPackageLimit,
        Math.round((novo.flatPackageLimit + novo.tier2Limit) / 2 / 100) * 100,
        novo.tier2Limit,
        novo.tier2Limit + Math.max(500, Math.round(novo.tier2Limit * 0.2 / 100) * 100),
      ].filter((n) => Number.isFinite(n) && n > 0)
    )
  ).sort((a, b) => a - b);

  async function salvar() {
    const p = {
      flat_package_limit: novo.flatPackageLimit,
      flat_package_value: novo.flatPackageValue,
      tier2_limit: novo.tier2Limit,
      tier2_rate: novo.tier2Rate,
      tier3_rate: novo.tier3Rate,
      reservation_fee: numero(c.reservationFee),
      mentoria_valor_avista: numero(c.mentoriaAvista),
      mentoria_valor_parcelado: numero(c.mentoriaParcelado),
    };
    if (Object.values(p).some((v) => !Number.isFinite(v) || v < 0)) {
      setErro("Confira os valores: só números, sem negativos.");
      return;
    }
    if (p.tier2_limit <= p.flat_package_limit) {
      setErro("O limite da faixa 2 precisa ser maior que o do pacote fixo.");
      return;
    }
    const ok = await confirmar({
      titulo: "Salvar os novos preços?",
      texto: "Valem para toda locação nova a partir de agora. As que já foram lançadas ficam como estão.",
      confirmar: "Salvar preços",
    });
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("settings")
      .update({ ...p, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
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
      <Bloco
        titulo="Locação HIPRO"
        dica="Pacote fixo até o limite 1. Até o limite 2, pacote mais o excedente pela taxa da faixa 2. Acima do limite 2, a taxa da faixa 3 vale sobre o total de disparos."
      >
        <div className="space-y-3">
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-bold text-neutral-700">1 · Pacote fixo</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Até" sufixo="disparos" valor={c.flatPackageLimit} onChange={muda("flatPackageLimit")} />
              <Campo rotulo="Valor" prefixo="R$" decimal valor={c.flatPackageValue} onChange={muda("flatPackageValue")} />
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-bold text-neutral-700">2 · Excedente</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Até" sufixo="disparos" valor={c.tier2Limit} onChange={muda("tier2Limit")} />
              <Campo rotulo="Por disparo" prefixo="R$" decimal valor={c.tier2Rate} onChange={muda("tier2Rate")} />
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-bold text-neutral-700">3 · Acima do limite 2 (sobre o total)</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Por disparo" prefixo="R$" decimal valor={c.tier3Rate} onChange={muda("tier3Rate")} />
            </div>
          </div>
        </div>

        {exemplos.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-neutral-200">
            <p className="bg-neutral-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Simulação {alterado ? "· antes e depois" : ""}
            </p>
            <ul className="divide-y divide-neutral-100">
              {exemplos.map((n) => {
                const antes = valor(n, atual);
                const depois = valor(n, novo);
                const mudou = antes !== null && depois !== null && Math.abs(antes - depois) > 0.004;
                return (
                  <li key={n} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="whitespace-nowrap tabular-nums text-neutral-600">{n.toLocaleString("pt-BR")} disparos</span>
                    <span className="flex items-center gap-1.5 tabular-nums">
                      {mudou && (
                        <>
                          <span className="text-xs text-neutral-400 line-through">{formatCurrency(antes!)}</span>
                          <ArrowRight size={12} className="text-neutral-400" />
                        </>
                      )}
                      <span className={`font-bold ${mudou ? "text-brand-teal-dark" : "text-neutral-900"}`}>
                        {depois === null ? "-" : formatCurrency(depois)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Bloco>

      <Bloco titulo="Taxa de reserva" dica="Cobrada para segurar a data. Parceiro não paga.">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Valor" prefixo="R$" decimal valor={c.reservationFee} onChange={muda("reservationFee")} />
        </div>
      </Bloco>

      <Bloco titulo="Mentoria" dica="Por paciente modelo. Crédito usa o valor parcelado; qualquer outra forma usa o à vista.">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="À vista" prefixo="R$" decimal valor={c.mentoriaAvista} onChange={muda("mentoriaAvista")} />
          <Campo rotulo="Parcelado no crédito" prefixo="R$" decimal valor={c.mentoriaParcelado} onChange={muda("mentoriaParcelado")} />
        </div>
      </Bloco>

      <BarraSalvar
        alterado={alterado}
        salvando={salvando}
        salvo={salvo}
        erro={erro}
        onSalvar={salvar}
        onDescartar={() => setC(inicial)}
        rotulo="Salvar preços"
      />
    </div>
  );
}
