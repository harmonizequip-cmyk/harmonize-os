"use client";

// Editor da campanha: nome, arte (reduzida no aparelho e guardada na pasta
// privada "campanhas"), mensagem com {saudacao}, {nome} e {cidade}, público
// (filtros com contagem ao vivo e caixinha para tirar alguém) e limite diário.
// Mensagem com variável errada bloqueia o salvar (o texto é do dono, não há
// padrão para voltar). Regras em lib/campanhas.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Plus, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { LinkCliente } from "@/components/Atalhos";
import { ROTULO_CLASSE, type Classe, type PessoaClassificada } from "@/lib/relacionamento";
import {
  EXEMPLO_BLACK_FRIDAY,
  LIMITE_DIARIO_MAX,
  LIMITE_DIARIO_MIN,
  TAMANHO_MAXIMO_MENSAGEM_CAMPANHA,
  VARIAVEIS_CAMPANHA,
  alternarExcluido,
  candidatosDaCampanha,
  classesDoTipo,
  filaDaCampanha,
  lerFiltros,
  limiteValido,
  limparExcluidos,
  previaDaMensagem,
  problemasDaMensagem,
  type FiltrosCampanha,
  type TipoPublico,
  type VariavelCampanha,
} from "@/lib/campanhas";
import { apagarArte, enviarArte, reduzirArte } from "@/lib/campanha-arte";
import type { CampanhaRow } from "@/lib/carregar-campanhas";
import { SeloClasse, nomeDaPessoa } from "./comum";

const POR_PAGINA = 60;

