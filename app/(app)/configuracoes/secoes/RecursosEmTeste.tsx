"use client";

// Recursos em teste (23/11/2026, pedido do dono): o que é novo para as clientes
// do portal fica escondido até o dono testar pela prévia e tocar em
// "Testei, liberar para as clientes". "Voltar para teste" esconde de novo na hora.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, FlaskConical, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import type { Preferencias } from "@/lib/preferencias";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { alternarLiberado, estaLiberado, RECURSOS } from "@/lib/recursos";
import { confirmar } from "@/components/Dialogos";
import { Pilula } from "@/components/ui/Visual";

export default function RecursosEmTeste({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const [liberados, setLiberados] = useState<string[]>(preferencias.recursos.liberados);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Sem a função recursos_liberados no banco, o portal não enxerga a liberação.
  const [faltaSql, setFaltaSql] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("recursos_liberados")
      .then(({ error }) => setFaltaSql(!!error));
  }, []);

  async function mudar(id: string, nome: string, liberar: boolean) {
    const ok = await confirmar(
      liberar
        ? {
            titulo: `Liberar "${nome}"?`,
            texto: "As clientes passam a ver este recurso assim que abrirem o portal. Dá para voltar para teste depois, se precisar.",
            confirmar: "Liberar",
          }
        : {
            titulo: `Voltar "${nome}" para teste?`,
            texto: "As clientes deixam de ver este recurso na próxima vez que abrirem o portal. Você continua vendo pela prévia.",
            confirmar: "Voltar para teste",
            perigo: true,
          }
    );
    if (!ok) return;
    setSalvando(id);
    setErro(null);
    const novos = alternarLiberado(liberados, id, liberar);
    const r = await salvarPreferencias(createClient(), { recursos: { liberados: novos } });
    setSalvando(null);
    if (r.erro) return setErro(r.erro);
    setLiberados(r.preferencias.recursos.liberados);
    esquecerPreferenciasDoNavegador();
    router.refresh();
  }

  return (
    <div className="space-y-3 pb-28">
      <p className="text-sm leading-relaxed text-neutral-600">
        Todo recurso novo para as clientes do portal começa aqui, em teste: só você vê, pela prévia. Ele só aparece para elas depois que você
        toca em &quot;Testei, liberar para as clientes&quot;.
      </p>
      {faltaSql && (
        <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          Falta rodar o SQL dos recursos em teste. Enquanto isso, nada novo aparece para as clientes, mesmo liberado aqui.
        </p>
      )}
      {erro && <p className="rounded-2xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{erro}</p>}
      {RECURSOS.map((r) => {
        const liberado = estaLiberado(liberados, r.id);
        return (
          <section key={r.id} className="cartao space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-base font-bold text-neutral-900">{r.nome}</p>
              {liberado ? (
                <Pilula cor="verde" icone={CheckCircle2}>
                  Liberado
                </Pilula>
              ) : (
                <Pilula cor="ambar" icone={FlaskConical}>
                  Em teste
                </Pilula>
              )}
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">{r.descricao}</p>
            <p className="text-xs text-neutral-500">Desde {r.desde}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {r.previa && (
                <Link href={r.previa} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-brand-teal-dark ring-1 ring-brand-teal/40">
                  <Eye size={16} /> Ver como a cliente vê
                </Link>
              )}
              {liberado ? (
                <button
                  type="button"
                  disabled={salvando === r.id}
                  onClick={() => mudar(r.id, r.nome, false)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-neutral-700 ring-1 ring-neutral-200 disabled:opacity-60"
                >
                  <Undo2 size={16} /> {salvando === r.id ? "Salvando..." : "Voltar para teste"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={salvando === r.id}
                  onClick={() => mudar(r.id, r.nome, true)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-teal text-sm font-bold text-white disabled:opacity-60"
                >
                  <CheckCircle2 size={16} /> {salvando === r.id ? "Salvando..." : "Testei, liberar para as clientes"}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
