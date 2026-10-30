import { CircleCheck, Clock3 } from "lucide-react";
import type { Situacao } from "@/lib/pacientes";

/** Selo de situação: laranja = ainda tem disparos para usar; verde = usou tudo. */
export default function SeloSituacao({ situacao, detalhe }: { situacao: Situacao; detalhe?: string }) {
  return situacao === "pendente" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
      <Clock3 size={12} /> Pendente{detalhe ? ` · ${detalhe}` : ""}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
      <CircleCheck size={12} /> Concluído
    </span>
  );
}