function Bloco({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <section className="cartao p-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-600">{titulo}</p>
      {dica && <p className="mt-0.5 text-[12px] leading-snug text-neutral-500">{dica}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chave({ ligada, onChange, rotulo, dica }: { ligada: boolean; onChange: (v: boolean) => void; rotulo: string; dica?: string }) {
  return (
    <button type="button" onClick={() => onChange(!ligada)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-800">{rotulo}</span>
        {dica && <span className="block text-[11.5px] leading-snug text-neutral-500">{dica}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${ligada ? "bg-brand-teal" : "bg-neutral-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ligada ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export default function EditorCampanha({
  campanha,
  arteUrl,
  pessoas,
  jaNaCampanha,
  naoQuer,
}: {
  campanha: CampanhaRow | null;
  arteUrl: string | null;
  pessoas: PessoaClassificada[];
  jaNaCampanha: string[];
  naoQuer: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const campoMensagem = useRef<HTMLTextAreaElement | null>(null);
  const entradaArte = useRef<HTMLInputElement | null>(null);

  const [nome, setNome] = useState(campanha?.nome ?? "");
  const [mensagem, setMensagem] = useState(campanha?.mensagem ?? "");
  const [filtros, setFiltros] = useState<FiltrosCampanha>(() => lerFiltros(campanha?.filtros));
  const [limite, setLimite] = useState<string>(String(campanha?.limite_diario ?? 15));
  const [novaArte, setNovaArte] = useState<{ blob: Blob; nome: string; previa: string } | null>(null);
  const [removerArte, setRemoverArte] = useState(false);
  const [preparandoArte, setPreparandoArte] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  // Libera a prévia local quando trocar de arte ou sair da tela.
  useEffect(() => () => {
    if (novaArte) URL.revokeObjectURL(novaArte.previa);
  }, [novaArte]);

  const problemas = problemasDaMensagem(mensagem);
  const opcoesPublico = useMemo(() => ({ jaNaCampanha: new Set(jaNaCampanha), naoQuer: new Set(naoQuer) }), [jaNaCampanha, naoQuer]);
  const candidatos = useMemo(() => candidatosDaCampanha(pessoas, filtros, opcoesPublico), [pessoas, filtros, opcoesPublico]);
  const fila = useMemo(() => filaDaCampanha(candidatos, filtros), [candidatos, filtros]);
  const fora = useMemo(() => new Set(filtros.excluidos), [filtros.excluidos]);
  const limiteNumero = Number(limite);
  const limiteOk = Number.isInteger(limiteNumero) && limiteNumero >= LIMITE_DIARIO_MIN && limiteNumero <= LIMITE_DIARIO_MAX;

  const arteAtual = novaArte?.previa ?? (removerArte ? null : arteUrl);
  const temArte = !!novaArte || (!removerArte && !!campanha?.arte_path);

  function inserir(v: VariavelCampanha) {
    const el = campoMensagem.current;
    const token = `{${v}}`;
    const ini = el?.selectionStart ?? mensagem.length;
    const fim = el?.selectionEnd ?? mensagem.length;
    const novo = (mensagem.slice(0, ini) + token + mensagem.slice(fim)).slice(0, TAMANHO_MAXIMO_MENSAGEM_CAMPANHA);
    setMensagem(novo);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = Math.min(ini + token.length, novo.length);
      el.setSelectionRange(pos, pos);
    });
  }

  async function usarExemplo() {
    if (mensagem.trim() && mensagem.trim() !== EXEMPLO_BLACK_FRIDAY) {
      const ok = await confirmar({
        titulo: "Trocar a mensagem pelo exemplo?",
        texto: "O texto que está escrito agora será substituído. Nada é salvo até você tocar em Salvar.",
        confirmar: "Trocar",
      });
      if (!ok) return;
    }
    setMensagem(EXEMPLO_BLACK_FRIDAY);
  }

  async function escolherArte(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setPreparandoArte(true);
    try {
      const blob = await reduzirArte(arquivo);
      setNovaArte({ blob, nome: arquivo.name || "arte.jpg", previa: URL.createObjectURL(blob) });
      setRemoverArte(false);
    } catch (err) {
      avisar(err instanceof Error ? err.message : "Não consegui abrir a imagem.", "erro");
    } finally {
      setPreparandoArte(false);
    }
  }

  async function tirarArte() {
    const ok = await confirmar({ titulo: "Tirar a arte da campanha?", texto: "A mensagem vai sem imagem. Só vale depois de Salvar.", confirmar: "Tirar", perigo: true });
    if (!ok) return;
    setNovaArte(null);
    setRemoverArte(true);
  }

  function mudarTipo(tipo: TipoPublico) {
    const validas = new Set(classesDoTipo(tipo));
    setFiltros((f) => ({ ...f, tipo, classes: f.classes.filter((c) => validas.has(c)) }));
    setMostrar(POR_PAGINA);
  }

  function alternarClasse(c: Classe) {
    setFiltros((f) => ({ ...f, classes: f.classes.includes(c) ? f.classes.filter((x) => x !== c) : [...f.classes, c] }));
    setMostrar(POR_PAGINA);
  }

  async function salvar() {
    if (!nome.trim()) return avisar("Dê um nome à campanha.", "erro");
    if (problemas.length) return avisar("Corrija a mensagem antes de salvar.", "erro");
    if (!limiteOk) return avisar(`O limite diário vai de ${LIMITE_DIARIO_MIN} a ${LIMITE_DIARIO_MAX}.`, "erro");
    setSalvando(true);
    let caminhoNovo: string | null = null;
    try {
      let caminho = removerArte ? null : campanha?.arte_path ?? null;
      let nomeArte = removerArte ? null : campanha?.arte_nome ?? null;
      if (novaArte) {
        caminhoNovo = await enviarArte(supabase, novaArte.blob);
        caminho = caminhoNovo;
        nomeArte = novaArte.nome.slice(0, 200);
      }
      const { data, error } = await supabase.rpc("salvar_campanha", {
        p_id: campanha?.id ?? null,
        p_nome: nome.trim(),
        p_mensagem: mensagem.replace(/\r\n?/g, "\n").trim(),
        p_arte_path: caminho,
        p_arte_nome: nomeArte,
        p_filtros: limparExcluidos(filtros, candidatos),
        p_limite_diario: limiteValido(limiteNumero),
      });
      if (error) {
        if (caminhoNovo) await apagarArte(supabase, caminhoNovo);
        avisar(error.message || "Não consegui salvar.", "erro");
        return;
      }
      // A arte antiga deixou de ser usada: apaga do Storage.
      if (campanha?.arte_path && campanha.arte_path !== caminho) await apagarArte(supabase, campanha.arte_path);
      avisar("Campanha salva.");
      if (!campanha) {
        router.push(`/campanhas/${data as string}`);
      } else {
        setNovaArte(null);
        setRemoverArte(false);
        router.refresh();
      }
    } catch (err) {
      if (caminhoNovo) await apagarArte(supabase, caminhoNovo);
      avisar(err instanceof Error ? err.message : "Não consegui salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  const classesOferecidas = classesDoTipo(filtros.tipo);

  return (
    <div className="space-y-3">
      <Bloco titulo="Nome">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value.slice(0, 80))}
          placeholder="Ex.: Black Friday 2026"
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900"
        />
      </Bloco>

      <Bloco titulo="Arte" dica="A mesma imagem vai para todo mundo. Ela é reduzida no celular antes de subir.">
        <input ref={entradaArte} type="file" accept="image/*" onChange={escolherArte} className="hidden" />
        {arteAtual ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={arteAtual} alt="Arte da campanha" className="max-h-80 w-full rounded-2xl border border-neutral-200 bg-neutral-50 object-contain" />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => entradaArte.current?.click()}
                disabled={preparandoArte}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
              >
                <RefreshCw size={15} /> Trocar
              </button>
              <button
                type="button"
                onClick={tirarArte}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-medium text-rose-700"
              >
                <Trash2 size={15} /> Remover
              </button>
            </div>
          </div>
        ) : temArte ? (
          <p className="text-sm text-neutral-500">Carregando a arte...</p>
        ) : (
          <button
            type="button"
            onClick={() => entradaArte.current?.click()}
            disabled={preparandoArte}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 py-8 text-sm font-medium text-neutral-600 disabled:opacity-50"
          >
            <ImagePlus size={26} className="text-neutral-400" />
            {preparandoArte ? "Preparando a imagem..." : "Escolher da galeria ou tirar foto"}
          </button>
        )}
      </Bloco>

      <Bloco titulo="Mensagem" dica="Toque numa variável para colocá-la onde está o cursor. Cada pessoa recebe com o próprio nome.">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(Object.keys(VARIAVEIS_CAMPANHA) as VariavelCampanha[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => inserir(v)}
              title={VARIAVEIS_CAMPANHA[v].dica}
              className="inline-flex items-center gap-1 rounded-full border border-brand-teal/30 bg-brand-teal/5 px-2.5 py-1 text-[12px] font-medium text-brand-teal-dark"
            >
              <Plus size={12} /> {VARIAVEIS_CAMPANHA[v].rotulo}
            </button>
          ))}
        </div>
        <textarea
          ref={campoMensagem}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value.slice(0, TAMANHO_MAXIMO_MENSAGEM_CAMPANHA + 50))}
          rows={6}
          placeholder="{saudacao} ..."
          className={`w-full resize-y rounded-xl border bg-white px-3 py-2.5 text-[14px] text-neutral-900 ${
            problemas.length && mensagem.trim() ? "border-rose-300" : "border-neutral-200"
          }`}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <button type="button" onClick={usarExemplo} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-teal-dark">
            <Sparkles size={13} /> Usar exemplo de Black Friday
          </button>
          <span className="text-[11px] text-neutral-400">
            {mensagem.length}/{TAMANHO_MAXIMO_MENSAGEM_CAMPANHA}
          </span>
        </div>
        {problemas.length > 0 && mensagem.trim() && (
          <div className="mt-2 space-y-1 rounded-xl bg-rose-50 p-2.5">
            {problemas.map((p) => (
              <p key={p} className="flex items-start gap-1.5 text-[12px] text-rose-700">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {p}
              </p>
            ))}
          </div>
        )}
        {problemas.length === 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400">Prévia</p>
            <p className="whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-[13px] text-neutral-700">{previaDaMensagem(mensagem)}</p>
          </div>
        )}
      </Bloco>

      <Bloco
        titulo="Público"
        dica="Sempre ficam de fora: quem não tem WhatsApp, desqualificados, quem já está nesta campanha e quem pediu para não receber campanhas."
      >
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
          {(
            [
              ["clientes", "Clientes"],
              ["leads", "Leads"],
              ["ambos", "Ambos"],
            ] as [TipoPublico, string][]
          ).map(([t, r]) => (
            <button
              key={t}
              type="button"
              onClick={() => mudarTipo(t)}
              className={`rounded-xl py-2 text-xs font-bold transition ${filtros.tipo === t ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-[11.5px] text-neutral-500">Classes (nenhuma marcada = todas)</p>
        <div className="flex flex-wrap gap-1.5">
          {classesOferecidas.map((c) => {
            const marcada = filtros.classes.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => alternarClasse(c)}
                aria-pressed={marcada}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition ${
                  marcada ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-600 ring-neutral-200"
                }`}
              >
                {ROTULO_CLASSE[c].rotulo}
              </button>
            );
          })}
        </div>
        <div className="mt-2 divide-y divide-neutral-100">
          <Chave
            ligada={filtros.soHoraDeChamar}
            onChange={(v) => setFiltros((f) => ({ ...f, soHoraDeChamar: v }))}
            rotulo="Só quem está na hora de chamar"
            dica="Pela cadência do Relacionamento"
          />
          <Chave
            ligada={filtros.excluirComReserva}
            onChange={(v) => setFiltros((f) => ({ ...f, excluirComReserva: v }))}
            rotulo="Tirar quem já tem reserva marcada"
            dica="Atendimento de hoje em diante"
          />
          <Chave
            ligada={filtros.soNuncaAlugou}
            onChange={(v) => setFiltros((f) => ({ ...f, soNuncaAlugou: v }))}
            rotulo="Só quem nunca alugou"
            dica="Para campanhas de primeira locação"
          />
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-teal-50 px-3 py-2.5 text-teal-800">
          <Users size={18} className="flex-shrink-0" />
          <p className="text-sm">
            <b>{fila.length}</b> {fila.length === 1 ? "pessoa vai" : "pessoas vão"} para a fila
            {fora.size > 0 && candidatos.length > fila.length && <span className="text-teal-700"> ({candidatos.length - fila.length} tirada(s) à mão)</span>}
          </p>
        </div>

        {candidatos.length > 0 && (
          <div className="mt-2 max-h-[28rem] overflow-y-auto rounded-2xl border border-neutral-100">
            {candidatos.slice(0, mostrar).map((p) => {
              const marcada = !fora.has(p.id);
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-b-0">
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => setFiltros((f) => alternarExcluido(f, p.id))}
                    className="h-5 w-5 flex-shrink-0 accent-[#1F9E97]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${marcada ? "text-neutral-900" : "text-neutral-400 line-through"}`}>
                      <LinkCliente id={p.id}>{nomeDaPessoa(p)}</LinkCliente>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <SeloClasse classe={p.classe} />
                      {p.cidade && <span className="truncate">{p.cidade}</span>}
                    </span>
                  </span>
                </label>
              );
            })}
            {candidatos.length > mostrar && (
              <button
                type="button"
                onClick={() => setMostrar((n) => n + POR_PAGINA)}
                className="w-full py-2.5 text-center text-[12px] font-semibold text-brand-teal-dark"
              >
                Mostrar mais ({candidatos.length - mostrar})
              </button>
            )}
          </div>
        )}
      </Bloco>

      <Bloco
        titulo="Limite por dia"
        dica="Quantas mensagens desta campanha por dia. Muitas mensagens iguais no mesmo dia fazem o WhatsApp desconfiar de spam."
      >
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={LIMITE_DIARIO_MIN}
            max={LIMITE_DIARIO_MAX}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            className={`w-24 rounded-xl border bg-white px-3 py-2.5 text-center text-sm font-semibold ${limiteOk ? "border-neutral-200" : "border-rose-300"}`}
          />
          <span className="text-sm text-neutral-600">envios por dia (de {LIMITE_DIARIO_MIN} a {LIMITE_DIARIO_MAX})</span>
        </div>
      </Bloco>

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || preparandoArte || problemas.length > 0 || !nome.trim() || !limiteOk}
        className="w-full rounded-2xl bg-brand-teal py-3.5 text-sm font-bold text-white shadow-glow-teal disabled:opacity-50"
      >
        {salvando ? "Salvando..." : campanha ? "Salvar alterações" : "Salvar campanha"}
      </button>
    </div>
  );
}
