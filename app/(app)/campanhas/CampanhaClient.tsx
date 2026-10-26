"use client";

// Página da campanha: Enviar (fila um a um), Resultado e Editar (arte,
// mensagem, público e limite). Quem é só de visualização vê o resultado e a
// campanha, sem enviar, editar, arquivar nem apagar.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronLeft, ImageIcon, Megaphone, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { IconeChip, Pilula } from "@/components/ui/Visual";
import { candidatosDaCampanha, enviadosNoDia, filaDaCampanha, lerFiltros, previaDaMensagem } from "@/lib/campanhas";
import { apagarArte } from "@/lib/campanha-arte";
import type { CampanhaRow, EnvioComCliente } from "@/lib/carregar-campanhas";
import type { Conversao } from "@/lib/campanhas";
import type { PessoaClassificada } from "@/lib/relacionamento";
import EditorCampanha from "./EditorCampanha";
import FilaCampanha from "./FilaCampanha";
import ResultadoCampanha from "./ResultadoCampanha";

type Aba = "enviar" | "resultado" | "editar";

export default function CampanhaClient({
  campanha,
  arteUrl,
  envios,
  naoQuer,
  conversoes,
  erroConversoes,
  pessoas,
  hoje,
  abaInicial,
}: {
  campanha: CampanhaRow;
  arteUrl: string | null;
  envios: EnvioComCliente[];
  naoQuer: string[];
  conversoes: Conversao[];
  erroConversoes: string | null;
  pessoas: PessoaClassificada[];
  hoje: string;
  abaInicial: string | undefined;
}) {
  const router = useRouter();
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const podeEnviar = !somenteLeitura && !campanha.arquivada;
  const abas: [Aba, string][] = somenteLeitura
    ? [["resultado", "Resultado"]]
    : [
        ["enviar", "Enviar"],
        ["resultado", "Resultado"],
        ["editar", "Editar"],
      ];
  const [aba, setAba] = useState<Aba>(() => {
    const pedida = abas.find(([a]) => a === abaInicial)?.[0];
    if (pedida) return pedida;
    return podeEnviar ? "enviar" : "resultado";
  });
  const [ocupado, setOcupado] = useState(false);

  const filtros = useMemo(() => lerFiltros(campanha.filtros), [campanha.filtros]);
  const jaNaCampanha = useMemo(() => envios.map((e) => e.client_id), [envios]);
  const fila = useMemo(
    () => filaDaCampanha(candidatosDaCampanha(pessoas, filtros, { jaNaCampanha: new Set(jaNaCampanha), naoQuer: new Set(naoQuer) }), filtros),
    [pessoas, filtros, jaNaCampanha, naoQuer]
  );
  const enviadosHoje = useMemo(() => enviadosNoDia(envios, hoje), [envios, hoje]);
  // A fila é uma fotografia: só remonta quando a pessoa volta para a aba (chave).
  const [chaveFila, setChaveFila] = useState(0);

  function trocarAba(a: Aba) {
    setAba(a);
    if (a === "enviar") setChaveFila((n) => n + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", a);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  async function arquivar() {
    const ok = await confirmar(
      campanha.arquivada
        ? { titulo: "Desarquivar a campanha?", texto: "Ela volta para a lista de ativas e a fila de envio volta a funcionar.", confirmar: "Desarquivar" }
        : { titulo: "Arquivar a campanha?", texto: "Ela sai da lista de ativas e para de enviar. O resultado fica guardado e dá para desarquivar.", confirmar: "Arquivar" }
    );
    if (!ok) return;
    setOcupado(true);
    const { error } = await supabase.rpc("arquivar_campanha", { p_id: campanha.id });
    setOcupado(false);
    if (error) return avisar(error.message || "Não consegui arquivar.", "erro");
    avisar(campanha.arquivada ? "Campanha desarquivada." : "Campanha arquivada.");
    router.refresh();
  }

  async function apagar() {
    const ok = await confirmar({
      titulo: "Apagar a campanha?",
      texto: "A campanha e a arte são apagadas. Isso não tem volta.",
      confirmar: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("excluir_campanha", { p_id: campanha.id });
    setOcupado(false);
    if (error) return avisar(error.message || "Não consegui apagar.", "erro");
    await apagarArte(supabase, (data as string | null) ?? campanha.arte_path);
    avisar("Campanha apagada.");
    router.push("/campanhas");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link href={campanha.arquivada ? "/campanhas?aba=arquivadas" : "/campanhas"} className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500">
        <ChevronLeft size={16} /> Campanhas
      </Link>

      <section className="cartao p-4">
        <div className="flex items-start gap-3">
          <IconeChip icone={campanha.arte_path ? ImageIcon : Megaphone} cor={campanha.arquivada ? "cinza" : "rosa"} />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-neutral-900">{campanha.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {campanha.arquivada && <Pilula cor="cinza" icone={Archive}>Arquivada</Pilula>}
              <span className="text-[12px] text-neutral-500">Até {campanha.limite_diario} por dia</span>
            </div>
          </div>
        </div>
        {aba !== "editar" && (
          <p className="mt-3 line-clamp-3 whitespace-pre-line rounded-xl bg-neutral-50 p-2.5 text-[12.5px] text-neutral-600">
            {previaDaMensagem(campanha.mensagem)}
          </p>
        )}
        {!somenteLeitura && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={arquivar}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-neutral-700 disabled:opacity-50"
            >
              {campanha.arquivada ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              {campanha.arquivada ? "Desarquivar" : "Arquivar"}
            </button>
            {envios.length === 0 && (
              <button
                type="button"
                onClick={apagar}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700 disabled:opacity-50"
              >
                <Trash2 size={14} /> Apagar
              </button>
            )}
          </div>
        )}
      </section>

      {abas.length > 1 && (
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
          {abas.map(([a, r]) => (
            <button
              key={a}
              type="button"
              onClick={() => trocarAba(a)}
              className={`rounded-xl py-2 text-xs font-bold transition ${aba === a ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
            >
              {r}
              {a === "enviar" && fila.length > 0 ? ` · ${fila.length}` : ""}
            </button>
          ))}
        </div>
      )}

      {aba === "enviar" &&
        (campanha.arquivada ? (
          <section className="cartao p-5 text-center text-sm text-neutral-500">
            Campanha arquivada: desarquive para continuar enviando.
          </section>
        ) : (
          <FilaCampanha
            key={chaveFila}
            campanhaId={campanha.id}
            mensagemBase={campanha.mensagem}
            limiteDiario={campanha.limite_diario}
            arteUrl={arteUrl}
            arteNome={campanha.arte_nome}
            fila={fila}
            enviadosHojeInicial={enviadosHoje}
            onMudou={() => router.refresh()}
          />
        ))}

      {aba === "resultado" && <ResultadoCampanha campanhaId={campanha.id} envios={envios} conversoes={conversoes} erroConversoes={erroConversoes} hoje={hoje} onMudou={() => router.refresh()} />}

      {aba === "editar" && !somenteLeitura && (
        <EditorCampanha campanha={campanha} arteUrl={arteUrl} pessoas={pessoas} jaNaCampanha={jaNaCampanha} naoQuer={naoQuer} />
      )}
    </div>
  );
}
