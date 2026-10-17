import Link from "next/link";
import { ROTULO_CLASSE, ROTULO_VALOR, type PessoaClassificada } from "@/lib/relacionamento";

/**
 * Faixa da ficha do cliente com a classificação automática (Relacionamento):
 * classe, valor (VIP/Frequente), última conversa e, quando está na hora,
 * o motivo e o atalho para a tela Relacionamento.
 */
export default function RelacaoFicha({ p }: { p: PessoaClassificada }) {
  const c = ROTULO_CLASSE[p.classe];
  const v = ROTULO_VALOR[p.valor];
  return (
    <Link
      href={`/relacionamento?aba=${p.ehCliente || p.locacoes.length ? "clientes" : "leads"}`}
      className={`mt-2 block rounded-2xl px-3 py-2 ring-1 ${p.devida ? "bg-amber-50 ring-amber-200" : "bg-white ring-neutral-200"}`}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${c.cor}`}>
          {c.emoji} {c.rotulo}
        </span>
        {v && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${v.cor}`}>
            {v.emoji} {v.rotulo}
          </span>
        )}
        <span className="text-[11.5px] text-neutral-500">
          Última conversa {p.ultimoContato ? (p.diasSemContato === 0 ? "hoje" : `há ${p.diasSemContato} dias`) : "não registrada"}
        </span>
      </span>
      {p.devida && p.motivo && <span className="mt-1 block text-[12px] font-medium text-amber-800">💬 Hora de conversar: {p.motivo} →</span>}
    </Link>
  );
}
