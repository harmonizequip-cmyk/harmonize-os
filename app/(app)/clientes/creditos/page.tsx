import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LinkCliente } from "@/components/Atalhos";
import { formatCurrency } from "@/lib/format";
import { resumoCredito, temCredito } from "@/lib/creditos";

// Créditos em aberto: clientes com saldo de disparos (disponível ou
// aguardando o pagamento da locação de origem) ou de R$ (view creditos_saldo).

export default async function CreditosEmAbertoPage() {
  const supabase = createClient();
  const { data: saldos } = await supabase
    .from("creditos_saldo")
    .select("client_id, disparos_disponiveis, disparos_aguardando, valor_disponivel, atualizado_em")
    .or("disparos_disponiveis.gt.0,disparos_aguardando.gt.0,valor_disponivel.gt.0");

  const linhas = (saldos ?? [])
    .map((s: any) => ({
      client_id: s.client_id as string,
      disparos_disponiveis: Number(s.disparos_disponiveis ?? 0),
      disparos_aguardando: Number(s.disparos_aguardando ?? 0),
      valor_disponivel: Number(s.valor_disponivel ?? 0),
      atualizado_em: s.atualizado_em as string | null,
    }))
    .filter((s) => temCredito(s));

  const ids = linhas.map((l) => l.client_id);
  const { data: clientes } = ids.length
    ? await supabase.from("clients").select("id, name, display_name, treatment").in("id", ids)
    : { data: [] as any[] };
  const nomePorId = new Map(
    (clientes ?? []).map((c: any) => [
      c.id as string,
      c.display_name ? `${c.treatment ? `${c.treatment} ` : ""}${c.display_name}` : (c.name as string),
    ])
  );

  const lista = linhas
    .map((l) => ({ ...l, nome: nomePorId.get(l.client_id) ?? "Cliente" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalDisparos = lista.reduce((s, l) => s + l.disparos_disponiveis, 0);
  const totalAguardando = lista.reduce((s, l) => s + l.disparos_aguardando, 0);
  const totalValor = lista.reduce((s, l) => s + l.valor_disponivel, 0);

  const dataCurta = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Recife" }) : "";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/clientes" className="text-xs text-neutral-500">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Créditos em aberto</h1>
        <p className="text-sm text-neutral-500">Disparos e valores que as clientes ainda podem usar.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Disparos</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-900 sm:text-base">{totalDisparos.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Aguardando</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-900 sm:text-base">{totalAguardando.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Em R$</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-900 sm:text-base">{formatCurrency(totalValor)}</p>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Nenhuma cliente com crédito em aberto agora. Quando houver troca de ponteira, permuta ou crédito lançado à mão, ela aparece aqui.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
          {lista.map((l) => (
            <li key={l.client_id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <LinkCliente id={l.client_id} className="text-sm font-medium text-neutral-900">
                  {l.nome}
                </LinkCliente>
                <p className="mt-0.5 text-xs text-neutral-600">{resumoCredito(l)}</p>
              </div>
              <span className="flex-shrink-0 text-right text-[11px] text-neutral-400">
                Última mov.
                <br />
                {dataCurta(l.atualizado_em)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
